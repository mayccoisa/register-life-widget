// Garante que há uma API key disponível para os testes E2E.
// Ordem de resolução:
//   1) process.env.RL_API_KEY (CI / execução manual)
//   2) extrai da sessão real do app via scripts/extract-key.js (DPAPI)
// A chave fica apenas no ambiente do processo de teste — nunca é commitada.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

module.exports = async () => {
  if (process.env.RL_API_KEY && process.env.RL_API_KEY.trim()) {
    return;
  }

  const root = path.join(__dirname, '..', '..');
  const keyFile = path.join(__dirname, '..', '.runtime', 'apikey.txt');
  const electronPath = require('electron'); // em Node puro, retorna o caminho do binário

  try {
    execFileSync(electronPath, [path.join(root, 'scripts', 'extract-key.js')], {
      cwd: root,
      stdio: 'inherit',
      timeout: 60_000,
    });
  } catch (e) {
    throw new Error(
      'Não consegui extrair a API key da sessão do app. ' +
      'Faça login no Register Life Widget uma vez, ou defina RL_API_KEY no ambiente. ' +
      'Detalhe: ' + e.message
    );
  }

  let key = '';
  try { key = fs.readFileSync(keyFile, 'utf8').trim(); } catch {}
  if (!key) {
    throw new Error(
      'API key não encontrada. Faça login no app (tela de API Key) ou defina RL_API_KEY no ambiente.'
    );
  }
  process.env.RL_API_KEY = key;
};
