const { exec } = require('child_process');
const path = require('path');

function createDDSImage(inputPath, outputPath, format, resize = false, width = 0, height = 0) {
    const cliPath = path.join(__dirname, 'PVRTexToolCLI.exe');
    let command = `"${cliPath}" -i "${inputPath}" -o "${outputPath}" -m -f ${format} -ics lRGB`;
    if (resize) {
        command = `${command} -r ${width},${height}`;
    }
    exec(command,
        (error, stdout, stderr) => {
            if (error) {
                console.log(error);
                return;
            }
            //console.log(`stdout: ${stdout}`);
        });
}

module.exports = {
    createDDSImage: createDDSImage
}