/**
 * Storage Module
 * IndexedDB wrapper for persisting vocabulary data
 */

const DB_NAME = 'VocabMasterDB';
const DB_VERSION = 1;
const STORE_NAME = 'words';

let dbInstance = null;

/**
 * Open (or create) the IndexedDB database
 * @returns {Promise<IDBDatabase>}
 */
export function openDB() {
    if (dbInstance) return Promise.resolve(dbInstance);

    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'word' });
                store.createIndex('addedAt', 'addedAt', { unique: false });
                store.createIndex('nextReviewAt', 'nextReviewAt', { unique: false });
                store.createIndex('level', 'level', { unique: false });
            }
        };

        request.onsuccess = (event) => {
            dbInstance = event.target.result;
            resolve(dbInstance);
        };
    });
}

/**
 * Save a word entry to the database
 * @param {Object} wordData
 * @returns {Promise<void>}
 */
export async function saveWord(wordData) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);

        const entry = {
            word: wordData.word.toLowerCase(),
            phonetic: wordData.phonetic || '',
            audioUrl: wordData.audioUrl || null,
            meanings: wordData.meanings || [],
            translation: wordData.translation || '',
            addedAt: Date.now(),
            nextReviewAt: Date.now() + 24 * 60 * 60 * 1000, // 1 day from now
            reviewCount: 0,
            level: 0,
        };

        const request = store.put(entry);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

/**
 * Get a single word
 * @param {string} word
 * @returns {Promise<Object|null>}
 */
export async function getWord(word) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.get(word.toLowerCase());
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Get all words from the database
 * @returns {Promise<Array>}
 */
export async function getAllWords() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Update a word entry (partial update via merge)
 * @param {string} word
 * @param {Object} updates
 * @returns {Promise<void>}
 */
export async function updateWord(word, updates) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);

        const getReq = store.get(word.toLowerCase());
        getReq.onsuccess = () => {
            const existing = getReq.result;
            if (!existing) {
                resolve();
                return;
            }
            const updated = { ...existing, ...updates };
            const putReq = store.put(updated);
            putReq.onsuccess = () => resolve();
            putReq.onerror = () => reject(putReq.error);
        };
        getReq.onerror = () => reject(getReq.error);
    });
}

/**
 * Delete a word from the database
 * @param {string} word
 * @returns {Promise<void>}
 */
export async function deleteWord(word) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.delete(word.toLowerCase());
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

/**
 * Get total word count
 * @returns {Promise<number>}
 */
export async function getWordCount() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Export all words as a downloadable JSON file
 */
export async function exportAllWords() {
    const words = await getAllWords();
    if (words.length === 0) {
        throw new Error('没有可导出的数据');
    }

    const exportData = {
        version: 1,
        exportedAt: new Date().toISOString(),
        wordCount: words.length,
        words,
    };

    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    const dateStr = new Date().toISOString().slice(0, 10);
    a.download = `vocabmaster_backup_${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    return words.length;
}

/**
 * Import words from a JSON backup file
 * @param {File} file - JSON file from file input
 * @returns {Promise<{imported: number, skipped: number}>}
 */
export async function importWords(file) {
    const text = await file.text();
    let data;

    try {
        data = JSON.parse(text);
    } catch {
        throw new Error('文件格式错误，无法解析 JSON');
    }

    // Support both wrapped format { words: [...] } and raw array [...]
    const words = Array.isArray(data) ? data : (data.words || []);
    if (!Array.isArray(words) || words.length === 0) {
        throw new Error('文件中没有找到词汇数据');
    }

    let imported = 0;
    let skipped = 0;

    for (const entry of words) {
        if (!entry.word) continue;

        // Check if word already exists
        const existing = await getWord(entry.word);
        if (existing) {
            skipped++;
            continue;
        }

        // Save with original data (preserving review state)
        const db = await openDB();
        await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const request = store.put({
                word: entry.word.toLowerCase(),
                phonetic: entry.phonetic || '',
                meanings: entry.meanings || [],
                translation: entry.translation || '',
                addedAt: entry.addedAt || Date.now(),
                nextReviewAt: entry.nextReviewAt || Date.now() + 24 * 60 * 60 * 1000,
                reviewCount: entry.reviewCount || 0,
                level: entry.level || 0,
                lastReviewedAt: entry.lastReviewedAt || null,
            });
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
        imported++;
    }

    return { imported, skipped };
}

