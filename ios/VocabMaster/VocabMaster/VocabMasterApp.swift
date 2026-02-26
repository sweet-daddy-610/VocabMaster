import SwiftUI

@main
struct VocabMasterApp: App {
    @StateObject private var store = VocabStore()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(store)
                .preferredColorScheme(.dark)
        }
    }
}
