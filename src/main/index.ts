import 'reflect-metadata'
import { app, BrowserWindow, shell, Tray, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module.js'
import { SettingsService } from './settings/settings.service.js'
import type { INestApplicationContext } from '@nestjs/common'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let nestApp: INestApplicationContext | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 768,
    show: false,
    title: 'Dash',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Minimize to tray
  mainWindow.on('minimize', async () => {
    if (!nestApp) return
    const settings = nestApp.get(SettingsService)
    const minimizeToTray = await settings.get('minimize_to_tray')
    if (minimizeToTray) {
      mainWindow?.hide()
    }
  })

  // Close to tray
  mainWindow.on('close', async (event) => {
    if (!nestApp) return
    const settings = nestApp.get(SettingsService)
    const closeToTray = await settings.get('close_to_tray')
    if (closeToTray && mainWindow?.isVisible()) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function createTray(): void {
  const icon = nativeImage.createEmpty()
  tray = new Tray(icon)
  tray.setToolTip('Dash')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Dash',
      click: () => {
        mainWindow?.show()
        mainWindow?.focus()
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        // Force quit, bypass close-to-tray
        mainWindow?.destroy()
        app.quit()
      },
    },
  ])

  tray.setContextMenu(contextMenu)

  tray.on('double-click', () => {
    mainWindow?.show()
    mainWindow?.focus()
  })
}

async function bootstrap() {
  nestApp = await NestFactory.createApplicationContext(AppModule)
  await nestApp.init()
  return nestApp
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.dash.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  await bootstrap()

  createWindow()
  createTray()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    } else {
      mainWindow?.show()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

export { mainWindow }
