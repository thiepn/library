import { readFile } from 'node:fs/promises';

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function block(message) {
  console.error(`V1_RELEASE_BLOCK: ${message}`);
  process.exit(1);
}

const expectedSha = argument('--expected-sha') ?? process.env.EXPECTED_SOURCE_SHA ?? '';
const physicalEvidenceSha = argument('--physical-evidence-sha') ?? process.env.PHYSICAL_EVIDENCE_SHA ?? '';
const physicalReportPath = argument('--physical-report') ?? process.env.PHYSICAL_RELEASE_REPORT ?? '.build/release/physical-device-release.json';
if (!/^[a-f0-9]{40}$/i.test(expectedSha)) block('an exact 40-character --expected-sha is required');
if (!/^[a-f0-9]{40}$/i.test(physicalEvidenceSha)) block('an exact 40-character --physical-evidence-sha is required');

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
if (pkg.version !== '1.0.0') block(`package.json must be version 1.0.0, found ${pkg.version}`);

const changelog = await readFile('CHANGELOG.md', 'utf8');
if (!/^## \[?1\.0\.0\]?\b/m.test(changelog)) block('CHANGELOG.md must contain a 1.0.0 release section');

let physicalReport;
try {
  physicalReport = JSON.parse(await readFile(physicalReportPath, 'utf8'));
} catch (error) {
  block(`unable to read the physical-device release report at ${physicalReportPath}: ${error instanceof Error ? error.message : String(error)}`);
}
if (
  physicalReport?.schemaVersion !== 1
  || physicalReport?.mode !== 'release'
  || String(physicalReport?.expectedSha ?? '').toLowerCase() !== expectedSha.toLowerCase()
  || !Array.isArray(physicalReport?.selectedRecords)
  || physicalReport.selectedRecords.length !== 12
  || !Array.isArray(physicalReport?.errors)
  || physicalReport.errors.length !== 0
) {
  block('physical-device release report does not prove 12/12 current passing targets for the expected source SHA');
}

const repository = process.env.GITHUB_REPOSITORY ?? 'thiepn/library';
const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
const branchResponse = await fetch(`https://api.github.com/repos/${repository}/branches/main`, { headers });
if (!branchResponse.ok) block(`unable to verify main branch protection (${branchResponse.status})`);
const branch = await branchResponse.json();
if (branch.protected !== true) block('main is not protected; v1.0 tagging is disabled until protected gates are enabled');

const releaseResponse = await fetch('https://thiepn.dev/library/release-identity.json', { cache: 'no-store' });
if (!releaseResponse.ok) block(`unable to read live release identity (${releaseResponse.status})`);
const release = await releaseResponse.json();
if (release?.schemaVersion !== 1 || release?.sourceSha !== expectedSha) {
  block(`live production is not the expected source SHA (${expectedSha}); found ${release?.sourceSha ?? 'unknown'}`);
}

for (const file of ['SECURITY.md', 'docs/RR9_SECURITY_PRIVACY_V1_LAUNCH.md', 'docs/V1_RELEASE_OPERATIONS.md']) {
  const text = await readFile(file, 'utf8');
  if (!text.trim()) block(`${file} is missing release documentation`);
}

console.log(`V1_RELEASE_GATE_PASS source=${expectedSha} physicalEvidence=${physicalEvidenceSha}`);
