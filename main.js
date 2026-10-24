const { app, BrowserWindow, ipcMain, screen, dialog, shell } = require('electron');
const path = require('path');
const { createDDSImage, decompressDDSImage } = require('./dds');
const env = require('windows-env');
const fs = require('fs');
const { getGamePath } = require('steam-game-path');
const sharp = require('sharp');

// Folders for temporary files. These are not part of the repository,
// so make sure they exist.
const tempPath = path.join(__dirname, 'temp');
const tempTexturesPath = path.join(__dirname, 'temp_textures');
const previewPath = path.join(__dirname, 'preview');
const thumbnailsPath = path.join(__dirname, 'thumbnails');
[tempPath, tempTexturesPath, previewPath, thumbnailsPath].forEach(dir => fs.mkdirSync(dir, { recursive: true }));

// Thumbnails are only kept for as long as the app is running.
fs.readdirSync(thumbnailsPath).forEach(f => fs.rmSync(path.join(thumbnailsPath, f), { recursive: true }));

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
ipcMain.handle('generateCustomBlock', (...args) => queueTextureWork(() => generateCustomBlock(...args)));
ipcMain.handle('getModsFolderPath', getModsFolderPath);
ipcMain.handle('getAllModFolders', getAllModFolders);
ipcMain.handle('generationCompletePopup', generationCompletePopup);
ipcMain.handle('openGenerationLocation', openGenerationLocation);
ipcMain.handle('getAllBlocks', getAllBlocks);
ipcMain.handle('displayDeleteDialog', displayDeleteDialog);
ipcMain.handle('refreshMainWindow', () => mainWindow.reload());
ipcMain.handle('loadGenerator', loadGenerator);
ipcMain.handle('loadManageBlocks', loadManageBlocks);
ipcMain.handle('displayDiscardDialog', displayDiscardDialog);
ipcMain.handle('selectFolder', selectFolder);
ipcMain.handle('saveBlockInTemp', saveBlockInTemp);
ipcMain.handle('clearTemp', clearTemp);
ipcMain.handle('getTemp', getTemp);
ipcMain.handle('getTempTextures', getTempTextures);
ipcMain.handle('removeBlockToDelete', removeBlockToDelete);
ipcMain.handle('generatePreviewBlock', (...args) => queueTextureWork(() => generatePreviewBlock(...args)));
ipcMain.handle('getTextureThumbnail', getTextureThumbnail);


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
    } catch (err) {
        console.error(err);
        return undefined;
    }
}

function getDefaultRecipeFileContent() {
    const recipePath = path.join(__dirname, '\\premade\\Recipe.txt');

    try {
        const data = fs.readFileSync(recipePath, 'utf-8');
        return data;
    } catch (err) {
        console.error(err);
    }
}

// Compressonator fails on paths with characters like 'æ', so it only
// works on fixed file names in the temp textures folder, and the
// result is copied to where it should be.
const resizedTexturePath = path.join(tempTexturesPath, 'resized.png');
const compressedTexturePath = path.join(tempTexturesPath, 'compressed.dds');
const decompressedTexturePath = path.join(tempTexturesPath, 'decompressed.png');

// As those files are shared, only one block or preview is made at a time
let textureWork = Promise.resolve();
function queueTextureWork(work) {
    const result = textureWork.then(work);
    textureWork = result.catch(() => { });
    return result;
}

async function createTexture(src, outputPath, size, format) {
    // DDS files that are already exactly as needed are used as they are.
    if (isMatchingDDS(src, size, format)) {
        fs.copyFileSync(src, outputPath);
        return;
    }

    await sharp(getReadableImage(src)).resize(size, size).toFile(resizedTexturePath);
    createDDSImage(resizedTexturePath, compressedTexturePath, format);
    fs.copyFileSync(compressedTexturePath, outputPath);
}

// sharp can't read DDS files, so those are decompressed to a PNG first.
function getReadableImage(src) {
    if (!isDDSFile(src)) return src;

    fs.copyFileSync(src, compressedTexturePath);
    decompressDDSImage(compressedTexturePath, decompressedTexturePath);
    return decompressedTexturePath;
}

function isDDSFile(filePath) {
    return path.extname(filePath).toLowerCase() == '.dds';
}

// The ways each format can be stored in a DDS file: legacy FourCC
// codes, or DXGI formats for files with a DX10 header.
const ddsFormats = {
    BC1: { fourCCs: ['DXT1'], dxgiFormats: [71, 72] },
    BC3: { fourCCs: ['DXT5'], dxgiFormats: [77, 78] },
    BC4: { fourCCs: ['ATI1', 'BC4U'], dxgiFormats: [80] },
    BC5: { fourCCs: ['ATI2', 'BC5U'], dxgiFormats: [83] }
};

// Whether the file is a DDS file of the given size and format, with a
// full set of mipmaps (the same as what Compressonator would make).
function isMatchingDDS(filePath, size, format) {
    if (!isDDSFile(filePath)) return false;

    const header = Buffer.alloc(148);
    const fd = fs.openSync(filePath, 'r');
    try {
        fs.readSync(fd, header, 0, header.length, 0);
    } finally {
        fs.closeSync(fd);
    }

    if (header.toString('ascii', 0, 4) != 'DDS ') return false;

    const height = header.readUInt32LE(12);
    const width = header.readUInt32LE(16);
    const mipMapCount = header.readUInt32LE(28);
    const fourCC = header.toString('ascii', 84, 88);

    const { fourCCs, dxgiFormats } = ddsFormats[format];
    const formatMatches = fourCC == 'DX10'
        ? dxgiFormats.includes(header.readUInt32LE(128))
        : fourCCs.includes(fourCC);

    return width == size && height == size
        && mipMapCount == Math.log2(size) + 1
        && formatMatches;
}

// Browsers can't show DDS files, so make small PNG thumbnails of them.
let thumbnailCount = 0;
const thumbnails = new Map();
async function getTextureThumbnail(event, filePath) {
    try {
        const key = `${filePath}|${fs.statSync(filePath).mtimeMs}`;
        if (thumbnails.has(key)) return thumbnails.get(key);

        // Unique names, as several thumbnails can be made at once.
        const n = thumbnailCount++;
        const ddsPath = path.join(thumbnailsPath, `${n}.dds`);
        const fullSizePath = path.join(thumbnailsPath, `${n}_full.png`);
        const thumbnailPath = path.join(thumbnailsPath, `${n}.png`);

        fs.copyFileSync(filePath, ddsPath);
        decompressDDSImage(ddsPath, fullSizePath);
        await sharp(fullSizePath).resize(256, 256).toFile(thumbnailPath);
        fs.rmSync(ddsPath);
        fs.rmSync(fullSizePath);

        thumbnails.set(key, thumbnailPath);
        return thumbnailPath;
    } catch (err) {
        console.error(err);
        return undefined;
    }
}

async function generateCustomBlock(event, location, propertiesFileContent, regularTextures, smallTextures, normalTextures, glowTextures, heightTextures) {
    showPopup(generatingWin);
    await sleep(100);

    // The block is first made in a staging folder, so that nothing
    // existing is touched if anything goes wrong.
    const stagingPath = `${location}.BlockManagerNew`;
    const backupPath = `${location}.BlockManagerOld`;

    try {
        fs.rmSync(stagingPath, { recursive: true, force: true });
        await writeBlockFiles(stagingPath, propertiesFileContent,
            regularTextures, smallTextures, normalTextures, glowTextures, heightTextures);

        // Swap the new block in, keeping a backup of whatever
        // was there until the swap has succeeded.
        fs.rmSync(backupPath, { recursive: true, force: true });
        const hadExisting = fs.existsSync(location);
        if (hadExisting) fs.renameSync(location, backupPath);
        try {
            fs.renameSync(stagingPath, location);
        } catch (err) {
            if (hadExisting) fs.renameSync(backupPath, location);
            throw err;
        }
        fs.rmSync(backupPath, { recursive: true, force: true });

        // If an edited block was saved somewhere else, remove the original.
        if (temp != undefined && fs.existsSync(temp.path)
            && path.resolve(temp.path).toLowerCase() != path.resolve(location).toLowerCase()) {
            fs.rmSync(temp.path, { recursive: true });
        }
        clearTemp();

        return true;
    } catch (err) {
        console.error(err);
        fs.rmSync(stagingPath, { recursive: true, force: true });
        dialog.showErrorBox('Could not generate block',
            `Something went wrong while generating the block. Nothing has been changed.\n\n${err.message}`);
        return false;
    } finally {
        clearFolder(tempTexturesPath);
        generatingWin.hide();
    }
}

async function writeBlockFiles(location, propertiesFileContent, regularTextures, smallTextures, normalTextures, glowTextures, heightTextures) {
    // Make folder for block
    const texturesPath = path.join(location, 'Textures');
    fs.mkdirSync(texturesPath, { recursive: true });

    // Make properties file
    fs.writeFileSync(path.join(location, 'Properties.json'), JSON.stringify(propertiesFileContent));

    // Create regular textures
    for (const [src, name] of regularTextures) {
        await createTexture(src, path.join(texturesPath, `${name}.dds`), 2048, 'BC3');
    }

    // Create small textures. If none, automatically
    // make them using the regular textures.
    const smallTextureSources = smallTextures.length == 0 ? regularTextures : smallTextures;
    for (const [src, name] of smallTextureSources) {
        await createTexture(src, path.join(texturesPath, `${name}_small.dds`), 512, 'BC3');
    }

    // Create normal map textures
    for (const [src, name] of normalTextures) {
        await createTexture(src, path.join(texturesPath, `${name}_normal.dds`), 2048, 'BC5');
    }

    // Create glow map textures
    for (const [src, name] of glowTextures) {
        await createTexture(src, path.join(texturesPath, `${name}_glow.dds`), 1024, 'BC1');
    }

    // Create height map textures
    for (const [src, name] of heightTextures) {
        await createTexture(src, path.join(texturesPath, `${name}_height.dds`), 2048, 'BC4');
    }
}

function clearFolder(folderPath) {
    fs.readdirSync(folderPath).forEach(f => fs.rmSync(path.join(folderPath, f), { recursive: true }));
}

function getModsFolderPath() {
    try {
        const cyubeVRPath = getGamePath(619500).game.path;
        const modsFolderPath = path.join(cyubeVRPath, 'cyubeVR\\Mods');
        return modsFolderPath;
    }
    catch {
        return undefined;
    }
}

function getAllModFolders() {
    const modsFolderPath = getModsFolderPath();

    if (modsFolderPath == undefined) return [];

    const modFoldersPath = path.join(modsFolderPath, 'ModFolders');

    let res = [];

    if (!fs.existsSync(modFoldersPath)) return res;

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
    openPopup('generationPopup.html');
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

    if (modsFolderPath == undefined) return blocks;
    
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
            if (typeof properties != 'object' || properties == null) {
                throw new Error(`Invalid properties file: ${propertiesFilePath}`);
            }
            block.properties = properties;
        } catch (err) {
            // Skip blocks whose properties can't be read, as
            // the rest of the app relies on them.
            console.error(err);
            continue;
        }

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

let blockToDelete = undefined;
async function displayDeleteDialog(event, block) {
    blockToDelete = block;
    openPopup('deletionPopup.html');
}

async function displayDiscardDialog(event, isEditing) {
    openPopup('discardPopup.html', { isEditing: String(isEditing) });
}

/**
 * Show a small popup in the middle of the main window, which can't be
 * used until the popup is closed.
 */
function openPopup(file, query) {
    const popupWin = new BrowserWindow({
        width: 300,
        height: 200,
        center: true,
        frame: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
        },
        parent: mainWindow,
        modal: true,
        show: false
    });

    popupWin.loadFile(file, { query });

    popupWin.once('ready-to-show', () => {
        popupWin.show();
    })

    const winPosition = mainWindow.getPosition();
    const winSize = mainWindow.getSize();
    popupWin.setPosition(winPosition[0] + Math.round(winSize[0] / 2) - 150, winPosition[1] + Math.round(winSize[1] / 2) - 100);
}

function removeBlockToDelete() {
    deleteBlock(blockToDelete);
}

function deleteBlock(block) {
    fs.rmSync(block.path, { recursive: true });
}

function loadGenerator() {
    mainWindow.loadFile('generator.html');
    mainWindow.focus();
}

function loadManageBlocks() {
    mainWindow.loadFile('manageBlocks.html');
    mainWindow.focus();
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
async function saveBlockInTemp(event, block) {
    clearTemp();
    showPopup(loadingWin);
    await sleep(100);
    try {
        decompressTexturesAndMoveToTemp(block);
        temp = block;
        return true;
    } catch (err) {
        console.error(err);
        clearTemp();
        dialog.showErrorBox('Could not load block',
            `Something went wrong while loading the block's textures.\n\n${err.message}`);
        return false;
    } finally {
        loadingWin.hide();
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function clearTemp() {
    temp = undefined;
    clearFolder(tempPath);
}

function getTemp() {
    return temp;
}

function decompressTexturesAndMoveToTemp(block) {
    const texturesPath = path.join(block.path, 'Textures');
    const compressedTexturesPaths = fs.readdirSync(texturesPath)
        .map(fileName => [path.join(texturesPath, fileName), fileName]);

    try {
        for (const [inputPath, fileName] of compressedTexturesPaths) {
            const outputPath = path.join(tempPath, fileName.replace('dds', 'png'));

            // Copy to a fixed name first, as the block's path may contain
            // characters that Compressonator can't handle (see createTexture).
            fs.copyFileSync(inputPath, compressedTexturePath);
            decompressDDSImage(compressedTexturePath, resizedTexturePath);
            fs.copyFileSync(resizedTexturePath, outputPath);
        }
    } finally {
        clearFolder(tempTexturesPath);
    }
}

async function getTempTextures() {
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

    textures.height = allTextures
        .filter(fileName => fileName.includes('height'))
        .map(fileName => path.join(tempPath, fileName));

    // If the small textures were autogenerated from the regular textures,
    // leave them out so they get regenerated from whatever regular
    // textures the block ends up with.
    if (await smallTexturesAreGenerated(textures.regular, textures.small)) {
        textures.small = [];
    }

    return textures;
}

async function smallTexturesAreGenerated(regularTextures, smallTextures) {
    if (smallTextures.length == 0 || smallTextures.length != regularTextures.length) return false;

    try {
        for (const regularPath of regularTextures) {
            const smallPath = regularPath.replace(/\.png$/, '_small.png');
            if (!smallTextures.includes(smallPath)) return false;

            // Compare the small texture to a downscaled regular texture. For
            // autogenerated ones the average difference per channel is around
            // 3 (from compression), whereas unrelated textures differ far more.
            const [regular, small] = await Promise.all([regularPath, smallPath].map(p =>
                sharp(p).resize(512, 512).ensureAlpha().raw().toBuffer()));

            let totalDifference = 0;
            for (let i = 0; i < regular.length; i++) {
                totalDifference += Math.abs(regular[i] - small[i]);
            }
            if (totalDifference / regular.length > 8) return false;
        }
    } catch (err) {
        console.error(err);
        return false;
    }

    return true;
}

function showPopup(popupWin) {
    const winPosition = mainWindow.getPosition();
    const winSize = mainWindow.getSize();
    popupWin.setPosition(winPosition[0] + Math.round(winSize[0] / 2) - Math.round(popupWin.getSize()[0] / 2), winPosition[1] + Math.round(winSize[1] / 2) - Math.round(popupWin.getSize()[1] / 2));

    popupWin.show();
}

// Made in the background while choosing textures, so no popup is shown
async function generatePreviewBlock(event, textures) {
    let texturesDDS = {};

    try {
        clearFolder(previewPath);

        for (const [src, name] of textures) {
            const outputPath = path.join(previewPath, `${name}.dds`);
            await createTexture(src, outputPath, 2048, 'BC3');
            texturesDDS[name] = outputPath;
        }

        return texturesDDS;
    } catch (err) {
        console.error(err);
        dialog.showErrorBox('Could not generate preview',
            `Something went wrong while generating the preview.\n\n${err.message}`);
        return undefined;
    } finally {
        clearFolder(tempTexturesPath);
    }
}