const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('call', {
    createDDSImage: function (inputPath, outputPath, format) {
        ipcRenderer.send('createDDSImage', inputPath, outputPath, format);
    }
})
