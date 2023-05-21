const { app, BrowserWindow, ipcMain, screen, dialog, shell } = require('electron');
const path = require('path');
const { createDDSImage } = require('./dds');
const env = require('windows-env');
const fs = require('fs');
const { getGamePath } = require('steam-game-path');

let mainWindow;
function createWindow() {
    // Make initial window.
    mainWindow = new BrowserWindow({
        width: 0, // Will be changed in a bit.
        height: 0, // Will be changed in a bit.
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
        },
        autoHideMenuBar: true, // Menu bar is ugly, so hide it.
    });

    // Get window bounds to figure out what display the
    // window was spawned in.
    const winBounds = mainWindow.getBounds();
    const display = screen.getDisplayMatching(winBounds);

    // Set window size to be 50% of the width of the
    // display and 60% of the height, and then center
    // it.
    const newHeight = Math.round(display.bounds.height * 0.7);
    const newWidth = Math.round(newHeight * 1.5)
    mainWindow.setSize(newWidth, newHeight);
    mainWindow.center();

    // Load the main HTML file onto the window.
    mainWindow.loadFile('manageBlocks.html');
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
ipcMain.handle('openGenerationLocation', openGenerationLocation);
ipcMain.handle('generateNewBlock', generateNewBlock);
ipcMain.handle('getAllBlocks', getAllBlocks);
ipcMain.handle('openGenerator', openGenerator);
ipcMain.handle('displayDeleteDialog', displayDeleteDialog);


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
    fs.writeFile(`${location}\\Properties.json`, JSON.stringify(propertiesFileContent), function(err) {
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
    const modsFolderPath = path.join(cyubeVRPath, 'cyubeVR\\Mods');
    return modsFolderPath;
}

function getAllModFolders() {
    const modsFolderPath = getModsFolderPath();
    const modFoldersPath = path.join(modsFolderPath, 'ModFolders');

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

let generationLocation;
async function generationCompletePopup(event, location) {
    generationLocation = location;
    
    const popupWin = new BrowserWindow({
        width: 300,
        height: 200,
        center: true,
        frame: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
        },
        parent: generatorWindow,
        modal: true
    });

    popupWin.loadFile('generationPopup.html');

    const winPosition = generatorWindow.getPosition();
    const winSize = generatorWindow.getSize();
    popupWin.setPosition(winPosition[0] + Math.round(winSize[0]/2) - 150, winPosition[1] + Math.round(winSize[1]/2) - 100);
}

function openGenerationLocation() {
    shell.showItemInFolder(generationLocation);
}

function generateNewBlock(event) {
    const childWindow = BrowserWindow.fromId(event.sender.id);
    const parentWindow = childWindow.getParentWindow();
    parentWindow.reload();
    childWindow.destroy();
}

function getAllBlocks() {
    const modsFolderPath = getModsFolderPath();
    let blocks = {
        defaultBlocksFolder: []
    };

    /**
     * Add all blocks in Blocks folder
     */
    const blocksFolderPath = path.join(modsFolderPath, 'Blocks');
    
    // Get all folders of the blocks
    const blocksFolders = fs.readdirSync(blocksFolderPath, { withFileTypes: true })
        .filter((item) => item.isDirectory())
        .map((item) => item.name);
    
    // For each folder, get information and save in blocks array
    for (let i = 0; i < blocksFolders.length; i++) {
        const blockPath = path.join(blocksFolderPath, blocksFolders[i]);
        let block = {};

        // Add block path (for deletion)
        block.path = blockPath;

        // Add properties
        try {
            const propertiesFilePath = path.join(blockPath, `Properties.json`);
            const propertiesJSON = fs.readFileSync(propertiesFilePath);
            const properties = JSON.parse(propertiesJSON);
            block.properties = properties;
        } catch (err) {
            console.error(err);
        }

        // Add path to recipe preview
        const recipePreviewPath = path.join(blockPath, `RecipePreview.dds`)
        block.recipePreviewPath = recipePreviewPath;

        // Add texture paths
        try {
            const texturesFolderPath = path.join(blockPath, `Textures`);
            block.textureFilesPaths = {};
            fs.readdirSync(texturesFolderPath)
                .filter(fileName => !fileName.includes('_'))
                .forEach(fileName => {
                    const name = fileName.replace('.dds', '');
                    const src = path.join(texturesFolderPath, fileName);
                    block.textureFilesPaths[name] = src;
                });
        } catch (err) {
            console.error(err);
        }

        blocks.defaultBlocksFolder.push(block);
    }
    
    return blocks;
}

let generatorWindow;
function openGenerator() {
    if (generatorWindow == undefined || generatorWindow.isDestroyed()) {
         // Make generator window.
         generatorWindow = new BrowserWindow({
            width: 0, // Will be changed in a bit.
            height: 0, // Will be changed in a bit.
            webPreferences: {
                preload: path.join(__dirname, 'preload.js'),
            },
            autoHideMenuBar: true, // Menu bar is ugly, so hide it.
        });
    
        // Get window bounds to figure out what display the
        // window was spawned in.
        const winBounds = generatorWindow.getBounds();
        const display = screen.getDisplayMatching(winBounds);
    
        // Set window size to be 50% of the width of the
        // display and 60% of the height, and then center
        // it.
        const newHeight = Math.round(display.bounds.height * 0.7);
        const newWidth = Math.round(newHeight * 1.5)
        generatorWindow.setSize(newWidth, newHeight);
        generatorWindow.center();
    
        // Load the main HTML file onto the window.
        generatorWindow.loadFile('generator.html');
    
        ipcMain.removeHandler('selectFolder');
        ipcMain.handle('selectFolder', async () => {
            const { canceled, filePaths } = await dialog.showOpenDialog(generatorWindow, {
                properties: ['openDirectory']
            })
            if (canceled) {
                return;
            } else {
                return filePaths[0];
            }
        });
        
    } else {
        generatorWindow.focus();
    }
}

async function displayDeleteDialog(event, block) {
    const { response, checkboxChecked } = await dialog.showMessageBox({
        type: 'question',
        buttons: ['Delete', 'Cancel'],
        title: 'Delete block',
        message: 'Are you sure you want to delete this block?'
    });

    if (response == 0) {
        deleteBlock(block);
        BrowserWindow.fromId(event.sender.id).reload();
    }
}

function deleteBlock(block) {
    fs.rmSync(block.path, { recursive: true });
}