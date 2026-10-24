// When editing an existing block, it's the changes that are discarded
if (new URLSearchParams(location.search).get('isEditing') == 'true') {
    document.getElementById('discardMessage').innerText = 'Are you sure that you want to discard your changes?';
}

document.getElementById('discardConfirm').addEventListener('click', () => {
    window.call.loadManageBlocks();
    window.close();
});

document.getElementById('discardCancel').addEventListener('click', () => {
    window.close();
});
