import { access, readFile } from 'node:fs/promises';
import { evaluateRelease, run as validateEvidence, validateRecord } from './physical-device-evidence.mjs';

const checks = [];
const pass = (id, ok, detail) => checks.push({ id, ok, detail });
const exists = async (file) => { try { await access(file); return true; } catch { return false; } };

const files = [
  'docs/RR2_PHYSICAL_DEVICE_ACCEPTANCE.md',
  'docs/RELEASE_READINESS_ROADMAP.md',
  'docs/RELEASE_SUPPORT_CONTRACT.md',
  'evidence/physical-devices/README.md',
  'evidence/physical-devices/matrix.json',
  'evidence/physical-devices/record.schema.json',
  'evidence/physical-devices/records/_record-template.json',
  'scripts/certification/physical-device-evidence.mjs',
  '.github/workflows/physical-device-evidence.yml',
  '.github/ISSUE_TEMPLATE/physical-device-defect.yml',
];
const present = (await Promise.all(files.map(exists))).every(Boolean);
pass('RR2_PHYSICAL_FILES', present, 'RR2 protocol, matrix, schema, template, validator, workflow, and defect intake are present');

if (present) {
  const [protocol, roadmap, support, evidenceReadme, matrixText, schema, templateText, validator, workflow, issueTemplate, pkg, readme] = await Promise.all([
    readFile('docs/RR2_PHYSICAL_DEVICE_ACCEPTANCE.md', 'utf8'),
    readFile('docs/RELEASE_READINESS_ROADMAP.md', 'utf8'),
    readFile('docs/RELEASE_SUPPORT_CONTRACT.md', 'utf8'),
    readFile('evidence/physical-devices/README.md', 'utf8'),
    readFile('evidence/physical-devices/matrix.json', 'utf8'),
    readFile('evidence/physical-devices/record.schema.json', 'utf8'),
    readFile('evidence/physical-devices/records/_record-template.json', 'utf8'),
    readFile('scripts/certification/physical-device-evidence.mjs', 'utf8'),
    readFile('.github/workflows/physical-device-evidence.yml', 'utf8'),
    readFile('.github/ISSUE_TEMPLATE/physical-device-defect.yml', 'utf8'),
    readFile('package.json', 'utf8'),
    readFile('README.md', 'utf8'),
  ]);
  const matrix = JSON.parse(matrixText);
  const template = JSON.parse(templateText);
  const targetIds = new Set(matrix.targets.map((target) => target.id));
  const journeyIds = new Set(matrix.journeys.map((journey) => journey.id));

  pass(
    'RR2_PHYSICAL_ROADMAP',
    roadmap.includes('## Phase 2 — Physical-device acceptance and evidence')
      && roadmap.includes('## Phase 3 — Publication-format compatibility and hostile-file handling')
      && roadmap.includes('Physical-device release candidate re-run')
      && roadmap.includes('Current state'),
    'The roadmap executes named physical-device evidence immediately after the browser-engine baseline while preserving later release phases',
  );

  pass(
    'RR2_PHYSICAL_PROTOCOL',
    protocol.includes('## Target matrix')
      && protocol.includes('## Execution protocol')
      && protocol.includes('## Journey acceptance criteria')
      && protocol.includes('## Evidence rules')
      && protocol.includes('## Defect policy')
      && protocol.includes('## Exit criteria')
      && protocol.includes('0/12'),
    'The RR2 protocol defines targets, execution, evidence, defect handling, exit rules, and the honest pending baseline',
  );

  pass(
    'RR2_PHYSICAL_SUPPORT_BOUNDARY',
    support.includes('## Physical-device certification requirements')
      && support.includes('exact 40-character build SHA')
      && support.includes('No placeholder, emulator, simulator, or device profile counts')
      && support.includes('maximum age')
      && support.includes('P0')
      && support.includes('P1'),
    'The support contract prevents simulated or stale evidence from being presented as physical certification',
  );

  const requiredTargets = [
    'android-chrome', 'android-samsung-internet', 'android-firefox', 'android-low-end-chrome',
    'ios-safari', 'ios-pwa', 'ipados-safari',
    'windows-edge', 'windows-chrome', 'windows-firefox',
    'macos-safari', 'macos-chrome',
  ];
  pass(
    'RR2_PHYSICAL_MATRIX',
    matrix.schemaVersion === 1
      && matrix.phaseId === 'RR2'
      && matrix.targets.length === 12
      && matrix.journeys.length >= 15
      && requiredTargets.every((targetId) => targetIds.has(targetId))
      && ['sustained-session', 'background-resume', 'software-keyboard', 'offline-pwa'].every((journeyId) => journeyIds.has(journeyId))
      && matrix.targets.every((target) => target.requiredForRelease === true && target.physicalOnly === true),
    'The release matrix covers 12 named physical environments, sustained sessions, lifecycle recovery, keyboard behavior, and PWA/offline evidence',
  );

  pass(
    'RR2_PHYSICAL_SCHEMA',
    schema.includes('"buildSha"')
      && schema.includes('"physical"')
      && schema.includes('"sessionMinutes"')
      && schema.includes('"journeys"')
      && schema.includes('"defects"')
      && schema.includes('"evidence"'),
    'The evidence schema records exact release identity, real hardware, journey results, duration, defects, and supporting evidence',
  );

  pass(
    'RR2_PHYSICAL_TEMPLATE_NON_EVIDENCE',
    template.status === 'blocked'
      && template.release.buildSha === '0000000000000000000000000000000000000000'
      && template.device.physical === true
      && template.notes.includes('Placeholder records never count')
      && evidenceReadme.includes('Files beginning with `_` are templates')
      && evidenceReadme.includes('never count as evidence'),
    'The checked-in record template is deliberately invalid for certification and cannot silently satisfy a target',
  );

  pass(
    'RR2_PHYSICAL_VALIDATOR',
    validator.includes("mode: 'structure'")
      && validator.includes("options.mode === 'release'")
      && validator.includes('--expected-sha')
      && validator.includes('device.physical must be true')
      && validator.includes('maximumEvidenceAgeDays')
      && validator.includes("['P0', 'P1'].includes(defect.severity)")
      && validator.includes('RR2_PHYSICAL_DEVICE_RELEASE_PASS'),
    'The executable validator separates structural CI from exact-SHA release certification and rejects virtual, stale, or critically defective evidence',
  );

  pass(
    'RR2_PHYSICAL_WORKFLOW',
    workflow.includes('workflow_dispatch:')
      && workflow.includes('tested_build_sha:')
      && workflow.includes('--mode structure')
      && workflow.includes('--mode release')
      && workflow.includes('--expected-sha')
      && workflow.includes('actions/upload-artifact@v4')
      && workflow.includes('Enforce physical-device result'),
    'A permanent workflow validates every evidence change and provides an auditable manual exact-build release gate',
  );

  pass(
    'RR2_PHYSICAL_DEFECT_INTAKE',
    issueTemplate.includes('Physical-device defect')
      && issueTemplate.includes('Build SHA')
      && issueTemplate.includes('Target ID')
      && issueTemplate.includes('Severity')
      && issueTemplate.includes('Expected behavior')
      && issueTemplate.includes('Actual behavior'),
    'Physical-device findings have structured build, target, severity, reproduction, and evidence fields',
  );

  pass(
    'RR2_PHYSICAL_PACKAGE_COMMANDS',
    pkg.includes('"certify:physical:structure": "node scripts/certification/physical-device-evidence.mjs --mode structure"')
      && pkg.includes('"certify:physical:release": "node scripts/certification/physical-device-evidence.mjs --mode release"')
      && pkg.includes('release-contract.mjs && node scripts/certification/physical-device-contract.mjs'),
    'Stable package commands expose structural and exact-release evidence gates, and RR2 source certification is permanent',
  );

  pass(
    'RR2_PHYSICAL_README',
    readme.includes('pnpm certify:physical:structure')
      && readme.includes('pnpm certify:physical:release -- --expected-sha')
      && readme.includes('docs/RR2_PHYSICAL_DEVICE_ACCEPTANCE.md')
      && readme.includes('evidence/physical-devices/README.md'),
    'Maintainer documentation exposes the RR2 workflow and evidence locations',
  );

  const structureResult = await validateEvidence({
    mode: 'structure',
    matrix: 'evidence/physical-devices/matrix.json',
    records: 'evidence/physical-devices/records',
    expectedSha: '',
    report: '',
  });
  pass('RR2_PHYSICAL_STRUCTURE', structureResult.ok, 'The checked-in matrix and all non-template evidence records pass executable structural validation');

  const syntheticSha = '1'.repeat(40);
  const syntheticNow = new Date();
  const syntheticRecords = matrix.targets.map((target) => {
    const recordId = `synthetic-${target.id}`;
    const record = {
      schemaVersion: 1,
      recordId,
      targetId: target.id,
      status: 'pass',
      testedAt: syntheticNow.toISOString(),
      tester: { name: 'RR2 certification self-test' },
      release: { version: 'self-test', buildSha: syntheticSha, url: 'https://thiepn.dev/library' },
      device: { manufacturer: 'Synthetic fixture', model: target.label, physical: true, memoryGb: target.deviceConstraints?.maxMemoryGb ?? 8 },
      environment: { platform: target.platform, osVersion: 'self-test', browserFamily: target.browserFamily, browserVersion: 'self-test', ...(target.requiredEnvironment ?? {}) },
      inputs: [...target.requiredInputs],
      variants: [...target.requiredVariants],
      sessionMinutes: matrix.minimumSessionMinutes,
      journeys: target.requiredJourneys.map((id) => ({ id, status: 'pass', notes: 'Executable validator self-test.' })),
      defects: [],
      evidence: [{ type: 'test-log', reference: `https://example.invalid/${recordId}`, description: 'In-memory source-certification fixture; never persisted as evidence.' }],
    };
    return { file: `<${recordId}>`, record, errors: validateRecord(record, matrix, { now: syntheticNow, sourceName: `<${recordId}>` }) };
  });
  const completeRelease = evaluateRelease(matrix, syntheticRecords, syntheticSha, { now: syntheticNow });
  const missingRelease = evaluateRelease(matrix, syntheticRecords.slice(1), syntheticSha, { now: syntheticNow });
  const virtualRecord = structuredClone(syntheticRecords[0].record);
  virtualRecord.device.physical = false;
  const virtualErrors = validateRecord(virtualRecord, matrix, { now: syntheticNow, sourceName: '<virtual-record>' });
  pass(
    'RR2_PHYSICAL_RELEASE_REGRESSION',
    syntheticRecords.every((entry) => entry.errors.length === 0)
      && completeRelease.errors.length === 0
      && completeRelease.selected.length === matrix.targets.length
      && missingRelease.errors.some((error) => error.includes(matrix.targets[0].id))
      && virtualErrors.some((error) => error.includes('emulators and simulated profiles do not count')),
    'Executable self-tests prove that complete exact-SHA coverage passes while a missing target or virtual device remains blocked',
  );
}

for (const check of checks) console.log(`${check.ok ? 'PASS' : 'BLOCK'} ${check.id} — ${check.detail}`);
const failures = checks.filter((check) => !check.ok);
if (failures.length) process.exit(1);
console.log('RR2_PHYSICAL_DEVICE_SOURCE_PASS');
