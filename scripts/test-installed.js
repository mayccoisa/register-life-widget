// Valida que o BUILD EMPACOTADO está OK: gera o app desempacotado com
// electron-builder e roda o E2E contra o executável real (RL_E2E_BIN).
// Isso aproxima do "quando for instalar o arquivo, está tudo certo".
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function run(cmd, env) {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { cwd: ROOT, stdio: 'inherit', env: { ...process.env, ...env } });
}

// 1) Build desempacotado (mais rápido que o instalador NSIS, mesmo código empacotado).
run('npm run build:icons');
run('npx electron-builder --dir');

// 2) Localiza o .exe gerado em dist/win-unpacked.
const unpacked = path.join(ROOT, 'dist', 'win-unpacked');
const exe = fs.readdirSync(unpacked).find((f) => f.toLowerCase().endsWith('.exe'));
if (!exe) {
  console.error('Executável não encontrado em', unpacked);
  process.exit(1);
}
const exePath = path.join(unpacked, exe);
console.log('\nApp empacotado:', exePath);

// 3) Roda o E2E apontando para o binário empacotado.
run('npx playwright test', { RL_E2E_BIN: exePath });

console.log('\n✓ Build empacotado validado pelo E2E.');
