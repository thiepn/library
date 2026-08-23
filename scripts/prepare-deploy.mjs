import { access, copyFile, rm } from 'node:fs/promises';

const nestedHeaders = 'dist/library/_headers';
const rootHeaders = 'dist/_headers';

try {
  await access(nestedHeaders);
  await copyFile(nestedHeaders, rootHeaders);
  await rm(nestedHeaders);
  console.log('[deploy] promoted /library _headers to static asset root');
} catch {
  throw new Error('Expected dist/library/_headers after Astro build');
}
