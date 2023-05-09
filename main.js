const { app, BrowserWindow, ipcMain, screen } = require('electron')
const path = require('path')
const { createDDSImage } = require('./dds')

function createWindow() {
    // Make initial window.
    const win = new BrowserWindow({
        width: 0, // Will be changed in a bit.
        height: 0, // Will be changed in a bit.
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
        },
        autoHideMenuBar: true, // Menu bar is ugly, so hide it.
    });

    // Get window bounds to figure out what display the
    // window was spawned in.
    const winBounds = win.getBounds();
    const display = screen.getDisplayMatching(winBounds);

    // Set window size to be 50% of the width of the
    // display and 60% of the height, and then center
    // it.
    win.setSize(display.bounds.width * 0.5, display.bounds.height * 0.6);
    win.center();

    // Load the main HTML file onto the window.
    win.loadFile('index.html');
}

// As soon as the Electron app is ready, create the window.
app.whenReady().then(() => {
    createWindow();

    // iOS specific check. Honestly makes no sense that
    // I have this here as this program doesn't support
    // iOS anyway.
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    })
});

// If the window is closed, stop the app.
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});


/*
*
* All functions available to the renderer.
*
*/

ipcMain.on('createDDSImage', createDDSImageWrapper);



/*
*
* All wrapper functions called from renderer.
*
*/

// Ignore event argument.
function createDDSImageWrapper(event, inputPath, outputPath, format) {
    createDDSImage(inputPath, outputPath, format);
}