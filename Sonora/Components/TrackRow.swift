import SwiftUI

struct TrackRow: View {
    @Environment(PlayerController.self) private var player
    let track: Track
    var number: Int?

    var body: some View {
        let isCurrent = player.currentTrack?.id == track.id
        HStack(spacing: 12) {
            if let number {
                Text("\(number)")
                    .font(.subheadline.monospacedDigit())
                    .foregroundStyle(.secondary)
                    .frame(width: 24)
            } else {
                ArtworkView(track: track, size: 48, cornerRadius: 6)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(track.title)
                    .font(.body)
                    .foregroundStyle(isCurrent ? Theme.accent : .primary)
                    .lineLimit(1)
                Text(number == nil ? "\(track.artist) · \(track.album)" : track.artist)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            if isCurrent && player.isPlaying {
                Image(systemName: "waveform")
                    .symbolEffect(.variableColor.iterative, options: .repeating)
                    .foregroundStyle(Theme.accent)
            } else if track.isFavorite {
                Image(systemName: "heart.fill").font(.caption).foregroundStyle(Theme.accent)
            }
            Text(track.duration.timeString)
                .font(.caption.monospacedDigit())
                .foregroundStyle(.secondary)
        }
        .contentShape(Rectangle())
        .contextMenu { TrackMenuItems(track: track) }
    }
}

/// Ações de uma faixa, usadas em menus de contexto e no player.
struct TrackMenuItems: View {
    @Environment(LibraryStore.self) private var library
    @Environment(PlayerController.self) private var player
    @Environment(AppRouter.self) private var router
    let track: Track
    /// Dentro de uma folha (player) não dá para abrir outras folhas a partir da raiz.
    var insideSheet = false

    var body: some View {
        let isFavorite = library.track(id: track.id)?.isFavorite ?? false
        Button { player.playNext(track) } label: { Label("Tocar a seguir", systemImage: "text.line.first.and.arrowtriangle.forward") }
        Button { player.addToQueue(track) } label: { Label("Adicionar à fila", systemImage: "text.line.last.and.arrowtriangle.forward") }
        Button {
            library.toggleFavorite(track.id)
            player.refresh(from: library)
        } label: {
            Label(isFavorite ? "Remover das favoritas" : "Favoritar", systemImage: isFavorite ? "heart.slash" : "heart")
        }
        Menu {
            if !insideSheet {
                Button { router.tracksForNewPlaylist = [track] } label: { Label("Nova playlist…", systemImage: "plus") }
            }
            ForEach(library.playlists) { playlist in
                Button(playlist.name) { library.add([track.id], to: playlist.id) }
            }
        } label: {
            Label("Adicionar à playlist", systemImage: "music.note.list")
        }
        if !insideSheet {
            Divider()
            Button { router.editingTrack = track } label: { Label("Editar informações", systemImage: "pencil") }
            Button(role: .destructive) { router.trackPendingDelete = track } label: { Label("Apagar", systemImage: "trash") }
        }
    }
}

/// Botões "Tocar" e "Aleatório" no topo das listas.
struct PlayShuffleHeader: View {
    @Environment(PlayerController.self) private var player
    let tracks: [Track]

    var body: some View {
        HStack(spacing: 12) {
            Button { player.play(tracks) } label: {
                Label("Tocar", systemImage: "play.fill").frame(maxWidth: .infinity)
            }
            Button { player.play(tracks, shuffled: true) } label: {
                Label("Aleatório", systemImage: "shuffle").frame(maxWidth: .infinity)
            }
        }
        .font(.headline)
        .buttonStyle(.bordered)
        .controlSize(.large)
        .disabled(tracks.isEmpty)
        .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
        .listRowSeparator(.hidden)
    }
}
