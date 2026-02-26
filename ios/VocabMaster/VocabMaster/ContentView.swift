import SwiftUI

struct ContentView: View {
    @State private var selectedTab = 0

    var body: some View {
        TabView(selection: $selectedTab) {
            DictionaryView()
                .tabItem {
                    Image(systemName: "character.book.closed.fill")
                    Text("查词")
                }
                .tag(0)

            HistoryView()
                .tabItem {
                    Image(systemName: "books.vertical.fill")
                    Text("词汇本")
                }
                .tag(1)

            ReviewView()
                .tabItem {
                    Image(systemName: "brain.fill")
                    Text("复习")
                }
                .tag(2)
        }
        .tint(.purple)
    }
}
