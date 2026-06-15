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
    getApiKey: () => invoke('auth:getApiKey'),
    setApiKey: (apiKey) => invoke('auth:setApiKey', { apiKey }),
  },

  workspaces: {
    list: () => invoke('workspaces:list'),
    stages: (workspaceId) => invoke('workspaces:stages', { workspaceId }),
    categories: (workspaceId) => invoke('workspaces:categories', { workspaceId }),
  },

  tasks: {
    list: () => invoke('tasks:list'),
    get: (id) => invoke('tasks:get', id),
    setStatus: (id, status) => invoke('tasks:setStatus', { id, status }),
    create: (payload) => invoke('tasks:create', payload),
    update: (id, payload) => invoke('tasks:update', { id, payload }),
    delete: (id) => invoke('tasks:delete', id),
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

  updater: {
    check: () => invoke('updater:check'),
    install: () => invoke('updater:install'),
    onStatus: (cb) => ipcRenderer.on('updater:status', (_e, payload) => cb(payload)),
  },
});
