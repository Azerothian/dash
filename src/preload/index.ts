import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS, type IpcChannel } from '@shared/ipc-channels'

// Typed API exposed to renderer via contextBridge
const api = {
  // Generic invoke for request/response IPC
  invoke: <T = unknown>(channel: IpcChannel, ...args: unknown[]): Promise<T> => {
    return ipcRenderer.invoke(channel, ...args)
  },

  // Subscribe to push events from main process
  on: (channel: IpcChannel, callback: (...args: unknown[]) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => callback(...args)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  },

  // One-time event listener
  once: (channel: IpcChannel, callback: (...args: unknown[]) => void): void => {
    ipcRenderer.once(channel, (_event, ...args) => callback(...args))
  },

  // Expose channel constants for type safety
  channels: IPC_CHANNELS,
}

export type DashApi = typeof api

contextBridge.exposeInMainWorld('api', api)
