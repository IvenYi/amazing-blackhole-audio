import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const originalPath = path.join(root, 'work/visual-qa/original-preview-bundle.js');
const referencePath = path.join(root, 'work/visual-qa/original-reference.jsx');
const reconstructionPath = path.join(root, 'src/components/black-hole-shaders.ts');
const [original, reference, reconstruction] = await Promise.all(
  [originalPath, referencePath, reconstructionPath].map(file => readFile(file, 'utf8')),
);
const sha256 = text => createHash('sha256').update(text).digest('hex');
const normalize = text => text.replace(/\r\n/g, '\n');
const firstDifference = (a, b) => {
  let index = 0;
  while (index < Math.min(a.length, b.length) && a[index] === b[index]) index++;
  return index === a.length && index === b.length ? null : {
    index,
    originalContext: a.slice(Math.max(0, index - 40), index + 80),
    reconstructionContext: b.slice(Math.max(0, index - 40), index + 80),
  };
};
const match = original.match(/x=`([\s\S]*?)`,y=`([\s\S]*?)`,w=`([\s\S]*?)`,C=`([\s\S]*?)`,S=`([\s\S]*?)`,F=/);
if (!match) throw new Error('Could not identify the five original shader strings.');
const shaderNames = ['vertexShader', 'fieldShader', 'downsampleShader', 'upsampleShader', 'compositeShader'];
const shaderResults = shaderNames.map((name, index) => {
  const localMatch = reconstruction.match(new RegExp('export const ' + name + ' = `([\\s\\S]*?)`;'));
  if (!localMatch) throw new Error('Missing reconstructed shader: ' + name);
  const originalShader = normalize(match[index + 1].replace(/\\n/g, '\n'));
  const reconstructedShader = normalize(localMatch[1]);
  const difference = firstDifference(originalShader, reconstructedShader);
  return {
    name,
    equal: difference === null,
    originalLength: originalShader.length,
    reconstructedLength: reconstructedShader.length,
    originalSha256: sha256(originalShader),
    reconstructedSha256: sha256(reconstructedShader),
    firstDifference: difference,
  };
});
const startMarker = 'let d=(e,t,o)=>';
const endMarker = 'F.displayName="BlackHole"';
const extractCore = source => {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  if (start < 0 || end < 0) throw new Error('Core component delimiters missing.');
  return source.slice(start, end + endMarker.length);
};
const instrumentation = [
  ['b=()=>window.matchMedia("(prefers-reduced-motion: reduce)").matches', 'b=()=>true'],
  ['F.uTime.value=.5*G-2.2*a', 'F.uTime.value=baselineShaderTime'],
  ['M.uFrame.value=W%64', 'M.uFrame.value=0'],
];
let expectedCore = extractCore(original);
for (const [before, after] of instrumentation) {
  if (expectedCore.split(before).length - 1 !== 1) throw new Error('Instrumentation target is not unique: ' + before);
  expectedCore = expectedCore.replace(before, after);
}
const referenceCore = extractCore(reference);
const baselineDifference = firstDifference(normalize(expectedCore), normalize(referenceCore));
const result = {
  checkedAt: new Date().toISOString(),
  sourceUrl: 'https://pro.reactbits.dev/_next/static/chunks/30792.926c30b9ce998297.js',
  sourceFileSha256: sha256(original),
  shaderResults,
  baselineCore: {
    equalAfterDocumentedInstrumentation: baselineDifference === null,
    instrumentationCount: instrumentation.length,
    expectedSha256: sha256(normalize(expectedCore)),
    referenceSha256: sha256(normalize(referenceCore)),
    firstDifference: baselineDifference,
  },
  allPassed: shaderResults.every(shader => shader.equal) && baselineDifference === null,
};
await writeFile(path.join(root, 'work/visual-qa/shader-verification.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
if (!result.allPassed) process.exitCode = 1;
