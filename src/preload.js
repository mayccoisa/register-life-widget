const { contextBridge, ipcRenderer } = require('electron');

const invoke = (ch, ...args) => ipcRenderer.invoke(ch, ...args);

contextBridge.exposeInMainWorld('widget', {
  quit: () => invoke('app:quit'),
  hide: () => invoke('app:hide'),
  setTrayState: (state, tooltip) => invoke('app:setTrayState', { state, tooltip }),
  notify: (title, body, opts) => invoke('app:notify', { title, body, ...(opts || {}) }),
  onGlobalToggleTimer: (cb) => ipcRenderer.on('global-shortcut:toggle-timer', cb),

  auth: {
    status: () => invoke('auth:status'),
    login: (email, password) => invoke('auth:login', { email, password }),
    logout: () => invoke('auth:logout'),
  },

  tasks: {
    list: () => invoke('tasks:list'),
    get: (id) => invoke('tasks:get', id),
    setStatus: (id, status) => invoke('tasks:setStatus', { id, status }),
  },

  timer: {
    start: (id) => invoke('timer:start', { id }),
    stop: (id) => invoke('timer:stop', { id }),
    pause: (id) => invoke('timer:pause', { id }),
    resume: (id) => invoke('timer:resume', { id }),
    active: (id) => invoke('timer:active', { id }),
  },

  pomodoro: {
    list: () => invoke('pomodoro:list'),
    create: (payload) => invoke('pomodoro:create', payload),
    control: (action, extra) => invoke('pomodoro:control', { action, extra }),
  },
});
