const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('call', {
    getGeneratedRecipeFileContent: async () => await ipcRenderer.invoke('getGeneratedRecipeFileContent'),
    getDefaultRecipeFileContent: async () => await ipcRenderer.invoke('getDefaultRecipeFileContent'),
    generateCustomBlock: (location, propertiesFileContent, regularTextures, smallTextures, normalTextures, glowTextures, heightTextures) =>
        ipcRenderer.invoke('generateCustomBlock', location, propertiesFileContent, regularTextures, smallTextures, normalTextures, glowTextures, heightTextures),
    selectFolder: () => ipcRenderer.invoke('selectFolder'),
    getModsFolderPath: () => ipcRenderer.invoke('getModsFolderPath'),
    getAllModFolders: () => ipcRenderer.invoke('getAllModFolders'),
    generationCompletePopup: (location) => ipcRenderer.invoke('generationCompletePopup', location),
    openGenerationLocation: () => ipcRenderer.invoke('openGenerationLocation'),
    getAllBlocks: () => ipcRenderer.invoke('getAllBlocks'),
    displayDeleteDialog: (block) => ipcRenderer.invoke('displayDeleteDialog', block),
    refreshMainWindow: () => ipcRenderer.invoke('refreshMainWindow'),
    loadGenerator: () => ipcRenderer.invoke('loadGenerator'),
    loadManageBlocks: () => ipcRenderer.invoke('loadManageBlocks'),
    saveBlockInTemp: (block) => ipcRenderer.invoke('saveBlockInTemp', block),
    clearTemp: () => ipcRenderer.invoke('clearTemp'),
    getTemp: () => ipcRenderer.invoke('getTemp'),
    getTempTextures: () => ipcRenderer.invoke('getTempTextures'),
    removeBlockToDelete: () => ipcRenderer.invoke('removeBlockToDelete'),
    generatePreviewBlock: (textures) => ipcRenderer.invoke('generatePreviewBlock', textures),
    getTextureThumbnail: (filePath) => ipcRenderer.invoke('getTextureThumbnail', filePath)
})
