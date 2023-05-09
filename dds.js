const { exec } = require('child_process');

async function createDDSImage(inputPath, outputPath, format) {
    const cliPath = 'PVRTexToolCLI.exe'
    exec(`"${cliPath}" -i "${inputPath}" -o "${outputPath}" -m -f ${format} -ics lRGB`,
        (error, stdout, stderr) => {
            if (error) {
                console.log(error);
                return;
            }
            console.log(`stdout: ${stdout}`);
        });
}

module.exports = {
    createDDSImage: createDDSImage
}