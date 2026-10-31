import { loadCanvas, showLargeView } from "./blockPreview.js";
import { createRecipePreview } from "./recipePreview.js";
import { createRecipeBuilder } from "./recipeBuilder.js";
import { getMaterialName } from "./recipeMaterials.js";
import "./sliderScroll.js";
import { updateSliderFill } from "./sliderFill.js";
import { growFromButton, setPageOutAnimation, shrinkIntoButton } from "./pageTransition.js";

// The generator grows out of the button to stop creating the block (which
// is where the button to create one was), and shrinks back into it
growFromButton(getShownDiscardButton(), 220);
setPageOutAnimation(() => shrinkIntoButton(getShownDiscardButton(), 220));

function getShownDiscardButton() {
    return [...document.querySelectorAll('button.discard')].find(button => button.offsetParent != null);
}

/**
 * Define a function to navigate betweens form steps.
 * It accepts one parameter. That is - step number.
 */
const navigateToFormStep = (stepNumber) => {
    /**
     * Hide all form steps.
     */
    document.querySelectorAll(".form-step").forEach((formStepElement) => {
        formStepElement.classList.add("d-none");
    });
    /**
     * Mark all form steps as unfinished.
     */
    document.querySelectorAll(".form-stepper-list").forEach((formStepHeader) => {
        formStepHeader.classList.add("form-stepper-unfinished");
        formStepHeader.classList.remove("form-stepper-active", "form-stepper-completed", 'form-stepper-skipped');
    });
    /**
     * Show the current form step (as passed to the function).
     */
    document.querySelector("#step-" + stepNumber).classList.remove("d-none");
    /**
     * Select the form step circle (progress bar).
     */
    const formStepCircle = document.querySelector('li[step="' + stepNumber + '"]');
    /**
     * Mark the current form step as active.
     */
    formStepCircle.classList.remove("form-stepper-unfinished", "form-stepper-completed");
    formStepCircle.classList.add("form-stepper-active");
    /**
     * Loop through each form step circles.
     * This loop will continue up to the current step number.
     * Example: If the current step is 3,
     * then the loop will perform operations for step 1 and 2.
     */
    for (let index = 0; index < stepNumber; index++) {
        /**
         * Select the form step circle (progress bar).
         */
        const formStepCircle = document.querySelector('li[step="' + index + '"]');
        /**
         * Check if the element exist. If yes, then proceed.
         */
        if (formStepCircle) {
            /**
             * Mark the form step as completed.
             */
            formStepCircle.classList.remove("form-stepper-unfinished", "form-stepper-active");
            if (formStepSkipped(index)) {
                formStepCircle.classList.add('form-stepper-skipped');
            } else {
                formStepCircle.classList.add("form-stepper-completed");
            }
        }
    }

    updateSubmitButtonState();

    // The finalization previews only exist while they are shown, as each
    // one takes up a WebGL context
    if (stepNumber == 4) {
        showFinalPreviews();
    } else {
        removeFinalPreviews();
    }
};

function formStepSkipped(stepNumber) {
    const formStep = document.getElementById(`step-${stepNumber}`);
    const hasInvalidInput = formStep.querySelectorAll(':invalid').length != 0;
    return hasInvalidInput;
}

/**
 * Select all form navigation buttons, and loop through them.
 */
document.querySelectorAll(".btn-navigate-form-step").forEach((formNavigationBtn) => {
    /**
     * Add a click event listener to the button.
     */
    formNavigationBtn.addEventListener("click", () => {
        if (formNavigationBtn.innerText == 'Next' && hasInvalidInputs(formNavigationBtn)) {
            return;
        }

        /**
         * Get the value of the step.
         */
        const stepNumber = formNavigationBtn.getAttribute("step_number");
        /**
         * Call the function to navigate to the target form step.
         */
        navigateToFormStep(stepNumber);
    });
});

/**
 * Make form stepper titles clickable
 */
document.querySelectorAll('span.form-stepper-title').forEach((span) => {
    const step = span.getAttribute("step_number");
    span.title = `Go to ${span.innerText.trim()}`;

    span.addEventListener('click', (e) => {
        navigateToFormStep(step);
    })
})

/**
 * Generate random number and put it into the uniqueID
 * input.
 */
const uniqueIDButton = document.getElementById('uniqueIDButton');
const uniqueIDInput = document.getElementById('uniqueIDInput');

uniqueIDButton.addEventListener('click', function () {
    const randomInt = Math.floor(Math.random() * 2147483648) + 1;
    uniqueIDInput.value = randomInt;

    removeInvalidHighlight(uniqueIDInput);
});

/**
 * The block name and creator name are used in the block's
 * folder name, so they can't contain characters that
 * Windows doesn't allow there.
 */
const folderNameInputs = [document.getElementById('nameInput'), document.getElementById('creatorNameInput')];

folderNameInputs.forEach((input) => {
    input.addEventListener('input', () => validateFolderNameInput(input));
    validateFolderNameInput(input);
});

function validateFolderNameInput(input) {
    const isInvalid = /[\\/:*?"<>|]/.test(input.value) || input.value.endsWith('.');
    input.setCustomValidity(isInvalid ? 'Can not contain \\ / : * ? " < > | or end with a period.' : '');
}



/**
 * Texture choosing mechanism. The texture type says which faces get their
 * own texture, and every kind of texture has a slot for each of them.
*/
const textureFaces = {
    1: [['all', 'All']],
    2: [['sides', 'Sides'], ['updown', 'Up/down']],
    3: [['sides', 'Sides'], ['up', 'Up'], ['down', 'Down']],
    6: [['up', 'Up'], ['down', 'Down'], ['left', 'Left'], ['right', 'Right'], ['front', 'Front'], ['back', 'Back']]
};
const textureKinds = ['regular', 'small', 'normal', 'glow', 'height'];
const textureFileExtensions = ['.png', '.jpg', '.jpeg', '.dds'];
const textureSlotDragType = 'application/x-texture-slot';

// The file in each slot. There are six of each, so textures in slots that
// a texture type doesn't use are kept if another type is chosen again.
const textureSlots = Object.fromEntries(textureKinds.map(kind => [kind, Array(6).fill(undefined)]));
let textureAmount = 1;
// The slot that the textures chosen in the file picker go to
let pickingSlot;

const loadingTemp = loadTemp();

function getTextureSlotsDiv(kind) {
    return document.querySelector(`div.texture-slots[data-kind="${kind}"]`);
}

function getTextureInput(kind) {
    return getTextureSlotsDiv(kind).previousElementSibling;
}

function setUpTextureSlots() {
    document.querySelectorAll('#textureTypeDiv input').forEach(button => {
        button.addEventListener('click', () => {
            if (textureAmount == button.dataset.amount) return;
            setTextureAmount(parseInt(button.dataset.amount));
            texturesChanged(textureKinds);
        });
    });

    textureKinds.forEach(kind => {
        const input = getTextureInput(kind);
        input.addEventListener('change', () => {
            addTextureFiles(pickingSlot.kind, pickingSlot.index, [...input.files].map(file => file.path));
            input.value = null;
        });
    });

    setTextureAmount(textureAmount);
    texturesChanged([]);
}

function setTextureAmount(amount) {
    textureAmount = amount;
    document.querySelectorAll('#textureTypeDiv input').forEach(button => {
        button.classList.toggle('btn-pressed', button.dataset.amount == amount);
    });
    textureKinds.forEach(renderTextureSlots);
}

// The textures of the kinds have changed
function texturesChanged(changedKinds) {
    changedKinds.forEach(kind => removeInvalidHighlight(getTextureInput(kind)));
    textureKinds.forEach(updateValidity);
    schedulePreview();
}

function renderTextureSlots(kind) {
    const slots = textureFaces[textureAmount].map(([face, faceName], index) => createTextureSlot(kind, index, faceName));
    getTextureSlotsDiv(kind).replaceChildren(...slots);
}

function createTextureSlot(kind, index, faceName) {
    const filePath = textureSlots[kind][index];

    const slot = document.createElement('div');
    slot.classList.add('texture-slot');

    const square = document.createElement('div');
    square.classList.add('texture-slot-square');
    slot.appendChild(square);

    const faceLabel = document.createElement('span');
    faceLabel.classList.add('texture-slot-face');
    faceLabel.innerText = faceName;
    slot.appendChild(faceLabel);

    if (filePath == undefined) {
        square.classList.add('empty', 'custom-file-uploader');
        square.innerText = 'Add';
        square.title = `Add a texture for ${faceName.toLowerCase()}`;
        square.addEventListener('click', () => {
            pickingSlot = { kind, index };
            getTextureInput(kind).click();
        });
    } else {
        const textureImg = document.createElement('img');
        setTextureImgSrc(textureImg, filePath);
        textureImg.classList.add('texture-img');
        textureImg.draggable = false;

        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.classList.add('remove-texture-btn');
        removeButton.title = 'Remove texture';
        removeButton.draggable = false;
        removeButton.addEventListener('click', () => {
            textureSlots[kind][index] = undefined;
            renderTextureSlots(kind);
            texturesChanged([kind]);
        });

        square.append(textureImg, removeButton);
        square.title = `${getFileName(filePath)}\nDrag to another slot to move it`;
        square.draggable = true;
        square.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData(textureSlotDragType, JSON.stringify({ kind, index }));
            e.dataTransfer.effectAllowed = 'move';
            square.classList.add('dragging');
        });
        square.addEventListener('dragend', () => square.classList.remove('dragging'));
    }

    // Textures from other slots and files can be dropped on it
    square.addEventListener('dragover', (e) => {
        const isSlot = e.dataTransfer.types.includes(textureSlotDragType);
        if (!isSlot && !e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = isSlot ? 'move' : 'copy';
        square.classList.add('drag-over');
    });
    square.addEventListener('dragleave', () => square.classList.remove('drag-over'));
    square.addEventListener('drop', (e) => {
        e.preventDefault();
        square.classList.remove('drag-over');

        const draggedSlot = e.dataTransfer.getData(textureSlotDragType);
        if (draggedSlot != '') {
            moveTexture(JSON.parse(draggedSlot), { kind, index });
        } else {
            const filePaths = [...e.dataTransfer.files].map(file => file.path)
                .filter(filePath => textureFileExtensions.some(extension => filePath.toLowerCase().endsWith(extension)));
            addTextureFiles(kind, index, filePaths);
        }
    });

    return slot;
}

function getFileName(filePath) {
    return filePath.split(/[\\/]/).pop();
}

// The first file goes in the slot, and the rest in the empty slots after it
function addTextureFiles(kind, index, filePaths) {
    if (filePaths.length == 0) return;

    const slots = textureSlots[kind];
    const targetIndices = [index];
    for (let i = 1; i < textureAmount; i++) {
        const targetIndex = (index + i) % textureAmount;
        if (slots[targetIndex] == undefined) targetIndices.push(targetIndex);
    }
    filePaths.slice(0, targetIndices.length).forEach((filePath, i) => slots[targetIndices[i]] = filePath);

    renderTextureSlots(kind);
    texturesChanged([kind]);
}

// The textures of the two slots swap places, which can be of different kinds
function moveTexture(from, to) {
    if (from.kind == to.kind && from.index == to.index) return;

    const fromTexture = textureSlots[from.kind][from.index];
    textureSlots[from.kind][from.index] = textureSlots[to.kind][to.index];
    textureSlots[to.kind][to.index] = fromTexture;

    const changedKinds = [...new Set([from.kind, to.kind])];
    changedKinds.forEach(renderTextureSlots);
    texturesChanged(changedKinds);
}

// Files dropped next to a slot would otherwise be opened in the window
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => e.preventDefault());

// The textures of the kind, with the face each is for
function getTextures(kind) {
    return textureFaces[textureAmount]
        .map(([face], index) => [textureSlots[kind][index], face])
        .filter(([filePath]) => filePath != undefined);
}

// Regular textures are needed for every face, and the other kinds
// either for every face or none
function updateValidity(kind) {
    const input = getTextureInput(kind);
    const isRequired = getTextureSlotsDiv(kind).dataset.required;
    const amountOfTextures = getTextures(kind).length;

    if (amountOfTextures == textureAmount || (!isRequired && amountOfTextures == 0)) {
        input.setCustomValidity('');
    } else {
        input.setCustomValidity(isRequired ? 'A texture is needed for every face.' : 'Either none or a texture for every face is needed.');
    }
}

// DDS files can't be shown directly, so show a thumbnail made by main.
async function setTextureImgSrc(img, filePath) {
    if (filePath.toLowerCase().endsWith('.dds')) {
        const thumbnailPath = await window.call.getTextureThumbnail(filePath);
        if (thumbnailPath != undefined) img.src = toFileUrl(thumbnailPath);
    } else {
        img.src = toFileUrl(filePath);
    }
}

// Turn a file path into a URL usable as an image source, escaping
// characters like '#' and '%' that would otherwise break it.
function toFileUrl(filePath) {
    const parts = filePath.replaceAll('\\', '/').split('/');
    return 'file:///' + parts.map((part, i) => i == 0 ? part : encodeURIComponent(part)).join('/');
}

function hasInvalidInputs(button) {
    textureKinds.forEach(updateValidity);

    const currentStep = button.parentElement.parentElement.parentElement.previousElementSibling;
    const invalidInputs = currentStep.querySelectorAll(':invalid');

    // Highlight all inputs that are invalid
    for (let i = 0; i < invalidInputs.length; i++) {
        addInvalidHighlight(invalidInputs[i]);
    }

    const hasInvalidInputs = invalidInputs.length != 0;
    return hasInvalidInputs;
}

function refreshInvalidHighlight(input) {
    if (!input.checkValidity()) {
        addInvalidHighlight(input)
    }
    else {
        removeInvalidHighlight(input);
    }
}

function addInvalidHighlight(input) {
    input.classList.add('highlight-invalid');

    input.addEventListener('input', function (e) {
        removeInvalidHighlight(input);
    }, { once: true });
}

function removeInvalidHighlight(input) {
    input.classList.remove('highlight-invalid');
}

/**
 * Automatically update yield fields
 */
const yieldSliderInput = document.getElementById('yieldSliderInput');
const yieldNumberInput = document.getElementById('yieldNumberInput');

yieldSliderInput.addEventListener('input', function (e) {
    yieldNumberInput.value = e.target.value;

    if (yieldNumberInput.classList.contains('highlight-invalid')) {
        yieldNumberInput.classList.remove('highlight-invalid');
    }
});

yieldNumberInput.addEventListener('input', function (e) {
    yieldSliderInput.value = e.target.value;
    updateSliderFill(yieldSliderInput);
});

/**
 * Handle recipe info
 */
const blockTexturesUrl = window.call.getBlockTexturesUrl();

const recipePreview = createRecipePreview(
    document.getElementById('recipePreviewDiv'),
    document.getElementById('recipeLayerInput'),
    document.getElementById('recipeLayerValue'),
    material => getMaterialName(material, 1),
    blockTexturesUrl
);

// What is built is written to the recipe, the same way the game writes it
const recipeBuilder = createRecipeBuilder(
    {
        grid: document.getElementById('recipeBuilderGrid'),
        layerText: document.getElementById('recipeBuilderLayerText'),
        downButton: document.getElementById('recipeBuilderDownButton'),
        upButton: document.getElementById('recipeBuilderUpButton'),
        clearLayerButton: document.getElementById('recipeBuilderClearLayerButton'),
        resetButton: document.getElementById('recipeBuilderResetButton'),
    },
    blockTexturesUrl,
    {
        onChange: (recipe) => {
            document.getElementById('recipePropertiesTextarea').value = getRecipeFileContent(recipe);
            updateRecipeMaterials(false);
        },
        onHover: (position) => recipePreview.highlight(position),
        onLayerChange: (layer) => recipePreview.showBuilderLayer(layer),
    }
);

document.getElementById('recipeBuilderLayerInput').addEventListener('change', (e) => {
    recipePreview.setBuilderLayerShown(e.target.checked);
});

function getRecipeFileContent(recipe) {
    return `"Recipe": {\n`
        + `\t\t"Array" : [${recipe.Array.join(',')}],\n`
        + `\t\t"SizeX": ${recipe.SizeX},\n`
        + `\t\t"SizeY": ${recipe.SizeY},\n`
        + `\t\t"SizeZ": ${recipe.SizeZ}\n`
        + `},`;
}

const loadingDefaultRecipe = setDefaultRecipePreview();
addEventListenerToRefreshButton();
checkIfRecipeButtonWillWorkAndUpdate();

async function setDefaultRecipePreview() {
    const recipePropertiesTextarea = document.getElementById('recipePropertiesTextarea');
    const defaultRecipeFileContent = await window.call.getDefaultRecipeFileContent();
    recipePropertiesTextarea.value = defaultRecipeFileContent;
    updateRecipeMaterials();
}

async function checkIfRecipeButtonWillWorkAndUpdate() {
    const res = await window.call.getGeneratedRecipeFileContent();
    if (res == undefined) {
        disableLoadRecipeButton();
    } else {
        enableLoadRecipeButton();
    }
}

function disableLoadRecipeButton() {
    const button = document.getElementById('loadRecipeInput');
    button.disabled = true;
    button.value = 'Could not find file';

    const refreshButton = document.getElementById('refreshLoadRecipeInput');
    refreshButton.classList.remove('d-none');
}

function enableLoadRecipeButton() {
    const button = document.getElementById('loadRecipeInput');
    button.disabled = false;
    button.value = 'Load';

    const refreshButton = document.getElementById('refreshLoadRecipeInput');
    refreshButton.classList.add('d-none');
}

function addEventListenerToRefreshButton() {
    document.getElementById('refreshLoadRecipeInput').addEventListener('click', (e) => {
        checkIfRecipeButtonWillWorkAndUpdate();
    });
}

// The recipe builder shows the recipe too, unless the change came from it
function updateRecipeMaterials(updateBuilder = true) {
    const recipePropertiesTextarea = document.getElementById('recipePropertiesTextarea');
    const recipeMaterialsDiv = document.getElementById('recipeMaterialsDiv');

    const recipeProperties = getRecipe(true);

    const recipeLayoutElems = document.querySelectorAll('.recipe-layout');
    recipeLayoutElems.forEach(elem => elem.classList.add('d-none'));

    if (recipeProperties == undefined || !Array.isArray(recipeProperties.Array)) {
        // Block submitting until a valid recipe is loaded
        recipePropertiesTextarea.setCustomValidity('Invalid recipe.');

        const textElem = document.createElement('span');
        textElem.classList.add('outline');
        textElem.innerHTML = '<em>Could not read the recipe. Please load a valid recipe file.</em>';
        recipeMaterialsDiv.replaceChildren(textElem);
        return;
    }
    recipePropertiesTextarea.setCustomValidity('');
    if (updateBuilder) recipeBuilder.setRecipe(recipeProperties);

    const materialsArray = removeInvalidMaterials(recipeProperties.Array);

    if (materialsArray.length == 0) {
        const textElem = document.createElement('span');
        textElem.classList.add('outline');
        textElem.innerHTML = '<em>No recipe has been loaded. Therefore not craftable.</em>';
        recipeMaterialsDiv.replaceChildren(textElem);
    } else {
        const materialsElem = document.createElement('span');
        materialsElem.classList.add('outline');
        let materials = getMaterials(materialsArray);
        materialsElem.innerHTML = `<em>${materials}.</em>`;
    
        recipeMaterialsDiv.replaceChildren(materialsElem);

        recipeLayoutElems.forEach(elem => elem.classList.remove('d-none'));
        recipePreview.setRecipe(recipeProperties);
    }

}

// The recipe written in the recipe text, if it can be read
function getRecipe(logErrors = false) {
    const recipePropertiesRaw = document.getElementById('recipePropertiesTextarea').value;
    try {
        return JSON.parse(recipePropertiesRaw.replace('"Recipe": ', '').replace('},', '}'));
    } catch (err) {
        if (logErrors) console.error(err);
        return undefined;
    }
}

function removeInvalidMaterials(materialsArray) {
    return materialsArray.filter(function (material) {
        return material !== 11; // 11 means invalid/nothing.
    })
}

function getMaterials(materialsArray) {
    if (materialsArray.length == 0) return 'None'

    let materialsMap = new Map();
    for (let i = 0; i < materialsArray.length; i++) {
        const material = materialsArray[i];
        if (materialsMap.has(material)) {
            const currentValue = materialsMap.get(material);
            materialsMap.set(material, currentValue + 1);
        } else {
            materialsMap.set(material, 1);
        }
    }

    let materials = undefined;
    for (let [material, amount] of materialsMap) {
        const materialName = getMaterialName(material, amount);

        if (materials == undefined) {
            materials = `${amount} ${materialName}`;
        } else {
            materials = `${materials}, ${amount} ${materialName}`
        }
    }

    return materials;
}

// Manually upload
document.getElementById('uploadRecipeInput').addEventListener('change', function (e) {
    const recipePropertiesFile = e.target.files[0];
    const reader = new FileReader();

    const recipePropertiesTextarea = document.getElementById('recipePropertiesTextarea');

    reader.addEventListener('load', function () {
        recipePropertiesTextarea.value = reader.result;
        updateRecipeMaterials();
    });

    reader.readAsText(recipePropertiesFile);

    e.target.value = null;
});

// Load from appdata
document.getElementById('loadRecipeInput').addEventListener('click', async function (e) {
    const recipePropertiesTextarea = document.getElementById('recipePropertiesTextarea');
    const generatedRecipeFileContent = await window.call.getGeneratedRecipeFileContent();

    if (generatedRecipeFileContent == undefined) {
        checkIfRecipeButtonWillWorkAndUpdate();
    } else {
        recipePropertiesTextarea.value = generatedRecipeFileContent;
        updateRecipeMaterials();
    }
});

/**
 * Handle form submit
 */
document.getElementById('blockForm').addEventListener('submit', async function (e) {
    e.preventDefault();

    const formData = new FormData(e.target);

    // Get all properties
    const blockName = formData.get('name');
    const creatorName = formData.get('creatorName');
    const uniqueID = parseInt(formData.get('uniqueID'));
    const yieldAmount = parseInt(formData.get('yieldNumber'));
    const similarTo = parseInt(formData.get('similarTo'));
    const categoryName = formData.get('categoryName');
    const uniqueIDToDrop = parseInt(formData.get('uniqueIDToDrop'));
    const allowMove = formData.get('allowMove') == 'on' ? true : false;
    const allowCrystalPlacement = formData.get('allowCrystalPlacement') == 'on' ? true : false;
    const allowRotation = formData.get('allowRotation') == 'on' ? true : false;
    const noHardEdges = hasNoHardEdges();
    const makeAnimated = formData.get('makeAnimated') == 'on' ? true : false;

    // Get all textures and corresponding mode
    const mode = textureAmount == 6 ? 4 : textureAmount;
    const regularTextures = getTextures('regular');
    const smallTextures = getTextures('small');
    const normalTextures = getTextures('normal');
    const hasNormalTextures = normalTextures.length != 0;
    const glowTextures = getTextures('glow');
    const hasGlowTextures = glowTextures.length != 0;
    const heightTextures = getTextures('height');
    const hasHeightTextures = heightTextures.length != 0;

    // Get recipe properties and picture
    const recipePropertiesRaw = formData.get('recipeProperties');
    const recipeProperties = JSON.parse(recipePropertiesRaw.replace('"Recipe": ', '').replace('},', '}'));

    // Make properties file content
    let propertiesFileContent = {
        Name: blockName,
        CreatorName: creatorName,
        UniqueID: uniqueID,
        Recipe: recipeProperties,
        Yield: yieldAmount,
        SimilarTo: similarTo,
        Textures: {
            Mode: mode,
            WithNormals: hasNormalTextures,
            WithGlowMap: hasGlowTextures,
            WithHeight: hasHeightTextures
        },
        UniqueIDToDrop: uniqueIDToDrop,
        AllowMove: allowMove,
        AllowCrystalAssistedBlockPlacement: allowCrystalPlacement,
        AllowRotation: allowRotation
    }

    // The game makes the edges between different textures hard, unless
    // this says they continue into each other
    if (noHardEdges) {
        propertiesFileContent.Textures.HardEdgesBetweenDifferentTextures = false;
    }

    // If it has a category name
    if (categoryName.length != 0) {
        propertiesFileContent.CategoryName = categoryName;
    }

    // If it is animated
    if (makeAnimated) {
        const animationSpeed = parseInt(formData.get('animationSpeedNumber'));
        propertiesFileContent.AnimationSpeed = animationSpeed;
    }

    // Format location
    if (saveLocation == undefined) {
        return;
    }

    const location = `${saveLocation}\\${blockName}.${creatorName}.${uniqueID}`;
    // Give data to main, have it make the block. If editing, main
    // removes the old block once the new one has been made.
    const response = await window.call.generateCustomBlock(location, propertiesFileContent,
        regularTextures, smallTextures, normalTextures, glowTextures, heightTextures);

    if (response) {
        window.call.generationCompletePopup(location);
    }
});

/**
 * Handle uniqueIDToDrop inputs
 */
let prevButton = document.getElementById('uniqueIDToDropItselfInput');

document.getElementById('uniqueIDToDropDiv').querySelectorAll('input.btn').forEach((button) => {
    button.addEventListener('click', function (e) {
        if (prevButton == button) return;

        prevButton.classList.remove('btn-pressed');
        button.classList.add('btn-pressed');

        prevButton = button;

        const numberInput = document.getElementById('uniqueIDToDropInput');
        if (button.value == 'Custom') {
            numberInput.classList.remove('hide');
            numberInput.readOnly = false;
            numberInput.required = true;
            numberInput.value = '';
        }
        else {
            numberInput.classList.add('hide');
            numberInput.readOnly = true;
            numberInput.required = false;
            removeInvalidHighlight(numberInput);

            if (button.value == 'Itself') {
                numberInput.value = -2;
            }
            else {
                numberInput.value = -1;
            }
        }
    });
});

/**
 * Handle excess whitespace in front of and behind all input.
 */
document.querySelectorAll('input[type=text]').forEach((input) => {
    input.addEventListener('focusout', function (e) {
        input.value = input.value.trim();
    });
})

/**
 * Handle submit button state
 */
function updateSubmitButtonState() {
    const submitButton = document.getElementById('submitButton');
    if (isFormValid()) {
        submitButton.disabled = false;
    } else {
        submitButton.disabled = true;
    }
}

function isFormValid() {
    if (saveLocation == undefined) return false;

    const formElem = document.forms['blockForm'];
    return formElem.checkValidity();
}

/**
 * Handle where to save
 */
let prevSaveButton = document.getElementById('blocksFolderInput');
let saveLocation;

document.getElementById('blocksFolderInput').addEventListener('click', (e) => updateSaveButton(e.target));

function updateSaveButton(button) {
    if (prevSaveButton != button) {
        prevSaveButton.classList.remove('btn-pressed');
        button.classList.add('btn-pressed');
    };


    saveLocation = button.value;
    prevSaveButton = button;

    updateSubmitButtonState();
}

/**
 * Put path to Blocks folder in button
 */
const loadingBlocksFolder = putPathToBlocksFolderInButton(document.getElementById('blocksFolderInput'));

async function putPathToBlocksFolderInButton(button) {
    const modsFolderPath = await window.call.getModsFolderPath();
    if (modsFolderPath == undefined) {
        button.value = 'Could not find blocks folder';
        button.disabled = true;
        saveLocation = undefined;
        button.classList.remove('btn-pressed');

        const submitButton = document.getElementById('submitButton');
        submitButton.disabled = true;
    }
    else {
        const blocksFolderPath = modsFolderPath + '\\Blocks';
        button.value = blocksFolderPath;
        saveLocation = blocksFolderPath;
    }
}

/**
 * Populate Mod folder picker
 */
const loadingModFolders = populateModFolderPicker();

async function populateModFolderPicker() {
    const modFolderDiv = document.getElementById('modFolderDiv');
    const modFolders = await window.call.getAllModFolders();

    for (let i = 0; i < modFolders.length; i++) {
        modFolderDiv.appendChild(createInputGroup(modFolders[i]));
    }
    if (modFolders.length == 0) {
        const span = document.createElement('span');
        span.classList.add('outline');
        span.innerText = 'No mod folders found.'

        modFolderDiv.appendChild(span);
    }
}

function createInputGroup(values) {
    const div = document.createElement('div');
    div.classList.add('form-group');

    const input = document.createElement('input');
    input.type = 'button';
    input.classList.add('btn', 'form-control');
    input.value = values.name;

    const select = document.createElement('select');
    select.classList.add('form-control-tight');

    for (let i = 0; i < values.updates.length; i++) {
        const option = document.createElement('option');
        option.value = values.updates[i];
        option.innerText = values.updates[i];
        select.appendChild(option);
    }

    // Without an update folder there is nowhere to save the block.
    if (values.updates.length == 0) {
        input.disabled = true;
        select.disabled = true;
    }

    input.addEventListener('click', () => selectModFolder(input, select));

    // Changing the update of the selected mod changes where to save.
    select.addEventListener('change', () => {
        if (prevSaveButton == input) selectModFolder(input, select);
    });

    div.appendChild(input);
    div.appendChild(select);

    return div;
}

async function selectModFolder(input, select) {
    const modsFolderPath = await window.call.getModsFolderPath();
    const location = `${modsFolderPath}\\ModFolders\\${input.value}\\${select.value}\\Blocks`;

    if (prevSaveButton != input) {
        prevSaveButton.classList.remove('btn-pressed');
        input.classList.add('btn-pressed');
        prevSaveButton = input;
    }

    saveLocation = location;
    updateSubmitButtonState();
}

/**
 * Handle directory picker for saving
 */
document.getElementById('saveBlockManuallyInput').addEventListener('click', async function (e) {
    const path = await window.call.selectFolder();
    if (path == undefined) return;
    e.target.value = path;

    updateSaveButton(e.target);
})

/**
 * Handle Discard block buttons. If anything has been input since the
 * page loaded, ask before throwing it away.
 */
let initialFormState;
Promise.all([loadingTemp, loadingDefaultRecipe, loadingBlocksFolder, loadingModFolders])
    .then(() => initialFormState = getFormState());

function handleDiscardBlockButtons(isEditing) {
    document.querySelectorAll('button.discard').forEach(button => {
        if (isEditing) button.title = 'Stop editing this block';

        button.addEventListener('click', (e) => {
            const hasChanges = initialFormState != undefined && getFormState() != initialFormState;
            if (hasChanges) {
                window.call.displayDiscardDialog(isEditing);
            } else {
                window.call.loadManageBlocks();
            }
        });
    });
}

// Everything the user can input: the fields, which buttons are chosen,
// and the textures with the faces they are used for.
function getFormState() {
    const fields = [...document.forms['blockForm'].elements]
        .filter(element => element.type != 'file')
        .map(element => {
            if (element.type == 'checkbox') return element.checked;
            if (element.type == 'button') return [element.value, element.classList.contains('btn-pressed')];
            return element.value;
        });
    const textures = textureKinds.map(getTextures);

    return JSON.stringify([fields, textures]);
}


/**
 * Load block in temp if there is one. It is either being edited, or
 * duplicated, which makes a new block starting from a copy of it.
 */
async function loadTemp() {
    const tempBlock = await window.call.getTemp();
    const isDuplicating = tempBlock?.isDuplicate == true;
    const isEditing = tempBlock != undefined && !isDuplicating;
    if (tempBlock != undefined) {
        const formElem = document.forms['blockForm'];

        // Set all properties
        formElem.elements['name'].value = tempBlock.properties.Name;
        formElem.elements['creatorName'].value = tempBlock.properties.CreatorName;
        folderNameInputs.forEach(validateFolderNameInput);
        formElem.elements['uniqueID'].value = tempBlock.properties.UniqueID;
        formElem.elements['yieldSlider'].value = tempBlock.properties.Yield;
        updateSliderFill(formElem.elements['yieldSlider']);
        formElem.elements['yieldNumber'].value = tempBlock.properties.Yield;
        formElem.elements['similarTo'].value = tempBlock.properties.SimilarTo;

        if (tempBlock.properties.CategoryName != undefined) {
            formElem.elements['categoryName'].value = tempBlock.properties.CategoryName;
        }
        if (tempBlock.properties.UniqueIDToDrop != undefined) {
            formElem.elements['uniqueIDToDrop'].value = tempBlock.properties.UniqueIDToDrop;
            updateUniqueIDToDropDiv();
        }
        if (tempBlock.properties.AllowMove != undefined) {
            formElem.elements['allowMove'].checked = tempBlock.properties.AllowMove;
        }
        if (tempBlock.properties.AllowCrystalAssistedBlockPlacement != undefined) {
            formElem.elements['allowCrystalPlacement'].checked = tempBlock.properties.AllowCrystalAssistedBlockPlacement;
        }
        if (tempBlock.properties.AllowRotation != undefined) {
            formElem.elements['allowRotation'].checked = tempBlock.properties.AllowRotation;
        }
        if (tempBlock.properties.Textures?.HardEdgesBetweenDifferentTextures == false) {
            formElem.elements['noHardEdges'].checked = true;
        }
        if (tempBlock.properties.AnimationSpeed != undefined) {
            formElem.elements['makeAnimated'].checked = true;
            formElem.elements['animationSpeedSlider'].value = tempBlock.properties.AnimationSpeed;
            updateSliderFill(formElem.elements['animationSpeedSlider']);
            formElem.elements['animationSpeedNumber'].value = tempBlock.properties.AnimationSpeed;
            enableAnimation();
        }

        // Set textures.
        const textures = await window.call.getTempTextures();
        const mode = tempBlock.properties.Textures?.Mode;
        const amount = mode == 4 ? 6 : mode;
        textureAmount = textureFaces[amount] != undefined ? amount : 1;
        textureKinds.forEach(kind => addFilesToTextureSlots(textures[kind], textureSlots[kind]));

        // Set recipe. Blocks without one keep the default (not craftable).
        if (tempBlock.properties.Recipe != undefined) {
            const recipePropertiesJSON = JSON.stringify({ Recipe: tempBlock.properties.Recipe }, null, 4);
            formElem.elements['recipeProperties'].value = recipePropertiesJSON.substring(2, recipePropertiesJSON.length - 2).replace('    ', '');
            updateRecipeMaterials();
        }

        if (isDuplicating) {
            // The copy needs its own unique ID, which also
            // keeps it from being saved over the original.
            uniqueIDButton.click();
        } else {
            // Change submit button text.
            document.getElementById('submitButton').innerText = 'Save changes';
        }

        // Show save location (existing location) and put
        // path in it.
        showExistingLocation(isDuplicating);

        const existingLocationInput = document.getElementById('existingLocationInput');
        existingLocationInput.value = tempBlock.path.substring(0, tempBlock.path.lastIndexOf("\\"));

        updateSaveButton(existingLocationInput);

        existingLocationInput.addEventListener('click', (e) => updateSaveButton(existingLocationInput));
    };

    setUpTextureSlots();
    handleDiscardBlockButtons(isEditing);
}

function showExistingLocation(isDuplicating) {
    const label = document.getElementById('existingLocationLabel');
    if (isDuplicating) {
        label.firstChild.textContent = 'Save next to the original block (default when duplicating) ';
        label.querySelector('.tooltip-content').innerText = 'This option only shows up when you are duplicating '
            + 'an existing block. This will save the copy in the same folder as the original.';
    }
    label.classList.remove('d-none');
    document.getElementById('existingLocationInput').classList.remove('d-none');
}

function updateUniqueIDToDropDiv() {
    const value = document.getElementById('uniqueIDToDropInput').value;

    switch (value) {
        case -2:
        case '-2':
            break;
        case -1:
        case '-1':
            prevButton.classList.remove('btn-pressed');
            prevButton = document.getElementById('uniqueIDToDropNothingInput');
            prevButton.classList.add('btn-pressed');
            break;
        default: {
            prevButton.classList.remove('btn-pressed');
            prevButton = document.getElementById('uniqueIDToDropCustomInput');
            prevButton.classList.add('btn-pressed');

            const numberInput = document.getElementById('uniqueIDToDropInput');
            numberInput.classList.remove('hide');
            numberInput.readOnly = false;
            numberInput.required = true;
            break;
        }
    }
}

// The files of a block are named after their face, like "up_normal.dds"
function addFilesToTextureSlots(files, slots) {
    const faces = textureFaces[textureAmount].map(([face]) => face);
    for (const file of files) {
        const face = getFileName(file).toLowerCase().split(/[_.]/)[0];
        const index = faces.indexOf(face);
        if (index != -1) slots[index] = file;
    }
}

/**
 * Handle block preview generation. The preview is made again whenever
 * the textures change, shortly after the last change.
 */
const blockPreviewDiv = document.getElementById('blockPreviewDiv');
let previewTimeout;
let isGeneratingPreview = false;
let previewedTextures = '[]';
let previewTexturePaths;
let previewHeightPaths;
// Shown in place of the preview when there is none
let previewMessage = 'Add a regular texture to see the preview';

// The textures are also converted in the background meanwhile, so the
// block is generated much faster
function schedulePreview() {
    updateNoHardEdgesVisibility();
    clearTimeout(previewTimeout);
    previewTimeout = setTimeout(() => {
        updatePreview();
        window.call.prepareTextures(Object.fromEntries(textureKinds.map(kind =>
            [kind, getTextures(kind).map(([filePath]) => filePath)])));
    }, 300);
}

function getRegularTextures() {
    return getTextures('regular');
}

// The height maps are only shown when there is one for each face
function getPreviewHeightTextures() {
    const heightTextures = getTextures('height');
    return heightTextures.length == textureAmount ? heightTextures : [];
}

// Hard edges are only between different textures, so the option is only
// shown when there are several
function updateNoHardEdgesVisibility() {
    document.getElementById('noHardEdgesDiv').classList.toggle('d-none', textureAmount <= 1);
}

function hasNoHardEdges() {
    return document.getElementById('noHardEdgesInput').checked && textureAmount > 1;
}

function getPreviewTexturesKey() {
    return JSON.stringify([getRegularTextures(), getPreviewHeightTextures()]);
}

async function updatePreview() {
    // Only one preview is made at a time. When it is done, it checks
    // whether the textures have changed again in the meantime.
    if (isGeneratingPreview) return;

    const textures = getRegularTextures();
    const heightTextures = getPreviewHeightTextures();
    const texturesKey = getPreviewTexturesKey();
    if (texturesKey == previewedTextures) return;
    previewedTextures = texturesKey;

    // The preview needs a valid amount of textures, one per face.
    const invalidMessage = getInvalidTexturesMessage(textures);
    if (invalidMessage != undefined) {
        previewTexturePaths = undefined;
        previewMessage = invalidMessage;
        showPreview();
        updateFinalBlockPreview();
        return;
    }

    isGeneratingPreview = true;
    showPreviewMessage('Generating preview...');
    updateFinalBlockPreview();

    const previewDDS = await window.call.generatePreviewBlock(textures, heightTextures);
    isGeneratingPreview = false;

    // Newer textures are previewed instead
    if (getPreviewTexturesKey() != texturesKey) {
        updatePreview();
        return;
    }

    previewTexturePaths = previewDDS == undefined ? undefined : getPreviewTexturePaths(previewDDS.textures);
    previewMessage = 'The preview could not be made';
    previewHeightPaths = previewDDS == undefined || heightTextures.length == 0 ? [] : getPreviewTexturePaths(previewDDS.heights);
    showPreview();
    updateFinalBlockPreview();
}

// The animation settings only change how the preview is shown
document.getElementById('makeAnimatedInput').addEventListener('change', showPreview);
document.getElementById('animationSpeedSliderInput').addEventListener('change', showPreview);
document.getElementById('animationSpeedNumberInput').addEventListener('change', showPreview);
document.getElementById('noHardEdgesInput').addEventListener('change', showPreview);

// The preview is as large as fits in its space, so it is drawn again when
// that changes, like when the textures step is first shown
new ResizeObserver(() => {
    const canvas = blockPreviewDiv.querySelector('canvas');
    if (getPreviewSize() != (canvas?.width ?? 0)) showPreview();
}).observe(blockPreviewDiv);

// Until textures are added, it says to add them
showPreview();

function getInvalidTexturesMessage(textures) {
    if (textures.length == 0) return 'Add a regular texture to see the preview';
    if (textures.length != textureAmount) return 'Add a regular texture for every face to see the preview';
    return undefined;
}

function showPreviewMessage(text) {
    const message = document.createElement('span');
    message.classList.add('outline', 'preview-message');
    message.innerText = text;
    blockPreviewDiv.replaceChildren(message);
}

function getPreviewSize() {
    return Math.floor(Math.min(blockPreviewDiv.clientWidth, blockPreviewDiv.clientHeight));
}

function showPreview() {
    if (isGeneratingPreview) return;
    if (previewTexturePaths == undefined) {
        showPreviewMessage(previewMessage);
        return;
    }

    const size = getPreviewSize();
    if (size == 0) {
        blockPreviewDiv.replaceChildren();
        return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    blockPreviewDiv.replaceChildren(canvas);

    let isAnimated = document.getElementById('makeAnimatedInput').checked;
    let animationSpeed = document.getElementById('animationSpeedNumberInput').value;

    loadCanvas(canvas, previewTexturePaths, isAnimated, animationSpeed, true, previewHeightPaths, !hasNoHardEdges());
}

/**
 * Handle the previews in the finalization step. They show the block and its
 * recipe the same way as in Manage Blocks.
 */
const finalPreviewsDiv = document.getElementById('finalPreviewsDiv');
const finalBlockPreviewDiv = document.getElementById('finalBlockPreviewDiv');
const finalRecipePreviewDiv = document.getElementById('finalRecipePreviewDiv');

// The recipe is wider than it is tall, like in Manage Blocks, and neither
// gets smaller than the smallest previews there
const FINAL_RECIPE_PREVIEW_ASPECT = 1.5;
const MIN_FINAL_PREVIEW_SIZE = 150;
let finalPreviewSize = MIN_FINAL_PREVIEW_SIZE;

// The previews are as tall as the space left down to the bottom of the step,
// unless they would then not fit next to each other
function measureFinalPreviewSize() {
    const scrollArea = finalPreviewsDiv.parentElement;
    const scrollAreaStyle = getComputedStyle(scrollArea);
    const style = getComputedStyle(finalPreviewsDiv);
    const caption = finalPreviewsDiv.querySelector('.preview-caption');
    const captionStyle = getComputedStyle(caption);

    const bottom = scrollArea.getBoundingClientRect().bottom - parseFloat(scrollAreaStyle.paddingBottom)
        - parseFloat(scrollAreaStyle.borderBottomWidth);
    const height = bottom - finalPreviewsDiv.getBoundingClientRect().top
        - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)
        - parseFloat(style.borderTopWidth) - parseFloat(style.borderBottomWidth)
        - caption.offsetHeight - parseFloat(captionStyle.marginTop);
    // The space on the sides changes with their size, so it's counted below
    const width = finalPreviewsDiv.clientWidth;

    // They are spread out evenly by how large they look, which needs them
    // to be a quarter of their height apart, and from the sides (see the
    // .block-previews style)
    const size = Math.min(height, width / 2.75);
    return Math.max(Math.floor(size), MIN_FINAL_PREVIEW_SIZE);
}

function setFinalPreviewSize(size) {
    finalPreviewSize = size;
    finalBlockPreviewDiv.style.width = `${size}px`;
    finalBlockPreviewDiv.style.height = `${size}px`;
    finalRecipePreviewDiv.style.width = `${Math.round(size * FINAL_RECIPE_PREVIEW_ASPECT)}px`;
    finalRecipePreviewDiv.style.height = `${size}px`;
    finalPreviewsDiv.style.setProperty('--preview-size', `${size}px`);
}

// They are made again in their new size when the window is resized
new ResizeObserver(() => {
    if (!isFinalStepShown() || measureFinalPreviewSize() == finalPreviewSize) return;
    showFinalPreviews();
}).observe(finalPreviewsDiv.parentElement);

// Clicking the recipe shows it large, like the block preview
finalRecipePreviewDiv.addEventListener('click', () => {
    const recipe = getRecipe();
    if (!isCraftable(recipe)) return;

    showLargeView(finalRecipePreviewDiv, () => {
        const largeDiv = document.createElement('div');
        largeDiv.classList.add('large-recipe-preview');
        loadFinalRecipePreview(largeDiv, recipe);
        return largeDiv;
    });
});

// The preview may change while the finalization step is shown, like when it
// is done being made after going there
function updateFinalBlockPreview() {
    if (isFinalStepShown()) showFinalBlockPreview();
}

function isFinalStepShown() {
    return !document.getElementById('step-4').classList.contains('d-none');
}

function showFinalPreviews() {
    setFinalPreviewSize(measureFinalPreviewSize());
    showFinalBlockPreview();
    showFinalRecipePreview();
}

// Removing them also stops them and frees their WebGL contexts
function removeFinalPreviews() {
    finalBlockPreviewDiv.replaceChildren();
    finalRecipePreviewDiv.replaceChildren();
}

function showFinalBlockPreview() {
    if (isGeneratingPreview || previewTexturePaths == undefined) {
        const message = document.createElement('span');
        message.classList.add('outline', 'preview-message');
        message.innerText = isGeneratingPreview ? 'Generating preview...' : previewMessage;
        finalBlockPreviewDiv.replaceChildren(message);
        return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = finalPreviewSize;
    canvas.height = finalPreviewSize;
    finalBlockPreviewDiv.replaceChildren(canvas);

    const isAnimated = document.getElementById('makeAnimatedInput').checked;
    const animationSpeed = document.getElementById('animationSpeedNumberInput').value;

    loadCanvas(canvas, previewTexturePaths, isAnimated, animationSpeed, true, previewHeightPaths, !hasNoHardEdges());
}

function showFinalRecipePreview() {
    const recipe = getRecipe();
    finalRecipePreviewDiv.classList.toggle('enlargeable', isCraftable(recipe));
    loadFinalRecipePreview(finalRecipePreviewDiv, recipe);
}

function isCraftable(recipe) {
    return Array.isArray(recipe?.Array) && recipe.Array.some(material => material != 11);
}

// The recipe, turning by itself like the block preview. Blocks without a
// recipe can't be crafted, which is said instead.
function loadFinalRecipePreview(div, recipe) {
    if (!isCraftable(recipe)) {
        const textElem = document.createElement('span');
        textElem.innerHTML = '<em>Not craftable</em>';
        div.replaceChildren(textElem);
        return;
    }

    const preview = createRecipePreview(div, undefined, undefined,
        material => getMaterialName(material, 1), blockTexturesUrl, { isInteractive: false });
    preview.setRecipe(recipe);
}

// The texture for each side of the cube. The textures can be in the folder
// of an edited block, so the paths are made into URLs.
function getPreviewTexturePaths(texturesDDS) {
    texturesDDS = Object.fromEntries(Object.entries(texturesDDS).map(([name, filePath]) => [name, toFileUrl(filePath)]));
    let texturePaths = [];

    switch (Object.keys(texturesDDS).length) {
        case 1:
            for (let i = 0; i < 6; i++) {
                texturePaths[i] = texturesDDS.all;
            }
            break;
        case 2:
            texturePaths[0] = texturesDDS.sides;
            texturePaths[1] = texturesDDS.sides;
            texturePaths[2] = texturesDDS.updown;
            texturePaths[3] = texturesDDS.updown;
            texturePaths[4] = texturesDDS.sides;
            texturePaths[5] = texturesDDS.sides;
            break;
        case 3:
            texturePaths[0] = texturesDDS.sides;
            texturePaths[1] = texturesDDS.sides;
            texturePaths[2] = texturesDDS.up;
            texturePaths[3] = texturesDDS.down;
            texturePaths[4] = texturesDDS.sides;
            texturePaths[5] = texturesDDS.sides;
            break;
        case 6:
            texturePaths[0] = texturesDDS.front;
            texturePaths[1] = texturesDDS.back;
            texturePaths[2] = texturesDDS.up;
            texturePaths[3] = texturesDDS.down;
            texturePaths[4] = texturesDDS.right;
            texturePaths[5] = texturesDDS.left;
            break;
    }

    return texturePaths;
}

/**
 * Handle all tooltips
 */
document.querySelectorAll('div.tooltip').forEach((tooltipDiv) => {
    const tooltipContent = tooltipDiv.querySelector('div.tooltip-content');


    tooltipDiv.addEventListener('mouseover', (e) => {
        let formPart = tooltipDiv.parentElement.parentElement.parentElement;

        const width = formPart.clientWidth;

        tooltipContent.style.width = (width * 0.5) + "px";

        const offset = tooltipDiv.offsetLeft;

        if (offset + width * 0.5 + 22 > width) {
            tooltipContent.style.left = width - (offset + width * 0.5 + 27) + 'px';
        } else {
            tooltipContent.style.left = '';
        }

        tooltipContent.style.top = '';
        tooltipContent.style.bottom = '';
        tooltipContent.classList.remove('d-none');

        // Shown above the question mark instead if there isn't room below it,
        // as the scrolling area it is in would cut it off
        const scrollArea = tooltipDiv.parentElement.parentElement;
        if (tooltipContent.getBoundingClientRect().bottom > scrollArea.getBoundingClientRect().bottom) {
            tooltipContent.style.top = 'auto';
            tooltipContent.style.bottom = '25px';
        }
    });

    tooltipDiv.addEventListener('mouseout', (e) => {
        tooltipContent.classList.add('d-none');
    });
})

/**
 * Handle animation property stuff
 */
const animationSpeedSliderInput = document.getElementById('animationSpeedSliderInput');
const animationSpeedNumberInput = document.getElementById('animationSpeedNumberInput');

animationSpeedSliderInput.addEventListener('input', function (e) {
    animationSpeedNumberInput.value = e.target.value;

    if (animationSpeedNumberInput.classList.contains('highlight-invalid')) {
        animationSpeedNumberInput.classList.remove('highlight-invalid');
    }
});

animationSpeedNumberInput.addEventListener('input', function (e) {
    animationSpeedSliderInput.value = e.target.value;
    updateSliderFill(animationSpeedSliderInput);
});

document.getElementById('makeAnimatedInput').addEventListener('change', (e) => {
    if (e.target.checked) {
        enableAnimation();
    } else {
        disableAnimation();
    }
})

function enableAnimation() {
    animationSpeedSliderInput.classList.remove('d-none');
    animationSpeedNumberInput.classList.remove('d-none');
}

function disableAnimation() {
    animationSpeedSliderInput.classList.add('d-none');
    animationSpeedNumberInput.classList.add('d-none');
}