import assert from 'node:assert/strict';

import {
  CALIBRATION_NO_FACE_TIMEOUT_MS,
  CALIBRATION_PROGRESS_TIMEOUT_MS,
  CALIBRATION_TARGET_FRAMES,
  assessNeutralFrame,
  calibrationPrompt,
  shouldFallbackFromCalibration,
} from '../lib/calibration-gate.ts';

const neutral = { smile: 0.08, surprise: 0.1, wink: 0.06 };
assert.deepEqual(assessNeutralFrame(neutral), { accepted: true, reason: null });

assert.deepEqual(assessNeutralFrame({ ...neutral, smile: 0.72 }), {
  accepted: false,
  reason: 'smile_active',
});
assert.deepEqual(assessNeutralFrame({ ...neutral, surprise: 0.76 }), {
  accepted: false,
  reason: 'mouth_active',
});
assert.deepEqual(assessNeutralFrame({ ...neutral, wink: 0.68 }), {
  accepted: false,
  reason: 'wink_active',
});

let acceptedFrames = 0;
for (const frame of [neutral, { ...neutral, smile: 0.8 }, neutral]) {
  if (assessNeutralFrame(frame).accepted) acceptedFrames += 1;
}
assert.equal(
  acceptedFrames,
  2,
  'rejected frames must not reset or increment accepted progress',
);

assert.equal(
  shouldFallbackFromCalibration({
    startedAt: 1000,
    now: 6999,
    acceptedFrames: 0,
    timedOut: false,
  }),
  false,
);
assert.equal(
  shouldFallbackFromCalibration({
    startedAt: 1000,
    now: 1000 + CALIBRATION_NO_FACE_TIMEOUT_MS,
    acceptedFrames: 0,
    timedOut: false,
  }),
  true,
);
assert.equal(
  shouldFallbackFromCalibration({
    startedAt: 1000,
    now: 9000,
    acceptedFrames: CALIBRATION_TARGET_FRAMES,
    timedOut: false,
  }),
  false,
);
assert.equal(
  shouldFallbackFromCalibration({
    startedAt: 1000,
    now: 9000,
    acceptedFrames: 0,
    timedOut: true,
  }),
  false,
);

assert.match(calibrationPrompt('smile_active'), /neutral/i);
assert.match(calibrationPrompt('mouth_active'), /mouth/i);
assert.match(calibrationPrompt('wink_active'), /eyes/i);

assert.equal(shouldFallbackFromCalibration({ startedAt: 1000, now: 7000, acceptedFrames: 29, timedOut: false }), false, 'slow neutral sampling still has time to finish');
assert.equal(shouldFallbackFromCalibration({ startedAt: 1000, now: 1000 + CALIBRATION_PROGRESS_TIMEOUT_MS, acceptedFrames: 29, timedOut: false }), true, 'progress grace remains bounded');
let slowCount = 0;
for (let elapsed = 200; elapsed <= 7200; elapsed += 200) {
  assert.equal(shouldFallbackFromCalibration({ startedAt: 1000, now: 1000 + elapsed, acceptedFrames: slowCount, timedOut: false }), false);
  slowCount++;
}
assert.equal(slowCount, CALIBRATION_TARGET_FRAMES, '10 fps input with 120 ms inference gate can complete neutral calibration');
console.log('Calibration gate checks passed, including low-frame-rate progress and bounded timeout');
