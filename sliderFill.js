/**
 * The part of a slider to the left of its knob is filled in (see style.css),
 * so the page tells it how far along the knob is. Sliders update by
 * themselves when moved, but a script that sets a slider's value has to
 * call updateSliderFill afterwards.
 */

function updateSliderFill(slider) {
    const min = Number(slider.min || 0);
    const max = Number(slider.max || 100);
    const fraction = max > min ? (Number(slider.value) - min) / (max - min) : 0;
    slider.style.setProperty('--fill', fraction);
}

document.addEventListener('input', (e) => {
    if (e.target instanceof HTMLInputElement && e.target.type == 'range') updateSliderFill(e.target);
});

document.querySelectorAll('input[type=range]').forEach(updateSliderFill);

export { updateSliderFill }
