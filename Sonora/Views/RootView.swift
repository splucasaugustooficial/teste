import SwiftUI
import UniformTypeIdentifiers

struct RootView: View {
    @Environment(LibraryStore.self) private var library
    @Environment(PlayerController.self) private var player
    @Environment(AppRouter.self) private var router
    @State private var newPlaylistName = ""
    /// Aba inicial; o argumento `-demoTab N` permite abrir outra (usado nas capturas do CI).
    @State private var selectedTab = UserDefaults.standard.integer(forKey: "demoTab")

    var body: some View {
        @Bindable var player = player
        @Bindable var router = router

        TabView(selection: $selectedTab) {
            LibraryView()
                .tabItem { Label("Biblioteca", systemImage: "music.note.house.fill") }
                .tag(0)
            PlaylistsView()
                .tabItem { Label("Playlists", systemImage: "music.note.list") }
                .tag(1)
            SearchView()
                .tabItem { Label("Buscar", systemImage: "magnifyingglass") }
                .tag(2)
            SoundView()
                .tabItem { Label("Som", systemImage: "slider.vertical.3") }
                .tag(3)
        }
        #if DEBUG
        .task {
            // `-demoPlay YES [-demoAlbum Nome]`: começa a tocar e abre o player (capturas do CI).
            guard UserDefaults.standard.bool(forKey: "demoPlay") else { return }
            try? await Task.sleep(for: .seconds(1))
            let name = UserDefaults.standard.string(forKey: "demoAlbum")
            let album = library.albums.first { name == nil ? $0.tracks.contains(where: \.hasArtwork) : $0.title == name }
            player.play(album?.tracks ?? library.tracks(for: .all))
            player.showFullPlayer = true
        }
        #endif
        .sheet(isPresented: $player.showFullPlayer) {
            NowPlayingView()
        }
        .sheet(item: $router.editingTrack) { track in
            EditTrackView(track: track)
        }
        .fileImporter(
            isPresented: $router.showingImporter,
            allowedContentTypes: [.audio, .folder],
            allowsMultipleSelection: true
        ) { result in
            if case .success(let urls) = result {
                Task { await library.importFiles(urls) }
            }
        }
        .confirmationDialog(
            "Apagar esta música do Sonora?",
            isPresented: Binding(
                get: { router.trackPendingDelete != nil },
                set: { if !$0 { router.trackPendingDelete = nil } }
            ),
            titleVisibility: .visible,
            presenting: router.trackPendingDelete
        ) { track in
            Button("Apagar \"\(track.title)\"", role: .destructive) {
                library.delete(track.id)
                player.refresh(from: library)
            }
        } message: { _ in
            Text("O arquivo será removido do aparelho.")
        }
        .alert(
            "Nova playlist",
            isPresented: Binding(
                get: { router.tracksForNewPlaylist != nil },
                set: { if !$0 { router.tracksForNewPlaylist = nil } }
            )
        ) {
            TextField("Nome", text: $newPlaylistName)
            Button("Criar") {
                let ids = router.tracksForNewPlaylist?.map(\.id) ?? []
                library.createPlaylist(named: newPlaylistName, trackIDs: ids)
                newPlaylistName = ""
            }
            Button("Cancelar", role: .cancel) { newPlaylistName = "" }
        }
        .overlay(alignment: .top) { ToastView() }
    }
}

extension View {
    /// Reserva espaço para o mini player acima da barra de abas.
    func withMiniPlayer() -> some View {
        safeAreaInset(edge: .bottom, spacing: 0) { MiniPlayerView() }
    }
}

struct ToastView: View {
    @Environment(LibraryStore.self) private var library

    var body: some View {
        Group {
            if let status = library.importStatus {
                label(status, systemImage: nil)
            } else if let toast = library.toast {
                label(toast, systemImage: "checkmark.circle.fill")
                    .task(id: toast) {
                        try? await Task.sleep(for: .seconds(2.5))
                        if library.toast == toast { library.toast = nil }
                    }
            }
        }
        .animation(.spring, value: library.importStatus)
        .animation(.spring, value: library.toast)
    }

    private func label(_ text: String, systemImage: String?) -> some View {
        HStack(spacing: 8) {
            if let systemImage {
                Image(systemName: systemImage).foregroundStyle(Theme.accent)
            } else {
                ProgressView()
            }
            Text(text).font(.subheadline.weight(.medium))
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(.regularMaterial, in: Capsule())
        .shadow(color: .black.opacity(0.15), radius: 10, y: 4)
        .padding(.top, 4)
        .transition(.move(edge: .top).combined(with: .opacity))
    }
}
