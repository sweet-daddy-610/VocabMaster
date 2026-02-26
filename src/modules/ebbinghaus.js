/**
 * Ebbinghaus Spaced Repetition Module
 * Implements the Ebbinghaus forgetting curve review intervals
 */

import { getAllWords, updateWord } from './storage.js';

/**
 * Review intervals in milliseconds
 * Level 0 → 1: 1 day
 * Level 1 → 2: 2 days
 * Level 2 → 3: 4 days
 * Level 3 → 4: 7 days
 * Level 4 → 5: 15 days
 * Level 5 → 6: 30 days
 * Level 6: mastered
 */
export const REVIEW_INTERVALS = [
    1 * 24 * 60 * 60 * 1000,   // 1 day
    2 * 24 * 60 * 60 * 1000,   // 2 days
    4 * 24 * 60 * 60 * 1000,   // 4 days
    7 * 24 * 60 * 60 * 1000,   // 7 days
    15 * 24 * 60 * 60 * 1000,  // 15 days
    30 * 24 * 60 * 60 * 1000,  // 30 days
];

export const LEVEL_LABELS = [
    '新单词',     // Level 0
    '刚学习',     // Level 1
    '初步掌握',   // Level 2
    '基本掌握',   // Level 3
    '熟练',       // Level 4
    '精通',       // Level 5
    '已掌握',     // Level 6
];

/**
 * Calculate next review date based on current level
 * @param {number} level
 * @returns {number} timestamp of next review
 */
export function getNextReviewDate(level) {
    const now = Date.now();
    if (level >= REVIEW_INTERVALS.length) {
        // Mastered — review in 60 days
        return now + 60 * 24 * 60 * 60 * 1000;
    }
    return now + REVIEW_INTERVALS[level];
}

/**
 * Get all words that are due for review
 * @returns {Promise<Array>} words due for review
 */
export async function getDueWords() {
    const allWords = await getAllWords();
    const now = Date.now();
    return allWords.filter((w) => w.nextReviewAt <= now && w.level < REVIEW_INTERVALS.length);
}

/**
 * Get count of words due for review
 * @returns {Promise<number>}
 */
export async function getDueWordCount() {
    const dueWords = await getDueWords();
    return dueWords.length;
}

/**
 * Mark a word as reviewed
 * @param {string} word
 * @param {boolean} remembered - true if remembered, false if forgot
 * @returns {Promise<Object>} updated word data
 */
export async function markAsReviewed(word, remembered) {
    const allWords = await getAllWords();
    const entry = allWords.find((w) => w.word === word.toLowerCase());
    if (!entry) return null;

    let newLevel;
    if (remembered) {
        newLevel = Math.min(entry.level + 1, REVIEW_INTERVALS.length);
    } else {
        // Reset to level 0 on failure (strict Ebbinghaus approach)
        newLevel = 0;
    }

    const updates = {
        level: newLevel,
        reviewCount: entry.reviewCount + 1,
        nextReviewAt: getNextReviewDate(newLevel),
        lastReviewedAt: Date.now(),
    };

    await updateWord(word, updates);
    return { ...entry, ...updates };
}

/**
 * Get the nearest next review time (for showing "next review in X")
 * @returns {Promise<number|null>} timestamp or null
 */
export async function getNextReviewTime() {
    const allWords = await getAllWords();
    const now = Date.now();
    const futureWords = allWords.filter((w) => w.nextReviewAt > now && w.level < REVIEW_INTERVALS.length);
    if (futureWords.length === 0) return null;
    return Math.min(...futureWords.map((w) => w.nextReviewAt));
}

/**
 * Get review statistics
 * @returns {Promise<Object>}
 */
export async function getReviewStats() {
    const allWords = await getAllWords();
    const now = Date.now();

    const total = allWords.length;
    const mastered = allWords.filter((w) => w.level >= REVIEW_INTERVALS.length).length;
    const due = allWords.filter((w) => w.nextReviewAt <= now && w.level < REVIEW_INTERVALS.length).length;
    const learning = total - mastered;

    return { total, mastered, due, learning };
}
