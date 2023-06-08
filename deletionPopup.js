document.getElementById('deleteConfirm').addEventListener('click', () => {
    window.call.removeBlockToDelete();
    window.call.loadManageBlocks();
    window.close();
});

document.getElementById('deleteCancel').addEventListener('click', () => {
    window.close();
});