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

uniqueIDButton.addEventListener('click', function() {
    const randomInt = Math.floor(Math.random() * 2147483648) + 1;
    uniqueIDInput.value = randomInt;
});

/**
 * Texture choosing mechanism
 */
document.querySelectorAll('div.texture-selector-parent').forEach((textureSelectorDiv) => {
    let textureFilesInput = textureSelectorDiv.previousElementSibling;
    let textureFiles = [];

    textureFilesInput.addEventListener('change', (e) => {
        addTexturesToDiv(textureFiles, textureFilesInput.files, textureSelectorDiv);
    })
})

function clearTexturesInDiv(div) {
    const textureChildDivs = div.querySelectorAll('div.texture-selector-child');
    for (let i = 0; i < textureChildDivs.length; i++) {
        div.removeChild(textureChildDivs[i]);
    }
}

function addTexturesToDiv(fileArray, newFiles, selectorDiv) {
    clearTexturesInDiv(selectorDiv);
    fileArray.push(...newFiles);
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

        textureImg.src = fileArray[i].path;
        textureImg.classList.add('texture-img');
        textureImg.addEventListener('click', (e) => {
            fileArray.splice(i, 1);
            addTexturesToDiv(fileArray, [], selectorDiv);
        })

        crossImg.src = "./images/cross.png";
        crossImg.classList.add('cross');

        if (amountOfTextures == 6) {
            selectorDiv.lastElementChild.classList.add('d-none');
        }
        else {
            selectorDiv.lastElementChild.classList.remove('d-none');
        }

        selectorDiv.insertBefore(div, selectorDiv.lastElementChild);
    }
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
 * Handle form submit
 */
const form = document.getElementById('blockForm');

form.addEventListener('submit', function(e) {
    e.preventDefault();
    
    

});