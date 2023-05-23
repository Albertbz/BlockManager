const { app, BrowserWindow, ipcMain, screen, dialog, shell } = require('electron');
const path = require('path');
const { createDDSImage, decompressDDSImage } = require('./dds');
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

let loadingWin;
function spawnLoadingBlockWindow() {
    loadingWin = new BrowserWindow({
        width: 250,
        height: 75,
        center: true,
        frame: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
        },
        parent: mainWindow,
        modal: true,
        show: false
    });

    loadingWin.loadFile('loadingPopup.html');
}

let generatingWin;
function spawnGeneratingBlockWindow() {
    generatingWin = new BrowserWindow({
        width: 250,
        height: 75,
        center: true,
        frame: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
        },
        parent: mainWindow,
        modal: true,
        show: false
    });

    generatingWin.loadFile('generatingPopup.html');
}

// As soon as the Electron app is ready, create the window.
app.whenReady().then(() => {
    createWindow();

    // I spawn it twice because for some reason, the first popup after
    // the main window can sometimes become black when shown. But it 
    // only happens for the very first one, so I do this to "fix" it...
    spawnLoadingBlockWindow();
    spawnLoadingBlockWindow();
    spawnGeneratingBlockWindow();

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
ipcMain.handle('getAllBlocks', getAllBlocks);
ipcMain.handle('displayDeleteDialog', displayDeleteDialog);
ipcMain.handle('refreshMainWindow', () => mainWindow.reload());
ipcMain.handle('loadGenerator', loadGenerator);
ipcMain.handle('loadManageBlocks', loadManageBlocks);
ipcMain.handle('selectFolder', selectFolder);
ipcMain.handle('saveBlockInTemp', saveBlockInTemp);
ipcMain.handle('clearTemp', clearTemp);
ipcMain.handle('getTemp', getTemp);
ipcMain.handle('getTempTextures', getTempTextures);
ipcMain.handle('deleteBlockInTemp', () => deleteBlock(temp));


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
    const recipePath = path.join(__dirname, '\\premade\\Recipe.txt');

    try {
        const data = fs.readFileSync(recipePath, 'utf-8');
        return data;
    } catch {
        console.error(err);
    }
}

async function generateCustomBlock(event, location, propertiesFileContent, recipePictureImgSrc, regularTextures, smallTextures, normalTextures, glowTextures) {
    showPopup(generatingWin);
    await sleep(100);

    // Make folder for block
    if (!fs.existsSync(location)) {
        fs.mkdirSync(location, { recursive: true });
    }

    // Make properties file
    fs.writeFile(`${location}\\Properties.json`, JSON.stringify(propertiesFileContent), function (err) {
        if (err) console.error(err);
        //console.log('Successfully made properties file')
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

    generatingWin.hide();

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
        parent: mainWindow,
        modal: true
    });

    popupWin.loadFile('generationPopup.html');

    const winPosition = mainWindow.getPosition();
    const winSize = mainWindow.getSize();
    popupWin.setPosition(winPosition[0] + Math.round(winSize[0] / 2) - 150, winPosition[1] + Math.round(winSize[1] / 2) - 100);
}

function openGenerationLocation() {
    shell.showItemInFolder(generationLocation);
}

function getAllBlocks() {
    const modsFolderPath = getModsFolderPath();
    let blocks = {
        defaultBlocksFolder: [],
        modFolders: []
    };

    
    // Add all blocks in Blocks folder
    const blocksFolderPath = path.join(modsFolderPath, 'Blocks');
    addBlocksTo(blocks.defaultBlocksFolder, blocksFolderPath);


    // Add all blocks in mod folders
    const modFolders = getAllModFolders();
    for (let i = 0; i < modFolders.length; i++) {
        const values = modFolders[i];
        let modFolder = {
            name: values.name,
            updates: []
        }
        for (let j = 0; j < values.updates.length; j++) {
            const modFolderBlocksPath = path.join(modsFolderPath, 
                `ModFolders\\${values.name}\\${values.updates[j]}\\Blocks`);
            const update = {
                name: values.updates[j],
                blocksFolder: []
            }
            addBlocksTo(update.blocksFolder, modFolderBlocksPath);
            modFolder.updates.push(update);
        }
        blocks.modFolders.push(modFolder);
    }

    return blocks;
}

function addBlocksTo(blocks, blocksFolderPath) {
    // Check if given path even exists
    if (!fs.existsSync(blocksFolderPath)) return;

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
            const fileNames = fs.readdirSync(texturesFolderPath)
                .filter(fileName => !fileName.includes('_'));
            fileNames.forEach(fileName => {
                const name = fileName.replace('.dds', '');
                const src = path.join(texturesFolderPath, fileName);
                block.textureFilesPaths[name] = src;
            });
        } catch (err) {
            console.error(err);
        }

        blocks.push(block);
    }
}

async function displayDeleteDialog(event, block) {
    const { response, checkboxChecked } = await dialog.showMessageBox(mainWindow, {
        type: 'question',
        buttons: ['Yes, delete it', 'Cancel'],
        title: 'Delete block',
        message: 'Are you sure you want to delete this block?'
    });

    if (response == 0) {
        deleteBlock(block);
        return true;
    }
    return false;
}

function deleteBlock(block) {
    fs.rmSync(block.path, { recursive: true });
}

function loadGenerator() {
    mainWindow.loadFile('generator.html');
}

function loadManageBlocks() {
    mainWindow.loadFile('manageBlocks.html')
}

async function selectFolder() {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    })
    if (canceled) {
        return;
    } else {
        return filePaths[0];
    }
}

let temp = undefined;
const tempPath = path.join(__dirname, 'temp');
async function saveBlockInTemp(event, block) {
    clearTemp();
    showPopup(loadingWin);
    await sleep(100);
    decompressTexturesAndMoveToTemp(block);
    decompressRecipePreviewAndMoveToTemp(block);
    loadingWin.hide();
    temp = block;
    return true;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function clearTemp() {
    temp = undefined;
    fs.readdirSync(tempPath).forEach(f => fs.rmSync(`${tempPath}\\${f}`, { recursive: true }));
}

function getTemp() {
    return temp;
}

function decompressTexturesAndMoveToTemp(block) {
    const texturesPath = path.join(block.path, 'Textures');
    const compressedTexturesPaths = fs.readdirSync(texturesPath)
        .map(fileName => [path.join(texturesPath, fileName), fileName]);

    for (const [inputPath, fileName] of compressedTexturesPaths) {
        const outputPath = path.join(tempPath, fileName.replace('dds', 'png'));

        decompressDDSImage(inputPath, outputPath);
    }
}

function decompressRecipePreviewAndMoveToTemp(block) {
    const inputPath = block.recipePreviewPath;
    const outputPath = path.join(tempPath, 'recipePreview.png');
    decompressDDSImage(inputPath, outputPath);
}

function getTempTextures() {
    let textures = {};
    const allTextures = fs.readdirSync(tempPath)
        .filter(fileName => !fileName.includes('recipe'));

    textures.regular = allTextures
        .filter(fileName => !fileName.includes('_'))
        .map(fileName => path.join(tempPath, fileName));

    textures.small = allTextures
        .filter(fileName => fileName.includes('small'))
        .map(fileName => path.join(tempPath, fileName));

    textures.normal = allTextures
        .filter(fileName => fileName.includes('normal'))
        .map(fileName => path.join(tempPath, fileName));

    textures.glow = allTextures
        .filter(fileName => fileName.includes('glow'))
        .map(fileName => path.join(tempPath, fileName));

    return textures;
}

function showPopup(popupWin) {
    const winPosition = mainWindow.getPosition();
    const winSize = mainWindow.getSize();
    popupWin.setPosition(winPosition[0] + Math.round(winSize[0] / 2) - Math.round(popupWin.getSize()[0] / 2), winPosition[1] + Math.round(winSize[1] / 2) - Math.round(popupWin.getSize()[1] / 2));

    popupWin.show();
}