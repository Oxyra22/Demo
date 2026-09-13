import assert from 'node:assert/strict';
import { initialRitualState, ritualReducer } from '../lib/ritual-machine.ts';

const step = (state, action) => ritualReducer(state, action);

let state = initialRitualState;

// Facial input cannot start a transaction or an idle ritual.
state = step(state, { type: 'TICK', smile: 1, deltaMs: 5000 });
assert.equal(state.stage, 'idle');

// The viewer's already-completed Gift is the only normal entry point.
state = step(state, { type: 'RECEIVE', sender: '@moonfox' });
assert.equal(state.stage, 'arrived');
assert.equal(state.sender, '@moonfox');
state = step(state, { type: 'BEGIN' });
assert.equal(state.stage, 'sculpting');

// Charge is continuous, decays rather than hard-resetting, and eventually confirms Treat.
state = step(state, { type: 'TICK', smile: 0.8, deltaMs: 500 });
const charged = state.progress;
assert.ok(charged > 0 && charged < 1);
state = step(state, { type: 'TICK', smile: 0, deltaMs: 250 });
assert.ok(state.progress > 0 && state.progress < charged);
while (state.stage === 'sculpting') state = step(state, { type: 'TICK', smile: 0.9, deltaMs: 250 });
assert.equal(state.stage, 'reveal');
assert.equal(state.result, 'treat');

// Early open-mouth action yields Trick.
state = step(state, { type: 'RESET' });
state = step(step(state, { type: 'RECEIVE', sender: '@moonfox' }), { type: 'BEGIN' });
state = step(state, { type: 'CONFIRM', result: 'trick' });
assert.equal(state.result, 'trick');

// Open-mouth action after 55% charge deterministically yields Secret.
state = step(state, { type: 'RESET' });
state = step(step(state, { type: 'RECEIVE', sender: '@moonfox' }), { type: 'BEGIN' });
while (state.progress <= 0.56) state = step(state, { type: 'TICK', smile: 0.8, deltaMs: 180 });
state = step(state, { type: 'CONFIRM', result: 'trick' });
assert.equal(state.result, 'secret');

// Face loss pauses without losing progress and the ritual is resumable.
state = step(state, { type: 'RESET' });
state = step(step(state, { type: 'RECEIVE', sender: '@moonfox' }), { type: 'BEGIN' });
state = step(state, { type: 'TICK', smile: 0.8, deltaMs: 400 });
const beforePause = state.progress;
state = step(state, { type: 'PAUSE' });
assert.equal(state.stage, 'paused');
assert.equal(state.progress, beforePause);
state = step(state, { type: 'RESUME' });
assert.equal(state.stage, 'sculpting');
assert.equal(state.progress, beforePause);

// A signature is only accepted during Afterglow.
state = step(state, { type: 'SIGN' });
assert.equal(state.signed, false);
state = step(state, { type: 'CONFIRM', result: 'treat' });

// Timed stages cannot be skipped or entered from an unrelated state.
const revealState = state;
state = step(state, { type: 'ENTER', stage: 'afterglow' });
assert.equal(state, revealState);
state = step(state, { type: 'ENTER', stage: 'peak' });
const peakState = state;
state = step(state, { type: 'ENTER', stage: 'cooldown' });
assert.equal(state, peakState);
state = step(state, { type: 'ENTER', stage: 'afterglow' });
state = step(state, { type: 'SIGN' });
assert.equal(state.signed, true);
state = step(state, { type: 'ENTER', stage: 'peak' });
assert.equal(state.stage, 'afterglow');
state = step(state, { type: 'ENTER', stage: 'cooldown' });
assert.equal(state.stage, 'cooldown');

console.log('ritual state machine: 12 deterministic checks passed');
