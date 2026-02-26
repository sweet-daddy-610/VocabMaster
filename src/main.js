/**
 * VocabMaster - Main Entry Point
 * Wires together all modules and handles user interactions
 */

import { lookupWord, playPronunciation, detectInputType, testDeepSeekApi, translateWithDeepSeek, fetchWordExtras } from './modules/dictionary.js';
import { openDB, saveWord, getWord, getAllWords, deleteWord, getWordCount, exportAllWords, importWords, updateWord } from './modules/storage.js';
import { getDueWords, getDueWordCount, markAsReviewed, getNextReviewTime, getReviewStats } from './modules/ebbinghaus.js';
import { requestPermission, scheduleReviewCheck } from './modules/notification.js';
import {
    switchPage, showToast, showResultState, renderResult, showError,
    renderHistoryStats, renderHistoryList, showReviewState,
    renderFlashcard, renderReviewComplete, renderNextReviewInfo,
    updateHeaderStats,
    renderExtraPanels, setExtraPanelLoading, setExtraPanelError,
    renderConjugations, renderWordList,
} from './modules/ui.js';

// ===== App State =====
let reviewQueue = [];
let reviewIndex = 0;
let reviewRemembered = 0;
let reviewForgot = 0;
let currentSaveKey = null; // tracks the DB key of the currently displayed word

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

    // Retranslate button
    document.getElementById('retranslateBtn').addEventListener('click', handleRetranslate);

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
        const inputType = detectInputType(text);

        // Check DB cache first — use stored data without any network calls
        const cached = await getWord(text);
        if (cached) {
            renderFromCache(cached, inputType);
            await refreshStats();
            return;
        }

        // No cached entry — full network lookup
        const result = await lookupWord(text);
        const { dictData, translation, inputType: resolvedInputType } = result;

        if (!dictData) {
            const errorMsg = resolvedInputType === 'chinese'
                ? '未能翻译该中文，请尝试其他表达'
                : '未找到该单词或短语，请检查拼写后重试';
            showError(errorMsg);
            return;
        }

        // dictData.word may differ from the raw input (e.g. plural → base form)
        const saveKey = dictData.word;
        currentSaveKey = saveKey;

        // Check whether the normalised form is already saved (handles plural variants etc.)
        const existing = await getWord(saveKey);
        renderResult(dictData, translation, !!existing, resolvedInputType);

        // Render and wire up extra collapsible panels
        const extraPanels = renderExtraPanels();
        setupExtraPanels(saveKey, extraPanels);

        // Store audioUrl on sound button for playback
        document.getElementById('soundBtn').dataset.audioUrl = dictData.audioUrl || '';

        // Auto-save if not already saved under the normalised key
        if (!existing) {
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

        await refreshStats();
    } catch (error) {
        console.error('Search error:', error);
        showError('查询失败，请检查网络连接后重试');
    }
}

/**
 * Render a result directly from a cached DB entry — no network calls.
 */
function renderFromCache(entry, inputType) {
    currentSaveKey = entry.word;

    const dictData = {
        word: entry.word,
        phonetic: entry.phonetic || '',
        audioUrl: entry.audioUrl || null,
        meanings: entry.meanings || [],
        // Preserve translation-only appearance for entries without definitions
        source: (entry.meanings && entry.meanings.length > 0) ? null : 'translation-only',
    };

    renderResult(dictData, entry.translation, true, inputType);
    document.getElementById('soundBtn').dataset.audioUrl = dictData.audioUrl || '';

    const extraPanels = renderExtraPanels();
    setupExtraPanels(entry.word, extraPanels);
}

// ===== Extra Panels =====

/**
 * Attach click-to-expand handlers to the three extra panels.
 * On first expand, loads data from DB cache or LLM.
 */
function setupExtraPanels(word, panels) {
    for (const [type, { panel, header, body }] of Object.entries(panels)) {
        header.addEventListener('click', () => {
            const isExpanded = panel.classList.toggle('expanded');
            if (isExpanded && body.dataset.status !== 'loaded') {
                loadExtraPanel(word, type, body);
            }
        });
    }
}

async function loadExtraPanel(word, type, body) {
    if (body.dataset.status === 'loading' || body.dataset.status === 'loaded') return;
    body.dataset.status = 'loading';
    setExtraPanelLoading(body);

    // Check DB cache first
    const cacheKey = `${type}Data`;
    const entry = await getWord(word);
    const cached = entry?.[cacheKey];

    if (cached !== undefined && cached !== null) {
        renderExtraContent(type, body, cached);
        body.dataset.status = 'loaded';
        return;
    }

    // Fetch from LLM
    const data = await fetchWordExtras(word, type);
    if (data !== null) {
        // Persist to DB (silently fails if word entry doesn't exist yet)
        await updateWord(word, { [cacheKey]: data });
        renderExtraContent(type, body, data);
        body.dataset.status = 'loaded';
    } else {
        const apiKey = localStorage.getItem('llm-api-key');
        const msg = apiKey ? '查询失败，请重试' : '请先在设置中配置 AI API Key';
        setExtraPanelError(body, msg);
        body.dataset.status = 'error';
    }
}

function renderExtraContent(type, body, data) {
    if (type === 'conjugations') {
        renderConjugations(body, data);
    } else {
        renderWordList(body, data, type);
    }
}

// ===== Retranslate =====
async function handleRetranslate() {
    const apiKey = localStorage.getItem('llm-api-key');
    if (!apiKey) {
        showToast('请先在设置中配置 AI API Key', 'info');
        return;
    }

    const text = document.getElementById('searchInput').value.trim();
    if (!text) return;

    const btn = document.getElementById('retranslateBtn');
    const spanEl = btn.querySelector('span');
    const originalText = spanEl.textContent;
    btn.disabled = true;
    btn.classList.add('loading');
    spanEl.textContent = '翻译中...';

    try {
        const newTranslation = await translateWithDeepSeek(text);
        if (newTranslation) {
            document.getElementById('translationContent').textContent = newTranslation;

            // Update saved word in DB if it exists
            if (currentSaveKey) {
                const existing = await getWord(currentSaveKey);
                if (existing) {
                    await updateWord(currentSaveKey, { translation: newTranslation });
                }
            }

            const provider = localStorage.getItem('llm-provider') || 'deepseek';
            const providerName = provider === 'gemini' ? 'Gemini' : 'DeepSeek';
            showToast(`已使用 ${providerName} AI 重新翻译`, 'success');
        } else {
            showToast('AI 翻译失败，请检查 API Key 是否有效', 'error');
        }
    } catch (error) {
        console.error('Retranslate error:', error);
        showToast('翻译失败，请重试', 'error');
    } finally {
        btn.disabled = false;
        btn.classList.remove('loading');
        spanEl.textContent = originalText;
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
const PROVIDER_CONFIG = {
    deepseek: {
        placeholder: 'sk-...',
        linkUrl: 'https://platform.deepseek.com/api_keys',
        linkText: 'platform.deepseek.com',
    },
    gemini: {
        placeholder: 'AIza...',
        linkUrl: 'https://aistudio.google.com/apikey',
        linkText: 'aistudio.google.com',
    },
};

function setupSettingsListeners() {
    const settingsBtn = document.getElementById('settingsNavBtn');
    const overlay = document.getElementById('settingsOverlay');
    const closeBtn = document.getElementById('settingsCloseBtn');
    const apiKeyInput = document.getElementById('deepseekApiKey');
    const toggleBtn = document.getElementById('toggleApiKeyVisibility');
    const testBtn = document.getElementById('testApiKeyBtn');
    const saveBtn = document.getElementById('saveApiKeyBtn');
    const statusEl = document.getElementById('apiKeyStatus');
    const apiKeyLink = document.getElementById('apiKeyLink');
    const apiKeyHint = document.getElementById('apiKeyHint');
    const providerSelect = document.getElementById('llmProvider');

    function updateProviderUI(provider) {
        const config = PROVIDER_CONFIG[provider] || PROVIDER_CONFIG.deepseek;
        apiKeyInput.placeholder = config.placeholder;
        apiKeyLink.href = config.linkUrl;
        apiKeyLink.textContent = config.linkText;
        // Load this provider's saved key
        const savedKey = localStorage.getItem('llm-api-key') || '';
        const savedProvider = localStorage.getItem('llm-provider') || 'deepseek';
        apiKeyInput.value = savedProvider === provider ? savedKey : '';
    }

    // Provider change
    providerSelect.addEventListener('change', () => {
        updateProviderUI(providerSelect.value);
        statusEl.classList.add('hidden');
    });

    // Open settings modal
    settingsBtn.addEventListener('click', () => {
        const savedProvider = localStorage.getItem('llm-provider') || 'deepseek';
        providerSelect.value = savedProvider;
        updateProviderUI(savedProvider);
        statusEl.classList.add('hidden');
        overlay.classList.remove('hidden');
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
        const provider = providerSelect.value;
        localStorage.setItem('llm-provider', provider);
        if (key) {
            localStorage.setItem('llm-api-key', key);
            showToast(`${PROVIDER_CONFIG[provider]?.linkText || provider} API Key 已保存`, 'success');
        } else {
            localStorage.removeItem('llm-api-key');
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

        const provider = providerSelect.value;
        const result = await testDeepSeekApi(key, provider);

        statusEl.textContent = result.message;
        statusEl.className = `api-key-status ${result.success ? 'success' : 'error'}`;
        testBtn.disabled = false;
        testBtn.textContent = '测试连接';
    });

    // Open external link
    apiKeyLink.addEventListener('click', (e) => {
        e.preventDefault();
        const url = apiKeyLink.href;
        if (window.electronAPI && window.electronAPI.openExternal) {
            window.electronAPI.openExternal(url);
        } else {
            window.open(url, '_blank');
        }
    });
}
