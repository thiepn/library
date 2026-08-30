# Library recovery status

Date: 2026-08-31

## Recovery result

The canonical Thiepn Library application and publication pipeline are recovered and active. The historical recovery campaign is no longer blocked on Cloudflare credentials or missing publication registry data.

Current production baseline before RR9:

- canonical repository: `thiepn/library`;
- site: `https://thiepn.dev/library`;
- Astro 6 static application;
- Cloudflare R2 immutable publication-media boundary;
- native EPUB and integrated PDF readers;
- browser-local reading state and personal-book storage;
- automated RR1–RR8 release-readiness gates integrated;
- production run `33340248116` passed build, browser acceptance, RR4, RR5, RR6, RR7, RR8, GitHub Pages deployment, and live application/media verification.

The former L17 reader-payload, registry, R2 activation, and credential blockers are resolved. The canonical live registry exists at `src/publications/releases/ai-for-the-kingdom/1.0.0-rc4.yaml`, and immutable publication objects have passed readback/hash verification in the deployment pipeline.

## Historical L17 provenance

The retained frozen publication identity remains:

- Work ID: `ai-for-the-kingdom`
- release: `1.0.0-rc4`
- frozen package bytes: 2,034,059
- package SHA-256: `1c6f831ca9c3a48031121dc6129d39cb66f5ad521d53c3e9f40153f8c9f776b7`
- native reader files: 57
- PDF SHA-256: `8aa58f8eb291c9c5abb4c0ebc633032ae2c4a3703c443e7c3779f38646c707bd`
- EPUB SHA-256: `8931f8578cbd7e09ccf31385047f8eb5d58ea5a74a683c79669a51d2b9e59e1f`
- cover SHA-256: `938830415749fff85b864248c7e302624f17d50bbe5336de1009538fe040df94`

Historical recovery registry/provenance material may remain under the work recovery directory for auditability. It is not an active deployment blocker or an executable privileged recovery path.

## RR9 cleanup

RR9 removes the obsolete L17B frozen-payload/R2-ingress workflows and old lockfile/browser-bootstrap writers. Current publication ingestion remains the generic owner-controlled, hash/readback-certified ingest path. The deployment pipeline no longer writes a post-deploy status commit to `main`; instead, each build publishes `/library/release-identity.json` and the workflow retains immutable deployment evidence as an Actions artifact.

This change is required so strict protected-main enforcement does not need a deployment-bot bypass.

## Current release blockers

Application/publication recovery is complete. The remaining v1.0 blockers are release-readiness requirements, not recovery defects:

1. RR9 security/privacy/dependency hardening must pass and deploy.
2. `main` must be protected with required release checks.
3. the exact final source SHA must complete the required physical-device campaign; current evidence remains **0/12**.
4. the final `1.0.0` source must be production-verified before the immutable `v1.0.0` tag is created.

See `docs/RR9_SECURITY_PRIVACY_V1_LAUNCH.md` and `docs/V1_RELEASE_OPERATIONS.md` for the active release path and rollback procedure.
