import SwiftUI

/// Busca e baixa músicas gratuitas de catálogos com licença livre.
struct ExploreView: View {
    @Environment(DownloadManager.self) private var downloads
    @AppStorage("exploreSource") private var source: OnlineSource = .internetArchive
    @AppStorage("jamendoClientID") private var jamendoKey = ""
    @State private var query = ""
    @State private var submitted = ""
    @State private var archiveItems: [ArchiveItem] = []
    @State private var tracks: [OnlineTrack] = []
    @State private var loadState = LoadState.idle

    enum LoadState: Equatable {
        case idle, loading, loaded
        case failed(String)
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Picker("Catálogo", selection: $source) {
                        ForEach(OnlineSource.allCases) { Text($0.name).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                } footer: {
                    Text(source.about)
                }

                if source == .jamendo && jamendoKey.isEmpty {
                    JamendoKeySection(key: $jamendoKey)
                } else {
                    results
                }

                Section {
                    Label {
                        Text("Só aparecem músicas que os autores liberaram para download gratuito. Respeite a licença: dê crédito ao artista e, nas licenças NC, não use comercialmente.")
                    } icon: {
                        Image(systemName: "checkmark.seal.fill").foregroundStyle(Theme.accent)
                    }
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    if source == .jamendo && !jamendoKey.isEmpty {
                        Button("Trocar Client ID do Jamendo", role: .destructive) { jamendoKey = "" }
                            .font(.footnote)
                    }
                }
            }
            .navigationTitle("Explorar")
            .searchable(text: $query, prompt: "Buscar músicas grátis")
            .onSubmit(of: .search) { submitted = query.trimmed }
            .onChange(of: query) { _, newValue in
                if newValue.isEmpty { submitted = "" }
            }
            .task(id: "\(source.rawValue)|\(submitted)|\(jamendoKey)") { await load() }
            .refreshable { await load() }
        }
        .withMiniPlayer()
    }

    @ViewBuilder
    private var results: some View {
        let isEmpty = source == .internetArchive ? archiveItems.isEmpty : tracks.isEmpty
        switch loadState {
        case .failed(let message):
            ContentUnavailableView {
                Label("Não deu para carregar", systemImage: "wifi.exclamationmark")
            } description: {
                Text(message)
            } actions: {
                Button("Tentar de novo") { Task { await load() } }
            }
        case .loading where isEmpty, .idle:
            HStack {
                Spacer()
                ProgressView("Carregando…")
                Spacer()
            }
            .listRowBackground(Color.clear)
        default:
            if isEmpty {
                ContentUnavailableView.search(text: submitted)
            } else {
                Section(submitted.isEmpty ? "Mais populares" : "Resultados para “\(submitted)”") {
                    if source == .internetArchive {
                        ForEach(archiveItems) { item in
                            NavigationLink { ArchiveItemView(item: item) } label: { ArchiveItemRow(item: item) }
                        }
                    } else {
                        ForEach(tracks) { OnlineTrackRow(track: $0) }
                    }
                }
            }
        }
    }

    private func load() async {
        if source == .jamendo && jamendoKey.isEmpty {
            loadState = .idle
            return
        }
        loadState = .loading
        do {
            switch source {
            case .internetArchive:
                archiveItems = try await MusicAPI.searchArchive(submitted)
            case .ccMixter:
                tracks = try await MusicAPI.searchCCMixter(submitted)
            case .jamendo:
                tracks = try await MusicAPI.searchJamendo(submitted, clientID: jamendoKey)
            }
            loadState = .loaded
            #if DEBUG
            // `-demoDownload YES`: baixa as duas primeiras faixas (teste de ponta a ponta no CI).
            if UserDefaults.standard.bool(forKey: "demoDownload") {
                downloads.download(Array(tracks.prefix(2)))
            }
            #endif
        } catch {
            guard !Task.isCancelled else { return }
            loadState = .failed(error.localizedDescription)
        }
    }
}

struct JamendoKeySection: View {
    @Binding var key: String
    @State private var draft = ""

    var body: some View {
        Section {
            Text("O Jamendo pede uma chave gratuita. Crie uma conta de desenvolvedor, cadastre um app (qualquer nome) e cole aqui o **Client ID**. Leva um minuto.")
                .font(.subheadline)
            Link(destination: URL(string: "https://devportal.jamendo.com")!) {
                Label("Abrir devportal.jamendo.com", systemImage: "arrow.up.right.square")
            }
            TextField("Client ID", text: $draft)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .font(.body.monospaced())
            Button("Salvar") { key = draft.trimmed }
                .disabled(draft.trimmed.isEmpty)
        } header: {
            Text("Chave do Jamendo")
        }
    }
}

struct ArchiveItemRow: View {
    let item: ArchiveItem

    var body: some View {
        HStack(spacing: 12) {
            RemoteArtwork(url: item.artworkURL, size: 56)
            VStack(alignment: .leading, spacing: 2) {
                Text(item.title).lineLimit(2)
                Text(item.creator).font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                Text(item.license).font(.caption).foregroundStyle(Theme.accent).lineLimit(1)
            }
        }
    }
}

struct ArchiveItemView: View {
    @Environment(DownloadManager.self) private var downloads
    @Environment(LibraryStore.self) private var library
    let item: ArchiveItem
    @State private var tracks: [OnlineTrack] = []
    @State private var error: String?
    @State private var loaded = false

    var body: some View {
        List {
            VStack(spacing: 8) {
                RemoteArtwork(url: item.artworkURL, size: 200, cornerRadius: 14)
                    .shadow(color: .black.opacity(0.2), radius: 16, y: 8)
                Text(item.title).font(.title3.bold()).multilineTextAlignment(.center)
                Text(item.creator).foregroundStyle(Theme.accent)
                Text([item.year, item.license].compactMap { $0 }.joined(separator: " · "))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity)
            .listRowSeparator(.hidden)

            let missing = tracks.filter { !library.contains(remoteID: $0.id) }
            if !missing.isEmpty {
                Button { downloads.download(missing) } label: {
                    Label(missing.count == tracks.count ? "Baixar álbum (\(tracks.count) músicas)" : "Baixar as \(missing.count) restantes",
                          systemImage: "arrow.down.circle.fill")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .listRowSeparator(.hidden)
            }

            if let error {
                ContentUnavailableView("Não deu para carregar", systemImage: "wifi.exclamationmark", description: Text(error))
            } else if !loaded {
                HStack { Spacer(); ProgressView(); Spacer() }.listRowSeparator(.hidden)
            } else if tracks.isEmpty {
                ContentUnavailableView("Sem MP3 neste item", systemImage: "music.note",
                                       description: Text("Este item não tem faixas em MP3 para baixar."))
            } else {
                ForEach(Array(tracks.enumerated()), id: \.element.id) { index, track in
                    OnlineTrackRow(track: track, number: track.trackNumber ?? index + 1)
                }
            }

            HStack(spacing: 16) {
                if let page = item.pageURL { Link("Ver no Internet Archive", destination: page) }
                if let license = item.licenseURL { Link("Licença", destination: license) }
            }
            .font(.footnote)
            .listRowSeparator(.hidden)
        }
        .listStyle(.plain)
        .navigationBarTitleDisplayMode(.inline)
        .task {
            do {
                tracks = try await MusicAPI.archiveTracks(item)
            } catch {
                if !Task.isCancelled { self.error = error.localizedDescription }
            }
            loaded = true
        }
    }
}

struct OnlineTrackRow: View {
    @Environment(PreviewPlayer.self) private var preview
    @Environment(PlayerController.self) private var player
    let track: OnlineTrack
    var number: Int?

    var body: some View {
        let isCurrent = preview.currentID == track.id
        HStack(spacing: 12) {
            ZStack {
                if let number {
                    Text("\(number)")
                        .font(.subheadline.monospacedDigit())
                        .foregroundStyle(.secondary)
                        .opacity(isCurrent ? 0 : 1)
                } else {
                    RemoteArtwork(url: track.artworkURL, size: 48)
                }
                if isCurrent {
                    Group {
                        if preview.isLoading {
                            ProgressView()
                        } else {
                            Image(systemName: preview.isPlaying ? "pause.fill" : "play.fill")
                        }
                    }
                    .foregroundStyle(number == nil ? .white : Theme.accent)
                    .frame(width: 48, height: 48)
                    .background(number == nil ? Color.black.opacity(0.45) : .clear, in: RoundedRectangle(cornerRadius: 6))
                }
            }
            .frame(width: number == nil ? 48 : 28)

            VStack(alignment: .leading, spacing: 2) {
                Text(track.title)
                    .foregroundStyle(isCurrent ? Theme.accent : .primary)
                    .lineLimit(1)
                Text(number == nil ? "\(track.artist) · \(track.license)" : track.artist)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            if let duration = track.duration {
                Text(duration.timeString)
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)
            }
            DownloadButton(track: track)
        }
        .contentShape(Rectangle())
        .onTapGesture {
            player.pause()
            preview.toggle(track)
        }
    }
}

struct DownloadButton: View {
    @Environment(DownloadManager.self) private var downloads
    @Environment(LibraryStore.self) private var library
    let track: OnlineTrack

    var body: some View {
        Group {
            if library.contains(remoteID: track.id) {
                Image(systemName: "checkmark.circle.fill")
                    .font(.title2)
                    .foregroundStyle(Theme.accent)
                    .accessibilityLabel("Na biblioteca")
            } else {
                switch downloads.state(of: track) {
                case .queued:
                    Button { downloads.cancel(track) } label: { ProgressView() }
                        .accessibilityLabel("Na fila, toque para cancelar")
                case .downloading(let progress):
                    Button { downloads.cancel(track) } label: {
                        ZStack {
                            Circle().stroke(.quaternary, lineWidth: 3)
                            Circle()
                                .trim(from: 0, to: max(progress, 0.02))
                                .stroke(Theme.accent, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                                .rotationEffect(.degrees(-90))
                                .animation(.linear(duration: 0.2), value: progress)
                            Image(systemName: "stop.fill").font(.system(size: 8)).foregroundStyle(Theme.accent)
                        }
                        .frame(width: 24, height: 24)
                    }
                    .accessibilityLabel("Baixando \(Int(progress * 100))%, toque para cancelar")
                case .failed(let message):
                    Button { downloads.download([track]) } label: {
                        Image(systemName: "exclamationmark.arrow.circlepath").font(.title2).foregroundStyle(.orange)
                    }
                    .accessibilityLabel("Falhou: \(message). Toque para tentar de novo")
                case nil:
                    Button { downloads.download([track]) } label: {
                        Image(systemName: "arrow.down.circle").font(.title2).foregroundStyle(Theme.accent)
                    }
                    .accessibilityLabel("Baixar")
                }
            }
        }
        .buttonStyle(.borderless)
        .frame(width: 36, height: 36)
    }
}

/// Capa vinda da internet, com degradê enquanto carrega ou quando não existe.
struct RemoteArtwork: View {
    let url: URL?
    var size: CGFloat?
    var cornerRadius: CGFloat = 6

    var body: some View {
        Color.clear
            .frame(width: size, height: size)
            .aspectRatio(1, contentMode: .fit)
            .overlay {
                AsyncImage(url: url) { phase in
                    if let image = phase.image {
                        image.resizable().scaledToFill()
                    } else {
                        Theme.accentGradient
                            .opacity(0.85)
                            .overlay {
                                Image(systemName: "waveform")
                                    .font(.system(size: (size ?? 120) * 0.38, weight: .semibold))
                                    .foregroundStyle(.white.opacity(0.9))
                            }
                    }
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
    }
}
