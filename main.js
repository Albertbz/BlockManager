const { app, BrowserWindow, ipcMain, screen, dialog, shell } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const { createDDSImage, decompressDDSImage, readDDSImage, hasDDSMipMaps, getDDSSize, extractDDSMipMaps } = require('./dds');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');
const sharp = require('sharp');

// Folders for temporary files. These are not part of the repository,
// so make sure they exist.
const tempTexturesPath = path.join(__dirname, 'temp_textures');
const textureCachePath = path.join(__dirname, 'texture_cache');
const thumbnailsPath = path.join(__dirname, 'thumbnails');
[tempTexturesPath, textureCachePath, thumbnailsPath].forEach(dir => fs.mkdirSync(dir, { recursive: true }));

// These are only kept for as long as the app is running.
[tempTexturesPath, textureCachePath, thumbnailsPath].forEach(clearFolder);

// The main window's position, size and maximized state are kept
// here between runs.
const windowStatePath = path.join(app.getPath('userData'), 'windowState.json');

function loadWindowState() {
    try {
        const state = JSON.parse(fs.readFileSync(windowStatePath, 'utf8'));
        const { x, y, width, height } = state.bounds;
        if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;

        // Only use the saved bounds if the top of the window (where
        // the title bar is) is still visible on one of the displays,
        // e.g. not on a monitor that has been unplugged since.
        const display = screen.getAllDisplays().find(display => {
            const area = display.workArea;
            const overlapWidth = Math.min(x + width, area.x + area.width) - Math.max(x, area.x);
            const titleBarY = y + 10;
            return overlapWidth >= 100 && titleBarY >= area.y && titleBarY < area.y + area.height;
        });
        if (!display) return null;

        // Don't let the window be bigger than the display it is on
        // (e.g. if the display's resolution has been lowered).
        return {
            bounds: {
                x, y,
                width: Math.min(width, display.workArea.width),
                height: Math.min(height, display.workArea.height),
            },
            isMaximized: state.isMaximized === true,
        };
    } catch {
        // No saved state yet, or it couldn't be read.
        return null;
    }
}

function saveWindowState() {
    if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMinimized()) return;

    // getNormalBounds gives the size the window has when it isn't
    // maximized, so un-maximizing after a restart works as expected.
    const state = { bounds: mainWindow.getNormalBounds(), isMaximized: mainWindow.isMaximized() };
    try {
        fs.writeFileSync(windowStatePath, JSON.stringify(state));
    } catch (err) {
        console.error('Could not save window state:', err);
    }
}

let mainWindow;
function createWindow() {
    const savedState = loadWindowState();

    // Make initial window.
    mainWindow = new BrowserWindow({
        ...(savedState ? savedState.bounds : {
            width: 0, // Will be changed in a bit.
            height: 0, // Will be changed in a bit.
        }),
        // Smaller than this, there isn't room for an opened block.
        minWidth: 640,
        minHeight: 480,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
        },
        autoHideMenuBar: true, // Menu bar is ugly, so hide it.
    });

    if (savedState) {
        if (savedState.isMaximized) mainWindow.maximize();
    } else {
        // Get window bounds to figure out what display the
        // window was spawned in.
        const winBounds = mainWindow.getBounds();
        const display = screen.getDisplayMatching(winBounds);

        // Set window height to be 70% of the height of the
        // display with a 1.5 aspect ratio, and then center it.
        const newHeight = Math.round(display.bounds.height * 0.7);
        const newWidth = Math.round(newHeight * 1.5)
        mainWindow.setSize(newWidth, newHeight);
        mainWindow.center();
    }

    // Save the window state when it changes (a bit delayed, as these
    // events fire continuously while dragging) and when it closes.
    let saveTimeout;
    const scheduleSave = () => {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(saveWindowState, 500);
    };
    ['resize', 'move', 'maximize', 'unmaximize'].forEach(event => mainWindow.on(event, scheduleSave));
    mainWindow.on('close', () => {
        clearTimeout(saveTimeout);
        saveWindowState();
    });

    // Load the main HTML file onto the window.
    mainWindow.loadFile('manageBlocks.html');
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
    spawnGeneratingBlockWindow();
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
ipcMain.handle('showGeneratedBlock', showGeneratedBlock);
ipcMain.handle('takeBlockToShow', takeBlockToShow);
ipcMain.handle('getAllBlocks', getAllBlocks);
ipcMain.handle('displayDeleteDialog', displayDeleteDialog);
ipcMain.handle('refreshMainWindow', async () => {
    await leavePage();
    mainWindow.reload();
});
ipcMain.handle('loadGenerator', loadGenerator);
ipcMain.handle('loadManageBlocks', loadManageBlocks);
ipcMain.handle('displayDiscardDialog', displayDiscardDialog);
ipcMain.handle('selectFolder', selectFolder);
ipcMain.handle('saveBlockInTemp', saveBlockInTemp);
ipcMain.handle('clearTemp', clearTemp);
ipcMain.handle('getTemp', getTemp);
ipcMain.handle('getTempTextures', getTempTextures);
ipcMain.handle('removeBlockToDelete', removeBlockToDelete);
ipcMain.handle('generatePreviewBlock', generatePreviewBlock);
ipcMain.handle('prepareTextures', prepareTextures);
ipcMain.handle('getTextureThumbnail', getTextureThumbnail);
ipcMain.handle('getBlockTexturesUrl', getBlockTexturesUrl);


/*
*
* All wrapper functions called from renderer.
*
*/

// Ignore event argument.
function createDDSImageWrapper(event, inputPath, outputPath, format) {
    return createDDSImage(inputPath, outputPath, format);
}

function getGeneratedRecipeFileContent() {
    const localAppdataPath = process.env.LOCALAPPDATA;
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

// The size and format the game uses for each type of texture, and what
// is added to the face's name in the file name.
const textureTypes = {
    regular: { size: 2048, format: 'BC3', suffix: '' },
    small: { size: 512, format: 'BC3', suffix: '_small' },
    normal: { size: 2048, format: 'BC5', suffix: '_normal' },
    glow: { size: 1024, format: 'BC1', suffix: '_glow' },
    height: { size: 2048, format: 'BC4', suffix: '_height' }
};

/*
 * Converted textures are kept in the texture cache until the generator is
 * left, so each texture is only converted once: the preview and the block
 * use the same files, and the textures are converted in the background
 * while the rest of the block is being made (see prepareTextures). Each
 * entry is { promise, conversion }, where the promise gives the file's
 * path, and conversion is its place in the queue, if it is converted.
 */
const textureCache = new Map();
let textureCacheFileCount = 0;

// A texture is converted again if its file changes
function getTextureKey(src, size, format) {
    const { mtimeMs, size: fileSize } = fs.statSync(src);
    return JSON.stringify([path.resolve(src), mtimeMs, fileSize, size, format]);
}

/**
 * Get a DDS file of the texture at src, of the given size and format and
 * with every mipmap, which must not be changed. Urgent ones, which are
 * waited for, are converted before the ones made in advance.
 */
function getTexture(src, size, format, urgent = true) {
    let key, entry;
    try {
        key = getTextureKey(src, size, format);
        entry = textureCache.get(key);
        if (entry != undefined) {
            if (urgent && entry.conversion != undefined) entry.conversion.urgent = true;
            return entry.promise;
        }
        entry = makeTexture(src, size, format, key, urgent);
    } catch (err) {
        // Like the file not existing anymore
        return Promise.reject(err);
    }
    textureCache.set(key, entry);

    // Failed ones are tried again the next time they are needed. Ones
    // finished after the cache has been cleared aren't needed anymore.
    entry.promise.then(texturePath => {
        if (textureCache.get(key) != entry && texturePath.startsWith(textureCachePath)) {
            fs.rmSync(texturePath, { force: true });
        }
    }, () => {
        if (textureCache.get(key) == entry) textureCache.delete(key);
    });
    return entry.promise;
}

function makeTexture(src, size, format, key, urgent) {
    const outputPath = path.join(textureCachePath, `${textureCacheFileCount++}.dds`);

    // DDS files with the mipmaps needed (like those of an existing block)
    // are used as they are, or with the larger mipmaps left out.
    if (isDDSFile(src) && hasDDSMipMaps(src, size, format)) {
        if (getDDSSize(src) == size) return { promise: Promise.resolve(src) };
        return { promise: extractDDSMipMaps(src, outputPath, size, format).then(() => outputPath) };
    }

    // Smaller textures are made from the mipmaps of a larger one of the
    // same texture, if that is made anyway (like when the small textures
    // are made from the regular ones), as the mipmaps are the texture
    // shrunk already.
    for (let largerSize = textureTypes.regular.size; largerSize > size; largerSize /= 2) {
        const larger = textureCache.get(getTextureKey(src, largerSize, format));
        if (larger == undefined) continue;

        if (urgent && larger.conversion != undefined) larger.conversion.urgent = true;
        return {
            promise: larger.promise.then(largerPath => extractDDSMipMaps(largerPath, outputPath, size, format)).then(() => outputPath),
            conversion: larger.conversion
        };
    }

    const conversion = { key, urgent, run: () => convertTexture(src, outputPath, size, format) };
    return { promise: queueConversion(conversion).then(() => outputPath), conversion };
}

// Several conversions run at once, as each mostly uses a single core
const maxConversions = Math.max(1, Math.min(4, Math.floor(os.cpus().length / 2)));
const conversionQueue = [];
let runningConversions = 0;

// The conversion is the same object as in the cache, so it becomes urgent
// as soon as that is set there.
function queueConversion(conversion) {
    return new Promise((resolve, reject) => {
        Object.assign(conversion, { resolve, reject });
        conversionQueue.push(conversion);
        startConversions();
    });
}

function startConversions() {
    while (runningConversions < maxConversions && conversionQueue.length > 0) {
        // Urgent ones first, otherwise in the order they were queued
        const index = Math.max(0, conversionQueue.findIndex(conversion => conversion.urgent));
        const [conversion] = conversionQueue.splice(index, 1);

        runningConversions++;
        conversion.run()
            .then(conversion.resolve, conversion.reject)
            .finally(() => {
                runningConversions--;
                startConversions();
            });
    }
}

// Conversions that haven't started yet are left out
function cancelConversions(shouldCancel) {
    for (let i = conversionQueue.length - 1; i >= 0; i--) {
        const conversion = conversionQueue[i];
        if (!shouldCancel(conversion)) continue;

        conversionQueue.splice(i, 1);
        const err = new Error('The texture is no longer needed');
        err.isCancelled = true;
        conversion.reject(err);
    }
}

function clearTextureCache() {
    cancelConversions(() => true);
    textureCache.clear();
    clearFolder(textureCachePath);
}

/**
 * Convert textures in the background while the block is being made, so
 * that they are ready when it is generated. Textures that were to be
 * converted, but no longer are chosen, are left out.
 */
function prepareTextures(event, textures) {
    const keys = new Set();
    for (const [type, sources] of Object.entries(textures)) {
        const { size, format } = textureTypes[type];
        for (const src of sources) {
            try {
                keys.add(getTextureKey(src, size, format));
            } catch (err) {
                console.error(err);
                continue;
            }
            // If it fails, it is tried again when it is needed, which shows the error
            getTexture(src, size, format, false).catch(err => {
                if (!err.isCancelled) console.error(err);
            });
        }
    }

    cancelConversions(conversion => !conversion.urgent && !keys.has(conversion.key));
}

async function convertTexture(src, outputPath, size, format) {
    // Each conversion works on fixed file names in a folder of its own,
    // so conversions can't get in each other's way, and the result is
    // moved to where it should be.
    const workPath = fs.mkdtempSync(path.join(tempTexturesPath, 'conversion'));
    try {
        const resizedPath = path.join(workPath, 'resized.png');
        const compressedPath = path.join(workPath, 'compressed.dds');

        // The PNG is only read by texconv, so compressing it would
        // only make it slower.
        const image = await getReadableImage(src, size, workPath);
        await image.resize(size, size).png({ compressionLevel: 0 }).toFile(resizedPath);
        await createDDSImage(resizedPath, compressedPath, format);
        fs.renameSync(compressedPath, outputPath);
    } finally {
        fs.rmSync(workPath, { recursive: true, force: true });
    }
}

// sharp can't read DDS files, so those are decoded first. readDDSImage is
// much faster, but other formats are decompressed by texconv.
async function getReadableImage(src, size, workPath) {
    if (!isDDSFile(src)) return sharp(src);

    const image = readDDSImage(src, size);
    if (image != undefined) {
        const { width, height, data } = image;
        return sharp(data, { raw: { width, height, channels: 4 } });
    }

    const ddsPath = path.join(workPath, 'source.dds');
    const decompressedPath = path.join(workPath, 'decompressed.png');
    fs.copyFileSync(src, ddsPath);
    await decompressDDSImage(ddsPath, decompressedPath);
    return sharp(decompressedPath);
}

function isDDSFile(filePath) {
    return path.extname(filePath).toLowerCase() == '.dds';
}

// Browsers can't show DDS files, so make small PNG thumbnails of them,
// from a mipmap of the right size when possible.
let thumbnailCount = 0;
const thumbnails = new Map();
async function getTextureThumbnail(event, filePath) {
    try {
        const key = `${filePath}|${fs.statSync(filePath).mtimeMs}`;
        if (thumbnails.has(key)) return thumbnails.get(key);

        // Unique names, as several thumbnails can be made at once.
        const n = thumbnailCount++;
        const thumbnailPath = path.join(thumbnailsPath, `${n}.png`);

        const image = readDDSImage(filePath, 256);
        if (image != undefined) {
            const { width, height, data } = image;
            await sharp(data, { raw: { width, height, channels: 4 } }).resize(256, 256).toFile(thumbnailPath);
        } else {
            // Other formats are decompressed by texconv, which is slower
            const ddsPath = path.join(thumbnailsPath, `${n}.dds`);
            const fullSizePath = path.join(thumbnailsPath, `${n}_full.png`);
            fs.copyFileSync(filePath, ddsPath);
            await decompressDDSImage(ddsPath, fullSizePath);
            await sharp(fullSizePath).resize(256, 256).toFile(thumbnailPath);
            fs.rmSync(ddsPath);
            fs.rmSync(fullSizePath);
        }

        thumbnails.set(key, thumbnailPath);
        return thumbnailPath;
    } catch (err) {
        console.error(err);
        return undefined;
    }
}

async function generateCustomBlock(event, location, propertiesFileContent, regularTextures, smallTextures, normalTextures, glowTextures, heightTextures) {
    // Editing is over once the block is made, so remember it for the popup
    generationWasEdit = temp != undefined;
    const title = generationWasEdit ? 'Applying edits...' : 'Generating...';
    await generatingWin.webContents.executeJavaScript(`document.getElementById('title').innerText = ${JSON.stringify(title)}`).catch(() => { });
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
        generatingWin.hide();
    }
}

async function writeBlockFiles(location, propertiesFileContent, regularTextures, smallTextures, normalTextures, glowTextures, heightTextures) {
    // Make folder for block
    const texturesPath = path.join(location, 'Textures');
    fs.mkdirSync(texturesPath, { recursive: true });

    // Make properties file
    fs.writeFileSync(path.join(location, 'Properties.json'), JSON.stringify(propertiesFileContent));

    // If there are no small textures, they are made from the regular
    // textures. The regular ones come first, so the small ones are made
    // from their mipmaps (see makeTexture).
    const textures = [
        ...regularTextures.map(texture => [...texture, 'regular']),
        ...(smallTextures.length == 0 ? regularTextures : smallTextures).map(texture => [...texture, 'small']),
        ...normalTextures.map(texture => [...texture, 'normal']),
        ...glowTextures.map(texture => [...texture, 'glow']),
        ...heightTextures.map(texture => [...texture, 'height'])
    ];

    // All at once, as several can be converted at the same time. Mostly
    // they have been converted already, while the block was being made.
    // Everything is waited for before failing, so nothing is still being
    // written when the staging folder is removed.
    const results = await Promise.allSettled(textures.map(async ([src, name, type]) => {
        const { size, format, suffix } = textureTypes[type];
        const texturePath = await getTexture(src, size, format);
        await fs.promises.copyFile(texturePath, path.join(texturesPath, `${name}${suffix}.dds`));
    }));
    const failed = results.find(result => result.status == 'rejected');
    if (failed != undefined) throw failed.reason;
}

function clearFolder(folderPath) {
    fs.readdirSync(folderPath).forEach(f => fs.rmSync(path.join(folderPath, f), { recursive: true, force: true }));
}

// Where Steam is installed, from the registry
function getSteamPath() {
    const keys = [
        ['HKCU\\Software\\Valve\\Steam', 'SteamPath'],
        ['HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam', 'InstallPath'],
        ['HKLM\\SOFTWARE\\Valve\\Steam', 'InstallPath']
    ];
    for (const [key, value] of keys) {
        try {
            const output = execFileSync('reg', ['query', key, '/v', value], { encoding: 'utf-8', windowsHide: true });
            const match = output.match(/REG_(?:EXPAND_)?SZ\s+(.+)/);
            if (match) return path.normalize(match[1].trim());
        } catch {
            // The key doesn't exist, so try the next one
        }
    }
    return undefined;
}

let cyubeVRPath;

/**
 * The folder cyubeVR is installed in, or undefined if it can't be found.
 * Games can be in any of Steam's library folders, which are listed in
 * libraryfolders.vdf. The game's manifest there gives its folder name.
 */
function getCyubeVRPath() {
    if (cyubeVRPath != undefined) return cyubeVRPath;

    const steamPath = getSteamPath();
    if (steamPath == undefined) return undefined;

    const libraryPaths = [steamPath];
    try {
        const libraryFolders = fs.readFileSync(path.join(steamPath, 'steamapps', 'libraryfolders.vdf'), 'utf-8');
        for (const match of libraryFolders.matchAll(/"path"\s+"(.+?)"/g)) {
            libraryPaths.push(match[1].replace(/\\\\/g, '\\'));
        }
    } catch {
        // Then only Steam's own library is looked in
    }

    for (const libraryPath of libraryPaths) {
        const steamAppsPath = path.join(libraryPath, 'steamapps');
        try {
            const manifest = fs.readFileSync(path.join(steamAppsPath, 'appmanifest_619500.acf'), 'utf-8');
            const installDir = manifest.match(/"installdir"\s+"(.+?)"/)?.[1];
            const gamePath = path.join(steamAppsPath, 'common', installDir ?? 'cyubeVR');
            if (fs.existsSync(gamePath)) {
                // The registry can have the path in lowercase, so get
                // the real one, as paths are compared and shown.
                cyubeVRPath = fs.realpathSync.native(gamePath);
                return cyubeVRPath;
            }
        } catch {
            // The game isn't in this library
        }
    }
    return undefined;
}

function getModsFolderPath() {
    const cyubeVRPath = getCyubeVRPath();
    if (cyubeVRPath == undefined) return undefined;
    return path.join(cyubeVRPath, 'cyubeVR\\Mods');
}

// The game's own block textures, which recipes are shown with
function getBlockTexturesUrl() {
    const cyubeVRPath = getCyubeVRPath();
    if (cyubeVRPath == undefined) return undefined;
    const texturesPath = path.join(cyubeVRPath, 'cyubeVR\\Content\\Movies\\BlockTextures\\DDS');
    return pathToFileURL(texturesPath).href;
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
let generationWasEdit = false;
async function generationCompletePopup(event, location) {
    generationLocation = location;
    openPopup('generationPopup.html', { isEditing: String(generationWasEdit) });
}

function openGenerationLocation() {
    shell.showItemInFolder(generationLocation);
}

// Manage Blocks opens the block that was just made and scrolls to it
let blockToShow = undefined;
async function showGeneratedBlock() {
    blockToShow = path.resolve(generationLocation);
    await loadManageBlocks();
}

// Only shown once, not again when e.g. the page is refreshed
function takeBlockToShow() {
    const block = blockToShow;
    blockToShow = undefined;
    return block;
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

// Before switching pages, the page first animates out (see pageTransition.js).
// The old page then stays on screen until the next one has been drawn, but
// its block previews are freed as it is left, which shows white squares
// where they were. So they are hidden first, until the screen has been
// drawn without them.
async function leavePage() {
    try {
        await mainWindow.webContents.executeJavaScript(`new Promise(resolve => {
            setTimeout(resolve, 1000);
            Promise.resolve(window.animatePageOut?.()).catch(() => { }).then(() => {
                document.querySelectorAll('canvas').forEach(canvas => canvas.style.visibility = 'hidden');
                requestAnimationFrame(() => requestAnimationFrame(resolve));
                setTimeout(resolve, 100);
            });
        })`);
    } catch { }
}

async function loadGenerator() {
    await leavePage();
    mainWindow.loadFile('generator.html');
    mainWindow.focus();
}

async function loadManageBlocks() {
    await leavePage();
    mainWindow.loadFile('manageBlocks.html');
    mainWindow.focus();

    // The textures chosen in the generator aren't needed anymore
    clearTextureCache();
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

// The block being edited. Its textures are used straight from its folder,
// and copied unchanged into the saved block unless they are replaced (see
// makeTexture). The old block is only removed once the new one is made.
let temp = undefined;
async function saveBlockInTemp(event, block) {
    try {
        fs.readdirSync(path.join(block.path, 'Textures'));
        temp = block;
        return true;
    } catch (err) {
        console.error(err);
        clearTemp();
        dialog.showErrorBox('Could not load block',
            `Something went wrong while loading the block's textures.\n\n${err.message}`);
        return false;
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function clearTemp() {
    temp = undefined;
}

function getTemp() {
    return temp;
}

async function getTempTextures() {
    let textures = {};
    const texturesPath = path.join(temp.path, 'Textures');
    const allTextures = fs.readdirSync(texturesPath)
        .filter(isDDSFile);

    textures.regular = allTextures
        .filter(fileName => !fileName.includes('_'))
        .map(fileName => path.join(texturesPath, fileName));

    textures.small = allTextures
        .filter(fileName => fileName.includes('small'))
        .map(fileName => path.join(texturesPath, fileName));

    textures.normal = allTextures
        .filter(fileName => fileName.includes('normal'))
        .map(fileName => path.join(texturesPath, fileName));

    textures.glow = allTextures
        .filter(fileName => fileName.includes('glow'))
        .map(fileName => path.join(texturesPath, fileName));

    textures.height = allTextures
        .filter(fileName => fileName.includes('height'))
        .map(fileName => path.join(texturesPath, fileName));

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
            const smallPath = regularPath.replace(/\.dds$/i, '_small.dds');
            if (!smallTextures.includes(smallPath)) return false;

            // Compare the thumbnails of both, which are shown anyway. For
            // autogenerated ones the average difference per channel is around
            // 3 (from compression), whereas unrelated textures differ far more.
            const thumbnailPaths = await Promise.all([regularPath, smallPath].map(p => getTextureThumbnail(undefined, p)));
            if (thumbnailPaths.includes(undefined)) return false;
            const [regular, small] = await Promise.all(thumbnailPaths.map(p =>
                sharp(p).ensureAlpha().raw().toBuffer()));

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

// Made in the background while choosing textures, so no popup is shown.
// The textures are the same as the block's, so they are only made once.
async function generatePreviewBlock(event, textures, heightTextures = []) {
    const getTextures = (sources, type) => Promise.all(sources.map(async ([src, name]) =>
        [name, await getTexture(src, textureTypes[type].size, textureTypes[type].format)]));

    try {
        const [texturesDDS, heightsDDS] = await Promise.all([
            getTextures(textures, 'regular'),
            getTextures(heightTextures, 'height')
        ]);
        return { textures: Object.fromEntries(texturesDDS), heights: Object.fromEntries(heightsDDS) };
    } catch (err) {
        console.error(err);
        dialog.showErrorBox('Could not generate preview',
            `Something went wrong while generating the preview.\n\n${err.message}`);
        return undefined;
    }
}