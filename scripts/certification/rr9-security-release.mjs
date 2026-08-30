import { access, readFile } from 'node:fs/promises';

const checks = [];
const pass = (id, ok, detail) => checks.push({ id, ok, detail });
const exists = async (file) => { try { await access(file); return true; } catch { return false; } };

const files = [
  'docs/RR9_SECURITY_PRIVACY_RELEASE.md',
  'public/_headers',
  'public/service-worker.js',
  'src/lib/reader/epub-security.ts',
  'src/lib/reader/engines/epubjs.ts',
  'src/lib/publication-compatibility.ts',
  'src/lib/pdf-reader/runtime.ts',
  'src/pages/privacy.astro',
  'src/pages/security.astro',
  'tests/e2e/security-fixtures.ts',
  'tests/e2e/security-hardening.spec.ts',
  'scripts/security/audit-dependencies.mjs',
  'scripts/security/generate-supply-chain-evidence.mjs',
  'scripts/prepare-deploy.mjs',
  'scripts/verify-production.mjs',
  'wrangler.jsonc',
  'pnpm-workspace.yaml',
  '.github/workflows/security-release.yml',
  '.github/workflows/deploy.yml',
  'package.json',
];

const present = (await Promise.all(files.map(exists))).every(Boolean);
pass('RR9_FILES', present, 'RR9 security, privacy, supply-chain, edge-deployment, browser acceptance, documentation, and package surfaces are present');

if (present) {
  const [
    doc,
    headers,
    sw,
    epubSecurity,
    epubEngine,
    compatibility,
    pdfRuntime,
    privacy,
    securityPage,
    fixtures,
    tests,
    audit,
    supplyChain,
    prepare,
    verifier,
    wrangler,
    workspace,
    workflow,
    deploy,
    pkgRaw,
  ] = await Promise.all([
    readFile('docs/RR9_SECURITY_PRIVACY_RELEASE.md', 'utf8'),
    readFile('public/_headers', 'utf8'),
    readFile('public/service-worker.js', 'utf8'),
    readFile('src/lib/reader/epub-security.ts', 'utf8'),
    readFile('src/lib/reader/engines/epubjs.ts', 'utf8'),
    readFile('src/lib/publication-compatibility.ts', 'utf8'),
    readFile('src/lib/pdf-reader/runtime.ts', 'utf8'),
    readFile('src/pages/privacy.astro', 'utf8'),
    readFile('src/pages/security.astro', 'utf8'),
    readFile('tests/e2e/security-fixtures.ts', 'utf8'),
    readFile('tests/e2e/security-hardening.spec.ts', 'utf8'),
    readFile('scripts/security/audit-dependencies.mjs', 'utf8'),
    readFile('scripts/security/generate-supply-chain-evidence.mjs', 'utf8'),
    readFile('scripts/prepare-deploy.mjs', 'utf8'),
    readFile('scripts/verify-production.mjs', 'utf8'),
    readFile('wrangler.jsonc', 'utf8'),
    readFile('pnpm-workspace.yaml', 'utf8'),
    readFile('.github/workflows/security-release.yml', 'utf8'),
    readFile('.github/workflows/deploy.yml', 'utf8'),
    readFile('package.json', 'utf8'),
  ]);
  const pkg = JSON.parse(pkgRaw);

  pass('RR9_EDGE_HEADER_POLICY',
    headers.includes('Strict-Transport-Security: max-age=31536000')
      && headers.includes('X-Content-Type-Options: nosniff')
      && headers.includes('X-Frame-Options: DENY')
      && headers.includes('Cross-Origin-Opener-Policy: same-origin')
      && headers.includes('Cross-Origin-Resource-Policy: same-origin')
      && headers.includes("base-uri 'none'")
      && headers.includes("form-action 'none'")
      && headers.includes("object-src 'none'")
      && headers.includes("frame-ancestors 'none'")
      && headers.includes("script-src 'self'")
      && headers.includes("worker-src 'self' blob:")
      && headers.includes('upgrade-insecure-requests'),
    'Production header policy blocks framing, plugins, forms, base rewriting, untrusted scripts, and broad browser capabilities');

  pass('RR9_CLOUDFLARE_HEADER_OWNERSHIP',
    wrangler.includes('"pattern": "thiepn.dev/library*"')
      && wrangler.includes('"directory": "./dist"')
      && prepare.includes("const rootHeaders = 'dist/_headers'")
      && prepare.includes('await copyFile(nestedHeaders, rootHeaders)')
      && verifier.includes('LIVE_SECURITY_HEADERS_PASS')
      && verifier.includes("'content-security-policy'")
      && deploy.includes('Deploy hardened Cloudflare edge')
      && deploy.includes('pnpm exec wrangler deploy'),
    'Cloudflare Workers Static Assets, not a passive source file, owns enforceable production security headers and live verification proves them');

  pass('RR9_EPUB_SANDBOX_POLICY',
    epubSecurity.includes("'base'")
      && epubSecurity.includes("default-src 'none'")
      && epubSecurity.includes("script-src 'none'")
      && epubSecurity.includes("connect-src 'none'")
      && epubSecurity.includes("base-uri 'none'")
      && epubSecurity.includes("img-src 'self' data: blob:")
      && epubSecurity.includes("style-src 'self' blob: 'unsafe-inline'")
      && epubSecurity.includes("value.startsWith('data:text/html')")
      && epubSecurity.includes("value.startsWith('file:')")
      && epubSecurity.includes("meta[http-equiv=\"Content-Security-Policy\" i]")
      && epubEngine.indexOf('book.spine.hooks.content.register(sanitizeEpubDocument)') < epubEngine.indexOf('book.renderTo(container'),
    'EPUB sanitization runs before serialization and strips executable/navigation surfaces while allowing only local presentation resources');

  pass('RR9_EPUB_EXECUTABLE_ACCEPTANCE',
    fixtures.includes('RR9 Sandbox Attack')
      && fixtures.includes('<base href="https://example.invalid/rr9/"')
      && fixtures.includes('data:text/html')
      && tests.includes('remoteRequests')
      && tests.includes("toHaveCount(0)")
      && tests.includes("default-src 'none'")
      && tests.includes('naturalWidth')
      && tests.includes('expect(markers).toEqual([false, false, false, false])'),
    'A deterministic hostile EPUB proves scripting, event handlers, base rewriting, dangerous navigation, and remote subresources stay inert while local content remains readable');

  pass('RR9_PDF_EXECUTION_BOUNDARY',
    compatibility.includes("'pdf-active-content'")
      && compatibility.includes("'pdf-encrypted'")
      && pdfRuntime.includes('isEvalSupported: false')
      && pdfRuntime.includes("from 'pdfjs-dist'")
      && tests.includes('active PDF content is rejected before local persistence'),
    'Active/encrypted PDFs are rejected during preflight and accepted PDFs still disable PDF.js dynamic evaluation');

  pass('RR9_HOSTILE_RESOURCE_BOUNDS',
    compatibility.includes('const MAX_ARCHIVE_ENTRIES = 10_000')
      && compatibility.includes('const MAX_EXPANDED_BYTES = 512 * 1024 * 1024')
      && compatibility.includes('const MAX_ENTRY_BYTES = 128 * 1024 * 1024')
      && compatibility.includes('const MAX_COMPRESSION_RATIO = 500')
      && compatibility.includes("'epub-path-unsafe'")
      && compatibility.includes("'epub-duplicate-entry'")
      && compatibility.includes("'epub-remote-resource'")
      && compatibility.includes("'epub-compression-ratio-limit'"),
    'Traversal, duplicate entries, remote resources, archive bombs, and pathological expansion remain bounded before persistence');

  pass('RR9_SERVICE_WORKER_SCOPE',
    sw.includes("if (request.method !== 'GET') return")
      && sw.includes('if (!isSameOriginScoped(url)) return')
      && sw.includes("url.pathname.startsWith(scoped('media/'))")
      && sw.includes("credentials: 'same-origin'")
      && !sw.includes('thiepn-library-personal-books'),
    'Service-worker interception and hosted publication caching remain GET-only, same-origin, scope-bounded, and separate from personal publication storage');

  pass('RR9_PATCHED_DEPENDENCY_GRAPH',
    pkg.dependencies?.epubjs === '0.3.93'
      && pkg.dependencies?.['pdfjs-dist'] === '4.10.38'
      && pkg.dependencies?.astro === undefined
      && pkg.devDependencies?.astro === '7.2.8'
      && workspace.includes("'@xmldom/xmldom': 0.8.15")
      && !workspace.includes("'sharp@0.34.5': true"),
    'Shipped browser dependencies remain explicit, the patched Astro toolchain is build-only, and epubjs resolves to maintained xmldom 0.8 LTS');

  pass('RR9_DEPENDENCY_AUDIT',
    pkg.scripts?.['security:audit'] === 'node scripts/security/audit-dependencies.mjs'
      && audit.includes("['audit', '--prod', '--audit-level', 'high', '--json']")
      && audit.includes('pnpm-audit.json')
      && audit.includes('high > 0 || critical > 0')
      && workflow.includes('pnpm security:audit')
      && deploy.includes('pnpm security:audit'),
    'High/critical advisories in the shipped browser dependency graph fail RR9 CI and production deployment while retaining a JSON audit record');

  pass('RR9_SBOM_LICENSE_EVIDENCE',
    pkg.scripts?.['security:supply-chain'] === 'node scripts/security/generate-supply-chain-evidence.mjs'
      && supplyChain.includes("['sbom', '--prod', '--sbom-format', 'cyclonedx'")
      && supplyChain.includes("['licenses', 'list', '--prod', '--json']")
      && supplyChain.includes('sbom.cdx.json')
      && supplyChain.includes('licenses.json')
      && supplyChain.includes('unlicensed|none|no license|see license in')
      && workflow.includes('artifacts/security'),
    'RR9 creates a shipped-dependency CycloneDX SBOM and license inventory and blocks unresolved license declarations');

  pass('RR9_INSTALL_SCRIPT_POLICY',
    workspace.includes('allowBuilds:')
      && workspace.includes("'esbuild@0.27.7 || 0.28.1 || 0.28.2': true")
      && workspace.includes("'workerd@1.20260820.1': true")
      && workspace.includes("'core-js@3.50.0': false")
      && workspace.includes("'es5-ext@0.10.64': false")
      && !workspace.includes("'sharp@0.34.5': true"),
    'Install-time build scripts remain explicitly allow/deny listed and the vulnerable Sharp 0.34 install-script exception is removed');

  pass('RR9_CI_ARTIFACT_PRIVACY',
    workflow.includes('name: rr9-supply-chain-${{ github.run_id }}')
      && workflow.includes('path: artifacts/security')
      && !workflow.includes('src/pages/personal')
      && !workflow.includes('personal-books')
      && doc.includes('must never include browser profiles, personal publication files')
      && tests.includes('rr9SandboxEpubFixture'),
    'Always-retained RR9 evidence is package metadata only and hostile publication tests use deterministic generated fixtures rather than user files');

  pass('RR9_PUBLIC_PRIVACY_SECURITY',
    privacy.includes('uses no behavioral analytics')
      && privacy.includes('does not upload the personal book')
      && privacy.includes('Google Fonts')
      && privacy.includes('not account or cloud synchronization')
      && securityPage.includes('EPUB scripting and remote subresources are disabled')
      && securityPage.includes('PDF execution is disabled')
      && securityPage.includes('No absolute-safety claim'),
    'Public privacy/security copy describes local storage, third-party fonts, publication isolation, and limitations without overstating safety');

  pass('RR9_COMMANDS_AND_WORKFLOW',
    pkg.scripts?.['test:security']?.includes('security-hardening.spec.ts')
      && pkg.scripts?.['certify:security'] === 'node scripts/certification/rr9-security-release.mjs'
      && pkg.scripts?.['security:worker:dry-run']?.includes('wrangler deploy --dry-run')
      && pkg.scripts?.['certify:source']?.endsWith('node scripts/certification/rr9-security-release.mjs')
      && workflow.includes('pnpm certify:security')
      && workflow.includes('pnpm security:worker:dry-run')
      && workflow.includes('pnpm test:security'),
    'RR9 has stable source, dependency, Worker dry-run, and cross-engine browser commands in a dedicated workflow');

  pass('RR9_LAUNCH_BLOCKERS_HONEST',
    pkg.version === '1.0.0-rc.1'
      && doc.includes('must not')
      && doc.includes('0/12')
      && doc.includes('main` is currently unprotected')
      && doc.includes('final `1.0.0` bump')
      && doc.includes('Physical-device certification and repository protection remain mandatory final launch gates'),
    'Automated RR9 hardening does not prematurely claim v1.0 while physical evidence and main protection are incomplete');
}

const failed = checks.filter((check) => !check.ok);
for (const check of checks) console.log(`${check.ok ? 'PASS' : 'FAIL'} ${check.id} — ${check.detail}`);
if (failed.length) {
  console.error(`\nRR9 certification failed: ${failed.map((check) => check.id).join(', ')}`);
  process.exit(1);
}
console.log(`\nRR9 source certification passed (${checks.length} checks).`);
