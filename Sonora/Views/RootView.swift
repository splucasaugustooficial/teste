import SwiftUI
import UniformTypeIdentifiers

struct RootView: View {
    @Environment(LibraryStore.self) private var library
    @Environment(PlayerController.self) private var player
    @Environment(AppRouter.self) private var router
    @State private var newPlaylistName = ""

    var body: some View {
        @Bindable var player = player
        @Bindable var router = router

        TabView {
            LibraryView()
                .tabItem { Label("Biblioteca", systemImage: "music.note.house.fill") }
            PlaylistsView()
                .tabItem { Label("Playlists", systemImage: "music.note.list") }
            SearchView()
                .tabItem { Label("Buscar", systemImage: "magnifyingglass") }
            SoundView()
                .tabItem { Label("Som", systemImage: "slider.vertical.3") }
        }
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
