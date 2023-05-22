const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('call', {
    createDDSImage: function(inputPath, outputPath, format) {
        ipcRenderer.invoke('createDDSImage', inputPath, outputPath, format);
    },
    getGeneratedRecipeFileContent: async () => await ipcRenderer.invoke('getGeneratedRecipeFileContent'),
    getDefaultRecipeFileContent: async () => await ipcRenderer.invoke('getDefaultRecipeFileContent'),
    generateCustomBlock: (location, propertiesFileContent, recipePictureImgSrc, regularTextures, smallTextures, normalTextures, glowTextures) =>
        ipcRenderer.invoke('generateCustomBlock', location, propertiesFileContent, recipePictureImgSrc, regularTextures, smallTextures, normalTextures, glowTextures),
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
})
