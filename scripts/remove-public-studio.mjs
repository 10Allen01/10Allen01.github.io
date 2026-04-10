import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const studioDirectory = resolve('dist', 'studio');
const studioHtml = resolve('dist', 'studio.html');

if (existsSync(studioDirectory)) {
  rmSync(studioDirectory, { recursive: true, force: true });
}

if (existsSync(studioHtml)) {
  rmSync(studioHtml, { force: true });
}

console.log('Removed Studio route from production build output.');
