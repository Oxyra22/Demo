import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';

const read = (file) =>
  readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
let checks = 0;
const check = (condition, message) => {
  assert.ok(condition, message);
  checks += 1;
};

const retrospective = read('RETROSPECTIVE.md');
const body = retrospective.split('\n\n')[1];
const wordCount = [...body.replace(/\s/g, '')].length;
check(wordCount > 0 && wordCount <= 200, `Chinese retrospective is ${wordCount} characters`);
check(
  /纠偏(?:提示词| Prompt)/.test(retrospective),
  'correction prompt is required',
);
check(
  /主动限频.*渲染帧率/.test(retrospective),
  'retrospective must name the real AI failure',
);

const readme = read('README.md');
for (const phrase of [
  '微笑',
  '下雨',
  '大笑',
  '烟花',
  '碰撞',
  '准确率',
  '视频与关键点留在',
])
  check(
    readme.toLowerCase().includes(phrase.toLowerCase()),
    `README must include ${phrase}`,
  );
check(
  !readme.includes('/Users/'),
  'README must not contain a local absolute path',
);

const submission = read('SUBMISSION.md');
const hasPendingUrls =
  submission.includes('{{PUBLIC_DEMO_URL}}') &&
  submission.includes('{{PUBLIC_REPOSITORY_URL}}');
const hasPublicUrls = (submission.match(/https:\/\//g) ?? []).length >= 2;
const explicitlyPending = /未发布/.test(submission) && /Oxyra22\/Demo/.test(submission);
check(
  hasPendingUrls || hasPublicUrls || explicitlyPending,
  'submission URLs must be pending tokens or public HTTPS links',
);
check(
  /without login/i.test(submission),
  'anonymous-access release gate is required',
);

const hosting = JSON.parse(read('.openai/hosting.json'));
check(
  hosting.project_id.startsWith('appgprj_'),
  'Sites project id is required',
);

for (const asset of [
  'public/face_landmarker.task',
  'public/wasm/vision_wasm_internal.wasm',
  'public/models/halloween/lantern-glass.glb',
  'public/models/halloween/License.txt',
  'public/og-h19.png',
]) {
  check(
    statSync(new URL(`../${asset}`, import.meta.url)).size > 0,
    `${asset} must exist`,
  );
}

const layout = read('app/layout.tsx');
check(
  layout.includes("url: '/og-h19.png'"),
  'Open Graph image must use the prompt-faithful H19 cover',
);
check(
  layout.includes("images: ['/og-h19.png']"),
  'Twitter image must use the prompt-faithful H19 cover',
);
check(
  !layout.includes('Live Reactor expression FX prototype'),
  'stale Live Reactor social copy must be removed',
);

const page = read('app/page.tsx');
for (const phrase of [
  "commitEffect('rain'",
  "commitEffect('fireworks'",
  'PromptEffectsCanvas',
  'WeatherStudio',
  "qualityTier === 'low'",
])
  check(page.includes(phrase), `page must include ${phrase}`);

const physics = read('lib/prompt-effects.ts');
for (const phrase of [
  'resolveEffectIntent',
  'collideWithHead',
  'relativeVelocityX',
])
  check(physics.includes(phrase), `physics contract must include ${phrase}`);

const css = read('app/globals.css');
check(
  css.includes('.physics-effects-canvas'),
  'physics canvas style is required',
);
check(css.includes('.gift-charm-shell'), '3D Gift shell style is required');

console.log(
  `Release structure checks passed: ${checks}/${checks} · retrospective ${wordCount}/200 Chinese characters · URLs ${hasPendingUrls || explicitlyPending ? 'pending — publication not proven' : 'present — access still requires verification'}`,
);
