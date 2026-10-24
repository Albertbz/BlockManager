import { loadCanvas } from "./blockPreview.js";
import { createRecipePreview } from "./recipePreview.js";
import { createRecipeBuilder } from "./recipeBuilder.js";
import { getMaterialName } from "./recipeMaterials.js";
import "./sliderScroll.js";
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
 * Texture choosing mechanism.
*/
const textureFiles = {
    regular: [],
    small: [],
    normal: [],
    glow: [],
    height: []
};

const loadingTemp = loadTemp();

function addEventListenersToTextureSelectors() {
    document.querySelectorAll('div.texture-selector-parent').forEach((textureSelectorDiv, i) => {
        let textureFilesInput = textureSelectorDiv.previousElementSibling;

        updateValidity(textureSelectorDiv);

        const type = Object.keys(textureFiles)[i];
        addTexturesToDiv(textureFiles[type], textureSelectorDiv);

        textureFilesInput.addEventListener('change', (e) => {
            addTexturesToDiv(textureFiles[type], textureSelectorDiv);
        })
    });
}

function removeTexturesInDiv(div) {
    const textureChildDivs = div.querySelectorAll('div.texture-selector-child');
    for (let i = 0; i < textureChildDivs.length; i++) {
        div.removeChild(textureChildDivs[i]);
    }
}

function addTexturesToDiv(fileArray, selectorDiv) {
    const input = selectorDiv.previousElementSibling;
    removeTexturesInDiv(selectorDiv);

    const newFiles = [...input.files].map(item => item.path);
    fileArray.push(...newFiles);

    // Remove any overflowing textures
    if (fileArray.length > 6) {
        fileArray.splice(6, fileArray.length);
    }

    const amountOfTextures = fileArray.length;
    for (let i = 0; i < amountOfTextures; i++) {
        const div = document.createElement('div');
        const label = document.createElement('label');
        const textureImg = document.createElement('img');
        const crossImg = document.createElement('img');
        const select = createSelect(amountOfTextures, i);
        select.addEventListener('change', (e) => {
            updateValidity(selectorDiv);
            removeInvalidHighlight(input);
            schedulePreview();
        });

        div.classList.add('texture-selector-child');
        div.appendChild(label);
        div.appendChild(select);

        label.classList.add('form-label', 'texture-label')
        label.appendChild(textureImg);
        label.appendChild(crossImg);

        setTextureImgSrc(textureImg, fileArray[i]);
        textureImg.dataset.path = fileArray[i];
        textureImg.classList.add('texture-img');
        textureImg.addEventListener('click', (e) => {
            fileArray.splice(i, 1);
            input.value = null;
            addTexturesToDiv(fileArray, selectorDiv);
            removeInvalidHighlight(input);
        })

        crossImg.src = "./images/trash-can.png";
        crossImg.classList.add('trash-can');

        if (amountOfTextures >= 6) {
            selectorDiv.lastElementChild.classList.add('d-none');
        }
        else {
            selectorDiv.lastElementChild.classList.remove('d-none');
        }

        selectorDiv.insertBefore(div, selectorDiv.lastElementChild);
    }

    updateValidity(selectorDiv);

    schedulePreview();
}

function updateValidity(textureDiv) {
    const required = textureDiv.dataset.required;
    const input = textureDiv.previousElementSibling;
    const amountOfTextures = textureDiv.querySelectorAll('div.texture-selector-child').length;
    if (required) {
        switch (amountOfTextures) {
            case 1:
                input.setCustomValidity("");
                break;
            case 2:
                input.setCustomValidity("");
                break;
            case 3:
                input.setCustomValidity("");
                break;
            case 6:
                input.setCustomValidity("");
                break;
            default:
                input.setCustomValidity("Invalid field.");
        };
        if (!hasSameAmountAsRegular(amountOfTextures, true)) {
            input.setCustomValidity("Invalid field.");
        }
    }
    else {
        if (!hasSameAmountAsRegular(amountOfTextures, false)) {
            input.setCustomValidity("Invalid field.");
        }
        else {
            input.setCustomValidity("");
        }
    }

    // Two textures for the same face would overwrite each other.
    if (hasDuplicateFaces(textureDiv)) {
        input.setCustomValidity("Each texture must be for a different face.");
    }
}

function hasDuplicateFaces(textureDiv) {
    const faces = [...textureDiv.querySelectorAll('div.texture-selector-child select')]
        .map(select => select.value);
    return new Set(faces).size != faces.length;
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

function hasSameAmountAsRegular(amountOfTextures, required) {
    const regularTexturesDiv = document.getElementById('regularTexturesDiv');
    const textureChildren = regularTexturesDiv.querySelectorAll('div.texture-selector-child');
    const amountOfTextureChildren = textureChildren.length;

    if (required) {
        return amountOfTextureChildren == amountOfTextures;
    }
    else {
        return ((amountOfTextureChildren == amountOfTextures) && amountOfTextures > 0)
            || amountOfTextures == 0;
    }
}

function hasInvalidInputs(button) {
    document.querySelectorAll('div.texture-selector-parent').forEach(function (div) {
        updateValidity(div);
    });

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

function createSelect(amountOfTextures, textureNum) {
    const select = document.createElement('select');

    let options = [];

    switch (amountOfTextures) {
        case 1:
            options[0] = createOption('all', 'All');
            break;
        case 2:
            options[0] = createOption('sides', 'Sides');
            options[1] = createOption('updown', 'Up/down');
            break;
        case 3:
            options[0] = createOption('sides', 'Sides');
            options[1] = createOption('up', 'Up');
            options[2] = createOption('down', 'Down')
            break;
        case 6:
            options[0] = createOption('up', 'Up');
            options[1] = createOption('down', 'Down');
            options[2] = createOption('left', 'Left');
            options[3] = createOption('right', 'Right');
            options[4] = createOption('front', 'Front');
            options[5] = createOption('back', 'Back');
            break;
        default:
            for (let i = 0; i < amountOfTextures; i++) {
                options[i] = createOption('invalid', 'Invalid');
            }
    }

    for (let i = 0; i < options.length; i++) {
        select.appendChild(options[i]);
    }

    select.value = options[textureNum].value;
    select.classList.add('form-control', 'mb-2');

    return select;
}

function createOption(value, innerText) {
    const option = document.createElement('option');
    option.value = value;
    option.innerText = innerText;
    return option;
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

    const recipePropertiesRaw = recipePropertiesTextarea.value;
    let recipeProperties;
    try {
        recipeProperties = JSON.parse(recipePropertiesRaw.replace('"Recipe": ', '').replace('},', '}'));
    } catch (err) {
        console.error(err);
    }

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
    const makeAnimated = formData.get('makeAnimated') == 'on' ? true : false;

    // Get all textures and corresponding mode
    const amountOfRegularTextures = document.getElementById('regularTexturesDiv').childElementCount - 1;
    const mode = amountOfRegularTextures == 6 ? 4 : amountOfRegularTextures;
    const regularTextures = getTexturesSrcAndValue(document.getElementById('textureFilesInput'));
    const smallTextures = getTexturesSrcAndValue(document.getElementById('smallTextureFilesInput'));
    const normalTextures = getTexturesSrcAndValue(document.getElementById('normalTextureFilesInput'));
    const hasNormalTextures = normalTextures.length != 0;
    const glowTextures = getTexturesSrcAndValue(document.getElementById('glowTextureFilesInput'));
    const hasGlowTextures = glowTextures.length != 0;
    const heightTextures = getTexturesSrcAndValue(document.getElementById('heightTextureFilesInput'));
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

function getTexturesSrcAndValue(textureInput) {
    const selectorParent = textureInput.nextElementSibling;
    const selectorChildren = selectorParent.querySelectorAll('div.texture-selector-child');

    let texturesSrcAndValue = [];
    for (let i = 0; i < selectorChildren.length; i++) {
        texturesSrcAndValue[i] = getTextureSrcAndValue(selectorChildren[i]);
    }

    return texturesSrcAndValue;
}

function getTextureSrcAndValue(child) {
    const img = child.firstElementChild.firstElementChild;
    const select = child.lastElementChild;
    return [img.dataset.path, select.value];
}

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
    const textures = [...document.querySelectorAll('input[type=file]')]
        .filter(input => input.nextElementSibling?.classList.contains('texture-selector-parent'))
        .map(getTexturesSrcAndValue);

    return JSON.stringify([fields, textures]);
}


/**
 * Load block in temp if there is one.
 */
async function loadTemp() {
    const tempBlock = await window.call.getTemp();
    const isEditing = tempBlock != undefined;
    if (isEditing) {
        const formElem = document.forms['blockForm'];

        // Set all properties
        formElem.elements['name'].value = tempBlock.properties.Name;
        formElem.elements['creatorName'].value = tempBlock.properties.CreatorName;
        folderNameInputs.forEach(validateFolderNameInput);
        formElem.elements['uniqueID'].value = tempBlock.properties.UniqueID;
        formElem.elements['yieldSlider'].value = tempBlock.properties.Yield;
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
        if (tempBlock.properties.AnimationSpeed != undefined) {
            formElem.elements['makeAnimated'].checked = true;
            formElem.elements['animationSpeedSlider'].value = tempBlock.properties.AnimationSpeed;
            formElem.elements['animationSpeedNumber'].value = tempBlock.properties.AnimationSpeed;
            enableAnimation();
        }

        // Set textures.
        const textures = await window.call.getTempTextures();
        addFilesToTextureFiles(textures.regular, textureFiles.regular);
        addFilesToTextureFiles(textures.small, textureFiles.small);
        addFilesToTextureFiles(textures.normal, textureFiles.normal);
        addFilesToTextureFiles(textures.glow, textureFiles.glow);
        addFilesToTextureFiles(textures.height, textureFiles.height);

        // Set recipe. Blocks without one keep the default (not craftable).
        if (tempBlock.properties.Recipe != undefined) {
            const recipePropertiesJSON = JSON.stringify({ Recipe: tempBlock.properties.Recipe }, null, 4);
            formElem.elements['recipeProperties'].value = recipePropertiesJSON.substring(2, recipePropertiesJSON.length - 2).replace('    ', '');
            updateRecipeMaterials();
        }

        // Change submit button text.
        document.getElementById('submitButton').innerText = 'Save changes';

        // Show save location (existing location) and put
        // path in it.
        showExistingLocation();

        const existingLocationInput = document.getElementById('existingLocationInput');
        existingLocationInput.value = tempBlock.path.substring(0, tempBlock.path.lastIndexOf("\\"));

        updateSaveButton(existingLocationInput);

        existingLocationInput.addEventListener('click', (e) => updateSaveButton(existingLocationInput));
    };

    addEventListenersToTextureSelectors();
    handleDiscardBlockButtons(isEditing);
}

function showExistingLocation() {
    document.getElementById('existingLocationLabel').classList.remove('d-none');
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

function addFilesToTextureFiles(newFiles, existingFiles) {
    switch (newFiles.length) {
        case 1:
            existingFiles.push(newFiles[0])
            break;
        case 2:
            existingFiles.push(newFiles[0]);
            existingFiles.push(newFiles[1]);
            break;
        case 3:
            existingFiles.push(newFiles[1]);
            existingFiles.push(newFiles[2]);
            existingFiles.push(newFiles[0]);
            break;
        case 6:
            existingFiles.push(newFiles[5]);
            existingFiles.push(newFiles[1]);
            existingFiles.push(newFiles[3]);
            existingFiles.push(newFiles[4]);
            existingFiles.push(newFiles[2]);
            existingFiles.push(newFiles[0]);
            break;
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

function schedulePreview() {
    clearTimeout(previewTimeout);
    previewTimeout = setTimeout(updatePreview, 300);
}

function getRegularTextures() {
    return getTexturesSrcAndValue(document.getElementById('textureFilesInput'));
}

async function updatePreview() {
    // Only one preview is made at a time. When it is done, it checks
    // whether the textures have changed again in the meantime.
    if (isGeneratingPreview) return;

    const textures = getRegularTextures();
    const texturesKey = JSON.stringify(textures);
    if (texturesKey == previewedTextures) return;
    previewedTextures = texturesKey;

    // The preview needs a valid amount of textures, one per face.
    if (![1, 2, 3, 6].includes(textures.length) || hasDuplicateFaces(document.getElementById('regularTexturesDiv'))) {
        previewTexturePaths = undefined;
        blockPreviewDiv.replaceChildren();
        return;
    }

    isGeneratingPreview = true;
    const message = document.createElement('span');
    message.classList.add('outline', 'preview-message');
    message.innerText = 'Generating preview...';
    blockPreviewDiv.replaceChildren(message);

    const texturesDDS = await window.call.generatePreviewBlock(textures);
    isGeneratingPreview = false;

    // Newer textures are previewed instead
    if (JSON.stringify(getRegularTextures()) != texturesKey) {
        updatePreview();
        return;
    }

    previewTexturePaths = texturesDDS == undefined ? undefined : getPreviewTexturePaths(texturesDDS);
    showPreview();
}

// The animation settings only change how the preview is shown
document.getElementById('makeAnimatedInput').addEventListener('change', showPreview);
document.getElementById('animationSpeedSliderInput').addEventListener('change', showPreview);
document.getElementById('animationSpeedNumberInput').addEventListener('change', showPreview);

// The preview is as large as fits in its space, so it is drawn again when
// that changes, like when the textures step is first shown
new ResizeObserver(() => {
    const canvas = blockPreviewDiv.querySelector('canvas');
    if (getPreviewSize() != (canvas?.width ?? 0)) showPreview();
}).observe(blockPreviewDiv);

function getPreviewSize() {
    return Math.floor(Math.min(blockPreviewDiv.clientWidth, blockPreviewDiv.clientHeight));
}

function showPreview() {
    if (isGeneratingPreview) return;
    const size = getPreviewSize();
    if (previewTexturePaths == undefined || size == 0) {
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

    loadCanvas(canvas, previewTexturePaths, isAnimated, animationSpeed);
}

// The texture for each side of the cube
function getPreviewTexturePaths(texturesDDS) {
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