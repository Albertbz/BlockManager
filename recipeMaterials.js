import * as THREE from "./three/three.module.min.js";

//
// What is known about the materials that can be in a recipe: their names,
// placeholder colours, and which of the game's textures the blocks use.
//

// The name of a material, for when there is the given amount of it
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
        case 13:
            return 'iron ore';
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
        case 122:
            return 'water'
        default:
            return 'MISSING MATERIAL ID \'' + materialAsNumber + '\' (please let me know)'
    }
}

// Which of the game's textures (in BlockTextures/DDS) each block uses for its
// sides, top and bottom.
// The starstones and shimmertiles have black regular textures, and their
// colour comes from the emissive texture with the same number. Some emissive
// textures are darker than how the blocks look in the game, like the white
// and gold ones, so those glow more strongly.
// The shimmerstones' textures are made by the game while it runs, so they
// are shown as stone tinted in their colour, which also glows a bit.
const GLOW_INTENSITY = 1.5;
const TINT_GLOW_INTENSITY = 0.6;
const blockTextures = new Map([
    [1, { sides: 1, up: 3, down: 0 }], // grass
    [2, { all: 0 }], // dirt
    [6, { sides: 6, updown: 7 }], // dark wood
    [10, { all: 13 }], // sand
    [13, { all: 15 }], // iron ore
    [32, { sides: 21, updown: 22 }], // light wood
    [33, { all: 20 }], // light wood plank
    [34, { all: 19 }], // dark wood plank
    [35, { all: 4 }], // stone
    [46, { sides: 23, updown: 18 }], // wallstone
    [47, { sides: 25, up: 24, down: 0 }], // flagstone
    [52, { all: 29 }], // wood scaffolding
    [96, { all: 4, tint: 0x4f8dff }], // blue shimmerstone
    [97, { all: 4, tint: 0xffc840 }], // gold shimmerstone
    [98, { all: 4, tint: 0xffffff }], // white shimmerstone
    [99, { all: 4, tint: 0x5ad66a }], // green shimmerstone
    [100, { all: 34, glows: true }], // blue starstone
    [101, { all: 35, glows: true }], // gold starstone
    [102, { all: 36, glows: true }], // green starstone
    [103, { all: 37, glows: true }], // blue shimmertile
    [104, { all: 38, glows: true, glowIntensity: 3 }], // gold shimmertile
    [105, { all: 39, glows: true, glowIntensity: 6 }], // white shimmertile
    [106, { all: 40, glows: true }], // green shimmertile
]);

// Glass, cloakstone and water have no block texture, so they are shown
// as (partly) see-through cubes
const seeThroughBlocks = new Map([
    [89, { color: 0xa8dcff, opacity: 0.35 }], // glass block
    [112, { color: 0x2a2f3a, opacity: 0.6 }], // cloakstone
    [122, { color: 0x2f6fd0, opacity: 0.85 }], // water
]);

// Placeholder colours for each material, used for items, blocks without
// a known texture, and while the textures are loading
const materialColors = new Map([
    [1, 0x5f9e3a], // grass
    [2, 0x7a5534], // dirt
    [6, 0x4a3222], // dark wood
    [10, 0xd8c78a], // sand
    [13, 0x8a7a6e], // iron ore
    [22, 0xc8784a], // copper nugget
    [23, 0xe8c040], // gold nugget
    [24, 0x2b2b2b], // coal
    [32, 0xc9a46a], // light wood
    [33, 0xdcbb84], // light wood plank
    [34, 0x6b4a30], // dark wood plank
    [35, 0x8c8c8c], // stone
    [38, 0x2f5fd0], // blue dye
    [41, 0x3fa03f], // green dye
    [46, 0x9a9a92], // wallstone
    [47, 0x7d7468], // flagstone
    [48, 0xc83030], // red dye
    [52, 0xa47c4c], // wood scaffolding
    [62, 0xd060d0], // rainbow dye
    [64, 0xf0f0f0], // white dye
    [68, 0x24508a], // crystal
    [72, 0xb8b060], // dry grass
    [73, 0x8a8c90], // iron ingot
    [89, 0xcfeaf0], // glass block
    [91, 0xa8d8e0], // glass ingot
    [96, 0x4a90e0], // blue shimmerstone
    [97, 0xe0b040], // gold shimmerstone
    [98, 0xe8e8f0], // white shimmerstone
    [99, 0x50c070], // green shimmerstone
    [100, 0x3a70c8], // blue starstone
    [101, 0xc89830], // gold starstone
    [102, 0x40a860], // green starstone
    [103, 0x6aa8f0], // blue shimmertile
    [104, 0xf0c860], // gold shimmertile
    [105, 0xf8f8ff], // white shimmertile
    [106, 0x70d890], // green shimmertile
    [112, 0x404858], // cloakstone
    [113, 0x5a6478], // cloakstone nugget
    [122, 0x3a70c0], // water
]);

// Unknown materials still get a colour of their own
function getMaterialColor(material) {
    if (materialColors.has(material)) return materialColors.get(material);
    return new THREE.Color().setHSL((material * 0.618) % 1, 0.6, 0.5);
}

// Starstones, shimmertiles and shimmerstones
function isGlowing(material) {
    const textures = blockTextures.get(material);
    return textures?.glows == true || textures?.tint != undefined;
}

export { getMaterialName, materialColors, getMaterialColor, blockTextures, GLOW_INTENSITY, TINT_GLOW_INTENSITY, isGlowing, seeThroughBlocks }
