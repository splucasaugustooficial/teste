import AVFoundation

/// Lê título, artista, álbum, faixa, duração e capa de um arquivo de áudio.
enum MetadataReader {
    struct Result {
        var title: String?
        var artist: String?
        var album: String?
        var trackNumber: Int?
        var duration: Double = 0
        var artwork: Data?
    }

    static func read(url: URL) async -> Result {
        let asset = AVURLAsset(url: url)
        var result = Result()

        if let duration = try? await asset.load(.duration), duration.isNumeric {
            result.duration = duration.seconds
        }

        if let items = try? await asset.load(.commonMetadata) {
            for item in items {
                guard let key = item.commonKey else { continue }
                switch key {
                case .commonKeyTitle:
                    result.title = try? await item.load(.stringValue)
                case .commonKeyArtist:
                    result.artist = try? await item.load(.stringValue)
                case .commonKeyAlbumName:
                    result.album = try? await item.load(.stringValue)
                case .commonKeyArtwork:
                    if result.artwork == nil {
                        result.artwork = try? await item.load(.dataValue)
                    }
                default:
                    break
                }
            }
        }

        if let items = try? await asset.load(.metadata) {
            for item in items {
                if item.identifier == .id3MetadataTrackNumber,
                   let value = try? await item.load(.stringValue),
                   let number = Int(value.split(separator: "/").first ?? "") {
                    result.trackNumber = number
                } else if item.identifier == .iTunesMetadataTrackNumber,
                          let data = try? await item.load(.dataValue), data.count >= 4 {
                    let bytes = [UInt8](data)
                    result.trackNumber = Int(bytes[2]) << 8 | Int(bytes[3])
                }
            }
        }

        return result
    }
}
