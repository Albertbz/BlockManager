const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');


const cliPath = path.join(__dirname, 'CLI', 'compressonatorcli.exe');

// Both functions throw if the conversion fails.
function createDDSImage(inputPath, outputPath, format) {
    let command = `"${cliPath}" -fd ${format} -mipsize 1 "${inputPath}" "${outputPath}"`;
    runConversion(command, outputPath);
}

function decompressDDSImage(inputPath, outputPath) {
    let command = `"${cliPath}" "${inputPath}" "${outputPath}"`;
    runConversion(command, outputPath);
}

function runConversion(command, outputPath) {
    // Remove any old output so that a failed conversion can't be
    // mistaken for a successful one.
    fs.rmSync(outputPath, { force: true });

    execSync(command, {stdio: 'ignore'});

    if (!fs.existsSync(outputPath)) {
        throw new Error(`Could not create ${path.basename(outputPath)}`);
    }
}

module.exports = {
    createDDSImage: createDDSImage,
    decompressDDSImage: decompressDDSImage
}