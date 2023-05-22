const { execSync } = require('child_process');
const path = require('path');

const cliPath = path.join(__dirname, 'PVRTexToolCLI.exe');

function createDDSImage(inputPath, outputPath, format, resize = false, width = 0, height = 0) {
    let command = `"${cliPath}" -i "${inputPath}" -o "${outputPath}" -m -f ${format} -ics lRGB`;
    if (resize) {
        command = `${command} -r ${width},${height}`;
    }
    execSync(command, {stdio: 'ignore'});
}

function decompressDDSImage(inputPath, outputPath) {
    let command = `"${cliPath}" -i "${inputPath}" -d "${outputPath}" -ics sRGB -noout`;
    execSync(command, {stdio: 'ignore'});
}

module.exports = {
    createDDSImage: createDDSImage,
    decompressDDSImage: decompressDDSImage
}