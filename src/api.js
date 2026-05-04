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

async function request(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
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

  // Tasks
  listTasks: (token) => request('/tasks', { token }),

  getTask: (token, id) => request(`/tasks/${id}`, { token }),

  updateTaskStatus: (token, id, status) =>
    request(`/tasks/${id}/status`, { method: 'PATCH', token, body: { status } }),

  // Timer
  startTimer: (token, taskId) =>
    request(`/tasks/${taskId}/timer/start`, { method: 'POST', token }),

  stopTimer: (token, taskId) =>
    request(`/tasks/${taskId}/timer/stop`, { method: 'POST', token }),

  pauseTimer: (token, taskId) =>
    request(`/tasks/${taskId}/timer/pause`, { method: 'POST', token }),

  resumeTimer: (token, taskId) =>
    request(`/tasks/${taskId}/timer/resume`, { method: 'POST', token }),

  getActiveTimer: (token, taskId) =>
    request(`/tasks/${taskId}/timer/active`, { token }),

  // Pomodoros
  listPomodoros: (token) => request('/pomodoros', { token }),

  createPomodoro: (token, payload) =>
    request('/pomodoros', { method: 'POST', token, body: payload }),

  pomodoroControl: (token, action, extra = {}) =>
    request('/control', { method: 'POST', token, body: { action, ...extra } }),
};
