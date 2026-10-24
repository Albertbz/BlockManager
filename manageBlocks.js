import { loadCanvas } from "./blockPreview.js";

/**
 * Saved settings, kept between visits. Storage can be unavailable,
 * in which case the defaults are used.
 */
function loadSetting(key, defaultValue) {
    try {
        const value = JSON.parse(localStorage.getItem(key));
        return value ?? defaultValue;
    } catch {
        return defaultValue;
    }
}

function saveSetting(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch { }
}

function populateBlocksDiv() {
    const blocksDiv = document.getElementById('blocksDiv');
    const hasChild = blocksDiv.firstElementChild != null;
    if (hasChild) {
        blocksDiv.removeChild(blocksDiv.firstElementChild);
    }

    // The old blocks are gone, so stop watching their previews
    previewObserver.disconnect();

    // Add all blocks
    const scrollableDiv = makeBlocksDiv();
    blocksDiv.appendChild(scrollableDiv);

    // Go back to where this view was scrolled to, and keep track of it
    scrollableDiv.scrollTop = getSavedScrollTop();
    scrollableDiv.addEventListener('scroll', () => saveScrollTop(scrollableDiv.scrollTop));
}

/**
 * Remember how far each view (filter, version and search) has been
 * scrolled, so that it stays there when the list is rebuilt, and
 * when coming back after e.g. editing a block.
 */
function getCurrentView() {
    return `${filterBy}|${selectedVersion ?? ''}|${searchValue}`;
}

function getSavedScrollPositions() {
    try {
        return JSON.parse(sessionStorage.getItem('scrollPositions')) ?? {};
    } catch {
        return {};
    }
}

function getSavedScrollTop() {
    return getSavedScrollPositions()[getCurrentView()] ?? 0;
}

function saveScrollTop(scrollTop) {
    const scrollPositions = getSavedScrollPositions();
    scrollPositions[getCurrentView()] = scrollTop;
    try {
        sessionStorage.setItem('scrollPositions', JSON.stringify(scrollPositions));
    } catch { }
}

function makeBlocksDiv() {
    const div = document.createElement('div');
    div.classList.add('box', 'scrollable');

    if (filterBy == 'Mods') {
        // Show the blocks of each mod together, under the mod's name
        for (const group of groupBlocksByMod(blocks)) {
            const title = selectedVersion == undefined
                ? `${group.mod.name} (${group.mod.update})`
                : group.mod.name;
            div.appendChild(makeGroupTitle(title, 'mod-group-title'));

            appendBlocks(div, group.blocks, true);
        }
    } else {
        appendBlocks(div, blocks, false);
    }

    if (blocks.length == 0) {
        const noBlocksFoundText = document.createElement('span');
        noBlocksFoundText.classList.add('outline', 'ps-1');
        noBlocksFoundText.innerText = 'No blocks found.';
        div.appendChild(noBlocksFoundText);
    }

    return div;
}

// Add the blocks to the div, grouped by category if chosen.
function appendBlocks(div, blocks, isInModGroup) {
    if (!groupByCategory) {
        for (const block of blocks) {
            div.appendChild(makeBlockDiv(block));
        }
        return;
    }

    for (const group of groupBlocksByCategory(blocks)) {
        const title = makeGroupTitle(group.name, 'category-group-title');
        if (isInModGroup) title.classList.add('category-group-title-nested');
        div.appendChild(title);

        for (const block of group.blocks) {
            div.appendChild(makeBlockDiv(block));
        }
    }
}

function makeGroupTitle(text, className) {
    const title = document.createElement('span');
    title.classList.add('outline', 'ps-1', className);
    title.innerText = text;
    return title;
}

/**
 * Remember which blocks are opened (by their folder path).
 */
let openedBlocks = new Set(loadSetting('openedBlocks', []));

function setBlockOpened(block, isOpened) {
    if (isOpened) {
        openedBlocks.add(block.path);
    } else {
        openedBlocks.delete(block.path);
    }
    saveSetting('openedBlocks', [...openedBlocks]);
}

// Forget blocks that no longer exist, e.g. after being deleted. Nothing
// found at all most likely means the game folder couldn't be found, so
// keep everything in that case.
function forgetMissingOpenedBlocks(allBlocks) {
    if (allBlocks.length == 0) return;

    const paths = new Set(allBlocks.map(block => block.path));
    openedBlocks = new Set([...openedBlocks].filter(path => paths.has(path)));
    saveSetting('openedBlocks', [...openedBlocks]);
}

/**
 * Only a limited number of previews (WebGL contexts) can exist at once,
 * so a preview only exists while its opened block is on screen.
 */
const previewLoaders = new WeakMap();
const previewObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
        if (entry.isIntersecting) {
            previewLoaders.get(entry.target)();
        } else {
            entry.target.replaceChildren();
        }
    }
});

function makeBlockDiv(block) {
    const div = document.createElement('div');
    div.classList.add('header', 'block');

    const dropDownDiv = makeDropDownDiv(block);
    const contentDiv = makeContentDiv(block);

    let isAnimated = false;
    let animationSpeed = 0;
    if (block.properties.AnimationSpeed != undefined) {
        isAnimated = true;
        animationSpeed = block.properties.AnimationSpeed;
    }

    const previewDiv = contentDiv.querySelector('div.block-preview');
    previewLoaders.set(previewDiv, () => {
        const canvas = makePreviewCanvas();
        previewDiv.replaceChildren(canvas);
        loadCanvas(canvas, getTexturePaths(block), isAnimated, animationSpeed);
    });

    function setExpanded(isExpanded) {
        dropDownDiv.classList.toggle('toggled', isExpanded);
        contentDiv.classList.toggle('d-none', !isExpanded);

        // The preview is shown while the expanded block is on screen
        if (isExpanded) {
            previewObserver.observe(previewDiv);
        } else {
            previewObserver.unobserve(previewDiv);

            // Remove the preview a couple of frames after hiding it. Removing
            // it right away can briefly show a white square where it was, as
            // the screen may be drawn once more after its image is freed.
            requestAnimationFrame(() => requestAnimationFrame(() => {
                if (contentDiv.classList.contains('d-none')) previewDiv.replaceChildren();
            }));
        }
    }

    // Blocks that were opened stay opened
    setExpanded(openedBlocks.has(block.path));

    dropDownDiv.addEventListener('click', (e) => {
        const isExpanded = contentDiv.classList.contains('d-none');
        setExpanded(isExpanded);
        setBlockOpened(block, isExpanded);
    });

    div.appendChild(dropDownDiv);
    div.appendChild(contentDiv);

    return div;
}

function makeDropDownDiv(block) {
    const dropDownDiv = document.createElement('div');
    dropDownDiv.classList.add('header', 'box-horizontal', 'justify-between', 'dropdown-top');

    const leftDiv = document.createElement('div');
    leftDiv.classList.add('header', 'box-horizontal', 'justify-left');

    const arrow = document.createElement('img');
    arrow.classList.add('dropdown-arrow', 'align-center', 'me-2', 'ms-2');
    arrow.src = './images/arrow.png';

    const name = document.createElement('span');
    name.classList.add('align-center');
    name.innerText = block.properties.Name;

    const id = document.createElement('span');
    id.classList.add('me-2', 'align-center');
    id.innerText = `[${block.properties.UniqueID}]`;

    leftDiv.appendChild(arrow);
    leftDiv.appendChild(name);

    const modLabel = getModLabel(block);
    if (modLabel != undefined) {
        const mod = document.createElement('span');
        mod.classList.add('align-center', 'ms-1', 'block-mod-label');
        mod.innerText = modLabel;
        leftDiv.appendChild(mod);
    }

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

    const creatorElem = document.createElement('span');
    creatorElem.innerHTML = '<b>Creator:</b> ' + block.properties.CreatorName;
    propertiesDiv.appendChild(creatorElem);

    const yieldElem = document.createElement('span');
    yieldElem.innerHTML = '<b>Yield:</b> ' + block.properties.Yield;
    propertiesDiv.appendChild(yieldElem);

    const brokenByElem = document.createElement('span');
    brokenByElem.innerHTML = '<b>Broken by:</b> ' + getBrokenBy(block.properties.SimilarTo);
    propertiesDiv.appendChild(brokenByElem);

    const categoryElem = document.createElement('span');
    categoryElem.innerHTML = '<b>Category:</b> ' + getCategory(block.properties.CategoryName);
    propertiesDiv.appendChild(categoryElem);

    const dropsElem = document.createElement('span');
    dropsElem.innerHTML = '<b>Drops:</b> ' + getDrop(block.properties.UniqueIDToDrop);
    propertiesDiv.appendChild(dropsElem);

    const movableElem = document.createElement('span');
    movableElem.innerHTML = '<b>Movable:</b> ' + getMovable(block.properties.AllowMove);
    propertiesDiv.appendChild(movableElem);

    const crystalAssistElem = document.createElement('span');
    crystalAssistElem.innerHTML = '<b>Crystal assist:</b> ' + getCrystalAssist(block.properties.AllowCrystalAssistedBlockPlacement);
    propertiesDiv.appendChild(crystalAssistElem);

    const rotatableElem = document.createElement('span');
    rotatableElem.innerHTML = '<b>Rotatable:</b> ' + getRotatable(block.properties.AllowRotation);
    propertiesDiv.appendChild(rotatableElem);

    return propertiesDiv;
}

function makePreviewDiv() {
    const previewDiv = document.createElement('div');
    previewDiv.classList.add('block-preview', 'center');

    return previewDiv;
}

function makePreviewCanvas() {
    const canvas = document.createElement('canvas');
    canvas.width = 135;
    canvas.height = 135;

    return canvas;
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
        await window.call.displayDeleteDialog(block);
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

function getRotatable(allowRotation) {
    return booleanToYesNo(allowRotation);
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
 * Sort button open and close functionality
 */
document.getElementById('sortButton').addEventListener('click', (e) => {
    const sortButton = e.target;
    const dropdownContentDiv = document.getElementById('dropdownContent');
    const isVisible = !dropdownContentDiv.classList.toggle('d-none');

    if (isVisible) {
        function handleClickOutside(e) {
            if (e.target == dropdownContentDiv || e.target == sortButton || dropdownContentDiv.contains(e.target)) return;
    
            dropdownContentDiv.classList.add('d-none');
            document.removeEventListener('click', handleClickOutside);
        }

        document.addEventListener('click', handleClickOutside);
    }

    
});

/**
 * Handle all sorting
 */
let sortBy = {
    type: 'Name',
    order: 'Down'
};

// Use the sorting chosen last time, if any
try {
    const savedSortBy = JSON.parse(localStorage.getItem('sortBy'));
    if (['Name', 'ID'].includes(savedSortBy?.type) && ['Down', 'Up'].includes(savedSortBy?.order)) {
        sortBy = savedSortBy;
    }
} catch { }

const sortTypeButtons = document.querySelectorAll('button.sort-type-btn');

// Show the arrow on the chosen sort type, pointing in the chosen order
function showSortArrow() {
    document.querySelectorAll('img.sort-arrow').forEach(img => img.remove());

    const button = [...sortTypeButtons].find(button => button.firstElementChild.innerText == sortBy.type);
    const img = document.createElement('img');
    img.classList.add('sort-arrow');
    img.src = `./images/sort-${sortBy.order.toLowerCase()}-arrow.png`;
    button.appendChild(img);
}

showSortArrow();

sortTypeButtons.forEach((button) => {
    button.addEventListener('click', (e) => {
        const type = button.firstElementChild.innerText;
        const isSameType = sortBy.type == type;
        if (isSameType) {
            // Toggle order
            sortBy.order = sortBy.order == 'Down' ? 'Up' : 'Down';
        }
        else {
            sortBy.type = type;
            sortBy.order = 'Down';
        }

        try {
            localStorage.setItem('sortBy', JSON.stringify(sortBy));
        } catch { }

        showSortArrow();
        updateBlocksSort();
        populateBlocksDiv();
    });
});

// Update according to sort
function updateBlocksSort() {
    switch (sortBy.type) {
        case 'Name':
            blocks.sort(function (a, b) {
                const aName = a.properties.Name.toLowerCase();
                const bName = b.properties.Name.toLowerCase();
                if (aName < bName) {
                    return sortBy.order == 'Down' ? -1 : 1;
                }
                if (aName > bName) {
                    return sortBy.order == 'Down' ? 1 : -1;
                }
                return 0;
            });
            break;
        case 'ID':
            blocks.sort(function (a, b) {
                const aID = a.properties.UniqueID;
                const bID = b.properties.UniqueID;
                return sortBy.order == 'Down' ? aID - bID : bID - aID;
            });
            break;
    }
}


/**
 * Handle filtering for blocks
 */
let filterBy = loadSetting('filterBy', 'All');
if (!['All', 'Independent', 'Mods'].includes(filterBy)) filterBy = 'All';
let blocks = [];

// Update according to filter
async function updateBlocksFilter() {
    blocks = [];
    const allBlocks = await window.call.getAllBlocks();
    const modFolders = allBlocks.modFolders;
    forgetMissingOpenedBlocks(allBlocks.defaultBlocksFolder.concat(getModBlocks(modFolders)));
    switch (filterBy) {
        case 'All':
            blocks = allBlocks.defaultBlocksFolder.concat(getModBlocks(modFolders));
            break;
        case 'Independent':
            blocks = allBlocks.defaultBlocksFolder;
            break;
        case 'Mods':
            updateVersionFilter(modFolders);
            blocks = getModBlocks(modFolders)
                .filter(block => selectedVersion == undefined || block.mod.update == selectedVersion);
            break;
    }

    // Found before searching, so titles don't change while typing.
    duplicateNames = filterBy == 'All' ? getDuplicateNames(blocks) : new Set();
}

/**
 * Handle choosing which game version to show mod blocks for.
 * undefined means all versions.
 */
let selectedVersion = loadSetting('selectedVersion', undefined);
let shownVersions = [];

// Newest version first, e.g. "Update 60" before "Update 59".
function compareVersions(a, b) {
    const aNumber = parseInt(a.match(/\d+/)?.[0]);
    const bNumber = parseInt(b.match(/\d+/)?.[0]);
    if (!isNaN(aNumber) && !isNaN(bNumber) && aNumber != bNumber) return bNumber - aNumber;
    return b.localeCompare(a);
}

// Show options for all versions that have mods.
const versionSelect = document.getElementById('versionSelect');

function updateVersionFilter(modFolders) {
    const versions = [...new Set(modFolders.flatMap(modFolder =>
        modFolder.updates.map(update => update.name)))].sort(compareVersions);

    // Fall back to all versions if the chosen one no longer has mods
    if (selectedVersion != undefined && !versions.includes(selectedVersion)) {
        selectedVersion = undefined;
        saveSetting('selectedVersion', null);
    }

    // Only rebuild the options if the versions have changed
    if (versions.join('|') == shownVersions.join('|')) return;
    shownVersions = versions;

    const allOption = document.createElement('option');
    allOption.value = '';
    allOption.innerText = 'All versions';
    versionSelect.replaceChildren(allOption);

    for (const version of versions) {
        const option = document.createElement('option');
        option.value = version;
        option.innerText = version;
        versionSelect.appendChild(option);
    }

    versionSelect.value = selectedVersion ?? '';
}

versionSelect.addEventListener('change', () => {
    selectedVersion = versionSelect.value == '' ? undefined : versionSelect.value;
    saveSetting('selectedVersion', selectedVersion ?? null);
    updateBlocks();
});

/**
 * Handle grouping blocks by category. The choice is remembered
 * between visits.
 */
const noCategoryName = 'No category';
// On by default, until turned off
let groupByCategory = true;
try {
    groupByCategory = localStorage.getItem('groupByCategory') != 'false';
} catch { }

const categoryToggle = document.getElementById('categoryToggle');
categoryToggle.classList.toggle('btn-pressed', groupByCategory);

categoryToggle.addEventListener('click', () => {
    groupByCategory = !groupByCategory;
    categoryToggle.classList.toggle('btn-pressed', groupByCategory);
    try {
        localStorage.setItem('groupByCategory', groupByCategory);
    } catch { }

    populateBlocksDiv();
});

// Group blocks by category, keeping the current sort within each group.
// Categories are in alphabetical order, with blocks without one last.
function groupBlocksByCategory(blocks) {
    const groups = new Map();

    for (const block of blocks) {
        const categoryName = block.properties.CategoryName?.trim() || noCategoryName;
        const key = categoryName == noCategoryName ? '' : categoryName.toLowerCase();
        if (!groups.has(key)) groups.set(key, { name: categoryName, blocks: [] });
        groups.get(key).blocks.push(block);
    }

    return [...groups.values()].sort((a, b) => {
        if (a.name == noCategoryName) return 1;
        if (b.name == noCategoryName) return -1;
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
}

// Group blocks by mod and version, keeping the current sort within each
// group. Groups are ordered by mod name, then newest version first.
function groupBlocksByMod(blocks) {
    const groups = new Map();

    for (const block of blocks) {
        const key = `${block.mod.name}|${block.mod.update}`;
        if (!groups.has(key)) groups.set(key, { mod: block.mod, blocks: [] });
        groups.get(key).blocks.push(block);
    }

    return [...groups.values()].sort((a, b) =>
        a.mod.name.localeCompare(b.mod.name, undefined, { sensitivity: 'base' })
        || compareVersions(a.mod.update, b.mod.update));
}

// Get all blocks from the mod folders, with the mod and
// update (version) each of them is from.
function getModBlocks(modFolders) {
    let modBlocks = [];

    for (const modFolder of modFolders) {
        for (const update of modFolder.updates) {
            for (const block of update.blocksFolder) {
                block.mod = { name: modFolder.name, update: update.name };
                modBlocks.push(block);
            }
        }
    }

    return modBlocks;
}

/**
 * Handle blocks with the same name, typically from several
 * versions of a mod. These get their mod shown in the title.
 */
let duplicateNames = new Set();

function getNameKey(block) {
    return block.properties.Name.trim().toLowerCase();
}

function getDuplicateNames(blocks) {
    const seenNames = new Set();
    const duplicates = new Set();

    for (const block of blocks) {
        const nameKey = getNameKey(block);
        if (seenNames.has(nameKey)) duplicates.add(nameKey);
        seenNames.add(nameKey);
    }

    return duplicates;
}

function getModLabel(block) {
    if (block.mod == undefined || !duplicateNames.has(getNameKey(block))) return undefined;

    return `(${block.mod.name}, ${block.mod.update})`;
}

// Change filtering method
const filterButtons = document.querySelectorAll('button.filter-btn');

// Show the filter chosen last time
let prevFilterButton = [...filterButtons].find(button => button.innerText == filterBy);
filterButtons.forEach(button => button.classList.toggle('btn-pressed', button == prevFilterButton));
versionSelect.classList.toggle('d-none', filterBy != 'Mods');

filterButtons.forEach((button) => {
    button.addEventListener('click', async (e) => {
        if (prevFilterButton == button) return;

        prevFilterButton.classList.remove('btn-pressed');
        button.classList.add('btn-pressed');

        prevFilterButton = button;
        filterBy = button.innerText;
        saveSetting('filterBy', filterBy);

        versionSelect.classList.toggle('d-none', filterBy != 'Mods');

        updateBlocks();
    })
});


/**
 * Handle search functionality
 */
let searchValue = '';

// Change to text field when clicked
document.getElementById('searchButton').addEventListener('click', (e) => {
    const searchButton = e.target;

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Search...';
    searchInput.spellcheck = false;
    searchInput.classList.add('search-input');

    searchButton.replaceWith(searchInput);

    searchInput.addEventListener('focusout', (e) => {
        if (searchInput.value.length == 0) searchInput.replaceWith(searchButton);
    });

    searchInput.addEventListener('input', (e) => {
        searchValue = searchInput.value.toLowerCase();
        updateBlocks();
    })

    searchInput.focus();
});

function updateBlocksSearch() {
    if (searchValue == '') return;

    for (let i = blocks.length - 1; i >= 0; i--) {
        const block = blocks[i];
        const name = block.properties.Name.toLowerCase();

        if (!name.includes(searchValue)) {
            blocks.splice(i, 1);
        }
    }
}


/**
 * Init stuff
 */
async function updateBlocks() {
    await updateBlocksFilter();
    updateBlocksSearch();
    updateBlocksSort();
    populateBlocksDiv();
}

updateBlocks();