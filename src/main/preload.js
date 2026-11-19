const { contextBridge, ipcRenderer } = require('electron');
const inv = (c) => (...a) => ipcRenderer.invoke(c, ...a);
const g = (pfx, names) => Object.fromEntries(names.map((n) => [n, inv(pfx + ':' + n)]));
contextBridge.exposeInMainWorld('api', {
  platform: process.platform,
  settings: g('settings', ['get', 'set']),
  providers: g('providers', ['presets', 'models', 'test']),
  sources: g('sources', ['list', 'get', 'toggle', 'setMany', 'toggleCategory', 'setVars', 'upsert', 'remove', 'addCategory', 'test', 'applyDefaults']),
  health: g('health', ['run', 'cancel', 'reset', 'disableDead', 'speed']),
  preview: g('preview', ['fetch', 'window']), deep: g('deep', ['run', 'cancel']), logs: g('logs', ['get', 'clear', 'open', 'write']),
  backup: g('backup', ['export', 'import', 'openDir']), update: g('update', ['check', 'install']), suggest: inv('suggest'),
  ext: g('ext', ['list', 'reload', 'openDir', 'install', 'uninstall', 'import']),
  lib: g('lib', ['get', 'fav', 'unfav', 'addCollection', 'removeCollection', 'saveSearch', 'removeSaved', 'saveScene', 'removeScene', 'clearHistory']),
  search: g('search', ['start', 'cancel']),
  ai: g('ai', ['status', 'expand', 'digest', 'answer', 'plan', 'applyPlan', 'intent', 'enhance', 'usage', 'usageReset', 'audit', 'auditClear', 'cacheClear', 'prompts', 'promptFill']),
  conv: g('conv', ['list', 'get', 'create', 'remove', 'rename']), memory: g('memory', ['get', 'forget', 'add']), copilot: g('copilot', ['run', 'cancel']), saveFile: inv('saveFile'),
  agent: g('agent', ['run', 'apply']),
  export: inv('export'), open: inv('open'), copy: inv('copy'), showMain: inv('main:show'), hideQuick: inv('quick:hide'),
  on: (ch, fn) => { const h = (e, d) => fn(d); ipcRenderer.on(ch, h); return () => ipcRenderer.removeListener(ch, h); },
});
