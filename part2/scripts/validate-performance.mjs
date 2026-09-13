import assert from 'node:assert/strict';

import {
  createPerformanceBuffers,
  percentile,
  recordBoundedSample,
  summarizePerformance,
} from '../lib/performance-monitor.ts';

assert.equal(percentile([], 0.95), null);
assert.equal(percentile([30, 10, 20], 0.5), 20);
assert.equal(percentile([1, 2, 3, 4, 5], 0.95), 5);
assert.equal(percentile([1, 2, 3], -1), 1);
assert.equal(percentile([1, 2, 3], 2), 3);

const bounded = [];
for (const value of [1, 2, 3, 4]) recordBoundedSample(bounded, value, 3);
assert.deepEqual(bounded, [2, 3, 4]);
recordBoundedSample(bounded, Number.NaN, 3);
assert.deepEqual(bounded, [2, 3, 4]);

const buffers = createPerformanceBuffers();
assert.equal(summarizePerformance(buffers, 0).longTaskCount, null, 'unsupported monitoring is unavailable, not zero');
buffers.videoFrameIntervalsMs.push(66, 66, 200, 66);
buffers.detectionDurationsMs.push(4, 5, 6, 20);
buffers.nextPaintLatenciesMs.push(18, 26);
buffers.longTaskCount = 2;
buffers.longTaskSupported = true;
const summary = summarizePerformance(buffers, 5100);

assert.equal(summary.inferenceFps, 15.2);
assert.equal(summary.inferenceLateRate, 0.25);
assert.equal(summary.detectionP50Ms, 5);
assert.equal(summary.detectionP95Ms, 20);
assert.equal(summary.nextPaintP95Ms, 26);
assert.equal(summary.feedbackSamples, 2);
assert.equal(summary.longTaskCount, 2);
assert.equal(summary.sampleDurationMs, 5100);

const stalled = createPerformanceBuffers();
stalled.videoFrameIntervalsMs.push(120, 1500);
assert.equal(summarizePerformance(stalled, 2000).inferenceLateRate, 0.5);
const throttled = createPerformanceBuffers();
throttled.videoFrameIntervalsMs.push(66, 85, 120);
assert.equal(summarizePerformance(throttled, 5000).inferenceLateRate, 0);

console.log('Performance monitor checks passed: 17/17');
