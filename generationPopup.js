// An edited block was saved rather than a new one made
if (new URLSearchParams(location.search).get('isEditing') == 'true') {
    document.getElementById('title').innerText = 'Edits applied!';
}


document.getElementById('openInExplorer').addEventListener('click', () => {
    window.call.openGenerationLocation();
});

document.getElementById('generateNewBlock').addEventListener('click', () => {
    window.call.clearTemp();
    window.call.loadGenerator();
    window.close();
})

document.getElementById('finishGenerating').addEventListener('click', () => {
    window.call.showGeneratedBlock();
    window.close();
})