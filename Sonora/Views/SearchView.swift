import SwiftUI

struct SearchView: View {
    @Environment(LibraryStore.self) private var library
    @Environment(PlayerController.self) private var player
    @State private var query = ""

    var body: some View {
        NavigationStack {
            List {
                if let q = query.nonEmpty {
                    let songs = library.tracks(for: .all).filter {
                        $0.title.localizedStandardContains(q) || $0.artist.localizedStandardContains(q) || $0.album.localizedStandardContains(q)
                    }
                    let artists = library.artists.filter { $0.name.localizedStandardContains(q) }
                    let albums = library.albums.filter { $0.title.localizedStandardContains(q) || $0.artist.localizedStandardContains(q) }

                    if !artists.isEmpty {
                        Section("Artistas") {
                            ForEach(artists.prefix(5), id: \.name) { artist in
                                NavigationLink(artist.name) { SongListView(source: .artist(artist.name)) }
                            }
                        }
                    }
                    if !albums.isEmpty {
                        Section("Álbuns") {
                            ForEach(albums.prefix(5)) { album in
                                NavigationLink { AlbumDetailView(albumID: album.id) } label: {
                                    HStack(spacing: 12) {
                                        ArtworkView(track: album.tracks.first, size: 48, cornerRadius: 6)
                                        VStack(alignment: .leading) {
                                            Text(album.title).lineLimit(1)
                                            Text(album.artist).font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                                        }
                                    }
                                }
                            }
                        }
                    }
                    if !songs.isEmpty {
                        Section("Músicas") {
                            ForEach(Array(songs.enumerated()), id: \.element.id) { index, track in
                                TrackRow(track: track)
                                    .onTapGesture { player.play(songs, startAt: index) }
                            }
                        }
                    }
                    if songs.isEmpty && artists.isEmpty && albums.isEmpty {
                        ContentUnavailableView.search(text: q)
                            .listRowSeparator(.hidden)
                    }
                } else {
                    Section("Descobrir") {
                        Button {
                            player.play(library.tracks, shuffled: true)
                        } label: {
                            Label("Tocar tudo no aleatório", systemImage: "shuffle")
                        }
                        .disabled(library.tracks.isEmpty)
                        Button {
                            let forgotten = library.tracks.filter {
                                $0.lastPlayed.map { $0 < Date().addingTimeInterval(-30 * 86_400) } ?? true
                            }
                            player.play(forgotten.isEmpty ? library.tracks : forgotten, shuffled: true)
                        } label: {
                            Label("Redescobrir músicas esquecidas", systemImage: "sparkles")
                        }
                        .disabled(library.tracks.isEmpty)
                    }
                }
            }
            .navigationTitle("Buscar")
            .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Músicas, artistas, álbuns")
        }
        .withMiniPlayer()
    }
}
