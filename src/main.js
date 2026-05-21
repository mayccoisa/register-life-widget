const {
  app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, screen, Notification,
} = require('electron');
const path = require('path');
const api = require('./api');
const auth = require('./auth');
const { getTrayIcon, getAppIcon } = require('./icon');
const updater = require('./updater');

let mainWindow = null;
let tray = null;

const WINDOW_WIDTH = 360;
const WINDOW_HEIGHT = 560;

// ========== Janela ==========
function createWindow() {
  mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    show: false,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#1a1a1a',
    icon: getAppIcon(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function positionWindowNearTray() {
  if (!mainWindow) return;
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.workAreaSize;
  mainWindow.setPosition(width - WINDOW_WIDTH - 16, height - WINDOW_HEIGHT - 16);
}

function toggleWindow() {
  if (!mainWindow) return;
  if (mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    positionWindowNearTray();
    mainWindow.show();
    mainWindow.focus();
  }
}

// ========== Tray ==========
function createTray() {
  tray = new Tray(getTrayIcon('idle'));
  tray.setToolTip('Register Life Widget');

  const menu = Menu.buildFromTemplate([
    { label: 'Mostrar/Ocultar', click: toggleWindow },
    { type: 'separator' },
    {
      label: 'Sair',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
  tray.on('click', toggleWindow);
}

function setTrayState(state, tooltip) {
  if (!tray) return;
  tray.setImage(getTrayIcon(state));
  tray.setToolTip(tooltip || 'Register Life Widget');
}

// ========== Notificações ==========
function notify(title, body, { silent = false } = {}) {
  if (!Notification.isSupported()) return;
  const n = new Notification({
    title,
    body,
    icon: getAppIcon(),
    silent,
  });
  n.on('click', () => {
    if (mainWindow) {
      positionWindowNearTray();
      mainWindow.show();
      mainWindow.focus();
    }
  });
  n.show();
}

// ========== IPC helpers ==========
async function withToken(handler) {
  const token = await auth.getValidToken();
  if (!token) {
    const err = new Error('NOT_AUTHENTICATED');
    err.code = 'NOT_AUTHENTICATED';
    throw err;
  }
  return handler(token);
}

async function withApiKey(handler) {
  // Exige sessão válida (login JWT) E api key configurada
  const token = await auth.getValidToken();
  if (!token) {
    const err = new Error('NOT_AUTHENTICATED');
    err.code = 'NOT_AUTHENTICATED';
    throw err;
  }
  const apiKey = await auth.getApiKey();
  if (!apiKey) {
    const err = new Error('API key não configurada');
    err.code = 'NO_API_KEY';
    err.status = 412;
    throw err;
  }
  return handler(apiKey);
}

function safe(fn) {
  return async (...args) => {
    try {
      return { ok: true, data: await fn(...args) };
    } catch (e) {
      return {
        ok: false,
        error: {
          message: e.message || String(e),
          code: e.code || (e.status === 401 ? 'NOT_AUTHENTICATED' : undefined),
          status: e.status,
        },
      };
    }
  };
}

// ========== IPC handlers ==========
ipcMain.handle('app:quit', () => { app.isQuitting = true; app.quit(); });
ipcMain.handle('app:hide', () => { if (mainWindow) mainWindow.hide(); });

ipcMain.handle('app:setTrayState', (_e, { state, tooltip }) => {
  setTrayState(state, tooltip);
});

ipcMain.handle('app:notify', (_e, { title, body, silent }) => {
  notify(title, body, { silent });
});

ipcMain.handle('updater:check', () => updater.checkNow().catch(() => null));
ipcMain.handle('updater:install', () => updater.quitAndInstall());

ipcMain.handle('auth:status', safe(async () => {
  const token = await auth.getValidToken();
  if (!token) return { authenticated: false };
  const session = await auth.loadSession();
  return {
    authenticated: true,
    user: session?.user || null,
    hasApiKey: !!(session?.api_key),
  };
}));

ipcMain.handle('auth:login', safe(async (_e, { email, password }) => {
  const result = await auth.login(email, password);
  const session = await auth.loadSession();
  return { user: result.user || null, hasApiKey: !!(session?.api_key) };
}));

ipcMain.handle('auth:logout', safe(async () => {
  await auth.logout();
  return true;
}));

ipcMain.handle('auth:getApiKey', safe(async () => {
  const key = await auth.getApiKey();
  return { hasApiKey: !!key, apiKey: key || null };
}));

ipcMain.handle('auth:setApiKey', safe(async (_e, { apiKey }) => {
  await auth.saveApiKey(apiKey || null);
  return true;
}));

ipcMain.handle('tasks:list', safe(async () => withApiKey((k) => api.listTasks(k))));
ipcMain.handle('tasks:get', safe(async (_e, id) => withApiKey((k) => api.getTask(k, id))));
ipcMain.handle('tasks:setStatus', safe(async (_e, { id, status }) =>
  withApiKey((k) => api.updateTaskStatus(k, id, status))
));
ipcMain.handle('tasks:create', safe(async (_e, payload) =>
  withApiKey((k) => api.createTask(k, payload))
));
ipcMain.handle('tasks:update', safe(async (_e, { id, payload }) =>
  withApiKey((k) => api.updateTask(k, id, payload))
));

ipcMain.handle('timer:start', safe(async (_e, { id }) => withApiKey((k) => api.startTimer(k, id))));
ipcMain.handle('timer:stop', safe(async (_e, { id }) => withApiKey((k) => api.stopTimer(k, id))));
ipcMain.handle('timer:pause', safe(async (_e, { id }) => withApiKey((k) => api.pauseTimer(k, id))));
ipcMain.handle('timer:resume', safe(async (_e, { id }) => withApiKey((k) => api.resumeTimer(k, id))));
ipcMain.handle('timer:active', safe(async (_e, { id }) => withApiKey((k) => api.getActiveTimer(k, id))));

ipcMain.handle('pomodoro:list', safe(async () => withApiKey((k) => api.listPomodoros(k))));
ipcMain.handle('pomodoro:create', safe(async (_e, payload) =>
  withApiKey((k) => api.createPomodoro(k, payload))
));
ipcMain.handle('pomodoro:control', safe(async (_e, { action, extra }) =>
  withApiKey((k) => api.pomodoroControl(k, action, extra))
));

// ========== Lifecycle ==========
if (process.platform === 'win32') {
  app.setAppUserModelId('com.weon.registerlife.widget');
}

const startedHidden =
  process.argv.includes('--hidden') ||
  (app.getLoginItemSettings && app.getLoginItemSettings().wasOpenedAsHidden);

function ensureAutoLaunch() {
  if (process.platform !== 'win32' && process.platform !== 'darwin') return;
  if (!app.isPackaged) return; // em dev, não registra auto-start
  try {
    app.setLoginItemSettings({
      openAtLogin: true,
      openAsHidden: true,
      args: ['--hidden'],
    });
  } catch (e) {
    console.warn('[autostart] falha ao configurar:', e);
  }
}

app.whenReady().then(() => {
  ensureAutoLaunch();
  createWindow();
  createTray();
  positionWindowNearTray();
  if (!startedHidden) mainWindow.show();

  globalShortcut.register('Control+Shift+T', () => {
    toggleWindow();
    if (mainWindow) mainWindow.webContents.send('global-shortcut:toggle-timer');
  });

  // Auto-update — só faz sentido em build empacotado
  if (app.isPackaged) {
    try { updater.setup(mainWindow); } catch (e) { console.warn('[updater] falha ao iniciar:', e); }
  }
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', (e) => e.preventDefault());
