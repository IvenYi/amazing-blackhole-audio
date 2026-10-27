import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = path.join(root, 'work/doc-check');
const current = path.join(fixture, 'current');
const migrated = path.join(fixture, 'migrated');
await fs.mkdir(current, { recursive: true });
await fs.mkdir(path.join(migrated, 'features/black-hole'), { recursive: true });
const migrationTarget = path.join(migrated, 'features/black-hole');
for (const name of ['components', 'audio', 'examples']) {
  await fs.cp(path.join(root, 'src', name), path.join(migrationTarget, name), { recursive: true });
}
for (const name of ['presets.ts', 'recording-visual-config.ts', 'index.ts']) {
  await fs.copyFile(path.join(root, 'src', name), path.join(migrationTarget, name));
}

const documents = ['README.md', ...(await fs.readdir(path.join(root, 'docs'))).filter(name => name.endsWith('.md')).map(name => `docs/${name}`)];
const texts = new Map();
const snippets = [];
const brokenLinks = [];
for (const name of documents) {
  const text = await fs.readFile(path.join(root, name), 'utf8');
  texts.set(name, text);
  for (const link of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = link[1].split('#')[0];
    if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
    try { await fs.access(path.resolve(path.dirname(path.join(root, name)), target)); }
    catch { brokenLinks.push({ document: name, target }); }
  }
  let number = 0;
  for (const match of text.matchAll(/```(tsx|ts)\r?\n([\s\S]*?)```/g)) {
    const isMigration = match[2].includes("'./features/black-hole");
    const folder = isMigration ? migrated : current;
    const filename = `${path.basename(name, '.md').toLowerCase()}-${number++}.${match[1]}`;
    const code = match[2].replace(/(['"])\.\/src(?=\/|\1)/g, '$1../../../src');
    const output = path.join(folder, filename);
    await fs.writeFile(output, code);
    snippets.push({ document: name, file: path.relative(fixture, output).replaceAll('\\', '/') });
  }
}

const coverageTargets = [
  ['src/components/BlackHole.tsx', 'BlackHoleProps', 'docs/COMPONENT_API.md'],
  ['src/components/RecordingBlackHole.tsx', 'RecordingBlackHoleProps', 'docs/COMPONENT_API.md'],
  ['src/examples/RecorderBlackHole.tsx', 'RecorderBlackHoleProps', 'docs/COMPONENT_API.md'],
  ['src/audio/reactive.ts', 'AudioReactiveOptions', 'docs/AUDIO_TUNING.md'],
  ['src/audio/web-audio.ts', 'WebAudioAnalyserOptions', 'docs/COMPONENT_API.md'],
  ['src/audio/web-audio.ts', 'MicrophoneAudioSourceOptions', 'docs/COMPONENT_API.md'],
];
const coverage = [];
for (const [source, name, document] of coverageTargets) {
  const code = await fs.readFile(path.join(root, source), 'utf8');
  const body = code.match(new RegExp(`export interface ${name}[^\\{]*\\{([\\s\\S]*?)\\r?\\n\\}`))?.[1];
  if (!body) throw new Error(`Cannot locate interface ${name}`);
  const fields = [...body.matchAll(/^\s{2}(\w+)\??:/gm)].map(match => match[1]);
  const text = texts.get(document);
  const missing = fields.filter(field => !new RegExp(`\\b${field}\\b`).test(text));
  coverage.push({ source, interface: name, fields, count: fields.length, missing, passed: missing.length === 0 });
}
const report = { snippets, snippetCount: snippets.length, coverage, brokenLinks, passed: coverage.every(item => item.passed) && brokenLinks.length === 0 };
await fs.writeFile(path.join(fixture, 'tsconfig.json'), JSON.stringify({ extends: '../../tsconfig.json', include: snippets.map(item => `./${item.file}`), exclude: [] }, null, 2));
await fs.writeFile(path.join(fixture, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ snippetCount: report.snippetCount, interfaces: coverage.map(item => ({ name: item.interface, fields: item.count, missing: item.missing })), brokenLinks, passed: report.passed }, null, 2));
if (!report.passed) process.exitCode = 1;
