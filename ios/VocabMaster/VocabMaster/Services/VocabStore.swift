import Foundation

// MARK: - VocabStore: JSON File Storage + iCloud Sync

@MainActor
class VocabStore: ObservableObject {
    @Published var words: [WordEntry] = []

    private let fileName = "vocabmaster_data.json"
    private let iCloudKey = "vocabmaster_words"

    // MARK: - File Paths

    private var localFileURL: URL {
        let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
        return docs.appendingPathComponent(fileName)
    }

    private var iCloudFileURL: URL? {
        FileManager.default.url(forUbiquityContainerIdentifier: nil)?
            .appendingPathComponent("Documents")
            .appendingPathComponent(fileName)
    }

    // MARK: - Init

    init() {
        loadFromDisk()
        setupICloudObserver()
    }

    // MARK: - CRUD Operations

    func addWord(_ entry: WordEntry) {
        if let index = words.firstIndex(where: { $0.word == entry.word.lowercased() }) {
            // Update existing
            words[index] = entry
        } else {
            words.append(entry)
        }
        saveToDisk()
    }

    func getWord(_ word: String) -> WordEntry? {
        words.first { $0.word == word.lowercased() }
    }

    func updateWord(_ word: String, updates: (inout WordEntry) -> Void) {
        if let index = words.firstIndex(where: { $0.word == word.lowercased() }) {
            updates(&words[index])
            saveToDisk()
        }
    }

    func deleteWord(_ word: String) {
        words.removeAll { $0.word == word.lowercased() }
        saveToDisk()
    }

    var wordCount: Int { words.count }

    var masteredCount: Int {
        words.filter { $0.level >= EbbinghausManager.intervals.count }.count
    }

    var learningCount: Int { wordCount - masteredCount }

    // MARK: - Local File I/O

    func saveToDisk() {
        do {
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .millisecondsSince1970
            encoder.outputFormatting = .prettyPrinted
            let data = try encoder.encode(words)
            try data.write(to: localFileURL, options: .atomic)
            syncToICloud(data: data)
        } catch {
            print("❌ Save error: \(error)")
        }
    }

    func loadFromDisk() {
        // Try local first
        if let data = try? Data(contentsOf: localFileURL) {
            decodeWords(from: data)
            return
        }

        // Try iCloud fallback
        if let iCloudURL = iCloudFileURL,
           let data = try? Data(contentsOf: iCloudURL) {
            decodeWords(from: data)
            saveToDisk() // Save local copy
        }
    }

    private func decodeWords(from data: Data) {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .millisecondsSince1970
        do {
            words = try decoder.decode([WordEntry].self, from: data)
        } catch {
            // Try wrapped format { words: [...] }
            if let wrapper = try? decoder.decode(ExportWrapper.self, from: data) {
                words = wrapper.words
            } else {
                print("❌ Decode error: \(error)")
            }
        }
    }

    // MARK: - iCloud Sync

    private func syncToICloud(data: Data) {
        guard let iCloudURL = iCloudFileURL else { return }

        // Ensure iCloud Documents directory exists
        let iCloudDir = iCloudURL.deletingLastPathComponent()
        if !FileManager.default.fileExists(atPath: iCloudDir.path) {
            try? FileManager.default.createDirectory(at: iCloudDir, withIntermediateDirectories: true)
        }

        do {
            try data.write(to: iCloudURL, options: .atomic)
            print("☁️ Synced to iCloud")
        } catch {
            print("❌ iCloud sync error: \(error)")
        }
    }

    private func setupICloudObserver() {
        NotificationCenter.default.addObserver(
            forName: NSUbiquitousKeyValueStore.didChangeExternallyNotification,
            object: nil, queue: .main
        ) { [weak self] _ in
            self?.loadFromDisk()
        }
        NSUbiquitousKeyValueStore.default.synchronize()
    }

    // MARK: - Import / Export

    func exportJSON() -> Data? {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .millisecondsSince1970
        encoder.outputFormatting = .prettyPrinted

        let wrapper = ExportWrapper(
            version: 1,
            exportedAt: ISO8601DateFormatter().string(from: Date()),
            wordCount: words.count,
            words: words
        )
        return try? encoder.encode(wrapper)
    }

    func importJSON(from data: Data) -> (imported: Int, skipped: Int) {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .millisecondsSince1970

        var importedWords: [WordEntry] = []

        // Try wrapped format
        if let wrapper = try? decoder.decode(ExportWrapper.self, from: data) {
            importedWords = wrapper.words
        }
        // Try raw array
        else if let array = try? decoder.decode([WordEntry].self, from: data) {
            importedWords = array
        } else {
            return (0, 0)
        }

        var imported = 0
        var skipped = 0

        for entry in importedWords {
            if getWord(entry.word) != nil {
                skipped += 1
            } else {
                words.append(entry)
                imported += 1
            }
        }

        if imported > 0 { saveToDisk() }
        return (imported, skipped)
    }
}

// MARK: - Export Wrapper (compatible with Web version)

struct ExportWrapper: Codable {
    let version: Int?
    let exportedAt: String?
    let wordCount: Int?
    let words: [WordEntry]
}
