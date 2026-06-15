// Cliente HTTP do Register Life
// Roda no processo MAIN (tem acesso a fetch e ao token via keytar)

const BASE_URL = 'https://ctiapcnaouliddfomnzu.supabase.co/functions/v1/external-api';

class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function request(path, { method = 'GET', body, token, apiKey } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['X-API-Key'] = apiKey;
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }

  console.log(`[api] ${method} ${path} → ${res.status}`, data);

  if (!res.ok) {
    const msg =
      (data && (data.message || data.error || data.error_description)) ||
      (typeof data === 'string' ? data.slice(0, 200) : null) ||
      `HTTP ${res.status}`;
    throw new ApiError(msg, res.status, data);
  }
  return data;
}

module.exports = {
  ApiError,

  // Auth
  login: (email, password) =>
    request('/auth/login', { method: 'POST', body: { email, password } }),

  refresh: (refresh_token) =>
    request('/auth/refresh', { method: 'POST', body: { refresh_token } }),

  logout: (token) =>
    request('/auth/logout', { method: 'POST', token }),

  // Workspaces / stages / categories
  listWorkspaces: (apiKey) => request('/workspaces', { apiKey }),
  listStages: (apiKey, workspaceId) => request(`/workspaces/${workspaceId}/stages`, { apiKey }),
  listWorkspaceCategories: (apiKey, workspaceId) => request(`/workspaces/${workspaceId}/categories`, { apiKey }),

  // Tasks — usam X-API-Key
  listTasks: (apiKey) => request('/tasks', { apiKey }),

  getTask: (apiKey, id) => request(`/tasks/${id}`, { apiKey }),

  updateTaskStatus: (apiKey, id, status) =>
    request(`/tasks/${id}/status`, { method: 'PATCH', apiKey, body: { status } }),

  createTask: (apiKey, payload) =>
    request('/tasks', { method: 'POST', apiKey, body: payload }),

  updateTask: (apiKey, id, payload) =>
    request(`/tasks/${id}`, { method: 'PATCH', apiKey, body: payload }),

  deleteTask: (apiKey, id) =>
    request(`/tasks/${id}`, { method: 'DELETE', apiKey }),

  // Timer
  startTimer: (apiKey, taskId) =>
    request(`/tasks/${taskId}/timer/start`, { method: 'POST', apiKey }),

  stopTimer: (apiKey, taskId) =>
    request(`/tasks/${taskId}/timer/stop`, { method: 'POST', apiKey }),

  pauseTimer: (apiKey, taskId) =>
    request(`/tasks/${taskId}/timer/pause`, { method: 'POST', apiKey }),

  resumeTimer: (apiKey, taskId) =>
    request(`/tasks/${taskId}/timer/resume`, { method: 'POST', apiKey }),

  getActiveTimer: (apiKey, taskId) =>
    request(`/tasks/${taskId}/timer/active`, { apiKey }),

  // Pomodoros
  listPomodoros: (apiKey) => request('/pomodoros', { apiKey }),

  createPomodoro: (apiKey, payload) =>
    request('/pomodoros', { method: 'POST', apiKey, body: payload }),

  pomodoroControl: (apiKey, action, extra = {}) =>
    request('/control', { method: 'POST', apiKey, body: { action, ...extra } }),
};
