populateBlocksDiv();

async function populateBlocksDiv() {
    const blocksDiv = document.getElementById('blocksDiv');

    const blocks = await window.call.getAllBlocks();
    
    // Add all blocks from defaultBlocksFolder
    const defaultBlocksFolder = blocks.defaultBlocksFolder;
    blocksDiv.appendChild(makeBlocksDiv(defaultBlocksFolder));
}

function makeBlocksDiv(blocks) {
    const div = document.createElement('div');
    div.classList.add('box', 'scrollable');

    for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        const horizontalDiv = makeBlockDiv(block);
        div.appendChild(horizontalDiv);
    }

    return div;
}

function makeBlockDiv(block) {
    const div = document.createElement('div');
    div.classList.add('header', 'block');

    const dropDownDiv = makeDropDownDiv(block);
    const contentDiv = makeContentDiv(block);

    dropDownDiv.addEventListener('click', (e) => {
        dropDownDiv.classList.toggle('toggled');
        contentDiv.classList.toggle('d-none');
    })

    div.appendChild(dropDownDiv);
    div.appendChild(contentDiv);

    return div;
}

function makeDropDownDiv(block) {
    const dropDownDiv = document.createElement('div');
    dropDownDiv.classList.add('header', 'box-horizontal', 'justify-between');
    
    const leftDiv = document.createElement('div');
    leftDiv.classList.add('header', 'box-horizontal', 'justify-left');

    const arrow = document.createElement('img');
    arrow.classList.add('dropdown-arrow', 'align-center', 'me-2', 'ms-2');
    arrow.src = './images/arrow.png';

    const name = document.createElement('p');
    name.classList.add('align-center');
    name.innerText = block.properties.Name;

    const id = document.createElement('p');
    id.classList.add('me-2', 'align-center');
    id.innerText = `[${block.properties.UniqueID}]`;

    leftDiv.appendChild(arrow);
    leftDiv.appendChild(name);

    dropDownDiv.appendChild(leftDiv);
    dropDownDiv.appendChild(id);

    return dropDownDiv;
}

function makeContentDiv(block) {
    const contentDiv = document.createElement('div');
    contentDiv.classList.add('header', 'box-horizontal', 'd-none', 'justify-between', 'mb-2');

    const propertiesDiv = makePropertiesDiv(block);
    const previewDiv = makePreviewDiv(block);
    const buttonDiv = makeButtonDiv(block);

    contentDiv.appendChild(propertiesDiv);
    contentDiv.appendChild(previewDiv);
    contentDiv.appendChild(buttonDiv);

    return contentDiv;
}

function makePropertiesDiv(block) {
    const propertiesDiv = document.createElement('div');
    propertiesDiv.classList.add('box', 'justify-center', 'ms-2');

    const creatorElem = document.createElement('p');
    creatorElem.innerText = 'Creator: ' + block.properties.CreatorName;
    propertiesDiv.appendChild(creatorElem);

    const yieldElem = document.createElement('p');
    yieldElem.innerText = 'Yield: ' + block.properties.Yield;
    propertiesDiv.appendChild(yieldElem);

    const brokenByElem = document.createElement('p');
    brokenByElem.innerText = 'Broken by: ' + getBrokenBy(block.properties.SimilarTo);
    propertiesDiv.appendChild(brokenByElem);

    const categoryElem = document.createElement('p');
    categoryElem.innerText = 'Category: ' + getCategory(block.properties.CategoryName);
    propertiesDiv.appendChild(categoryElem);



    return propertiesDiv;
}

function makePreviewDiv(block) {
    const previewDiv = document.createElement('div');

    return previewDiv;
}

function makeButtonDiv(block) {
    const buttonDiv = document.createElement('div');
    buttonDiv.classList.add('box', 'align-end', 'me-2');

    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.innerText = 'Edit';
    editButton.classList.add('btn');
    
    buttonDiv.appendChild(editButton);

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.innerText = 'Delete';
    deleteButton.classList.add('btn');

    buttonDiv.appendChild(deleteButton);

    return buttonDiv;
}

function getBrokenBy(similarTo) {
    switch (similarTo) {
        case '1':
            return 'Pickaxe';
        case '2':
            return 'Axe';
        case '3':
            return 'Shovel';
        case '4':
            return 'Indestructible';
    }
}

function getCategory(categoryName) {
    if (categoryName == undefined) {
        return 'None';
    } else {
        return categoryName;
    }
}


/**
 * Add eventlistener to Make new block
 */
document.getElementById('makeNewBlock').addEventListener('click', (e) => {
    window.call.openGenerator();
});