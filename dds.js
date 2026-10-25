const { execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');


const texconvPath = path.join(__dirname, 'CLI', 'texconv.exe');

// Both functions throw if the conversion fails. They run texconv without
// waiting for it, as that would freeze the whole app meanwhile.

// Every mipmap down to 1x1, with a DX10 header like the game's own
// textures. "-bc u" weighs the colour channels the same, which keeps the
// colours closest to the original.
async function createDDSImage(inputPath, outputPath, format) {
    await runConversion(['-bc', 'u', '-dx10', '-f', `${format}_UNORM`], inputPath, outputPath, '.dds');
}

// Only the largest mipmap
async function decompressDDSImage(inputPath, outputPath) {
    await runConversion(['-ft', 'png', '-f', 'R8G8B8A8_UNORM', '-m', '1'], inputPath, outputPath, '.png');
}

async function runConversion(args, inputPath, outputPath, extension) {
    // texconv names the file after the input, in the output folder, so it
    // is moved to the given path afterwards.
    const outputFolder = path.dirname(outputPath);
    const texconvOutputPath = path.join(outputFolder, path.basename(inputPath, path.extname(inputPath)) + extension);
    if (texconvOutputPath.toLowerCase() == inputPath.toLowerCase()) {
        throw new Error(`Can't convert ${path.basename(inputPath)} into a file of the same name`);
    }

    // Remove any old output so that a failed conversion can't be
    // mistaken for a successful one.
    fs.rmSync(outputPath, { force: true });
    fs.rmSync(texconvOutputPath, { force: true });

    await promisify(execFile)(texconvPath, ['-nologo', '-y', ...args, '-o', outputFolder, inputPath], { windowsHide: true });

    if (!fs.existsSync(texconvOutputPath)) {
        throw new Error(`Could not create ${path.basename(outputPath)}`);
    }
    if (texconvOutputPath != outputPath) fs.renameSync(texconvOutputPath, outputPath);
}

// The formats that readDDSImage can decode: legacy FourCC codes or DXGI
// formats (for files with a DX10 header), and the bytes per 4x4 block.
const blockFormats = [
    { name: 'BC1', fourCCs: ['DXT1'], dxgiFormats: [71, 72], blockSize: 8 },
    { name: 'BC3', fourCCs: ['DXT5'], dxgiFormats: [77, 78], blockSize: 16 },
    { name: 'BC4', fourCCs: ['ATI1', 'BC4U'], dxgiFormats: [80], blockSize: 8 },
    { name: 'BC5', fourCCs: ['ATI2', 'BC5U'], dxgiFormats: [83], blockSize: 16 }
];

// The header is at most this long (with a DX10 header)
const maxHeaderLength = 148;

// The size, mipmap count, format and where the pixels start. Gives
// undefined for files that aren't DDS files of one of blockFormats.
function readDDSHeader(buffer) {
    if (buffer.length < 128 || buffer.toString('ascii', 0, 4) != 'DDS ') return undefined;

    const height = buffer.readUInt32LE(12);
    const width = buffer.readUInt32LE(16);
    const mipMapCount = Math.max(1, buffer.readUInt32LE(28));
    const fourCC = buffer.toString('ascii', 84, 88);
    const hasDX10Header = fourCC == 'DX10';
    if (hasDX10Header && buffer.length < maxHeaderLength) return undefined;

    const format = blockFormats.find(format => hasDX10Header
        ? format.dxgiFormats.includes(buffer.readUInt32LE(128))
        : format.fourCCs.includes(fourCC));
    if (format == undefined) return undefined;

    return { width, height, mipMapCount, format, dataOffset: hasDX10Header ? 148 : 128 };
}

function getLevelSize(width, height, format) {
    return Math.ceil(width / 4) * Math.ceil(height / 4) * format.blockSize;
}

// Only the header is read, as the files are large
function readDDSFileHeader(filePath) {
    const buffer = Buffer.alloc(maxHeaderLength);
    const fd = fs.openSync(filePath, 'r');
    try {
        const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0);
        return readDDSHeader(buffer.subarray(0, bytesRead));
    } catch {
        return undefined;
    } finally {
        fs.closeSync(fd);
    }
}

/**
 * Whether the DDS file is square, of the given format, at least the given
 * size, and has every mipmap down to 1x1 (like createDDSImage makes them).
 * Then a texture of the given size is just its smaller mipmaps, which
 * extractDDSMipMaps can get without converting anything.
 */
function hasDDSMipMaps(filePath, size, format) {
    const header = readDDSFileHeader(filePath);
    return header != undefined && header.format.name == format
        && header.width == header.height && header.width >= size
        && header.mipMapCount == Math.log2(header.width) + 1;
}

// The width of a DDS file, or undefined if it can't be read
function getDDSSize(filePath) {
    return readDDSFileHeader(filePath)?.width;
}

/**
 * Make a DDS file of the given size from the mipmaps of one where
 * hasDDSMipMaps is true, leaving out the larger mipmaps.
 */
async function extractDDSMipMaps(inputPath, outputPath, size, format) {
    const buffer = await fs.promises.readFile(inputPath);
    const header = readDDSHeader(buffer);
    if (header == undefined || header.format.name != format || header.width != header.height
        || header.width < size || header.mipMapCount != Math.log2(header.width) + 1) {
        throw new Error(`${path.basename(inputPath)} doesn't have the mipmaps needed`);
    }

    let start = header.dataOffset;
    for (let levelSize = header.width; levelSize > size; levelSize >>= 1) {
        start += getLevelSize(levelSize, levelSize, header.format);
    }
    let end = start;
    for (let levelSize = size; levelSize >= 1; levelSize >>= 1) {
        end += getLevelSize(levelSize, levelSize, header.format);
    }
    if (end > buffer.length) throw new Error(`${path.basename(inputPath)} is incomplete`);

    // The same header, other than the size, the size of the largest
    // mipmap (the "linear size") and the mipmap count
    const newHeader = Buffer.from(buffer.subarray(0, header.dataOffset));
    newHeader.writeUInt32LE(size, 12);
    newHeader.writeUInt32LE(size, 16);
    newHeader.writeUInt32LE(getLevelSize(size, size, header.format), 20);
    newHeader.writeUInt32LE(Math.log2(size) + 1, 28);
    await fs.promises.writeFile(outputPath, Buffer.concat([newHeader, buffer.subarray(start, end)]));
}

/**
 * Decode a DDS file to RGBA pixels, from the smallest mipmap at least
 * minSize wide and high. Much faster than texconv, as only that mipmap
 * is decoded. Gives undefined for formats it can't decode. BC4 is shown
 * as grey and BC5 as red and green.
 */
function readDDSImage(filePath, minSize) {
    const buffer = fs.readFileSync(filePath);
    const header = readDDSHeader(buffer);
    if (header == undefined) return undefined;
    const { width, height, mipMapCount, format } = header;

    // Find the mipmap
    let offset = header.dataOffset;
    let level = { width, height, offset };
    for (let i = 1; i < mipMapCount; i++) {
        const next = { width: Math.max(1, width >> i), height: Math.max(1, height >> i) };
        if (Math.min(next.width, next.height) < minSize) break;
        offset += getLevelSize(level.width, level.height, format);
        level = { ...next, offset };
    }
    if (level.offset + getLevelSize(level.width, level.height, format) > buffer.length) return undefined;

    return { width: level.width, height: level.height, data: decodeBlocks(buffer, level, format.name) };
}

function decodeBlocks(buffer, level, formatName) {
    const { width, height } = level;
    const data = Buffer.alloc(width * height * 4);
    const pixels = new Uint8Array(16 * 4);
    const values = new Uint8Array(16);
    let offset = level.offset;

    for (let by = 0; by < Math.ceil(height / 4); by++) {
        for (let bx = 0; bx < Math.ceil(width / 4); bx++) {
            pixels.fill(255);
            switch (formatName) {
                case 'BC1':
                    decodeColorBlock(buffer, offset, pixels, true);
                    offset += 8;
                    break;
                case 'BC3':
                    decodeValueBlock(buffer, offset, values);
                    values.forEach((value, p) => pixels[p * 4 + 3] = value);
                    decodeColorBlock(buffer, offset + 8, pixels, false);
                    offset += 16;
                    break;
                case 'BC4':
                    decodeValueBlock(buffer, offset, values);
                    values.forEach((value, p) => pixels.fill(value, p * 4, p * 4 + 3));
                    offset += 8;
                    break;
                case 'BC5':
                    decodeValueBlock(buffer, offset, values);
                    values.forEach((value, p) => pixels[p * 4] = value);
                    decodeValueBlock(buffer, offset + 8, values);
                    values.forEach((value, p) => {
                        pixels[p * 4 + 1] = value;
                        pixels[p * 4 + 2] = 0;
                    });
                    offset += 16;
                    break;
            }

            // Copy the block's pixels into the image
            for (let p = 0; p < 16; p++) {
                const x = bx * 4 + (p & 3), y = by * 4 + (p >> 2);
                if (x < width && y < height) {
                    data.set(pixels.subarray(p * 4, p * 4 + 4), (y * width + x) * 4);
                }
            }
        }
    }
    return data;
}

// The 4 colours of a block are 2 RGB565 colours and 2 in between. BC1
// blocks with the first colour not larger have 1 in between and black
// transparent instead.
function decodeColorBlock(buffer, offset, pixels, isBC1) {
    const c0 = buffer.readUInt16LE(offset), c1 = buffer.readUInt16LE(offset + 2);
    const colors = [expand565(c0), expand565(c1)];
    if (c0 > c1 || !isBC1) {
        colors.push(colors[0].map((v, i) => Math.round((2 * v + colors[1][i]) / 3)));
        colors.push(colors[0].map((v, i) => Math.round((v + 2 * colors[1][i]) / 3)));
    } else {
        colors.push(colors[0].map((v, i) => Math.round((v + colors[1][i]) / 2)));
        colors.push([0, 0, 0, 0]);
    }

    // 16 2-bit indices, the first in the lowest bits
    const indices = buffer.readUInt32LE(offset + 4);
    for (let p = 0; p < 16; p++) {
        const color = colors[(indices >> (p * 2)) & 3];
        pixels.set(color.slice(0, 3), p * 4);
        if (color.length == 4) pixels[p * 4 + 3] = color[3];
    }
}

function expand565(c) {
    return [(c >> 11) & 31, (c >> 5) & 63, c & 31].map((v, i) => i == 1 ? (v << 2) | (v >> 4) : (v << 3) | (v >> 2));
}

// 2 values and 6 or 4 in between (then also 0 and 255), with 16 3-bit
// indices in the following 6 bytes, the first in the lowest bits.
function decodeValueBlock(buffer, offset, values) {
    const r0 = buffer[offset], r1 = buffer[offset + 1];
    const palette = [r0, r1];
    if (r0 > r1) {
        for (let k = 1; k < 7; k++) palette.push(Math.round(((7 - k) * r0 + k * r1) / 7));
    } else {
        for (let k = 1; k < 5; k++) palette.push(Math.round(((5 - k) * r0 + k * r1) / 5));
        palette.push(0, 255);
    }

    let bits = 0, bitCount = 0, next = offset + 2;
    for (let p = 0; p < 16; p++) {
        if (bitCount < 3) {
            bits |= buffer[next++] << bitCount;
            bitCount += 8;
        }
        values[p] = palette[bits & 7];
        bits >>= 3;
        bitCount -= 3;
    }
}

module.exports = {
    createDDSImage: createDDSImage,
    decompressDDSImage: decompressDDSImage,
    readDDSImage: readDDSImage,
    hasDDSMipMaps: hasDDSMipMaps,
    getDDSSize: getDDSSize,
    extractDDSMipMaps: extractDDSMipMaps
}
