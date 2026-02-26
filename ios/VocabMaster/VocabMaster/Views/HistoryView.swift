import SwiftUI
import UniformTypeIdentifiers

struct HistoryView: View {
    @EnvironmentObject var store: VocabStore
    @State private var searchText = ""
    @State private var sortOption: SortOption = .dateDesc
    @State private var showImporter = false
    @State private var showExporter = false
    @State private var toastMessage: String?

    enum SortOption: String, CaseIterable {
        case dateDesc = "最新添加"
        case dateAsc = "最早添加"
        case alpha = "字母排序"
        case level = "熟练度"
    }

    var filteredWords: [WordEntry] {
        var list = store.words

        // Filter
        if !searchText.isEmpty {
            list = list.filter {
                $0.word.localizedCaseInsensitiveContains(searchText) ||
                ($0.translation ?? "").localizedCaseInsensitiveContains(searchText)
            }
        }

        // Sort
        switch sortOption {
        case .dateDesc: list.sort { $0.addedAt > $1.addedAt }
        case .dateAsc: list.sort { $0.addedAt < $1.addedAt }
        case .alpha: list.sort { $0.word < $1.word }
        case .level: list.sort { $0.level > $1.level }
        }

        return list
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Color(hex: "0f0f23").ignoresSafeArea()

                VStack(spacing: 0) {
                    statsBar
                    searchAndSortBar
                    wordList
                }
            }
            .navigationTitle("词汇本")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button {
                            exportBackup()
                        } label: {
                            Label("导出备份", systemImage: "square.and.arrow.up")
                        }

                        Button {
                            showImporter = true
                        } label: {
                            Label("导入备份", systemImage: "square.and.arrow.down")
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                }
            }
            .fileImporter(
                isPresented: $showImporter,
                allowedContentTypes: [.json],
                allowsMultipleSelection: false
            ) { result in
                handleImport(result)
            }
            .overlay(alignment: .bottom) {
                if let msg = toastMessage {
                    Text(msg)
                        .font(.caption)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                        .background(.ultraThinMaterial)
                        .cornerRadius(20)
                        .padding(.bottom, 20)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
        }
    }

    // MARK: - Stats Bar

    private var statsBar: some View {
        HStack(spacing: 12) {
            statCard(value: store.wordCount, label: "总词汇", color: .purple)
            statCard(value: store.masteredCount, label: "已掌握", color: .green)
            statCard(value: store.learningCount, label: "学习中", color: .orange)
        }
        .padding(.horizontal)
        .padding(.vertical, 12)
    }

    private func statCard(value: Int, label: String, color: Color) -> some View {
        VStack(spacing: 4) {
            Text("\(value)")
                .font(.system(size: 22, weight: .bold))
                .foregroundColor(color)
            Text(label)
                .font(.system(size: 11))
                .foregroundColor(.gray)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
        .background(Color(hex: "1e1e3c").opacity(0.5))
        .cornerRadius(10)
    }

    // MARK: - Search & Sort

    private var searchAndSortBar: some View {
        HStack(spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .foregroundColor(.gray)
                    .font(.caption)
                TextField("搜索词汇...", text: $searchText)
                    .font(.subheadline)
                    .textInputAutocapitalization(.never)
            }
            .padding(10)
            .background(Color(hex: "1e1e3c").opacity(0.5))
            .cornerRadius(10)

            Menu {
                ForEach(SortOption.allCases, id: \.self) { option in
                    Button {
                        sortOption = option
                    } label: {
                        HStack {
                            Text(option.rawValue)
                            if sortOption == option {
                                Image(systemName: "checkmark")
                            }
                        }
                    }
                }
            } label: {
                Image(systemName: "arrow.up.arrow.down")
                    .font(.caption)
                    .padding(10)
                    .background(Color(hex: "1e1e3c").opacity(0.5))
                    .cornerRadius(10)
            }
        }
        .padding(.horizontal)
        .padding(.bottom, 8)
    }

    // MARK: - Word List

    private var wordList: some View {
        List {
            ForEach(filteredWords) { entry in
                wordRow(entry)
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
            }
            .onDelete { indexSet in
                let wordsToDelete = indexSet.map { filteredWords[$0].word }
                for word in wordsToDelete {
                    store.deleteWord(word)
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
    }

    private func wordRow(_ entry: WordEntry) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(entry.word)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(.white)

                if let translation = entry.translation {
                    Text(translation)
                        .font(.caption)
                        .foregroundColor(.gray)
                        .lineLimit(1)
                }
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 4) {
                levelBadge(entry.level)

                Text(entry.addedAt, style: .date)
                    .font(.system(size: 10))
                    .foregroundColor(.gray.opacity(0.6))
            }
        }
        .padding(12)
        .background(Color(hex: "1e1e3c").opacity(0.4))
        .cornerRadius(12)
    }

    private func levelBadge(_ level: Int) -> some View {
        let color: Color = level >= EbbinghausManager.intervals.count ? .green :
                          level >= 4 ? .cyan :
                          level >= 2 ? .orange : .gray
        return Text(EbbinghausManager.levelLabel(for: level))
            .font(.system(size: 10, weight: .semibold))
            .padding(.horizontal, 8)
            .padding(.vertical, 2)
            .background(color.opacity(0.12))
            .foregroundColor(color)
            .cornerRadius(4)
    }

    // MARK: - Import / Export

    private func exportBackup() {
        guard let data = store.exportJSON() else { return }

        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        let fileName = "vocabmaster_backup_\(formatter.string(from: Date())).json"

        let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)
        try? data.write(to: tempURL)

        let activityVC = UIActivityViewController(activityItems: [tempURL], applicationActivities: nil)
        if let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
           let root = windowScene.windows.first?.rootViewController {
            root.present(activityVC, animated: true)
        }
    }

    private func handleImport(_ result: Result<[URL], Error>) {
        guard case .success(let urls) = result,
              let url = urls.first else { return }

        guard url.startAccessingSecurityScopedResource() else { return }
        defer { url.stopAccessingSecurityScopedResource() }

        guard let data = try? Data(contentsOf: url) else {
            showToast("读取文件失败")
            return
        }

        let (imported, skipped) = store.importJSON(from: data)
        var msg = "成功导入 \(imported) 个词汇"
        if skipped > 0 { msg += "，跳过 \(skipped) 个已存在" }
        showToast(msg)
    }

    private func showToast(_ msg: String) {
        withAnimation { toastMessage = msg }
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
            withAnimation { toastMessage = nil }
        }
    }
}
