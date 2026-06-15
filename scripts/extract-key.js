// Extrai a API key da sessão real do usuário (DPAPI/safeStorage) e grava em
// tests/.runtime/apikey.txt (gitignored). Usado pelo global-setup do E2E quando
// RL_API_KEY não está definido no ambiente. NÃO imprime a chave no stdout.
const { app, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');

// Rodando como `electron scripts/extract-key.js`, app.getName() = "Electron",
// então o userData padrão NÃO é o do app. Procuramos a sessão nos perfis reais.
const CANDIDATE_PROFILES = [
  'register-life-widget',
  'Register Life Widget',
  'register-life-electron',
];

function findSessionFile() {
  const appData = app.getPath('appData'); // ...\Roaming
  for (const name of CANDIDATE_PROFILES) {
    const f = path.join(appData, name, 'session.bin');
    if (fs.existsSync(f)) return f;
  }
  return null;
}

app.whenReady().then(() => {
  let status = 'NO_SESSION';
  try {
    const file = findSessionFile();
    if (!file) {
      process.stdout.write('NO_SESSION\n');
      app.quit();
      return;
    }
    const data = fs.readFileSync(file);
    let json;
    try { json = safeStorage.decryptString(data); }
    catch { json = data.toString('utf8'); }
    const session = JSON.parse(json);
    const key = session.api_key || '';
    if (key) {
      const outDir = path.join(__dirname, '..', 'tests', '.runtime');
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, 'apikey.txt'), key, 'utf8');
      status = 'OK';
    } else {
      status = 'NO_KEY';
    }
  } catch (e) {
    status = 'ERR: ' + e.message;
  }
  process.stdout.write(status + '\n');
  app.quit();
});
