const { app, BrowserWindow, ipcMain, screen, dialog } = require('electron');
const path = require('path');
const { createDDSImage } = require('./dds');
const env = require('windows-env');
const fs = require('fs');
const { getGamePath, getSteamPath } = require('steam-game-path');

let win;
function createWindow() {
    // Make initial window.
    win = new BrowserWindow({
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
    win.setSize(Math.round(display.bounds.width * 0.5), Math.round(display.bounds.height * 0.6));
    win.center();

    // Load the main HTML file onto the window.
    win.loadFile('index.html');

    ipcMain.handle('selectFolder', async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog(win, {
            properties: ['openDirectory']
        })
        if (canceled) {
            return;
        } else {
            return filePaths[0];
        }
    });
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

ipcMain.handle('createDDSImage', createDDSImageWrapper);
ipcMain.handle('getGeneratedRecipeFileContent', getGeneratedRecipeFileContent);
ipcMain.handle('getDefaultRecipeFileContent', getDefaultRecipeFileContent);
ipcMain.handle('generateCustomBlock', generateCustomBlock);
ipcMain.handle('getModsFolderPath', getModsFolderPath);
ipcMain.handle('getAllModFolders', getAllModFolders);
ipcMain.handle('generationCompletePopup', generationCompletePopup);


/*
*
* All wrapper functions called from renderer.
*
*/

// Ignore event argument.
function createDDSImageWrapper(event, inputPath, outputPath, format) {
    createDDSImage(inputPath, outputPath, format);
}

function getGeneratedRecipeFileContent() {
    const localAppdataPath = env.LOCALAPPDATA;
    const recipePath = localAppdataPath + '\\cyubeVR\\Saved\\Dev\\Recipe.txt';

    try {
        const data = fs.readFileSync(recipePath, 'utf-8');
        return data;
    } catch {
        console.error(err);
    }
}

function getDefaultRecipeFileContent() {
    const recipePath = path.join(__dirname, '\\premade\\Recipe.txt') ;

    try {
        const data = fs.readFileSync(recipePath, 'utf-8');
        return data;
    } catch {
        console.error(err);
    }
}

function generateCustomBlock(event, location, propertiesFileContent, recipePictureImgSrc, regularTextures, smallTextures, normalTextures, glowTextures) {
    // Make folder for block
    if (!fs.existsSync(location)) {
        fs.mkdirSync(location);
    }

    // Make properties file
    fs.appendFile(`${location}\\Properties.json`, JSON.stringify(propertiesFileContent), function(err) {
        if (err) console.error(err);
        console.log('Successfully made properties file')
    })

    // Make recipe preview file
    createDDSImage(recipePictureImgSrc, `${location}\\RecipePreview.dds`, 'BC3');

    // Create Textures folder
    const texturesPath = `${location}\\Textures`;
    if (!fs.existsSync(texturesPath)) {
        fs.mkdirSync(texturesPath);
    }

    // Create regular textures
    for (i = 0; i < regularTextures.length; i++) {
        const [src, name] = regularTextures[i];
        outputPath = `${texturesPath}\\${name}.dds`;
        createDDSImage(src, outputPath, 'BC3');
    }

    // Create small textures. If none, automatically
    // make them using the regular textures.
    if (smallTextures.length == 0) {
        for (i = 0; i < regularTextures.length; i++) {
            const [src, name] = regularTextures[i];
            outputPath = `${texturesPath}\\${name}_small.dds`;
            createDDSImage(src, outputPath, 'BC3', true, 512, 512);
        }
    } else {
        for (i = 0; i < smallTextures.length; i++) {
            const [src, name] = smallTextures[i];
            outputPath = `${texturesPath}\\${name}_small.dds`;
            createDDSImage(src, outputPath, 'BC3');
        }
    }
    
    // Create normal map textures
    for (i = 0; i < normalTextures.length; i++) {
        const [src, name] = normalTextures[i];
        outputPath = `${texturesPath}\\${name}_normal.dds`;
        createDDSImage(src, outputPath, 'BC5');
    }

    // Create glow map textures
    for (i = 0; i < glowTextures.length; i++) {
        const [src, name] = glowTextures[i];
        outputPath = `${texturesPath}\\${name}_glow.dds`;
        createDDSImage(src, outputPath, 'BC1');
    }
    
    return true;
}

function getModsFolderPath() {
    const cyubeVRPath = getGamePath(619500).game.path;
    const modsFolderPath = path.join(cyubeVRPath, '\\cyubeVR\\Mods');
    return modsFolderPath;
}

function getAllModFolders() {
    const modsFolderPath = getModsFolderPath();
    const modFoldersPath = path.join(modsFolderPath, '\\ModFolders');

    let res = [];

    const modFoldersNames = fs.readdirSync(modFoldersPath, { withFileTypes: true })
        .filter((item) => item.isDirectory())
        .map((item) => item.name);
    
    for (let i = 0; i < modFoldersNames.length; i++) {
        const name = modFoldersNames[i];
        const modPath = path.join(modFoldersPath, `\\${name}`);

        const updates = fs.readdirSync(modPath, { withFileTypes: true })
            .filter((item) => item.isDirectory())
            .map((item) => item.name)
            .filter((item) => item.includes('Update'));

        const values = {
            name: name,
            updates: updates
        }
        res.push(values);
    }

    return res;
}

function generationCompletePopup() {
    const childWin = new BrowserWindow({
        width: 150,
        height: 100,
        center: true,
        frame: false
    });

    childWin.loadFile('generationComplete.html');
}