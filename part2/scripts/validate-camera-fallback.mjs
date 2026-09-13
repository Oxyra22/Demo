import assert from 'node:assert/strict';
import { classifyCameraStartError } from '../lib/camera-fallback.ts';

const cases = [
  ['NotAllowedError', 'permission_denied', false],
  ['NotFoundError', 'device_not_found', true],
  ['NotReadableError', 'device_unreadable', true],
  ['AbortError', 'request_aborted', true],
  ['SecurityError', 'security_blocked', false],
];

for (const [name, reason, retryable] of cases) {
  const failure = classifyCameraStartError({ name }, 'request_media');
  assert.equal(failure.reason, reason);
  assert.equal(failure.retryable, retryable);
  assert.equal(failure.domName, name);
  assert.ok(failure.userMessage.length > 20);
}

const videoFailure = classifyCameraStartError(
  { name: 'AbortError', message: 'sensitive raw detail' },
  'start_video',
);
assert.equal(videoFailure.phase, 'start_video');
assert.ok(!JSON.stringify(videoFailure).includes('sensitive raw detail'));

for (const unknown of [null, 'failure', {}, { name: 'FutureBrowserError' }]) {
  assert.equal(
    classifyCameraStartError(unknown, 'request_media').reason,
    'unknown',
  );
}

console.log('Camera fallback classification: 26/26 checks passed');
