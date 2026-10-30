import Observation
import SwiftUI

@main
struct SonoraApp: App {
    @State private var library = LibraryStore()
    @State private var player = PlayerController()
    @State private var router = AppRouter()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(library)
                .environment(player)
                .environment(router)
                .tint(Theme.accent)
                .onAppear {
                    let library = library
                    player.onTrackStarted = { track in library.registerPlay(track.id) }
                }
                .onOpenURL { url in
                    Task { await library.importFiles([url]) }
                }
                .onChange(of: scenePhase, initial: true) { _, phase in
                    if phase == .active {
                        Task { await library.scanDocumentsFolder() }
                    }
                }
        }
    }
}

/// Estado de navegação compartilhado: folhas e diálogos abertos a partir de qualquer lista.
@Observable
@MainActor
final class AppRouter {
    var showingImporter = false
    var editingTrack: Track?
    var trackPendingDelete: Track?
    var tracksForNewPlaylist: [Track]?
}

enum Theme {
    static let accent = Color(red: 1.0, green: 0.27, blue: 0.42)
    static let accentGradient = LinearGradient(
        colors: [Color(red: 1.0, green: 0.27, blue: 0.42), Color(red: 1.0, green: 0.55, blue: 0.25)],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )
}
