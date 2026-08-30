import { mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const outputDir = 'artifacts/security';
await mkdir(outputDir, { recursive: true });

function run(args) {
  const result = spawnSync(pnpm, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    console.error(result.stderr?.trim() || `pnpm ${args.join(' ')} failed.`);
    process.exit(result.status ?? 1);
  }
  return result.stdout;
}

const sbomRaw = run(['sbom', '--prod', '--sbom-format', 'cyclonedx', '--sbom-spec-version', '1.7']);
const licensesRaw = run(['licenses', 'list', '--prod', '--json']);

let sbom;
let licenses;
try {
  sbom = JSON.parse(sbomRaw);
  licenses = JSON.parse(licensesRaw);
} catch {
  console.error('Supply-chain evidence command returned invalid JSON.');
  process.exit(1);
}

if (sbom?.bomFormat !== 'CycloneDX' || !Array.isArray(sbom?.components)) {
  console.error('pnpm SBOM output is not a valid CycloneDX component inventory.');
  process.exit(1);
}
if (!licenses || typeof licenses !== 'object' || Array.isArray(licenses)) {
  console.error('pnpm license inventory has an unexpected shape.');
  process.exit(1);
}

const licenseExpressions = Object.keys(licenses).sort();
const invalidLicenses = licenseExpressions.filter((license) =>
  /(?:^|\b)(?:unknown|unlicensed|none|no license|see license in)(?:\b|$)/i.test(license),
);
if (invalidLicenses.length) {
  console.error(`Production dependency license inventory contains unresolved declarations: ${invalidLicenses.join(', ')}`);
  process.exit(1);
}

await writeFile(`${outputDir}/sbom.cdx.json`, `${JSON.stringify(sbom, null, 2)}\n`, 'utf8');
await writeFile(`${outputDir}/licenses.json`, `${JSON.stringify(licenses, null, 2)}\n`, 'utf8');
await writeFile(`${outputDir}/supply-chain-summary.json`, `${JSON.stringify({
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  sbomFormat: sbom.bomFormat,
  sbomSpecVersion: sbom.specVersion,
  componentCount: sbom.components.length,
  productionLicenseExpressions: licenseExpressions,
}, null, 2)}\n`, 'utf8');

console.log(`SECURITY_SUPPLY_CHAIN_PASS components=${sbom.components.length} licenses=${licenseExpressions.length}`);
