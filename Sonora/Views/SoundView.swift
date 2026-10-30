import SwiftUI

struct SoundView: View {
    @Environment(PlayerController.self) private var player
    @Environment(LibraryStore.self) private var library

    var body: some View {
        @Bindable var player = player
        NavigationStack {
            List {
                Section {
                    Toggle(isOn: $player.eqEnabled) {
                        Label("Equalizador", systemImage: "slider.vertical.3")
                    }
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(EQPreset.all) { preset in
                                let selected = player.eqEnabled && preset.gains == player.eqGains
                                Button(preset.name) {
                                    player.eqGains = preset.gains
                                    player.eqEnabled = true
                                }
                                .font(.subheadline.weight(.medium))
                                .padding(.horizontal, 14)
                                .padding(.vertical, 8)
                                .background(selected ? AnyShapeStyle(Theme.accent) : AnyShapeStyle(.quaternary), in: Capsule())
                                .foregroundStyle(selected ? .white : .primary)
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(.horizontal, 16)
                    }
                    .listRowInsets(EdgeInsets(top: 8, leading: 0, bottom: 8, trailing: 0))

                    HStack(alignment: .bottom, spacing: 0) {
                        ForEach(PlayerController.eqFrequencies.indices, id: \.self) { i in
                            VStack(spacing: 6) {
                                Text(String(format: "%+.0f", player.eqGains[i]))
                                    .font(.caption2.monospacedDigit())
                                    .foregroundStyle(.secondary)
                                VerticalSlider(value: $player.eqGains[i])
                                    .frame(height: 180)
                                Text(Self.label(for: PlayerController.eqFrequencies[i]))
                                    .font(.caption2.weight(.medium))
                            }
                            .frame(maxWidth: .infinity)
                        }
                    }
                    .padding(.vertical, 8)
                    .opacity(player.eqEnabled ? 1 : 0.4)
                    .disabled(!player.eqEnabled)
                } header: {
                    Text("Equalizador de 10 bandas")
                } footer: {
                    Text("Ajuste fino de −12 a +12 dB. Vale para tudo que tocar no Sonora.")
                }

                Section("Velocidade") {
                    HStack {
                        Image(systemName: "tortoise.fill").foregroundStyle(.secondary)
                        Slider(value: $player.playbackRate, in: 0.5...2, step: 0.05)
                        Image(systemName: "hare.fill").foregroundStyle(.secondary)
                    }
                    HStack {
                        Text("Atual: \(player.playbackRate.rateLabel)").monospacedDigit()
                        Spacer()
                        Button("Normal") { player.playbackRate = 1 }
                            .disabled(player.playbackRate == 1)
                    }
                }

                Section("Timer de sono") {
                    HStack {
                        Text(sleepDescription)
                        Spacer()
                        SleepTimerMenu().font(.title3)
                    }
                }

                Section("Sobre") {
                    LabeledContent("Músicas", value: "\(library.tracks.count)")
                    LabeledContent("Duração total", value: library.totalDuration.longDurationString)
                    LabeledContent("Preço", value: "Grátis. Para sempre.")
                    LabeledContent("Anúncios", value: "Nenhum")
                    LabeledContent("Dados coletados", value: "Nenhum")
                }
            }
            .navigationTitle("Som")
        }
        .withMiniPlayer()
    }

    private var sleepDescription: String {
        if player.sleepAtEndOfTrack { return "Para no fim da música" }
        if let end = player.sleepTimerEnd { return "Para às \(end.formatted(date: .omitted, time: .shortened))" }
        return "Desligado"
    }

    static func label(for frequency: Float) -> String {
        frequency >= 1000 ? "\(Int(frequency / 1000))k" : "\(Int(frequency))"
    }
}

struct VerticalSlider: View {
    @Binding var value: Float
    var range: ClosedRange<Float> = -12...12

    var body: some View {
        GeometryReader { geo in
            let height = geo.size.height
            let fraction = CGFloat((value - range.lowerBound) / (range.upperBound - range.lowerBound))
            let zero = CGFloat((0 - range.lowerBound) / (range.upperBound - range.lowerBound))
            ZStack(alignment: .bottom) {
                Capsule().fill(.quaternary).frame(width: 4)
                Capsule()
                    .fill(Theme.accentGradient)
                    .frame(width: 4, height: abs(fraction - zero) * height)
                    .offset(y: -min(fraction, zero) * height)
                Circle()
                    .fill(.white)
                    .shadow(color: .black.opacity(0.25), radius: 2, y: 1)
                    .frame(width: 22, height: 22)
                    .offset(y: -fraction * height + 11)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { gesture in
                        let f = 1 - min(max(gesture.location.y / height, 0), 1)
                        let raw = range.lowerBound + Float(f) * (range.upperBound - range.lowerBound)
                        value = (raw * 2).rounded() / 2
                    }
            )
        }
        .padding(.vertical, 11)
    }
}

struct EditTrackView: View {
    @Environment(LibraryStore.self) private var library
    @Environment(PlayerController.self) private var player
    @Environment(\.dismiss) private var dismiss
    let track: Track
    @State private var title = ""
    @State private var artist = ""
    @State private var album = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack {
                        Spacer()
                        ArtworkView(track: track, size: 140, cornerRadius: 12)
                        Spacer()
                    }
                    .listRowBackground(Color.clear)
                }
                Section("Informações") {
                    TextField("Título", text: $title)
                    TextField("Artista", text: $artist)
                    TextField("Álbum", text: $album)
                }
                if let license = track.license {
                    Section("Licença") {
                        LabeledContent("Licença", value: license)
                        if let source = track.sourceURL {
                            Link(destination: source) {
                                Label("Página original", systemImage: "arrow.up.right.square")
                            }
                        }
                    }
                }
                Section("Estatísticas") {
                    LabeledContent("Reproduções", value: "\(track.playCount)")
                    LabeledContent("Duração", value: track.duration.timeString)
                    LabeledContent("Adicionada", value: track.dateAdded.formatted(date: .abbreviated, time: .omitted))
                }
            }
            .navigationTitle("Editar")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Salvar") {
                        library.updateInfo(track.id, title: title, artist: artist, album: album)
                        player.refresh(from: library)
                        dismiss()
                    }
                }
            }
            .onAppear {
                title = track.title
                artist = track.artist
                album = track.album
            }
        }
    }
}
