import { initBuffers } from "./init-buffers.js";
import { drawScene } from "./draw-scene.js";

async function loadCanvas(canvas, texturePaths, isAnimated = false, animationSpeed = 0) {
    let cubeRotation = 0.0;
    let deltaTime = 0;

    // Initialize the GL context
    const gl = canvas.getContext("webgl");

    // Only continue if WebGL is available and working
    if (gl === null) {
        alert(
            "Unable to initialize WebGL. Your browser or machine may not support it."
        );
        return;
    }

    // Set clear color to black, fully opaque
    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    // Clear the color buffer with specified clear color
    gl.clear(gl.COLOR_BUFFER_BIT);

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

    // Here's where we call the routine that builds all the
    // objects we'll be drawing.
    const buffers = initBuffers(gl);

    // Load textures
    const textures = await loadTextures(gl, texturePaths);

    // Flip image pixels into the bottom-to-top order that WebGL expects.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);


    let then = 0;
    const scale = isAnimated ? 4.0 : 1.0;
    let offset = glMatrix.vec2.fromValues(0.0, 0.0);
    let animationCounter = 0;

    const framesPerSecond = 16 * (animationSpeed / 255);
    const secondsPerFrame = 1 / framesPerSecond;

    // Draw the scene repeatedly
    function render(now) {
        // Stop rendering once the canvas has been removed, and free
        // its WebGL context, as only a limited number can exist.
        if (!canvas.isConnected) {
            const loseContextExt = gl.getExtension('WEBGL_lose_context');
            if (loseContextExt) loseContextExt.loseContext();
            return;
        }

        now *= 0.001; // convert to seconds
        deltaTime = now - then;
        then = now;

        drawScene(gl, programInfo, buffers, textures, cubeRotation, scale, offset);

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
async function loadTextures(gl, texturePaths) {
    const loading = new Map();
    for (const path of new Set(texturePaths)) {
        loading.set(path, loadTexture(gl, path));
    }
    return Promise.all(texturePaths.map(path => loading.get(path)));
}

// The preview is only 135 pixels wide, so mipmaps larger than this are
// never shown. Leaving them out makes loading a lot faster.
const maxPreviewTextureSize = 256;

//
// Load a DDS file (BC3/DXT5) into a texture.
//
async function loadTexture(gl, url) {
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

    // Upload the mipmaps no larger than maxPreviewTextureSize (or just the
    // smallest one there is, if all are larger), as levels 0, 1, 2...
    let uploadedLevels = 0;
    let lastSize = 0;
    for (let i = 0; i < mipMapCount; i++) {
        const levelWidth = Math.max(1, width >> i);
        const levelHeight = Math.max(1, height >> i);
        const size = Math.ceil(levelWidth / 4) * Math.ceil(levelHeight / 4) * 16; // 16 bytes per 4x4 block
        if (offset + size > buffer.byteLength) break;

        const isLast = i == mipMapCount - 1;
        if (Math.max(levelWidth, levelHeight) <= maxPreviewTextureSize || (isLast && uploadedLevels == 0)) {
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

export { loadCanvas }