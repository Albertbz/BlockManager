import { initBuffers } from "./init-buffers.js";
import { drawScene } from "./draw-scene.js";


//main();

let cubeRotation = 0.0;
let deltaTime = 0;

async function createCanvas(canvas, texturePaths) {
    //const canvas = document.querySelector("#glcanvas");
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

        void main(void) {
            gl_Position = uProjectionMatrix * uModelViewMatrix * aVertexPosition;
            vTextureCoord = aTextureCoord;

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
        },
    };

    // Here's where we call the routine that builds all the
    // objects we'll be drawing.
    const buffers = initBuffers(gl);

    // Load texture
    const texture = await loadTexture(gl, "C:\\Users\\alber\\OneDrive\\Dokumenter\\Hobbies\\cyubeVR\\BlockManager\\testing\\images\\all.dds");
    // Flip image pixels into the bottom-to-top order that WebGL expects.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);


    let then = 0;

    // Draw the scene repeatedly
    function render(now) {
        now *= 0.001; // convert to seconds
        deltaTime = now - then;
        then = now;

        drawScene(gl, programInfo, buffers, texture, cubeRotation);
        cubeRotation += deltaTime * 0.05;

        requestAnimationFrame(render);
    }
    requestAnimationFrame(render);

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

//
// Initialize a texture and load an image.
// When the image finished loading copy it into the texture.
//
async function loadTexture(gl, url) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture); // create texture object on GPU
    const ext = gl.getExtension("WEBGL_compressed_texture_s3tc"); // will be null if not supported
    if (ext) {
        // the file is already in the correct compressed format
        const dataArrayBuffer = await fetch(url)
            .then((response) => response.arrayBuffer());
        for (let level = 0; level <= 11; level++) {
            const width = 2048 / 2 ** level;
            const height = 2048 / 2 ** level;
            const levelDataArrayBuffer = extractMipLevel(dataArrayBuffer, level, width, height);
            gl.compressedTexImage2D(
                gl.TEXTURE_2D,
                level, // set the base image level
                ext.COMPRESSED_RGBA_S3TC_DXT5_EXT, // the compressed format we are using
                width,
                height, // width, height of the image
                0, // border, always 0
                new DataView(levelDataArrayBuffer)
            );
        }

        return texture;
    }
}

function extractMipLevel(dataArrayBuffer, level, width, height) {
    // Calculate the size of the mip level data
    const blockSize = 16; // 4x4 block size for DXT5 compression
    const numBlocks = Math.ceil(width / 4) * Math.ceil(height / 4);
    const mipSize = numBlocks * blockSize;

    // Create a new ArrayBuffer for the mip level data
    const mipArrayBuffer = new ArrayBuffer(mipSize);

    // Copy the relevant portion of the original dataArrayBuffer into the mipArrayBuffer
    const dataViewSrc = new DataView(dataArrayBuffer);
    const dataViewDest = new DataView(mipArrayBuffer);

    let srcOffset = 128;  // Initial offset in the source dataArrayBuffer
    let destOffset = 0; // Initial offset in the destination mipArrayBuffer

    // Determine the offset in the source dataArrayBuffer for the desired mip level
    for (let i = 0; i < level; i++) {
        const mipWidth = 2048 / 2 ** i;
        const mipHeight = 2048 / 2 ** i;
        const mipBlocks = Math.ceil(mipWidth / 4) * Math.ceil(mipHeight / 4);
        srcOffset += mipBlocks * blockSize;
    }

    // Copy the data block by block
    for (let j = 0; j < numBlocks; j++) {
        // Copy 16 bytes (128 bits) from the source to the destination
        for (let k = 0; k < blockSize; k++) {
            dataViewDest.setUint8(destOffset + k, dataViewSrc.getUint8(srcOffset + k));
        }

        srcOffset += blockSize;  // Move to the next block in the source
        destOffset += blockSize; // Move to the next block in the destination
    }

    // Return the ArrayBuffer containing the mip level data
    return mipArrayBuffer;
}

export { createCanvas }