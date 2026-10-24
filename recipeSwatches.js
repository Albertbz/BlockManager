import * as THREE from "./three/three.module.min.js";
import { DDSLoader } from "./three/DDSLoader.js";
import { getMaterialColor, blockTextures, GLOW_INTENSITY, TINT_GLOW_INTENSITY, seeThroughBlocks } from "./recipeMaterials.js";
import { itemShapes } from "./recipeItems.js";

//
// Small square pictures of materials, for showing them in the page itself.
// Blocks show the top of the block, made from the game's textures, while
// items and blocks without a texture show their placeholder colour.
//

const SWATCH_SIZE = 64;

// Show a material on an element. Its colour is shown straight away, and the
// texture once it has loaded. texturesUrl is the game's BlockTextures/DDS
// folder (or a promise of it), as for the recipe preview.
function showSwatch(element, material, texturesUrl) {
    element.classList.add('swatch');
    element.classList.toggle('swatch-item', itemShapes.has(material));
    element.classList.toggle('swatch-see-through', seeThroughBlocks.has(material));
    element.style.setProperty('--swatch-color', `#${new THREE.Color(getMaterialColor(material)).getHexString()}`);
    element.style.backgroundImage = '';

    getSwatchUrl(material, texturesUrl).then(url => {
        // The element may show something else by now
        if (url != undefined && element.dataset.swatchMaterial == material) {
            element.style.backgroundImage = `url(${url})`;
        }
    });
    element.dataset.swatchMaterial = material;
}

// Each swatch is only made once
const swatchUrls = new Map();
function getSwatchUrl(material, texturesUrl) {
    if (!swatchUrls.has(material)) swatchUrls.set(material, createSwatchUrl(material, texturesUrl));
    return swatchUrls.get(material);
}

async function createSwatchUrl(material, texturesUrl) {
    const textures = blockTextures.get(material);
    const folderUrl = await texturesUrl;
    if (textures == undefined || folderUrl == undefined) return undefined;

    const textureNumber = textures.up ?? textures.updown ?? textures.all;
    const path = textures.glows ? `Emissive/${textureNumber}.dds` : `Regular/${textureNumber}.dds`;
    // How much each colour channel is multiplied by, like in the recipe preview
    let multiplier = [1, 1, 1];
    if (textures.glows) {
        multiplier = multiplier.map(() => textures.glowIntensity ?? GLOW_INTENSITY);
    } else if (textures.tint != undefined) {
        multiplier = new THREE.Color(textures.tint).toArray().map(value => value * (1 + TINT_GLOW_INTENSITY));
    }

    try {
        const response = await fetch(`${folderUrl}/${path}`);
        const dds = new DDSLoader().parse(await response.arrayBuffer(), true);
        if (dds.format != THREE.RGB_S3TC_DXT1_Format) return undefined;

        // The largest mipmap that is no larger than the swatch
        const mipmap = dds.mipmaps.find(mipmap => mipmap.width <= SWATCH_SIZE) ?? dds.mipmaps.at(-1);
        const canvas = document.createElement('canvas');
        canvas.width = mipmap.width;
        canvas.height = mipmap.height;
        const context = canvas.getContext('2d');
        context.putImageData(decodeDXT1(mipmap, multiplier, context), 0, 0);
        return canvas.toDataURL();
    } catch (err) {
        console.error(err);
        return undefined;
    }
}

// DXT1 stores 4x4 pixel blocks of 8 bytes: two colours, and for each pixel
// which of those, or of two colours between them, it has
function decodeDXT1(mipmap, multiplier, context) {
    const { data, width, height } = mipmap;
    const image = context.createImageData(width, height);
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

    function toRGB(color) {
        return [
            ((color >> 11) & 31) * 255 / 31,
            ((color >> 5) & 63) * 255 / 63,
            (color & 31) * 255 / 31,
        ].map((value, i) => value * multiplier[i]);
    }

    let offset = 0;
    for (let blockY = 0; blockY < Math.max(1, height / 4); blockY++) {
        for (let blockX = 0; blockX < Math.max(1, width / 4); blockX++) {
            const color0 = view.getUint16(offset, true);
            const color1 = view.getUint16(offset + 2, true);
            const indices = view.getUint32(offset + 4, true);
            offset += 8;

            const a = toRGB(color0);
            const b = toRGB(color1);
            const palette = color0 > color1
                ? [a, b, a.map((value, i) => (2 * value + b[i]) / 3), a.map((value, i) => (value + 2 * b[i]) / 3)]
                : [a, b, a.map((value, i) => (value + b[i]) / 2), [0, 0, 0]];

            for (let i = 0; i < 16; i++) {
                const x = blockX * 4 + (i % 4);
                const y = blockY * 4 + Math.floor(i / 4);
                if (x >= width || y >= height) continue;
                const color = palette[(indices >> (2 * i)) & 3];
                const pixel = (y * width + x) * 4;
                image.data.set([...color, 255], pixel); // Clamped to 0-255
            }
        }
    }
    return image;
}

export { showSwatch }
