import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

let checks = 0;
const check = (condition, message) => {
  assert.ok(condition, message);
  checks += 1;
};

const model = await stat('public/models/halloween/lantern-glass.glb');
check(model.isFile() && model.size > 0, 'CC0 lantern GLB must exist');
check(
  model.size < 30_000,
  '3D gift prop must stay below the 30 KB model budget',
);

const license = await readFile('public/models/halloween/License.txt', 'utf8');
check(
  /CC0|Creative Commons Zero/i.test(license),
  '3D model must retain its CC0 license',
);

const page = await readFile('app/page.tsx', 'utf8');
check(
  page.includes('dynamic(') && page.includes('ssr: false'),
  '3D gift must be client-only and code-split',
);
check(
  page.includes("qualityTier !== 'low'"),
  'Low quality must skip the 3D renderer',
);
check(
  page.includes('Midnight Sky Gift'),
  '3D prop must have a LIVE Gift narrative',
);

const scene = await readFile('components/gift-charm-three.tsx', 'utf8');
check(
  scene.includes('lantern-glass.glb'),
  '3D scene must load the licensed lantern asset',
);
check(
  scene.includes('placeholder.visible = false'),
  'Fallback geometry must remain until the GLB loads',
);
check(
  scene.includes('reduceMotion'),
  '3D motion must respect reduced-motion preference',
);
check(
  scene.includes('renderer.dispose()'),
  '3D scene must release renderer resources',
);

console.log(`3D Gift checks passed: ${checks}/10`);
