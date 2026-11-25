import { mkdir, readFile, writeFile } from 'node:fs/promises';
const source = await readFile('worker.mjs', 'utf8');
const page = await readFile('page.mjs', 'utf8');
await mkdir('dist/server', { recursive: true });
await writeFile('dist/server/index.js', page.replace('export function page', 'function page') + '\n' + source.replace("import { page } from './page.mjs';", ''));
