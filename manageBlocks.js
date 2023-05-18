populateBlocksDiv();

async function populateBlocksDiv() {
    const blocksDiv = document.getElementById('blocksDiv');

    const blocks = await window.call.getAllBlocks();
    
    // Add all blocks from defaultBlocksFolder
    const defaultBlocksFolder = blocks.defaultBlocksFolder;
    blocksDiv.appendChild(makeDivForBlocks(defaultBlocksFolder));
}

function makeDivForBlocks(blocks) {
    const div = document.createElement('div');
    div.classList.add('box', 'scrollable');

    for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        const horizontalDiv = makeDivForBlock(block);
        div.appendChild(horizontalDiv);
    }

    return div;
}

function makeDivForBlock(block) {
    const div = document.createElement('div');
    div.classList.add('header', 'block');

    const dropDownDiv = document.createElement('div');
    dropDownDiv.classList.add('header', 'box-horizontal', 'justify-between');
    
    const leftDiv = document.createElement('div');
    leftDiv.classList.add('header', 'box-horizontal', 'justify-left');

    const arrow = document.createElement('img');
    arrow.classList.add('dropdown-arrow', 'align-center', 'me-2', 'ms-2');
    arrow.src = './images/arrow.png';

    const name = document.createElement('p');
    name.classList.add('mt-0', 'mb-0', 'align-center');
    name.innerText = block.properties.Name;

    const id = document.createElement('p');
    id.classList.add('me-2', 'mt-0', 'mb-0', 'align-center');
    id.innerText = `[${block.properties.UniqueID}]`;

    leftDiv.appendChild(arrow);
    leftDiv.appendChild(name);

    dropDownDiv.appendChild(leftDiv);
    dropDownDiv.appendChild(id);

    const contentDiv = document.createElement('div');
    contentDiv.classList.add('header');

    div.appendChild(dropDownDiv);
    div.appendChild(contentDiv);
    return div;
}