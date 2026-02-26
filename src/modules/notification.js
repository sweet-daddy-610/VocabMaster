/**
 * Notification Module
 * Handles browser notification permission and review reminders
 */

import { getDueWordCount } from './ebbinghaus.js';

let checkInterval = null;

/**
 * Request notification permission from the user
 * @returns {Promise<string>} 'granted', 'denied', or 'default'
 */
export async function requestPermission() {
    if (!('Notification' in window)) {
        console.warn('Browser does not support notifications');
        return 'denied';
    }
    if (Notification.permission === 'granted') return 'granted';
    if (Notification.permission === 'denied') return 'denied';

    const permission = await Notification.requestPermission();
    return permission;
}

/**
 * Show a browser notification
 * @param {string} title
 * @param {string} body
 * @param {Object} options
 */
export function showNotification(title, body, options = {}) {
    if (Notification.permission !== 'granted') return;

    const notification = new Notification(title, {
        body,
        icon: '📖',
        badge: '📖',
        tag: 'vocabmaster-review',
        renotify: true,
        ...options,
    });

    notification.onclick = () => {
        window.focus();
        // Navigate to review page
        const event = new CustomEvent('navigate', { detail: 'pageReview' });
        window.dispatchEvent(event);
        notification.close();
    };

    // Auto-close after 10 seconds
    setTimeout(() => notification.close(), 10000);
}

/**
 * Check for due words and show notification if any
 */
async function checkAndNotify() {
    try {
        const dueCount = await getDueWordCount();
        if (dueCount > 0) {
            showNotification(
                '📚 复习时间到！',
                `你有 ${dueCount} 个单词需要复习，快来巩固记忆吧！`,
            );
        }
    } catch (error) {
        console.error('Notification check error:', error);
    }
}

/**
 * Start periodic review checking (every 30 minutes)
 */
export function scheduleReviewCheck() {
    // Clear any existing interval
    if (checkInterval) clearInterval(checkInterval);

    // Check immediately
    checkAndNotify();

    // Then check every 30 minutes
    checkInterval = setInterval(checkAndNotify, 30 * 60 * 1000);
}

/**
 * Stop periodic review checking
 */
export function stopReviewCheck() {
    if (checkInterval) {
        clearInterval(checkInterval);
        checkInterval = null;
    }
}
