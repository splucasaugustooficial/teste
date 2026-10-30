import SwiftUI

struct PlaylistsView: View {
    @Environment(LibraryStore.self) private var library
    @Environment(AppRouter.self) private var router

    var body: some View {
        NavigationStack {
            List {
                Section("Automáticas") {
                    ForEach([TrackSource.favorites, .mostPlayed, .recentlyAdded, .recentlyPlayed], id: \.self) { source in
                        NavigationLink { SongListView(source: source) } label: {
                            LibraryLinkLabel(title: source.title, symbol: source.symbol, count: nil)
                        }
                    }
                }

                Section("Minhas playlists") {
                    Button { router.tracksForNewPlaylist = [] } label: {
                        Label("Nova playlist", systemImage: "plus.circle.fill").font(.title3)
                    }
                    ForEach(library.playlists) { playlist in
                        NavigationLink { PlaylistDetailView(playlistID: playlist.id) } label: {
                            PlaylistRow(playlist: playlist)
                        }
                    }
                    .onDelete { offsets in
                        offsets.map { library.playlists[$0].id }.forEach(library.deletePlaylist)
                    }
                }
            }
            .navigationTitle("Playlists")
        }
        .withMiniPlayer()
    }
}

struct PlaylistRow: View {
    @Environment(LibraryStore.self) private var library
    let playlist: Playlist

    var body: some View {
        let tracks = library.tracks(in: playlist)
        HStack(spacing: 12) {
            PlaylistMosaic(tracks: tracks, size: 56)
            VStack(alignment: .leading, spacing: 2) {
                Text(playlist.name).font(.body.weight(.medium)).lineLimit(1)
                Text(tracks.count == 1 ? "1 música" : "\(tracks.count) músicas")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }
}

/// Capa da playlist: mosaico 2×2 com as capas das primeiras faixas.
struct PlaylistMosaic: View {
    let tracks: [Track]
    let size: CGFloat

    var body: some View {
        let covers = Array(tracks.prefix(4))
        Group {
            if covers.count < 4 {
                ArtworkView(track: covers.first, size: size, cornerRadius: 0)
            } else {
                Grid(horizontalSpacing: 0, verticalSpacing: 0) {
                    GridRow {
                        ArtworkView(track: covers[0], size: size / 2, cornerRadius: 0)
                        ArtworkView(track: covers[1], size: size / 2, cornerRadius: 0)
                    }
                    GridRow {
                        ArtworkView(track: covers[2], size: size / 2, cornerRadius: 0)
                        ArtworkView(track: covers[3], size: size / 2, cornerRadius: 0)
                    }
                }
            }
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: size * 0.12, style: .continuous))
    }
}

struct PlaylistDetailView: View {
    @Environment(LibraryStore.self) private var library
    @Environment(PlayerController.self) private var player
    @Environment(\.dismiss) private var dismiss
    let playlistID: UUID
    @State private var showingPicker = false
    @State private var renaming = false
    @State private var newName = ""

    var body: some View {
        if let playlist = library.playlist(id: playlistID) {
            let tracks = library.tracks(in: playlist)
            List {
                VStack(spacing: 10) {
                    PlaylistMosaic(tracks: tracks, size: 200)
                        .shadow(color: .black.opacity(0.2), radius: 16, y: 8)
                    Text(playlist.name).font(.title2.bold())
                    Text("\(tracks.count) músicas · \(tracks.reduce(0) { $0 + $1.duration }.longDurationString)")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity)
                .listRowSeparator(.hidden)

                PlayShuffleHeader(tracks: tracks)

                Section {
                    ForEach(Array(tracks.enumerated()), id: \.offset) { index, track in
                        TrackRow(track: track)
                            .onTapGesture { player.play(tracks, startAt: index) }
                    }
                    .onDelete { library.removeTracks(at: $0, from: playlistID) }
                    .onMove { library.moveTracks(from: $0, to: $1, in: playlistID) }

                    Button { showingPicker = true } label: {
                        Label("Adicionar músicas", systemImage: "plus")
                    }
                }
            }
            .listStyle(.plain)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItemGroup(placement: .topBarTrailing) {
                    EditButton()
                    Menu {
                        Button { newName = playlist.name; renaming = true } label: { Label("Renomear", systemImage: "pencil") }
                        Button(role: .destructive) {
                            library.deletePlaylist(playlistID)
                            dismiss()
                        } label: { Label("Apagar playlist", systemImage: "trash") }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                }
            }
            .sheet(isPresented: $showingPicker) {
                TrackPickerView { ids in library.add(ids, to: playlistID) }
            }
            .alert("Renomear playlist", isPresented: $renaming) {
                TextField("Nome", text: $newName)
                Button("Salvar") { library.renamePlaylist(playlistID, to: newName) }
                Button("Cancelar", role: .cancel) {}
            }
        } else {
            ContentUnavailableView("Playlist removida", systemImage: "music.note.list")
        }
    }
}

/// Seleção múltipla de músicas da biblioteca.
struct TrackPickerView: View {
    @Environment(LibraryStore.self) private var library
    @Environment(\.dismiss) private var dismiss
    @State private var selection = Set<UUID>()
    @State private var query = ""
    let onDone: ([UUID]) -> Void

    var body: some View {
        NavigationStack {
            List(filtered, selection: $selection) { track in
                TrackRow(track: track).tag(track.id)
            }
            .listStyle(.plain)
            .environment(\.editMode, .constant(.active))
            .searchable(text: $query, prompt: "Buscar músicas")
            .navigationTitle(selection.isEmpty ? "Adicionar músicas" : "\(selection.count) selecionadas")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Adicionar") {
                        let all = library.tracks(for: .all)
                        onDone(all.map(\.id).filter(selection.contains))
                        dismiss()
                    }
                    .disabled(selection.isEmpty)
                }
            }
        }
    }

    private var filtered: [Track] {
        let all = library.tracks(for: .all)
        guard let q = query.nonEmpty else { return all }
        return all.filter { $0.title.localizedStandardContains(q) || $0.artist.localizedStandardContains(q) || $0.album.localizedStandardContains(q) }
    }
}
