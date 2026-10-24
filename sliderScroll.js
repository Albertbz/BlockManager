/**
 * Scrolling over a slider moves it a step, up for higher and down for lower,
 * instead of scrolling the page. It works for every slider on the page,
 * including ones added later.
 */

document.addEventListener('wheel', (e) => {
    const slider = e.target;
    if (!(slider instanceof HTMLInputElement) || slider.type != 'range' || slider.disabled) return;
    e.preventDefault();

    const valueBefore = slider.value;
    if (e.deltaY < 0) {
        slider.stepUp();
    } else if (e.deltaY > 0) {
        slider.stepDown();
    }
    if (slider.value == valueBefore) return;

    // Let the page react as if the slider had been dragged
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    slider.dispatchEvent(new Event('change', { bubbles: true }));
}, { passive: false });
