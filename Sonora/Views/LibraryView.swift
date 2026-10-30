import SwiftUI

struct LibraryView: View {
    @Environment(LibraryStore.self) private var library
    @Environment(AppRouter.self) private var router

    var body: some View {
        NavigationStack {
            Group {
                if library.tracks.isEmpty {
                    EmptyLibraryView()
                } else {
                    List {
                        Section {
                            link(.all, count: library.tracks.count)
                            NavigationLink { AlbumsView() } label: {
                                LibraryLinkLabel(title: "Álbuns", symbol: "square.stack.fill", count: library.albums.count)
                            }
                            NavigationLink { ArtistsView() } label: {
                                LibraryLinkLabel(title: "Artistas", symbol: "music.mic", count: library.artists.count)
                            }
                            link(.favorites, count: library.tracks.filter(\.isFavorite).count)
                            link(.mostPlayed, count: nil)
                            link(.recentlyPlayed, count: nil)
                        }

                        Section("Adicionadas recentemente") {
                            ScrollView(.horizontal, showsIndicators: false) {
                                LazyHStack(alignment: .top, spacing: 14) {
                                    ForEach(recentAlbums) { album in
                                        NavigationLink { AlbumDetailView(albumID: album.id) } label: {
                                            AlbumCard(album: album).frame(width: 150)
                                        }
                                        .buttonStyle(.plain)
                                    }
                                }
                                .padding(.horizontal, 16)
                                .padding(.vertical, 4)
                            }
                            .listRowInsets(EdgeInsets())
                        }

                        Section {
                            Text("\(library.tracks.count) músicas · \(library.totalDuration.longDurationString)")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                                .frame(maxWidth: .infinity)
                                .listRowBackground(Color.clear)
                        }
                    }
                }
            }
            .navigationTitle("Biblioteca")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { router.showingImporter = true } label: { Image(systemName: "plus") }
                        .accessibilityLabel("Importar músicas")
                }
            }
        }
        .withMiniPlayer()
    }

    private var recentAlbums: [Album] {
        Array(library.albums
            .sorted { ($0.tracks.map(\.dateAdded).max() ?? .distantPast) > ($1.tracks.map(\.dateAdded).max() ?? .distantPast) }
            .prefix(12))
    }

    private func link(_ source: TrackSource, count: Int?) -> some View {
        NavigationLink { SongListView(source: source) } label: {
            LibraryLinkLabel(title: source.title, symbol: source.symbol, count: count)
        }
    }
}

struct LibraryLinkLabel: View {
    let title: String
    let symbol: String
    let count: Int?

    var body: some View {
        HStack {
            Label {
                Text(title)
            } icon: {
                Image(systemName: symbol).foregroundStyle(Theme.accent)
            }
            Spacer()
            if let count {
                Text("\(count)").foregroundStyle(.secondary)
            }
        }
        .font(.title3)
        .padding(.vertical, 4)
    }
}

struct EmptyLibraryView: View {
    @Environment(AppRouter.self) private var router

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                Image(systemName: "music.note.house.fill")
                    .font(.system(size: 64))
                    .foregroundStyle(Theme.accentGradient)
                    .padding(.top, 40)
                Text("Sua música, sem mensalidade")
                    .font(.title2.bold())
                    .multilineTextAlignment(.center)
                Text("Sem anúncios, sem conta e sem internet. Importe MP3, FLAC, M4A, WAV, AIFF ou AAC — arquivos soltos ou pastas inteiras.")
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
                Button { router.showingImporter = true } label: {
                    Label("Importar músicas", systemImage: "square.and.arrow.down")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)

                VStack(alignment: .leading, spacing: 14) {
                    tip("folder", "Do app Arquivos, iCloud Drive, Google Drive ou pendrive: toque em Importar.")
                    tip("laptopcomputer.and.iphone", "Do computador: conecte o iPhone, abra o Finder (ou iTunes) › Arquivos › Sonora e arraste as músicas.")
                    tip("square.and.arrow.up", "De outros apps: Compartilhar › Sonora.")
                }
                .padding()
                .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 16))
            }
            .padding(24)
        }
    }

    private func tip(_ symbol: String, _ text: String) -> some View {
        Label {
            Text(text).font(.subheadline)
        } icon: {
            Image(systemName: symbol).foregroundStyle(Theme.accent)
        }
    }
}

struct SongListView: View {
    @Environment(LibraryStore.self) private var library
    @Environment(PlayerController.self) private var player
    @AppStorage("songSort") private var sort: SongSort = .title
    let source: TrackSource

    var body: some View {
        let tracks = library.tracks(for: source, sort: sort)
        List {
            PlayShuffleHeader(tracks: tracks)
            ForEach(Array(tracks.enumerated()), id: \.element.id) { index, track in
                TrackRow(track: track)
                    .onTapGesture { player.play(tracks, startAt: index) }
                    .swipeActions(edge: .leading) {
                        Button { player.playNext(track) } label: {
                            Label("A seguir", systemImage: "text.line.first.and.arrowtriangle.forward")
                        }
                        .tint(Theme.accent)
                    }
            }
        }
        .listStyle(.plain)
        .overlay {
            if tracks.isEmpty {
                ContentUnavailableView(source.title, systemImage: source.symbol, description: Text("Nada por aqui ainda."))
            }
        }
        .navigationTitle(source.title)
        .toolbar {
            if source == .all {
                Menu {
                    Picker("Ordenar por", selection: $sort) {
                        ForEach(SongSort.allCases) { Text($0.label).tag($0) }
                    }
                } label: {
                    Image(systemName: "arrow.up.arrow.down")
                }
            }
        }
    }
}

struct AlbumCard: View {
    let album: Album

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            ArtworkView(track: album.tracks.first, cornerRadius: 10)
            Text(album.title).font(.subheadline.weight(.medium)).lineLimit(1)
            Text(album.artist).font(.caption).foregroundStyle(.secondary).lineLimit(1)
        }
    }
}

struct AlbumsView: View {
    @Environment(LibraryStore.self) private var library

    var body: some View {
        ScrollView {
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 16), GridItem(.flexible(), spacing: 16)], spacing: 20) {
                ForEach(library.albums) { album in
                    NavigationLink { AlbumDetailView(albumID: album.id) } label: {
                        AlbumCard(album: album)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding()
        }
        .navigationTitle("Álbuns")
    }
}

struct AlbumDetailView: View {
    @Environment(LibraryStore.self) private var library
    @Environment(PlayerController.self) private var player
    let albumID: String

    var body: some View {
        if let album = library.album(id: albumID) {
            List {
                VStack(spacing: 8) {
                    ArtworkView(track: album.tracks.first, size: 220, cornerRadius: 14)
                        .shadow(color: .black.opacity(0.2), radius: 16, y: 8)
                    Text(album.title).font(.title2.bold()).multilineTextAlignment(.center)
                    Text(album.artist).font(.title3).foregroundStyle(Theme.accent)
                    Text("\(album.tracks.count) músicas · \(album.tracks.reduce(0) { $0 + $1.duration }.longDurationString)")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity)
                .listRowSeparator(.hidden)

                PlayShuffleHeader(tracks: album.tracks)

                ForEach(Array(album.tracks.enumerated()), id: \.element.id) { index, track in
                    TrackRow(track: track, number: track.trackNumber ?? index + 1)
                        .onTapGesture { player.play(album.tracks, startAt: index) }
                }
            }
            .listStyle(.plain)
            .navigationBarTitleDisplayMode(.inline)
        } else {
            ContentUnavailableView("Álbum removido", systemImage: "square.stack")
        }
    }
}

struct ArtistsView: View {
    @Environment(LibraryStore.self) private var library

    var body: some View {
        List(library.artists) { artist in
            NavigationLink { SongListView(source: .artist(artist.name)) } label: {
                HStack(spacing: 12) {
                    ArtworkView(track: library.tracks.first { $0.artist == artist.name && $0.hasArtwork }
                        ?? library.tracks.first { $0.artist == artist.name }, size: 48, cornerRadius: 24)
                    VStack(alignment: .leading) {
                        Text(artist.name).lineLimit(1)
                        Text(artist.count == 1 ? "1 música" : "\(artist.count) músicas")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
        .listStyle(.plain)
        .navigationTitle("Artistas")
    }
}
