'use client';

import { useEffect, useRef } from 'react';

/** A bounded, decorative perspective field. No WebGL context or per-frame React updates. */
export function CosmicBackdrop({ reducedMotion = false, lowPower = false }: { reducedMotion?: boolean; lowPower?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d', { alpha: true });
    if (!canvas || !ctx) return;
    let width = 1, height = 1, frame = 0, previous = 0;
    let seed = 28;
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const count = lowPower ? 260 : window.innerWidth < 700 ? 390 : 720;
    const stars = Array.from({ length: count }, () => ({
      x: (random() - .5) * 2.6, y: (random() - .5) * 2.2,
      z: .04 + random() * 1.96, size: .3 + random() * .8,
      hue: random(), phase: random() * Math.PI * 2,
    }));
    const resize = () => {
      width = window.innerWidth; height = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, lowPower ? 1 : 1.25);
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (reducedMotion) paint(0);
    };
    function paint(delta: number) {
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);
      const cx = width * .57, cy = height * .39, lens = Math.max(width, height) * .43;
      ctx.lineCap = 'round';
      for (const star of stars) {
        const oldZ = star.z;
        star.z -= delta * .14;
        if (star.z < .035) { star.z += 1.96; continue; }
        const x = cx + star.x / star.z * lens, y = cy + star.y / star.z * lens;
        if (x < -30 || y < -30 || x > width + 30 || y > height + 30) continue;
        const depth = 1 - star.z / 2;
        const size = Math.min(2, star.size * (.45 + depth * 1.8));
        ctx.globalAlpha = .24 + depth * .62;
        const color = star.hue < .14 ? '#7afff4' : star.hue < .25 ? '#ff99c7' : star.hue < .3 ? '#ffe6a8' : '#eaf2ff';
        ctx.fillStyle = color; ctx.strokeStyle = color;
        if (depth > .6 && delta > 0) {
          // A short motion trail reveals forward travel while preserving pinpoint stars.
          const tailZ = oldZ + delta * .35;
          ctx.lineWidth = size * .65;
          ctx.beginPath(); ctx.moveTo(cx + star.x / tailZ * lens, cy + star.y / tailZ * lens); ctx.lineTo(x, y); ctx.stroke();
        }
        ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill();
        if (star.size > 1.07 && depth > .5) {
          ctx.globalAlpha *= .18;
          ctx.beginPath(); ctx.arc(x, y, size * 3.5, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }
    const tick = (now: number) => {
      frame = 0;
      if (document.hidden || reducedMotion) return;
      if (!previous || now - previous >= (lowPower ? 66 : 40)) {
        paint(previous ? Math.min(.1, (now - previous) / 1000) : 0);
        previous = now;
      }
      frame = requestAnimationFrame(tick);
    };
    const visibility = () => {
      cancelAnimationFrame(frame); frame = 0; previous = 0;
      if (!document.hidden && !reducedMotion) frame = requestAnimationFrame(tick);
    };
    resize(); paint(0); visibility();
    window.addEventListener('resize', resize, { passive: true });
    document.addEventListener('visibilitychange', visibility);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', resize); document.removeEventListener('visibilitychange', visibility); };
  }, [reducedMotion, lowPower]);
  return <canvas ref={ref} className="cosmic-backdrop" data-motion={reducedMotion ? 'still' : 'forward'} aria-hidden="true" />;
}
