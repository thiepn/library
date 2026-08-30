import { mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const outputDir = 'artifacts/security';
await mkdir(outputDir, { recursive: true });

const result = spawnSync(
  pnpm,
  ['audit', '--prod', '--audit-level', 'high', '--json'],
  { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
);

const stdout = result.stdout?.trim() || '{}';
await writeFile(`${outputDir}/pnpm-audit.json`, `${stdout}\n`, 'utf8');

if (result.error) throw result.error;
if (result.status !== 0) {
  const detail = result.stderr?.trim() || 'pnpm reported a high/critical production dependency advisory.';
  console.error(detail);
  process.exit(result.status ?? 1);
}

let report;
try {
  report = JSON.parse(stdout);
} catch {
  console.error('pnpm audit did not return valid JSON.');
  process.exit(1);
}

const metadata = report && typeof report === 'object' ? report.metadata : undefined;
const vulnerabilities = metadata && typeof metadata === 'object' ? metadata.vulnerabilities : undefined;
const high = Number(vulnerabilities?.high ?? 0);
const critical = Number(vulnerabilities?.critical ?? 0);
if (high > 0 || critical > 0) {
  console.error(`Production dependency audit blocked: high=${high}, critical=${critical}.`);
  process.exit(1);
}

console.log(`SECURITY_DEPENDENCY_AUDIT_PASS high=${high} critical=${critical}`);
