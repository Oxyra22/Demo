import { readFileSync, statSync } from 'node:fs';

const page = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
const premiumPage = readFileSync(
  new URL('../app/premium/page.tsx', import.meta.url),
  'utf8',
);
const stage = readFileSync(
  new URL('../components/premium-gift-stage.tsx', import.meta.url),
  'utf8',
);
const styles = readFileSync(
  new URL('../app/globals.css', import.meta.url),
  'utf8',
);
const ghostAsset = new URL(
  '../public/gifts/premium-v01/frosted-ghost.webp',
  import.meta.url,
);

const checks = [
  [
    'standard route remains the default',
    page.includes('experience="standard"'),
  ],
  [
    'premium route is independent',
    premiumPage.includes('experience="premium"'),
  ],
  [
    'premium route reuses camera behavior',
    premiumPage.includes('ReactionWeatherDemo'),
  ],
  ['Ghost Kiss timeline is explicit', stage.includes('premiumGiftTimeline')],
  ['sequence is 6.6 seconds', stage.includes('durationMs: 6600')],
  ['sequence includes face lock', stage.includes("| 'face-lock'")],
  ['sequence includes approach', stage.includes("| 'approach'")],
  ['sequence includes cheek kiss', stage.includes("| 'kiss'")],
  ['sequence includes star afterglow', stage.includes("| 'sparkle'")],
  ['live face drives the target', page.includes('faceCollider={headCollider}')],
  [
    'camera state is passed explicitly',
    page.includes('cameraActive={cameraOn}'),
  ],
  ['preview face is honest and visible', stage.includes('PREVIEW FACE')],
  ['live face state is labeled', stage.includes('LIVE FACE')],
  [
    'cheek target avoids central face cover',
    stage.includes('face.x + face.rx * 0.78'),
  ],
  ['one ghost asset is used', stage.includes('frosted-ghost.webp')],
  ['ghost asset exists', statSync(ghostAsset).size > 0],
  [
    'authored ghost journey exists',
    styles.includes('@keyframes ghostKissJourney'),
  ],
  ['kiss burst exists', styles.includes('@keyframes ghostKissBurst')],
  ['TikTok cyan token exists', styles.includes('--tiktok-cyan: #25f4ee')],
  ['TikTok pink token exists', styles.includes('--tiktok-pink: #fe2c55')],
  ['cursor aura follows pointer', page.includes("'--page-mx'")],
  ['premium avoids standard effects', page.includes('{!isPremium && (')],
  ['premium is portrait-first', styles.includes('aspect-ratio: 9 / 16')],
  [
    'edition switch exposes both outcomes',
    page.includes('gift-edition-switch'),
  ],
  [
    'reduced motion is supported',
    styles.includes('.ghost-phase-kiss .ghost-kiss-actor'),
  ],
];

const failures = checks.filter(([, passed]) => !passed);
if (failures.length) {
  console.error('Ghost Kiss checks failed:');
  failures.forEach(([label]) => console.error(`- ${label}`));
  process.exit(1);
}

console.log(`Ghost Kiss checks passed: ${checks.length}/${checks.length}`);
