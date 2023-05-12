const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('call', {
    createDDSImage: function(inputPath, outputPath, format) {
        ipcRenderer.invoke('createDDSImage', inputPath, outputPath, format);
    },
    getGeneratedRecipeFileContent: async () => await ipcRenderer.invoke('getGeneratedRecipeFileContent'),
    getDefaultRecipeFileContent: async() => await ipcRenderer.invoke('getDefaultRecipeFileContent')
})
