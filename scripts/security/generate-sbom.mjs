import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';

const output = process.argv[2] ?? '.build/security/sbom.cdx.json';
const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
const lock = YAML.parse(await readFile('pnpm-lock.yaml', 'utf8'));

function parsePackageKey(key) {
  const index = key.lastIndexOf('@');
  if (index <= 0 || index >= key.length - 1) return undefined;
  const name = key.slice(0, index);
  const rawVersion = key.slice(index + 1);
  const version = rawVersion.replace(/\(.+$/, '');
  if (!name || !version || /^(?:file:|link:|workspace:)/.test(version)) return undefined;
  return { name, version };
}

function integrityHash(record) {
  const integrity = record?.resolution?.integrity;
  if (typeof integrity !== 'string') return undefined;
  const match = integrity.match(/^sha512-(.+)$/);
  if (!match) return undefined;
  try {
    return Buffer.from(match[1], 'base64').toString('hex').toUpperCase();
  } catch {
    return undefined;
  }
}

const components = [];
for (const [key, record] of Object.entries(lock?.packages ?? {})) {
  const parsed = parsePackageKey(key);
  if (!parsed) continue;
  const hash = integrityHash(record);
  components.push({
    type: 'library',
    name: parsed.name,
    version: parsed.version,
    'bom-ref': `pkg:npm/${encodeURIComponent(parsed.name)}@${encodeURIComponent(parsed.version)}`,
    purl: `pkg:npm/${encodeURIComponent(parsed.name)}@${encodeURIComponent(parsed.version)}`,
    ...(hash ? { hashes: [{ alg: 'SHA-512', content: hash }] } : {}),
  });
}
components.sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`));

const bom = {
  bomFormat: 'CycloneDX',
  specVersion: '1.6',
  version: 1,
  metadata: {
    component: {
      type: 'application',
      name: packageJson.name,
      version: packageJson.version,
    },
    properties: [
      { name: 'thiepn.library.lockfileVersion', value: String(lock?.lockfileVersion ?? 'unknown') },
      { name: 'thiepn.library.packageManager', value: String(packageJson.packageManager ?? 'unknown') },
    ],
  },
  components,
};

await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(bom, null, 2)}\n`, 'utf8');
console.log(`RR9_SBOM_PASS ${components.length} components -> ${output}`);
