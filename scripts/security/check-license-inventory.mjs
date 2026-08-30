import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const FORBIDDEN_LICENSE_PATTERNS = [
  /\bAGPL(?:-|\b)/i,
  /\bSSPL(?:-|\b)/i,
  /\bBUSL(?:-|\b)/i,
  /Commons[- ]Clause/i,
  /PolyForm/i,
  /\bUNLICENSED\b/i,
  /\bUNKNOWN\b/i,
];

const input = process.argv[2];
const output = process.argv[3] ?? '.build/security/licenses.json';
let raw;
if (input) {
  raw = await readFile(input, 'utf8');
} else {
  raw = execFileSync('pnpm', ['licenses', 'list', '--prod', '--json'], { encoding: 'utf8' });
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, raw.endsWith('\n') ? raw : `${raw}\n`, 'utf8');
}

const inventory = JSON.parse(raw);
const licenses = new Set();
let packageRecords = 0;

function addLicense(value) {
  if (typeof value === 'string' && value.trim()) licenses.add(value.trim());
  else if (Array.isArray(value)) value.forEach(addLicense);
}

function walk(value, depth = 0) {
  if (Array.isArray(value)) {
    value.forEach((item) => walk(item, depth + 1));
    return;
  }
  if (!value || typeof value !== 'object') return;

  if (typeof value.name === 'string' && typeof value.version === 'string') packageRecords += 1;
  if ('license' in value) addLicense(value.license);
  if ('licenses' in value) addLicense(value.licenses);

  for (const [key, child] of Object.entries(value)) {
    if (depth === 0 && Array.isArray(child) && child.length && child.every((item) => item && typeof item === 'object')) {
      licenses.add(key);
    }
    walk(child, depth + 1);
  }
}
walk(inventory);

if (!licenses.size) {
  console.error('RR9_LICENSE_BLOCK: production license inventory contained no recognizable license identifiers.');
  process.exit(1);
}

const forbidden = [...licenses].filter((license) => FORBIDDEN_LICENSE_PATTERNS.some((pattern) => pattern.test(license)));
if (forbidden.length) {
  console.error(`RR9_LICENSE_BLOCK: forbidden or unresolved production license(s): ${forbidden.sort().join(', ')}`);
  process.exit(1);
}

console.log(`RR9_LICENSE_PASS ${licenses.size} license identifiers${packageRecords ? ` across ${packageRecords} package records` : ''}`);
console.log([...licenses].sort().join('\n'));
