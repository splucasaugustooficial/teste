import AVFoundation
import Foundation
import Observation

/// Baixa músicas dos catálogos online (até 3 por vez) e as guarda na biblioteca.
@Observable
@MainActor
final class DownloadManager {
    enum State: Equatable {
        case queued
        case downloading(Double)
        case failed(String)
    }

    private(set) var states: [String: State] = [:]

    @ObservationIgnored private var pending: [OnlineTrack] = []
    @ObservationIgnored private var tasks: [String: URLSessionDownloadTask] = [:]
    @ObservationIgnored private var observations: [String: NSKeyValueObservation] = [:]
    @ObservationIgnored private weak var library: LibraryStore?
    @ObservationIgnored private var running = 0
    private let maxConcurrent = 3

    func attach(_ library: LibraryStore) {
        self.library = library
    }

    func state(of track: OnlineTrack) -> State? { states[track.id] }

    func download(_ tracks: [OnlineTrack]) {
        for track in tracks where states[track.id] == nil || isFailure(states[track.id]!) {
            guard library?.contains(remoteID: track.id) != true else { continue }
            states[track.id] = .queued
            pending.append(track)
        }
        pump()
    }

    func cancel(_ track: OnlineTrack) {
        pending.removeAll { $0.id == track.id }
        tasks[track.id]?.cancel()
        finish(track.id)
        states[track.id] = nil
    }

    private func isFailure(_ state: State) -> Bool {
        if case .failed = state { return true }
        return false
    }

    private func pump() {
        while running < maxConcurrent, !pending.isEmpty {
            let track = pending.removeFirst()
            running += 1
            Task {
                await run(track)
                running -= 1
                pump()
            }
        }
    }

    private func run(_ track: OnlineTrack) async {
        states[track.id] = .downloading(0)
        do {
            async let artwork = Self.fetchArtwork(track.artworkURL)
            let file = try await fetch(track)
            let result = await library?.importDownload(file, from: track, artwork: await artwork)
            switch result {
            case .added:
                states[track.id] = nil
                library?.toast = "“\(track.title)” baixada"
            case .duplicate:
                states[track.id] = nil
                library?.toast = "“\(track.title)” já está na biblioteca"
            case .unsupported, nil:
                states[track.id] = .failed("Formato não suportado")
            }
        } catch is CancellationError {
            states[track.id] = nil
        } catch let error as URLError where error.code == .cancelled {
            states[track.id] = nil
        } catch {
            states[track.id] = .failed(error.localizedDescription)
        }
        finish(track.id)
    }

    private func finish(_ id: String) {
        tasks[id] = nil
        observations[id]?.invalidate()
        observations[id] = nil
    }

    private func fetch(_ track: OnlineTrack) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            let task = URLSession.shared.downloadTask(with: track.downloadURL) { temp, response, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                guard let temp, let http = response as? HTTPURLResponse else {
                    continuation.resume(throwing: URLError(.badServerResponse))
                    return
                }
                guard (200..<300).contains(http.statusCode) else {
                    continuation.resume(throwing: MusicAPIError.http(http.statusCode))
                    return
                }
                // O arquivo temporário some quando este bloco termina: move já.
                let ext = Self.fileExtension(for: http, url: track.downloadURL)
                let destination = FileManager.default.temporaryDirectory
                    .appendingPathComponent(UUID().uuidString)
                    .appendingPathExtension(ext)
                do {
                    try FileManager.default.moveItem(at: temp, to: destination)
                    continuation.resume(returning: destination)
                } catch {
                    continuation.resume(throwing: error)
                }
            }
            let id = track.id
            observations[id] = task.progress.observe(\.fractionCompleted) { [weak self] progress, _ in
                let fraction = progress.fractionCompleted
                Task { @MainActor [weak self] in
                    if case .downloading = self?.states[id] { self?.states[id] = .downloading(fraction) }
                }
            }
            tasks[id] = task
            task.resume()
        }
    }

    nonisolated private static func fileExtension(for response: HTTPURLResponse, url: URL) -> String {
        let suggested = (response.suggestedFilename as NSString?)?.pathExtension.lowercased() ?? ""
        if LibraryStore.audioExtensions.contains(suggested) { return suggested }
        switch response.mimeType?.lowercased() {
        case "audio/mp4", "audio/x-m4a", "audio/aac": return "m4a"
        case "audio/flac", "audio/x-flac": return "flac"
        case "audio/wav", "audio/x-wav", "audio/wave": return "wav"
        default: break
        }
        let fromURL = url.pathExtension.lowercased()
        return LibraryStore.audioExtensions.contains(fromURL) ? fromURL : "mp3"
    }

    nonisolated private static func fetchArtwork(_ url: URL?) async -> Data? {
        guard let url else { return nil }
        return try? await URLSession.shared.data(from: url).0
    }
}

/// Toca uma prévia online (streaming) antes de baixar.
@Observable
@MainActor
final class PreviewPlayer {
    private(set) var currentID: String?
    private(set) var isPlaying = false
    private(set) var isLoading = false

    @ObservationIgnored private let player = AVPlayer()
    @ObservationIgnored private var statusObservation: NSKeyValueObservation?
    @ObservationIgnored private var endObserver: NSObjectProtocol?

    func toggle(_ track: OnlineTrack) {
        if currentID == track.id {
            if isPlaying { player.pause() } else { player.play() }
            isPlaying.toggle()
            return
        }
        stop()
        try? AVAudioSession.sharedInstance().setActive(true)
        let item = AVPlayerItem(url: track.streamURL)
        currentID = track.id
        isLoading = true
        isPlaying = true
        statusObservation = item.observe(\.status) { [weak self] item, _ in
            let failed = item.status == .failed
            Task { @MainActor [weak self] in
                self?.isLoading = false
                if failed { self?.stop() }
            }
        }
        endObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main
        ) { [weak self] _ in
            Task { @MainActor [weak self] in self?.stop() }
        }
        player.replaceCurrentItem(with: item)
        player.play()
    }

    func stop() {
        player.pause()
        player.replaceCurrentItem(with: nil)
        statusObservation?.invalidate()
        statusObservation = nil
        if let endObserver { NotificationCenter.default.removeObserver(endObserver) }
        endObserver = nil
        currentID = nil
        isPlaying = false
        isLoading = false
    }
}
