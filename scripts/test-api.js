// Script de teste — bate direto no endpoint POST /tasks
// usando a sessão já salva pelo widget (DPAPI/safeStorage).
//
// Uso: npx electron scripts/test-api.js
//
// Pré-requisito: ter feito login no widget pelo menos uma vez nessa máquina,
// pra existir o session.bin em userData.

const path = require('path');
const { app } = require('electron');

// Força o mesmo userData do widget (package.json name = register-life-widget)
app.setPath('userData', path.join(app.getPath('appData'), 'register-life-widget'));

const auth = require('../src/auth');
const api = require('../src/api');

app.whenReady().then(async () => {
  console.log('--- Teste direto da API ---');

  console.log('userData:', app.getPath('userData'));
  const session = await auth.loadSession();
  if (!session) {
    console.error('SEM SESSÃO no disco.');
    app.exit(1);
    return;
  }
  console.log('Session carregada. Campos:', Object.keys(session));
  console.log('validated_at:', session.validated_at, '→', session.validated_at ? new Date(session.validated_at).toISOString() : '—');
  console.log('expires_at:', session.expires_at);

  const token = await auth.getValidToken();
  if (!token) {
    console.error('Token inválido/expirado. Faça login novamente no widget.');
    app.exit(1);
    return;
  }
  console.log('Token OK (primeiros 12 chars):', token.slice(0, 12) + '…');

  // Lista workspaces pra pegar um id válido
  let workspaceId = null;
  try {
    const tasks = await api.listTasks(token);
    const arr = Array.isArray(tasks) ? tasks : (tasks?.data || tasks?.tasks || []);
    for (const t of arr) {
      if (t.workspace?.id) { workspaceId = t.workspace.id; break; }
    }
    console.log('Workspace de teste:', workspaceId || '(sem — vai enviar sem workspace_id)');
  } catch (e) {
    console.error('Falha ao listar tarefas:', e.status, e.message);
  }

  const today = new Date().toISOString().slice(0, 10);
  const payload = {
    title: 'TESTE_API_DIRETO_' + new Date().toISOString(),
    status: 'todo',
    due_date: today,
  };
  if (workspaceId) payload.workspace_id = workspaceId;

  console.log('\nEnviando POST /tasks com body:');
  console.log(JSON.stringify(payload, null, 2));

  try {
    const res = await api.createTask(token, payload);
    console.log('\n✅ SUCESSO. Resposta:');
    console.log(JSON.stringify(res, null, 2));
  } catch (e) {
    console.error('\n❌ ERRO HTTP', e.status, '-', e.message);
    console.error('Body da resposta:', JSON.stringify(e.body, null, 2));
  }

  app.exit(0);
});
