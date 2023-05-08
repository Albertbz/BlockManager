const { exec } = require('child_process');

async function createDDSImage(inputPath, outputPath, format) {
    //const cliPath = 'C:\\Imagination Technologies\\PowerVR_Graphics\\PowerVR_Tools\\PVRTexTool\\CLI\\Windows_x86_64\\PVRTexToolCLI.exe';
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