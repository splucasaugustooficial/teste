import SwiftUI
import UIKit

enum ArtworkCache {
    private static let cache: NSCache<NSString, UIImage> = {
        let cache = NSCache<NSString, UIImage>()
        cache.countLimit = 300
        return cache
    }()

    static func image(for track: Track?) -> UIImage? {
        guard let track, let url = track.artworkURL else { return nil }
        let key = track.id.uuidString as NSString
        if let cached = cache.object(forKey: key) { return cached }
        guard let image = UIImage(contentsOfFile: url.path) else { return nil }
        cache.setObject(image, forKey: key)
        return image
    }

    static func remove(_ id: UUID) {
        cache.removeObject(forKey: id.uuidString as NSString)
    }
}

/// Capa do álbum, com um degradê gerado a partir do nome quando o arquivo não tem capa.
struct ArtworkView: View {
    let track: Track?
    var size: CGFloat?
    var cornerRadius: CGFloat = 8

    var body: some View {
        Color.clear
            .frame(width: size, height: size)
            .aspectRatio(1, contentMode: .fit)
            .overlay {
                if let image = ArtworkCache.image(for: track) {
                    Image(uiImage: image).resizable().scaledToFill()
                } else {
                    placeholder
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
    }

    private var placeholder: some View {
        let seed = (track?.album ?? "").unicodeScalars.reduce(0) { ($0 &* 31 &+ Int($1.value)) & 0xFFFF }
        let hue = Double(seed % 360) / 360
        return LinearGradient(
            colors: [Color(hue: hue, saturation: 0.55, brightness: 0.85),
                     Color(hue: (hue + 0.12).truncatingRemainder(dividingBy: 1), saturation: 0.65, brightness: 0.55)],
            startPoint: .topLeading, endPoint: .bottomTrailing
        )
        .overlay {
            GeometryReader { geo in
                Image(systemName: "music.note")
                    .font(.system(size: geo.size.width * 0.38, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.85))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
    }
}
