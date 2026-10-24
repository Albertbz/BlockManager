import * as THREE from "./three/three.module.min.js";
import { createMaterialMesh, disposeMaterialMesh } from "./recipeMeshes.js";
import { showSwatch } from "./recipeSwatches.js";

//
// Pictures of the materials as 3D models, the way they look in the recipe
// preview, for showing them in the page itself. They are all drawn by one
// renderer that is never shown, as there can only be a few at a time.
//

const THUMBNAIL_SIZE = 96;

// Seen from the same side as the recipe preview starts out from
const VIEW_DIRECTION = new THREE.Vector3(1, 0.8, 1).normalize();

let renderer;
let scene;
let camera;

function setUp() {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, false);
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    scene.add(camera);

    // Lit like the recipe preview
    scene.add(new THREE.AmbientLight(0xffffff, 1.6));
    const light = new THREE.DirectionalLight(0xffffff, 2.4);
    light.position.set(1, 2, 1.5);
    camera.add(light);
}

// Show a material's picture on an element. Until it has been drawn, the
// material's flat swatch is shown instead.
function showThumbnail(element, material, texturesUrl) {
    showSwatch(element, material, texturesUrl);
    getThumbnailUrl(material, texturesUrl).then(url => {
        // The element may show something else by now
        if (element.dataset.swatchMaterial != material) return;
        // Also stops the swatch from still putting its texture on it
        delete element.dataset.swatchMaterial;
        element.classList.remove('swatch', 'swatch-item', 'swatch-see-through');
        element.classList.add('thumbnail');
        element.style.backgroundImage = `url(${url})`;
    });
}

// Each picture is only drawn once
const thumbnailUrls = new Map();
function getThumbnailUrl(material, texturesUrl) {
    if (!thumbnailUrls.has(material)) thumbnailUrls.set(material, drawThumbnail(material, texturesUrl));
    return thumbnailUrls.get(material);
}

async function drawThumbnail(material, texturesUrl) {
    if (renderer == undefined) setUp();

    const { mesh, ready } = createMaterialMesh(material, texturesUrl, 0.5);
    await ready;

    // Far enough away that the model fits whatever its size, and then
    // zoomed in until it just fits, as most models are far from round.
    // Nothing else is drawn in between, as this doesn't wait for anything.
    const sphere = new THREE.Box3().setFromObject(mesh).getBoundingSphere(new THREE.Sphere());
    const distance = 1.05 * sphere.radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2));
    camera.position.copy(VIEW_DIRECTION).setLength(distance).add(sphere.center);
    camera.lookAt(sphere.center);
    camera.zoom = 1;
    camera.updateProjectionMatrix();
    camera.zoom = 0.92 / getExtentInView(mesh);
    camera.updateProjectionMatrix();

    scene.add(mesh);
    renderer.render(scene, camera);
    const url = renderer.domElement.toDataURL();
    scene.remove(mesh);
    disposeMaterialMesh(mesh);
    return url;
}

// How far from the middle of the picture the model reaches, where 1 is the edge
function getExtentInView(mesh) {
    mesh.updateMatrixWorld();
    camera.updateMatrixWorld();
    const position = mesh.geometry.attributes.position;
    const point = new THREE.Vector3();
    let extent = 0;
    for (let i = 0; i < position.count; i++) {
        point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld).project(camera);
        extent = Math.max(extent, Math.abs(point.x), Math.abs(point.y));
    }
    return extent;
}

export { showThumbnail }
