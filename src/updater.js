// Auto-update via electron-updater + GitHub Releases.
// Checa updates ao abrir o app, baixa em background, instala no próximo restart.

const { autoUpdater } = require('electron-updater');

let mainWindowRef = null;

function send(channel, payload) {
  if (mainWindowRef && !mainWindowRef.isDestroyed()) {
    mainWindowRef.webContents.send(channel, payload);
  }
}

function log(...args) {
  console.log('[updater]', ...args);
}

function setup(mainWindow) {
  mainWindowRef = mainWindow;

  // Configurações
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;

  autoUpdater.on('checking-for-update', () => {
    log('checando atualizações…');
    send('updater:status', { state: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    log('update disponível:', info.version);
    send('updater:status', { state: 'available', version: info.version });
  });

  autoUpdater.on('update-not-available', () => {
    log('nenhum update disponível');
    send('updater:status', { state: 'up-to-date' });
  });

  autoUpdater.on('error', (err) => {
    log('erro:', err?.message || err);
    send('updater:status', { state: 'error', message: err?.message || String(err) });
  });

  autoUpdater.on('download-progress', (p) => {
    send('updater:status', {
      state: 'downloading',
      percent: p.percent,
      bytesPerSecond: p.bytesPerSecond,
      transferred: p.transferred,
      total: p.total,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    log('update baixado:', info.version);
    send('updater:status', { state: 'downloaded', version: info.version });
  });

  // Checa após 5s pra não atrapalhar startup
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((e) => log('checkForUpdates falhou:', e?.message));
  }, 5000);

  // Recheca a cada 4h
  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 4 * 60 * 60 * 1000);
}

function quitAndInstall() {
  autoUpdater.quitAndInstall();
}

function checkNow() {
  return autoUpdater.checkForUpdates();
}

module.exports = { setup, quitAndInstall, checkNow };
