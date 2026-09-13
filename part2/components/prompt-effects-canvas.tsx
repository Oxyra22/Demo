'use client';

import { useEffect, useRef } from 'react';

import {
  collideSweptHead,
  rocketVelocity,
  physicsSteps,
  headSweepSteps,
  type EffectMode,
  type HeadCollider,
  type PhysicsParticle,
} from '@/lib/prompt-effects';

type RenderParticle = PhysicsParticle & {
  kind: 'rain' | 'spark' | 'rocket';
  color: string;
  life: number;
  maxLife: number;
  trail: number;
  exploded?: boolean;
  targetY?: number;
  depth?: number;
  power?: number;
  glimmer?: boolean;
};

type BurstWave = {
  x: number;
  y: number;
  color: string;
  life: number;
  maxLife: number;
  radius: number;
};

type PromptEffectsCanvasProps = {
  mode: EffectMode;
  burstId: number;
  smilePower: number;
  laughPower: number;
  collider: HeadCollider | null;
  quality: 'high' | 'mid' | 'low';
  reduceMotion: boolean;
  showCollider?: boolean;
  onMetrics?: (metrics: {
    activeParticles: number;
    collisions: number;
  }) => void;
  onRenderFrame?: (intervalMs: number) => void;
};

const HALLOWEEN_PALETTE = [
  '#25f4ee',
  '#fe2c55',
  '#ffffff',
  '#8efbf5',
  '#ff99b3',
  '#ffd166',
  '#a78bfa',
  '#90f8a6',
  '#ff896d',
];

function seededAngle(index: number, count: number) {
  return (index / count) * Math.PI * 2 + ((index * 17) % 11) * 0.018;
}

export function PromptEffectsCanvas({
  mode,
  burstId,
  smilePower,
  laughPower,
  collider,
  quality,
  reduceMotion,
  showCollider = false,
  onMetrics,
  onRenderFrame,
}: PromptEffectsCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderCallback = useRef(onRenderFrame);
  renderCallback.current = onRenderFrame;
  const stateRef = useRef({
    mode,
    burstId,
    smilePower,
    laughPower,
    collider,
    quality,
    reduceMotion,
    showCollider,
  });

  useEffect(() => {
    stateRef.current = {
      mode,
      burstId,
      smilePower,
      laughPower,
      collider,
      quality,
      reduceMotion,
      showCollider,
    };
  }, [burstId, collider, laughPower, mode, quality, reduceMotion, smilePower, showCollider]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    const particles: RenderParticle[] = [];
    const collisionFlashes: Array<{
      x: number;
      y: number;
      life: number;
      color: string;
    }> = [];
    const burstWaves: BurstWave[] = [];
    const splashes: Array<{x: number; y: number; age: number; size: number}> = [];
    const addSplash = (x: number, y: number, size = 1) => {
      if (splashes.length < 30) splashes.push({ x, y, age: 0, size });
    };
    let frame = 0;
    let previous = performance.now();
    let lastRainSpawn = previous;
    let lastAutomaticBurst = 0;
    let seenBurstId = stateRef.current.burstId;
    let seenMode = stateRef.current.mode;
    let collisions = 0;
    let lastMetricsAt = previous;
    let cssWidth = 1;
    let cssHeight = 1;
    let dpr = 1;
    let consumedHead: HeadCollider | null = null;
    let rainSerial = 0;

    const resize = () => {
      consumedHead = null;
      const rect = canvas.getBoundingClientRect();
      cssWidth = Math.max(1, rect.width);
      cssHeight = Math.max(1, rect.height);
      const cap = stateRef.current.quality === 'high' ? 1.5 : 1.15;
      dpr = Math.min(window.devicePixelRatio || 1, cap);
      canvas.width = Math.round(cssWidth * dpr);
      canvas.height = Math.round(cssHeight * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const randomColor = (index: number) =>
      HALLOWEEN_PALETTE[index % HALLOWEEN_PALETTE.length];

    // Cache soft glows once; avoid hundreds of per-frame blur filters.
    const glowSprites = new Map<string, HTMLCanvasElement>();
    for (const color of HALLOWEEN_PALETTE) {
      const sprite = document.createElement('canvas');
      sprite.width = sprite.height = 48;
      const ctx = sprite.getContext('2d')!;
      const glow = ctx.createRadialGradient(24, 24, 0, 24, 24, 24);
      glow.addColorStop(0, color);
      glow.addColorStop(0.12, `${color}d0`);
      glow.addColorStop(0.3, `${color}72`);
      glow.addColorStop(1, `${color}00`);
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, 48, 48);
      glowSprites.set(color, sprite);
    }

    const addRain = (amount: number) => {
      for (let index = 0; index < amount; index += 1) {
        particles.push({
          kind: 'rain',
          x: Math.random() * cssWidth,
          y: -16 - Math.random() * 72,
          vx: -12 - Math.random() * 12,
          vy: 300 + Math.random() * 220,
          radius: 1.1 + Math.random() * 1.2,
          color: ['#eefcff', '#add9ff', '#c4b5ff', '#edfffc', '#ffddeb'][rainSerial++ % 5],
          glimmer: rainSerial % 10 === 0,
          life: 0,
          maxLife: 2.3 + Math.random() * 1.2,
          trail: 22 + Math.random() * 24,
        });
      }
    };

    // Pre-render the tiny colour gradient once per tint, keeping each frame cheap.
    const rainSprites = new Map<string, HTMLCanvasElement>();
    for (const tint of ['#eefcff', '#add9ff', '#c4b5ff', '#edfffc', '#ffddeb']) {
      const sprite = document.createElement('canvas');
      sprite.width = 8; sprite.height = 64;
      const ctx = sprite.getContext('2d')!;
      const trail = ctx.createLinearGradient(0, 0, 0, 64);
      trail.addColorStop(0, `${tint}00`);
      trail.addColorStop(.25, `${tint}55`);
      trail.addColorStop(.7, tint);
      trail.addColorStop(1, '#ffffff');
      ctx.fillStyle = trail; ctx.fillRect(2, 0, 4, 64);
      rainSprites.set(tint, sprite);
    }

    // Three small cached cloud sprites: no video, shader or per-frame blur.
    const cloudSprites = ['#9380d8', '#79b0de'].map(tint => {
      const sprite = document.createElement('canvas');
      sprite.width = 160; sprite.height = 80;
      const ctx = sprite.getContext('2d')!;
      for (const [x,y,r] of [[40,47,25],[68,35,31],[99,40,29],[123,50,23],[82,55,35]]) {
        const cloud = ctx.createRadialGradient(x,y,2,x,y,r);
        cloud.addColorStop(0, `${tint}b0`);
        cloud.addColorStop(.55, `${tint}65`);
        cloud.addColorStop(1, `${tint}00`);
        ctx.fillStyle=cloud; ctx.fillRect(x-r,y-r,r*2,r*2);
      }
      return sprite;
    });

    const explode = (x: number, y: number, power: number) => {
      const baseCount =
        stateRef.current.quality === 'high'
          ? 96
          : stateRef.current.quality === 'mid'
            ? 68
            : 40;
      const count = Math.round(baseCount * (0.78 + power * 0.32));
      burstWaves.push(
        {
          x,
          y,
          color: randomColor(Math.floor(x)),
          life: 0,
          maxLife: 0.52,
          radius: 78 + power * 30,
        },
        {
          x,
          y,
          color: randomColor(Math.floor(x) + 2),
          life: -0.08,
          maxLife: 0.42,
          radius: 42 + power * 20,
        },
      );
      for (let index = 0; index < count; index += 1) {
        const depth = 1 - (2 * (index + 0.5)) / count;
        const shell = Math.sqrt(1 - depth * depth);
        const perspective = 1 / (1 - depth * 0.28);
        const angle = index * 2.399963;
        const speed = (105 + ((index * 37) % 100)) * (0.35 + power);
        particles.push({
          kind: 'spark',
          x,
          y,
          vx: Math.cos(angle) * speed * shell * perspective,
          vy: Math.sin(angle) * speed * shell * perspective,
          radius: 1.4 + (depth + 1) * 0.9,
          depth,
          color: randomColor(Math.floor(x + y) + (index % 5 === 0 ? 2 : 0)),
          life: 0,
          maxLife: 1.65 + (index % 7) * 0.12,
          trail: 14 + (index % 5) * 4,
        });
      }
    };

    const launchFirework = (power = 0.82) => {
      const head = stateRef.current.collider;
      const headTop = head ? (head.y - head.ry) * cssHeight : cssHeight * .3;
      const ceiling = Math.max(24, headTop - 30);
      const count =
        stateRef.current.quality === 'high'
          ? 4
          : stateRef.current.quality === 'mid'
            ? 3
            : 2;
      for (let index = 0; index < count; index += 1) {
        const spread = (index + Math.random() * 0.6) / count;
        const startY = Math.min(cssHeight * .45, ceiling + 100 + index * 25);
        const targetY = Math.max(18, ceiling - Math.random() * Math.min(70, ceiling * .5));
        particles.push({
          kind: 'rocket',
          x: cssWidth * (0.14 + spread * 0.72),
          y: startY,
          vx: (Math.random() - .5) * 35,
          vy: rocketVelocity(startY, targetY),
          radius: 4.5,
          color: randomColor(index + seenBurstId),
          life: 0,
          maxLife: 4,
          trail: 22,
          exploded: false,
          targetY,
          power: Math.min(1, power * (0.38 + Math.random() * .8)),
        });
      }
    };

    const updateParticle = (
      particle: RenderParticle,
      dt: number,
      scaledCollider: HeadCollider | null,
      previousCollider: HeadCollider | null,
    ) => {
      const from = { x: particle.x, y: particle.y };
      particle.life += dt;
      if (particle.kind === 'rain') {
        particle.vy += 210 * dt;
        particle.vx *= Math.pow(0.994, dt * 60);
      } else if (particle.kind === 'spark') {
        particle.vy += 185 * dt;
        particle.vx *= Math.pow(0.982, dt * 60);
        particle.vy *= Math.pow(0.992, dt * 60);
      } else {
        particle.vy += 185 * dt;
      }
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;

      if (
        particle.kind === 'rocket' &&
        !particle.exploded &&
        (particle.y <= (particle.targetY ?? cssHeight * 0.2) || particle.vy >= 0)
      ) {
        particle.exploded = true;
        explode(particle.x, particle.y, particle.power ?? .7);
      }

      if (
        particle.kind !== 'rocket' &&
        scaledCollider &&
        collideSweptHead(
          particle,
          from,
          scaledCollider,
          dt,
          particle.kind === 'spark' ? 0.78 : 0.42,
          previousCollider,
        )
      ) {
        collisions += 1;
        if (particle.kind === 'rain') {
          addSplash(particle.x, particle.y, .6);
          particle.life = particle.maxLife + 1;
        } else if (collisionFlashes.length < 10) {
          collisionFlashes.push({
            x: particle.x,
            y: particle.y,
            life: 0.24,
            color: particle.color,
          });
        }
      }
      if (particle.kind === 'rain' && particle.y >= cssHeight * .94 && particle.life <= particle.maxLife) {
        addSplash(particle.x, cssHeight * .94 + Math.random() * 5, .65 + Math.random() * .55);
        particle.life = particle.maxLife + 1;
      }
    };

    const drawParticle = (particle: RenderParticle) => {
      if (particle.kind === 'rocket' && particle.exploded) return;
      const fade = Math.max(0, 1 - particle.life / particle.maxLife);
      context.globalAlpha = fade * (particle.depth === undefined ? 1 : 0.65 + (particle.depth + 1) * 0.175);
      if (particle.kind === 'rain') context.globalAlpha = .85;
      if (particle.kind === 'rain') {
        const sprite = rainSprites.get(particle.color);
        if (sprite) {
          context.save();
          context.translate(particle.x, particle.y);
          context.rotate(Math.atan2(-particle.vx, particle.vy));
          context.drawImage(sprite, -particle.radius, -particle.trail, particle.radius * 2, particle.trail);
          if (particle.glimmer) {
            const glow = glowSprites.get('#a78bfa')!;
            context.globalAlpha *= .48;
            context.drawImage(glow,-8,-particle.trail*.7,16,particle.trail*.8);
          }
          context.restore();
          return;
        }
      }
      const head = stateRef.current.collider;
      if (particle.kind === 'spark' && head) {
        const nx = (particle.x / cssWidth - head.x) / Math.max(.01, head.rx * 1.2);
        const ny = (particle.y / cssHeight - head.y) / Math.max(.01, head.ry);
        if (nx * nx + ny * ny < 1.3 && ny > -.2) context.globalAlpha *= .05;
      }
      context.strokeStyle = particle.color;
      context.fillStyle = particle.color;
      context.shadowColor = particle.color;
      context.shadowBlur = 0;
      context.lineWidth =
        particle.kind === 'rain'
          ? particle.radius
          : Math.max(0.8, particle.radius * 0.62);
      context.beginPath();
      context.moveTo(particle.x, particle.y);
      const speed = Math.max(1, Math.hypot(particle.vx, particle.vy));
      context.lineTo(
        particle.x - (particle.vx / speed) * particle.trail,
        particle.y - (particle.vy / speed) * particle.trail,
      );
      context.stroke();
      if (particle.kind === 'rain') return;
      const sprite = glowSprites.get(particle.color);
      if (sprite) {
        const size = particle.radius * (stateRef.current.quality === 'low' ? 5 : 7);
        const previousAlpha = context.globalAlpha;
        context.globalAlpha = previousAlpha * .34;
        context.drawImage(sprite, particle.x - size / 2, particle.y - size / 2, size, size);
        context.globalAlpha = previousAlpha;
      }
      context.fillStyle = particle.color;
      context.beginPath();
      context.arc(particle.x, particle.y, particle.radius * .55, 0, Math.PI * 2);
      context.fill();
      if (particle.kind === 'spark' && !stateRef.current.reduceMotion && Math.floor(particle.maxLife * 100) % 5 === 0) {
        const shimmer = Math.pow(Math.max(0,Math.sin(particle.life * 11 + particle.maxLife * 13)), 6);
        if (shimmer > .25) {
          context.save();
          context.globalAlpha *= shimmer * .85;
          const ray = 2 + particle.radius * 1.25;
          context.strokeStyle = '#fff8e8'; context.lineWidth = .8;
          context.beginPath();
          context.moveTo(particle.x-ray,particle.y); context.lineTo(particle.x+ray,particle.y);
          context.moveTo(particle.x,particle.y-ray); context.lineTo(particle.x,particle.y+ray);
          context.stroke(); context.restore();
        }
      }
    };

    const render = (now: number) => {
      if (document.hidden) {
        frame = 0;
        return;
      }
      if (now - previous < 32) {
        frame = requestAnimationFrame(render);
        return;
      }
      const elapsedMs = now - previous;
      renderCallback.current?.(elapsedMs);
      const steps = physicsSteps(elapsedMs);
      const dt = steps.reduce((sum, step) => sum + step, 0);
      previous = now;
      const current = stateRef.current;
      if (current.mode !== seenMode) {
        if (current.mode === 'rain') {
          collisions = 0;
          for (let index = particles.length - 1; index >= 0; index -= 1)
            if (particles[index].kind !== 'rain') particles.splice(index, 1);
          burstWaves.splice(0);
          collisionFlashes.splice(0);
        } else if (current.mode === 'fireworks') {
          for (let index = particles.length - 1; index >= 0; index -= 1)
            if (particles[index].kind === 'rain') particles.splice(index, 1);
        }
        seenMode = current.mode;
      }
      const particleLimit =
        current.quality === 'high'
          ? 420
          : current.quality === 'mid'
            ? 280
            : 150;
      const scaledCollider = current.collider
        ? {
            x: current.collider.x * cssWidth,
            y: current.collider.y * cssHeight,
            rx: current.collider.rx * cssWidth,
            ry: current.collider.ry * cssHeight,
            vx: current.collider.vx * cssWidth,
            vy: current.collider.vy * cssHeight,
          }
        : null;

      if (
        current.mode === 'rain' &&
        now - lastRainSpawn > (current.reduceMotion ? 120 : 42)
      ) {
        const amount =
          current.quality === 'high' ? 8 : current.quality === 'mid' ? 6 : 3;
        addRain(Math.max(1, Math.round(amount * (0.6 + current.smilePower))));
        lastRainSpawn = now;
      }
      if (current.burstId !== seenBurstId) {
        seenBurstId = current.burstId;
        collisions = 0;
        launchFirework(Math.max(0.65, current.laughPower));
        lastAutomaticBurst = now;
      } else if (
        current.mode === 'fireworks' &&
        now - lastAutomaticBurst > (current.reduceMotion ? 1250 : 720)
      ) {
        launchFirework(Math.max(0.65, current.laughPower));
        lastAutomaticBurst = now;
      }

      const sweeps = headSweepSteps(consumedHead, scaledCollider, steps.length);
      for (let index = particles.length - 1; index >= 0; index -= 1) {
        const particle = particles[index];
        for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
          updateParticle(particle, steps[stepIndex], sweeps[stepIndex].to, sweeps[stepIndex].from);
          if (particle.exploded || particle.life > particle.maxLife) break;
        }
        const expired =
          particle.life > particle.maxLife ||
          particle.y > cssHeight + 90 ||
          particle.x < -120 ||
          particle.x > cssWidth + 120 ||
          (particle.kind === 'rocket' && particle.exploded);
        if (expired) particles.splice(index, 1);
      }
      if (particles.length > particleLimit)
        particles.splice(0, particles.length - particleLimit);

      consumedHead = scaledCollider;

      context.clearRect(0, 0, cssWidth, cssHeight);
      if (current.mode === 'rain') {
        const headTop = scaledCollider ? scaledCollider.y-scaledCollider.ry : cssHeight*.3;
        const cloudHeight = Math.min(42,Math.max(0,headTop-22));
        if (cloudHeight > 12) {
          context.save(); context.globalCompositeOperation='source-over'; context.shadowBlur=0;
          const cloudCount = current.quality === 'low' ? 2 : 3;
          for(let i=0;i<cloudCount;i++) {
            const drift = current.reduceMotion ? 0 : Math.sin(now*.00028+i*2)*cssWidth*.045;
            const w = cssWidth * (i===1 ? .31 : .36);
            const x = cssWidth * [.1,.55,.77][i] - w*.5 + drift;
            const y = Math.max(4,Math.min(cssHeight*.17 + i*5,headTop-cloudHeight-10));
            context.globalAlpha = i===1 ? .38 : .5;
            context.drawImage(cloudSprites[i%2],x,y,w,cloudHeight);
          }
          context.restore();
        }
      }
      context.globalCompositeOperation = 'lighter';
      // Crown sheet opens, breaks into elongated jets, then leaves a low ripple.
      // Bounded vector simulation: no video decode or full-frame blur per droplet.
      for (let i = splashes.length - 1; i >= 0; i--) {
        const splash = splashes[i];
        splash.age += dt;
        if (splash.age > .55 || current.mode !== 'rain') { splashes.splice(i, 1); continue; }
        const t = splash.age / .55;
        const w = (3 + t * 25) * splash.size;
        const h = Math.sin(Math.PI * t) * 18 * splash.size;
        context.shadowBlur = 0;
        context.globalAlpha = (1 - t) * .65;
        context.strokeStyle = '#d9f4ee';
        context.lineWidth = .8;
        context.beginPath();
        context.ellipse(splash.x, splash.y, w, w * .2, 0, 0, Math.PI * 2);
        context.stroke();
        context.beginPath();
        context.moveTo(splash.x - w * .65, splash.y);
        for (let j = 0; j <= 6; j++) {
          const u = j / 6;
          context.lineTo(splash.x + (u - .5) * w * 1.3, splash.y - h * (j % 2 ? .45 : 1));
        }
        context.lineTo(splash.x + w * .65, splash.y);
        context.stroke();
        for (let j = 0; j < 5; j++) {
          const direction = (j - 2) * .55;
          const x = splash.x + direction * w;
          const y = splash.y - h * (1 - Math.abs(direction) * .3);
          context.beginPath();
          context.moveTo(x, y);
          context.lineTo(x + direction * 2.5, y - (1 - t) * 3);
          context.stroke();
        }
      }
      for (let index = burstWaves.length - 1; index >= 0; index -= 1) {
        const wave = burstWaves[index];
        wave.life += dt;
        if (wave.life <= 0) continue;
        if (wave.life >= wave.maxLife) {
          burstWaves.splice(index, 1);
          continue;
        }
        const progress = wave.life / wave.maxLife;
        const radius = 8 + wave.radius * Math.pow(progress, 0.72);
        const alpha = Math.pow(1 - progress, 1.8);
        const glow = context.createRadialGradient(
          wave.x,
          wave.y,
          0,
          wave.x,
          wave.y,
          Math.max(12, radius * 0.58),
        );
        glow.addColorStop(0, `${wave.color}cc`);
        glow.addColorStop(0.22, `${wave.color}55`);
        glow.addColorStop(1, `${wave.color}00`);
        // A translucent colored shell preserves hue when several bursts overlap.
        context.globalCompositeOperation = 'source-over';
        context.globalAlpha = alpha * 0.26;
        context.fillStyle = glow;
        context.beginPath();
        context.arc(wave.x, wave.y, radius * 0.58, 0, Math.PI * 2);
        context.fill();
        context.globalAlpha = alpha * 0.50;
        context.strokeStyle = wave.color;
        context.lineWidth = 1.4;
        context.shadowColor = wave.color;
        context.shadowBlur = 8;
        context.beginPath();
        context.arc(wave.x, wave.y, radius, 0, Math.PI * 2);
        context.stroke();
      }
      // Back shell before front shell gives each burst volume without a WebGL renderer.
      context.globalCompositeOperation = 'source-over';
      particles.sort((a, b) => (a.depth ?? 0) - (b.depth ?? 0));
      particles.forEach(drawParticle);
      for (let index = collisionFlashes.length - 1; index >= 0; index -= 1) {
        const flash = collisionFlashes[index];
        flash.life -= dt;
        if (flash.life <= 0) {
          collisionFlashes.splice(index, 1);
          continue;
        }
        context.globalAlpha = flash.life / 0.24;
        context.strokeStyle = flash.color;
        context.lineWidth = 2;
        context.shadowColor = flash.color;
        context.shadowBlur = 4;
        context.beginPath();
        const radius = 3 + (1 - flash.life / 0.24) * 7;
        for (let ray = 0; ray < 4; ray++) {
          const angle = ray * Math.PI / 2 + .3;
          context.moveTo(flash.x + Math.cos(angle) * radius * .4, flash.y + Math.sin(angle) * radius * .4);
          context.lineTo(flash.x + Math.cos(angle) * radius, flash.y + Math.sin(angle) * radius);
        }
        context.stroke();
      }
      if (scaledCollider && current.mode === 'fireworks' && current.showCollider) {
        const collisionGlow = Math.min(
          0.34,
          0.08 + collisionFlashes.length * 0.035,
        );
        context.globalCompositeOperation = 'source-over';
        context.globalAlpha = collisionGlow;
        context.strokeStyle = '#ffe6a6';
        context.lineWidth = 1.25;
        context.setLineDash([5, 9]);
        context.beginPath();
        context.ellipse(
          scaledCollider.x,
          scaledCollider.y,
          scaledCollider.rx,
          scaledCollider.ry,
          0,
          0,
          Math.PI * 2,
        );
        context.stroke();
        context.setLineDash([]);
      }
      context.globalAlpha = 1;
      context.shadowBlur = 0;
      context.globalCompositeOperation = 'source-over';

      if (onMetrics && now - lastMetricsAt > 500) {
        onMetrics({ activeParticles: particles.length, collisions });
        lastMetricsAt = now;
      }
      frame = requestAnimationFrame(render);
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(frame);
        consumedHead = null;
        frame = 0;
      } else if (!frame) {
        previous = performance.now();
        lastRainSpawn = previous;
        frame = requestAnimationFrame(render);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    frame = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', onVisibility);
      observer.disconnect();
    };
  }, [onMetrics]);

  return (
    <canvas
      ref={canvasRef}
      className="physics-effects-canvas"
      aria-hidden="true"
    />
  );
}
