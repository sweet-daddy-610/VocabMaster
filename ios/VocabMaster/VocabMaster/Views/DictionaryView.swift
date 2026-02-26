import SwiftUI
import AVFoundation

struct DictionaryView: View {
    @EnvironmentObject var store: VocabStore
    @State private var searchText = ""
    @State private var isSearching = false
    @State private var result: LookupResult?
    @State private var errorMessage: String?
    @State private var showSavedToast = false

    private let dictService = DictionaryService()

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    searchBar

                    if isSearching {
                        loadingView
                    } else if let error = errorMessage {
                        errorView(error)
                    } else if let result = result, let data = result.dictData {
                        WordResultView(
                            entry: data,
                            translation: result.translation,
                            inputType: result.inputType,
                            source: result.source,
                            isSaved: store.getWord(data.word) != nil
                        )
                    } else {
                        welcomeView
                    }
                }
                .padding()
            }
            .background(Color(hex: "0f0f23"))
            .navigationTitle("VocabMaster")
            .navigationBarTitleDisplayMode(.inline)
            .overlay(alignment: .bottom) {
                if showSavedToast {
                    toastView
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
        }
    }

    // MARK: - Search Bar

    private var searchBar: some View {
        HStack(spacing: 12) {
            Image(systemName: "magnifyingglass")
                .foregroundColor(.gray)

            TextField("输入单词、短语或中文...", text: $searchText)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(.search)
                .onSubmit { performSearch() }

            if !searchText.isEmpty {
                Button { searchText = "" } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundColor(.gray)
                }
            }
        }
        .padding(14)
        .background(Color(hex: "1e1e3c").opacity(0.8))
        .cornerRadius(14)
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(Color.purple.opacity(0.3), lineWidth: 1)
        )
    }

    // MARK: - Welcome View

    private var welcomeView: some View {
        VStack(spacing: 16) {
            Text("🌟")
                .font(.system(size: 50))
                .padding(.top, 40)

            Text("开启你的英语词汇之旅")
                .font(.title2).bold()
                .foregroundColor(.white)

            Text("输入英文单词、短语或中文\n获取中英双语释义")
                .font(.subheadline)
                .foregroundColor(.gray)
                .multilineTextAlignment(.center)

            // Quick words
            HStack(spacing: 10) {
                quickWordButton("serendipity")
                quickWordButton("resilient")
                quickWordButton("你好")
            }
            .padding(.top, 8)
        }
    }

    private func quickWordButton(_ word: String) -> some View {
        Button {
            searchText = word
            performSearch()
        } label: {
            Text(word)
                .font(.caption)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(Color.purple.opacity(0.15))
                .foregroundColor(.purple)
                .cornerRadius(20)
        }
    }

    // MARK: - States

    private var loadingView: some View {
        VStack(spacing: 12) {
            ProgressView()
                .scaleEffect(1.2)
                .tint(.purple)
            Text("查询中...")
                .font(.subheadline)
                .foregroundColor(.gray)
        }
        .padding(.top, 60)
    }

    private func errorView(_ msg: String) -> some View {
        VStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 40))
                .foregroundColor(.orange)
            Text(msg)
                .font(.subheadline)
                .foregroundColor(.gray)
                .multilineTextAlignment(.center)
        }
        .padding(.top, 60)
    }

    private var toastView: some View {
        Text("✅ 已自动收录到词汇本")
            .font(.caption)
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(.ultraThinMaterial)
            .cornerRadius(20)
            .padding(.bottom, 20)
    }

    // MARK: - Search Logic

    private func performSearch() {
        let text = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }

        errorMessage = nil
        result = nil
        isSearching = true

        Task {
            let lookupResult = await dictService.lookup(text)

            await MainActor.run {
                isSearching = false

                if lookupResult.dictData == nil {
                    let inputType = dictService.detectInputType(text)
                    errorMessage = inputType == .chinese
                        ? "未能翻译该中文，请尝试其他表达"
                        : "未找到该单词或短语，请检查拼写后重试"
                    return
                }

                result = lookupResult

                // Auto-save
                if let data = lookupResult.dictData {
                    var entry = data
                    entry.translation = lookupResult.translation
                    if store.getWord(entry.word) == nil {
                        store.addWord(entry)
                        withAnimation {
                            showSavedToast = true
                        }
                        DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                            withAnimation { showSavedToast = false }
                        }
                    }
                }
            }
        }
    }
}

// MARK: - Color Extension

extension Color {
    init(hex: String) {
        let scanner = Scanner(string: hex)
        var rgbValue: UInt64 = 0
        scanner.scanHexInt64(&rgbValue)

        let r = Double((rgbValue & 0xFF0000) >> 16) / 255.0
        let g = Double((rgbValue & 0x00FF00) >> 8) / 255.0
        let b = Double(rgbValue & 0x0000FF) / 255.0

        self.init(red: r, green: g, blue: b)
    }
}
