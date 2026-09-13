import type { RitualResult } from './ritual-machine';

export const launchCell = {
  market: 'US · English',
  verticals: 'Gaming · Cosplay · Late-night entertainment',
  occasion: 'Halloween 2026 limited event',
  confidence: 'Concept hypothesis · regional validation required',
};

export const halloweenAssets: Record<'capsule' | RitualResult, string> = {
  capsule: '/gifts/halloween-v01/01-mystery-capsule-v01.png',
  treat: '/gifts/halloween-v01/02-treat-reveal-v01.png',
  trick: '/gifts/halloween-v01/03-trick-reveal-v01.png',
  secret: '/gifts/luminous-orbit.png',
};

export const resultCopy: Record<RitualResult, { eyebrow: string; title: string; detail: string }> = {
  treat: {
    eyebrow: 'TREAT ROUTE',
    title: 'Starlight Candy Bloom',
    detail: 'A warm reveal shaped by a held smile.',
  },
  trick: {
    eyebrow: 'TRICK ROUTE',
    title: 'Phantom Pulse',
    detail: 'A playful spectral reveal shaped by an open-mouth action.',
  },
  secret: {
    eyebrow: 'SECRET ROUTE · RARE',
    title: 'Moon Rift Awakening',
    detail: 'Smile past 55%, then open your mouth to unlock the hidden ending.',
  },
};
