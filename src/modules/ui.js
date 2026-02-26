/**
 * UI Module
 * Handles DOM rendering, page switching, and interactive animations
 */

import { LEVEL_LABELS } from './ebbinghaus.js';

// ===== Page Navigation =====

/**
 * Switch between pages
 * @param {string} pageId
 */
export function switchPage(pageId) {
    document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));

    const page = document.getElementById(pageId);
    if (page) page.classList.add('active');

    const btn = document.querySelector(`[data-page="${pageId}"]`);
    if (btn) btn.classList.add('active');
}

// ===== Toast Notifications =====

/**
 * Show a toast notification
 * @param {string} message
 * @param {'success'|'error'|'info'} type
 * @param {number} duration in ms
 */
export function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('toast-out');
        toast.addEventListener('animationend', () => toast.remove());
    }, duration);
}

// ===== Dictionary Page Rendering =====

/**
 * Show a specific state in the result container
 * @param {'welcome'|'loading'|'error'|'result'} state
 */
export function showResultState(state) {
    const states = ['welcomeState', 'loadingState', 'errorState', 'resultState'];
    states.forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('hidden', id !== `${state}State`);
    });
}

/**
 * Render dictionary result
 * @param {Object} dictData - from lookupWord
 * @param {string} translation - Chinese translation (or English if Chinese input)
 * @param {boolean} isSaved - whether word is already saved
 * @param {string} inputType - 'word', 'phrase', or 'chinese'
 */
export function renderResult(dictData, translation, isSaved, inputType = 'word') {
    showResultState('result');

    // Word title & phonetic
    document.getElementById('wordTitle').textContent = dictData.word;
    document.getElementById('wordPhonetic').textContent = dictData.phonetic || '';

    // Saved indicator
    const savedEl = document.getElementById('savedIndicator');
    savedEl.classList.toggle('hidden', !isSaved);

    // Translation label & content
    const translationCard = document.getElementById('translationCard');
    const cardLabel = translationCard.querySelector('.card-label');

    if (inputType === 'chinese') {
        cardLabel.textContent = '英文释义';
        // For Chinese input, show the English translation and original English word if available
        let translationDisplay = translation;
        if (dictData.originalWord && dictData.originalWord !== translation.toLowerCase()) {
            translationDisplay = `${translation}`;
        }
        document.getElementById('translationContent').textContent = translationDisplay;
    } else {
        cardLabel.textContent = '中文释义';
        document.getElementById('translationContent').textContent = translation;
    }

    // Input type badge
    let badgeHtml = '';
    if (inputType === 'phrase') {
        badgeHtml = '<span class="input-type-badge phrase-badge">短语</span>';
    } else if (inputType === 'chinese') {
        badgeHtml = '<span class="input-type-badge chinese-badge">中文查询</span>';
    }
    if (dictData.source === 'translation-only') {
        badgeHtml += '<span class="input-type-badge translation-badge">翻译模式</span>';
    } else if (dictData.source === 'wiktionary') {
        badgeHtml += '<span class="input-type-badge wiktionary-badge">Wiktionary</span>';
    } else if (dictData.source === 'deepseek') {
        badgeHtml += '<span class="translation-source deepseek">DeepSeek AI</span>';
    }

    // Insert or update badge container
    let badgeContainer = document.getElementById('inputTypeBadges');
    if (!badgeContainer) {
        badgeContainer = document.createElement('div');
        badgeContainer.id = 'inputTypeBadges';
        badgeContainer.className = 'input-type-badges';
        const wordHeader = document.querySelector('.word-header');
        wordHeader.appendChild(badgeContainer);
    }
    badgeContainer.innerHTML = badgeHtml;

    // English definitions
    const defSection = document.getElementById('definitionsSection');
    defSection.innerHTML = '';

    if (dictData.meanings && dictData.meanings.length > 0) {
        dictData.meanings.forEach((meaning) => {
            const group = document.createElement('div');
            group.className = 'definition-group';

            // Part of speech badge
            const posEl = document.createElement('span');
            posEl.className = 'part-of-speech';
            posEl.textContent = meaning.partOfSpeech;
            group.appendChild(posEl);

            // Definitions
            meaning.definitions.forEach((def) => {
                const item = document.createElement('div');
                item.className = 'definition-item';

                const text = document.createElement('p');
                text.className = 'definition-text';
                text.textContent = def.definition;
                item.appendChild(text);

                if (def.example) {
                    const example = document.createElement('p');
                    example.className = 'definition-example';
                    example.textContent = `"${def.example}"`;
                    item.appendChild(example);
                }

                group.appendChild(item);
            });

            // Synonyms
            if (meaning.synonyms && meaning.synonyms.length > 0) {
                const synRow = document.createElement('div');
                synRow.className = 'synonyms-row';

                const label = document.createElement('span');
                label.className = 'synonyms-label';
                label.textContent = '同义词:';
                synRow.appendChild(label);

                meaning.synonyms.forEach((syn) => {
                    const tag = document.createElement('span');
                    tag.className = 'synonym-tag';
                    tag.textContent = syn;
                    tag.addEventListener('click', () => {
                        const event = new CustomEvent('lookupWord', { detail: syn });
                        window.dispatchEvent(event);
                    });
                    synRow.appendChild(tag);
                });

                group.appendChild(synRow);
            }

            defSection.appendChild(group);
        });
    } else {
        // Translation-only: show a helpful message
        const noDefMsg = document.createElement('div');
        noDefMsg.className = 'no-definitions-msg';
        noDefMsg.innerHTML = `
            <p class="no-def-text">暂无详细英文释义</p>
            <p class="no-def-hint">已提供翻译结果，可收录到词汇本中学习</p>
        `;
        defSection.appendChild(noDefMsg);
    }
}

/**
 * Show error state with a message
 * @param {string} message
 */
export function showError(message) {
    showResultState('error');
    document.getElementById('errorMessage').textContent = message;
}

// ===== History Page Rendering =====

/**
 * Render history stats bar
 * @param {Object} stats
 */
export function renderHistoryStats(stats) {
    const container = document.getElementById('historyStats');
    container.innerHTML = `
    <div class="history-stat-card">
      <span class="history-stat-value purple">${stats.total}</span>
      <span class="history-stat-label">总词汇</span>
    </div>
    <div class="history-stat-card">
      <span class="history-stat-value green">${stats.mastered}</span>
      <span class="history-stat-label">已掌握</span>
    </div>
    <div class="history-stat-card">
      <span class="history-stat-value amber">${stats.due}</span>
      <span class="history-stat-label">待复习</span>
    </div>
    <div class="history-stat-card">
      <span class="history-stat-value cyan">${stats.learning}</span>
      <span class="history-stat-label">学习中</span>
    </div>
  `;
}

/**
 * Render the history word list
 * @param {Array} words
 * @param {Function} onDelete - callback(word)
 * @param {Function} onLookup - callback(word)
 */
export function renderHistoryList(words, onDelete, onLookup) {
    const container = document.getElementById('historyList');
    const emptyEl = document.getElementById('emptyHistory');

    if (words.length === 0) {
        container.innerHTML = '';
        container.appendChild(emptyEl || createEmptyHistory());
        return;
    }

    container.innerHTML = '';

    words.forEach((entry) => {
        const item = document.createElement('div');
        item.className = 'history-item';
        item.addEventListener('click', (e) => {
            if (!e.target.closest('.history-delete-btn')) {
                onLookup(entry.word);
            }
        });

        const levelClass = `level-${Math.min(entry.level, 6)}`;
        const levelLabel = LEVEL_LABELS[Math.min(entry.level, LEVEL_LABELS.length - 1)];
        const dateStr = formatDate(entry.addedAt);

        item.innerHTML = `
      <div class="history-word-info">
        <div class="history-word">${escapeHtml(entry.word)}</div>
        <div class="history-translation">${escapeHtml(entry.translation || '')}</div>
      </div>
      <div class="history-meta">
        <span class="history-date">${dateStr}</span>
        <span class="level-badge ${levelClass}">${levelLabel}</span>
      </div>
      <button class="history-delete-btn" title="删除" data-word="${escapeHtml(entry.word)}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 6h18"></path>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path>
          <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
      </button>
    `;

        const deleteBtn = item.querySelector('.history-delete-btn');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            onDelete(entry.word);
            item.style.transform = 'translateX(100%)';
            item.style.opacity = '0';
            item.style.transition = 'all 0.3s ease';
            setTimeout(() => item.remove(), 300);
        });

        container.appendChild(item);
    });
}

// ===== Review Page Rendering =====

/**
 * Show/hide review states
 * @param {'noReview'|'card'|'complete'} state
 */
export function showReviewState(state) {
    document.getElementById('noReviewState').classList.toggle('hidden', state !== 'noReview');
    document.getElementById('reviewCardContainer').classList.toggle('hidden', state !== 'card');
    document.getElementById('reviewComplete').classList.toggle('hidden', state !== 'complete');
}

/**
 * Render a flashcard for review
 * @param {Object} wordEntry
 * @param {number} current - 1-based index
 * @param {number} total
 */
export function renderFlashcard(wordEntry, current, total) {
    // Reset flip state
    document.getElementById('flashcardInner').classList.remove('flipped');

    // Progress
    const progressPct = ((current - 1) / total) * 100;
    document.getElementById('reviewProgressFill').style.width = `${progressPct}%`;
    document.getElementById('reviewProgressText').textContent = `${current} / ${total}`;

    // Front
    document.getElementById('flashcardWord').textContent = wordEntry.word;
    document.getElementById('flashcardPhonetic').textContent = wordEntry.phonetic || '';

    // Back
    document.getElementById('flashcardBackWord').textContent = wordEntry.word;
    document.getElementById('flashcardTranslation').textContent = wordEntry.translation || '';

    // First English definition
    let defText = '';
    if (wordEntry.meanings && wordEntry.meanings.length > 0) {
        const firstMeaning = wordEntry.meanings[0];
        if (firstMeaning.definitions && firstMeaning.definitions.length > 0) {
            defText = `(${firstMeaning.partOfSpeech}) ${firstMeaning.definitions[0].definition}`;
        }
    }
    document.getElementById('flashcardDefinition').textContent = defText;

    // Level info
    const levelLabel = LEVEL_LABELS[Math.min(wordEntry.level, LEVEL_LABELS.length - 1)];
    document.getElementById('reviewLevelInfo').textContent = `当前等级: ${levelLabel} · 已复习 ${wordEntry.reviewCount} 次`;
}

/**
 * Render review completion summary
 * @param {number} remembered
 * @param {number} forgot
 */
export function renderReviewComplete(remembered, forgot) {
    showReviewState('complete');

    const progressFill = document.getElementById('reviewProgressFill');
    progressFill.style.width = '100%';

    const summary = document.getElementById('reviewSummary');
    summary.innerHTML = `
    <div class="summary-item">
      <span class="summary-value green">${remembered}</span>
      <span class="summary-label">记住了</span>
    </div>
    <div class="summary-item">
      <span class="summary-value red">${forgot}</span>
      <span class="summary-label">忘记了</span>
    </div>
  `;
}

/**
 * Render next review info
 * @param {number|null} nextReviewTime
 */
export function renderNextReviewInfo(nextReviewTime) {
    const el = document.getElementById('nextReviewInfo');
    if (!nextReviewTime) {
        el.textContent = '收录更多单词后将自动安排复习';
        return;
    }

    const diff = nextReviewTime - Date.now();
    if (diff <= 0) {
        el.textContent = '有单词已经可以复习了！';
        return;
    }

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 24) {
        const days = Math.floor(hours / 24);
        el.textContent = `下次复习在 ${days} 天后`;
    } else if (hours > 0) {
        el.textContent = `下次复习在 ${hours} 小时 ${minutes} 分钟后`;
    } else {
        el.textContent = `下次复习在 ${minutes} 分钟后`;
    }
}

/**
 * Update header stat badges
 * @param {number} totalWords
 * @param {number} dueWords
 */
export function updateHeaderStats(totalWords, dueWords) {
    document.getElementById('totalWordsCount').textContent = totalWords;
    document.getElementById('dueWordsCount').textContent = dueWords;

    // Nav badges
    const reviewBadge = document.getElementById('reviewBadge');
    if (dueWords > 0) {
        reviewBadge.classList.remove('hidden');
        reviewBadge.textContent = dueWords;
    } else {
        reviewBadge.classList.add('hidden');
    }
}

// ===== Helpers =====

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function formatDate(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    if (diff < 60 * 1000) return '刚刚';
    if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)}分钟前`;
    if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)}小时前`;
    if (diff < 7 * 24 * 60 * 60 * 1000) return `${Math.floor(diff / 86400000)}天前`;

    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}月${day}日`;
}

function createEmptyHistory() {
    const div = document.createElement('div');
    div.className = 'empty-history';
    div.id = 'emptyHistory';
    div.innerHTML = `
    <span class="empty-emoji">📝</span>
    <h3>还没有收录任何单词</h3>
    <p>去查词页面搜索单词吧！</p>
  `;
    return div;
}
