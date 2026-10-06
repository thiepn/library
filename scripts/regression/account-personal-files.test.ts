import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LIBRARY_PERSONAL_FILE_MAX_BYTES,
  LIBRARY_PERSONAL_FILES_BUCKET,
  LIBRARY_PERSONAL_FILES_PERMISSION,
  personalFileCloudPath,
} from '../../src/lib/account/personal-files';

test('personal-file cloud uses the private Library namespace and a separate permission', () => {
  assert.equal(LIBRARY_PERSONAL_FILES_BUCKET, 'library-personal-books');
  assert.equal(LIBRARY_PERSONAL_FILES_PERMISSION, 'personal_files.sync');
  assert.equal(LIBRARY_PERSONAL_FILE_MAX_BYTES, 50 * 1024 * 1024);
});

test('personal-file cloud object identity is owner + full SHA-256 + native format', () => {
  const userId = '123e4567-e89b-12d3-a456-426614174000';
  const sha256 = 'ABCDEF'.repeat(10) + 'ABCD';
  assert.equal(sha256.length, 64);
  assert.equal(
    personalFileCloudPath(userId, { sha256, format: 'epub' }),
    `${userId}/${sha256.toLowerCase()}.epub`,
  );
});

test('personal-file cloud refuses a malformed owner identity', () => {
  assert.throws(
    () => personalFileCloudPath('not-an-account-id', { sha256: 'a'.repeat(64), format: 'pdf' }),
    /Invalid THIEPN Account identity/,
  );
});
