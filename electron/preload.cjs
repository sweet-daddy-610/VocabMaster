/**
 * VocabMaster Electron Preload Script
 * Securely exposes IPC channels to renderer processes
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Open the main VocabMaster app window
    openMainApp: (searchTerm) => ipcRenderer.send('open-main-app', searchTerm || ''),

    // Close/hide the widget popup
    closeWidget: () => ipcRenderer.send('close-widget'),

    // Update tray icon badge
    updateTray: (hasDueWords) => ipcRenderer.send('update-tray', hasDueWords),

    // Notify widget that data has changed (e.g. after import)
    dataChanged: () => ipcRenderer.send('data-changed'),

    // Listen for widget-shown event (refresh data)
    onWidgetShown: (callback) => ipcRenderer.on('widget-shown', callback),

    // Listen for review check signal
    onCheckReviews: (callback) => ipcRenderer.on('check-reviews', callback),

    // Listen for search term from main window
    onSearchTerm: (callback) => ipcRenderer.on('search-term', (_event, term) => callback(term)),
});
