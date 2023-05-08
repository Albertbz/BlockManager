const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const { createDDSImage } = require('./dds')

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1000,
    height: 800,
    webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
      },
    autoHideMenuBar: true,
  })

  win.loadFile('index.html')
}

app.whenReady().then(() => {
  createWindow()
  createDDSImage('C:\\Users\\alber\\OneDrive\\Dokumenter\\Hobbies\\cyubeVR\\BlockManager\\images\\test.png', 
                 'C:\\Users\\alber\\OneDrive\\Dokumenter\\Hobbies\\cyubeVR\\BlockManager\\images\\test.dds', 'BC3')
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })