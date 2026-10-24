import * as THREE from "./three/three.module.min.js";

//
// Placeholder models for the items that can be in a recipe, as the game's
// own models can't be loaded. Each still fits inside a block when shown
// 1.6 times as large, as the recipe preview does.
//

// The shape each item is shown as
const itemShapes = new Map([
    [22, 'nugget'], // copper nugget
    [23, 'nugget'], // gold nugget
    [24, 'nugget'], // coal
    [113, 'nugget'], // cloakstone nugget
    [73, 'ingot'], // iron ingot
    [91, 'ingot'], // glass ingot
    [38, 'dye'], // blue dye
    [41, 'dye'], // green dye
    [48, 'dye'], // red dye
    [62, 'rainbowDye'], // rainbow dye
    [64, 'dye'], // white dye
    [68, 'crystal'], // crystal
    [72, 'dryGrass'], // dry grass
]);

// How see-through the items that are partly see-through are
const itemOpacities = new Map([
    [68, 0.95], // crystal
    [91, 0.55], // glass ingot
    [113, 0.7], // cloakstone nugget
]);

// The same geometry is used by all items of a shape
const geometries = new Map();
function getItemGeometry(shape) {
    if (!geometries.has(shape)) geometries.set(shape, createGeometry(shape));
    return geometries.get(shape);
}

function createGeometry(shape) {
    switch (shape) {
        case 'nugget': return createNuggetGeometry();
        case 'ingot': return createIngotGeometry();
        case 'dye': return createDyeGeometry();
        case 'rainbowDye': return createRainbowDyeGeometry();
        case 'crystal': return createCrystalGeometry();
        case 'dryGrass': return createDryGrassGeometry();
    }
}

// The material of an item, with the item's colour
function createItemMaterial(material, color) {
    switch (itemShapes.get(material)) {
        case 'rainbowDye':
            return new THREE.MeshLambertMaterial({ vertexColors: true });
        case 'dryGrass':
            return new THREE.MeshLambertMaterial({ color, map: getGrassTexture(), alphaTest: 0.5, side: THREE.DoubleSide });
        default:
            if (itemOpacities.has(material)) {
                return new THREE.MeshLambertMaterial({ color, flatShading: true, transparent: true, opacity: itemOpacities.get(material), depthWrite: false });
            }
            return new THREE.MeshLambertMaterial({ color, flatShading: true });
    }
}

// A lumpy rock. The corners are pushed in and out by an amount that only
// depends on where they are, so corners shared by several faces stay together.
function createNuggetGeometry() {
    const geometry = new THREE.IcosahedronGeometry(0.2, 1);
    const position = geometry.attributes.position;
    const corner = new THREE.Vector3();
    for (let i = 0; i < position.count; i++) {
        corner.fromBufferAttribute(position, i);
        const noise = Math.sin(corner.dot(new THREE.Vector3(12.9898, 78.233, 37.719))) * 43758.5453;
        corner.multiplyScalar(0.8 + 0.4 * (noise - Math.floor(noise)));
        corner.y *= 0.75;
        position.setXYZ(i, corner.x, corner.y, corner.z);
    }
    geometry.computeVertexNormals();
    return geometry;
}

// A bar that is narrower at the top, like a cast ingot
function createIngotGeometry() {
    const geometry = new THREE.BoxGeometry(0.6, 0.24, 0.36);
    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
        if (position.getY(i) > 0) {
            position.setX(i, position.getX(i) * 0.8);
            position.setZ(i, position.getZ(i) * 0.65);
        }
    }
    geometry.computeVertexNormals();
    return geometry;
}

// A small, rounded heap
function createDyeGeometry() {
    const geometry = new THREE.SphereGeometry(0.22, 16, 12);
    geometry.scale(1, 0.3, 1);
    return geometry;
}

// A heap coloured all around with the colours of the rainbow
function createRainbowDyeGeometry() {
    const geometry = createDyeGeometry();
    const position = geometry.attributes.position;
    const colors = [];
    const color = new THREE.Color();
    for (let i = 0; i < position.count; i++) {
        const angle = Math.atan2(position.getZ(i), position.getX(i));
        color.setHSL(angle / (2 * Math.PI) + 0.5, 0.75, 0.55);
        colors.push(color.r, color.g, color.b);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return geometry;
}

// A long, six-sided crystal with a pointed tip and a short, blunt base,
// made by turning its outline around the middle
function createCrystalGeometry() {
    const outline = [
        new THREE.Vector2(0, -0.29),
        new THREE.Vector2(0.07, -0.25),
        new THREE.Vector2(0.08, 0.15),
        new THREE.Vector2(0, 0.29),
    ];
    return new THREE.LatheGeometry(outline, 6);
}

// A handful of grass: four planes through the middle, each with a round wad
// of strands drawn on it, so it looks like a ball of grass from any side.
// Three stand up at different angles, and one lies down.
function createDryGrassGeometry() {
    const planes = [];
    for (let i = 0; i < 3; i++) {
        const plane = new THREE.PlaneGeometry(0.55, 0.55);
        plane.rotateZ(i * 0.7); // so the strands don't all go the same way
        plane.rotateY(i * Math.PI / 3);
        planes.push(plane);
    }
    const lyingPlane = new THREE.PlaneGeometry(0.55, 0.55);
    lyingPlane.rotateX(-Math.PI / 2);
    planes.push(lyingPlane);

    const geometry = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'uv']) {
        const values = planes.flatMap(plane => Array.from(plane.toNonIndexed().attributes[name].array));
        geometry.setAttribute(name, new THREE.Float32BufferAttribute(values, planes[0].attributes[name].itemSize));
    }
    return geometry;
}

let grassTexture;
function getGrassTexture() {
    if (grassTexture != undefined) return grassTexture;

    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');

    // The same strands every time, from numbers that only look random
    let seed = 7;
    function random() {
        seed = (seed * 16807) % 2147483647;
        return seed / 2147483647;
    }

    // Curved strands crossing a round area. Ones near the edge are shorter,
    // so the wad gets a ragged, round outline.
    // White, so it takes the item's colour, with a bit of shading.
    const shades = ['#ffffff', '#e6e0d0', '#cfc8b4', '#b8b09a'];
    const center = size / 2;
    const radius = size * 0.42;
    context.lineCap = 'round';
    for (let i = 0; i < 70; i++) {
        const angle = random() * Math.PI;
        const offset = (random() * 2 - 1) * radius * 0.85;
        const halfLength = Math.sqrt(radius * radius - offset * offset) * (0.8 + random() * 0.35);
        const along = [Math.cos(angle), Math.sin(angle)];
        const across = [-along[1], along[0]];
        const middle = [center + across[0] * offset, center + across[1] * offset];
        const bend = (random() * 2 - 1) * radius * 0.3;

        context.strokeStyle = shades[i % shades.length];
        context.lineWidth = 1.5 + random() * 2;
        context.beginPath();
        context.moveTo(middle[0] - along[0] * halfLength, middle[1] - along[1] * halfLength);
        context.quadraticCurveTo(
            middle[0] + across[0] * bend, middle[1] + across[1] * bend,
            middle[0] + along[0] * halfLength, middle[1] + along[1] * halfLength
        );
        context.stroke();
    }

    grassTexture = new THREE.CanvasTexture(canvas);
    return grassTexture;
}

export { itemShapes, getItemGeometry, createItemMaterial }
