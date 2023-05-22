
document.getElementById('openInExplorer').addEventListener('click', () => {
    window.call.openGenerationLocation();
});

document.getElementById('generateNewBlock').addEventListener('click', () => {
    window.call.clearTemp();
    window.call.loadGenerator();
    window.close();
})

document.getElementById('finishGenerating').addEventListener('click', () => {
    window.call.loadManageBlocks();
    window.close();
})