import assert from 'node:assert/strict';
import {
  initialThreeEvidence,
  mergeThreeEvidence,
} from '../lib/three-evidence.ts';

const run = 'scene-2';
let state = mergeThreeEvidence(initialThreeEvidence, {
  type: 'scene_started',
  sceneRunId: run,
  elapsedMs: 0,
  loadedModels: 0,
});
assert.equal(state.status, 'loading');
assert.equal(state.sceneRunId, run);

// A visible-frame event cannot overtake the models-loaded milestone.
const earlyFrame = mergeThreeEvidence(state, {
  type: 'first_visible_frame',
  sceneRunId: run,
  result: 'secret',
  elapsedMs: 20,
  revealToFrameMs: 16,
  loadedModels: 3,
});
assert.equal(earlyFrame, state);

state = mergeThreeEvidence(state, {
  type: 'models_loaded',
  sceneRunId: run,
  elapsedMs: 240,
  loadedModels: 3,
});
assert.equal(state.status, 'models_loaded');
assert.equal(state.modelsLoadedMs, 240);

state = mergeThreeEvidence(state, {
  type: 'first_visible_frame',
  sceneRunId: run,
  result: 'secret',
  elapsedMs: 310,
  revealToFrameMs: 18,
  loadedModels: 3,
});
assert.equal(state.status, 'first_visible_frame');
assert.equal(state.revealToFrameMs, 18);
assert.equal(state.result, 'secret');
const completedState = state;
state = mergeThreeEvidence(state, {
  type: 'models_loaded',
  sceneRunId: run,
  elapsedMs: 350,
  loadedModels: 3,
});
assert.equal(state, completedState);
state = mergeThreeEvidence(state, {
  type: 'first_visible_frame',
  sceneRunId: run,
  result: 'secret',
  elapsedMs: 360,
  revealToFrameMs: 40,
  loadedModels: 3,
});
assert.equal(state, completedState);

// A late event from a superseded scene run is ignored.
const nextRun = mergeThreeEvidence(state, {
  type: 'scene_started',
  sceneRunId: 'scene-3',
  elapsedMs: 0,
  loadedModels: 0,
});
const stale = mergeThreeEvidence(nextRun, {
  type: 'models_loaded',
  sceneRunId: run,
  elapsedMs: 500,
  loadedModels: 3,
});
assert.equal(stale, nextRun);

const fallback = mergeThreeEvidence(nextRun, {
  type: 'fallback',
  sceneRunId: 'scene-3',
  reason: 'context_lost',
  phase: 'rendering',
  elapsedMs: 80,
  loadedModels: 1,
});
assert.equal(fallback.status, 'fallback');
assert.equal(fallback.fallbackReason, 'context_lost');
assert.equal(fallback.fallbackPhase, 'rendering');

const cannotRevive = mergeThreeEvidence(fallback, {
  type: 'models_loaded',
  sceneRunId: 'scene-3',
  elapsedMs: 130,
  loadedModels: 3,
});
assert.equal(cannotRevive, fallback);

console.log('3D evidence reducer: 18/18 checks passed');
