'use client';

import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Camera, CameraOff, Play, Square, CloudRain, PartyPopper, ArrowUpRight, Ghost, Heart, Sparkles, RotateCcw } from 'lucide-react';
import { CosmicBackdrop } from './cosmic-backdrop';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { DEMO_VERSION } from '@/lib/release';
import { REFLECTION, REFLECTION_TEXT } from '@/lib/reflection';
import type { EffectMode } from '@/lib/prompt-effects';
import './weather-studio.css';

type Props = {
  videoRef: RefObject<HTMLVideoElement | null>;
  cameraOn: boolean; cameraMessage: string; detectorState: string;
  mode: EffectMode; previewing: boolean; stageLabel: string;
  softLight: boolean; onSoftLight: (value: boolean) => void;
  reducedMotion: boolean; lowPower: boolean;
  onOpenCamera: () => void; onStopCamera: () => void;
  onPreview: (mode: 'rain' | 'fireworks') => void; onReset: () => void;
  children: ReactNode; diagnostics: ReactNode;
};

export function WeatherStudio(p: Props) {
  const [playing, setPlaying] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clearSequence = () => { timers.current.forEach(clearTimeout); timers.current = []; setPlaying(false); };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const play = () => {
    clearSequence();
    if (playing) { p.onReset(); return; }
    setPlaying(true); p.onPreview('rain');
    timers.current = [setTimeout(() => p.onPreview('fireworks'), 3200), setTimeout(() => setPlaying(false), 7400)];
  };
  const camera = () => { clearSequence(); p.onReset(); (p.cameraOn || p.detectorState === 'loading' ? p.onStopCamera : p.onOpenCamera)(); };
  return (
    <main className="weather-studio ws-creator-poster" data-demo-version={DEMO_VERSION} data-effect-mode={p.mode}>
      <div className="ws-universe" aria-hidden="true"><div className="ws-nebula" /><div className="ws-orbit" /></div>
      <div className="ws-poster-print" aria-hidden="true" />
      <CosmicBackdrop reducedMotion={p.reducedMotion} lowPower={p.lowPower} />
      <header className="ws-header">
        <a href="/" className="ws-wordmark" aria-label="oxyra TikTok home">oxyra <span>TikTok</span><i>✦</i></a>
        <Dialog>
          <DialogTrigger className="ws-header-link">Reflection <ArrowUpRight size={16} /></DialogTrigger>
          <DialogContent className="ws-reflection" lang="zh-CN">
            <DialogHeader>
              <span className="ws-reflection-eyebrow">Oxyra · {Array.from(REFLECTION_TEXT).length} / 200 字</span>
              <DialogTitle className="ws-reflection-title">Vibecoding 复盘</DialogTitle>
              <DialogDescription className="ws-reflection-intro">我如何识别问题，并把纠偏落实到实现。</DialogDescription>
            </DialogHeader>
            <div className="ws-reflection-copy"><p>{REFLECTION.experience}</p><blockquote><b>纠偏 Prompt</b><p>“{REFLECTION.prompt}”</p></blockquote><p>{REFLECTION.boundary}</p></div>
          </DialogContent>
        </Dialog>
      </header>
      <div className="ws-layout">
        <section className="ws-intro">
          <span className="ws-sticker">EXPRESSION PLAYGROUND <span>✦</span></span>
          <h1>Your smile. <br />A brighter <em>sky.</em></h1>
          <p className="ws-description">Smile for a shower. Laugh for fireworks.<br />Move your head and watch the sparks bounce.</p>
          <div className="ws-action-card" data-glass>
            <div className="ws-primary-actions">
              <button className="ws-button ws-camera" onClick={camera}>
                {p.cameraOn ? <CameraOff size={21} /> : <Camera size={21} />}
                {p.cameraOn ? 'Close Camera' : p.detectorState === 'loading' ? 'Cancel opening' : 'Open Camera'}
              </button>
              <button className="ws-button ws-play" onClick={play} disabled={p.cameraOn || p.detectorState === 'loading'}>
                {playing ? <Square size={18} /> : <Play size={20} />}{playing ? 'Stop Demo' : 'Play Demo'}
              </button>
            </div>
            <div className="ws-previews" aria-label="Manual effect previews">
              <button onClick={() => { clearSequence(); p.onPreview('rain'); }} disabled={p.cameraOn || p.detectorState === 'loading'}><CloudRain size={17} /> Preview rain</button>
              <button onClick={() => { clearSequence(); p.onPreview('fireworks'); }} disabled={p.cameraOn || p.detectorState === 'loading'}><PartyPopper size={17} /> Fireworks</button>
              <button className="ws-reset" aria-label="Reset effects" onClick={() => { clearSequence(); p.onReset(); }}><RotateCcw size={16} /></button>
            </div>
            <p className={`ws-status ${p.detectorState === 'fallback' ? 'ws-error' : ''}`} role="status">
              <span aria-hidden="true" />{p.cameraOn || p.detectorState !== 'idle' ? p.cameraMessage : playing ? 'Preview sequence · rain, then fireworks' : 'Try Play Demo first, or open your camera.'}
            </p>
            <label className="ws-soft-light"><input type="checkbox" checked={p.softLight} onChange={e => p.onSoftLight(e.target.checked)} />Soft light <small>Gentle camera filter</small></label>
          </div>
          <a href="/premium" className="ws-other" data-glass><Ghost size={24} /><span><strong>More vibe coding experiments</strong><small>Ghost Kiss · meet your little ghost friend</small></span><ArrowUpRight size={21} /></a>
          <div className="ws-about-entry"><Dialog>
            <DialogTrigger className="ws-about-trigger">About this project & test details <ArrowUpRight size={15} /></DialogTrigger>
            <DialogContent className="ws-reflection ws-about-dialog">
              <DialogHeader><span className="ws-reflection-eyebrow">oxyra · {DEMO_VERSION}</span><DialogTitle className="ws-reflection-title">About this project</DialogTitle><DialogDescription className="ws-reflection-intro">How to try it, and what this session measures.</DialogDescription></DialogHeader>
            <p>My Part 2 Vibecoding prototype. Facial expression tracking runs in your browser. Play Demo uses a simulated head; Open Camera uses your live face. The LIVE profile and comments are illustrative.</p>
            <p>For a camera test: hold a relaxed face for calibration, then smile, laugh and move left or right. Keep your forehead in view.</p>
            <p>Oxyra · {DEMO_VERSION} · Independent interview prototype.</p>
            {p.diagnostics}
            </DialogContent>
          </Dialog></div>
        </section>
        <section className="ws-stage-column" aria-label="Phone live preview">
          <div className="ws-stage-disc" aria-hidden="true" />
          <img className="ws-brand-sculpture" src="/gifts/creator-poster/tiktok-ceramic-3d.png" alt="" width={1024} height={1024} aria-hidden="true" />
          <div className="ws-phone-rim" data-glass>
            <div className={`ws-phone ws-${p.mode}`} data-face-source={p.cameraOn ? 'live' : 'simulated'}>
              <video ref={p.videoRef} autoPlay playsInline muted className={`ws-video ${p.cameraOn ? 'is-visible' : ''}`} style={{ filter: p.softLight ? 'brightness(1.06) contrast(.96) saturate(1.035)' : undefined }} />
              {!p.cameraOn && <div className="ws-preview-face"><div className="ws-face-halo" /><img className="ws-demo-emoji" src="/gifts/creator-poster/demo-face-yellow-emoji.png" alt="Smiling yellow demo face" width={1024} height={1024} /><span>Demo face</span></div>}
              <div className="ws-phone-shade" />
              {p.children}
              <div className="ws-live-header"><b className="ws-avatar">J</b><div><strong>Jamie</strong><small>Good vibes, brighter skies ✨</small></div><b className="ws-live-badge">LIVE</b><span>248</span></div>
              <span className="ws-simulated">SIMULATED LIVE UI</span>
              <div className="ws-effect-label"><span />{p.previewing && p.mode !== 'idle' ? `Demo · ${p.mode === 'rain' ? 'Smile → Rain' : 'Laugh → Fireworks'}` : p.stageLabel}</div>
              <div className="ws-live-footer">
                <div className="ws-comments"><p><b>mila</b> this smile brings the rain ☁️</p><p><b>noah</b> a little magic in the sky ✨</p></div>
                <div className="ws-comment-field"><span>Say something…</span><Heart size={21} /><Sparkles size={20} /></div>
              </div>
            </div>
          </div>
          <p className="ws-stage-note">{p.cameraOn ? 'Live camera · on-device tracking' : 'Simulated preview · no camera needed'}</p>
        </section>
      </div>
      <footer className="ws-footer"><span>Made for a smile.</span><span>Camera stays on your device.</span></footer>
    </main>
  );
}
