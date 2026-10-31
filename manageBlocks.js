import { loadCanvas, showLargeView } from "./blockPreview.js";
import { growFromButton, setPageOutAnimation, shrinkIntoButton } from "./pageTransition.js";
import "./sliderScroll.js";
import { createRecipePreview } from "./recipePreview.js";
import { getMaterialName } from "./recipeMaterials.js";

const blockTexturesUrl = window.call.getBlockTexturesUrl();

// The page grows out of the button to create a block, and shrinks back
// into it, which is where the generator appears from
const makeNewBlockButton = document.getElementById('makeNewBlock');
growFromButton(makeNewBlockButton, 150);
setPageOutAnimation(() => shrinkIntoButton(makeNewBlockButton, 150));

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
    savePendingScrollTop();
    const hasChild = blocksDiv.firstElementChild != null;
    if (hasChild) {
        blocksDiv.removeChild(blocksDiv.firstElementChild);
    }

    // The old blocks are gone, so stop watching their previews
    previewObserver.disconnect();
    blockOpeners.clear();

    // Add all blocks
    const scrollableDiv = makeBlocksDiv();
    blocksDiv.appendChild(scrollableDiv);

    // Go back to where this view was scrolled to, and keep track of it
    scrollableDiv.scrollTop = getSavedScrollTop();
    scrollableDiv.addEventListener('scroll', () => saveScrollTopSoon(scrollableDiv, getCurrentView()));
}

// Saving on every scroll event made scrolling slower, so it is only saved
// once scrolling pauses, and right away when the page is left or the list
// is rebuilt
let pendingScrollSave;
let scrollSaveTimeout;
function saveScrollTopSoon(scrollableDiv, view) {
    pendingScrollSave = () => saveScrollTop(scrollableDiv.scrollTop, view);
    clearTimeout(scrollSaveTimeout);
    scrollSaveTimeout = setTimeout(savePendingScrollTop, 150);
}

function savePendingScrollTop() {
    pendingScrollSave?.();
    pendingScrollSave = undefined;
}
window.addEventListener('pagehide', savePendingScrollTop);

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

function saveScrollTop(scrollTop, view = getCurrentView()) {
    const scrollPositions = getSavedScrollPositions();
    scrollPositions[view] = scrollTop;
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
 * so a block's previews only exist while its opened block is on screen.
 */
const previewLoaders = new WeakMap();
const previewObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
        const { load, unload } = previewLoaders.get(entry.target);
        if (entry.isIntersecting) {
            load();
        } else {
            unload();
        }
    }
});

// How to open each shown block, by its folder path
const blockOpeners = new Map();

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
    const recipePreviewDiv = contentDiv.querySelector('div.block-recipe-preview');

    // The space the previews have in the opened block, measured before it
    // starts growing, as they would otherwise be stretched along while it
    // animates. They are as tall as the properties, whether next to or below
    // them, with their captions below them.
    const propertiesDiv = contentDiv.querySelector('div.block-properties');
    let previewSize;
    function measurePreviewSize() {
        return Math.max(propertiesDiv.offsetHeight, MIN_PREVIEW_SIZE);
    }

    previewLoaders.set(previewDiv, {
        load: () => {
            // They are kept at that height, as resizing the recipe preview
            // clears it, which would make it flicker while the block opens
            // or closes. The block preview is as large as the space next to
            // the properties.
            const size = previewSize > 0 ? previewSize : measurePreviewSize();
            for (const div of [previewDiv, recipePreviewDiv]) div.style.height = `${size}px`;
            previewDiv.style.width = `${size}px`;
            recipePreviewDiv.style.width = `${Math.round(size * RECIPE_PREVIEW_ASPECT)}px`;
            // Which the spacing around them depends on
            contentDiv.querySelector('div.block-previews').style.setProperty('--preview-size', `${size}px`);

            const canvas = makePreviewCanvas(size);
            previewDiv.replaceChildren(canvas);
            const hardEdges = block.properties.Textures?.HardEdgesBetweenDifferentTextures != false;
            loadCanvas(canvas, getTexturePaths(block), isAnimated, animationSpeed, true, getHeightPaths(block), hardEdges, true);
            loadRecipePreview(recipePreviewDiv, block.properties.Recipe, true);
        },
        // Removing them also stops them and frees their WebGL contexts
        unload: () => {
            previewDiv.replaceChildren();
            recipePreviewDiv.replaceChildren();
        },
    });

    let contentAnimation;

    function setExpanded(isExpanded, animate = true) {
        dropDownDiv.classList.toggle('toggled', isExpanded);

        // When toggled again while animating, continue from where it is
        let from;
        if (contentAnimation) {
            from = getContentKeyframe(getComputedStyle(contentDiv));
            contentAnimation.cancel();
            contentAnimation = undefined;
        }

        // The preview is shown while the expanded block is on screen
        if (isExpanded) {
            contentDiv.classList.remove('d-none');
            previewSize = measurePreviewSize();
            previewObserver.observe(previewDiv);
        } else {
            previewObserver.unobserve(previewDiv);
        }

        if (!animate) {
            if (!isExpanded) hideContent();
            return;
        }

        // The content smoothly grows from or shrinks into the top of the block
        const expanded = getContentKeyframe(getComputedStyle(contentDiv));
        const collapsed = { height: '0px', paddingBottom: '0px', opacity: 0 };
        const keyframes = isExpanded ? [from ?? collapsed, expanded] : [from ?? expanded, collapsed];

        contentDiv.classList.add('animating');
        contentAnimation = contentDiv.animate(keyframes, { duration: 200, easing: 'ease-in-out' });
        contentAnimation.onfinish = () => {
            contentAnimation = undefined;
            contentDiv.classList.remove('animating');
            if (!isExpanded) hideContent();
        };
    }

    function hideContent() {
        contentDiv.classList.add('d-none');
        contentDiv.classList.remove('animating');

        // Remove the preview a couple of frames after hiding it. Removing
        // it right away can briefly show a white square where it was, as
        // the screen may be drawn once more after its image is freed.
        requestAnimationFrame(() => requestAnimationFrame(() => {
            if (contentDiv.classList.contains('d-none')) previewLoaders.get(previewDiv).unload();
        }));
    }

    // Blocks that were opened stay opened
    setExpanded(openedBlocks.has(block.path), false);

    dropDownDiv.addEventListener('click', (e) => {
        const isExpanded = !dropDownDiv.classList.contains('toggled');
        setExpanded(isExpanded);
        setBlockOpened(block, isExpanded);
    });

    blockOpeners.set(block.path.toLowerCase(), () => {
        if (!dropDownDiv.classList.contains('toggled')) {
            setExpanded(true, false);
            setBlockOpened(block, true);
        }
        return div;
    });

    div.appendChild(dropDownDiv);
    div.appendChild(contentDiv);

    return div;
}

function getContentKeyframe(style) {
    return { height: style.height, paddingBottom: style.paddingBottom, opacity: style.opacity };
}

function makeDropDownDiv(block) {
    const dropDownDiv = document.createElement('div');
    dropDownDiv.classList.add('header', 'box-horizontal', 'justify-between', 'dropdown-top');

    const leftDiv = document.createElement('div');
    leftDiv.classList.add('header', 'box-horizontal', 'justify-left', 'block-title');

    const arrow = document.createElement('img');
    arrow.classList.add('dropdown-arrow', 'align-center', 'me-2', 'ms-2');
    arrow.src = './images/arrow.png';

    const name = document.createElement('span');
    name.classList.add('align-center', 'block-name');
    name.innerText = block.properties.Name;
    name.title = block.properties.Name;

    const id = document.createElement('span');
    id.classList.add('me-2', 'align-center', 'block-id');
    id.innerText = `[${block.properties.UniqueID}]`;

    leftDiv.appendChild(arrow);
    leftDiv.appendChild(name);

    // Who made the block is said next to its name
    const creatorName = block.properties.CreatorName;
    if (creatorName) {
        const creator = document.createElement('span');
        creator.classList.add('align-center', 'ms-1', 'block-creator');
        creator.innerText = `by ${creatorName}`;
        leftDiv.appendChild(creator);
    }

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
    contentDiv.classList.add('header', 'd-none', 'block-content');

    const propertiesDiv = makePropertiesDiv(block);
    const previewDiv = makePreviewDiv();
    const recipePreviewDiv = makeRecipePreviewDiv(block.properties.Recipe);
    const buttonDiv = makeButtonDiv(block);

    // The previews are kept together, between the properties and the
    // buttons, or below them when the block is narrow
    const previewsDiv = document.createElement('div');
    previewsDiv.classList.add('block-previews');
    previewsDiv.appendChild(makeCaptionedPreview(previewDiv, 'Block'));
    previewsDiv.appendChild(makeCaptionedPreview(recipePreviewDiv, 'Recipe'));

    contentDiv.appendChild(propertiesDiv);
    contentDiv.appendChild(previewsDiv);
    contentDiv.appendChild(buttonDiv);

    return contentDiv;
}

function makePropertiesDiv(block) {
    const propertiesDiv = document.createElement('div');
    propertiesDiv.classList.add('ms-2', 'block-properties');

    // The properties with a value, with their names and values lined up
    const valuesDiv = document.createElement('div');
    valuesDiv.classList.add('block-property-values');

    const values = [
        ['Yield', block.properties.Yield],
        ['Broken by', getBrokenBy(block.properties.SimilarTo)],
        ['Drops', getDrop(block.properties.UniqueIDToDrop)],
    ];
    // When grouped by category, the group's title already says it
    if (!groupByCategory) values.push(['Category', getCategory(block.properties.CategoryName)]);

    for (const [label, value] of values) {
        const labelElem = document.createElement('span');
        labelElem.classList.add('block-property-label');
        labelElem.innerText = label;

        // Values that are cut short when the window is narrow are shown in
        // full when pointed at
        const valueElem = document.createElement('span');
        valueElem.classList.add('block-property-value');
        valueElem.innerText = value;
        valueElem.title = value;

        valuesDiv.appendChild(labelElem);
        valuesDiv.appendChild(valueElem);
    }

    // The properties that are either yes or no, as a row of chips
    const flagsDiv = document.createElement('div');
    flagsDiv.classList.add('block-property-flags');
    flagsDiv.appendChild(makePropertyChip('Movable', getMovable(block.properties.AllowMove)));
    flagsDiv.appendChild(makePropertyChip('Crystal assist', getCrystalAssist(block.properties.AllowCrystalAssistedBlockPlacement)));
    flagsDiv.appendChild(makePropertyChip('Rotatable', getRotatable(block.properties.AllowRotation)));

    propertiesDiv.appendChild(valuesDiv);
    propertiesDiv.appendChild(flagsDiv);

    return propertiesDiv;
}

// The usual check mark and cross icons, from Material Design (Apache 2.0)
const YES_ICON_PATH = 'M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z';
const NO_ICON_PATH = 'M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z';

// A chip with a check mark for a yes, and a cross and dimmed for a no
function makePropertyChip(label, yesNo) {
    const isYes = yesNo == 'Yes';

    const chip = document.createElement('span');
    chip.classList.add('block-property-chip', isYes ? 'chip-yes' : 'chip-no');
    chip.title = `${label}: ${yesNo}`;
    chip.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${isYes ? YES_ICON_PATH : NO_ICON_PATH}"/></svg>`;
    chip.append(label);

    return chip;
}

// A preview with a small caption at its bottom, saying what it shows
function makeCaptionedPreview(previewDiv, caption) {
    const div = document.createElement('div');
    div.classList.add('captioned-preview');

    const captionElem = document.createElement('span');
    captionElem.classList.add('preview-caption');
    captionElem.innerText = caption;

    div.appendChild(previewDiv);
    div.appendChild(captionElem);

    return div;
}

function makePreviewDiv() {
    const previewDiv = document.createElement('div');
    previewDiv.classList.add('block-preview', 'center');

    return previewDiv;
}

// The recipe preview is wider than it is tall, as recipes are often wide
const RECIPE_PREVIEW_ASPECT = 1.5;

// The smallest the block preview gets, as the properties alone may not be
// very tall
const MIN_PREVIEW_SIZE = 150;

// Clicking the recipe shows it large, like the block preview
function makeRecipePreviewDiv(recipe) {
    const recipePreviewDiv = document.createElement('div');
    recipePreviewDiv.classList.add('block-recipe-preview');
    if (isCraftable(recipe)) {
        recipePreviewDiv.classList.add('enlargeable');
        recipePreviewDiv.addEventListener('click', () => showLargeView(recipePreviewDiv, () => {
            const largeDiv = document.createElement('div');
            largeDiv.classList.add('large-recipe-preview');
            loadRecipePreview(largeDiv, recipe);
            return largeDiv;
        }));
    }

    return recipePreviewDiv;
}

function isCraftable(recipe) {
    return Array.isArray(recipe?.Array) && recipe.Array.some(material => material != 11);
}

// The recipe, turning by itself like the block preview. Blocks without a
// recipe can't be crafted, which is said instead. The small previews in the
// list share one renderer, like the block previews share a WebGL context.
function loadRecipePreview(recipePreviewDiv, recipe, shareRenderer = false) {
    if (!isCraftable(recipe)) {
        const textElem = document.createElement('span');
        textElem.innerHTML = '<em>Not craftable</em>';
        recipePreviewDiv.replaceChildren(textElem);
        return;
    }

    const recipePreview = createRecipePreview(recipePreviewDiv, undefined, undefined,
        material => getMaterialName(material, 1), blockTexturesUrl, { isInteractive: false, shareRenderer });
    recipePreview.setRecipe(recipe);
}

function makePreviewCanvas(size) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;

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

// Each texture's height map, if the block has them, is next to it
function getHeightPaths(block) {
    if (!block.properties.Textures?.WithHeight) return [];
    return getTexturePaths(block).map(path => path?.replace(/\.dds$/, '_height.dds'));
}

function makeButtonDiv(block) {
    const buttonDiv = document.createElement('div');
    buttonDiv.classList.add('me-2', 'block-buttons');

    const editButton = makeIconButton('Edit', EDIT_ICON_PATH);
    editButton.addEventListener('click', async (e) => {
        const success = await window.call.saveBlockInTemp(block);
        if (success) window.call.loadGenerator();
    });

    buttonDiv.appendChild(editButton);

    // Opens the generator with a copy of the block, saved as a new block
    const duplicateButton = makeIconButton('Duplicate', DUPLICATE_ICON_PATH);
    duplicateButton.addEventListener('click', async (e) => {
        const success = await window.call.saveBlockInTemp(block, true);
        if (success) window.call.loadGenerator();
    });

    buttonDiv.appendChild(duplicateButton);

    const deleteButton = makeIconButton('Delete', DELETE_ICON_PATH);
    deleteButton.addEventListener('click', async (e) => {
        await window.call.displayDeleteDialog(block);
    });

    buttonDiv.appendChild(deleteButton);

    return buttonDiv;
}

// The usual pencil, copy and trash can icons, from Material Design (Apache 2.0)
const EDIT_ICON_PATH = 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z';
const DUPLICATE_ICON_PATH = 'M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z';
const DELETE_ICON_PATH = 'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z';

// A button showing an icon, which is named when pointed at
function makeIconButton(label, iconPath) {
    const button = document.createElement('button');
    button.type = 'button';
    button.title = label;
    button.setAttribute('aria-label', label);
    button.classList.add('btn', 'icon-btn');
    button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${iconPath}"/></svg>`;

    return button;
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
const sortButton = document.getElementById('sortButton');
const dropdownContentDiv = document.getElementById('dropdownContent');

// The dropdown grows down out of the sort button when opened, and shrinks
// back into it when closed
const dropdownKeyframes = [
    { opacity: 0, transform: 'translateY(-4px) scaleY(0.7)' },
    { opacity: 1, transform: 'none' }
];
let isDropdownOpen = false;
let dropdownAnimation;

function setDropdownOpen(isOpen) {
    isDropdownOpen = isOpen;

    // When toggled again while animating, continue from where it is. Going
    // the other way, the time left is how far it had come.
    const elapsed = dropdownAnimation?.currentTime;
    dropdownAnimation?.cancel();

    if (isOpen) {
        dropdownContentDiv.classList.remove('d-none');
        document.addEventListener('click', handleClickOutsideDropdown);
    } else {
        document.removeEventListener('click', handleClickOutsideDropdown);
    }

    const duration = 150;
    dropdownAnimation = dropdownContentDiv.animate(dropdownKeyframes, {
        duration,
        easing: 'ease-out',
        direction: isOpen ? 'normal' : 'reverse'
    });
    if (elapsed != null) dropdownAnimation.currentTime = duration - elapsed;

    dropdownAnimation.onfinish = () => {
        dropdownAnimation = undefined;
        if (!isOpen) dropdownContentDiv.classList.add('d-none');
    };
}

function handleClickOutsideDropdown(e) {
    if (e.target == sortButton || dropdownContentDiv.contains(e.target)) return;
    setDropdownOpen(false);
}

sortButton.addEventListener('click', (e) => {
    setDropdownOpen(!isDropdownOpen);
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
    if (['Name', 'ID', 'Created'].includes(savedSortBy?.type) && ['Down', 'Up'].includes(savedSortBy?.order)) {
        sortBy = savedSortBy;
    }
} catch { }

const sortTypeButtons = document.querySelectorAll('button.sort-type-btn');

// Mark the chosen sort type, with an arrow pointing in the chosen order
function showSortArrow() {
    document.querySelectorAll('img.sort-arrow').forEach(img => img.remove());

    const button = [...sortTypeButtons].find(button => button.firstElementChild.innerText == sortBy.type);
    sortTypeButtons.forEach(other => other.classList.toggle('selected', other == button));
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
        case 'Created':
            // Down is oldest first, like the lowest ID first
            blocks.sort(function (a, b) {
                return sortBy.order == 'Down' ? a.createdMs - b.createdMs : b.createdMs - a.createdMs;
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
    button.addEventListener('click', (e) => selectFilterButton(button));
});

async function selectFilterButton(button) {
    if (prevFilterButton == button) return;

    prevFilterButton.classList.remove('btn-pressed');
    button.classList.add('btn-pressed');

    prevFilterButton = button;
    filterBy = button.innerText;
    saveSetting('filterBy', filterBy);

    versionSelect.classList.toggle('d-none', filterBy != 'Mods');

    await updateBlocks();
}


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

    // The button smoothly widens into the text field, and narrows back into
    // the button when left empty
    const buttonWidth = `${searchButton.offsetWidth}px`;
    const searchAnimationOptions = { duration: 200, easing: 'ease-in-out' };

    searchButton.replaceWith(searchInput);
    searchInput.animate([{ width: buttonWidth }, { width: `${searchInput.offsetWidth}px` }], searchAnimationOptions);

    let closeAnimation;
    searchInput.addEventListener('focusout', (e) => {
        if (searchInput.value.length != 0) return;

        closeAnimation = searchInput.animate([{ width: `${searchInput.offsetWidth}px` }, { width: buttonWidth }], searchAnimationOptions);
        closeAnimation.onfinish = () => searchInput.replaceWith(searchButton);
    });

    // Clicking it again while it narrows widens it back, keeping it open
    searchInput.addEventListener('focus', (e) => {
        if (closeAnimation?.playState != 'running') return;
        closeAnimation.onfinish = null;
        closeAnimation.reverse();
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

/**
 * After making or editing a block, it is opened and scrolled to. If the
 * filter hides it, all blocks are shown instead.
 */
async function showBlock(blockPath) {
    let openBlock = blockOpeners.get(blockPath.toLowerCase());
    if (openBlock == undefined && filterBy != 'All') {
        await selectFilterButton([...filterButtons].find(button => button.innerText == 'All'));
        openBlock = blockOpeners.get(blockPath.toLowerCase());
    }
    if (openBlock == undefined) return;

    // The whole block is shown if it fits, otherwise its top
    const blockDiv = openBlock();
    const scrollableDiv = blockDiv.closest('.scrollable');
    const top = getPageTop(blockDiv) - getPageTop(scrollableDiv);
    const margin = Math.max(8, (scrollableDiv.clientHeight - blockDiv.offsetHeight) / 2);
    scrollableDiv.scrollTop = top - margin;

    blockDiv.classList.add('block-highlight');
    blockDiv.addEventListener('animationend', () => blockDiv.classList.remove('block-highlight'), { once: true });
}

// Where the element is in the page's layout. Unlike getBoundingClientRect,
// this isn't changed by the page scaling in when it is opened.
function getPageTop(element) {
    let top = 0;
    for (let el = element; el != null; el = el.offsetParent) top += el.offsetTop;
    return top;
}

async function init() {
    const blockToShow = await window.call.takeBlockToShow();
    await updateBlocks();
    if (blockToShow != undefined) await showBlock(blockToShow);
}

init();