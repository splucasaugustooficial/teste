import AVFoundation
import Foundation
import Observation
import UIKit

/// Biblioteca local: arquivos de áudio, metadados, playlists e estatísticas.
@Observable
@MainActor
final class LibraryStore {
    private(set) var tracks: [Track] = []
    private(set) var playlists: [Playlist] = []
    private(set) var importStatus: String?
    var toast: String?

    static let audioExtensions: Set<String> = [
        "mp3", "m4a", "m4b", "aac", "wav", "aif", "aiff", "aifc", "flac", "caf", "mp4",
    ]

    nonisolated static var documentsDirectory: URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
    }

    nonisolated static var libraryRoot: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Sonora", isDirectory: true)
    }

    nonisolated static var musicDirectory: URL { libraryRoot.appendingPathComponent("Music", isDirectory: true) }
    nonisolated static var artworkDirectory: URL { libraryRoot.appendingPathComponent("Artwork", isDirectory: true) }
    nonisolated static var databaseURL: URL { libraryRoot.appendingPathComponent("library.json") }

    private struct Database: Codable {
        var tracks: [Track]
        var playlists: [Playlist]
    }

    init() {
        let fm = FileManager.default
        try? fm.createDirectory(at: Self.musicDirectory, withIntermediateDirectories: true)
        try? fm.createDirectory(at: Self.artworkDirectory, withIntermediateDirectories: true)
        if let data = try? Data(contentsOf: Self.databaseURL),
           let db = try? JSONDecoder().decode(Database.self, from: data) {
            tracks = db.tracks.filter { fm.fileExists(atPath: $0.fileURL.path) }
            playlists = db.playlists
        }
    }

    private func save() {
        let db = Database(tracks: tracks, playlists: playlists)
        guard let data = try? JSONEncoder().encode(db) else { return }
        try? data.write(to: Self.databaseURL, options: .atomic)
    }

    // MARK: - Importação

    /// Importa arquivos ou pastas escolhidos no app Arquivos (iCloud Drive, Google Drive, pendrive...).
    func importFiles(_ urls: [URL]) async {
        var added = 0, skipped = 0
        for url in urls {
            let scoped = url.startAccessingSecurityScopedResource()
            let files = Self.audioFiles(in: url)
            for (offset, file) in files.enumerated() {
                importStatus = "Importando \(offset + 1) de \(files.count)…"
                if await addFile(at: file, move: false) { added += 1 } else { skipped += 1 }
            }
            if scoped { url.stopAccessingSecurityScopedResource() }
            if url.path.contains("/Inbox/") { try? FileManager.default.removeItem(at: url) }
        }
        finishImport(added: added, skipped: skipped)
    }

    /// Move para a biblioteca as músicas copiadas para a pasta do app (Arquivos ou Finder/iTunes no computador).
    func scanDocumentsFolder() async {
        let items = (try? FileManager.default.contentsOfDirectory(
            at: Self.documentsDirectory, includingPropertiesForKeys: nil, options: [.skipsHiddenFiles]
        )) ?? []
        let files = items.flatMap { Self.audioFiles(in: $0) }
        guard !files.isEmpty else { return }
        var added = 0, skipped = 0
        for (offset, file) in files.enumerated() {
            importStatus = "Importando \(offset + 1) de \(files.count)…"
            if await addFile(at: file, move: true) { added += 1 } else { skipped += 1 }
        }
        finishImport(added: added, skipped: skipped)
    }

    private func finishImport(added: Int, skipped: Int) {
        importStatus = nil
        save()
        var message = added == 1 ? "1 música importada" : "\(added) músicas importadas"
        if skipped > 0 { message += " · \(skipped) ignorada(s)" }
        toast = message
    }

    private static func audioFiles(in url: URL) -> [URL] {
        var isDirectory: ObjCBool = false
        guard FileManager.default.fileExists(atPath: url.path, isDirectory: &isDirectory) else { return [] }
        guard isDirectory.boolValue else {
            return audioExtensions.contains(url.pathExtension.lowercased()) ? [url] : []
        }
        let enumerator = FileManager.default.enumerator(
            at: url, includingPropertiesForKeys: nil, options: [.skipsHiddenFiles]
        )
        let urls = (enumerator?.allObjects as? [URL]) ?? []
        return urls
            .filter { audioExtensions.contains($0.pathExtension.lowercased()) }
            .sorted { $0.path.localizedStandardCompare($1.path) == .orderedAscending }
    }

    private func addFile(at source: URL, move: Bool) async -> Bool {
        let fm = FileManager.default
        // Só aceita o que o motor de áudio consegue realmente tocar.
        guard let audioFile = try? AVAudioFile(forReading: source) else { return false }
        let meta = await MetadataReader.read(url: source)
        let fileDuration = Double(audioFile.length) / audioFile.processingFormat.sampleRate
        let duration = meta.duration > 0 ? meta.duration : fileDuration

        let fallbackTitle = source.deletingPathExtension().lastPathComponent
        let title = meta.title.nonEmpty ?? fallbackTitle
        let artist = meta.artist.nonEmpty ?? "Artista desconhecido"
        let album = meta.album.nonEmpty ?? "Álbum desconhecido"

        let isDuplicate = tracks.contains {
            $0.title == title && $0.artist == artist && abs($0.duration - duration) < 1.5
        }
        if isDuplicate {
            if move { try? fm.removeItem(at: source) }
            return false
        }

        let id = UUID()
        let fileName = "\(id.uuidString).\(source.pathExtension.lowercased())"
        let destination = Self.musicDirectory.appendingPathComponent(fileName)
        do {
            if move {
                try fm.moveItem(at: source, to: destination)
            } else {
                try fm.copyItem(at: source, to: destination)
            }
        } catch {
            return false
        }

        var hasArtwork = false
        if let data = meta.artwork, let image = UIImage(data: data) {
            let scale = min(1, 600 / max(image.size.width, image.size.height, 1))
            let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
            let resized = image.preparingThumbnail(of: size) ?? image
            if let jpeg = resized.jpegData(compressionQuality: 0.85) {
                let url = Self.artworkDirectory.appendingPathComponent("\(id.uuidString).jpg")
                hasArtwork = (try? jpeg.write(to: url, options: .atomic)) != nil
            }
        }

        tracks.append(Track(
            id: id,
            fileName: fileName,
            title: title,
            artist: artist,
            album: album,
            trackNumber: (meta.trackNumber ?? 0) > 0 ? meta.trackNumber : nil,
            duration: duration,
            hasArtwork: hasArtwork
        ))
        return true
    }

    // MARK: - Faixas

    func track(id: UUID) -> Track? { tracks.first { $0.id == id } }

    func toggleFavorite(_ id: UUID) {
        guard let i = tracks.firstIndex(where: { $0.id == id }) else { return }
        tracks[i].isFavorite.toggle()
        save()
    }

    func registerPlay(_ id: UUID) {
        guard let i = tracks.firstIndex(where: { $0.id == id }) else { return }
        tracks[i].playCount += 1
        tracks[i].lastPlayed = .now
        save()
    }

    func updateInfo(_ id: UUID, title: String, artist: String, album: String) {
        guard let i = tracks.firstIndex(where: { $0.id == id }) else { return }
        tracks[i].title = title.trimmed.nonEmpty ?? tracks[i].title
        tracks[i].artist = artist.trimmed.nonEmpty ?? "Artista desconhecido"
        tracks[i].album = album.trimmed.nonEmpty ?? "Álbum desconhecido"
        save()
    }

    func delete(_ id: UUID) {
        guard let i = tracks.firstIndex(where: { $0.id == id }) else { return }
        let track = tracks.remove(at: i)
        try? FileManager.default.removeItem(at: track.fileURL)
        if let art = track.artworkURL { try? FileManager.default.removeItem(at: art) }
        ArtworkCache.remove(track.id)
        for p in playlists.indices { playlists[p].trackIDs.removeAll { $0 == id } }
        save()
    }

    // MARK: - Coleções

    func tracks(for source: TrackSource, sort: SongSort = .title) -> [Track] {
        switch source {
        case .all:
            return sorted(tracks, by: sort)
        case .favorites:
            return sorted(tracks.filter(\.isFavorite), by: .title)
        case .mostPlayed:
            return Array(tracks.filter { $0.playCount > 0 }.sorted { $0.playCount > $1.playCount }.prefix(100))
        case .recentlyAdded:
            return Array(tracks.sorted { $0.dateAdded > $1.dateAdded }.prefix(100))
        case .recentlyPlayed:
            return Array(tracks.filter { $0.lastPlayed != nil }
                .sorted { ($0.lastPlayed ?? .distantPast) > ($1.lastPlayed ?? .distantPast) }
                .prefix(100))
        case .artist(let name):
            return tracks.filter { $0.artist == name }.sorted {
                if $0.album != $1.album { return $0.album.localizedStandardCompare($1.album) == .orderedAscending }
                return Self.albumOrder($0, $1)
            }
        }
    }

    private func sorted(_ list: [Track], by sort: SongSort) -> [Track] {
        switch sort {
        case .title: list.sorted { $0.title.localizedStandardCompare($1.title) == .orderedAscending }
        case .artist: list.sorted { $0.artist.localizedStandardCompare($1.artist) == .orderedAscending }
        case .album: list.sorted { $0.album.localizedStandardCompare($1.album) == .orderedAscending }
        case .dateAdded: list.sorted { $0.dateAdded > $1.dateAdded }
        }
    }

    private static func albumOrder(_ a: Track, _ b: Track) -> Bool {
        switch (a.trackNumber, b.trackNumber) {
        case let (x?, y?) where x != y: return x < y
        case (_?, nil): return true
        case (nil, _?): return false
        default: return a.title.localizedStandardCompare(b.title) == .orderedAscending
        }
    }

    var albums: [Album] {
        Dictionary(grouping: tracks) { "\($0.artist)\u{1F}\($0.album)" }
            .values
            .map { group in
                Album(title: group[0].album, artist: group[0].artist, tracks: group.sorted(by: Self.albumOrder))
            }
            .sorted { $0.title.localizedStandardCompare($1.title) == .orderedAscending }
    }

    func album(id: String) -> Album? { albums.first { $0.id == id } }

    var artists: [(name: String, count: Int)] {
        Dictionary(grouping: tracks, by: \.artist)
            .map { (name: $0.key, count: $0.value.count) }
            .sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
    }

    var totalDuration: Double { tracks.reduce(0) { $0 + $1.duration } }

    // MARK: - Playlists

    @discardableResult
    func createPlaylist(named name: String, trackIDs: [UUID] = []) -> Playlist {
        let playlist = Playlist(name: name.trimmed.nonEmpty ?? "Nova playlist", trackIDs: trackIDs)
        playlists.append(playlist)
        save()
        return playlist
    }

    func renamePlaylist(_ id: UUID, to name: String) {
        guard let i = playlists.firstIndex(where: { $0.id == id }), let name = name.trimmed.nonEmpty else { return }
        playlists[i].name = name
        save()
    }

    func deletePlaylist(_ id: UUID) {
        playlists.removeAll { $0.id == id }
        save()
    }

    func add(_ trackIDs: [UUID], to playlistID: UUID) {
        guard let i = playlists.firstIndex(where: { $0.id == playlistID }) else { return }
        playlists[i].trackIDs.append(contentsOf: trackIDs)
        save()
        toast = "Adicionado a \(playlists[i].name)"
    }

    func removeTracks(at offsets: IndexSet, from playlistID: UUID) {
        guard let i = playlists.firstIndex(where: { $0.id == playlistID }) else { return }
        playlists[i].trackIDs.remove(atOffsets: offsets)
        save()
    }

    func moveTracks(from source: IndexSet, to destination: Int, in playlistID: UUID) {
        guard let i = playlists.firstIndex(where: { $0.id == playlistID }) else { return }
        playlists[i].trackIDs.move(fromOffsets: source, toOffset: destination)
        save()
    }

    func playlist(id: UUID) -> Playlist? { playlists.first { $0.id == id } }

    func tracks(in playlist: Playlist) -> [Track] {
        let byID = Dictionary(tracks.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        return playlist.trackIDs.compactMap { byID[$0] }
    }
}

extension String {
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
    var nonEmpty: String? { trimmed.isEmpty ? nil : self }
}

extension Optional where Wrapped == String {
    var nonEmpty: String? { self?.trimmed.nonEmpty }
}
