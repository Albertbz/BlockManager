import { loadCanvas } from "./blockPreview.js";

populateBlocksDiv();

async function populateBlocksDiv() {
    const blocksDiv = document.getElementById('blocksDiv');

    const blocks = await window.call.getAllBlocks();

    // Add all blocks
    blocksDiv.appendChild(makeBlocksDiv(blocks));
}

function makeBlocksDiv(blocks) {
    const div = document.createElement('div');
    div.classList.add('box', 'scrollable');

    // Add all blocks from default Blocks folder
    const defaultBlocksFolder = blocks.defaultBlocksFolder;
    for (let i = 0; i < defaultBlocksFolder.length; i++) {
        const block = defaultBlocksFolder[i];
        const horizontalDiv = makeBlockDiv(block);
        div.appendChild(horizontalDiv);
    }

    // Add all blocks from mods
    const modFolders = blocks.modFolders;
    for (let i = 0; i < modFolders.length; i++) {
        const modFolder = modFolders[i];

        for (let j = 0; j < modFolder.updates.length; j++) {
            const update = modFolder.updates[j];
            const blocksFolder = update.blocksFolder;
            for (let k = 0; k < blocksFolder.length; k++) {
                const block = blocksFolder[k];
                const horizontalDiv = makeBlockDiv(block);
                div.appendChild(horizontalDiv);
            }
        }
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
    });

    dropDownDiv.addEventListener('mousedown', (e) => {
        const canvas = contentDiv.querySelector('canvas');
        loadCanvas(canvas, getTexturePaths(block));
    }, { once: true });

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
    const previewDiv = makePreviewDiv();
    const buttonDiv = makeButtonDiv(block);

    contentDiv.appendChild(propertiesDiv);
    contentDiv.appendChild(previewDiv);
    contentDiv.appendChild(buttonDiv);

    return contentDiv;
}

function makePropertiesDiv(block) {
    const propertiesDiv = document.createElement('div');
    propertiesDiv.classList.add('box', 'ms-2', 'left');

    const creatorElem = document.createElement('p');
    creatorElem.innerHTML = '<b>Creator:</b> ' + block.properties.CreatorName;
    propertiesDiv.appendChild(creatorElem);

    const yieldElem = document.createElement('p');
    yieldElem.innerHTML = '<b>Yield:</b> ' + block.properties.Yield;
    propertiesDiv.appendChild(yieldElem);

    const brokenByElem = document.createElement('p');
    brokenByElem.innerHTML = '<b>Broken by:</b> ' + getBrokenBy(block.properties.SimilarTo);
    propertiesDiv.appendChild(brokenByElem);

    const categoryElem = document.createElement('p');
    categoryElem.innerHTML = '<b>Category:</b> ' + getCategory(block.properties.CategoryName);
    propertiesDiv.appendChild(categoryElem);

    const dropsElem = document.createElement('p');
    dropsElem.innerHTML = '<b>Drops:</b> ' + getDrop(block.properties.UniqueIDToDrop);
    propertiesDiv.appendChild(dropsElem);

    const movableElem = document.createElement('p');
    movableElem.innerHTML = '<b>Movable:</b> ' + getMovable(block.properties.AllowMove);
    propertiesDiv.appendChild(movableElem);

    const crystalAssistElem = document.createElement('p');
    crystalAssistElem.innerHTML = '<b>Crystal assist:</b> ' + getCrystalAssist(block.properties.AllowCrystalAssistedBlockPlacement);
    propertiesDiv.appendChild(crystalAssistElem);

    return propertiesDiv;
}

function makePreviewDiv() {
    const previewDiv = document.createElement('div');
    previewDiv.classList.add('block-preview', 'right');

    const canvas = document.createElement('canvas');
    canvas.width = 135;
    canvas.height = 135;

    previewDiv.appendChild(canvas);

    return previewDiv;
}

function getTexturePaths(block) {
    // Make an array with 6 paths to textures
    let texturePaths = [];
    switch (Object.keys(block.textureFilesPaths).length) {
        case 1:
            for (let i = 0; i < 6; i++) {
                texturePaths[i] = block.textureFilesPaths.all;
            }
            break;
        case 2:
            texturePaths[0] = block.textureFilesPaths.sides;
            texturePaths[1] = block.textureFilesPaths.sides;
            texturePaths[2] = block.textureFilesPaths.updown;
            texturePaths[3] = block.textureFilesPaths.updown;
            texturePaths[4] = block.textureFilesPaths.sides;
            texturePaths[5] = block.textureFilesPaths.sides;
            break;
        case 3:
            texturePaths[0] = block.textureFilesPaths.sides;
            texturePaths[1] = block.textureFilesPaths.sides;
            texturePaths[2] = block.textureFilesPaths.up;
            texturePaths[3] = block.textureFilesPaths.down;
            texturePaths[4] = block.textureFilesPaths.sides;
            texturePaths[5] = block.textureFilesPaths.sides;
            break;
        case 6:
            texturePaths[0] = block.textureFilesPaths.front;
            texturePaths[1] = block.textureFilesPaths.back;
            texturePaths[2] = block.textureFilesPaths.up;
            texturePaths[3] = block.textureFilesPaths.down;
            texturePaths[4] = block.textureFilesPaths.right;
            texturePaths[5] = block.textureFilesPaths.left;
            break;
    }

    return texturePaths;
}

function makeButtonDiv(block) {
    const buttonDiv = document.createElement('div');
    buttonDiv.classList.add('align-end', 'me-2', 'right');

    const buttonSpan = document.createElement('span');
    buttonSpan.classList.add('box')
    buttonDiv.appendChild(buttonSpan);

    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.innerText = 'Edit';
    editButton.classList.add('btn', 'mb-1');

    editButton.addEventListener('click', async (e) => {
        const success = await window.call.saveBlockInTemp(block);
        if (success) window.call.loadGenerator();
    });

    buttonSpan.appendChild(editButton);

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.innerText = 'Delete';
    deleteButton.classList.add('btn');

    deleteButton.addEventListener('click', async (e) => {
        const success = await window.call.displayDeleteDialog(block);
        if (success) deleteButton.parentElement.parentElement.parentElement.parentElement.remove();
    });

    buttonSpan.appendChild(deleteButton);

    return buttonDiv;
}

function getBrokenBy(similarTo) {
    switch (similarTo) {
        case 1:
        case '1':
            return 'Pickaxe';
        case 2:
        case '2':
            return 'Axe';
        case 3:
        case '3':
            return 'Shovel';
        case 4:
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

function getDrop(uniqueIDToDrop) {
    if (uniqueIDToDrop == undefined) return 'Itself';

    switch (uniqueIDToDrop) {
        case '-2':
        case -2:
            return 'Itself';
        case '-1':
        case -1:
            return 'Nothing';
        default:
            return uniqueIDToDrop;
    }
}

function getMovable(allowMove) {
    return booleanToYesNo(allowMove);
}

function getCrystalAssist(allowCrystalAssistedBlockPlacement) {
    return booleanToYesNo(allowCrystalAssistedBlockPlacement);
}

function booleanToYesNo(boolean) {
    if (boolean == undefined) return 'Yes';

    if (boolean) {
        return 'Yes';
    } else {
        return 'No';
    }
}


/**
 * Add eventlistener to make new block
 */
document.getElementById('makeNewBlock').addEventListener('click', (e) => {
    window.call.clearTemp();
    window.call.loadGenerator();
});


/**
 * Sort button open and close
 */
document.getElementById('sortButton').addEventListener('click', (e) => {
    const dropDownContent = e.target.nextElementSibling;
    dropDownContent.classList.toggle('d-none');
});

/**
 * Handle all sorting
 */
let sortBy = {
    type: 'Name',
    order: 'Down'
};

document.querySelectorAll('button.sort-type-btn').forEach((button) => {
    button.addEventListener('click', (e) => {
        const type = button.firstElementChild.innerText;
        const isSameType = sortBy.type == type;
        if (isSameType) {
            // Toggle order
            sortBy.order == 'Down' ? sortBy.order = 'Up' : sortBy.order = 'Down';

            // Set new image src
            const img = button.lastElementChild;
            img.src = `./images/sort-${sortBy.order.toLowerCase()}-arrow.png`;
        }
        else {
            // Remove old image
            button.parentElement.querySelector('img').remove();

            sortBy.type = type;
            sortBy.order = 'Down';

            // Add new image
            const img = document.createElement('img');
            img.classList.add('sort-arrow');
            img.src = `./images/sort-down-arrow.png`;
            button.appendChild(img);
        }
        
    });
});