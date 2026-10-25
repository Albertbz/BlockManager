import * as THREE from "./three/three.module.min.js";
import { OrbitControls } from "./three/OrbitControls.js";
import { createMaterialMesh, disposeMaterialMesh, cubeGeometry, edgesGeometry, edgeMaterial, hoveredEdgeMaterial } from "./recipeMeshes.js";
import { updateSliderFill } from "./sliderFill.js";

const EMPTY = 11; // 11 means invalid/nothing.

// Leaves a small gap between the cubes, so neighbours of the same
// material can still be told apart
const SPACING = 1.08;

//
// Show a recipe as a 3D grid of cubes in the given element. It can be turned
// around by dragging, pointing at a cube shows what material it is, and the
// layer input hides the top layers so the blocks inside can be seen. The
// layer input and the element showing its value can be left out, to always
// show all layers. The preview stops, and frees its WebGL context, once its
// element has been removed from the page.
// The textures are taken from texturesUrl (or a promise of it), which is the
// game's BlockTextures/DDS folder. Without it, only colours are shown.
// With isInteractive turned off, it only turns by itself, and can't be
// dragged, zoomed or pointed at, like the block previews.
// With shareRenderer, it is drawn by a renderer that all such previews
// share, and each picture is handed over to its canvas, as making and
// removing a WebGL context for each one is slow.
//
function createRecipePreview(container, layerInput, layerValue, getMaterialLabel, texturesUrl, { isInteractive = true, shareRenderer = false } = {}) {
    const canvas = document.createElement('canvas');
    const label = document.createElement('div');
    label.classList.add('recipe-preview-label', 'floating', 'outline', 'd-none');
    container.replaceChildren(canvas, label);

    const renderer = shareRenderer ? getSharedRenderer() : createRenderer(canvas);
    const output = shareRenderer ? canvas.getContext('bitmaprenderer') : undefined;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    scene.add(camera);

    // The light follows the camera, so the side being looked at is always lit
    scene.add(new THREE.AmbientLight(0xffffff, 1.6));
    const light = new THREE.DirectionalLight(0xffffff, 2.4);
    light.position.set(1, 2, 1.5);
    camera.add(light);

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.enabled = isInteractive;
    controls.autoRotateSpeed = 1.5;
    // Stop spinning once it is grabbed, so it stays where it was put
    controls.addEventListener('start', () => controls.autoRotate = false);

    // Hidden layers are still faintly shown, to keep the shape of the recipe
    const ghostMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.06, depthWrite: false });

    const cubes = new THREE.Group();
    scene.add(cubes);

    // Shows where a material can be added, when such a spot is highlighted
    const placeholder = new THREE.Mesh(cubeGeometry, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2, depthWrite: false }));
    placeholder.add(new THREE.LineSegments(edgesGeometry, hoveredEdgeMaterial));
    placeholder.visible = false;
    scene.add(placeholder);

    // Shows which layer the recipe builder is on, as a see-through plane
    // through the middle of that layer, a bit larger than the recipe
    const layerPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0x80c0ff, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false })
    );
    layerPlane.add(new THREE.LineSegments(
        new THREE.EdgesGeometry(layerPlane.geometry),
        new THREE.LineBasicMaterial({ color: 0x80c0ff, transparent: true, opacity: 0.8 })
    ));
    layerPlane.visible = false;
    scene.add(layerPlane);
    let builderLayer;
    let isBuilderLayerShown = true;

    let sizeX = 1;
    let sizeY = 1;
    let layerCount = 1;
    let radius = 1;
    let needsFraming = false;
    let shownSize;
    let isReadyToDraw = true;
    let recipeCount = 0;
    let compiling = Promise.resolve();

    function setRecipe(recipe) {
        for (const cube of cubes.children) disposeMaterialMesh(cube);
        cubes.clear();
        setHovered(undefined);
        highlighted = undefined;
        placeholder.visible = false;

        // In the game's recipe files, the array goes through x first, then y,
        // and the layers from the bottom up last
        sizeX = Math.max(1, recipe.SizeX);
        sizeY = Math.max(1, recipe.SizeY);
        layerCount = Math.max(1, Math.ceil(recipe.Array.length / (sizeX * sizeY)));

        const texturesLoaded = [];
        recipe.Array.forEach((material, i) => {
            if (material == EMPTY) return;
            const x = i % sizeX;
            const y = Math.floor(i / sizeX) % sizeY;
            const layer = Math.floor(i / (sizeX * sizeY));

            // Items are turned a bit differently each
            const { mesh: cube, ready } = createMaterialMesh(material, texturesUrl, i * 1.7);
            setPosition(cube, x, y, layer);
            Object.assign(cube.userData, { material, x, y, layer });
            cubes.add(cube);
            texturesLoaded.push(ready);
        });

        // Drawing a kind of material for the first time compiles a shader,
        // which held up the page for a moment while scrolling past many
        // previews. So a shared renderer compiles them in the background
        // first, once the textures (which change the kind) have loaded.
        if (shareRenderer) {
            isReadyToDraw = false;
            const recipeNumber = ++recipeCount;
            compiling = Promise.all(texturesLoaded)
                .then(() => renderer.compileAsync(scene, camera))
                .catch(err => console.error(err))
                .then(() => { if (recipeNumber == recipeCount) isReadyToDraw = true; });
        }

        radius = 0.5 * SPACING * Math.hypot(sizeX, sizeY, layerCount);

        // A recipe of the same size, like one being built a square at a
        // time, is shown the way it was already being looked at
        const size = `${sizeX},${sizeY},${layerCount}`;
        if (size != shownSize) {
            shownSize = size;
            if (layerInput != undefined) {
                layerInput.max = layerCount;
                layerInput.value = layerCount;
                layerInput.disabled = layerCount == 1;
                updateSliderFill(layerInput);
            }
            controls.autoRotate = true;
            needsFraming = true;
        }
        showLayers(layerInput != undefined ? Number(layerInput.value) : layerCount);
        placeLayerPlane();
        resize();
    }

    // layer is the recipe's layer, which may be just below or above it,
    // or undefined to not show it
    function showBuilderLayer(layer) {
        builderLayer = layer;
        placeLayerPlane();
    }

    // The plane can be turned off, to see the recipe without it
    function setBuilderLayerShown(isShown) {
        isBuilderLayerShown = isShown;
        placeLayerPlane();
    }

    function placeLayerPlane() {
        layerPlane.visible = isBuilderLayerShown && builderLayer != undefined;
        if (!layerPlane.visible) return;
        setPosition(layerPlane, (sizeX - 1) / 2, (sizeY - 1) / 2, builderLayer);
        layerPlane.scale.set(sizeX * SPACING + 0.5, 1, sizeY * SPACING + 0.5);
    }

    // The recipe is placed with its middle in the middle of the scene
    function setPosition(object, x, y, layer) {
        object.position.set(
            (x - (sizeX - 1) / 2) * SPACING,
            (layer - (layerCount - 1) / 2) * SPACING,
            (y - (sizeY - 1) / 2) * SPACING
        );
    }

    // Place the camera, seen from slightly above, as close as it can be while
    // the recipe still fits all the way around as it spins. Only the cubes
    // that are there are fitted, spinning around their middle, so recipes
    // that don't fill their grid aren't shown small. The recipe builder fits
    // its whole grid instead, as that is still being filled in.
    function frame() {
        const boxes = layerInput == undefined && cubes.children.length > 0
            ? cubes.children.map(cube => new THREE.Box3().setFromObject(cube))
            : [new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(), new THREE.Vector3(sizeX, layerCount, sizeY).multiplyScalar(SPACING))];
        const center = boxes.reduce((all, box) => all.union(box), new THREE.Box3()).getCenter(new THREE.Vector3());
        const corners = boxes.flatMap(box => [0, 1, 2, 3, 4, 5, 6, 7].map(i => new THREE.Vector3(
            i & 1 ? box.max.x : box.min.x,
            i & 2 ? box.max.y : box.min.y,
            i & 4 ? box.max.z : box.min.z
        ).sub(center)));

        // The directions across, up and out of the screen
        const direction = new THREE.Vector3(1, 0.8, 1).normalize();
        const right = new THREE.Vector3(0, 1, 0).cross(direction).normalize();
        const up = direction.clone().cross(right);

        // A corner fits on screen once the camera is far enough away that
        // its distance across and up is within the field of view, from
        // however much closer to the camera it is. Checked for every corner,
        // at many points of a whole turn.
        const tanHalfVerticalFov = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
        const tanHalfHorizontalFov = tanHalfVerticalFov * camera.aspect;
        const turned = new THREE.Vector3();
        let distance = 0;
        for (let step = 0; step < 72; step++) {
            const angle = step / 72 * 2 * Math.PI;
            for (const corner of corners) {
                turned.copy(corner).applyAxisAngle(THREE.Object3D.DEFAULT_UP, angle);
                const towardsCamera = turned.dot(direction);
                distance = Math.max(distance,
                    towardsCamera + Math.abs(turned.dot(right)) / tanHalfHorizontalFov,
                    towardsCamera + Math.abs(turned.dot(up)) / tanHalfVerticalFov
                );
            }
        }
        distance *= 1.05;

        camera.position.copy(direction).setLength(distance).add(center);
        controls.target.copy(center);
        controls.minDistance = Math.min(radius * 1.2, distance);
        controls.maxDistance = distance * 3;
        controls.update();
        needsFraming = false;
    }

    function showLayers(shownLayers) {
        for (const cube of cubes.children) {
            const isShown = cube.userData.layer < shownLayers;
            cube.material = isShown ? cube.userData.solidMaterials : ghostMaterial;
            if (!cube.userData.isItem) cube.children[0].visible = isShown;
        }
        if (layerValue != undefined) layerValue.textContent = `${shownLayers} of ${layerCount}`;
    }
    layerInput?.addEventListener('input', () => showLayers(Number(layerInput.value)));

    // The preview is hidden while another step is shown, which leaves it
    // without a size, so it is only framed once it gets one
    function resize() {
        const width = container.clientWidth;
        const height = container.clientHeight;
        if (width == 0 || height == 0) return;

        // A shared renderer is set to the size when this preview is drawn
        if (!shareRenderer) renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        if (needsFraming) frame();
    }
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    //
    // Hovering
    //
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let isPointerInside = false;
    let hovered;

    if (isInteractive) canvas.addEventListener('pointermove', (e) => {
        const rect = canvas.getBoundingClientRect();
        pointer.set(
            (e.clientX - rect.left) / rect.width * 2 - 1,
            -(e.clientY - rect.top) / rect.height * 2 + 1
        );
        isPointerInside = true;
        label.style.left = `${e.clientX - rect.left + 14}px`;
        label.style.top = `${e.clientY - rect.top + 14}px`;
    });
    if (isInteractive) canvas.addEventListener('pointerleave', () => {
        isPointerInside = false;
        setHovered(undefined);
    });

    // Checked every frame, as the cubes move under a still pointer while spinning
    function updateHovered() {
        if (!isPointerInside) return;
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObjects(cubes.children, false)
            .find(hit => hit.object.material != ghostMaterial);
        setHovered(hit?.object);
    }

    // The hovered cube gets white edges, as making it brighter would
    // dim the glowing blocks. Items have no edges, and are made brighter.
    function setHovered(cube) {
        if (cube == hovered) return;
        if (hovered != undefined && hovered != highlighted) setHighlighted(hovered, false);
        hovered = cube;

        if (cube == undefined) {
            label.classList.add('d-none');
            return;
        }
        setHighlighted(cube, true);
        const name = getMaterialLabel(cube.userData.material);
        label.textContent = `${name[0].toUpperCase()}${name.slice(1)} (layer ${cube.userData.layer + 1})`;
        label.classList.remove('d-none');
    }

    // A cube highlighted from outside, like the one under the pointer in the
    // recipe builder. position is { x, y, layer }, or undefined for none.
    // Where there is nothing yet, a see-through placeholder is shown there.
    let highlighted;
    function highlight(position) {
        if (highlighted != undefined && highlighted != hovered) setHighlighted(highlighted, false);
        highlighted = position == undefined ? undefined : cubes.children.find(cube =>
            cube.userData.x == position.x && cube.userData.y == position.y && cube.userData.layer == position.layer
        );
        if (highlighted != undefined) setHighlighted(highlighted, true);

        placeholder.visible = position != undefined && highlighted == undefined;
        if (placeholder.visible) setPosition(placeholder, position.x, position.y, position.layer);
    }

    function setHighlighted(cube, isHighlighted) {
        if (cube.userData.isItem) {
            cube.userData.solidMaterials.emissive.setHex(isHighlighted ? 0x404040 : 0x000000);
        } else {
            cube.children[0].material = isHighlighted ? hoveredEdgeMaterial : edgeMaterial;
        }
    }

    function render() {
        if (container.clientWidth == 0 || !isReadyToDraw) return;
        controls.update();
        updateHovered();

        if (shareRenderer) {
            const width = container.clientWidth, height = container.clientHeight;
            const size = renderer.getSize(new THREE.Vector2());
            if (size.x != width || size.y != height) renderer.setSize(width, height, false);
            renderer.render(scene, camera);
            // Handing the picture over is much faster than copying it
            output.transferFromImageBitmap(renderer.domElement.transferToImageBitmap());
        } else {
            renderer.render(scene, camera);
        }
    }

    if (shareRenderer) {
        requestAnimationFrame(function loop() {
            if (!canvas.isConnected) {
                dispose();
                return;
            }
            render();
            requestAnimationFrame(loop);
        });
    } else {
        renderer.setAnimationLoop(() => {
            if (!canvas.isConnected) {
                dispose();
                return;
            }
            render();
        });
    }

    // Only a limited number of WebGL contexts can exist at once. A shared
    // renderer is kept, but what only this preview used is freed, once it
    // is no longer being compiled, as that fails for freed materials.
    function dispose() {
        resizeObserver.disconnect();
        // The controls listen for keys on the document, but only stop when
        // the canvas is still on it, so the preview would never be freed
        document.removeEventListener('keydown', controls._interceptControlDown, { capture: true });
        document.removeEventListener('keyup', controls._interceptControlUp, { capture: true });
        controls.dispose();
        if (shareRenderer) {
            compiling.then(() => {
                for (const cube of cubes.children) disposeMaterialMesh(cube);
                ghostMaterial.dispose();
                placeholder.material.dispose();
                layerPlane.geometry.dispose();
                layerPlane.material.dispose();
                layerPlane.children[0].geometry.dispose();
                layerPlane.children[0].material.dispose();
            });
        } else {
            for (const cube of cubes.children) disposeMaterialMesh(cube);
            renderer.setAnimationLoop(null);
            renderer.dispose();
            renderer.forceContextLoss();
        }
    }

    return { setRecipe, highlight, showBuilderLayer, setBuilderLayerShown };
}

function createRenderer(canvas) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    return renderer;
}

// The renderer shared by the previews that share one, made when first
// needed. It isn't shown itself, so it draws off screen.
let sharedRenderer;
function getSharedRenderer() {
    if (sharedRenderer == undefined) sharedRenderer = createRenderer(new OffscreenCanvas(1, 1));
    return sharedRenderer;
}

export { createRecipePreview }
