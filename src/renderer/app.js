// ============================================================
// Renderer — UI do Register Life Widget
// Login → Workspaces → Tasks → Details
// + Pomodoro + Notificações + Tray dinâmico
// ============================================================

const $ = (id) => document.getElementById(id);

const screens = {
  loading: $('screen-loading'),
  login: $('screen-login'),
  apikey: $('screen-apikey'),
  workspaces: $('screen-workspaces'),
  tasks: $('screen-tasks'),
  details: $('screen-details'),
  pomodoro: $('screen-pomodoro'),
};

const state = {
  allTasks: [],
  workspaces: [],
  apiWorkspaces: [],        // [{ id, name, color }] vindo de GET /workspaces
  stagesByWs: new Map(),    // wsId -> [{ id, name, order_index }]
  selectedWorkspaceId: null,
  selectedTaskId: null,

  // Timer de tarefa
  activeTaskId: null,
  timerStartedAt: null,
  accumulatedMs: 0,
  isPaused: false,

  // Sort / filter
  sortBy: 'default',
  filterCategoryId: null,
  taskCategories: [],    // [{ id, name, color }]

  // Pomodoro
  pomo: {
    phase: 'focus',          // 'focus' | 'break'
    running: false,
    paused: false,
    remainingSec: 25 * 60,
    totalSec: 25 * 60,
    intervalId: null,
    focusMin: 25,
    breakMin: 5,
  },
};

let tickInterval = null;
let currentScreen = 'loading';
let prevScreen = null;

// ============================================================
// Tema
// ============================================================
const THEME_KEY = 'rl-widget-theme';

function applyTheme(name) {
  const t = name === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', t);
  document.body.style.background = getComputedStyle(document.documentElement).getPropertyValue('--bg');
  const btn = $('btn-theme');
  if (btn) btn.textContent = t === 'light' ? '☀' : '🌙';
}

function loadTheme() {
  try { return localStorage.getItem(THEME_KEY) || 'dark'; } catch { return 'dark'; }
}

function toggleTheme() {
  const next = (document.documentElement.getAttribute('data-theme') === 'light') ? 'dark' : 'light';
  try { localStorage.setItem(THEME_KEY, next); } catch {}
  applyTheme(next);
}

// ============================================================
// Tray + notificações
// ============================================================
function refreshTray() {
  let s = 'idle';
  let tip = 'Register Life Widget';
  if (state.pomo.running && !state.pomo.paused) {
    s = 'pomodoro';
    tip = `Pomodoro ${state.pomo.phase === 'focus' ? 'foco' : 'pausa'} · ${formatMMSS(state.pomo.remainingSec)}`;
  } else if (state.activeTaskId && !state.isPaused) {
    s = 'running';
    const task = state.allTasks.find((t) => t.id === state.activeTaskId);
    tip = `Em andamento: ${task?.title || 'Tarefa'} · ${formatHMS(elapsedSeconds())}`;
  } else if (state.activeTaskId && state.isPaused) {
    s = 'paused';
    tip = 'Tarefa pausada';
  }
  window.widget.setTrayState(s, tip);
}

function notify(title, body, opts) {
  window.widget.notify(title, body, opts);
}

// ============================================================
// Navegação
// ============================================================
function showScreen(name) {
  if (currentScreen !== name) prevScreen = currentScreen;
  currentScreen = name;
  Object.values(screens).forEach((s) => s.classList.remove('active'));
  if (screens[name]) screens[name].classList.add('active');

  const isLogged = ['workspaces', 'tasks', 'details', 'pomodoro', 'apikey'].includes(name);
  $('btn-logout').hidden = !isLogged;
  $('btn-pomodoro').hidden = !['workspaces', 'tasks', 'details', 'pomodoro'].includes(name);
  $('btn-apikey').hidden = !isLogged;
  $('btn-refresh').hidden = !['workspaces', 'tasks', 'pomodoro'].includes(name);
  $('btn-back').hidden = !['tasks', 'details', 'pomodoro'].includes(name);

  if (name === 'workspaces') $('title').textContent = 'Workspaces';
  else if (name === 'tasks') {
    const ws = state.workspaces.find((w) => w.id === state.selectedWorkspaceId);
    $('title').textContent = ws ? ws.name : 'Todas as tarefas';
  } else if (name === 'details') $('title').textContent = 'Detalhes';
  else if (name === 'pomodoro') $('title').textContent = 'Pomodoro';
  else if (name === 'apikey') $('title').textContent = 'API Key';
  else $('title').textContent = 'Register Life';
}

function goBack() {
  if (currentScreen === 'pomodoro') {
    showScreen(prevScreen && prevScreen !== 'pomodoro' ? prevScreen : 'workspaces');
    if (currentScreen === 'workspaces') renderWorkspaceList();
    else if (currentScreen === 'tasks') renderTaskList();
    return;
  }
  if (currentScreen === 'details') {
    state.selectedTaskId = null;
    showScreen('tasks');
    renderTaskList();
  } else if (currentScreen === 'tasks') {
    state.selectedWorkspaceId = null;
    showScreen('workspaces');
    renderWorkspaceList();
  }
}

// ============================================================
// Status / erros
// ============================================================
function setStatus(text) { $('status-text').textContent = text; }

function showError(msg, bannerId = 'error-banner') {
  setStatus(msg);
  const banner = document.getElementById(bannerId);
  if (banner) { banner.textContent = msg; banner.hidden = false; }
  console.error('[widget]', msg);
}

function clearErrors() {
  ['error-banner', 'error-banner-ws', 'error-banner-pomo'].forEach((id) => {
    const b = document.getElementById(id);
    if (b) { b.hidden = true; b.textContent = ''; }
  });
  setStatus('v0.3.0');
}

function handleApiError(res, fallback = 'Erro', bannerId = 'error-banner') {
  if (!res || res.ok) return false;
  if (res.error?.code === 'NOT_AUTHENTICATED' || res.error?.status === 401) {
    showScreen('login');
    return true;
  }
  if (res.error?.code === 'NO_API_KEY') {
    openApiKeyScreen({ canSkip: false });
    return true;
  }
  const parts = [fallback];
  if (res.error?.status) parts.push(`HTTP ${res.error.status}`);
  if (res.error?.message) parts.push(res.error.message);
  showError(parts.join(' — '), bannerId);
  return true;
}

// ============================================================
// Helpers
// ============================================================
function formatHMS(totalSec) {
  const s = Math.max(0, Math.floor(totalSec));
  const h = String(Math.floor(s / 3600)).padStart(2, '0');
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const sec = String(s % 60).padStart(2, '0');
  return `${h}:${m}:${sec}`;
}

function formatMMSS(totalSec) {
  const s = Math.max(0, Math.floor(totalSec));
  const m = String(Math.floor(s / 60)).padStart(2, '0');
  const sec = String(s % 60).padStart(2, '0');
  return `${m}:${sec}`;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function labelStatus(s) {
  return ({ todo: 'a fazer', in_progress: 'fazendo', paused: 'pausada', done: 'feita' })[s] || s || '—';
}

function formatDate(d) {
  if (!d) return '—';
  try {
    const dt = new Date(d);
    if (isNaN(dt)) return d;
    return dt.toLocaleDateString('pt-BR');
  } catch { return d; }
}

function formatDateTime(d) {
  if (!d) return '—';
  try {
    const dt = new Date(d);
    if (isNaN(dt)) return d;
    return dt.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch { return d; }
}

// ============================================================
// Timer de tarefa
// ============================================================
function elapsedSeconds() {
  if (!state.activeTaskId) return 0;
  if (state.isPaused) return Math.floor(state.accumulatedMs / 1000);
  const startedMs = state.timerStartedAt ? new Date(state.timerStartedAt).getTime() : Date.now();
  return Math.floor((state.accumulatedMs + (Date.now() - startedMs)) / 1000);
}

function startTicker() {
  stopTicker();
  tickInterval = setInterval(() => {
    updateTimerDisplay();
    refreshTray();
  }, 1000);
  updateTimerDisplay();
  refreshTray();
}
function stopTicker() {
  if (tickInterval) { clearInterval(tickInterval); tickInterval = null; }
}

function updateTimerDisplay() {
  const wrap = $('global-timer');
  if (!state.activeTaskId) {
    wrap.hidden = true;
    wrap.classList.remove('running', 'paused');
    return;
  }
  wrap.hidden = false;
  wrap.classList.toggle('running', !state.isPaused);
  wrap.classList.toggle('paused', state.isPaused);

  const task = state.allTasks.find((t) => t.id === state.activeTaskId);
  $('gt-label').textContent = task ? task.title : 'Tarefa ativa';
  $('gt-value').textContent = formatHMS(elapsedSeconds());
  $('btn-pause-resume').textContent = state.isPaused ? '▶' : '⏸';
}

// ============================================================
// Carrega tarefas + deriva workspaces
// ============================================================
async function loadTasks() {
  clearErrors();
  const res = await window.widget.tasks.list();
  console.log('[widget] tasks response:', res);
  if (handleApiError(res, 'Falha ao carregar tarefas')) return;

  const d = res.data;
  const all = Array.isArray(d) ? d : (d?.tasks || d?.items || d?.data || d?.results || []);
  const open = new Set(['todo', 'in_progress', 'paused']);
  state.allTasks = all.filter((t) => open.has(t.status));

  const wsMap = new Map();
  // Pre-popula com workspaces conhecidos via API (mesmo os sem tarefas abertas)
  for (const ws of state.apiWorkspaces) {
    wsMap.set(ws.id, { id: ws.id, name: ws.name, color: ws.color || null, count: 0 });
  }
  for (const t of state.allTasks) {
    const ws = t.workspace || { id: '__none__', name: 'Sem workspace', color: null };
    const key = ws.id || '__none__';
    if (!wsMap.has(key)) wsMap.set(key, { id: key, name: ws.name || 'Sem nome', color: ws.color, count: 0 });
    wsMap.get(key).count++;
  }
  state.workspaces = [...wsMap.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  // Deriva categorias
  const catMap = new Map();
  for (const t of state.allTasks) {
    const c = t.category;
    if (!c) continue;
    const id = c.id || c.name || JSON.stringify(c);
    if (!catMap.has(id)) catMap.set(id, { id, name: c.name || String(c), color: c.color || null });
  }
  state.taskCategories = [...catMap.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  const active = state.allTasks.find((t) => t.active_timer && t.status === 'in_progress');
  if (active) {
    state.activeTaskId = active.id;
    state.timerStartedAt = active.active_timer.started_at;
    state.accumulatedMs = (active.total_time_seconds || 0) * 1000;
    state.isPaused = false;
    startTicker();
  } else {
    state.activeTaskId = null;
    state.isPaused = false;
    stopTicker();
    updateTimerDisplay();
  }

  setStatus(`${state.allTasks.length} tarefa(s) · ${state.workspaces.length} workspace(s)`);
  refreshTray();
}

// ============================================================
// Workspaces / stages (novos endpoints)
// ============================================================
async function loadWorkspaces() {
  const res = await window.widget.workspaces.list();
  if (!res.ok) {
    console.warn('[widget] falha ao carregar workspaces:', res.error);
    return [];
  }
  const d = res.data;
  const arr = Array.isArray(d) ? d : (d?.data || d?.workspaces || []);
  state.apiWorkspaces = arr
    .map((w) => ({ id: w.id, name: w.name, color: w.color || null }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  return state.apiWorkspaces;
}

async function getStagesFor(workspaceId) {
  if (!workspaceId) return [];
  if (state.stagesByWs.has(workspaceId)) return state.stagesByWs.get(workspaceId);
  const res = await window.widget.workspaces.stages(workspaceId);
  if (!res.ok) {
    console.warn('[widget] falha ao carregar stages:', res.error);
    return [];
  }
  const d = res.data;
  const arr = Array.isArray(d) ? d : (d?.data || d?.stages || []);
  const stages = arr
    .map((s) => ({ id: s.id, name: s.name, order_index: s.order_index ?? 0 }))
    .sort((a, b) => a.order_index - b.order_index);
  state.stagesByWs.set(workspaceId, stages);
  return stages;
}

async function populateStageSelect(sel, workspaceId, currentId) {
  if (!workspaceId) {
    sel.innerHTML = '<option value="">— sem workspace —</option>';
    sel.value = '';
    sel.disabled = true;
    return;
  }
  sel.disabled = false;
  sel.innerHTML = '<option value="">Carregando…</option>';
  const stages = await getStagesFor(workspaceId);
  const opts = ['<option value="">—</option>'];
  for (const s of stages) {
    opts.push(`<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)}</option>`);
  }
  sel.innerHTML = opts.join('');
  if (currentId && stages.some((s) => s.id === currentId)) sel.value = currentId;
  else sel.value = '';
}

// ============================================================
// Render: Workspaces
// ============================================================
function renderWorkspaceList() {
  const list = $('workspace-list');
  list.innerHTML = '';

  const liAll = document.createElement('li');
  liAll.className = 'workspace-item';
  liAll.innerHTML = `
    <div class="ws-color" style="background:#4f9eff"></div>
    <div class="ws-info">
      <div class="ws-name">Todas as tarefas</div>
      <div class="ws-meta">${state.allTasks.length} aberta(s)</div>
    </div>
    <div class="ws-arrow">›</div>
  `;
  liAll.addEventListener('click', () => openWorkspace(null));
  list.appendChild(liAll);

  if (!state.workspaces.length) {
    const li = document.createElement('li');
    li.className = 'task-item placeholder-item';
    li.textContent = 'Nenhum workspace.';
    list.appendChild(li);
    return;
  }

  for (const ws of state.workspaces) {
    const li = document.createElement('li');
    li.className = 'workspace-item';
    const color = ws.color || '#666';
    li.innerHTML = `
      <div class="ws-color" style="background:${escapeHtml(color)}"></div>
      <div class="ws-info">
        <div class="ws-name">${escapeHtml(ws.name)}</div>
        <div class="ws-meta">${ws.count} aberta(s)</div>
      </div>
      <div class="ws-arrow">›</div>
    `;
    li.addEventListener('click', () => openWorkspace(ws.id));
    list.appendChild(li);
  }
}

function pruneStaleFilters() {
  if (state.filterCategoryId && !visibleCategories().some((c) => c.id === state.filterCategoryId)) {
    state.filterCategoryId = null;
  }
  persistPrefs();
}

function openWorkspace(workspaceId) {
  state.selectedWorkspaceId = workspaceId;
  persistLastWorkspace(workspaceId);
  pruneStaleFilters();
  showScreen('tasks');
  renderTaskList();
}

// Após carregar tarefas, decide se vai direto pra um workspace já lembrado.
// Retorna true se navegou pra tarefas (workspace válido), false se ficou em workspaces.
function resumeOrShowWorkspaces() {
  const last = loadLastWorkspace();
  if (last === undefined) {
    showScreen('workspaces');
    renderWorkspaceList();
    return false;
  }
  // last === null  → "Todas as tarefas"
  // last === 'xx'  → workspace específico (precisa ainda existir)
  if (last === null) {
    openWorkspace(null);
    return true;
  }
  const exists = state.workspaces.some((w) => w.id === last);
  if (exists) {
    openWorkspace(last);
    return true;
  }
  showScreen('workspaces');
  renderWorkspaceList();
  return false;
}

// ============================================================
// Render: Tasks
// ============================================================
function getFilteredTasks() {
  let list = state.allTasks;

  if (state.selectedWorkspaceId) {
    list = list.filter((t) => (t.workspace?.id || '__none__') === state.selectedWorkspaceId);
  }
  if (state.filterCategoryId) {
    list = list.filter((t) => {
      const c = t.category;
      if (!c) return false;
      const id = c.id || c.name || JSON.stringify(c);
      return id === state.filterCategoryId;
    });
  }

  // Sort (cópia pra não mutar)
  const sorted = [...list];
  const dateMs = (t) => {
    const d = t.due_date ? new Date(t.due_date).getTime() : NaN;
    return Number.isNaN(d) ? null : d;
  };
  switch (state.sortBy) {
    case 'date_asc':
      sorted.sort((a, b) => {
        const da = dateMs(a), db = dateMs(b);
        if (da === null && db === null) return 0;
        if (da === null) return 1;
        if (db === null) return -1;
        return da - db;
      });
      break;
    case 'date_desc':
      sorted.sort((a, b) => {
        const da = dateMs(a), db = dateMs(b);
        if (da === null && db === null) return 0;
        if (da === null) return 1;
        if (db === null) return -1;
        return db - da;
      });
      break;
    case 'title_asc':
      sorted.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'pt-BR'));
      break;
    case 'title_desc':
      sorted.sort((a, b) => (b.title || '').localeCompare(a.title || '', 'pt-BR'));
      break;
    case 'time_desc':
      sorted.sort((a, b) => (b.total_time_seconds || 0) - (a.total_time_seconds || 0));
      break;
    default: break;
  }
  return sorted;
}

const SORT_LABELS = {
  default: 'Padrão',
  date_asc: 'Data ↑',
  date_desc: 'Data ↓',
  title_asc: 'A→Z',
  title_desc: 'Z→A',
  time_desc: 'Mais tempo',
};

function persistPrefs() {
  try {
    localStorage.setItem('rl-sort', state.sortBy);
    localStorage.setItem('rl-filter-category', state.filterCategoryId || '');
  } catch {}
}

function loadPrefs() {
  try {
    state.sortBy = localStorage.getItem('rl-sort') || 'default';
    state.filterCategoryId = localStorage.getItem('rl-filter-category') || null;
  } catch {}
}

const LAST_WS_KEY = 'rl-last-workspace';
function persistLastWorkspace(id) {
  try { localStorage.setItem(LAST_WS_KEY, id == null ? '__all__' : id); } catch {}
}
function loadLastWorkspace() {
  try {
    const v = localStorage.getItem(LAST_WS_KEY);
    if (!v) return undefined;
    return v === '__all__' ? null : v;
  } catch { return undefined; }
}
function clearLastWorkspace() {
  try { localStorage.removeItem(LAST_WS_KEY); } catch {}
}

function categoryName(id) {
  const c = state.taskCategories.find((x) => x.id === id);
  return c ? c.name : null;
}

function updateToolbarLabels() {
  $('sort-label').textContent = state.sortBy === 'default' ? 'Ordem' : (SORT_LABELS[state.sortBy] || 'Ordem');
  $('filter-category-label').textContent = state.filterCategoryId ? (categoryName(state.filterCategoryId) || 'Categoria') : 'Categoria';
  $('btn-sort').classList.toggle('active', state.sortBy !== 'default');
  $('btn-filter-category').classList.toggle('active', !!state.filterCategoryId);
}

function tasksInCurrentWorkspace() {
  if (!state.selectedWorkspaceId) return state.allTasks;
  return state.allTasks.filter((t) => (t.workspace?.id || '__none__') === state.selectedWorkspaceId);
}

function visibleCategories() {
  const map = new Map();
  for (const t of tasksInCurrentWorkspace()) {
    const c = t.category;
    if (!c) continue;
    const id = c.id || c.name || JSON.stringify(c);
    if (!map.has(id)) map.set(id, { id, name: c.name || String(c), color: c.color || null });
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

function buildFilterCategoryMenu() {
  const menu = $('filter-category-menu');
  const cats = visibleCategories();
  const items = [
    `<button data-cat="" class="${state.filterCategoryId ? '' : 'active'}">Todas as categorias</button>`,
    ...cats.map((c) =>
      `<button data-cat="${escapeHtml(c.id)}" class="${state.filterCategoryId === c.id ? 'active' : ''}">${escapeHtml(c.name)}</button>`
    ),
  ];
  menu.innerHTML = cats.length === 0
    ? `<button data-cat="" class="active">Sem categorias</button>`
    : items.join('');
  menu.querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', () => {
      state.filterCategoryId = b.dataset.cat || null;
      persistPrefs();
      menu.hidden = true;
      updateToolbarLabels();
      renderTaskList();
    });
  });
}

function buildSortMenuHandlers() {
  const menu = $('sort-menu');
  // Marca o ativo
  menu.querySelectorAll('button').forEach((b) => {
    b.classList.toggle('active', b.dataset.sort === state.sortBy);
    b.onclick = () => {
      state.sortBy = b.dataset.sort;
      persistPrefs();
      menu.hidden = true;
      updateToolbarLabels();
      renderTaskList();
    };
  });
}

const STATUS_GROUPS = [
  { key: 'in_progress', label: 'Fazendo' },
  { key: 'paused',      label: 'Pausadas' },
  { key: 'todo',        label: 'A fazer' },
];

function buildTaskItem(task) {
  const li = document.createElement('li');
  li.className = `task-item status-${task.status}`;
  if (task.id === state.activeTaskId) li.classList.add('active');

  const totalSec = task.id === state.activeTaskId ? elapsedSeconds() : (task.total_time_seconds || 0);
  const metaParts = [];
  if (totalSec > 0 || task.id === state.activeTaskId) metaParts.push(`⏱ ${escapeHtml(formatHMS(totalSec))}`);
  if (task.due_date) metaParts.push(`📅 ${escapeHtml(formatDate(task.due_date))}`);
  if (task.category?.name) metaParts.push(escapeHtml(task.category.name));

  const isActive = task.id === state.activeTaskId;
  const playIcon = isActive ? (state.isPaused ? '▶' : '⏸') : '▶';
  const playTitle = isActive ? (state.isPaused ? 'Retomar' : 'Pausar') : 'Iniciar';

  li.innerHTML = `
    <div class="task-bar"></div>
    <div class="task-info">
      <div class="task-title">${escapeHtml(task.title || '(sem título)')}</div>
      ${metaParts.length ? `<div class="task-meta">${metaParts.join('<span class="dot">·</span>')}</div>` : ''}
    </div>
    <div class="task-actions">
      <button data-action="play" title="${playTitle}" class="${isActive && !state.isPaused ? 'active' : ''}">${playIcon}</button>
    </div>
  `;

  li.querySelector('.task-info').addEventListener('click', () => openDetails(task));
  li.querySelector('[data-action="play"]').addEventListener('click', (e) => {
    e.stopPropagation();
    if (isActive) onPauseResumeClick();
    else onPlayClick(task);
  });
  return li;
}

function renderTaskList() {
  updateToolbarLabels();
  buildSortMenuHandlers();
  buildFilterCategoryMenu();

  const list = $('task-list');
  list.innerHTML = '';
  const tasks = getFilteredTasks();

  if (!tasks.length) {
    const li = document.createElement('li');
    li.className = 'task-item placeholder-item';
    li.textContent = 'Nenhuma tarefa aberta.';
    list.appendChild(li);
    return;
  }

  const byStatus = new Map(STATUS_GROUPS.map((g) => [g.key, []]));
  for (const t of tasks) {
    const key = byStatus.has(t.status) ? t.status : 'todo';
    byStatus.get(key).push(t);
  }

  for (const group of STATUS_GROUPS) {
    const items = byStatus.get(group.key);
    if (!items.length) continue;
    const header = document.createElement('li');
    header.className = `task-group-header group-${group.key}`;
    header.innerHTML = `<span class="group-label">${escapeHtml(group.label)}</span><span class="group-count">${items.length}</span>`;
    list.appendChild(header);
    for (const task of items) list.appendChild(buildTaskItem(task));
  }
}

// ============================================================
// Render: Details
// ============================================================
async function openDetails(task) {
  state.selectedTaskId = task.id;
  showScreen('details');
  renderDetails(task);

  const res = await window.widget.tasks.get(task.id);
  console.log('[widget] task detail:', res);
  if (res?.ok && res.data) {
    const full = res.data?.task || res.data;
    if (full && typeof full === 'object' && full.id) {
      const idx = state.allTasks.findIndex((t) => t.id === full.id);
      if (idx >= 0) state.allTasks[idx] = { ...state.allTasks[idx], ...full };
      renderDetails(full);
    }
  }
}

function toDateInput(d) {
  if (!d) return '';
  try {
    const dt = new Date(d);
    if (isNaN(dt)) return '';
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const day = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  } catch { return ''; }
}

function renderDetails(task) {
  const body = $('details-body');
  const totalSec = task.id === state.activeTaskId ? elapsedSeconds() : (task.total_time_seconds || 0);

  // Bloco somente-leitura: workspace + dados não editáveis
  const infoRows = [];
  const addRow = (key, val) => {
    if (val === null || val === undefined || val === '') return;
    infoRows.push(`<div class="detail-row"><div class="detail-key">${escapeHtml(key)}</div><div class="detail-val">${val}</div></div>`);
  };
  addRow('Tempo', escapeHtml(formatHMS(totalSec)));
  if (Array.isArray(task.projects) && task.projects.length) {
    const chips = task.projects.map((p) => `<span class="chip">${escapeHtml(p.name || p)}</span>`).join('');
    addRow('Projetos', chips);
  }
  if (Array.isArray(task.tags) && task.tags.length) {
    const chips = task.tags.map((t) => `<span class="chip">${escapeHtml(t.name || t)}</span>`).join('');
    addRow('Tags', chips);
  }

  body.innerHTML = `<div>${infoRows.join('')}</div>`;

  // Botão grande de timer
  const btn = $('btn-start-task');
  if (task.id === state.activeTaskId) {
    btn.textContent = state.isPaused ? '▶ Retomar' : '⏸ Pausar';
  } else {
    btn.textContent = '▶ Iniciar timer';
  }
  btn.onclick = () => {
    if (task.id === state.activeTaskId) {
      onPauseResumeClick();
      setTimeout(() => renderDetails(task), 100);
    } else {
      onPlayClick(task).then(() => renderDetails(task));
    }
  };

  // Formulário de edição
  const fields = {
    title:    $('edit-title'),
    status:   $('edit-status'),
    priority: $('edit-priority'),
    stage:    $('edit-stage'),
    category: $('edit-category'),
    due:      $('edit-due-date'),
    dueTime:  $('edit-due-time'),
    notes:    $('edit-notes'),
  };
  const saveBtn = $('btn-save-details');

  const original = {
    title:       task.title || '',
    status:      task.status || 'todo',
    priority:    task.priority || '',
    stage_id:    task.stage?.id || '',
    category_id: task.category?.id || '',
    due_date:    toDateInput(task.due_date),
    due_time:    task.due_time || '',
    description: task.description || task.notes || '',
  };

  populateCategorySelect(fields.category, original.category_id, task.workspace?.id || null);
  // O <select> só representa o que está na lista. Se o valor atual não puder ser
  // representado, o campo cai pra '' — por isso o baseline tem que bater com o que
  // o select realmente mostra, senão um save manda null e desvincula a tarefa.
  original.category_id = fields.category.value;

  let stageReady = false;
  populateStageSelect(fields.stage, task.workspace?.id || null, original.stage_id)
    .then(() => {
      original.stage_id = fields.stage.value;
      stageReady = true;
      refreshDirty();
    });

  fields.title.value    = original.title;
  fields.status.value   = original.status;
  fields.priority.value = original.priority;
  fields.due.value      = original.due_date;
  fields.dueTime.value  = original.due_time;
  fields.notes.value    = original.description;
  saveBtn.disabled = true;

  const current = () => ({
    title:       fields.title.value.trim(),
    status:      fields.status.value,
    priority:    fields.priority.value,
    stage_id:    fields.stage.value,
    category_id: fields.category.value,
    due_date:    fields.due.value,
    due_time:    fields.dueTime.value,
    description: fields.notes.value,
  });

  const refreshDirty = () => {
    const c = current();
    const dirty = Object.keys(original).some((k) => c[k] !== original[k]);
    saveBtn.disabled = !dirty || !c.title;
  };
  Object.values(fields).forEach((el) => { el.oninput = refreshDirty; el.onchange = refreshDirty; });

  saveBtn.onclick = async () => {
    const c = current();
    if (!c.title) return;
    saveBtn.disabled = true;
    saveBtn.textContent = 'Salvando…';
    try {
      // status vai pelo endpoint dedicado (/tasks/:id/status); o PATCH genérico
      // não persiste status de forma confiável. category_id é envio "best-effort".
      // stage_id só entra se o select de etapa já carregou — assim nunca mandamos
      // null por engano e desvinculamos a tarefa do workspace/kanban.
      const patch = {};
      if (c.title !== original.title) patch.title = c.title;
      if (c.priority !== original.priority) patch.priority = c.priority || null;
      if (stageReady && c.stage_id !== original.stage_id) patch.stage_id = c.stage_id || null;
      if (c.category_id !== original.category_id) patch.category_id = c.category_id || null;
      if (c.due_date !== original.due_date) patch.due_date = c.due_date || null;
      if (c.due_time !== original.due_time) patch.due_time = c.due_time || null;
      if (c.description !== original.description) patch.description = c.description;

      if (Object.keys(patch).length) {
        const r = await window.widget.tasks.update(task.id, patch);
        if (handleApiError(r, 'Falha ao salvar', 'error-banner-details')) {
          saveBtn.textContent = 'Salvar alterações';
          saveBtn.disabled = false;
          return;
        }
      }

      // Status pelo endpoint próprio, só quando mudou de fato.
      if (c.status !== original.status) {
        const rs = await window.widget.tasks.setStatus(task.id, c.status);
        if (handleApiError(rs, 'Falha ao salvar status', 'error-banner-details')) {
          saveBtn.textContent = 'Salvar alterações';
          saveBtn.disabled = false;
          return;
        }
      }

      await loadTasks();
      const updated = state.allTasks.find((t) => t.id === task.id) || { ...task, ...c };
      renderDetails(updated);
    } finally {
      saveBtn.textContent = 'Salvar alterações';
    }
  };
}

// ============================================================
// Ações de timer (tarefa)
// ============================================================
async function onPlayClick(task) {
  if (task.id === state.activeTaskId && state.isPaused) return onPauseResumeClick();
  if (task.id === state.activeTaskId && !state.isPaused) return;

  if (state.activeTaskId && state.activeTaskId !== task.id) {
    const stopRes = await window.widget.timer.stop(state.activeTaskId);
    handleApiError(stopRes);
  }

  const res = await window.widget.timer.start(task.id);
  if (handleApiError(res, 'Falha ao iniciar timer')) return;

  state.activeTaskId = task.id;
  state.timerStartedAt = res.data?.started_at || new Date().toISOString();
  state.accumulatedMs = (task.total_time_seconds || 0) * 1000;
  state.isPaused = false;

  if (task.status !== 'in_progress') {
    await window.widget.tasks.setStatus(task.id, 'in_progress');
    task.status = 'in_progress';
  }

  startTicker();
  renderTaskList();
  notify('Timer iniciado', task.title || 'Tarefa', { silent: true });
}

async function onPauseResumeClick() {
  if (!state.activeTaskId) return;
  const task = state.allTasks.find((t) => t.id === state.activeTaskId);
  if (state.isPaused) {
    const res = await window.widget.timer.resume(state.activeTaskId);
    if (handleApiError(res, 'Falha ao retomar')) return;
    state.isPaused = false;
    state.timerStartedAt = res.data?.started_at || new Date().toISOString();
    startTicker();
    notify('Timer retomado', task?.title || '', { silent: true });
  } else {
    state.accumulatedMs += Date.now() - new Date(state.timerStartedAt).getTime();
    const res = await window.widget.timer.pause(state.activeTaskId);
    if (handleApiError(res, 'Falha ao pausar')) return;
    state.isPaused = true;
    stopTicker();
    updateTimerDisplay();
    refreshTray();
    notify('Timer pausado', task?.title || '', { silent: true });
  }
}

async function onStopClick() {
  if (!state.activeTaskId) return;
  const task = state.allTasks.find((t) => t.id === state.activeTaskId);
  const total = formatHMS(elapsedSeconds());
  const res = await window.widget.timer.stop(state.activeTaskId);
  if (handleApiError(res, 'Falha ao parar')) return;
  state.activeTaskId = null;
  state.timerStartedAt = null;
  state.accumulatedMs = 0;
  state.isPaused = false;
  stopTicker();
  updateTimerDisplay();
  refreshTray();
  notify('Timer encerrado', `${task?.title || 'Tarefa'} · ${total}`);
  await loadTasks();
  if (currentScreen === 'tasks') renderTaskList();
  else if (currentScreen === 'workspaces') renderWorkspaceList();
}

// ============================================================
// Pomodoro
// ============================================================
function pomoConfig() {
  state.pomo.focusMin = Math.max(1, parseInt($('pomo-focus-min').value, 10) || 25);
  state.pomo.breakMin = Math.max(1, parseInt($('pomo-break-min').value, 10) || 5);
}

function pomoSetPhase(phase, autoStart = false) {
  state.pomo.phase = phase;
  state.pomo.totalSec = (phase === 'focus' ? state.pomo.focusMin : state.pomo.breakMin) * 60;
  state.pomo.remainingSec = state.pomo.totalSec;
  state.pomo.running = !!autoStart;
  state.pomo.paused = false;
  pomoUpdateDisplay();
}

function pomoUpdateDisplay() {
  const display = document.querySelector('.pomo-display');
  display.classList.remove('focus', 'break', 'paused');
  if (state.pomo.paused) display.classList.add('paused');
  else if (state.pomo.phase === 'focus') display.classList.add('focus');
  else display.classList.add('break');

  $('pomo-phase').textContent = state.pomo.paused
    ? 'PAUSADO'
    : (state.pomo.phase === 'focus' ? 'FOCO' : 'PAUSA');
  $('pomo-time').textContent = formatMMSS(state.pomo.remainingSec);

  $('pomo-start').hidden = state.pomo.running;
  $('pomo-pause').hidden = !state.pomo.running || state.pomo.paused;
  $('pomo-resume').hidden = !state.pomo.paused;

  $('pomo-focus-min').disabled = state.pomo.running;
  $('pomo-break-min').disabled = state.pomo.running;
}

function pomoTick() {
  if (!state.pomo.running || state.pomo.paused) return;
  state.pomo.remainingSec--;
  if (state.pomo.remainingSec <= 0) {
    const finished = state.pomo.phase;
    state.pomo.remainingSec = 0;
    pomoUpdateDisplay();
    pomoOnPhaseEnd(finished);
    return;
  }
  pomoUpdateDisplay();
  refreshTray();
}

function pomoStartLoop() {
  if (state.pomo.intervalId) clearInterval(state.pomo.intervalId);
  state.pomo.intervalId = setInterval(pomoTick, 1000);
}

function pomoStopLoop() {
  if (state.pomo.intervalId) { clearInterval(state.pomo.intervalId); state.pomo.intervalId = null; }
}

async function pomoOnPhaseEnd(finishedPhase) {
  pomoStopLoop();
  state.pomo.running = false;

  if (finishedPhase === 'focus') {
    notify('Pomodoro: foco concluído! 🍅', `Hora da pausa de ${state.pomo.breakMin} min`);
    // Registra a sessão concluída
    const payload = {
      duration_seconds: state.pomo.totalSec,
      type: 'focus',
      task_id: state.activeTaskId || undefined,
    };
    const r = await window.widget.pomodoro.create(payload);
    if (!r.ok) console.warn('[pomodoro] create falhou:', r.error);
    // Tenta avançar para break
    pomoSetPhase('break');
  } else {
    notify('Pausa terminada', 'Pronto pra voltar ao foco?');
    pomoSetPhase('focus');
  }
  refreshTray();
  loadPomoHistory();
}

async function pomoStart() {
  pomoConfig();
  if (!state.pomo.running) {
    state.pomo.totalSec = (state.pomo.phase === 'focus' ? state.pomo.focusMin : state.pomo.breakMin) * 60;
    if (state.pomo.remainingSec === 0) state.pomo.remainingSec = state.pomo.totalSec;
  }
  state.pomo.running = true;
  state.pomo.paused = false;

  const res = await window.widget.pomodoro.control('start', { duration_seconds: state.pomo.totalSec, phase: state.pomo.phase });
  if (!res.ok) {
    console.warn('[pomodoro] control start falhou (continuando local):', res.error);
    // não mostra como erro fatal — pomodoro funciona local mesmo se o /control falhar
  }

  pomoStartLoop();
  pomoUpdateDisplay();
  refreshTray();
  notify('Pomodoro iniciado', state.pomo.phase === 'focus' ? `Foco · ${state.pomo.focusMin} min` : `Pausa · ${state.pomo.breakMin} min`, { silent: true });
}

async function pomoPause() {
  state.pomo.paused = true;
  pomoStopLoop();
  pomoUpdateDisplay();
  refreshTray();
  await window.widget.pomodoro.control('pause');
}

async function pomoResume() {
  state.pomo.paused = false;
  pomoStartLoop();
  pomoUpdateDisplay();
  refreshTray();
  await window.widget.pomodoro.control('resume');
}

async function pomoStop() {
  state.pomo.running = false;
  state.pomo.paused = false;
  pomoStopLoop();
  pomoSetPhase('focus');
  refreshTray();
  await window.widget.pomodoro.control('stop');
}

async function pomoReset() {
  pomoConfig();
  state.pomo.running = false;
  state.pomo.paused = false;
  pomoStopLoop();
  state.pomo.totalSec = state.pomo.focusMin * 60;
  state.pomo.remainingSec = state.pomo.totalSec;
  state.pomo.phase = 'focus';
  pomoUpdateDisplay();
  refreshTray();
  await window.widget.pomodoro.control('reset');
}

async function loadPomoHistory() {
  const list = $('pomo-history');
  const res = await window.widget.pomodoro.list();
  if (!res.ok) {
    list.innerHTML = `<li class="task-item placeholder-item">Sem histórico</li>`;
    return;
  }
  const d = res.data;
  const items = Array.isArray(d) ? d : (d?.items || d?.data || d?.results || d?.pomodoros || []);
  if (!items.length) {
    list.innerHTML = `<li class="task-item placeholder-item">Nenhuma sessão ainda</li>`;
    return;
  }
  const recent = items.slice(0, 10);
  list.innerHTML = recent.map((p) => {
    const dur = p.duration_seconds || p.duration || 0;
    const when = p.ended_at || p.started_at || p.created_at;
    const label = p.task?.title || p.task_title || (p.type ? (p.type === 'focus' ? 'Foco' : 'Pausa') : 'Sessão');
    return `<li class="pomo-history-item">
      <span>${escapeHtml(label)} · ${escapeHtml(formatMMSS(dur))}</span>
      <span class="pomo-when">${escapeHtml(formatDateTime(when))}</span>
    </li>`;
  }).join('');
}

function openPomodoro() {
  showScreen('pomodoro');
  pomoUpdateDisplay();
  loadPomoHistory();
}

// ============================================================
// Login / botões
// ============================================================
$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('login-email').value.trim();
  const password = $('login-password').value;
  const errEl = $('login-error');
  const btn = $('login-submit');

  errEl.hidden = true;
  btn.disabled = true;
  btn.textContent = 'Entrando…';

  const res = await window.widget.auth.login(email, password);

  btn.disabled = false;
  btn.textContent = 'Entrar';

  if (!res.ok) {
    errEl.textContent = res.error?.message || 'Falha no login';
    errEl.hidden = false;
    return;
  }

  $('login-password').value = '';

  if (!res.data?.hasApiKey) {
    openApiKeyScreen({ canSkip: false });
    return;
  }
  await Promise.all([loadWorkspaces(), loadTasks()]);
  resumeOrShowWorkspaces();
});

function openApiKeyScreen({ canSkip = true } = {}) {
  $('apikey-input').value = '';
  $('apikey-error').hidden = true;
  $('apikey-error').textContent = '';
  $('apikey-skip').hidden = !canSkip;
  showScreen('apikey');
  setTimeout(() => $('apikey-input').focus(), 50);
}

$('btn-apikey').addEventListener('click', () => openApiKeyScreen({ canSkip: true }));

$('apikey-skip').addEventListener('click', () => {
  if (state.allTasks.length || state.workspaces.length) {
    showScreen('workspaces');
    renderWorkspaceList();
  } else {
    showScreen('workspaces');
    renderWorkspaceList();
  }
});

$('apikey-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const key = $('apikey-input').value.trim();
  const errEl = $('apikey-error');
  const btn = $('apikey-submit');
  errEl.hidden = true;

  if (!key) {
    errEl.textContent = 'Cole a chave para continuar.';
    errEl.hidden = false;
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Salvando…';
  const save = await window.widget.auth.setApiKey(key);
  if (!save.ok) {
    btn.disabled = false;
    btn.textContent = 'Salvar';
    errEl.textContent = save.error?.message || 'Falha ao salvar a chave';
    errEl.hidden = false;
    return;
  }

  // Valida testando uma chamada simples
  const test = await window.widget.tasks.list();
  btn.disabled = false;
  btn.textContent = 'Salvar';

  if (!test.ok) {
    errEl.textContent = `Chave inválida — ${test.error?.message || 'erro ao validar'}`;
    errEl.hidden = false;
    return;
  }

  await Promise.all([loadWorkspaces(), loadTasks()]);
  resumeOrShowWorkspaces();
});

$('btn-theme').addEventListener('click', toggleTheme);

// Toolbar de tarefas: dropdowns
const ALL_DROPDOWNS = ['sort-menu', 'filter-category-menu'];
function openDropdown(menuId) {
  ALL_DROPDOWNS.forEach((id) => { $(id).hidden = id !== menuId; });
}
function closeAllDropdowns() {
  ALL_DROPDOWNS.forEach((id) => { $(id).hidden = true; });
}
function toggleDropdown(menuId) {
  const wasHidden = $(menuId).hidden;
  closeAllDropdowns();
  if (wasHidden) openDropdown(menuId);
}
$('btn-sort').addEventListener('click', (e) => { e.stopPropagation(); toggleDropdown('sort-menu'); });
$('btn-filter-category').addEventListener('click', (e) => { e.stopPropagation(); toggleDropdown('filter-category-menu'); });
document.addEventListener('click', closeAllDropdowns);
ALL_DROPDOWNS.forEach((id) => $(id).addEventListener('click', (e) => e.stopPropagation()));

$('btn-hide').addEventListener('click', () => window.widget.hide());
$('btn-quit').addEventListener('click', () => window.widget.quit());
$('btn-back').addEventListener('click', goBack);
$('btn-pomodoro').addEventListener('click', openPomodoro);

$('btn-refresh').addEventListener('click', async () => {
  if (currentScreen === 'pomodoro') {
    loadPomoHistory();
    return;
  }
  await loadTasks();
  if (currentScreen === 'workspaces') renderWorkspaceList();
  else if (currentScreen === 'tasks') renderTaskList();
});

$('btn-logout').addEventListener('click', async () => {
  await window.widget.auth.logout();
  state.allTasks = [];
  state.workspaces = [];
  state.activeTaskId = null;
  state.selectedWorkspaceId = null;
  state.selectedTaskId = null;
  clearLastWorkspace();
  stopTicker();
  pomoStopLoop();
  updateTimerDisplay();
  refreshTray();
  showScreen('login');
});

$('btn-pause-resume').addEventListener('click', onPauseResumeClick);
$('btn-stop').addEventListener('click', onStopClick);

// Pomodoro buttons
$('pomo-start').addEventListener('click', pomoStart);
$('pomo-pause').addEventListener('click', pomoPause);
$('pomo-resume').addEventListener('click', pomoResume);
$('pomo-reset').addEventListener('click', pomoReset);
$('pomo-stop').addEventListener('click', pomoStop);
$('pomo-focus-min').addEventListener('change', () => { pomoConfig(); if (!state.pomo.running) pomoSetPhase(state.pomo.phase); });
$('pomo-break-min').addEventListener('change', pomoConfig);

window.widget.onGlobalToggleTimer(() => {
  if (state.activeTaskId) onPauseResumeClick();
});

// ============================================================
// Nova tarefa (modal)
// ============================================================
function categoriesForWorkspace(wsId) {
  const map = new Map();
  for (const t of state.allTasks) {
    const taskWsId = t.workspace?.id || '__none__';
    if (wsId && taskWsId !== wsId) continue;
    const c = t.category;
    if (!c) continue;
    const id = c.id || c.name || JSON.stringify(c);
    if (!map.has(id)) map.set(id, { id, name: c.name || String(c), color: c.color || null });
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

function populateCategorySelect(sel, currentId, wsId) {
  const cats = wsId ? categoriesForWorkspace(wsId) : state.taskCategories;
  const opts = ['<option value="">—</option>'];
  for (const c of cats) {
    opts.push(`<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`);
  }
  sel.innerHTML = opts.join('');
  if (currentId && cats.some((c) => c.id === currentId)) {
    sel.value = currentId;
  } else {
    sel.value = '';
  }
}

function openNewTaskModal() {
  const modal = $('new-task-modal');
  const wsSel = $('nt-workspace');
  const stageSel = $('nt-stage');
  const catSel = $('nt-category');

  // Workspaces: prefere a lista de /workspaces; fallback nos derivados
  const wsList = state.apiWorkspaces.length
    ? state.apiWorkspaces
    : state.workspaces.filter((w) => w.id !== '__none__');
  const opts = ['<option value="">— sem workspace —</option>'];
  for (const ws of wsList) {
    opts.push(`<option value="${escapeHtml(ws.id)}">${escapeHtml(ws.name)}</option>`);
  }
  wsSel.innerHTML = opts.join('');
  const preWs = state.selectedWorkspaceId && state.selectedWorkspaceId !== '__none__'
    ? state.selectedWorkspaceId : '';
  wsSel.value = preWs;

  populateStageSelect(stageSel, wsSel.value || null, '');
  populateCategorySelect(catSel, state.filterCategoryId || '', wsSel.value || null);

  wsSel.onchange = () => {
    populateStageSelect(stageSel, wsSel.value || null, '');
    populateCategorySelect(catSel, catSel.value, wsSel.value || null);
  };

  $('nt-title').value = '';
  $('nt-priority').value = '';
  $('nt-due-date').value = '';
  $('nt-description').value = '';
  $('nt-error').hidden = true;
  $('nt-error').textContent = '';
  modal.hidden = false;
  setTimeout(() => $('nt-title').focus(), 50);
}

function closeNewTaskModal() {
  $('new-task-modal').hidden = true;
}

$('btn-new-task').addEventListener('click', openNewTaskModal);
$('new-task-close').addEventListener('click', closeNewTaskModal);
$('nt-cancel').addEventListener('click', closeNewTaskModal);
$('new-task-modal').addEventListener('click', (e) => {
  if (e.target === $('new-task-modal')) closeNewTaskModal();
});

$('new-task-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = $('nt-error');
  const submit = $('nt-submit');
  errEl.hidden = true;

  const title = $('nt-title').value.trim();
  if (!title) {
    errEl.textContent = 'Título é obrigatório';
    errEl.hidden = false;
    return;
  }
  const payload = { title, status: 'todo' };
  const stage = $('nt-stage').value;
  const ws = $('nt-workspace').value;
  if (stage) payload.stage_id = stage;
  else if (ws) payload.workspace_id = ws;
  const cat = $('nt-category').value;
  if (cat) payload.category_id = cat;
  const priority = $('nt-priority').value;
  if (priority) payload.priority = priority;
  const due = $('nt-due-date').value;
  if (due) payload.due_date = due;
  const desc = $('nt-description').value.trim();
  if (desc) payload.description = desc;

  submit.disabled = true;
  submit.textContent = 'Criando…';
  const res = await window.widget.tasks.create(payload);
  submit.disabled = false;
  submit.textContent = 'Criar';

  if (!res.ok) {
    errEl.textContent = res.error?.message || 'Falha ao criar tarefa';
    errEl.hidden = false;
    return;
  }

  closeNewTaskModal();
  await loadTasks();
  if (currentScreen === 'tasks') renderTaskList();
  else if (currentScreen === 'workspaces') renderWorkspaceList();
});

// ============================================================
// Auto-update — banner reativo
// ============================================================
window.widget.updater.onStatus((s) => {
  const banner = $('updater-banner');
  const msg = $('updater-msg');
  const action = $('updater-action');
  if (!banner) return;

  switch (s.state) {
    case 'available':
      banner.hidden = false;
      msg.textContent = `Baixando v${s.version}…`;
      action.hidden = true;
      break;
    case 'downloading':
      banner.hidden = false;
      msg.textContent = `Baixando atualização… ${Math.round(s.percent || 0)}%`;
      action.hidden = true;
      break;
    case 'downloaded':
      banner.hidden = false;
      msg.textContent = `v${s.version} pronta — clique pra reiniciar`;
      action.hidden = false;
      action.textContent = 'Reiniciar agora';
      action.onclick = () => window.widget.updater.install();
      break;
    case 'up-to-date':
    case 'checking':
      banner.hidden = true;
      break;
    case 'error':
      // erro de update não atrapalha o uso — só esconde
      banner.hidden = true;
      console.warn('[updater] erro:', s.message);
      break;
  }
});

// ============================================================
// Boot
// ============================================================
(async function boot() {
  applyTheme(loadTheme());
  loadPrefs();
  showScreen('loading');
  pomoUpdateDisplay();
  refreshTray();
  const res = await window.widget.auth.status();
  if (res.ok && res.data?.authenticated) {
    if (!res.data.hasApiKey) {
      openApiKeyScreen({ canSkip: false });
      return;
    }
    await Promise.all([loadWorkspaces(), loadTasks()]);
    resumeOrShowWorkspaces();
  } else {
    showScreen('login');
  }
})();
