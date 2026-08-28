import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const SHA = /^[0-9a-f]{40}$/i;
const RECORD_ID = /^[a-z0-9][a-z0-9._-]{5,127}$/;
const RECORD_STATUS = new Set(['pass', 'fail', 'blocked']);
const JOURNEY_STATUS = new Set(['pass', 'fail', 'blocked', 'not-applicable']);
const SEVERITY = new Set(['P0', 'P1', 'P2', 'P3']);
const DEFECT_STATUS = new Set(['open', 'closed', 'accepted']);
const EVIDENCE_TYPE = new Set(['screenshot', 'screen-recording', 'photo', 'test-log', 'issue', 'other']);
const REQUIRED_TARGETS = [
  'android-chrome', 'android-samsung-internet', 'android-firefox', 'android-low-end-chrome',
  'ios-safari', 'ios-pwa', 'ipados-safari',
  'windows-edge', 'windows-chrome', 'windows-firefox', 'macos-safari', 'macos-chrome',
];

const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const string = (value) => typeof value === 'string' && value.trim().length > 0;
const strings = (value) => Array.isArray(value) && value.every(string) ? value : [];
const unique = (value) => new Set(value).size === value.length;
const placeholder = (value) => typeof value === 'string' && /replace me|yyyy-mm-dd|rc\.x/i.test(value);
const need = (errors, condition, message) => { if (!condition) errors.push(message); };

function https(value) {
  try { return string(value) && new URL(value).protocol === 'https:'; }
  catch { return false; }
}

function reference(value) {
  if (!string(value)) return false;
  if (https(value)) return true;
  if (isAbsolute(value) || value.includes('\\') || value.startsWith('/')) return false;
  return !value.split('/').some((part) => part === '.' || part === '..');
}

export function validateMatrix(matrix) {
  const errors = [];
  need(errors, object(matrix), 'matrix must be an object');
  if (!object(matrix)) return errors;
  need(errors, matrix.schemaVersion === 1, 'schemaVersion must be 1');
  need(errors, matrix.phaseId === 'RR2', 'phaseId must be RR2');
  need(errors, Number.isInteger(matrix.maximumEvidenceAgeDays) && matrix.maximumEvidenceAgeDays > 0, 'maximumEvidenceAgeDays must be positive');
  need(errors, Number.isInteger(matrix.minimumSessionMinutes) && matrix.minimumSessionMinutes >= 20, 'minimumSessionMinutes must be at least 20');
  need(errors, Array.isArray(matrix.journeys) && matrix.journeys.length >= 10, 'at least ten journeys are required');
  need(errors, Array.isArray(matrix.targets) && matrix.targets.length >= 10, 'at least ten targets are required');

  const journeyIds = (matrix.journeys ?? []).map((entry) => entry?.id).filter(string);
  need(errors, unique(journeyIds), 'journey IDs must be unique');
  for (const [index, journey] of (matrix.journeys ?? []).entries()) {
    need(errors, object(journey) && string(journey.id) && string(journey.label) && string(journey.description), `journeys[${index}] is incomplete`);
  }
  const journeySet = new Set(journeyIds);

  const targetIds = (matrix.targets ?? []).map((entry) => entry?.id).filter(string);
  need(errors, unique(targetIds), 'target IDs must be unique');
  for (const [index, target] of (matrix.targets ?? []).entries()) {
    const prefix = `targets[${index}]`;
    need(errors, object(target), `${prefix} must be an object`);
    if (!object(target)) continue;
    for (const key of ['id', 'label', 'platform', 'deviceClass', 'browserFamily']) need(errors, string(target[key]), `${prefix}.${key} is required`);
    need(errors, target.requiredForRelease === true && target.physicalOnly === true, `${prefix} must be release-required physical hardware`);
    for (const key of ['requiredInputs', 'requiredVariants', 'requiredJourneys']) {
      const values = strings(target[key]);
      need(errors, values.length > 0 && unique(values), `${prefix}.${key} must be a unique non-empty string array`);
    }
    for (const id of strings(target.requiredJourneys)) need(errors, journeySet.has(id), `${target.id ?? prefix} references unknown journey ${id}`);
    if (target.deviceConstraints?.maxMemoryGb !== undefined) need(errors, target.deviceConstraints.maxMemoryGb > 0, `${target.id}.deviceConstraints.maxMemoryGb must be positive`);
    if (target.requiredEnvironment !== undefined) need(errors, object(target.requiredEnvironment), `${target.id}.requiredEnvironment must be an object`);
  }
  const targetSet = new Set(targetIds);
  for (const id of REQUIRED_TARGETS) need(errors, targetSet.has(id), `required target is missing: ${id}`);
  return errors;
}

function validateEvidence(items, errors, prefix) {
  need(errors, Array.isArray(items), `${prefix} must be an array`);
  for (const [index, item] of (items ?? []).entries()) {
    need(errors, object(item), `${prefix}[${index}] must be an object`);
    if (!object(item)) continue;
    need(errors, EVIDENCE_TYPE.has(item.type), `${prefix}[${index}].type is invalid`);
    need(errors, reference(item.reference), `${prefix}[${index}].reference must be HTTPS or repository-relative`);
    need(errors, string(item.description), `${prefix}[${index}].description is required`);
  }
}

export function validateRecord(record, matrix, { now = new Date(), sourceName = '<record>', enforceFileName = false } = {}) {
  const errors = [];
  need(errors, object(record), `${sourceName}: record must be an object`);
  if (!object(record)) return errors;
  const target = matrix.targets.find((entry) => entry.id === record.targetId);

  need(errors, record.schemaVersion === 1, `${sourceName}: schemaVersion must be 1`);
  need(errors, string(record.recordId) && RECORD_ID.test(record.recordId), `${sourceName}: recordId is invalid`);
  need(errors, Boolean(target), `${sourceName}: unknown targetId`);
  need(errors, RECORD_STATUS.has(record.status), `${sourceName}: status must be pass, fail, or blocked`);
  if (enforceFileName && string(record.recordId)) need(errors, basename(sourceName, '.json') === record.recordId, `${sourceName}: filename must equal recordId.json`);

  const tested = new Date(record.testedAt);
  need(errors, string(record.testedAt) && Number.isFinite(tested.getTime()), `${sourceName}: testedAt must be an ISO date-time`);
  if (Number.isFinite(tested.getTime())) need(errors, tested.getTime() <= now.getTime() + 86_400_000, `${sourceName}: testedAt is too far in the future`);

  need(errors, object(record.tester) && string(record.tester.name) && !placeholder(record.tester.name), `${sourceName}: named human tester is required`);
  if (record.tester?.github !== undefined) need(errors, string(record.tester.github) && !placeholder(record.tester.github), `${sourceName}: tester.github is a placeholder`);

  need(errors, object(record.release), `${sourceName}: release is required`);
  need(errors, string(record.release?.version) && !placeholder(record.release.version), `${sourceName}: release.version is invalid`);
  need(errors, SHA.test(record.release?.buildSha ?? '') && !/^0{40}$/.test(record.release?.buildSha ?? ''), `${sourceName}: release.buildSha must be a non-placeholder 40-character SHA`);
  need(errors, https(record.release?.url), `${sourceName}: release.url must be HTTPS`);

  need(errors, object(record.device), `${sourceName}: device is required`);
  need(errors, string(record.device?.manufacturer) && !placeholder(record.device.manufacturer), `${sourceName}: device.manufacturer is invalid`);
  need(errors, string(record.device?.model) && !placeholder(record.device.model), `${sourceName}: device.model is invalid`);
  need(errors, record.device?.physical === true, `${sourceName}: device.physical must be true; emulators and simulated profiles do not count`);
  if (record.device?.memoryGb !== undefined) need(errors, record.device.memoryGb > 0, `${sourceName}: device.memoryGb must be positive`);

  need(errors, object(record.environment), `${sourceName}: environment is required`);
  for (const key of ['platform', 'osVersion', 'browserFamily', 'browserVersion']) {
    need(errors, string(record.environment?.[key]) && !placeholder(record.environment[key]), `${sourceName}: environment.${key} is invalid`);
  }
  if (target) {
    need(errors, record.environment?.platform === target.platform, `${sourceName}: platform must be ${target.platform}`);
    need(errors, record.environment?.browserFamily === target.browserFamily, `${sourceName}: browserFamily must be ${target.browserFamily}`);
    for (const [key, value] of Object.entries(target.requiredEnvironment ?? {})) need(errors, record.environment?.[key] === value, `${sourceName}: environment.${key} must equal ${JSON.stringify(value)}`);
  }

  const inputs = strings(record.inputs);
  const variants = strings(record.variants);
  need(errors, inputs.length > 0 && unique(inputs), `${sourceName}: inputs are invalid`);
  need(errors, variants.length > 0 && unique(variants), `${sourceName}: variants are invalid`);
  need(errors, Number.isInteger(record.sessionMinutes) && record.sessionMinutes >= 0, `${sourceName}: sessionMinutes must be non-negative`);

  need(errors, Array.isArray(record.journeys), `${sourceName}: journeys must be an array`);
  const journeyIds = [];
  const journeyMap = new Map();
  for (const [index, journey] of (record.journeys ?? []).entries()) {
    need(errors, object(journey) && string(journey.id), `${sourceName}: journeys[${index}] is invalid`);
    if (!object(journey) || !string(journey.id)) continue;
    journeyIds.push(journey.id);
    journeyMap.set(journey.id, journey);
    need(errors, matrix.journeys.some((entry) => entry.id === journey.id), `${sourceName}: unknown journey ${journey.id}`);
    need(errors, JOURNEY_STATUS.has(journey.status), `${sourceName}: ${journey.id} status is invalid`);
    need(errors, typeof journey.notes === 'string', `${sourceName}: ${journey.id} notes must be a string`);
    if (journey.evidence !== undefined) need(errors, Array.isArray(journey.evidence) && journey.evidence.every(reference), `${sourceName}: ${journey.id} evidence is invalid`);
  }
  need(errors, unique(journeyIds), `${sourceName}: journey IDs must be unique`);

  need(errors, Array.isArray(record.defects), `${sourceName}: defects must be an array`);
  for (const [index, defect] of (record.defects ?? []).entries()) {
    need(errors, object(defect) && string(defect.id) && string(defect.summary), `${sourceName}: defects[${index}] is incomplete`);
    if (!object(defect)) continue;
    need(errors, SEVERITY.has(defect.severity), `${sourceName}: defects[${index}].severity is invalid`);
    need(errors, DEFECT_STATUS.has(defect.status), `${sourceName}: defects[${index}].status is invalid`);
    if (defect.url !== undefined) need(errors, https(defect.url), `${sourceName}: defects[${index}].url must be HTTPS`);
  }
  validateEvidence(record.evidence, errors, `${sourceName}: evidence`);

  if (target && record.status === 'pass') {
    for (const value of target.requiredInputs) need(errors, inputs.includes(value), `${sourceName}: missing required input ${value}`);
    for (const value of target.requiredVariants) need(errors, variants.includes(value), `${sourceName}: missing required variant ${value}`);
    for (const id of target.requiredJourneys) need(errors, journeyMap.get(id)?.status === 'pass', `${sourceName}: required journey ${id} must pass`);
    if (target.requiredJourneys.includes('sustained-session')) need(errors, record.sessionMinutes >= matrix.minimumSessionMinutes, `${sourceName}: sustained session must be at least ${matrix.minimumSessionMinutes} minutes`);
    if (target.deviceConstraints?.maxMemoryGb !== undefined) need(errors, record.device?.memoryGb <= target.deviceConstraints.maxMemoryGb, `${sourceName}: device exceeds ${target.deviceConstraints.maxMemoryGb} GB low-end limit`);
    need(errors, record.evidence?.length >= (matrix.evidencePolicy?.minimumItemsForPassingRecord ?? 1), `${sourceName}: passing record requires evidence`);
    need(errors, !(record.defects ?? []).some((defect) => defect.status === 'open' && ['P0', 'P1'].includes(defect.severity)), `${sourceName}: passing record has an open P0/P1 defect`);
  }
  if (record.status === 'fail') need(errors, (record.journeys ?? []).some((entry) => entry.status === 'fail') || (record.defects ?? []).some((entry) => entry.status === 'open'), `${sourceName}: failed record must identify a failure`);
  if (record.status === 'blocked') need(errors, (record.journeys ?? []).some((entry) => entry.status === 'blocked') || string(record.notes), `${sourceName}: blocked record must explain the blocker`);
  return errors;
}

export function evaluateRelease(matrix, records, expectedSha, { now = new Date() } = {}) {
  const errors = [];
  const selected = [];
  need(errors, SHA.test(expectedSha ?? ''), 'release mode requires --expected-sha with a 40-character Git SHA');
  if (!SHA.test(expectedSha ?? '')) return { errors, selected };
  const cutoff = now.getTime() - matrix.maximumEvidenceAgeDays * 86_400_000;
  for (const target of matrix.targets.filter((entry) => entry.requiredForRelease)) {
    const match = records
      .filter((entry) => entry.errors.length === 0
        && entry.record.targetId === target.id
        && entry.record.status === 'pass'
        && entry.record.release.buildSha.toLowerCase() === expectedSha.toLowerCase()
        && new Date(entry.record.testedAt).getTime() >= cutoff)
      .sort((a, b) => new Date(b.record.testedAt) - new Date(a.record.testedAt))[0];
    if (match) selected.push(match);
    else errors.push(`${target.id}: no current passing physical-device record exists for build ${expectedSha}`);
  }
  return { errors, selected };
}

async function readJson(file) { return JSON.parse(await readFile(file, 'utf8')); }

async function recordFiles(directory) {
  const files = [];
  async function walk(current) {
    let entries;
    try { entries = await readdir(current, { withFileTypes: true }); }
    catch (error) { if (error?.code === 'ENOENT') return; throw error; }
    for (const entry of entries) {
      const file = resolve(current, entry.name);
      if (entry.isDirectory()) await walk(file);
      else if (entry.isFile() && entry.name.endsWith('.json') && !entry.name.startsWith('_') && !entry.name.startsWith('.')) files.push(file);
    }
  }
  await walk(directory);
  return files.sort();
}

function argumentsOf(argv) {
  const options = { mode: 'structure', matrix: 'evidence/physical-devices/matrix.json', records: 'evidence/physical-devices/records', expectedSha: process.env.PHYSICAL_RELEASE_SHA ?? '', report: '' };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === '--mode') options.mode = argv[++index] ?? '';
    else if (argument === '--matrix') options.matrix = argv[++index] ?? '';
    else if (argument === '--records') options.records = argv[++index] ?? '';
    else if (argument === '--expected-sha') options.expectedSha = argv[++index] ?? '';
    else if (argument === '--report') options.report = argv[++index] ?? '';
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!['structure', 'release'].includes(options.mode)) throw new Error('--mode must be structure or release');
  return options;
}

export async function run(options) {
  const now = options.now instanceof Date ? options.now : new Date();
  const matrix = await readJson(resolve(options.matrix));
  const matrixErrors = validateMatrix(matrix);
  const records = [];
  const ids = new Map();
  for (const file of await recordFiles(resolve(options.records))) {
    const sourceName = relative(process.cwd(), file).split(sep).join('/');
    const record = await readJson(file);
    const errors = validateRecord(record, matrix, { now, sourceName, enforceFileName: true });
    if (string(record.recordId)) {
      if (ids.has(record.recordId)) errors.push(`${sourceName}: duplicate recordId also used by ${ids.get(record.recordId)}`);
      else ids.set(record.recordId, sourceName);
    }
    records.push({ file: sourceName, record, errors });
  }

  const errors = [...matrixErrors.map((entry) => `matrix: ${entry}`), ...records.flatMap((entry) => entry.errors)];
  const release = options.mode === 'release' && errors.length === 0 ? evaluateRelease(matrix, records, options.expectedSha, { now }) : { errors: [], selected: [] };
  errors.push(...release.errors);
  const coverage = new Set(records.filter((entry) => entry.errors.length === 0 && entry.record.status === 'pass').map((entry) => entry.record.targetId));
  const report = {
    schemaVersion: 1,
    mode: options.mode,
    generatedAt: now.toISOString(),
    ...(options.mode === 'release' ? { expectedSha: options.expectedSha } : {}),
    matrix: { targets: matrix.targets.length, journeys: matrix.journeys.length, maximumEvidenceAgeDays: matrix.maximumEvidenceAgeDays, minimumSessionMinutes: matrix.minimumSessionMinutes },
    recordsScanned: records.length,
    structurallyValidRecords: records.filter((entry) => entry.errors.length === 0).length,
    passingTargetsAnySha: coverage.size,
    selectedRecords: release.selected.map((entry) => ({ targetId: entry.record.targetId, recordId: entry.record.recordId, file: entry.file, testedAt: entry.record.testedAt })),
    errors,
  };
  if (options.report) {
    await mkdir(dirname(resolve(options.report)), { recursive: true });
    await writeFile(options.report, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }

  if (!matrixErrors.length) console.log(`PASS RR2_MATRIX — ${matrix.targets.length} physical targets and ${matrix.journeys.length} journeys are valid`);
  for (const entry of records.filter((item) => item.errors.length === 0)) console.log(`PASS RR2_RECORD_${entry.record.recordId} — ${entry.record.targetId} ${entry.record.status}`);
  console.log(`INFO RR2_COVERAGE — ${coverage.size}/${matrix.targets.filter((entry) => entry.requiredForRelease).length} targets have a structurally valid passing record for any build`);
  if (!release.errors.length && options.mode === 'release') for (const entry of release.selected) console.log(`PASS RR2_TARGET_${entry.record.targetId} — ${entry.record.recordId} on ${entry.record.device.manufacturer} ${entry.record.device.model}`);
  if (errors.length) {
    for (const error of errors) console.error(`BLOCK RR2_PHYSICAL_DEVICE — ${error}`);
    return { ok: false, report };
  }
  console.log(options.mode === 'release'
    ? `RR2_PHYSICAL_DEVICE_RELEASE_PASS sha=${options.expectedSha} targets=${release.selected.length}`
    : `RR2_PHYSICAL_DEVICE_STRUCTURE_PASS records=${records.length}`);
  return { ok: true, report };
}

async function main() {
  try {
    const result = await run(argumentsOf(process.argv.slice(2)));
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error(`BLOCK RR2_PHYSICAL_DEVICE — ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await main();
