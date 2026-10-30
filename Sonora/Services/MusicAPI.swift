import Foundation

enum MusicAPIError: LocalizedError {
    case http(Int)
    case missingJamendoKey
    case jamendo(String)

    var errorDescription: String? {
        switch self {
        case .http(let code): "O servidor respondeu com erro \(code)."
        case .missingJamendoKey: "Informe seu Client ID gratuito do Jamendo."
        case .jamendo(let message): "Jamendo: \(message)"
        }
    }
}

/// Clientes das APIs públicas. Só retornam músicas que os autores liberaram para download.
enum MusicAPI {
    private static let session: URLSession = {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        config.httpAdditionalHeaders = ["User-Agent": "Sonora/1.0 (iOS; player de música gratuito)"]
        return URLSession(configuration: config)
    }()

    private static func json(_ url: URL) async throws -> Any {
        let (data, response) = try await session.data(from: url)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw MusicAPIError.http(http.statusCode)
        }
        return try JSONSerialization.jsonObject(with: data)
    }

    // MARK: - Internet Archive

    /// Busca itens de áudio com licença livre. Consulta vazia lista os mais baixados.
    static func searchArchive(_ query: String) async throws -> [ArchiveItem] {
        let cleaned = query.unicodeScalars
            .filter { !"\\/:()[]{}\"^~*?!+-&|".unicodeScalars.contains($0) }
            .map(String.init).joined().trimmed
        var q = "mediatype:audio AND (licenseurl:*creativecommons* OR licenseurl:*publicdomain* OR collection:etree)"
        if !cleaned.isEmpty { q = "(\(cleaned)) AND \(q)" }

        var components = URLComponents(string: "https://archive.org/advancedsearch.php")!
        components.queryItems = [
            URLQueryItem(name: "q", value: q),
            URLQueryItem(name: "rows", value: "40"),
            URLQueryItem(name: "output", value: "json"),
            URLQueryItem(name: "sort[]", value: "downloads desc"),
        ] + ["identifier", "title", "creator", "year", "licenseurl", "collection"].map {
            URLQueryItem(name: "fl[]", value: $0)
        }

        let root = try await json(components.url!) as? [String: Any]
        let docs = (root?["response"] as? [String: Any])?["docs"] as? [[String: Any]] ?? []
        return docs.compactMap { doc -> ArchiveItem? in
            guard let id = string(doc["identifier"]) else { return nil }
            let collections = (doc["collection"] as? [String]) ?? [string(doc["collection"])].compactMap { $0 }
            let licenseURL = string(doc["licenseurl"])
            return ArchiveItem(
                id: id,
                title: string(doc["title"]) ?? id,
                creator: string(doc["creator"]) ?? "Artista desconhecido",
                year: string(doc["year"]),
                license: licenseURL == nil && collections.contains("etree")
                    ? "Live Music Archive (uso não comercial)"
                    : License.name(from: licenseURL),
                licenseURL: licenseURL.flatMap(URL.init(string:))
            )
        }
    }

    /// Faixas MP3 de um item do Internet Archive, na ordem do álbum.
    static func archiveTracks(_ item: ArchiveItem) async throws -> [OnlineTrack] {
        let root = try await json(URL(string: "https://archive.org/metadata/\(item.id)")!) as? [String: Any]
        let files = root?["files"] as? [[String: Any]] ?? []
        let metadata = root?["metadata"] as? [String: Any]
        let itemArtist = string(metadata?["creator"]) ?? item.creator

        var mp3s = files.filter { string($0["format"]) == "VBR MP3" }
        if mp3s.isEmpty {
            mp3s = files.filter { (string($0["format"]) ?? "").contains("MP3") }
        }

        let base = URL(string: "https://archive.org/download/\(item.id)/")!
        let tracks = mp3s.compactMap { file -> OnlineTrack? in
            guard let name = string(file["name"]) else { return nil }
            let url = base.appendingPathComponent(name)
            let number = string(file["track"]).flatMap { Int($0.split(separator: "/").first ?? "") }
            let fallbackTitle = ((name as NSString).lastPathComponent as NSString).deletingPathExtension
            return OnlineTrack(
                id: "ia:\(item.id)/\(name)",
                source: .internetArchive,
                title: string(file["title"]) ?? fallbackTitle,
                artist: string(file["creator"]) ?? string(file["artist"]) ?? itemArtist,
                album: string(file["album"]) ?? item.title,
                trackNumber: number,
                duration: string(file["length"]).flatMap(parseDuration),
                artworkURL: item.artworkURL,
                streamURL: url,
                downloadURL: url,
                license: item.license,
                licenseURL: item.licenseURL,
                pageURL: item.pageURL
            )
        }
        return tracks.sorted {
            switch ($0.trackNumber, $1.trackNumber) {
            case let (a?, b?) where a != b: return a < b
            default: return $0.downloadURL.path.localizedStandardCompare($1.downloadURL.path) == .orderedAscending
            }
        }
    }

    // MARK: - ccMixter

    static func searchCCMixter(_ query: String) async throws -> [OnlineTrack] {
        var components = URLComponents(string: "https://ccmixter.org/api/query")!
        components.queryItems = [
            URLQueryItem(name: "f", value: "json"),
            URLQueryItem(name: "limit", value: "40"),
            URLQueryItem(name: "sort", value: "rank"),
        ]
        if let q = query.nonEmpty {
            components.queryItems! += [
                URLQueryItem(name: "search", value: q.trimmed),
                URLQueryItem(name: "search_type", value: "all"),
            ]
        }

        let uploads = try await json(components.url!) as? [[String: Any]] ?? []
        return uploads.compactMap { upload -> OnlineTrack? in
            let files = upload["files"] as? [[String: Any]] ?? []
            guard let file = files.first(where: {
                let info = $0["file_format_info"] as? [String: Any]
                return string(info?["mime_type"]) == "audio/mpeg"
            }),
                let download = string(file["download_url"]).flatMap(URL.init(string:)),
                let id = string(upload["upload_id"])
            else { return nil }
            let info = file["file_format_info"] as? [String: Any]
            let licenseURL = string(upload["license_url"])
            return OnlineTrack(
                id: "ccm:\(id)",
                source: .ccMixter,
                title: string(upload["upload_name"]) ?? "Sem título",
                artist: string(upload["user_real_name"]).nonEmpty ?? string(upload["user_name"]) ?? "Artista desconhecido",
                album: "ccMixter",
                duration: string(info?["ps"]).flatMap(parseDuration),
                artworkURL: nil,
                streamURL: download,
                downloadURL: download,
                license: License.name(from: licenseURL),
                licenseURL: licenseURL.flatMap(URL.init(string:)),
                pageURL: string(upload["file_page_url"]).flatMap(URL.init(string:))
            )
        }
    }

    // MARK: - Jamendo

    /// Requer um Client ID gratuito (https://devportal.jamendo.com).
    static func searchJamendo(_ query: String, clientID: String) async throws -> [OnlineTrack] {
        guard let clientID = clientID.nonEmpty else { throw MusicAPIError.missingJamendoKey }
        var components = URLComponents(string: "https://api.jamendo.com/v3.0/tracks/")!
        components.queryItems = [
            URLQueryItem(name: "client_id", value: clientID.trimmed),
            URLQueryItem(name: "format", value: "json"),
            URLQueryItem(name: "limit", value: "40"),
            URLQueryItem(name: "audioformat", value: "mp32"),
            URLQueryItem(name: "audiodlformat", value: "mp32"),
            URLQueryItem(name: "imagesize", value: "300"),
            URLQueryItem(name: "order", value: "popularity_total"),
        ]
        if let q = query.nonEmpty {
            components.queryItems!.append(URLQueryItem(name: "search", value: q.trimmed))
        }

        let root = try await json(components.url!) as? [String: Any]
        let headers = root?["headers"] as? [String: Any]
        if string(headers?["status"]) == "failed" {
            throw MusicAPIError.jamendo(string(headers?["error_message"]) ?? "erro desconhecido")
        }
        let results = root?["results"] as? [[String: Any]] ?? []
        return results.compactMap { item -> OnlineTrack? in
            guard (item["audiodownload_allowed"] as? Bool) ?? false,
                  let id = string(item["id"]),
                  let download = string(item["audiodownload"]).flatMap(URL.init(string:)),
                  let stream = string(item["audio"]).flatMap(URL.init(string:))
            else { return nil }
            let licenseURL = string(item["license_ccurl"])
            return OnlineTrack(
                id: "jam:\(id)",
                source: .jamendo,
                title: string(item["name"]) ?? "Sem título",
                artist: string(item["artist_name"]) ?? "Artista desconhecido",
                album: string(item["album_name"]).nonEmpty ?? "Jamendo",
                trackNumber: string(item["position"]).flatMap { Int($0) },
                duration: string(item["duration"]).flatMap(Double.init),
                artworkURL: string(item["image"]).flatMap(URL.init(string:)),
                streamURL: stream,
                downloadURL: download,
                license: License.name(from: licenseURL),
                licenseURL: licenseURL.flatMap(URL.init(string:)),
                pageURL: string(item["shareurl"]).flatMap(URL.init(string:))
            )
        }
    }

    // MARK: - Utilidades

    /// Aceita texto, número ou lista (usa o primeiro item), como as APIs devolvem.
    private static func string(_ value: Any?) -> String? {
        switch value {
        case let s as String: return s.nonEmpty
        case let n as NSNumber: return n.stringValue
        case let list as [Any]: return list.lazy.compactMap { string($0) }.first
        default: return nil
        }
    }

    /// "278.88", "4:56" ou "1:02:03" → segundos.
    static func parseDuration(_ text: String) -> Double? {
        if let seconds = Double(text) { return seconds }
        let parts = text.split(separator: ":").compactMap { Double($0) }
        guard !parts.isEmpty else { return nil }
        return parts.reduce(0) { $0 * 60 + $1 }
    }
}
