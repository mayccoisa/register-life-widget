// Helpers para subir o app Electron em um perfil isolado e autenticado.
const { _electron: electron } = require('@playwright/test');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

function resolveApiKey() {
  if (process.env.RL_API_KEY && process.env.RL_API_KEY.trim()) {
    return process.env.RL_API_KEY.trim();
  }
  // Fallback: arquivo gerado pelo global-setup (caso o env não tenha propagado).
  try {
    const f = path.join(__dirname, '..', '.runtime', 'apikey.txt');
    const k = fs.readFileSync(f, 'utf8').trim();
    if (k) return k;
  } catch {}
  throw new Error('RL_API_KEY ausente — global-setup deveria tê-la resolvido.');
}

// Cria um userData temporário já "logado": token dummy (tasks usam X-API-Key, não o token)
// + a API key real. Isso isola os testes do perfil do usuário e do app instalado.
function seedProfile(apiKey) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rl-e2e-'));
  const session = {
    token: 'e2e-dummy-token',
    refresh_token: 'e2e-dummy-refresh',
    expires_at: '2099-01-01T00:00:00.000Z',
    validated_at: Date.now(),
    api_key: apiKey,
    user: { email: 'e2e@test.local' },
  };
  // Texto puro: loadSession() faz fallback de decrypt → toString(utf8) → JSON.parse.
  fs.writeFileSync(path.join(dir, 'session.bin'), JSON.stringify(session), 'utf8');
  return dir;
}

// Sobe o app. Se RL_E2E_BIN aponta para um executável empacotado, testa o build;
// senão roda em modo dev (electron .).
async function launchApp() {
  const apiKey = resolveApiKey();
  const userDataDir = seedProfile(apiKey);
  const bin = process.env.RL_E2E_BIN;

  const launchOpts = {
    env: { ...process.env, RL_E2E: '1', RL_API_KEY: apiKey },
    timeout: 60_000,
  };
  if (bin) {
    launchOpts.executablePath = bin;
    launchOpts.args = [`--user-data-dir=${userDataDir}`];
  } else {
    launchOpts.args = [ROOT, `--user-data-dir=${userDataDir}`];
  }

  const app = await electron.launch(launchOpts);
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');

  const cleanup = async () => {
    try { await app.close(); } catch {}
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
  };
  return { app, win, cleanup };
}

// Navega da tela inicial (loading → workspaces/tasks) até a lista de tarefas.
async function gotoTasks(win) {
  // Aguarda sair do loading e cair em workspaces ou tasks.
  await win.waitForFunction(() => {
    const ws = document.getElementById('screen-workspaces');
    const tk = document.getElementById('screen-tasks');
    return (ws && ws.classList.contains('active')) || (tk && tk.classList.contains('active'));
  }, null, { timeout: 30_000 });

  const onTasks = await win.evaluate(() =>
    document.getElementById('screen-tasks').classList.contains('active')
  );
  if (!onTasks) {
    // Está em workspaces → abre "Todas as tarefas" (primeiro item).
    await win.locator('#workspace-list .workspace-item').first().click();
  }
  await win.waitForSelector('#screen-tasks.active', { timeout: 15_000 });
}

// Remove via IPC qualquer tarefa cujo título contenha `marker` (limpeza).
async function deleteTasksByMarker(win, marker) {
  return win.evaluate(async (mk) => {
    const res = await window.widget.tasks.list();
    const d = res && res.data;
    const all = Array.isArray(d) ? d : (d?.tasks || d?.items || d?.data || d?.results || []);
    const hits = all.filter((t) => (t.title || '').includes(mk));
    const out = [];
    for (const t of hits) {
      const r = await window.widget.tasks.delete(t.id);
      out.push({ id: t.id, ok: !!(r && r.ok), error: r && r.error });
    }
    return out;
  }, marker);
}

module.exports = { launchApp, gotoTasks, deleteTasksByMarker, ROOT };
