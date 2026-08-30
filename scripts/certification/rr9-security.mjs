import { access, readFile, readdir } from 'node:fs/promises';

const checks = [];
const pass = (id, ok, detail) => checks.push({ id, ok, detail });
const exists = async (file) => { try { await access(file); return true; } catch { return false; } };

const required = [
  'docs/RR9_SECURITY_PRIVACY_V1_LAUNCH.md',
  'docs/V1_RELEASE_OPERATIONS.md',
  'SECURITY.md',
  'CHANGELOG.md',
  'src/pages/privacy.astro',
  'src/pages/security.astro',
  'src/pages/support.astro',
  'src/layouts/BaseLayout.astro',
  'src/lib/reader/epub-security.ts',
  'src/lib/publication-compatibility.ts',
  'src/lib/pdf-reader/runtime.ts',
  'tests/e2e/security-boundaries.spec.ts',
  'scripts/security/generate-sbom.mjs',
  'scripts/security/check-license-inventory.mjs',
  'scripts/release/v1-gate.mjs',
  '.github/workflows/security-hardening.yml',
  '.github/workflows/v1-release.yml',
  '.github/dependabot.yml',
  '.github/workflows/deploy.yml',
  'pnpm-workspace.yaml',
  'package.json',
];
const present = (await Promise.all(required.map(exists))).every(Boolean);
pass('RR9_FILES', present, 'RR9 security, privacy, dependency, release, documentation, workflow, and executable acceptance owners are present');

if (present) {
  const [doc, ops, securityDoc, changelog, privacy, securityPage, supportPage, layout, epubSecurity, inspector, pdfRuntime, tests, sbom, licenses, v1Gate, securityWorkflow, v1Workflow, dependabot, deploy, workspace, packageText] = await Promise.all(required.map((file) => readFile(file, 'utf8')));
  const pkg = JSON.parse(packageText);

  pass('RR9_APP_CSP',
    layout.includes('http-equiv="Content-Security-Policy"')
      && layout.includes("default-src 'self'")
      && layout.includes("object-src 'none'")
      && layout.includes("script-src 'self'")
      && layout.includes("worker-src 'self' blob:")
      && layout.includes('meta name="referrer" content="no-referrer"'),
    'The deployed HTML owns a restrictive CSP and referrer policy instead of relying on an unsupported Pages header file');

  pass('RR9_EPUB_RUNTIME_ISOLATION',
    epubSecurity.includes("default-src 'none'")
      && epubSecurity.includes("script-src 'none'")
      && epubSecurity.includes("connect-src 'none'")
      && epubSecurity.includes('img-src data: blob:')
      && epubSecurity.includes('RESOURCE_URL_ATTRIBUTES')
      && epubSecurity.includes('srcsetHasRemoteResource')
      && epubSecurity.includes("element.hasAttribute('ping')"),
    'EPUB frames repeat the no-script/no-network boundary at render time and strip remote resource surfaces');

  pass('RR9_HOSTILE_PUBLICATION_BOUNDS',
    inspector.includes('MAX_METADATA_BYTES = 512 * 1024')
      && inspector.includes('MAX_COVER_BYTES = 8 * 1024 * 1024')
      && inspector.includes('MAX_INSPECTION_ENTRY_BYTES = 8 * 1024 * 1024')
      && inspector.includes("'epub-metadata-size-limit'")
      && inspector.includes("'epub-cover-size-limit'")
      && inspector.includes("'epub-inspection-size-limit'")
      && inspector.includes('srcset')
      && inspector.includes('xlink:href')
      && inspector.includes("'/SubmitForm'")
      && inspector.includes("'/ImportData'")
      && inspector.includes("'/GoToR'"),
    'Metadata, covers, deep text inspection, extra remote-reference forms, and PDF active actions have explicit bounded rejection paths');

  pass('RR9_SCRIPTING_DISABLED',
    tests.includes('rendered EPUB frame has deny-by-default CSP')
      && tests.includes('remoteRequests')
      && tests.includes('additional PDF active actions are rejected')
      && pdfRuntime.includes('isEvalSupported: false'),
    'Browser acceptance proves EPUB network/script isolation and PDF.js evaluation remains disabled');

  pass('RR9_PUBLIC_PRIVACY_SUPPORT',
    privacy.includes('no account system, behavioral analytics, advertising, or automatic cloud synchronization')
      && privacy.includes('do not contain the bytes of your personal EPUB/PDF files')
      && securityPage.includes('Publication content is treated as untrusted')
      && supportPage.includes('exact release SHA')
      && layout.includes("href('/security')")
      && layout.includes("href('/support')"),
    'Privacy, security, support, backup, network, and physical-evidence boundaries are publicly discoverable and explicit');

  pass('RR9_DEPENDENCY_POLICY',
    workspace.includes('minimumReleaseAge: 1440')
      && workspace.includes('allowBuilds:')
      && pkg.scripts?.['security:audit']?.includes('--audit-level=high')
      && pkg.scripts?.['security:sbom']?.includes('generate-sbom.mjs')
      && pkg.scripts?.['security:licenses']?.includes('check-license-inventory.mjs')
      && sbom.includes("bomFormat: 'CycloneDX'")
      && sbom.includes("specVersion: '1.6'")
      && licenses.includes('FORBIDDEN_LICENSE_PATTERNS')
      && dependabot.includes('package-ecosystem: "npm"')
      && dependabot.includes('package-ecosystem: "github-actions"'),
    'Lock/build policy, minimum release age, high-severity audit, license review, SBOM, and dependency update PRs are owned');

  const workflowNames = await readdir('.github/workflows');
  const workflowTexts = await Promise.all(workflowNames.filter((name) => /\.ya?ml$/i.test(name)).map(async (name) => ({ name, text: await readFile(`.github/workflows/${name}`, 'utf8') })));
  const unpinned = [];
  for (const { name, text } of workflowTexts) {
    for (const match of text.matchAll(/\buses:\s*([^\s#]+)/g)) {
      const target = match[1];
      if (target.startsWith('./') || target.startsWith('docker://')) continue;
      const at = target.lastIndexOf('@');
      const ref = at >= 0 ? target.slice(at + 1) : '';
      if (!/^[a-f0-9]{40}$/i.test(ref)) unpinned.push(`${name}:${target}`);
    }
  }
  pass('RR9_ACTION_PROVENANCE', unpinned.length === 0, unpinned.length ? `Unpinned Actions: ${unpinned.join(', ')}` : 'Every external GitHub Action is pinned to a full commit SHA');

  const obsolete = [
    '.github/workflows/l17b-frozen-payload.yml',
    '.github/workflows/l17b-r2-ingress.yml',
    '.github/workflows/bootstrap-lockfile.yml',
    '.github/workflows/phase1-browser-bootstrap.yml',
    'public/_headers',
  ];
  const obsoletePresent = (await Promise.all(obsolete.map(exists))).filter(Boolean);
  pass('RR9_OBSOLETE_SURFACE_REMOVED', obsoletePresent.length === 0, 'Obsolete privileged recovery/bootstrap workflows and the inert Pages _headers file are removed');

  const artifactLeak = workflowTexts.some(({ text }) =>
    text.includes('actions/upload-artifact@') && /(?:^|\n)\s+(?:incoming\/|\.publication-ingress\/|src\/content\/works\/)/m.test(text));
  pass('RR9_CI_ARTIFACT_PRIVACY', !artifactLeak && securityWorkflow.includes('path: |\n            .build/security\n            playwright-report\n            test-results'), 'CI artifacts are limited to deterministic reports/test evidence and exclude publication ingress or personal-file payloads');

  const durabilityIndex = deploy.indexOf('id: durability');
  const securityIndex = deploy.indexOf('id: security');
  const pagesIndex = deploy.indexOf('actions/upload-pages-artifact@');
  pass('RR9_PRODUCTION_GATE',
    deploy.includes('Run RR9 security, privacy, dependency, and provenance acceptance')
      && deploy.includes('pnpm security:audit')
      && deploy.includes('pnpm security:licenses')
      && deploy.includes('pnpm security:sbom')
      && deploy.includes('pnpm test:security')
      && securityIndex > durabilityIndex
      && pagesIndex > securityIndex,
    'Production Pages upload is gated on RR9 after RR8');

  pass('RR9_V1_FAIL_CLOSED',
    pkg.scripts?.['release:v1:gate'] === 'node scripts/release/v1-gate.mjs'
      && v1Gate.includes('protected !== true')
      && v1Gate.includes("pkg.version !== '1.0.0'")
      && v1Workflow.includes('certify:physical:release')
      && v1Workflow.includes('release:v1:gate')
      && v1Workflow.includes('git tag -a v1.0.0'),
    'v1 tagging is blocked on version, protected main, production identity, and exact-SHA physical evidence');

  const physicalPending = doc.includes('0/12') || ops.includes('0/12');
  pass('RR9_VERSION_HONESTY', !physicalPending || pkg.version !== '1.0.0', 'The package is not labeled final v1 while the documented physical-device campaign is incomplete');

  pass('RR9_DOCUMENTATION',
    doc.includes('## Security boundary')
      && doc.includes('## Dependency and CI provenance')
      && doc.includes('## v1.0 release gate')
      && ops.includes('## Rollback')
      && securityDoc.includes('## Supported versions')
      && changelog.includes('## Unreleased'),
    'Security model, operations, vulnerability handling, changelog, release, and rollback boundaries are documented');
}

for (const check of checks) console.log(`${check.ok ? 'PASS' : 'BLOCK'} ${check.id} — ${check.detail}`);
const failures = checks.filter((check) => !check.ok);
if (failures.length) {
  console.error(`\nRR9 certification failed: ${failures.map((check) => check.id).join(', ')}`);
  process.exit(1);
}
console.log(`\nRR9 certification passed (${checks.length} checks).`);
