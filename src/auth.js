// Storage de credenciais usando Electron safeStorage (DPAPI no Windows).
// O token é criptografado pelo SO e salvo num arquivo dentro de userData.
// Vantagem sobre keytar: zero dependência nativa, funciona em qualquer caminho.

const fs = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');
const api = require('./api');

const FILE_NAME = 'session.bin';
const VALIDATION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

function isValidationExpired(validated_at) {
  if (!validated_at) return true;
  return (Date.now() - validated_at) >= VALIDATION_MAX_AGE_MS;
}

function filePath() {
  return path.join(app.getPath('userData'), FILE_NAME);
}

async function saveSession(session) {
  const json = JSON.stringify(session);
  let data;
  if (safeStorage.isEncryptionAvailable()) {
    data = safeStorage.encryptString(json);
  } else {
    // Fallback: salva em texto puro (raro — só se o SO não tiver crypto disponível)
    console.warn('[auth] safeStorage não disponível, salvando em texto puro.');
    data = Buffer.from(json, 'utf8');
  }
  fs.writeFileSync(filePath(), data, { mode: 0o600 });
}

async function loadSession() {
  try {
    const data = fs.readFileSync(filePath());
    let json;
    if (safeStorage.isEncryptionAvailable()) {
      try { json = safeStorage.decryptString(data); }
      catch { json = data.toString('utf8'); } // pode ter sido salvo em texto puro
    } else {
      json = data.toString('utf8');
    }
    return JSON.parse(json);
  } catch {
    return null;
  }
}

async function clearSession() {
  try { fs.unlinkSync(filePath()); } catch {}
}

function isExpired(expires_at) {
  if (!expires_at) return false;
  const exp = typeof expires_at === 'number'
    ? expires_at * 1000
    : new Date(expires_at).getTime();
  if (Number.isNaN(exp)) return false;
  return Date.now() >= (exp - 60_000);
}

async function getValidToken() {
  const session = await loadSession();
  if (!session) return null;
  if (isValidationExpired(session.validated_at)) {
    await clearSession();
    return null;
  }
  if (!isExpired(session.expires_at)) return session.token;
  if (!session.refresh_token) return session.token;
  try {
    const refreshed = await api.refresh(session.refresh_token);
    await saveSession({ ...session, token: refreshed.token, expires_at: refreshed.expires_at });
    return refreshed.token;
  } catch {
    await clearSession();
    return null;
  }
}

async function login(email, password) {
  const result = await api.login(email, password);
  // Preserva api_key existente se já estava salva (re-login não deve apagar a chave)
  const existing = await loadSession();
  await saveSession({
    ...result,
    api_key: existing?.api_key || null,
    validated_at: Date.now(),
  });
  return result;
}

async function saveApiKey(apiKey) {
  const session = (await loadSession()) || {};
  session.api_key = apiKey || null;
  await saveSession(session);
}

async function getApiKey() {
  const session = await loadSession();
  return session?.api_key || null;
}

async function logout() {
  const session = await loadSession();
  if (session?.token) {
    try { await api.logout(session.token); } catch {}
  }
  await clearSession();
}

module.exports = { login, logout, loadSession, getValidToken, saveSession, clearSession, saveApiKey, getApiKey };
