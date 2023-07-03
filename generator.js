import { loadCanvas } from "./blockPreview.js";

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
 * Texture choosing mechanism.
*/
const textureFiles = {
    regular: [],
    small: [],
    normal: [],
    glow: []
};

loadTemp();

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

        div.classList.add('texture-selector-child');
        div.appendChild(label);
        div.appendChild(select);

        label.classList.add('form-label', 'texture-label')
        label.appendChild(textureImg);
        label.appendChild(crossImg);

        textureImg.src = fileArray[i];
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
setDefaultRecipePreview();
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

function updateRecipeMaterials() {
    const recipePropertiesTextarea = document.getElementById('recipePropertiesTextarea');
    const recipeMaterialsDiv = document.getElementById('recipeMaterialsDiv');

    const recipePropertiesRaw = recipePropertiesTextarea.value;
    const recipeProperties = JSON.parse(recipePropertiesRaw.replace('"Recipe": ', '').replace('},', '}'));

    const materialsArray = removeInvalidMaterials(recipeProperties.Array);

    const amountElem = document.createElement('span');
    amountElem.classList.add('outline');
    amountElem.innerHTML = `<em>Total amount:</em> ${materialsArray.length}`;

    const materialsElem = document.createElement('span');
    materialsElem.classList.add('outline');
    let materials = getMaterials(materialsArray);
    materialsElem.innerHTML = `<em>Specific materials:</em> ${materials}`;

    recipeMaterialsDiv.replaceChildren(amountElem, materialsElem);
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

function getMaterialName(materialAsNumber, amount) {
    const isPlural = amount > 1;
    switch (materialAsNumber) {
        case 1:
            return 'grass';
        case 2:
            return 'dirt';
        case 6:
            return 'dark wood';
        case 10:
            return 'sand';
        case 22:
            return isPlural ? 'copper nuggets' : 'copper nugget';
        case 23:
            return isPlural ? 'gold nuggets' : 'gold nugget';
        case 24:
            return 'coal';
        case 32:
            return 'light wood';
        case 33:
            return isPlural ? 'light wood planks' : 'light wood plank';
        case 34:
            return isPlural ? 'dark wood planks' : 'dark wood plank';
        case 35:
            return 'stone';
        case 38:
            return 'blue dye';
        case 41:
            return 'green dye';
        case 46:
            return 'wallstone';
        case 47:
            return 'flagstone';
        case 48:
            return 'red dye';
        case 52:
            return 'wood scaffolding';
        case 62:
            return 'rainbow dye';
        case 64:
            return 'white dye';
        case 68:
            return isPlural ? 'crystals' : 'crystal';
        case 72:
            return 'dry grass';
        case 73:
            return isPlural ? 'iron ingots' : 'iron ingot';
        case 89:
            return isPlural ? 'glass blocks' : 'glass block';
        case 91:
            return isPlural ? 'glass ingots' : 'glass ingot';
        case 96:
            return 'blue shimmerstone';
        case 97:
            return 'gold shimmerstone';
        case 98:
            return 'white shimmerstone';
        case 99:
            return 'green shimmerstone';
        case 100:
            return 'blue starstone';
        case 101:
            return 'gold starstone';
        case 102:
            return 'green starstone';
        case 103:
            return 'blue shimmertile';
        case 104:
            return 'gold shimmertile';
        case 105:
            return 'white shimmertile';
        case 106:
            return 'green shimmertile';
        case 112:
            return 'cloakstone';
        case 113:
            return isPlural ? 'cloakstone nuggets' : 'cloakstone nugget';
        default:
            return 'MISSING (please let me know)'
    }
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
 * Handle recipe picture preview
 */
document.getElementById('uploadRecipePictureInput').addEventListener('change', function (e) {
    const recipePictureImg = document.getElementById('recipePictureImg')

    const recipePictureFile = e.target.files[0];

    recipePictureImg.src = recipePictureFile.path;
})

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

    // Get recipe properties and picture
    const recipePropertiesRaw = formData.get('recipeProperties');
    const recipeProperties = JSON.parse(recipePropertiesRaw.replace('"Recipe": ', '').replace('},', '}'));
    const recipePictureImgSrc = document.getElementById('recipePictureImg').src.replace('file:///', '');

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
            WithGlowMap: hasGlowTextures
        },
        UniqueIDToDrop: uniqueIDToDrop,
        AllowMove: allowMove,
        AllowCrystalAssistedBlockPlacement: allowCrystalPlacement
    }

    // If it has a category name
    if (categoryName.length != 0) {
        propertiesFileContent.CategoryName = categoryName;
    }

    // If it is animated
    if (makeAnimated) {
        const animationSpeed = formData.get('animationSpeedNumber');
        propertiesFileContent.AnimationSpeed = animationSpeed;
    }

    // Delete old block if editing
    const tempBlock = await window.call.getTemp();
    const isEditing = tempBlock != undefined;
    if (isEditing) {
        await window.call.deleteBlockInTemp();
    }

    // Format location
    if (saveLocation == undefined) {
        return;
    }

    const location = `${saveLocation}\\${blockName}.${creatorName}.${uniqueID}`;
    // Give data to main, have it make the block
    const response = await window.call.generateCustomBlock(location, propertiesFileContent, recipePictureImgSrc,
        regularTextures, smallTextures, normalTextures, glowTextures);

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
    const fixedImgSrc = img.src.replace('file:///', '');
    return [fixedImgSrc, select.value];
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
putPathToBlocksFolderInButton(document.getElementById('blocksFolderInput'));

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
populateModFolderPicker();

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

    input.addEventListener('click', async (e) => {
        if (prevSaveButton == e.target) return;

        prevSaveButton.classList.remove('btn-pressed');
        e.target.classList.add('btn-pressed');
        const update = e.target.nextElementSibling.value;
        saveLocation = (await window.call.getModsFolderPath()) + `\\ModFolders\\${e.target.value}\\${update}\\Blocks`;

        prevSaveButton = e.target;
    })

    div.appendChild(input);
    div.appendChild(select);

    return div;
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
 * Handle Discard block buttons
 */
function handleDiscardBlockButtons() {
    document.querySelectorAll('button.discard').forEach(button => {
        button.addEventListener('click', (e) => {
            window.call.loadManageBlocks();
        });
    });
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

        // Set recipe.
        const recipePropertiesJSON = JSON.stringify({ Recipe: tempBlock.properties.Recipe }, null, 4);
        formElem.elements['recipeProperties'].value = recipePropertiesJSON.substring(2, recipePropertiesJSON.length - 2).replace('    ', '');
        updateRecipeMaterials();
        document.getElementById('recipePictureImg').src = './temp/recipePreview.png';

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
    handleDiscardBlockButtons();
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
        default:
            prevButton.classList.remove('btn-pressed');
            prevButton = document.getElementById('uniqueIDToDropCustomInput');
            prevButton.classList.add('btn-pressed');
            document.getElementById('uniqueIDToDropInput').classList.remove('hide');
            break;
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
 * Handle block preview generation
 */
document.getElementById('generatePreview').addEventListener('click', async (e) => {
    const blockPreviewDiv = document.getElementById('blockPreviewDiv');
    if (blockPreviewDiv.firstElementChild) blockPreviewDiv.firstElementChild.remove();

    const textures = getTexturesSrcAndValue(document.getElementById('textureFilesInput'));

    if (textures.length == 0) return;

    const texturesDDS = await window.call.generatePreviewBlock(textures);

    let texturePaths = [];

    console.log(texturesDDS)

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

    console.log(texturePaths)
    const canvas = document.createElement('canvas');
    canvas.width = 135;
    canvas.height = 135;
    blockPreviewDiv.appendChild(canvas);

    loadCanvas(canvas, texturePaths);
})

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

        tooltipContent.classList.remove('d-none');
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