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
    header.set([0, 0, 0, 0], 20);       // dwPitchOrLinearSize
    header.set([0, 0, 0, 0], 24)        // dwDepth

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
                const alphaIndex = i * 2 + offset + 8;
                alphaValues[i] = data[alphaIndex];
            }
            const alphaCodes = encodeAlpha(alphaValues);

            // Write alpha block
            output.set(alphaCodes, offset);

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
            const colorCodes = encodeColorDXT1(colorValues);

            // Write color block
            output.set(colorCodes, offset + 8);
        }
    }

    return output;
}

function encodeAlpha(alphaValues) {
    const alphaCodes = new Uint8Array(8);
    if (alphaValues[0] > alphaValues[1]) {
        // 8-alpha block: 00000xxx 00000yyy
        alphaCodes[0] = ((8 - 1) << 2) | ((7 - 0) << 0);
        alphaCodes[1] = ((6 - 1) << 2) | ((5 - 0) << 0);
        alphaCodes[2] = ((4 - 1) << 2) | ((3 - 0) << 0);
        alphaCodes[3] = ((2 - 1) << 2) | ((1 - 0) << 0);
        alphaCodes[4] = alphaValues[0];
        alphaCodes[5] = alphaValues[1];
        alphaCodes[6] = alphaValues[2];
        alphaCodes[7] = alphaValues[3];
    } else {
        // 6-alpha block: 000000xx 0000yyyy
        alphaCodes[0] = ((6 - 1) << 2) | ((5 - 0) << 0);
        alphaCodes[1] = ((4 - 1) << 2) | ((3 - 0) << 0);
        alphaCodes[2] = ((2 - 1) << 2) | ((1 - 0) << 0);
        alphaCodes[3] = alphaValues[0];
        alphaCodes[4] = alphaValues[1];
        alphaCodes[5] = alphaValues[2];
        alphaCodes[6] = alphaValues[3];
        alphaCodes[7] = 0;
    }
    return alphaCodes;
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
    return ((r & 0xf8) << 8) | ((g & 0xfc) << 3) | (b >> 3);
}

function unpack565(color) {
    const r = (color >> 11) & 0x1F;
    const g = (color >> 5) & 0x3F;
    const b = color & 0x1F;
    return { r: r << 3, g: g << 2, b: b << 3 };
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