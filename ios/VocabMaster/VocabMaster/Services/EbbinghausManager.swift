import Foundation

// MARK: - Ebbinghaus Spaced Repetition

struct EbbinghausManager {

    /// Review intervals in seconds (same as Web version)
    static let intervals: [TimeInterval] = [
        1 * 24 * 60 * 60,   // Level 0 → 1: 1 day
        2 * 24 * 60 * 60,   // Level 1 → 2: 2 days
        4 * 24 * 60 * 60,   // Level 2 → 3: 4 days
        7 * 24 * 60 * 60,   // Level 3 → 4: 7 days
        15 * 24 * 60 * 60,  // Level 4 → 5: 15 days
        30 * 24 * 60 * 60,  // Level 5 → 6: 30 days
    ]

    /// Get next review date based on current level
    static func nextReviewDate(for level: Int) -> Date {
        let interval: TimeInterval
        if level >= intervals.count {
            interval = 60 * 24 * 60 * 60 // Mastered: 60 days
        } else {
            interval = intervals[level]
        }
        return Date().addingTimeInterval(interval)
    }

    /// Get all words due for review
    static func dueWords(from words: [WordEntry]) -> [WordEntry] {
        let now = Date()
        return words.filter { $0.nextReviewAt <= now && $0.level < intervals.count }
    }

    /// Get count of due words
    static func dueCount(from words: [WordEntry]) -> Int {
        dueWords(from: words).count
    }

    /// Process a review result
    static func markReviewed(entry: inout WordEntry, remembered: Bool) {
        if remembered {
            entry.level = min(entry.level + 1, intervals.count)
        } else {
            entry.level = 0 // Reset on failure
        }
        entry.reviewCount += 1
        entry.nextReviewAt = nextReviewDate(for: entry.level)
        entry.lastReviewedAt = Date()
    }

    /// Get review statistics
    static func stats(from words: [WordEntry]) -> (total: Int, mastered: Int, due: Int, learning: Int) {
        let total = words.count
        let mastered = words.filter { $0.level >= intervals.count }.count
        let due = dueCount(from: words)
        let learning = total - mastered
        return (total, mastered, due, learning)
    }

    /// Label for a given level
    static func levelLabel(for level: Int) -> String {
        guard level < levelLabels.count else { return "已掌握" }
        return levelLabels[level]
    }
}
