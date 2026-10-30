import AVFoundation
import MediaPlayer
import Observation
import SwiftUI
import UIKit

/// Motor de reprodução: AVAudioEngine com equalizador de 10 bandas e controle de velocidade,
/// fila, aleatório/repetir, timer de sono, tela bloqueada e Central de Controle.
@Observable
@MainActor
final class PlayerController {
    // MARK: - Estado público

    private(set) var queue: [Track] = []
    private(set) var currentIndex = 0
    private(set) var isPlaying = false
    private(set) var currentTime: Double = 0
    private(set) var duration: Double = 0
    private(set) var shuffleEnabled = false
    private(set) var sleepTimerEnd: Date?
    private(set) var sleepAtEndOfTrack = false
    var showFullPlayer = false
    var onTrackStarted: ((Track) -> Void)?

    var repeatMode: RepeatMode = .off {
        didSet { UserDefaults.standard.set(repeatMode.rawValue, forKey: "repeatMode") }
    }

    var playbackRate: Float {
        didSet {
            timePitch.rate = playbackRate
            UserDefaults.standard.set(Double(playbackRate), forKey: "playbackRate")
            updateNowPlaying()
        }
    }

    var eqEnabled: Bool {
        didSet {
            applyEQ()
            UserDefaults.standard.set(eqEnabled, forKey: "eqEnabled")
        }
    }

    var eqGains: [Float] {
        didSet {
            applyEQ()
            UserDefaults.standard.set(eqGains.map(Double.init), forKey: "eqGains")
        }
    }

    static let eqFrequencies: [Float] = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]

    var currentTrack: Track? { queue.indices.contains(currentIndex) ? queue[currentIndex] : nil }

    var upNext: ArraySlice<Track> {
        queue.indices.contains(currentIndex) ? queue[(currentIndex + 1)...] : []
    }

    // MARK: - Internos

    private let engine = AVAudioEngine()
    private let node = AVAudioPlayerNode()
    private let timePitch = AVAudioUnitTimePitch()
    private let eq = AVAudioUnitEQ(numberOfBands: 10)

    @ObservationIgnored private var file: AVAudioFile?
    @ObservationIgnored private var connectedFormat: AVAudioFormat?
    @ObservationIgnored private var sampleRate: Double = 44_100
    @ObservationIgnored private var seekFrame: AVAudioFramePosition = 0
    @ObservationIgnored private var scheduleToken = 0
    @ObservationIgnored private var progressTimer: Timer?
    @ObservationIgnored private var originalQueue: [Track] = []
    @ObservationIgnored private var consecutiveFailures = 0
    @ObservationIgnored private var resumeAfterInterruption = false
    @ObservationIgnored private var nowPlayingArtwork: (id: UUID, artwork: MPMediaItemArtwork?)?
    @ObservationIgnored private var observers: [NSObjectProtocol] = []

    init() {
        let defaults = UserDefaults.standard
        eqEnabled = defaults.object(forKey: "eqEnabled") as? Bool ?? false
        let savedGains = (defaults.array(forKey: "eqGains") as? [Double])?.map(Float.init)
        eqGains = savedGains?.count == 10 ? savedGains! : Array(repeating: 0, count: 10)
        playbackRate = Float(defaults.object(forKey: "playbackRate") as? Double ?? 1)
        repeatMode = RepeatMode(rawValue: defaults.integer(forKey: "repeatMode")) ?? .off

        configureEngine()
        configureSession()
        configureRemoteCommands()
        observeSystemNotifications()
    }

    // MARK: - Configuração

    private func configureEngine() {
        for (i, band) in eq.bands.enumerated() {
            band.filterType = i == 0 ? .lowShelf : (i == eq.bands.count - 1 ? .highShelf : .parametric)
            band.frequency = Self.eqFrequencies[i]
            band.bandwidth = 1.0
            band.bypass = false
        }
        applyEQ()
        timePitch.rate = playbackRate

        engine.attach(node)
        engine.attach(timePitch)
        engine.attach(eq)
        engine.connect(timePitch, to: eq, format: nil)
        engine.connect(eq, to: engine.mainMixerNode, format: nil)
        engine.connect(node, to: timePitch, format: nil)
        engine.prepare()
    }

    private func applyEQ() {
        for (i, band) in eq.bands.enumerated() where i < eqGains.count {
            band.gain = eqGains[i]
        }
        eq.bypass = !eqEnabled
        // Pré-amplificação negativa para evitar distorção quando há reforço.
        eq.globalGain = eqEnabled ? -max(0, eqGains.max() ?? 0) * 0.5 : 0
    }

    private func configureSession() {
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, policy: .longFormAudio, options: [])
    }

    private func reconnectIfNeeded(for format: AVAudioFormat) {
        if let connectedFormat, connectedFormat == format { return }
        let wasRunning = engine.isRunning
        if wasRunning { engine.stop() }
        // Toda a cadeia no formato do arquivo; a conversão para o hardware fica com o mixer.
        engine.disconnectNodeOutput(node)
        engine.disconnectNodeOutput(timePitch)
        engine.disconnectNodeOutput(eq)
        engine.connect(node, to: timePitch, format: format)
        engine.connect(timePitch, to: eq, format: format)
        engine.connect(eq, to: engine.mainMixerNode, format: format)
        connectedFormat = format
        if wasRunning { try? engine.start() }
    }

    // MARK: - Fila

    func play(_ tracks: [Track], startAt index: Int = 0, shuffled: Bool = false) {
        guard !tracks.isEmpty else { return }
        originalQueue = tracks
        if shuffled { shuffleEnabled = true }
        if shuffleEnabled {
            var rest = tracks
            let first = rest.remove(at: shuffled ? Int.random(in: tracks.indices) : min(index, tracks.count - 1))
            queue = [first] + rest.shuffled()
            currentIndex = 0
        } else {
            queue = tracks
            currentIndex = min(max(index, 0), tracks.count - 1)
        }
        consecutiveFailures = 0
        loadCurrent(autoplay: true)
        showFullPlayer = false
    }

    func playNext(_ track: Track) {
        guard currentTrack != nil else { return play([track]) }
        queue.insert(track, at: currentIndex + 1)
        originalQueue.append(track)
    }

    func addToQueue(_ track: Track) {
        guard currentTrack != nil else { return play([track]) }
        queue.append(track)
        originalQueue.append(track)
    }

    func jump(toQueueIndex index: Int) {
        guard queue.indices.contains(index) else { return }
        currentIndex = index
        loadCurrent(autoplay: true)
    }

    func removeUpNext(at offsets: IndexSet) {
        let base = currentIndex + 1
        let removed = offsets.map { queue[base + $0].id }
        queue.remove(atOffsets: IndexSet(offsets.map { $0 + base }))
        originalQueue.removeAll { removed.contains($0.id) }
    }

    func moveUpNext(from source: IndexSet, to destination: Int) {
        let base = currentIndex + 1
        var upcoming = Array(queue[base...])
        upcoming.move(fromOffsets: source, toOffset: destination)
        queue.replaceSubrange(base..., with: upcoming)
    }

    func toggleShuffle() {
        shuffleEnabled.toggle()
        guard let current = currentTrack else { return }
        if shuffleEnabled {
            var rest = queue
            rest.remove(at: currentIndex)
            queue = [current] + rest.shuffled()
            currentIndex = 0
        } else if !originalQueue.isEmpty {
            queue = originalQueue
            currentIndex = originalQueue.firstIndex { $0.id == current.id } ?? 0
        }
    }

    /// Mantém a fila em sincronia quando a biblioteca muda (edição, favorito, exclusão).
    func refresh(from library: LibraryStore) {
        let currentID = currentTrack?.id
        queue = queue.compactMap { library.track(id: $0.id) }
        originalQueue = originalQueue.compactMap { library.track(id: $0.id) }
        if let currentID, let index = queue.firstIndex(where: { $0.id == currentID }) {
            currentIndex = index
            updateNowPlaying()
        } else if currentID != nil {
            if queue.isEmpty {
                stop()
            } else {
                currentIndex = min(currentIndex, queue.count - 1)
                loadCurrent(autoplay: isPlaying)
            }
        }
    }

    // MARK: - Transporte

    private func loadCurrent(autoplay: Bool) {
        guard let track = currentTrack else { return stop() }
        invalidateSchedule()
        do {
            let file = try AVAudioFile(forReading: track.fileURL)
            self.file = file
            reconnectIfNeeded(for: file.processingFormat)
            sampleRate = file.processingFormat.sampleRate
            duration = Double(file.length) / sampleRate
            seekFrame = 0
            currentTime = 0
            consecutiveFailures = 0
            schedule(from: 0)
            if autoplay {
                onTrackStarted?(track)
                resume()
            } else {
                isPlaying = false
                stopProgressTimer()
                if engine.isRunning { engine.pause() }
                updateNowPlaying()
            }
        } catch {
            consecutiveFailures += 1
            if consecutiveFailures < queue.count {
                currentIndex = (currentIndex + 1) % queue.count
                loadCurrent(autoplay: autoplay)
            } else {
                stop()
            }
        }
    }

    private func schedule(from frame: AVAudioFramePosition) {
        guard let file else { return }
        let remaining = file.length - frame
        guard remaining > 0 else { return }
        let token = scheduleToken
        node.scheduleSegment(
            file, startingFrame: frame, frameCount: AVAudioFrameCount(remaining), at: nil,
            completionCallbackType: .dataPlayedBack,
            completionHandler: Self.segmentCompletion(for: self, token: token)
        )
    }

    /// Criado fora do MainActor: o AVAudioEngine chama este callback na thread de áudio.
    nonisolated private static func segmentCompletion(
        for player: PlayerController, token: Int
    ) -> AVAudioPlayerNodeCompletionHandler {
        { [weak player] _ in
            Task { @MainActor in player?.segmentDidFinish(token: token) }
        }
    }

    /// Para o nó e descarta callbacks de agendamentos antigos.
    private func invalidateSchedule() {
        scheduleToken &+= 1
        node.stop()
    }

    private func segmentDidFinish(token: Int) {
        guard token == scheduleToken, isPlaying else { return }
        trackDidEnd()
    }

    private func trackDidEnd() {
        if sleepAtEndOfTrack {
            sleepAtEndOfTrack = false
            advance(autoplay: false)
            return
        }
        switch repeatMode {
        case .one:
            loadCurrent(autoplay: true)
        case .all:
            advance(autoplay: true)
        case .off:
            if currentIndex + 1 < queue.count {
                advance(autoplay: true)
            } else {
                currentIndex = 0
                loadCurrent(autoplay: false)
            }
        }
    }

    private func advance(autoplay: Bool) {
        guard !queue.isEmpty else { return }
        currentIndex = (currentIndex + 1) % queue.count
        loadCurrent(autoplay: autoplay)
    }

    func togglePlayPause() {
        isPlaying ? pause() : resume()
    }

    func resume() {
        guard file != nil else { return }
        try? AVAudioSession.sharedInstance().setActive(true)
        if !engine.isRunning {
            do { try engine.start() } catch { return }
        }
        node.play()
        isPlaying = true
        startProgressTimer()
        updateNowPlaying()
    }

    func pause() {
        guard isPlaying else { return }
        let position = playbackPosition()
        isPlaying = false
        // Reagenda a partir da posição atual e pausa o motor (economiza bateria).
        invalidateSchedule()
        seekFrame = AVAudioFramePosition(position * sampleRate)
        currentTime = position
        schedule(from: seekFrame)
        engine.pause()
        stopProgressTimer()
        updateNowPlaying()
    }

    func next() {
        guard !queue.isEmpty else { return }
        advance(autoplay: true)
    }

    func previous() {
        guard !queue.isEmpty else { return }
        if playbackPosition() > 3 || (currentIndex == 0 && repeatMode != .all) {
            seek(to: 0)
            return
        }
        currentIndex = currentIndex == 0 ? queue.count - 1 : currentIndex - 1
        loadCurrent(autoplay: true)
    }

    func seek(to time: Double) {
        guard let file else { return }
        let target = min(max(0, time), duration)
        invalidateSchedule()
        seekFrame = AVAudioFramePosition(target * sampleRate)
        currentTime = target
        if seekFrame >= file.length {
            if isPlaying { trackDidEnd() }
            return
        }
        schedule(from: seekFrame)
        if isPlaying { node.play() }
        updateNowPlaying()
    }

    func skip(by seconds: Double) {
        seek(to: playbackPosition() + seconds)
    }

    func stop() {
        invalidateSchedule()
        engine.stop()
        file = nil
        isPlaying = false
        queue = []
        originalQueue = []
        currentIndex = 0
        currentTime = 0
        duration = 0
        stopProgressTimer()
        updateNowPlaying()
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    private func playbackPosition() -> Double {
        guard isPlaying,
              let nodeTime = node.lastRenderTime,
              let playerTime = node.playerTime(forNodeTime: nodeTime)
        else { return Double(seekFrame) / sampleRate }
        let seconds = Double(seekFrame + playerTime.sampleTime) / sampleRate
        return min(max(seconds, 0), duration)
    }

    // MARK: - Timer de progresso e de sono

    private func startProgressTimer() {
        guard progressTimer == nil else { return }
        let timer = Timer(timeInterval: 0.25, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in self?.tick() }
        }
        RunLoop.main.add(timer, forMode: .common)
        progressTimer = timer
    }

    private func stopProgressTimer() {
        progressTimer?.invalidate()
        progressTimer = nil
    }

    private func tick() {
        currentTime = playbackPosition()
        if let end = sleepTimerEnd, Date() >= end {
            sleepTimerEnd = nil
            pause()
        }
    }

    func setSleepTimer(minutes: Int?) {
        sleepAtEndOfTrack = false
        sleepTimerEnd = minutes.map { Date().addingTimeInterval(Double($0) * 60) }
    }

    func setSleepAtEndOfTrack() {
        sleepTimerEnd = nil
        sleepAtEndOfTrack = true
    }

    // MARK: - Sistema (interrupções, fones, Central de Controle)

    private func observeSystemNotifications() {
        let center = NotificationCenter.default

        observers.append(center.addObserver(
            forName: AVAudioSession.interruptionNotification, object: nil, queue: .main
        ) { [weak self] note in
            guard let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
                  let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
            let optionsRaw = note.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
            let shouldResume = AVAudioSession.InterruptionOptions(rawValue: optionsRaw).contains(.shouldResume)
            Task { @MainActor [weak self] in self?.handleInterruption(type, shouldResume: shouldResume) }
        })

        observers.append(center.addObserver(
            forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main
        ) { [weak self] note in
            guard let raw = note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
                  AVAudioSession.RouteChangeReason(rawValue: raw) == .oldDeviceUnavailable else { return }
            // Fone desconectado: pausa, como todo bom player.
            Task { @MainActor [weak self] in self?.pause() }
        })

        observers.append(center.addObserver(
            forName: .AVAudioEngineConfigurationChange, object: engine, queue: .main
        ) { [weak self] _ in
            Task { @MainActor [weak self] in self?.handleEngineConfigurationChange() }
        })
    }

    private func handleInterruption(_ type: AVAudioSession.InterruptionType, shouldResume: Bool) {
        switch type {
        case .began:
            resumeAfterInterruption = isPlaying
            pause()
        case .ended:
            if shouldResume && resumeAfterInterruption { resume() }
            resumeAfterInterruption = false
        @unknown default:
            break
        }
    }

    private func handleEngineConfigurationChange() {
        guard file != nil else { return }
        let wasPlaying = isPlaying
        let position = currentTime
        isPlaying = false
        invalidateSchedule()
        seekFrame = AVAudioFramePosition(position * sampleRate)
        schedule(from: seekFrame)
        if wasPlaying { resume() }
    }

    private func configureRemoteCommands() {
        let center = MPRemoteCommandCenter.shared()
        center.playCommand.addTarget { [weak self] _ in
            Task { @MainActor in self?.resume() }
            return .success
        }
        center.pauseCommand.addTarget { [weak self] _ in
            Task { @MainActor in self?.pause() }
            return .success
        }
        center.togglePlayPauseCommand.addTarget { [weak self] _ in
            Task { @MainActor in self?.togglePlayPause() }
            return .success
        }
        center.nextTrackCommand.addTarget { [weak self] _ in
            Task { @MainActor in self?.next() }
            return .success
        }
        center.previousTrackCommand.addTarget { [weak self] _ in
            Task { @MainActor in self?.previous() }
            return .success
        }
        center.changePlaybackPositionCommand.addTarget { [weak self] event in
            guard let event = event as? MPChangePlaybackPositionCommandEvent else { return .commandFailed }
            let time = event.positionTime
            Task { @MainActor in self?.seek(to: time) }
            return .success
        }
    }

    private func updateNowPlaying() {
        let infoCenter = MPNowPlayingInfoCenter.default()
        guard let track = currentTrack, file != nil else {
            infoCenter.nowPlayingInfo = nil
            infoCenter.playbackState = .stopped
            return
        }
        var info: [String: Any] = [
            MPMediaItemPropertyTitle: track.title,
            MPMediaItemPropertyArtist: track.artist,
            MPMediaItemPropertyAlbumTitle: track.album,
            MPMediaItemPropertyPlaybackDuration: duration,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: currentTime,
            MPNowPlayingInfoPropertyPlaybackRate: isPlaying ? Double(playbackRate) : 0.0,
            MPNowPlayingInfoPropertyDefaultPlaybackRate: 1.0,
            MPNowPlayingInfoPropertyPlaybackQueueIndex: currentIndex,
            MPNowPlayingInfoPropertyPlaybackQueueCount: queue.count,
        ]
        if nowPlayingArtwork?.id != track.id {
            let artwork = ArtworkCache.image(for: track).map(Self.makeArtwork)
            nowPlayingArtwork = (track.id, artwork)
        }
        if let artwork = nowPlayingArtwork?.artwork {
            info[MPMediaItemPropertyArtwork] = artwork
        }
        infoCenter.nowPlayingInfo = info
        infoCenter.playbackState = isPlaying ? .playing : .paused
    }

    /// Fora do MainActor: o sistema chama o handler da capa em outra thread.
    nonisolated private static func makeArtwork(_ image: UIImage) -> MPMediaItemArtwork {
        MPMediaItemArtwork(boundsSize: image.size) { _ in image }
    }
}
