import { getMaterialName, materialColors, isGlowing } from "./recipeMaterials.js";
import { itemShapes } from "./recipeItems.js";
import { showSwatch } from "./recipeSwatches.js";
import { showThumbnail } from "./recipeThumbnails.js";

const EMPTY = 11; // 11 means invalid/nothing.

const CANNOT_REMOVE_TEXT = "Can't remove, as it would cut off other materials";
const CANNOT_CLEAR_LAYER_TEXT = "Can't clear this layer, as it would cut off other materials";

// The materials to choose from, in groups
const materialGroups = [
    { name: 'Blocks', materials: [...materialColors.keys()].filter(material => !itemShapes.has(material) && !isGlowing(material)) },
    { name: 'Glowing blocks', materials: [...materialColors.keys()].filter(isGlowing) },
    { name: 'Items', materials: [...materialColors.keys()].filter(material => itemShapes.has(material)) },
];

function getLabel(material) {
    const name = getMaterialName(material, 1);
    return `${name[0].toUpperCase()}${name.slice(1)}`;
}

//
// Build a recipe one layer at a time, on a grid of squares seen from above.
// Clicking a square chooses what is in it. Empty squares can only be filled
// when they are next to something (also above or below), so the recipe stays
// in one piece. The grid always has a row of squares around what is there
// already, and there is a new layer below and on top to build on as well.
//
// onChange gets the recipe each time it is changed here, in the same form as
// in the game's recipe files (but without the "Recipe" around it).
// onHover gets where in that recipe the square under the pointer is, as
// { x, y, layer }, or undefined when the pointer leaves it. An empty square
// can be outside the recipe, like at -1 or past its last layer.
// onLayerChange gets which layer of that recipe is being built on (-1 for a
// new layer below, and so on), or undefined when there is no recipe.
//
function createRecipeBuilder({ grid, layerText, downButton, upButton, clearLayerButton, resetButton }, texturesUrl, { onChange, onHover, onLayerChange }) {
    // What is where, by "x,y,z", where z is the layer
    let cells = new Map();
    let currentLayer = 0;

    function getKey(x, y, z) {
        return `${x},${y},${z}`;
    }

    function getBounds() {
        if (cells.size == 0) return { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 };
        const positions = [...cells.keys()].map(key => key.split(',').map(Number));
        const [xs, ys, zs] = [0, 1, 2].map(i => positions.map(position => position[i]));
        return {
            minX: Math.min(...xs), maxX: Math.max(...xs),
            minY: Math.min(...ys), maxY: Math.max(...ys),
            minZ: Math.min(...zs), maxZ: Math.max(...zs),
        };
    }

    const neighbours = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

    function canFill(x, y, z) {
        if (cells.size == 0) return true;
        return neighbours.some(([dx, dy, dz]) => cells.has(getKey(x + dx, y + dy, z + dz)));
    }

    // A material can't be removed if that would leave others cut off from
    // the rest. Recipes loaded from elsewhere may already be in several
    // pieces, so it is only stopped if it makes more pieces than there are.
    function canRemove(x, y, z) {
        const withoutIt = new Map(cells);
        withoutIt.delete(getKey(x, y, z));
        return countPieces(withoutIt) <= countPieces(cells);
    }

    // The same goes for a whole layer, so a layer in the middle can't be
    // cleared if it holds the layers above and below together
    function getLayerKeys(z) {
        return [...cells.keys()].filter(key => Number(key.split(',')[2]) == z);
    }

    function canClearLayer(z) {
        const withoutIt = new Map(cells);
        for (const key of getLayerKeys(z)) withoutIt.delete(key);
        return countPieces(withoutIt) <= countPieces(cells);
    }

    function countPieces(cellsToCount) {
        const unvisited = new Set(cellsToCount.keys());
        let pieces = 0;
        while (unvisited.size > 0) {
            pieces++;
            const [start] = unvisited;
            unvisited.delete(start);
            const toVisit = [start];
            while (toVisit.length > 0) {
                const [x, y, z] = toVisit.pop().split(',').map(Number);
                for (const [dx, dy, dz] of neighbours) {
                    const key = getKey(x + dx, y + dy, z + dz);
                    if (unvisited.delete(key)) toVisit.push(key);
                }
            }
        }
        return pieces;
    }

    // Load a recipe, like one from a file, to keep building on it
    function setRecipe(recipe) {
        cells = new Map();
        const sizeX = Math.max(1, recipe.SizeX);
        const sizeY = Math.max(1, recipe.SizeY);
        recipe.Array.forEach((material, i) => {
            if (material == EMPTY) return;
            const x = i % sizeX;
            const y = Math.floor(i / sizeX) % sizeY;
            const z = Math.floor(i / (sizeX * sizeY));
            cells.set(getKey(x, y, z), material);
        });
        currentLayer = 0;
        closePicker();
        render();
    }

    // The recipe as it is in the game's recipe files: the array goes through
    // x first, then y, and the layers from the bottom up last
    function getRecipe() {
        if (cells.size == 0) return { Array: [], SizeX: 0, SizeY: 0, SizeZ: 0 };

        const { minX, maxX, minY, maxY, minZ, maxZ } = getBounds();
        const array = [];
        for (let z = minZ; z <= maxZ; z++) {
            for (let y = minY; y <= maxY; y++) {
                for (let x = minX; x <= maxX; x++) {
                    array.push(cells.get(getKey(x, y, z)) ?? EMPTY);
                }
            }
        }
        return { Array: array, SizeX: maxX - minX + 1, SizeY: maxY - minY + 1, SizeZ: maxZ - minZ + 1 };
    }

    function setCell(x, y, z, material) {
        if (material == undefined) {
            cells.delete(getKey(x, y, z));
        } else {
            cells.set(getKey(x, y, z), material);
        }
        render();
        onChange(getRecipe());
    }

    function render() {
        // The squares are made again, so the pointer is no longer over any
        onHover(undefined);

        const bounds = getBounds();
        const isEmpty = cells.size == 0;
        // One extra row of squares and one extra layer all around, to build on
        const margin = isEmpty ? 0 : 1;
        const minX = bounds.minX - margin, maxX = bounds.maxX + margin;
        const minY = bounds.minY - margin, maxY = bounds.maxY + margin;
        const minLayer = bounds.minZ - margin, maxLayer = bounds.maxZ + margin;
        currentLayer = Math.min(Math.max(currentLayer, minLayer), maxLayer);

        const layerCount = bounds.maxZ - bounds.minZ + 1;
        if (isEmpty) {
            layerText.textContent = 'Click the square to start';
        } else if (currentLayer < bounds.minZ) {
            layerText.textContent = 'New layer below';
        } else if (currentLayer > bounds.maxZ) {
            layerText.textContent = 'New layer on top';
        } else {
            layerText.textContent = `Layer ${currentLayer - bounds.minZ + 1} of ${layerCount}`;
        }
        onLayerChange(isEmpty ? undefined : currentLayer - bounds.minZ);
        downButton.disabled = currentLayer <= minLayer;
        upButton.disabled = currentLayer >= maxLayer;
        clearLayerButton.disabled = getLayerKeys(currentLayer).length == 0;
        resetButton.disabled = isEmpty;
        setResetConfirming(false);

        const squares = [];
        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                squares.push(createSquare(x, y, currentLayer));
            }
        }
        columns = maxX - minX + 1;
        rows = maxY - minY + 1;
        grid.style.setProperty('--columns', columns);
        grid.replaceChildren(...squares);
        fitSquares();
    }

    // The squares are as large as fits in the space around the grid, up to
    // a size where they still look like squares to click and not tiles
    const area = grid.parentElement;
    const GAP = 3;
    const MAX_SQUARE_SIZE = 80;
    let columns = 1;
    let rows = 1;
    function fitSquares() {
        const width = (area.clientWidth - GAP * (columns - 1)) / columns;
        const height = (area.clientHeight - GAP * (rows - 1)) / rows;
        const size = Math.floor(Math.min(width, height, MAX_SQUARE_SIZE));
        if (size > 0) grid.style.setProperty('--square-size', `${size}px`);
    }
    new ResizeObserver(fitSquares).observe(area);

    function createSquare(x, y, z) {
        const square = document.createElement('button');
        square.type = 'button';
        square.classList.add('recipe-builder-square');

        // What is in the layer below is faintly shown, to build on
        const below = cells.get(getKey(x, y, z - 1));
        if (below != undefined) {
            const belowElem = document.createElement('div');
            belowElem.classList.add('recipe-builder-below');
            showSwatch(belowElem, below, texturesUrl);
            square.appendChild(belowElem);
        }

        const material = cells.get(getKey(x, y, z));
        if (material != undefined) {
            const materialElem = document.createElement('div');
            materialElem.classList.add('recipe-builder-material');
            showSwatch(materialElem, material, texturesUrl);
            square.appendChild(materialElem);

            // Right-clicking removes it straight away, if it can be removed
            const isRemovable = canRemove(x, y, z);
            square.title = `${getLabel(material)}\n${isRemovable ? 'Right-click to remove' : CANNOT_REMOVE_TEXT}`;
            square.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                if (isRemovable) {
                    closePicker();
                    setCell(x, y, z, undefined);
                } else {
                    showMessage(CANNOT_REMOVE_TEXT, e.clientX, e.clientY);
                }
            });
        } else if (canFill(x, y, z)) {
            square.classList.add('fillable');
            square.title = 'Add a material here';
        } else {
            square.disabled = true;
        }

        // Where the pointer is, also when it is a spot to add a material
        if (!square.disabled) {
            square.addEventListener('mouseenter', () => {
                const { minX, minY, minZ } = getBounds();
                onHover({ x: x - minX, y: y - minY, layer: z - minZ });
            });
            square.addEventListener('mouseleave', () => onHover(undefined));
        }

        square.addEventListener('click', () => openPicker(square, x, y, z, material));
        return square;
    }

    // A short message by the pointer, which goes away by itself
    let message;
    let messageTimeout;
    function showMessage(text, x, y) {
        message?.remove();
        clearTimeout(messageTimeout);
        message = document.createElement('div');
        message.classList.add('recipe-builder-message', 'outline');
        message.textContent = text;
        message.style.left = `${x + 12}px`;
        message.style.top = `${y + 12}px`;
        document.body.appendChild(message);
        messageTimeout = setTimeout(() => message.remove(), 2000);
    }

    downButton.addEventListener('click', () => { currentLayer--; render(); });
    upButton.addEventListener('click', () => { currentLayer++; render(); });

    // Scrolling anywhere over the builder goes up and down a layer, instead
    // of scrolling the page
    grid.closest('.recipe-builder').addEventListener('wheel', (e) => {
        e.preventDefault();
        const button = e.deltaY < 0 ? upButton : downButton;
        if (e.deltaY != 0 && !button.disabled) {
            closePicker();
            button.click();
        }
    }, { passive: false });

    clearLayerButton.addEventListener('click', (e) => {
        if (!canClearLayer(currentLayer)) {
            showMessage(CANNOT_CLEAR_LAYER_TEXT, e.clientX, e.clientY);
            return;
        }
        closePicker();
        for (const key of getLayerKeys(currentLayer)) cells.delete(key);
        render();
        onChange(getRecipe());
    });

    // Resetting removes everything, so it has to be clicked twice
    let resetTimeout;
    function setResetConfirming(isConfirming) {
        clearTimeout(resetTimeout);
        resetButton.classList.toggle('confirming', isConfirming);
        resetButton.textContent = isConfirming ? 'Click again to remove everything' : 'Reset';
        if (isConfirming) resetTimeout = setTimeout(() => setResetConfirming(false), 3000);
    }

    resetButton.addEventListener('click', () => {
        if (!resetButton.classList.contains('confirming')) {
            setResetConfirming(true);
            return;
        }
        closePicker();
        cells = new Map();
        currentLayer = 0;
        render();
        onChange(getRecipe());
    });

    //
    // Choosing a material
    //
    let picker;

    function openPicker(square, x, y, z, currentMaterial) {
        closePicker();
        picker = document.createElement('div');
        picker.classList.add('recipe-picker', 'blur');

        if (currentMaterial != undefined) {
            const removeButton = document.createElement('button');
            removeButton.type = 'button';
            removeButton.classList.add('btn', 'recipe-picker-remove');
            removeButton.textContent = 'Remove';
            if (!canRemove(x, y, z)) {
                removeButton.disabled = true;
                removeButton.textContent = CANNOT_REMOVE_TEXT;
            }
            removeButton.addEventListener('click', () => {
                closePicker();
                setCell(x, y, z, undefined);
            });
            picker.appendChild(removeButton);
        }

        for (const group of materialGroups) {
            const heading = document.createElement('div');
            heading.classList.add('recipe-picker-heading', 'outline');
            heading.textContent = group.name;

            const options = document.createElement('div');
            options.classList.add('recipe-picker-options');
            for (const material of group.materials) {
                const option = document.createElement('button');
                option.type = 'button';
                option.classList.add('recipe-picker-option');
                option.classList.toggle('selected', material == currentMaterial);
                const swatch = document.createElement('div');
                showThumbnail(swatch, material, texturesUrl);
                const name = document.createElement('span');
                name.classList.add('outline');
                name.textContent = getLabel(material);
                option.append(swatch, name);
                option.addEventListener('click', () => {
                    closePicker();
                    setCell(x, y, z, material);
                });
                options.appendChild(option);
            }
            picker.append(heading, options);
        }

        document.body.appendChild(picker);
        placePicker(square);
        square.classList.add('picking');
        picker.square = square;

        // Clicking anywhere else, or pressing Escape, closes it again
        setTimeout(() => document.addEventListener('pointerdown', onPointerDown));
        document.addEventListener('keydown', onKeyDown);
    }

    // Next to the square, but always inside the window
    function placePicker(square) {
        const squareRect = square.getBoundingClientRect();
        const pickerRect = picker.getBoundingClientRect();
        const gap = 8;
        let left = squareRect.right + gap;
        if (left + pickerRect.width > window.innerWidth - gap) left = squareRect.left - gap - pickerRect.width;
        left = Math.max(gap, left);
        const top = Math.min(Math.max(gap, squareRect.top), window.innerHeight - gap - pickerRect.height);
        picker.style.left = `${left}px`;
        picker.style.top = `${Math.max(gap, top)}px`;
    }

    function closePicker() {
        if (picker == undefined) return;
        picker.square.classList.remove('picking');
        picker.remove();
        picker = undefined;
        document.removeEventListener('pointerdown', onPointerDown);
        document.removeEventListener('keydown', onKeyDown);
    }

    function onPointerDown(e) {
        if (!picker.contains(e.target)) closePicker();
    }

    function onKeyDown(e) {
        if (e.key == 'Escape') closePicker();
    }

    render();
    return { setRecipe };
}

export { createRecipeBuilder }
