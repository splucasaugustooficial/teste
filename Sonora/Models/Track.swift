import Foundation

struct Track: Identifiable, Codable, Hashable {
    var id: UUID = UUID()
    var fileName: String
    var title: String
    var artist: String
    var album: String
    var trackNumber: Int?
    var duration: Double
    var hasArtwork: Bool
    var dateAdded: Date = .now
    var playCount: Int = 0
    var lastPlayed: Date?
    var isFavorite: Bool = false

    var fileURL: URL { LibraryStore.musicDirectory.appendingPathComponent(fileName) }

    var artworkURL: URL? {
        hasArtwork ? LibraryStore.artworkDirectory.appendingPathComponent("\(id.uuidString).jpg") : nil
    }
}

struct Playlist: Identifiable, Codable, Hashable {
    var id: UUID = UUID()
    var name: String
    var trackIDs: [UUID] = []
    var createdAt: Date = .now
}

struct Album: Identifiable, Hashable {
    var title: String
    var artist: String
    var tracks: [Track]

    var id: String { "\(artist)\u{1F}\(title)" }
}

struct ArtistInfo: Identifiable, Hashable {
    var name: String
    var count: Int

    var id: String { name }
}

enum TrackSource: Hashable {
    case all, favorites, mostPlayed, recentlyAdded, recentlyPlayed
    case artist(String)

    var title: String {
        switch self {
        case .all: "Músicas"
        case .favorites: "Favoritas"
        case .mostPlayed: "Mais tocadas"
        case .recentlyAdded: "Adicionadas recentemente"
        case .recentlyPlayed: "Tocadas recentemente"
        case .artist(let name): name
        }
    }

    var symbol: String {
        switch self {
        case .all: "music.note"
        case .favorites: "heart.fill"
        case .mostPlayed: "flame.fill"
        case .recentlyAdded: "clock.badge.plus"
        case .recentlyPlayed: "clock.arrow.circlepath"
        case .artist: "music.mic"
        }
    }
}

enum SongSort: String, CaseIterable, Identifiable {
    case title, artist, album, dateAdded

    var id: String { rawValue }

    var label: String {
        switch self {
        case .title: "Título"
        case .artist: "Artista"
        case .album: "Álbum"
        case .dateAdded: "Mais recentes"
        }
    }
}

enum RepeatMode: Int {
    case off, all, one

    var next: RepeatMode {
        switch self {
        case .off: .all
        case .all: .one
        case .one: .off
        }
    }

    var symbol: String { self == .one ? "repeat.1" : "repeat" }
}

struct EQPreset: Identifiable {
    let name: String
    let gains: [Float]

    var id: String { name }

    static let all: [EQPreset] = [
        EQPreset(name: "Plano", gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
        EQPreset(name: "Graves+", gains: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0]),
        EQPreset(name: "Agudos+", gains: [0, 0, 0, 0, 0, 1, 2, 4, 5, 6]),
        EQPreset(name: "Rock", gains: [5, 4, 3, 1, -1, -1, 1, 3, 4, 5]),
        EQPreset(name: "Pop", gains: [-1, 0, 2, 4, 5, 4, 2, 0, -1, -1]),
        EQPreset(name: "Vocal", gains: [-2, -2, -1, 1, 3, 4, 4, 2, 0, -1]),
        EQPreset(name: "Jazz", gains: [3, 2, 1, 2, -1, -1, 0, 1, 2, 3]),
        EQPreset(name: "Eletrônica", gains: [6, 5, 2, 0, -2, 1, 0, 2, 4, 5]),
        EQPreset(name: "Hip-Hop", gains: [6, 5, 2, 3, -1, -1, 1, 0, 2, 3]),
        EQPreset(name: "Clássica", gains: [4, 3, 2, 1, 0, 0, 0, 2, 3, 4]),
        EQPreset(name: "Acústico", gains: [3, 3, 2, 1, 2, 2, 3, 3, 2, 1]),
        EQPreset(name: "Noturno", gains: [-3, -2, 0, 1, 2, 2, 1, 0, -2, -4]),
    ]
}

extension Double {
    /// Formata segundos como m:ss (ou h:mm:ss).
    var timeString: String {
        guard isFinite, self > 0 else { return "0:00" }
        let total = Int(self.rounded(.down))
        let h = total / 3600, m = (total % 3600) / 60, s = total % 60
        return h > 0 ? String(format: "%d:%02d:%02d", h, m, s) : String(format: "%d:%02d", m, s)
    }

    var longDurationString: String {
        let minutes = Int(self / 60)
        if minutes < 60 { return "\(minutes) min" }
        return "\(minutes / 60) h \(minutes % 60) min"
    }
}
