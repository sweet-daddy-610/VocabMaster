/**
 * VocabMaster - Main Entry Point
 * Wires together all modules and handles user interactions
 */

import { lookupWord, playPronunciation, detectInputType, testDeepSeekApi } from './modules/dictionary.js';
import { openDB, saveWord, getWord, getAllWords, deleteWord, getWordCount, exportAllWords, importWords } from './modules/storage.js';
import { getDueWords, getDueWordCount, markAsReviewed, getNextReviewTime, getReviewStats } from './modules/ebbinghaus.js';
import { requestPermission, scheduleReviewCheck } from './modules/notification.js';
import {
    switchPage, showToast, showResultState, renderResult, showError,
    renderHistoryStats, renderHistoryList, showReviewState,
    renderFlashcard, renderReviewComplete, renderNextReviewInfo,
    updateHeaderStats,
} from './modules/ui.js';

// ===== App State =====
let reviewQueue = [];
let reviewIndex = 0;
let reviewRemembered = 0;
let reviewForgot = 0;

// ===== Initialization =====
async function init() {
    try {
        // Initialize database
        await openDB();

        // Set up event listeners
        setupEventListeners();

        // Request notification permission
        requestPermission();

        // Start periodic review checks
        scheduleReviewCheck();

        // Update header stats
        await refreshStats();

        console.log('VocabMaster initialized');
    } catch (error) {
        console.error('Initialization error:', error);
        showToast('应用初始化失败，请刷新重试', 'error');
    }
}

// ===== Event Listeners =====
function setupEventListeners() {
    // Search
    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.getElementById('searchBtn');

    searchBtn.addEventListener('click', () => handleSearch());
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleSearch();
    });

    // Sound button
    document.getElementById('soundBtn').addEventListener('click', () => {
        const word = document.getElementById('wordTitle').textContent;
        if (word) {
            const type = detectInputType(word);
            const audioUrl = document.getElementById('soundBtn').dataset.audioUrl || null;
            playPronunciation(word, type === 'chinese' ? 'zh-CN' : 'en-US', audioUrl);
        }
    });

    // Quick words
    document.querySelectorAll('.quick-word').forEach((el) => {
        el.addEventListener('click', () => {
            searchInput.value = el.dataset.word;
            handleSearch();
        });
    });

    // Synonym click event
    window.addEventListener('lookupWord', (e) => {
        searchInput.value = e.detail;
        handleSearch();
    });

    // Navigation
    document.querySelectorAll('.nav-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            const pageId = btn.dataset.page;
            if (!pageId) return; // Skip non-page buttons (e.g. settings)
            switchPage(pageId);

            if (pageId === 'pageHistory') refreshHistory();
            if (pageId === 'pageReview') refreshReview();
        });
    });

    // Custom navigation event (from notifications)
    window.addEventListener('navigate', (e) => {
        switchPage(e.detail);
        if (e.detail === 'pageReview') refreshReview();
    });

    // Flashcard flip
    const flashcard = document.getElementById('flashcard');
    flashcard.addEventListener('click', (e) => {
        if (e.target.closest('.flashcard-sound-btn')) return;
        document.getElementById('flashcardInner').classList.toggle('flipped');
    });

    // Flashcard sound
    document.getElementById('flashcardSoundBtn').addEventListener('click', (e) => {
        e.stopPropagation();
        const word = document.getElementById('flashcardWord').textContent;
        if (word) {
            const audioUrl = document.getElementById('flashcardSoundBtn').dataset.audioUrl || null;
            playPronunciation(word, 'en-US', audioUrl);
        }
    });

    // Review actions
    document.getElementById('rememberedBtn').addEventListener('click', () => handleReviewAction(true));
    document.getElementById('forgotBtn').addEventListener('click', () => handleReviewAction(false));
    document.getElementById('restartReviewBtn').addEventListener('click', () => refreshReview());

    // History search & sort
    document.getElementById('historySearch').addEventListener('input', () => refreshHistory());
    document.getElementById('historySort').addEventListener('change', () => refreshHistory());

    // Export / Import
    document.getElementById('exportBtn').addEventListener('click', handleExport);
    document.getElementById('importBtn').addEventListener('click', () => {
        document.getElementById('importFileInput').click();
    });
    document.getElementById('importFileInput').addEventListener('change', handleImport);

    // Settings
    setupSettingsListeners();
}

// ===== Search / Dictionary =====
async function handleSearch() {
    const input = document.getElementById('searchInput');
    const text = input.value.trim();
    if (!text) return;

    showResultState('loading');

    try {
        // Unified lookup: returns { dictData, translation, inputType }
        const result = await lookupWord(text);
        const { dictData, translation, inputType } = result;

        if (!dictData) {
            const errorMsg = inputType === 'chinese'
                ? '未能翻译该中文，请尝试其他表达'
                : '未找到该单词或短语，请检查拼写后重试';
            showError(errorMsg);
            return;
        }

        // Check if already saved
        const saveKey = dictData.word;
        const existing = await getWord(saveKey);
        const isSaved = !!existing;

        // Render result with inputType info
        renderResult(dictData, translation, isSaved, inputType);

        // Store audioUrl on sound button for playback
        const soundBtn = document.getElementById('soundBtn');
        soundBtn.dataset.audioUrl = dictData.audioUrl || '';

        // Auto-save if not already saved
        if (!isSaved) {
            await saveWord({
                word: saveKey,
                phonetic: dictData.phonetic,
                audioUrl: dictData.audioUrl || null,
                meanings: dictData.meanings,
                translation,
            });
            showToast(`"${saveKey}" 已自动收录到词汇本`, 'success');
            document.getElementById('savedIndicator').classList.remove('hidden');
        }

        // Refresh header stats
        await refreshStats();
    } catch (error) {
        console.error('Search error:', error);
        showError('查询失败，请检查网络连接后重试');
    }
}

// ===== History =====
async function refreshHistory() {
    try {
        let words = await getAllWords();
        const stats = await getReviewStats();

        renderHistoryStats(stats);

        // Filter
        const searchTerm = document.getElementById('historySearch').value.trim().toLowerCase();
        if (searchTerm) {
            words = words.filter((w) =>
                w.word.includes(searchTerm) || (w.translation && w.translation.includes(searchTerm))
            );
        }

        // Sort
        const sortBy = document.getElementById('historySort').value;
        switch (sortBy) {
            case 'newest':
                words.sort((a, b) => b.addedAt - a.addedAt);
                break;
            case 'oldest':
                words.sort((a, b) => a.addedAt - b.addedAt);
                break;
            case 'alpha':
                words.sort((a, b) => a.word.localeCompare(b.word));
                break;
            case 'level':
                words.sort((a, b) => b.level - a.level);
                break;
        }

        renderHistoryList(
            words,
            async (word) => {
                await deleteWord(word);
                showToast(`"${word}" 已从词汇本删除`, 'info');
                await refreshStats();
                await refreshHistory();
            },
            (word) => {
                document.getElementById('searchInput').value = word;
                switchPage('pageDictionary');
                handleSearch();
            }
        );
    } catch (error) {
        console.error('History refresh error:', error);
    }
}

// ===== Review =====
async function refreshReview() {
    try {
        const dueWords = await getDueWords();

        if (dueWords.length === 0) {
            showReviewState('noReview');
            const nextTime = await getNextReviewTime();
            renderNextReviewInfo(nextTime);
            return;
        }

        // Shuffle the queue
        reviewQueue = shuffleArray([...dueWords]);
        reviewIndex = 0;
        reviewRemembered = 0;
        reviewForgot = 0;

        showReviewState('card');
        renderFlashcard(reviewQueue[0], 1, reviewQueue.length);
        // Store audioUrl for the sound button
        document.getElementById('flashcardSoundBtn').dataset.audioUrl = reviewQueue[0].audioUrl || '';
    } catch (error) {
        console.error('Review refresh error:', error);
    }
}

async function handleReviewAction(remembered) {
    if (reviewIndex >= reviewQueue.length) return;

    const currentWord = reviewQueue[reviewIndex];

    if (remembered) {
        reviewRemembered++;
    } else {
        reviewForgot++;
    }

    // Update in database
    await markAsReviewed(currentWord.word, remembered);

    reviewIndex++;

    if (reviewIndex >= reviewQueue.length) {
        // All done
        renderReviewComplete(reviewRemembered, reviewForgot);
        await refreshStats();
        return;
    }

    // Next card
    renderFlashcard(reviewQueue[reviewIndex], reviewIndex + 1, reviewQueue.length);
    document.getElementById('flashcardSoundBtn').dataset.audioUrl = reviewQueue[reviewIndex].audioUrl || '';
}

// ===== Stats =====
async function refreshStats() {
    try {
        const totalWords = await getWordCount();
        const dueCount = await getDueWordCount();
        updateHeaderStats(totalWords, dueCount);
    } catch (error) {
        console.error('Stats refresh error:', error);
    }
}

// ===== Export / Import =====
async function handleExport() {
    try {
        const count = await exportAllWords();
        showToast(`成功导出 ${count} 个词汇`, 'success');
    } catch (error) {
        console.error('Export error:', error);
        showToast(error.message || '导出失败', 'error');
    }
}

async function handleImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
        const { imported, skipped } = await importWords(file);
        let msg = `成功导入 ${imported} 个词汇`;
        if (skipped > 0) msg += `，跳过 ${skipped} 个已存在词汇`;
        showToast(msg, 'success');
        await refreshHistory();
        await refreshStats();
        notifyWidgetDataChanged();
    } catch (error) {
        console.error('Import error:', error);
        showToast(error.message || '导入失败', 'error');
    }

    // Reset file input so same file can be re-imported
    event.target.value = '';
}

// Notify the widget to refresh data (Electron only)
function notifyWidgetDataChanged() {
    if (window.electronAPI && window.electronAPI.dataChanged) {
        window.electronAPI.dataChanged();
    }
}

// ===== Utility =====
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// ===== Start the App =====
document.addEventListener('DOMContentLoaded', init);

// ===== Settings =====
function setupSettingsListeners() {
    const settingsBtn = document.getElementById('settingsNavBtn');
    const overlay = document.getElementById('settingsOverlay');
    const closeBtn = document.getElementById('settingsCloseBtn');
    const apiKeyInput = document.getElementById('deepseekApiKey');
    const toggleBtn = document.getElementById('toggleApiKeyVisibility');
    const testBtn = document.getElementById('testApiKeyBtn');
    const saveBtn = document.getElementById('saveApiKeyBtn');
    const statusEl = document.getElementById('apiKeyStatus');
    const deepseekLink = document.getElementById('deepseekLink');

    // Open settings modal
    settingsBtn.addEventListener('click', () => {
        overlay.classList.remove('hidden');
        // Load saved key
        const savedKey = localStorage.getItem('deepseek-api-key') || '';
        apiKeyInput.value = savedKey;
        statusEl.classList.add('hidden');
    });

    // Close
    closeBtn.addEventListener('click', () => overlay.classList.add('hidden'));
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.classList.add('hidden');
    });

    // Toggle visibility
    toggleBtn.addEventListener('click', () => {
        apiKeyInput.type = apiKeyInput.type === 'password' ? 'text' : 'password';
    });

    // Save
    saveBtn.addEventListener('click', () => {
        const key = apiKeyInput.value.trim();
        if (key) {
            localStorage.setItem('deepseek-api-key', key);
            showToast('API Key 已保存', 'success');
        } else {
            localStorage.removeItem('deepseek-api-key');
            showToast('API Key 已清除', 'info');
        }
        overlay.classList.add('hidden');
    });

    // Test connection
    testBtn.addEventListener('click', async () => {
        const key = apiKeyInput.value.trim();
        if (!key) {
            statusEl.textContent = '请先输入 API Key';
            statusEl.className = 'api-key-status error';
            return;
        }

        testBtn.disabled = true;
        testBtn.textContent = '测试中...';
        statusEl.classList.add('hidden');

        const result = await testDeepSeekApi(key);

        statusEl.textContent = result.message;
        statusEl.className = `api-key-status ${result.success ? 'success' : 'error'}`;
        testBtn.disabled = false;
        testBtn.textContent = '测试连接';
    });

    // Open external link (Electron support)
    deepseekLink.addEventListener('click', (e) => {
        e.preventDefault();
        const url = deepseekLink.href;
        if (window.electronAPI && window.electronAPI.openExternal) {
            window.electronAPI.openExternal(url);
        } else {
            window.open(url, '_blank');
        }
    });
}
