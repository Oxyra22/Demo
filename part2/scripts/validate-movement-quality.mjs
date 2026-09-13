import assert from 'node:assert/strict';

import {
  headRollDegrees,
  normalizeHeadTilt,
  qualityPolicies,
  recommendQualityTier,
  shouldApplyRecommendation,
} from '../lib/movement-quality.ts';

const face = Array.from({ length: 264 }, () => ({ x: 0, y: 0 }));
face[33] = { x: 0.25, y: 0.5 };
face[263] = { x: 0.75, y: 0.5 };
assert.equal(headRollDegrees(face), 0);
face[263] = { x: 0.75, y: 0.75 };
assert.ok(Math.abs((headRollDegrees(face) ?? 0) - 26.565) < 0.01);
assert.equal(headRollDegrees([]), null);

assert.equal(normalizeHeadTilt(5), 0);
assert.equal(normalizeHeadTilt(-6), 0);
assert.equal(normalizeHeadTilt(22), -1);
assert.equal(normalizeHeadTilt(-22), 1);
assert.equal(normalizeHeadTilt(40, false), 1);

const summary = (overrides = {}) => ({
  sampleDurationMs: 6000,
  processedFrames: 180,
  inferenceFps: 15,
  inferenceLateRate: 0.05,
  detectionP50Ms: 8,
  detectionP95Ms: 18,
  nextPaintP95Ms: 42,
  feedbackSamples: 4,
  longTaskCount: 0,
  ...overrides,
});

assert.equal(recommendQualityTier(summary()), 'high');
assert.equal(recommendQualityTier(summary({ sampleDurationMs: 4999 })), null);
assert.equal(recommendQualityTier(summary({ inferenceFps: 8 })), 'high');
assert.equal(recommendQualityTier(summary({ detectionP95Ms: 44 })), 'low');
assert.equal(recommendQualityTier(summary({ inferenceLateRate: 0.4 })), 'low');
assert.equal(shouldApplyRecommendation('high', 'mid', 1), true);
assert.equal(shouldApplyRecommendation('mid', 'high', 1), false);
assert.equal(shouldApplyRecommendation('mid', 'high', 2), true);
assert.deepEqual(qualityPolicies.low, { particles: 0, motifs: 6, tiltDistancePx: 0 });

console.log('Movement and quality checks passed: 17/17');
