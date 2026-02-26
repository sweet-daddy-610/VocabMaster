/**
 * VocabMaster Electron Main Process
 * Creates a MenuBar tray icon with a popup widget window
 */

const { app, BrowserWindow, Tray, nativeImage, ipcMain, screen, Menu } = require('electron');
const path = require('path');

// ===== Config =====
const WIDGET_WIDTH = 320;
const WIDGET_HEIGHT = 440;
const REVIEW_CHECK_INTERVAL = 60 * 1000; // 60 seconds
const IS_DEV = !app.isPackaged;
const VITE_DEV_URL = 'http://localhost:5173';

let tray = null;
let widgetWindow = null;
let mainWindow = null;
let reviewCheckTimer = null;

// ===== Tray Icon =====
function createEmptyIcon() {
    const buf = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAB' +
        'Nl7BcQAAAABJRU5ErkJggg==',
        'base64'
    );
    return nativeImage.createFromBuffer(buf, { scaleFactor: 2.0 });
}

// ===== Widget Window =====
function createWidgetWindow() {
    widgetWindow = new BrowserWindow({
        width: WIDGET_WIDTH,
        height: WIDGET_HEIGHT,
        show: false,
        frame: false,
        resizable: false,
        movable: false,
        skipTaskbar: true,
        alwaysOnTop: true,
        transparent: true,
        hasShadow: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    if (IS_DEV) {
        widgetWindow.loadURL(VITE_DEV_URL + '/widget.html');
    } else {
        widgetWindow.loadFile(path.join(__dirname, 'widget.html'));
    }

    widgetWindow.on('blur', () => {
        if (widgetWindow && widgetWindow.isVisible()) {
            widgetWindow.hide();
        }
    });

    widgetWindow.on('closed', () => {
        widgetWindow = null;
    });
}

// ===== Show Widget =====
function toggleWidget() {
    if (!widgetWindow) {
        createWidgetWindow();
    }

    if (widgetWindow.isVisible()) {
        widgetWindow.hide();
        return;
    }

    const trayBounds = tray.getBounds();
    const windowBounds = widgetWindow.getBounds();
    const display = screen.getDisplayNearestPoint({
        x: trayBounds.x,
        y: trayBounds.y,
    });

    const x = Math.round(
        trayBounds.x + trayBounds.width / 2 - windowBounds.width / 2
    );
    const y = Math.round(trayBounds.y + trayBounds.height + 4);

    const maxX = display.workArea.x + display.workArea.width - windowBounds.width;
    const finalX = Math.max(display.workArea.x, Math.min(x, maxX));

    widgetWindow.setPosition(finalX, y);
    widgetWindow.show();
    widgetWindow.focus();
    widgetWindow.webContents.send('widget-shown');
}

// ===== Main App Window =====
function createMainWindow(searchTerm = '') {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
        mainWindow.focus();
        if (searchTerm) {
            mainWindow.webContents.send('search-term', searchTerm);
        }
        return;
    }

    mainWindow = new BrowserWindow({
        width: 420,
        height: 750,
        minWidth: 360,
        minHeight: 600,
        titleBarStyle: 'hiddenInset',
        trafficLightPosition: { x: 15, y: 15 },
        backgroundColor: '#0f0f23',
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
            // Allow loading ES modules from file:// protocol
            // Safe for desktop apps that only load local bundled content
            webSecurity: false,
        },
    });

    if (IS_DEV) {
        mainWindow.loadURL(VITE_DEV_URL);
    } else {
        mainWindow.loadFile(path.join(process.resourcesPath, 'dist', 'index.html'));
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// ===== Tray Setup =====
function createTray() {
    tray = new Tray(createEmptyIcon());
    tray.setTitle('📖');
    tray.setToolTip('VocabMaster');

    tray.on('click', () => {
        toggleWidget();
    });

    tray.on('right-click', () => {
        const contextMenu = Menu.buildFromTemplate([
            {
                label: '打开 VocabMaster',
                click: () => createMainWindow(),
            },
            { type: 'separator' },
            {
                label: '退出',
                click: () => app.quit(),
            },
        ]);
        tray.popUpContextMenu(contextMenu);
    });
}

// ===== Review Check =====
function startReviewCheck() {
    reviewCheckTimer = setInterval(() => {
        if (widgetWindow && !widgetWindow.isDestroyed()) {
            widgetWindow.webContents.send('check-reviews');
        }
    }, REVIEW_CHECK_INTERVAL);
}

// ===== IPC Handlers =====
function setupIPC() {
    ipcMain.on('open-main-app', (_event, searchTerm) => {
        createMainWindow(searchTerm);
        if (widgetWindow && widgetWindow.isVisible()) {
            widgetWindow.hide();
        }
    });

    ipcMain.on('close-widget', () => {
        if (widgetWindow && widgetWindow.isVisible()) {
            widgetWindow.hide();
        }
    });

    ipcMain.on('update-tray', (_event, hasDueWords) => {
        if (tray) {
            tray.setTitle(hasDueWords ? '📖🔴' : '📖');
            tray.setToolTip(
                hasDueWords ? 'VocabMaster — 有词汇需要复习！' : 'VocabMaster'
            );
        }
    });

    ipcMain.on('data-changed', () => {
        if (widgetWindow && !widgetWindow.isDestroyed()) {
            widgetWindow.webContents.send('widget-shown');
        }
    });
}

// ===== App Lifecycle =====
app.whenReady().then(() => {
    if (app.dock) {
        app.dock.hide();
    }

    createTray();
    createWidgetWindow();
    setupIPC();
    startReviewCheck();
});

app.on('window-all-closed', (e) => {
    // Tray app stays alive
});

app.on('before-quit', () => {
    if (reviewCheckTimer) {
        clearInterval(reviewCheckTimer);
    }
});

app.on('activate', () => {
    toggleWidget();
});
