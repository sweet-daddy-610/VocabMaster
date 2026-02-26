import Foundation

// MARK: - Word Entry

struct WordEntry: Codable, Identifiable {
    var id: String { word }
    var word: String
    var phonetic: String?
    var audioUrl: String?
    var meanings: [Meaning]
    var translation: String?
    var addedAt: Date
    var nextReviewAt: Date
    var reviewCount: Int
    var level: Int
    var lastReviewedAt: Date?

    init(word: String, phonetic: String? = nil, audioUrl: String? = nil,
         meanings: [Meaning] = [], translation: String? = nil) {
        self.word = word.lowercased()
        self.phonetic = phonetic
        self.audioUrl = audioUrl
        self.meanings = meanings
        self.translation = translation
        self.addedAt = Date()
        self.nextReviewAt = Date().addingTimeInterval(24 * 60 * 60)
        self.reviewCount = 0
        self.level = 0
    }
}

// MARK: - Meaning / Definition

struct Meaning: Codable {
    var partOfSpeech: String
    var definitions: [Definition]
}

struct Definition: Codable {
    var definition: String
    var example: String?
    var synonyms: [String]?
}

// MARK: - API Response Models

struct FreeDictEntry: Codable {
    let word: String
    let phonetics: [Phonetic]?
    let meanings: [APIMeaning]?

    struct Phonetic: Codable {
        let text: String?
        let audio: String?
    }

    struct APIMeaning: Codable {
        let partOfSpeech: String?
        let definitions: [APIDefinition]?
    }

    struct APIDefinition: Codable {
        let definition: String?
        let example: String?
        let synonyms: [String]?
    }
}

struct TranslationResponse: Codable {
    let responseStatus: Int?
    let responseData: TranslationData?

    struct TranslationData: Codable {
        let translatedText: String?
    }
}

// MARK: - Input Type

enum InputType {
    case word
    case phrase
    case chinese

    var label: String {
        switch self {
        case .word: return "单词"
        case .phrase: return "短语"
        case .chinese: return "中文查询"
        }
    }
}

// MARK: - Lookup Result

struct LookupResult {
    var dictData: WordEntry?
    var translation: String?
    var inputType: InputType
    var source: String? // "free-dictionary", "wiktionary", "translation-only"
}

// MARK: - Level Labels

let levelLabels = [
    "新单词", "刚学习", "初步掌握", "基本掌握", "熟练", "精通", "已掌握"
]
