import { initBuffers } from "./init-buffers.js";
import { drawScene } from "./draw-scene.js";

// heightPaths has each face's height map, if the block has them, which
// displace the faces like in the game. Without hardEdges, different
// textures continue into each other (HardEdgesBetweenDifferentTextures).
// With shareContext, the preview is drawn with a WebGL context that all
// such previews share, and each picture is handed over to the canvas.
// Making and removing a context for each preview is slow, which made
// scrolling past many of them stutter.
async function loadCanvas(canvas, texturePaths, isAnimated = false, animationSpeed = 0, canEnlarge = true, heightPaths = [], hardEdges = true, shareContext = false) {
    // Clicking the preview shows it large
    if (canEnlarge) {
        canvas.classList.add('enlargeable');
        canvas.addEventListener('click', () => showLargePreview(canvas, texturePaths, isAnimated, animationSpeed, heightPaths, hardEdges));
    }

    let cubeRotation = 0.0;
    let deltaTime = 0;

    const context = shareContext ? getSharedContext() : createContext(canvas);
    if (context == undefined) return;
    const { gl, programInfo } = context;
    const output = shareContext ? canvas.getContext('bitmaprenderer') : undefined;

    const scale = isAnimated ? 4.0 : 1.0;

    // Displaced faces are divided into squares of a few pixels each
    const gridSize = getGridSize(canvas);

    // Load textures and height maps
    const [textures, heightMaps] = await Promise.all([
        loadTextures(gl, texturePaths, getMaxTextureSize(canvas)),
        loadHeightMaps(heightPaths, 2 * gridSize * scale, hardEdges),
    ]);

    // Here's where we call the routine that builds all the
    // objects we'll be drawing.
    const buffers = initBuffers(gl, heightMaps, gridSize, scale, hardEdges);

    let then = 0;
    let offset = glMatrix.vec2.fromValues(0.0, 0.0);
    let animationCounter = 0;

    const framesPerSecond = 16 * (animationSpeed / 255);
    const secondsPerFrame = 1 / framesPerSecond;

    // Draw the scene repeatedly
    function render(now) {
        // Stop rendering once the canvas has been removed, and free its
        // WebGL context, as only a limited number can exist, or what it
        // used of the shared one.
        if (!canvas.isConnected) {
            if (shareContext) {
                freeResources(gl, textures, buffers);
            } else {
                const loseContextExt = gl.getExtension('WEBGL_lose_context');
                if (loseContextExt) loseContextExt.loseContext();
            }
            return;
        }

        now *= 0.001; // convert to seconds
        deltaTime = now - then;
        then = now;

        if (shareContext) {
            const { width, height } = canvas;
            if (gl.canvas.width != width || gl.canvas.height != height) {
                gl.canvas.width = width;
                gl.canvas.height = height;
            }
            gl.viewport(0, 0, width, height);
        }

        drawScene(gl, programInfo, buffers, textures, cubeRotation, scale, offset, canvas.clientWidth / canvas.clientHeight);

        // Handing the picture over is much faster than copying it
        if (shareContext) output.transferFromImageBitmap(gl.canvas.transferToImageBitmap());

        if (isAnimated) {
            animationCounter += deltaTime;

            if (animationCounter >= secondsPerFrame) {
                offset = getNextOffset(offset);
                animationCounter = 0;
            }
        }

        cubeRotation += deltaTime * 0.5;

        requestAnimationFrame(render);
    }
    requestAnimationFrame(render);

}

// The context shared by the previews that share one, made when first
// needed. It isn't shown itself, so it is drawn off screen.
let sharedContext;
function getSharedContext() {
    if (sharedContext == undefined) sharedContext = createContext(new OffscreenCanvas(1, 1));
    return sharedContext;
}

// The textures and buffers of a preview in the shared context
function freeResources(gl, textures, buffers) {
    for (const texture of new Set(textures)) {
        if (texture) gl.deleteTexture(texture);
    }
    for (const faceBuffers of buffers) {
        for (const buffer of [faceBuffers.position, faceBuffers.normal, faceBuffers.textureCoord, faceBuffers.indices]) {
            gl.deleteBuffer(buffer);
        }
    }
}

// A WebGL context for the canvas, with the shader program that draws the
// block, or undefined if WebGL isn't available
function createContext(canvas) {
    // Initialize the GL context
    const gl = canvas.getContext("webgl");

    // Only continue if WebGL is available and working
    if (gl === null) {
        alert(
            "Unable to initialize WebGL. Your browser or machine may not support it."
        );
        return undefined;
    }

    // Set clear color to black, fully opaque
    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    // Clear the color buffer with specified clear color
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Flip image pixels into the bottom-to-top order that WebGL expects.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    // Vertex shader program
    const vsSource = `
        attribute vec4 aVertexPosition;
        attribute vec3 aVertexNormal;
        attribute vec2 aTextureCoord;

        uniform mat4 uNormalMatrix;
        uniform mat4 uModelViewMatrix;
        uniform mat4 uProjectionMatrix;

        varying highp vec2 vTextureCoord;
        varying highp vec3 vLighting;

        uniform float uvScale;
        uniform vec2 uvOffset;

        void main(void) {
            gl_Position = uProjectionMatrix * uModelViewMatrix * aVertexPosition;
            vTextureCoord = aTextureCoord / uvScale + uvOffset;

            // Apply lighting effect

            highp vec3 ambientLight = vec3(0.4, 0.4, 0.4);
            highp vec3 directionalLightColor = vec3(1, 1, 1);
            highp vec3 directionalVector = normalize(vec3(0.3, 0.0, 0.85));

            highp vec4 transformedNormal = uNormalMatrix * vec4(aVertexNormal, 1.0);

            highp float directional = max(dot(transformedNormal.xyz, directionalVector), 0.0);
            vLighting = ambientLight + (directionalLightColor * directional);
        }
    `;

    // Fragment shader program
    const fsSource = `
        varying highp vec2 vTextureCoord;
        varying highp vec3 vLighting;

        uniform sampler2D uSampler;

        void main(void) {
            highp vec4 texelColor = texture2D(uSampler, vTextureCoord);

            gl_FragColor = vec4(texelColor.rgb * vLighting, texelColor.a);
        }
    `;

    // Initialize a shader program; this is where all the lighting
    // for the vertices and so forth is established.
    const shaderProgram = initShaderProgram(gl, vsSource, fsSource);

    // Collect all the info needed to use the shader program.
    // Look up which attributes our shader program is using
    // for aVertexPosition, aVertexColor and also
    // look up uniform locations.
    const programInfo = {
        program: shaderProgram,
        attribLocations: {
            vertexPosition: gl.getAttribLocation(shaderProgram, "aVertexPosition"),
            vertexNormal: gl.getAttribLocation(shaderProgram, "aVertexNormal"),
            textureCoord: gl.getAttribLocation(shaderProgram, "aTextureCoord"),
        },
        uniformLocations: {
            projectionMatrix: gl.getUniformLocation(shaderProgram, "uProjectionMatrix"),
            modelViewMatrix: gl.getUniformLocation(shaderProgram, "uModelViewMatrix"),
            normalMatrix: gl.getUniformLocation(shaderProgram, "uNormalMatrix"),
            uSampler: gl.getUniformLocation(shaderProgram, "uSampler"),
            vScale: gl.getUniformLocation(shaderProgram, "uvScale"),
            vOffset: gl.getUniformLocation(shaderProgram, "uvOffset"),
        },
    };

    return { gl, programInfo };
}

function showLargePreview(smallCanvas, texturePaths, isAnimated, animationSpeed, heightPaths, hardEdges) {
    showLargeView(smallCanvas, (size) => {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        loadCanvas(canvas, texturePaths, isAnimated, animationSpeed, false, heightPaths, hardEdges);
        return canvas;
    });
}

//
// Show a large view covering most of the screen, which is closed again by
// clicking anywhere. It grows out of the small element when opened, and
// shrinks back into it when closed. makeContent makes what is shown, given
// its size, which is shown as a square of that many pixels.
//
const largePreviewAnimationOptions = { duration: 250, easing: 'ease-out' };

function showLargeView(smallElement, makeContent) {
    const overlay = document.createElement('div');
    overlay.classList.add('large-preview');

    const size = Math.floor(Math.min(window.innerWidth, window.innerHeight) * 0.9);
    const content = makeContent(size);
    content.style.width = `${size}px`;
    content.style.height = `${size}px`;
    overlay.appendChild(content);

    // Removing a preview also stops its rendering and frees its WebGL context
    let isClosing = false;
    function close() {
        if (isClosing) return;
        isClosing = true;
        document.removeEventListener('keydown', onKeyDown);

        const options = { ...largePreviewAnimationOptions, easing: 'ease-in', direction: 'reverse' };
        overlay.animate([{ opacity: 0 }, { opacity: 1 }], options);
        content.animate(getGrowKeyframes(smallElement, content), options).finished.then(() => overlay.remove());
    }
    function onKeyDown(e) {
        if (e.key == 'Escape') close();
    }
    overlay.addEventListener('click', close);
    document.addEventListener('keydown', onKeyDown);

    document.body.appendChild(overlay);
    overlay.animate([{ opacity: 0 }, { opacity: 1 }], largePreviewAnimationOptions);
    content.animate(getGrowKeyframes(smallElement, content), largePreviewAnimationOptions);
}

// Keyframes moving the large element from where the small one is to where the
// large one is. If the small one is gone, it just grows from the middle.
function getGrowKeyframes(smallElement, largeElement) {
    const largeRect = largeElement.getBoundingClientRect();
    let from = 'scale(0.2)';
    if (smallElement.isConnected) {
        const smallRect = smallElement.getBoundingClientRect();
        const dx = (smallRect.left + smallRect.width / 2) - (largeRect.left + largeRect.width / 2);
        const dy = (smallRect.top + smallRect.height / 2) - (largeRect.top + largeRect.height / 2);
        from = `translate(${dx}px, ${dy}px) scale(${smallRect.width / largeRect.width})`;
    }
    return [{ transform: from }, { transform: 'none' }];
}

function getNextOffset(offset) {
    offset[0] += 0.25;
    if (offset[0] == 1.0) {
        offset[0] = 0.0;
        offset[1] += 0.25;

        if (offset[1] == 1.0) {
            offset[1] = 0.0;
        }
    }
    return offset;
}

//
// Initialize a shader program, so WebGL knows how to draw our data
//
function initShaderProgram(gl, vsSource, fsSource) {
    const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
    const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);

    // Create the shader program

    const shaderProgram = gl.createProgram();
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);

    // If creating the shader program failed, alert

    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
        alert(
            `Unable to initialize the shader program: ${gl.getProgramInfoLog(
                shaderProgram
            )}`
        );
        return null;
    }

    return shaderProgram;
}

//
// creates a shader of the given type, uploads the source and
// compiles it.
//
function loadShader(gl, type, source) {
    const shader = gl.createShader(type);

    // Send the source to the shader object

    gl.shaderSource(shader, source);

    // Compile the shader program

    gl.compileShader(shader);

    // See if it compiled successfully

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        alert(
            `An error occurred compiling the shaders: ${gl.getShaderInfoLog(shader)}`
        );
        gl.deleteShader(shader);
        return null;
    }

    return shader;
}

// Blocks often use the same texture on several sides, so each file is
// only loaded once, and different files are loaded at the same time.
async function loadTextures(gl, texturePaths, maxTextureSize) {
    const loading = new Map();
    for (const path of new Set(texturePaths)) {
        loading.set(path, loadTexture(gl, path, maxTextureSize));
    }
    return Promise.all(texturePaths.map(path => loading.get(path)));
}

// Mipmaps much larger than the canvas are never shown. Leaving them out
// makes loading a lot faster. The small 135 pixel preview uses up to 256.
function getMaxTextureSize(canvas) {
    return 2 ** Math.ceil(Math.log2(Math.max(canvas.width, canvas.height)));
}

//
// Load a DDS file (BC3/DXT5) into a texture.
//
async function loadTexture(gl, url, maxTextureSize) {
    const ext = gl.getExtension("WEBGL_compressed_texture_s3tc"); // will be null if not supported
    if (!ext) return undefined;

    const buffer = await fetch(url).then((response) => response.arrayBuffer());

    // Read the size and mipmap count from the DDS header, which is
    // 20 bytes longer when it has a DX10 header.
    const header = new DataView(buffer);
    const height = header.getUint32(12, true);
    const width = header.getUint32(16, true);
    const mipMapCount = Math.max(1, header.getUint32(28, true));
    const hasDX10Header = String.fromCharCode(...new Uint8Array(buffer, 84, 4)) == 'DX10';
    let offset = hasDX10Header ? 148 : 128;

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);

    // Upload the mipmaps no larger than maxTextureSize (or just the
    // smallest one there is, if all are larger), as levels 0, 1, 2...
    let uploadedLevels = 0;
    let lastSize = 0;
    for (let i = 0; i < mipMapCount; i++) {
        const levelWidth = Math.max(1, width >> i);
        const levelHeight = Math.max(1, height >> i);
        const size = Math.ceil(levelWidth / 4) * Math.ceil(levelHeight / 4) * 16; // 16 bytes per 4x4 block
        if (offset + size > buffer.byteLength) break;

        const isLast = i == mipMapCount - 1;
        if (Math.max(levelWidth, levelHeight) <= maxTextureSize || (isLast && uploadedLevels == 0)) {
            gl.compressedTexImage2D(
                gl.TEXTURE_2D,
                uploadedLevels,
                ext.COMPRESSED_RGBA_S3TC_DXT5_EXT,
                levelWidth,
                levelHeight,
                0, // border, always 0
                new Uint8Array(buffer, offset, size) // no copying needed
            );
            uploadedLevels++;
            lastSize = Math.max(levelWidth, levelHeight);
        }
        offset += size;
    }

    // Without mipmaps all the way down to 1x1, mipmapped sampling would
    // show nothing, so sample the largest level directly instead.
    if (lastSize != 1) {
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    }

    return texture;
}

// A face takes up a bit under half the canvas, and is divided into squares
// of around 3 pixels, like the game's micro-triangles (at most 128 x 128).
function getGridSize(canvas) {
    return Math.min(128, Math.max(16, Math.round(Math.max(canvas.width, canvas.height) / 7)));
}

// Like loadTextures, faces with the same height map share it. Without
// hard edges, the textures continue into each other, so they all have the
// same face level: the height half of all of them together is below.
async function loadHeightMaps(heightPaths, minSize, hardEdges) {
    const loading = new Map();
    for (const path of new Set(heightPaths)) {
        if (path) loading.set(path, loadHeightMap(path, minSize));
    }
    const heightMaps = await Promise.all(heightPaths.map(path => loading.get(path)));

    const loaded = [...new Set(heightMaps)].filter(heightMap => heightMap);
    if (!hardEdges && loaded.length > 1) {
        const faceLevel = getMedian(concat(loaded.map(heightMap => heightMap.data)));
        for (const heightMap of loaded) heightMap.faceLevel = faceLevel;
    }
    return heightMaps;
}

function concat(arrays) {
    const result = new Float32Array(arrays.reduce((length, array) => length + array.length, 0));
    let offset = 0;
    for (const array of arrays) {
        result.set(array, offset);
        offset += array.length;
    }
    return result;
}

//
// Load a height map DDS file (BC4) as heights from 0 to 1, from the
// smallest mipmap at least minSize wide. Also finds the face's level: the
// height half the face is below (the game's automatic one). Gives
// undefined if it can't be loaded, so the face is just flat.
//
async function loadHeightMap(url, minSize) {
    let buffer;
    try {
        const response = await fetch(url);
        if (!response.ok) return undefined;
        buffer = await response.arrayBuffer();
    } catch (err) {
        return undefined;
    }
    if (buffer.byteLength < 128) return undefined;

    const header = new DataView(buffer);
    const height = header.getUint32(12, true);
    const width = header.getUint32(16, true);
    const mipMapCount = Math.max(1, header.getUint32(28, true));
    const fourCC = String.fromCharCode(...new Uint8Array(buffer, 84, 4));
    const hasDX10Header = fourCC == 'DX10';
    const isBC4 = hasDX10Header ? header.getUint32(128, true) == 80 : ['ATI1', 'BC4U'].includes(fourCC);
    if (!isBC4 || width != height) return undefined;

    // Find the mipmap, 8 bytes per 4x4 block
    let offset = hasDX10Header ? 148 : 128;
    let level = { size: width, offset };
    for (let i = 0; i < mipMapCount; i++) {
        const size = Math.max(1, width >> i);
        if (size < minSize || size < 4) break;
        level = { size, offset };
        offset += Math.ceil(size / 4) ** 2 * 8;
    }
    if (level.offset + Math.ceil(level.size / 4) ** 2 * 8 > buffer.byteLength) return undefined;

    const data = decodeBC4(new Uint8Array(buffer, level.offset), level.size);
    return { size: level.size, data, faceLevel: getMedian(data) };
}

function decodeBC4(bytes, size) {
    const data = new Float32Array(size * size);
    const blocksPerRow = Math.ceil(size / 4);
    const values = new Float32Array(8);
    for (let by = 0; by < blocksPerRow; by++) {
        for (let bx = 0; bx < blocksPerRow; bx++) {
            const b = (by * blocksPerRow + bx) * 8;
            const r0 = bytes[b], r1 = bytes[b + 1];
            values[0] = r0;
            values[1] = r1;
            if (r0 > r1) {
                for (let k = 1; k < 7; k++) values[k + 1] = ((7 - k) * r0 + k * r1) / 7;
            } else {
                for (let k = 1; k < 5; k++) values[k + 1] = ((5 - k) * r0 + k * r1) / 5;
                values[6] = 0;
                values[7] = 255;
            }

            // 16 3-bit indices in the following 6 bytes, the first in the lowest bits
            let bits = 0, bitCount = 0, next = b + 2;
            for (let p = 0; p < 16; p++) {
                if (bitCount < 3) {
                    bits |= bytes[next++] << bitCount;
                    bitCount += 8;
                }
                const x = bx * 4 + (p & 3), y = by * 4 + (p >> 2);
                if (x < size && y < size) data[y * size + x] = values[bits & 7] / 255;
                bits >>= 3;
                bitCount -= 3;
            }
        }
    }
    return data;
}

// The value that would be in the middle if sorted, found by only sorting
// the part it is in again and again (much faster than sorting it all)
function getMedian(data) {
    const values = Float32Array.from(data);
    const middle = values.length >> 1;
    let low = 0, high = values.length - 1;
    while (low < high) {
        // Smaller values than the pivot go before larger ones
        const pivot = values[(low + high) >> 1];
        let i = low, j = high;
        while (i <= j) {
            while (values[i] < pivot) i++;
            while (values[j] > pivot) j--;
            if (i <= j) {
                [values[i], values[j]] = [values[j], values[i]];
                i++;
                j--;
            }
        }

        if (middle <= j) high = j;
        else if (middle >= i) low = i;
        else break;
    }
    return values[middle];
}

export { loadCanvas, showLargeView }