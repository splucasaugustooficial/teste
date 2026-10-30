import Foundation

/// Catálogos com músicas liberadas para download gratuito (Creative Commons ou domínio público).
enum OnlineSource: String, CaseIterable, Identifiable {
    case internetArchive, jamendo

    var id: String { rawValue }

    var name: String {
        switch self {
        case .internetArchive: "Internet Archive"
        case .jamendo: "Jamendo"
        }
    }

    var about: String {
        switch self {
        case .internetArchive:
            "Quase 200 mil álbuns de netlabels em Creative Commons, discos em domínio público e shows da Live Music Archive (bandas que liberam gravações ao vivo)."
        case .jamendo:
            "Jamendo: mais de 600 mil músicas de artistas independentes, liberadas pelos próprios autores."
        }
    }

    var website: URL {
        switch self {
        case .internetArchive: URL(string: "https://archive.org/details/audio")!
        case .jamendo: URL(string: "https://www.jamendo.com")!
        }
    }
}

/// Uma faixa disponível para ouvir e baixar.
struct OnlineTrack: Identifiable, Hashable {
    var id: String
    var source: OnlineSource
    var title: String
    var artist: String
    var album: String
    var trackNumber: Int?
    var duration: Double?
    var artworkURL: URL?
    var streamURL: URL
    var downloadURL: URL
    var license: String
    var licenseURL: URL?
    var pageURL: URL?
}

/// Um item do Internet Archive (normalmente um álbum ou um show).
struct ArchiveItem: Identifiable, Hashable {
    var id: String
    var title: String
    var creator: String
    var year: String?
    var license: String
    var licenseURL: URL?

    var artworkURL: URL? { URL(string: "https://archive.org/services/img/\(id)") }
    var pageURL: URL? { URL(string: "https://archive.org/details/\(id)") }
}

enum License {
    /// "http://creativecommons.org/licenses/by-nc/3.0/" → "CC BY-NC 3.0".
    static func name(from url: String?) -> String {
        guard let url, !url.isEmpty else { return "Livre para compartilhar" }
        let lower = url.lowercased()
        if lower.contains("publicdomain") { return "Domínio público" }
        guard lower.contains("creativecommons.org/licenses/") else { return "Licença livre" }
        let parts = lower.components(separatedBy: "/licenses/").last?
            .split(separator: "/").map(String.init) ?? []
        guard let kind = parts.first else { return "Creative Commons" }
        let version = parts.count > 1 ? " \(parts[1])" : ""
        return "CC \(kind.uppercased())\(version)"
    }
}
