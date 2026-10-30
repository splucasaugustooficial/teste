import AVKit
import MediaPlayer
import SwiftUI

struct NowPlayingView: View {
    @Environment(LibraryStore.self) private var library
    @Environment(PlayerController.self) private var player
    @State private var isScrubbing = false
    @State private var scrubTime: Double = 0
    @State private var showingQueue = false

    var body: some View {
        if let track = player.currentTrack {
            let isFavorite = library.track(id: track.id)?.isFavorite ?? false
            VStack(spacing: 0) {
                Spacer(minLength: 24)

                ArtworkView(track: track, cornerRadius: 18)
                    .shadow(color: .black.opacity(0.35), radius: 24, y: 12)
                    .scaleEffect(player.isPlaying ? 1 : 0.86)
                    .animation(.spring(response: 0.45, dampingFraction: 0.7), value: player.isPlaying)
                    .padding(.horizontal, 28)

                Spacer(minLength: 24)

                HStack(alignment: .center) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(track.title).font(.title2.bold()).lineLimit(1)
                        Text(track.artist).font(.title3).foregroundStyle(.secondary).lineLimit(1)
                    }
                    Spacer()
                    Button {
                        library.toggleFavorite(track.id)
                        player.refresh(from: library)
                    } label: {
                        Image(systemName: isFavorite ? "heart.fill" : "heart")
                            .font(.title2)
                            .foregroundStyle(isFavorite ? Theme.accent : .primary)
                            .symbolEffect(.bounce, value: isFavorite)
                    }
                    Menu {
                        TrackMenuItems(track: track, insideSheet: true)
                    } label: {
                        Image(systemName: "ellipsis.circle").font(.title2)
                    }
                    .padding(.leading, 12)
                }
                .padding(.horizontal, 28)

                progress.padding(.horizontal, 28).padding(.top, 20)
                transport.padding(.top, 8)
                VolumeSlider().frame(height: 34).padding(.horizontal, 28).padding(.top, 12)
                bottomBar.padding(.horizontal, 36).padding(.top, 16).padding(.bottom, 12)
            }
            .tint(.primary)
            .background { background(for: track) }
            .presentationDragIndicator(.visible)
            .sheet(isPresented: $showingQueue) { QueueView() }
        } else {
            ContentUnavailableView("Nada tocando", systemImage: "music.note")
        }
    }

    private func background(for track: Track) -> some View {
        ZStack {
            Color(.systemBackground)
            ArtworkView(track: track, cornerRadius: 0)
                .scaledToFill()
                .blur(radius: 60)
                .opacity(0.55)
                .scaleEffect(1.4)
        }
        .ignoresSafeArea()
    }

    private var progress: some View {
        VStack(spacing: 4) {
            Slider(
                value: Binding(
                    get: { isScrubbing ? scrubTime : player.currentTime },
                    set: { scrubTime = $0 }
                ),
                in: 0...max(player.duration, 1)
            ) { editing in
                if editing {
                    scrubTime = player.currentTime
                } else {
                    player.seek(to: scrubTime)
                }
                isScrubbing = editing
            }
            .tint(Theme.accent)
            HStack {
                Text((isScrubbing ? scrubTime : player.currentTime).timeString)
                Spacer()
                Text("-" + (player.duration - (isScrubbing ? scrubTime : player.currentTime)).timeString)
            }
            .font(.caption.monospacedDigit())
            .foregroundStyle(.secondary)
        }
    }

    private var transport: some View {
        HStack {
            Button { player.toggleShuffle() } label: {
                Image(systemName: "shuffle")
                    .foregroundStyle(player.shuffleEnabled ? Theme.accent : .secondary)
            }
            .font(.title3)
            Spacer()
            Button { player.previous() } label: { Image(systemName: "backward.fill") }
                .font(.system(size: 30))
            Spacer()
            Button { player.togglePlayPause() } label: {
                Image(systemName: player.isPlaying ? "pause.circle.fill" : "play.circle.fill")
                    .font(.system(size: 72))
                    .foregroundStyle(Theme.accent)
                    .contentTransition(.symbolEffect(.replace))
            }
            Spacer()
            Button { player.next() } label: { Image(systemName: "forward.fill") }
                .font(.system(size: 30))
            Spacer()
            Button { player.repeatMode = player.repeatMode.next } label: {
                Image(systemName: player.repeatMode.symbol)
                    .foregroundStyle(player.repeatMode == .off ? .secondary : Theme.accent)
            }
            .font(.title3)
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 28)
    }

    private var bottomBar: some View {
        HStack {
            Menu {
                Picker("Velocidade", selection: Binding(get: { player.playbackRate }, set: { player.playbackRate = $0 })) {
                    ForEach([Float(0.5), 0.75, 1, 1.25, 1.5, 2], id: \.self) { rate in
                        Text(rate.rateLabel).tag(rate)
                    }
                }
            } label: {
                Text(player.playbackRate.rateLabel)
                    .font(.subheadline.weight(.semibold).monospacedDigit())
                    .frame(minWidth: 44)
            }
            Spacer()
            SleepTimerMenu()
            Spacer()
            RoutePicker().frame(width: 44, height: 44)
            Spacer()
            Button { showingQueue = true } label: { Image(systemName: "list.bullet") }
        }
        .font(.title3)
        .foregroundStyle(.secondary)
    }
}

extension Float {
    var rateLabel: String {
        let text = self == rounded() ? String(format: "%.0f", self) : String(format: "%g", self)
        return text.replacingOccurrences(of: ".", with: ",") + "×"
    }
}

struct SleepTimerMenu: View {
    @Environment(PlayerController.self) private var player

    var body: some View {
        Menu {
            if player.sleepTimerEnd != nil || player.sleepAtEndOfTrack {
                Button(role: .destructive) { player.setSleepTimer(minutes: nil) } label: {
                    Label("Desligar timer", systemImage: "xmark")
                }
            }
            Button("Fim da música") { player.setSleepAtEndOfTrack() }
            ForEach([5, 15, 30, 45, 60, 90], id: \.self) { minutes in
                Button("\(minutes) minutos") { player.setSleepTimer(minutes: minutes) }
            }
        } label: {
            if let end = player.sleepTimerEnd {
                Text(timerInterval: Date()...max(end, Date()), countsDown: true)
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(Theme.accent)
                    .frame(minWidth: 44)
            } else {
                Image(systemName: player.sleepAtEndOfTrack ? "moon.zzz.fill" : "moon.zzz")
                    .foregroundStyle(player.sleepAtEndOfTrack ? Theme.accent : .secondary)
            }
        }
    }
}

/// Botão de AirPlay/Bluetooth do sistema.
struct RoutePicker: UIViewRepresentable {
    func makeUIView(context: Context) -> AVRoutePickerView {
        let view = AVRoutePickerView()
        view.activeTintColor = UIColor(Theme.accent)
        view.tintColor = .secondaryLabel
        view.prioritizesVideoDevices = false
        return view
    }

    func updateUIView(_ uiView: AVRoutePickerView, context: Context) {}
}

/// Volume do sistema (MPVolumeView é o único jeito permitido de controlar o volume).
struct VolumeSlider: UIViewRepresentable {
    func makeUIView(context: Context) -> MPVolumeView {
        let view = MPVolumeView(frame: .zero)
        view.tintColor = UIColor(Theme.accent)
        view.setVolumeThumbImage(UIImage(systemName: "circle.fill")?
            .withTintColor(.white, renderingMode: .alwaysOriginal)
            .applyingSymbolConfiguration(.init(pointSize: 14)), for: .normal)
        return view
    }

    func updateUIView(_ uiView: MPVolumeView, context: Context) {}
}

struct QueueView: View {
    @Environment(PlayerController.self) private var player
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                if let current = player.currentTrack {
                    Section("Tocando agora") {
                        TrackRow(track: current)
                    }
                }
                Section(player.upNext.isEmpty ? "Fila vazia" : "A seguir") {
                    ForEach(Array(player.upNext.enumerated()), id: \.offset) { offset, track in
                        TrackRow(track: track)
                            .onTapGesture { player.jump(toQueueIndex: player.currentIndex + 1 + offset) }
                    }
                    .onDelete { player.removeUpNext(at: $0) }
                    .onMove { player.moveUpNext(from: $0, to: $1) }
                }
            }
            .navigationTitle("Fila")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { EditButton() }
                ToolbarItem(placement: .confirmationAction) {
                    Button("OK") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}
