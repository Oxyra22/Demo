import { test } from 'node:test';
import assert from 'node:assert/strict';
import { awaitOwnedResource, videoHasStalled } from '../lib/camera-session.ts';
import { classifyCameraStartError } from '../lib/camera-fallback.ts';

const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; };
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

test('accepted resource transfers to the active session', async () => {
  const controller = new AbortController(); let disposed = 0;
  assert.equal(await awaitOwnedResource(Promise.resolve('stream'), { signal: controller.signal, timeoutMs: 50, dispose: () => disposed++ }), 'stream');
  controller.abort(); assert.equal(disposed, 0);
});
test('late permission after leaving stops every returned track', async () => {
  const controller = new AbortController(), value = deferred(); let stopped = 0;
  const result = awaitOwnedResource(value.promise, { signal: controller.signal, timeoutMs: 50, dispose: stream => stream.tracks.forEach(t => t.stop()) });
  controller.abort(); await assert.rejects(result, { name: 'AbortError' });
  value.resolve({ tracks: [{ stop() { stopped++; } }, { stop() { stopped++; } }] });
  await tick(); assert.equal(stopped, 2);
});
test('timed-out detector closes when its delayed initialization completes', async () => {
  const controller = new AbortController(), value = deferred(); let closed = 0;
  const result = awaitOwnedResource(value.promise, { signal: controller.signal, timeoutMs: 8, dispose: detector => detector.close() });
  await assert.rejects(result, { name: 'TimeoutError' });
  value.resolve({ close() { closed++; } }); await tick(); assert.equal(closed, 1);
});
test('old rejection cannot change a replacement session', async () => {
  const old = new AbortController(), late = deferred();
  const result = awaitOwnedResource(late.promise, { signal: old.signal, timeoutMs: 50 });
  old.abort(); await assert.rejects(result, { name: 'AbortError' });
  const fresh = await awaitOwnedResource(Promise.resolve('new'), { signal: new AbortController().signal, timeoutMs: 50 });
  late.reject(new Error('old model failure')); await tick(); assert.equal(fresh, 'new');
});
test('already cancelled session disposes resolved resource', async () => {
  const controller = new AbortController(); controller.abort(); let disposed = 0;
  await assert.rejects(awaitOwnedResource(Promise.resolve({}), { signal: controller.signal, timeoutMs: 50, dispose: () => disposed++ }), { name: 'AbortError' });
  await tick(); assert.equal(disposed, 1);
});
test('model failure is returned and does not leak cleanup exceptions', async () => {
  await assert.rejects(awaitOwnedResource(Promise.reject(new Error('model failure')), { signal: new AbortController().signal, timeoutMs: 50 }), /model failure/);
});
test('video watchdog includes missing and frozen foreground frames', () => {
  assert.equal(videoHasStalled(7001, 2000), true);
  assert.equal(videoHasStalled(7000, 2000), false);
  assert.equal(videoHasStalled(7001, 7000), false);
  assert.equal(videoHasStalled(7001, 0), false);
});
test('startup timeout has a recoverable specific user message', () => {
  assert.equal(classifyCameraStartError({ name: 'TimeoutError' }, 'start_video').reason, 'startup_timeout');
  assert.equal(classifyCameraStartError({ name: 'TimeoutError' }, 'start_video').retryable, true);
});
