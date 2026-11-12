'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const src = path.join(root, 'public');
const dest = path.join(root, 'docs');

fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(src, dest, { recursive: true });

console.log(`Build PWA concluído: ${dest}`);
