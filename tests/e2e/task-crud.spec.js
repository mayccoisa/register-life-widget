const { test, expect } = require('@playwright/test');
const { launchApp, gotoTasks, deleteTasksByMarker } = require('./helpers');

// Fluxo completo da feature de tarefas, exercitando a UI real do app:
// criar → editar (e garantir que salvou) → excluir → garantir que sumiu.
// Roda contra a API real; tudo que cria é removido na limpeza.
test('tarefa: criar, editar, verificar e excluir', async () => {
  const { app, win, cleanup } = await launchApp();
  const stamp = `${Date.now()}-${Math.floor(performance.now())}`;
  const marker = `E2E-${stamp}`;
  const title = `${marker} tarefa`;
  const edited = `${marker} tarefa (editada)`;

  try {
    await gotoTasks(win);

    // ---------- CRIAR ----------
    await win.locator('#btn-new-task').click();
    await win.waitForSelector('#new-task-modal:not([hidden])', { timeout: 10_000 });
    await win.locator('#nt-title').fill(title);
    await win.locator('#nt-submit').click();
    await win.waitForSelector('#new-task-modal[hidden]', { timeout: 20_000 });

    await expect(win.locator('#task-list')).toContainText(title, { timeout: 20_000 });

    // ---------- EDITAR ----------
    await win.locator(`#task-list .task-item:has-text("${title}") .task-info`).first().click();
    await win.waitForSelector('#screen-details.active', { timeout: 10_000 });

    await win.locator('#edit-title').fill(edited);
    // input dispara refreshDirty → habilita o botão salvar
    await expect(win.locator('#btn-save-details')).toBeEnabled({ timeout: 5_000 });
    await win.locator('#btn-save-details').click();
    // após salvar com sucesso o app re-renderiza e o botão volta a ficar desabilitado
    await expect(win.locator('#btn-save-details')).toBeDisabled({ timeout: 20_000 });

    // ---------- VERIFICAR EDIÇÃO ----------
    await win.locator('#btn-back').click();
    await win.waitForSelector('#screen-tasks.active', { timeout: 10_000 });
    await expect(win.locator('#task-list')).toContainText(edited, { timeout: 20_000 });
    await expect(win.locator('#task-list')).not.toContainText(`${title}`, { timeout: 10_000 });

    // confirma na fonte (API) que o título realmente mudou
    const found = await win.evaluate(async (t) => {
      const res = await window.widget.tasks.list();
      const d = res && res.data;
      const all = Array.isArray(d) ? d : (d?.tasks || d?.items || d?.data || d?.results || []);
      return all.find((x) => (x.title || '') === t) || null;
    }, edited);
    expect(found, 'tarefa editada deve existir na API').toBeTruthy();
    expect(found.id).toBeTruthy();

    // ---------- EXCLUIR ----------
    const del = await win.evaluate((id) => window.widget.tasks.delete(id), found.id);
    expect(del && del.ok, `delete falhou: ${JSON.stringify(del && del.error)}`).toBeTruthy();

    // some da lista após refresh
    await win.locator('#btn-refresh').click();
    await expect(win.locator('#task-list')).not.toContainText(edited, { timeout: 20_000 });

    // confirma na API que sumiu mesmo
    const stillThere = await win.evaluate(async (t) => {
      const res = await window.widget.tasks.list();
      const d = res && res.data;
      const all = Array.isArray(d) ? d : (d?.tasks || d?.items || d?.data || d?.results || []);
      return all.some((x) => (x.title || '') === t);
    }, edited);
    expect(stillThere, 'tarefa não deveria mais existir na API').toBeFalsy();
  } finally {
    // Limpeza defensiva: remove qualquer tarefa deste teste que tenha sobrado.
    try { await deleteTasksByMarker(win, marker); } catch {}
    await cleanup();
  }
});
