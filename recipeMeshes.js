import * as THREE from "./three/three.module.min.js";
import { DDSLoader } from "./three/DDSLoader.js";
import { itemShapes, getItemGeometry, createItemMaterial } from "./recipeItems.js";
import { getMaterialColor, blockTextures, GLOW_INTENSITY, TINT_GLOW_INTENSITY, seeThroughBlocks } from "./recipeMaterials.js";

//
// The 3D models of the materials in a recipe, as shown by the recipe preview
// and in the pictures of the materials to choose from: blocks are cubes with
// the game's textures, and items are placeholder models.
//

// Use the colours of the textures as they are, like the block preview does
THREE.ColorManagement.enabled = false;

// The cubes are never shown much larger than this, so larger mipmaps
// are left out, which makes loading a lot faster
const MAX_TEXTURE_SIZE = 512;

// Items are shown this much larger than their models, next to the blocks
const ITEM_SCALE = 1.6;

const cubeGeometry = new THREE.BoxGeometry(1, 1, 1);
const edgesGeometry = new THREE.EdgesGeometry(cubeGeometry);
const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 });
const hoveredEdgeMaterial = new THREE.LineBasicMaterial({ color: 0xffffff });

// A model of a material, and a promise of when its textures have loaded.
// Its userData has its solidMaterials, to dispose of when it's no longer
// used, and whether it is an item. Items are turned by turn (in radians),
// except ingots, which line up with the blocks.
function createMaterialMesh(material, texturesUrl, turn = 0) {
    const itemShape = itemShapes.get(material);
    if (itemShape != undefined) {
        const solidMaterials = createItemMaterial(material, getMaterialColor(material));
        const mesh = new THREE.Mesh(getItemGeometry(itemShape), solidMaterials);
        if (itemShape != 'ingot') mesh.rotation.y = turn;
        mesh.scale.setScalar(ITEM_SCALE);
        mesh.userData = { solidMaterials, isItem: true };
        return { mesh, ready: Promise.resolve() };
    }

    const { solidMaterials, ready } = createSolidMaterials(material, texturesUrl);
    const mesh = new THREE.Mesh(cubeGeometry, solidMaterials);
    mesh.add(new THREE.LineSegments(edgesGeometry, edgeMaterial));
    mesh.userData = { solidMaterials, isItem: false };
    return { mesh, ready };
}

function disposeMaterialMesh(mesh) {
    for (const material of [mesh.userData.solidMaterials].flat()) material.dispose();
}

// The texture numbers of each face, in the order of BoxGeometry's
// faces: right, left, top, bottom, front, back
function getFaceTextures(textures) {
    const sides = textures.sides ?? textures.all;
    const up = textures.up ?? textures.updown ?? textures.all;
    const down = textures.down ?? textures.updown ?? textures.all;
    return [sides, sides, up, down, sides, sides];
}

// One material per face, which starts out with the placeholder colour,
// and gets the block's textures once they have loaded
function createSolidMaterials(material, texturesUrl) {
    const seeThrough = seeThroughBlocks.get(material);
    if (seeThrough != undefined) {
        const seeThroughMaterial = new THREE.MeshLambertMaterial({ ...seeThrough, transparent: true, depthWrite: false });
        return { solidMaterials: Array(6).fill(seeThroughMaterial), ready: Promise.resolve() };
    }

    const solidMaterials = [];
    for (let i = 0; i < 6; i++) {
        solidMaterials.push(new THREE.MeshLambertMaterial({ color: getMaterialColor(material) }));
    }

    const textures = blockTextures.get(material);
    if (textures == undefined) return { solidMaterials, ready: Promise.resolve() };

    const ready = Promise.all(getFaceTextures(textures).map(async (textureNumber, i) => {
        const solidMaterial = solidMaterials[i];
        if (textures.glows) {
            const emissiveMap = await getTexture(texturesUrl, `Emissive/${textureNumber}.dds`);
            if (emissiveMap == undefined) return;
            solidMaterial.color.setHex(0x000000);
            solidMaterial.emissive.setHex(0xffffff);
            solidMaterial.emissiveIntensity = textures.glowIntensity ?? GLOW_INTENSITY;
            solidMaterial.emissiveMap = emissiveMap;
        } else {
            const map = await getTexture(texturesUrl, `Regular/${textureNumber}.dds`);
            if (map == undefined) return;
            solidMaterial.map = map;
            if (textures.tint != undefined) {
                solidMaterial.color.setHex(textures.tint);
                solidMaterial.emissive.setHex(textures.tint);
                solidMaterial.emissiveIntensity = TINT_GLOW_INTENSITY;
                solidMaterial.emissiveMap = map;
            } else {
                solidMaterial.color.setHex(0xffffff);
            }
        }
        solidMaterial.needsUpdate = true;
    }));
    return { solidMaterials, ready };
}

// Blocks often use the same texture, so each one is only loaded once, also
// when it is used by several renderers. texturesUrl is the game's
// BlockTextures/DDS folder (or a promise of it). Without it, there are none.
const loadingTextures = new Map();
async function getTexture(texturesUrl, path) {
    const folderUrl = await texturesUrl;
    if (folderUrl == undefined) return undefined;

    const url = `${folderUrl}/${path}`;
    if (!loadingTextures.has(url)) loadingTextures.set(url, loadTexture(url));
    return loadingTextures.get(url);
}

async function loadTexture(url) {
    try {
        const response = await fetch(url);
        const dds = new DDSLoader().parse(await response.arrayBuffer(), true);

        const firstMipmap = dds.mipmaps.findIndex(mipmap => Math.max(mipmap.width, mipmap.height) <= MAX_TEXTURE_SIZE);
        const mipmaps = dds.mipmaps.slice(Math.max(0, firstMipmap));
        const texture = new THREE.CompressedTexture(mipmaps, mipmaps[0].width, mipmaps[0].height, dds.format);
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        // Each renderer lowers it to the most it supports
        texture.anisotropy = 16;
        // Compressed textures can't be flipped while loading, as the
        // block preview's are, so they are flipped when drawn instead
        texture.repeat.y = -1;
        texture.offset.y = 1;
        texture.needsUpdate = true;
        return texture;
    } catch (err) {
        console.error(err);
        return undefined;
    }
}

export { createMaterialMesh, disposeMaterialMesh, cubeGeometry, edgesGeometry, edgeMaterial, hoveredEdgeMaterial }
