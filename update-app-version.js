// update-app-version.js
const fs = require('fs');
const path = require('path');

const packageJson = require(path.resolve(__dirname, 'package.json'));
const version = packageJson.version;
const targetFile = path.resolve(__dirname, 'client/src/lib/appVersion.ts');

const content = `export const APP_VERSION = "${version}";\n`;
fs.writeFileSync(targetFile, content);
console.log(`APP_VERSION updated to ${version}`);
