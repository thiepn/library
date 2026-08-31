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

function normalizeLicense(value) {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (value && typeof value === 'object' && typeof value.type === 'string' && value.type.trim()) return value.type.trim();
  if (Array.isArray(value)) {
    const parts = value.map(normalizeLicense).filter(Boolean);
    return parts.length ? parts.join(' OR ') : undefined;
  }
  return undefined;
}

async function manifestFor(node, name) {
  const candidates = [];
  if (typeof node?.path === 'string' && node.path) candidates.push(path.join(node.path, 'package.json'));
  if (typeof node?.resolved === 'string' && node.resolved.startsWith('file:')) candidates.push(path.resolve(node.resolved.slice(5), 'package.json'));
  candidates.push(path.join('node_modules', name, 'package.json'));
  for (const candidate of candidates) {
    try {
      return JSON.parse(await readFile(candidate, 'utf8'));
    } catch {
      // Try the next concrete installation path.
    }
  }
  return undefined;
}

async function collectFromGraph(root) {
  const records = new Map();
  const seenNodes = new Set();

  async function visitDependencies(dependencies) {
    if (!dependencies || typeof dependencies !== 'object') return;
    for (const [name, node] of Object.entries(dependencies)) {
      if (!node || typeof node !== 'object') continue;
      const version = typeof node.version === 'string' ? node.version : 'unknown';
      const key = `${name}@${version}`;
      const nodeKey = `${key}:${node.path ?? ''}`;
      if (seenNodes.has(nodeKey)) continue;
      seenNodes.add(nodeKey);

      const manifest = await manifestFor(node, name);
      const license = normalizeLicense(manifest?.license ?? manifest?.licenses) ?? 'UNKNOWN';
      records.set(key, {
        name,
        version,
        license,
        path: typeof node.path === 'string' ? node.path : undefined,
      });
      await visitDependencies(node.dependencies);
      await visitDependencies(node.optionalDependencies);
    }
  }

  await visitDependencies(root?.dependencies);
  await visitDependencies(root?.optionalDependencies);
  return [...records.values()].sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`));
}

let records;
if (input) {
  const parsed = JSON.parse(await readFile(input, 'utf8'));
  records = Array.isArray(parsed) ? parsed : parsed.records;
  if (!Array.isArray(records)) throw new Error('License inventory input must be an array or { records } object.');
} else {
  const raw = execFileSync('pnpm', ['list', '--prod', '--json', '--depth', 'Infinity'], { encoding: 'utf8' });
  const graph = JSON.parse(raw);
  const root = Array.isArray(graph) ? graph[0] : graph;
  records = await collectFromGraph(root);
}

if (!records.length) {
  console.error('RR9_LICENSE_BLOCK: production dependency graph contained no package records.');
  process.exit(1);
}

const unresolved = records.filter((record) => !record.license || record.license === 'UNKNOWN');
const forbidden = records.filter((record) => FORBIDDEN_LICENSE_PATTERNS.some((pattern) => pattern.test(record.license ?? 'UNKNOWN')));

await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify({ schemaVersion: 1, scope: 'production', records }, null, 2)}\n`, 'utf8');

if (unresolved.length) {
  console.error(`RR9_LICENSE_BLOCK: unresolved production license metadata: ${unresolved.map((record) => `${record.name}@${record.version}`).join(', ')}`);
  process.exit(1);
}
if (forbidden.length) {
  console.error(`RR9_LICENSE_BLOCK: forbidden production license(s): ${forbidden.map((record) => `${record.name}@${record.version} (${record.license})`).join(', ')}`);
  process.exit(1);
}

const licenses = [...new Set(records.map((record) => record.license))].sort();
console.log(`RR9_LICENSE_PASS ${licenses.length} license identifiers across ${records.length} production package records -> ${output}`);
console.log(licenses.join('\n'));
