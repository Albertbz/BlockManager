const fs = require('fs');
const path = require('path');

// OneDrive marks some folders as read-only, and packaging copies that
// into the output. Windows can't delete read-only folders, so the next
// package would fail when replacing the old output.
function clearReadOnly(dir) {
  if (!fs.existsSync(dir)) return;
  fs.chmodSync(dir, 0o777);
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) clearReadOnly(entryPath);
    else fs.chmodSync(entryPath, 0o666);
  }
}

module.exports = {
  hooks: {
    generateAssets: async () => clearReadOnly(path.join(__dirname, 'out')),
    // The app is only in English, so Chromium's other languages aren't needed
    postPackage: async (forgeConfig, { outputPaths }) => {
      for (const outputPath of outputPaths) {
        const localesPath = path.join(outputPath, 'locales');
        if (!fs.existsSync(localesPath)) continue;
        for (const file of fs.readdirSync(localesPath)) {
          if (file != 'en-US.pak') fs.rmSync(path.join(localesPath, file));
        }
      }
    },
  },
  publishers: [
    {
      name: '@electron-forge/publisher-github',
      config: {
        repository: {
          owner: 'Albertbz',
          name: 'BlockManager',
        },
        prerelease: false,
        draft: true,
      },
    },
  ],
  packagerConfig: {
    name: 'Block Manager',
    icon: './images/icon',
    // Folders only used while developing, or made when the app runs
    ignore: [
      /^\/(\.claude|\.vscode|readme_images|test-recipes|temp|temp_textures|texture_cache|thumbnails|preview)(\/|$)/,
    ],
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'win32'],
    },
    {
      name: '@electron-forge/maker-deb',
      config: {},
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {},
    },
  ],
};
