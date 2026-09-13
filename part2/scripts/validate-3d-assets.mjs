import { readFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const models = [
  'public/models/halloween/pumpkin-carved.glb',
  'public/models/halloween/character-ghost.glb',
  'public/models/halloween/lantern-glass.glb',
];

let checks = 0;
let totalBytes = 0;
let dependencyBytes = 0;
const glbJson = new Map();

function parseGlbJson(buffer) {
  const declaredLength = buffer.readUInt32LE(8);
  if (declaredLength !== buffer.length)
    throw new Error(
      `GLB length mismatch: ${declaredLength} != ${buffer.length}`,
    );
  const jsonChunkLength = buffer.readUInt32LE(12);
  if (buffer.readUInt32LE(16) !== 0x4e4f534a)
    throw new Error('First GLB chunk is not JSON');
  return JSON.parse(
    buffer
      .subarray(20, 20 + jsonChunkLength)
      .toString('utf8')
      .trim(),
  );
}

for (const path of models) {
  const info = await stat(path);
  if (!info.isFile() || info.size <= 0)
    throw new Error(`${path} is missing or empty`);
  checks += 1;
  totalBytes += info.size;
  const buffer = await readFile(path);
  const header = buffer.subarray(0, 4).toString('ascii');
  if (header !== 'glTF')
    throw new Error(`${path} is not a valid binary glTF container`);
  checks += 1;
  glbJson.set(path, parseGlbJson(buffer));
}

const checkedDependencies = new Set();
for (const [modelPath, json] of glbJson) {
  for (const image of json.images ?? []) {
    if (!image.uri || image.uri.startsWith('data:')) continue;
    const dependencyPath = resolve(dirname(modelPath), image.uri);
    if (checkedDependencies.has(dependencyPath)) continue;
    const dependency = await stat(dependencyPath);
    if (!dependency.isFile() || dependency.size <= 0)
      throw new Error(`${modelPath} image dependency is missing: ${image.uri}`);
    checkedDependencies.add(dependencyPath);
    dependencyBytes += dependency.size;
    checks += 1;
  }
}

if (totalBytes > 300_000)
  throw new Error(`3D pilot payload is ${totalBytes} bytes; budget is 300000`);
checks += 1;

const ghostJson = glbJson.get('public/models/halloween/character-ghost.glb');
const ghostAnimations = new Set(
  (ghostJson?.animations ?? []).map((animation) => animation.name),
);
for (const requiredClip of ['idle', 'jump', 'emote-no']) {
  if (!ghostAnimations.has(requiredClip))
    throw new Error(`Ghost animation clip is missing: ${requiredClip}`);
  checks += 1;
}

const license = await readFile('public/models/halloween/License.txt', 'utf8');
if (!/CC0|Creative Commons Zero/i.test(license))
  throw new Error('Bundled license does not identify CC0');
checks += 1;

const page = await readFile('app/page.tsx', 'utf8');
if (!page.includes('dynamic(') || !page.includes('ssr: false'))
  throw new Error('3D scene must stay client-only and code-split');
checks += 1;
if (
  !page.includes("quality !== 'low'") &&
  !page.includes("qualityTier !== 'low'")
)
  throw new Error('Low-tier 2D fallback is missing');
checks += 1;

const scene = await readFile('components/halloween-three-scene.tsx', 'utf8');
for (const failureMode of [
  'webgl_unavailable',
  'model_load_failed',
  'context_lost',
]) {
  if (!scene.includes(failureMode))
    throw new Error(`3D fallback is missing: ${failureMode}`);
  checks += 1;
}
if (!scene.includes('prefers-reduced-motion: reduce'))
  throw new Error('Reduced-motion rendering policy is missing');
checks += 1;
if (
  page.includes('HalloweenThreeScene') &&
  !page.includes("threeStatus === 'first_visible_frame'")
)
  throw new Error('2D art must stay visible until the first 3D candidate frame');
checks += 1;
if (!scene.includes('const rift = new THREE.Group()'))
  throw new Error('Secret route must have an independent procedural Moon Rift');
checks += 1;
if (!scene.includes('new THREE.InstancedMesh('))
  throw new Error('Moon Rift shards must share one instanced draw call');
checks += 1;
if (!scene.includes("rift.visible = showingResult && current.result === 'secret'"))
  throw new Error('Moon Rift visibility must be exclusive to the Secret result');
checks += 1;
if (
  scene.includes(
    "current.result === 'treat' || current.result === 'secret'",
  ) ||
  scene.includes(
    "current.result === 'trick' || current.result === 'secret'",
  )
)
  throw new Error('Secret must not stack Treat or Trick hero models');
checks += 1;
if (!scene.includes('stageElapsedMs'))
  throw new Error('Secret peak must be driven by a bounded stage timeline');
checks += 1;
for (const runtimeGuard of [
  'let terminal = false',
  'revealRequestedAtRef',
  'window.getComputedStyle(canvas)',
  'canvas.isConnected',
]) {
  if (!scene.includes(runtimeGuard))
    throw new Error(`3D runtime guard is missing: ${runtimeGuard}`);
  checks += 1;
}
for (const parentGuard of ['activeThreeRunRef', 'failedThreeRunsRef']) {
  if (page.includes('HalloweenThreeScene') && !page.includes(parentGuard))
    throw new Error(`Parent evidence guard is missing: ${parentGuard}`);
  checks += 1;
}
const css = await readFile('app/globals.css', 'utf8');
if (
  !/\.ritual-result-secret\s+\.ritual-art-wrap:not\(\.ritual-art-wrap-3d-visible\)::before/.test(
    css,
  )
)
  throw new Error('Secret route needs a semantically matching CSS fallback');
checks += 1;
if (
  !/\.ritual-result-secret\s+\.ritual-particles\s*\{[^}]*display:\s*none;[^}]*\}/.test(
    css,
  )
)
  throw new Error('Secret route must suppress the generic repeated particle burst');
checks += 1;
for (const observabilitySignal of [
  'elapsedMs',
  'loadedModels',
  'three_models_loaded',
  'three_first_visible_frame',
  'revealToFrameMs',
  'sceneRunId',
  'three_scene_fallback',
]) {
  if (
    page.includes('HalloweenThreeScene') &&
    !`${scene}\n${page}`.includes(observabilitySignal)
  )
    throw new Error(
      `3D observability signal is missing: ${observabilitySignal}`,
    );
  checks += 1;
}

console.log(
  `3D asset checks passed: ${checks}/${checks} · ${((totalBytes + dependencyBytes) / 1024).toFixed(1)} KB complete payload`,
);
