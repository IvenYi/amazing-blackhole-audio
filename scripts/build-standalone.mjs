import fs from 'node:fs/promises';
import path from 'node:path';

const directory = path.resolve('dist');
let html = await fs.readFile(path.join(directory, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g)];
for (const match of scripts) {
  const code = await fs.readFile(path.join(directory, match[1].replace(/^\.\//, '')), 'utf8');
  html = html.replace(match[0], () => `<script type="module">${code.replace(/<\/script/gi, '<\\/script')}</script>`);
}
const styles = [...html.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*>/g)];
for (const match of styles) {
  const href = /href="([^"]+)"/.exec(match[0])?.[1];
  if (!href) continue;
  const css = await fs.readFile(path.join(directory, href.replace(/^\.\//, '')), 'utf8');
  html = html.replace(match[0], () => `<style>${css}</style>`);
}
if (/<(?:script|link)\b[^>]*(?:src|href)="\.\/assets\//.test(html)) {
  throw new Error('Standalone output still has external asset references.');
}
await fs.writeFile(path.join(directory, 'black-hole.html'), html);
console.log(`Standalone offline preview: dist/black-hole.html (${Buffer.byteLength(html)} bytes)`);
