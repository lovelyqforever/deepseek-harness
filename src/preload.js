'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Frameless-window bridge: the web UI's self-drawn title bar calls these to
// drive the native window (minimize / maximize / close->tray). Sandbox-safe:
// only contextBridge + ipcRenderer are used, no Node globals are exposed.
contextBridge.exposeInMainWorld('desktop', {
  minimize() {
    ipcRenderer.send('win:minimize');
  },
  toggleMaximize() {
    ipcRenderer.send('win:toggle-maximize');
  },
  close() {
    ipcRenderer.send('win:close');
  },
  isMaximized() {
    return ipcRenderer.sendSync('win:is-maximized');
  },
  onMaximizeChange(callback) {
    if (typeof callback !== 'function') return undefined;
    const listener = (_event, value) => callback(!!value);
    ipcRenderer.on('win:maximize-change', listener);
    return () => ipcRenderer.removeListener('win:maximize-change', listener);
  },
  setNativeTheme(theme) {
    ipcRenderer.send('win:set-native-theme', theme);
  },
});
