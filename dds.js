const fs = require('fs');
const Jimp = require('jimp');

function calculateMipmaps(width, height) {
    let numMipmaps = 1;
    while ((width > 1 || height > 1) && numMipmaps < 16) {
        width = Math.max(1, width / 2);
        height = Math.max(1, height / 2);
        numMipmaps++;
    }
    return numMipmaps;
}

function createDDSHeader(width, height, format) {
    const header = new Uint8Array(128);

    // Write DDS magic number
    header.set([0x44, 0x44, 0x53, 0x20], 0);

    // Write header fields
    header.set([124, 0, 0, 0], 4);        // dwSize
    header.set([0x07, 0x10, 0x0a, 0x00], 8);  // dwFlags
    header.set([height & 0xFF, (height >> 8) & 0xFF, (height >> 16) & 0xFF, (height >> 24) & 0xFF], 12);      // dwHeight
    header.set([width & 0xFF, (width >> 8) & 0xFF, (width >> 16) & 0xFF, (width >> 24) & 0xFF], 16);      // dwWidth
    header.set([0x70, 0x55, 0x55, 0], 20);       // dwPitchOrLinearSize
    header.set([0x01, 0, 0, 0], 24)        // dwDepth

    // Automatically determine number of mipmaps
    let numMipmaps = calculateMipmaps(width, height);
    header.set([numMipmaps, 0, 0, 0], 28); // dwMipMapCount

    header.set(new Uint8Array(44), 32);   // dwReserved1

    // Write pixel format
    header.set([32, 0, 0, 0], 76);        // dwSize
    header.set([0x04, 0x00, 0x00, 0x00], 80); // dwFlags
    switch (format) {
        case "DXT1":
            header.set([0x00, 0x04, 0x00, 0x00], 84); // dwFourCC
            header.set([0x00, 0xff, 0x00, 0x00], 88); // dwRGBBitCount, dwRBitMask
            header.set([0x00, 0xff, 0x00, 0x00], 92); // dwGBitMask, dwBBitMask
            header.set([0x00, 0x00, 0x00, 0x00], 96); // dwABitMask
            break;
        case "DXT5":
            header.set([0x44, 0x58, 0x54, 0x35], 84); // dwFourCC
            header.set([0x00, 0x00, 0x00, 0x00], 88); // dwRGBBitCount
            header.set([0x00, 0x00, 0x00, 0x00], 92); // dwRBitMask
            header.set([0x00, 0x00, 0x00, 0x00], 96); // dwGBitMask
            header.set([0x00, 0x00, 0x00, 0x00], 100); // dwBBitMask
            header.set([0x00, 0x00, 0x00, 0x00], 104); // dwABitMask
            break;
        default:
            throw new Error(`Unsupported format: ${format}`);
    }

    // Write DDS caps
    header.set([0x08, 0x10, 0x40, 0x00], 108); // dwCaps
    header.set([0x00, 0x00, 0x00, 0x00], 116); // dwCaps2

    return header;
}

function encodeDXT5(imageData, width, height) {
    const blockSize = 16;
    const numBlocksX = Math.ceil(width / 4);
    const numBlocksY = Math.ceil(height / 4);
    const numBlocks = numBlocksX * numBlocksY;
    const output = new Uint8Array(blockSize * numBlocks);
    const data = imageData;

    // Iterate over each block
    for (let blockY = 0; blockY < numBlocksY; blockY++) {
        for (let blockX = 0; blockX < numBlocksX; blockX++) {
            const offset = (blockY * numBlocksX + blockX) * blockSize;

            // Calculate alpha values
            const alphaValues = new Uint8Array(8);
            for (let i = 0; i < 8; i++) {
                const alphaIndex = i * 4 + offset + 3;
                alphaValues[i] = data[alphaIndex];
            }
            const alphaCodes = encodeAlpha(alphaValues);

            // Write alpha block
            output.set(alphaCodes, offset);

            // Calculate color values
            const colorValues = new Uint16Array(16);
            for (let i = 0; i < 16; i++) {
                const x = blockX * 4 + (i % 4);
                const y = blockY * 4 + Math.floor(i / 4);
                const colorIndex = (y * width + x) * 4;
                const r = data[colorIndex];
                const g = data[colorIndex + 1];
                const b = data[colorIndex + 2];
                colorValues[i] = pack565(r, g, b);
            }
            const colorCodes = encodeColorDXT1(colorValues);

            // Write color block
            output.set(colorCodes, offset + 8);
        }
    }

    return output;
}

function encodeAlpha(alphaValues) {
    const alpha0 = alphaValues[0];
    const alpha1 = alphaValues[1];
    const hasAlpha1 = alpha0 > alpha1;
    const alphaBits = new Uint8Array(6);

    // Determine the 6 alpha bits
    if (hasAlpha1) {
        alphaBits[0] = alpha0;
        alphaBits[1] = alpha1;
        alphaBits[2] = Math.round((6 * alpha0 + 1 * alpha1) / 7);
        alphaBits[3] = Math.round((5 * alpha0 + 2 * alpha1) / 7);
        alphaBits[4] = Math.round((4 * alpha0 + 3 * alpha1) / 7);
        alphaBits[5] = Math.round((3 * alpha0 + 4 * alpha1) / 7);
    } else {
        alphaBits[0] = alpha0;
        alphaBits[1] = alpha1;
        alphaBits[2] = Math.round((4 * alpha0 + 1 * alpha1) / 5);
        alphaBits[3] = Math.round((3 * alpha0 + 2 * alpha1) / 5);
        alphaBits[4] = Math.round((2 * alpha0 + 3 * alpha1) / 5);
        alphaBits[5] = Math.round((1 * alpha0 + 4 * alpha1) / 5);
    }

    // Pack the alpha bits into 3 bytes
    const alphaBytes = new Uint8Array(8);
    alphaBytes[0] = (alphaBits[0]) & 0xff;
    alphaBytes[1] = (alphaBits[1]) & 0xff;
    alphaBytes[2] = ((alphaBits[2] << 3) | (alphaBits[3] >> 2)) & 0xff;
    alphaBytes[3] = ((alphaBits[4] << 3) | (alphaBits[5] >> 2)) & 0xff;
    alphaBytes[4] = ((alphaBits[6] << 3) | (alphaBits[7] >> 2)) & 0xff;
    alphaBytes[5] = ((alphaBits[8] << 3) | (alphaBits[9] >> 2)) & 0xff;
    alphaBytes[6] = ((alphaBits[10] << 3) | (alphaBits[11] >> 2)) & 0xff;
    alphaBytes[7] = ((alphaBits[12] << 3) | (alphaBits[13] >> 2)) & 0xff;

    return alphaBytes;
}

function encodeColorDXT1(colors) {
    const codeBuffer = new Uint8Array(8);
    const output = new Uint8Array(8);

    // Calculate the bounding box for the colors
    let minR = 255;
    let minG = 255;
    let minB = 255;
    let maxR = 0;
    let maxG = 0;
    let maxB = 0;

    for (let i = 0; i < 16; i++) {
        const color = unpack565(colors[i]);

        if (color.r < minR) minR = color.r;
        if (color.g < minG) minG = color.g;
        if (color.b < minB) minB = color.b;
        if (color.r > maxR) maxR = color.r;
        if (color.g > maxG) maxG = color.g;
        if (color.b > maxB) maxB = color.b;
    }

    // Pack the colors into 2 bytes
    const color0 = pack565(minR, minG, minB);
    const color1 = pack565(maxR, maxG, maxB);

    // Write the color codes to the buffer
    codeBuffer[0] = color0 & 0xFF;
    codeBuffer[1] = color0 >> 8;
    codeBuffer[2] = color1 & 0xFF;
    codeBuffer[3] = color1 >> 8;

    // Calculate the color lookup table
    const colorTable = new Uint8Array(4 * 4);

    if (color0 > color1) {
        for (let i = 0; i < 16; i++) {
            const color = unpack565(colors[i]);

            if (color0 > color1) {
                if (color.r == maxR && color.g == maxG && color.b == maxB) {
                    colorTable[i] = 1;
                } else if (color.r == minR && color.g == minG && color.b == minB) {
                    colorTable[i] = 0;
                } else {
                    const weight = calculateWeight565(color, color0, color1);
                    colorTable[i] = 2 + weight;
                }
            } else {
                if (color.r == maxR && color.g == maxG && color.b == maxB) {
                    colorTable[i] = 0;
                } else if (color.r == minR && color.g == minG && color.b == minB) {
                    colorTable[i] = 1;
                } else {
                    const weight = calculateWeight565(color, color0, color1);
                    colorTable[i] = weight;
                }
            }
        }
    } else {
        // The two colors are the same, so all indices point to color0
        colorTable.fill(0);
    }

    // Pack the color lookup table into 4 bytes
    let tableIndex = 0;
    for (let i = 4; i < 8; i++) {
        let value = 0;
        for (let j = 0; j < 4; j++) {
            const colorIndex = i - 4 + j * 4;
            value |= colorTable[colorIndex] << (j * 2);
        }
        output[i] = value;
    }

    // Copy the color codes to the output
    output.set(codeBuffer, 0);

    return output;
}

function encodeDXT1(imageData, width, height) {
    const blockSize = 8;
    const numBlocksX = Math.ceil(width / 4);
    const numBlocksY = Math.ceil(height / 4);
    const numBlocks = numBlocksX * numBlocksY;
    const output = new Uint8Array(blockSize * numBlocks);
    const data = imageData.data;

    // Iterate over each block
    for (let blockY = 0; blockY < numBlocksY; blockY++) {
        for (let blockX = 0; blockX < numBlocksX; blockX++) {
            const offset = (blockY * numBlocksX + blockX) * blockSize;

            // Calculate color values
            const colorValues = new Uint8Array(16);
            for (let i = 0; i < 16; i++) {
                const x = blockX * 4 + (i % 4);
                const y = blockY * 4 + Math.floor(i / 4);
                const colorIndex = (y * width + x) * 4;
                const r = data[colorIndex];
                const g = data[colorIndex + 1];
                const b = data[colorIndex + 2];
                colorValues[i] = pack565(r, g, b);
            }

            // Encode color block
            const colorBlock = encodeColorDXT1(colorValues);
            output.set(colorBlock, offset);
        }
    }

    return output;
}

function pack565(r, g, b) {
    // Packs a red, green, and blue color into a 565 format.
    r = r >> 3;
    g = g >> 2;
    b = b >> 3;
    return (r << 11) | (g << 5) | b;
}

function unpack565(color) {
    // Unpacks a 565 format color into its red, green, and blue components.
    var r = (color >> 11) << 3;
    var g = ((color >> 5) & 0x3F) << 2;
    var b = (color & 0x1F) << 3;
    return {r, g, b};
}

function calculateWeight565(color, color0, color1) {
    // Calculate the weight of the given color in relation to the two endpoint colors
    const [r, g, b] = unpack565(color);
    const [r0, g0, b0] = unpack565(color0);
    const [r1, g1, b1] = unpack565(color1);

    const dr = r1 - r0;
    const dg = g1 - g0;
    const db = b1 - b0;

    const rIndex = Math.round(((r - r0) / dr) * 7);
    const gIndex = Math.round(((g - g0) / dg) * 7);
    const bIndex = Math.round(((b - b0) / db) * 3);

    return (rIndex << 6) | (gIndex << 3) | bIndex;
}


async function createDDSImage(inputPath, outputPath, format) {
    Jimp.read(inputPath)
        .then(image => {
            let header;
            let encodeFunction;
            switch (format) {
                case 'DXT1':
                    header = createDDSHeader(image.bitmap.width, image.bitmap.height, 'DXT1');
                    encodeFunction = encodeDXT1;
                    break;
                case 'DXT5':
                    header = createDDSHeader(image.bitmap.width, image.bitmap.height, 'DXT5');
                    encodeFunction = encodeDXT5;
                    break;
                default:
                    throw new Error(`Unsupported format: ${format}`);
            }

            let numMipmaps = calculateMipmaps(image.bitmap.width, image.bitmap.height);
            let encodedData = new Uint8Array();
            for (let i = 0; i < numMipmaps; i++) {
                let newEncodedData = encodeFunction(image.bitmap.data, image.bitmap.width, image.bitmap.height);
                let tempOldEncodedData = encodedData;
                encodedData = new Uint8Array(tempOldEncodedData.length + newEncodedData.length);
                encodedData.set(tempOldEncodedData);
                encodedData.set(newEncodedData, tempOldEncodedData.length)
                image.resize(image.bitmap.width / 2, image.bitmap.height / 2);
            }

            const output = Buffer.concat([header, encodedData]);
            fs.writeFileSync(outputPath, output);
        })
        .catch(err => {
            console.error(err);
        });
}

module.exports = {
    createDDSImage: createDDSImage
}