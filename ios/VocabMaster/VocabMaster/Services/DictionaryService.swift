import Foundation

// MARK: - DictionaryService: Multi-tier Lookup

class DictionaryService {

    private let freeDictURL = "https://api.dictionaryapi.dev/api/v2/entries/en"
    private let wiktionaryURL = "https://en.wiktionary.org/api/rest_v1/page/definition"
    private let translationURL = "https://api.mymemory.translated.net/get"

    // MARK: - Public API

    func lookup(_ text: String) async -> LookupResult {
        let inputType = detectInputType(text)
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)

        switch inputType {
        case .chinese:
            return await handleChineseLookup(trimmed)
        case .phrase:
            return await handlePhraseLookup(trimmed)
        case .word:
            return await handleWordLookup(trimmed)
        }
    }

    // MARK: - Input Type Detection

    func detectInputType(_ text: String) -> InputType {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)

        // Check for CJK characters
        for scalar in trimmed.unicodeScalars {
            if (0x4E00...0x9FFF).contains(scalar.value) ||
               (0x3400...0x4DBF).contains(scalar.value) {
                return .chinese
            }
        }

        // Check for multiple words
        let wordCount = trimmed.components(separatedBy: .whitespaces)
            .filter { !$0.isEmpty }.count
        if wordCount > 1 {
            return .phrase
        }

        return .word
    }

    // MARK: - Word Lookup

    private func handleWordLookup(_ word: String) async -> LookupResult {
        // Try Free Dictionary first
        if let entry = await lookupFreeDictionary(word) {
            let translation = await translateToChineseIfNeeded(word)
            return LookupResult(dictData: entry, translation: translation,
                              inputType: .word, source: "free-dictionary")
        }

        // Fallback: Wiktionary
        if let entry = await lookupWiktionary(word) {
            let translation = await translateToChineseIfNeeded(word)
            return LookupResult(dictData: entry, translation: translation,
                              inputType: .word, source: "wiktionary")
        }

        // Fallback: translation only
        if let translation = await translateToChineseIfNeeded(word) {
            var entry = WordEntry(word: word, translation: translation)
            entry.translation = translation
            return LookupResult(dictData: entry, translation: translation,
                              inputType: .word, source: "translation-only")
        }

        return LookupResult(dictData: nil, translation: nil, inputType: .word)
    }

    // MARK: - Phrase Lookup

    private func handlePhraseLookup(_ phrase: String) async -> LookupResult {
        // Try Wiktionary first for phrases
        if let entry = await lookupWiktionary(phrase) {
            let translation = await translateToChineseIfNeeded(phrase)
            return LookupResult(dictData: entry, translation: translation,
                              inputType: .phrase, source: "wiktionary")
        }

        // Fallback: Free Dictionary
        if let entry = await lookupFreeDictionary(phrase) {
            let translation = await translateToChineseIfNeeded(phrase)
            return LookupResult(dictData: entry, translation: translation,
                              inputType: .phrase, source: "free-dictionary")
        }

        // Fallback: translation only
        if let translation = await translateToChineseIfNeeded(phrase) {
            let entry = WordEntry(word: phrase, translation: translation)
            return LookupResult(dictData: entry, translation: translation,
                              inputType: .phrase, source: "translation-only")
        }

        return LookupResult(dictData: nil, translation: nil, inputType: .phrase)
    }

    // MARK: - Chinese Lookup

    private func handleChineseLookup(_ chinese: String) async -> LookupResult {
        // Step 1: Translate to English
        guard let english = await translateText(chinese, langPair: "zh|en") else {
            return LookupResult(dictData: nil, translation: nil, inputType: .chinese)
        }

        // Strip trailing punctuation from translation
        let cleanEnglish = english.lowercased()
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "[.!?,;:]+$", with: "", options: .regularExpression)

        // Step 2: Look up the English word
        var dictData: WordEntry? = await lookupFreeDictionary(cleanEnglish)
        if dictData == nil {
            dictData = await lookupWiktionary(cleanEnglish)
        }

        if var entry = dictData {
            entry.word = chinese
            entry.translation = english
            return LookupResult(dictData: entry, translation: english,
                              inputType: .chinese, source: "free-dictionary")
        }

        // Translation-only result
        var entry = WordEntry(word: chinese, translation: english)
        entry.translation = english
        return LookupResult(dictData: entry, translation: english,
                          inputType: .chinese, source: "translation-only")
    }

    // MARK: - Free Dictionary API

    private func lookupFreeDictionary(_ word: String) async -> WordEntry? {
        guard let encoded = word.lowercased()
            .addingPercentEncoding(withAllowedCharacters: .urlPathAllowed),
              let url = URL(string: "\(freeDictURL)/\(encoded)") else {
            return nil
        }

        do {
            let (data, response) = try await URLSession.shared.data(from: url)
            guard let httpResponse = response as? HTTPURLResponse,
                  httpResponse.statusCode == 200 else { return nil }

            let entries = try JSONDecoder().decode([FreeDictEntry].self, from: data)
            guard let first = entries.first else { return nil }

            // Extract data
            let phonetic = first.phonetics?.first(where: { $0.text != nil })?.text
            let audioUrl = first.phonetics?.first(where: {
                $0.audio != nil && !$0.audio!.isEmpty
            })?.audio

            let meanings: [Meaning] = first.meanings?.compactMap { m in
                guard let pos = m.partOfSpeech else { return nil }
                let defs = m.definitions?.compactMap { d -> Definition? in
                    guard let def = d.definition else { return nil }
                    return Definition(definition: def, example: d.example,
                                    synonyms: d.synonyms?.isEmpty == false ? d.synonyms : nil)
                } ?? []
                return defs.isEmpty ? nil : Meaning(partOfSpeech: pos, definitions: defs)
            } ?? []

            return WordEntry(word: word, phonetic: phonetic,
                           audioUrl: audioUrl, meanings: meanings)
        } catch {
            print("Free Dictionary error: \(error)")
            return nil
        }
    }

    // MARK: - Wiktionary API

    private func lookupWiktionary(_ text: String) async -> WordEntry? {
        let slug = text.lowercased().replacingOccurrences(of: " ", with: "_")
        guard let encoded = slug.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed),
              let url = URL(string: "\(wiktionaryURL)/\(encoded)") else {
            return nil
        }

        do {
            let (data, response) = try await URLSession.shared.data(from: url)
            guard let httpResponse = response as? HTTPURLResponse,
                  httpResponse.statusCode == 200 else { return nil }

            // Parse Wiktionary JSON (complex nested structure)
            guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let en = json["en"] as? [[String: Any]] else { return nil }

            var meanings: [Meaning] = []
            for section in en {
                guard let partOfSpeech = section["partOfSpeech"] as? String,
                      let definitions = section["definitions"] as? [[String: Any]] else { continue }

                let defs: [Definition] = definitions.compactMap { d in
                    guard let defText = d["definition"] as? String else { return nil }
                    // Strip HTML tags
                    let clean = defText.replacingOccurrences(of: "<[^>]+>", with: "",
                                                             options: .regularExpression)
                    return Definition(definition: clean)
                }

                if !defs.isEmpty {
                    meanings.append(Meaning(partOfSpeech: partOfSpeech, definitions: defs))
                }
            }

            guard !meanings.isEmpty else { return nil }
            return WordEntry(word: text, meanings: meanings)
        } catch {
            print("Wiktionary error: \(error)")
            return nil
        }
    }

    // MARK: - Translation

    private func translateText(_ text: String, langPair: String) async -> String? {
        guard let encoded = text.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
              let pairEncoded = langPair.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
              let url = URL(string: "\(translationURL)?q=\(encoded)&langpair=\(pairEncoded)") else {
            return nil
        }

        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            let response = try JSONDecoder().decode(TranslationResponse.self, from: data)
            if let result = response.responseData?.translatedText,
               result.lowercased() != text.lowercased() {
                return result
            }
        } catch {
            print("Translation error: \(error)")
        }
        return nil
    }

    private func translateToChineseIfNeeded(_ english: String) async -> String? {
        return await translateText(english, langPair: "en|zh")
    }
}
