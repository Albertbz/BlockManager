const { execSync } = require('child_process');
const path = require('path');

const cliPath = path.join(__dirname, 'CLI', 'compressonatorcli.exe');

function createDDSImage(inputPath, outputPath, format) {
    let command = `"${cliPath}" -fd ${format} -mipsize 1 "${inputPath}" "${outputPath}"`;
    execSync(command, {stdio: 'ignore'});
}

function decompressDDSImage(inputPath, outputPath) {
    let command = `"${cliPath}" "${inputPath}" "${outputPath}"`;
    execSync(command, {stdio: 'ignore'});
}

module.exports = {
    createDDSImage: createDDSImage,
    decompressDDSImage: decompressDDSImage
}