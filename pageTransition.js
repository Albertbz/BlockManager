/**
 * Animations for switching between Manage Blocks and the generator. Both
 * pages have the same background, and the buttons to create a block and to
 * stop creating it are in the same place, so the content of one page
 * shrinks into that button, and the next page's content grows out of it.
 *
 * A page starts with its content hidden (the page-entering class on the
 * body), so nothing is shown before the animation starts. Only the size
 * is animated, as fading would turn off the blurred backgrounds.
 */

function getContainer() {
    return document.querySelector('body > .container');
}

// Scaling from the middle of the button makes the content grow out of it
function getGrowKeyframes(button) {
    const container = getContainer();
    const containerRect = container.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    container.style.transformOrigin = `${buttonRect.left + buttonRect.width / 2 - containerRect.left}px `
        + `${buttonRect.top + buttonRect.height / 2 - containerRect.top}px`;

    return [{ transform: 'scale(0.01)' }, { transform: 'none' }];
}

function growFromButton(button, duration) {
    const keyframes = getGrowKeyframes(button);
    document.body.classList.remove('page-entering');
    getContainer().animate(keyframes, { duration, easing: 'ease-out' });
}

// Played in reverse, ease-out speeds up into the button
function shrinkIntoButton(button, duration) {
    const animation = getContainer().animate(getGrowKeyframes(button),
        { duration, easing: 'ease-out', direction: 'reverse', fill: 'forwards' });
    return animation.finished;
}

// Main runs window.animatePageOut before switching pages, and waits for it
function setPageOutAnimation(animatePageOut) {
    window.animatePageOut = animatePageOut;
}

export { growFromButton, shrinkIntoButton, setPageOutAnimation }
