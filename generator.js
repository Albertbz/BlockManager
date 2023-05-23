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
        formStepHeader.classList.remove("form-stepper-active", "form-stepper-completed");
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
            formStepCircle.classList.add("form-stepper-completed");
        }
    }
};
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
        const stepNumber = parseInt(formNavigationBtn.getAttribute("step_number"));
        /**
         * Call the function to navigate to the target form step.
         */
        navigateToFormStep(stepNumber);
    });
});

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

    const currentStep = button.parentElement.parentElement.previousElementSibling;
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

async function setDefaultRecipePreview() {
    const recipePropertiesTextarea = document.getElementById('recipePropertiesTextarea');
    const defaultRecipeFileContent = await window.call.getDefaultRecipeFileContent();
    recipePropertiesTextarea.value = defaultRecipeFileContent;
}

// Manually upload
document.getElementById('uploadRecipeInput').addEventListener('change', function (e) {
    const recipePropertiesFile = e.target.files[0];
    const reader = new FileReader();

    const recipePropertiesTextarea = document.getElementById('recipePropertiesTextarea');

    reader.addEventListener('load', function () {
        recipePropertiesTextarea.value = reader.result;
    });

    reader.readAsText(recipePropertiesFile);
});

// Load from appdata
document.getElementById('loadRecipeInput').addEventListener('click', async function () {
    const recipePropertiesTextarea = document.getElementById('recipePropertiesTextarea');
    const generatedRecipeFileContent = await window.call.getGeneratedRecipeFileContent();
    recipePropertiesTextarea.value = generatedRecipeFileContent;
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
    const yield = parseInt(formData.get('yieldNumber'));
    const similarTo = parseInt(formData.get('similarTo'));
    const categoryName = formData.get('categoryName');
    const uniqueIDToDrop = parseInt(formData.get('uniqueIDToDrop'));
    const allowMove = formData.get('allowMove') == 'on' ? true : false;
    const allowCrystalPlacement = formData.get('allowCrystalPlacement') == 'on' ? true : false;

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
        Yield: yield,
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
    if (categoryName.length != 0) propertiesFileContent.CategoryName = categoryName;

    // Delete old block if editing
    const tempBlock = window.call.getTemp();
    const isEditing = tempBlock != undefined;
    if (isEditing) {
        await window.call.deleteBlockInTemp();
    }

    // Give data to main, have it make the block
    const location = `${saveLocation}\\${blockName}.${creatorName}.${uniqueID}`;
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


        const numberInput = button.parentElement.lastElementChild;
        if (button.value == 'Custom') {
            numberInput.readOnly = false;
            numberInput.required = true;
            numberInput.value = '';
        }
        else {
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
    input.addEventListener('focusout', function(e) {
        input.value = input.value.trim();
    });
})

/**
 * Handle where to save
 */
let prevSaveButton = document.getElementById('blocksFolderInput');
let saveLocation;

document.getElementById('blocksFolderInput').addEventListener('click', (e) => updateSaveButton(e.target));

function updateSaveButton(button) {
    if (prevSaveButton == button) return;

    prevSaveButton.classList.remove('btn-pressed');
    button.classList.add('btn-pressed');
    saveLocation = button.value;

    prevSaveButton = button;
}

/**
 * Put path to Blocks folder in button
 */
putPathToBlocksFolderInButton(document.getElementById('blocksFolderInput'));

async function putPathToBlocksFolderInButton(button) {
    const modsFolderPath = await window.call.getModsFolderPath();
    const blocksFolderPath = modsFolderPath + '\\Blocks';
    button.value = blocksFolderPath;
    saveLocation = blocksFolderPath;
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
        modFolderDiv.innerText = 'No mod folders found.'
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

    for (i = 0; i < values.updates.length; i++) {
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
document.getElementById('saveBlockManuallyInput').addEventListener('click', async function(e) {
    const path = await window.call.selectFolder();
    if (path == undefined) return;
    e.target.value = path;

    updateSaveButton(e.target);
})

/**
 * Handle Discard block buttons
 */
function handleDiscardBlockButtons(isEditing) {
    document.querySelectorAll('button.discard').forEach(button => {
        if (isEditing) button.innerText = 'Discard changes';

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
    
        // Set textures.
        const textures = await window.call.getTempTextures();
        addFilesToTextureFiles(textures.regular, textureFiles.regular);
        addFilesToTextureFiles(textures.small, textureFiles.small);
        addFilesToTextureFiles(textures.normal, textureFiles.normal);
        addFilesToTextureFiles(textures.glow, textureFiles.glow);
        
        // Set recipe.
        const recipePropertiesJSON = JSON.stringify({Recipe: tempBlock.properties.Recipe}, null, 4);
        formElem.elements['recipeProperties'].value = recipePropertiesJSON.substring(2, recipePropertiesJSON.length-2).replace('    ', '');
        document.getElementById('recipePictureImg').src = './temp/recipePreview.png';

        // Change submit button text.
        document.getElementById('submitButton').innerText = 'Save changes';

        // Show save location (existing location) and put
        // path in it.
        const existingLocationDiv = document.getElementById('existingLocationDiv');
        existingLocationDiv.classList.remove('d-none');

        const existingLocationInput = document.getElementById('existingLocationInput');
        existingLocationInput.value = tempBlock.path.substring(0, tempBlock.path.lastIndexOf("\\"));
        
        updateSaveButton(existingLocationInput);

        existingLocationDiv.addEventListener('click', (e) => updateSaveButton(e.target));
    };

    addEventListenersToTextureSelectors();
    handleDiscardBlockButtons(isEditing);
}

function updateUniqueIDToDropDiv() {
    const uniqueIDToDropDiv = document.getElementById('uniqueIDToDropDiv');
    const value = uniqueIDToDropDiv.lastElementChild.value;

    switch (value) {
        case -2:
        case '-2':
            break;
        case -1:
        case '-1':
            prevButton.classList.remove('btn-pressed');
            prevButton = uniqueIDToDropDiv.firstElementChild.nextElementSibling
            prevButton.classList.add('btn-pressed');
            break;
        default:
            prevButton.classList.remove('btn-pressed');
            prevButton = uniqueIDToDropDiv.lastElementChild.previousElementSibling
            prevButton.classList.add('btn-pressed');
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