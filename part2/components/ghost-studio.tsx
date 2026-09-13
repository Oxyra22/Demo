'use client';

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react';
import {
  Camera,
  CameraOff,
  Play,
  Heart,
  Sparkles,
  UserRound,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DEMO_VERSION } from '@/lib/release';
import type { FaceAnchors } from '@/lib/face-projection';
import './ghost-studio.css';

const preview: FaceAnchors = {
  mouth: { x: 0.5, y: 0.46 },
  crown: { x: 0.5, y: 0.24 },
  width: 0.32,
};
const ease = (v: number) => {
  const t = Math.max(0, Math.min(1, v));
  return t * t * (3 - 2 * t);
};
type Props = {
  videoRef: RefObject<HTMLVideoElement | null>;
  cameraOn: boolean;
  cameraMessage: string;
  detectorState: string;
  onOpenCamera: () => void;
  onStopCamera: () => void;
  anchors: FaceAnchors | null;
  reduceMotion: boolean;
};

export function GhostStudio({
  videoRef,
  cameraOn,
  cameraMessage,
  detectorState,
  onOpenCamera,
  onStopCamera,
  anchors,
  reduceMotion,
}: Props) {
  const frameRef = useRef<HTMLDivElement>(null);
  const actorRef = useRef<HTMLDivElement>(null);
  const live = useRef({ anchors, cameraOn });
  live.current = { anchors, cameraOn };
  const autoPlayed = useRef(false);
  const [run, setRun] = useState(0);
  const [phase, setPhase] = useState('idle');
  const [waiting, setWaiting] = useState(false);
  const busy = !['idle', 'done'].includes(phase);
  const tracked = cameraOn ? anchors : preview;
  const hasFace = Boolean(anchors);
  const play = () => {
    if (cameraOn && !anchors) {
      setWaiting(true);
      return;
    }
    setWaiting(false);
    setRun((r) => r + 1);
  };

  useEffect(() => {
    if (!cameraOn) {
      autoPlayed.current = false;
      setWaiting(false);
      setRun(0);
      setPhase('idle');
      return;
    }
    if (anchors && (!autoPlayed.current || waiting)) {
      autoPlayed.current = true;
      setWaiting(false);
      setRun((r) => r + 1);
    }
  }, [cameraOn, anchors, waiting]);

  useEffect(() => {
    if (!cameraOn || !hasFace || phase !== 'done') return;
    const repeat = window.setTimeout(() => {
      setPhase('hello');
      setRun(r => r + 1);
    }, 1000);
    return () => window.clearTimeout(repeat);
  }, [cameraOn, hasFace, phase]);

  useEffect(() => {
    if (!run) return;
    let frame = 0,
      last = 0,
      elapsed = 0,
      announced = '';
    let lostAt = 0;
    let completed = false;
    let releasePoint: { x: number; y: number } | null = null;
    let smoothMouth: { x: number; y: number } | null = null;
    const duration = reduceMotion ? 2000 : 8500;
    function tick(now: number) {
      if (document.hidden) {
        last = 0;
        return;
      }
      const state = live.current;
      const target = state.cameraOn ? state.anchors : preview;
      if (!target) {
        if (!lostAt) lostAt = now;
        if (now - lostAt > 8000) {
          completed = true;
          setPhase('done');
          return;
        }
        last = now;
        frame = requestAnimationFrame(tick);
        return;
      }
      lostAt = 0;
      if (last && now - last < 32) {
        frame = requestAnimationFrame(tick);
        return;
      }
      elapsed += last ? Math.min(now - last, 100) : 0;
      last = now;
      smoothMouth = smoothMouth ? {
        x: smoothMouth.x + (target.mouth.x - smoothMouth.x) * .7,
        y: smoothMouth.y + (target.mouth.y - smoothMouth.y) * .7,
      } : { ...target.mouth };
      const t = reduceMotion ? elapsed * 4.25 : elapsed;
      const next =
        t < 1500
          ? 'hello'
          : t < 3800
            ? 'approach'
            : t < 4700
              ? 'kiss'
              : t < 6400
                ? 'celebrate'
                : t < 8500
                  ? 'bye'
                  : 'done';
      if (next !== announced) {
        announced = next;
        setPhase(next);
      }
      const frameElement = frameRef.current,
        actor = actorRef.current;
      if (frameElement && actor) {
        const { width, height } = frameElement.getBoundingClientRect();
        const size = width * 0.42;
        // Mouth is at 33%, 35% of the side-pose image. Position THAT point, not the image centre.
        let destination = {
          x: smoothMouth.x * width - size * 0.33,
          y: smoothMouth.y * height - size * 0.35,
        };
        // Once delivered, leave from the delivery position, not a moving mouth.
        if (t < 4700) releasePoint = { x: destination.x / width, y: destination.y / height };
        else if (releasePoint) destination = { x: releasePoint.x * width, y: releasePoint.y * height };
        const start = { x: width * 0.57, y: height * 0.7 };
        let x = start.x,
          y = start.y,
          scale = 1,
          rotate = 0;
        if (t < 1500) {
          y += (1 - ease(t / 1000)) * height * 0.3 + Math.sin(t / 150) * 8 * Math.sin(Math.PI * t / 1500);
          rotate = Math.sin(t / 230) * 8 * Math.sin(Math.PI * t / 1500);
        } else if (t < 3800) {
          const p = ease((t - 1500) / 2300);
          x += (destination.x - x) * p;
          y += (destination.y - y) * p - Math.sin(p * Math.PI) * height * 0.09;
          rotate = -Math.sin(p * Math.PI) * 10;
        } else if (t < 4700) {
          x = destination.x;
          y = destination.y;
          scale = 1 + Math.sin(((t - 3800) / 900) * Math.PI) * 0.035;
        } else if (t < 6400) {
          const p = ease((t - 4700) / 1500);
          x = destination.x + width * 0.15 * p;
          y = destination.y + height * 0.22 * p + Math.sin(t / 170) * 6 * Math.sin(p * Math.PI);
          rotate = Math.sin(t / 200) * 9 * Math.sin(p * Math.PI);
        } else {
          const p = ease((t - 6400) / 2100);
          x = destination.x + width * 0.15 + width * 0.8 * p;
          y =
            destination.y +
            height * 0.22 -
            height * 0.35 * p +
            Math.sin(t / 120) * 12 * Math.sin(p * Math.PI);
          rotate = p * 25;
        }
        if (reduceMotion) {
          x = destination.x;
          y = destination.y;
          rotate = 0;
        }
        actor.style.transform = `translate3d(${x}px,${y}px,0) rotate(${rotate}deg) scale(${scale})`;
      }
      if (elapsed < duration) frame = requestAnimationFrame(tick);
      else completed = true;
    }
    function visibility() {
      if (!document.hidden && !completed) {
        last = 0;
        frame = requestAnimationFrame(tick);
      } else cancelAnimationFrame(frame);
    }
    frame = requestAnimationFrame(tick);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [run, reduceMotion]);

  const style = {
    '--lip-x': `${(tracked?.mouth.x ?? 0.5) * 100}%`,
    '--lip-y': `${(tracked?.mouth.y ?? 0.46) * 100}%`,
    '--crown-x': `${(tracked?.crown.x ?? 0.5) * 100}%`,
    '--crown-y': `${(tracked?.crown.y ?? 0.24) * 100}%`,
    '--face-span': `${(tracked?.width ?? 0.32) * 100}%`,
  } as CSSProperties;
  return (
    <main className="gs-shell" data-demo-version={DEMO_VERSION}>
      <header className="gs-header">
        <a href="/premium" className="gs-wordmark">
          ghost<span>kiss</span>
          <i>✦</i>
        </a>
        <a className="gs-back-link" href="/">← Rain & Fireworks</a>
      </header>
      <div className="gs-workspace">
        <section className="gs-intro">
          <span className="gs-sticker">MORE VIBE CODING EXPERIMENTS · GHOST KISS</span>
          <h1>
            A kiss.
            <br />A little <em>magic.</em>
          </h1>
          <p>Meet your new little ghost friend.</p>
          <div className="gs-buttons">
            <Button
              className="gs-camera"
              onClick={cameraOn || detectorState === 'loading' ? onStopCamera : onOpenCamera}
            >
              {cameraOn ? <CameraOff size={20} /> : <Camera size={20} />}{' '}
              {cameraOn
                ? 'Close Camera'
                : detectorState === 'loading'
                  ? 'Cancel opening'
                  : 'Open Camera'}
            </Button>
            {!cameraOn && <Button className="gs-play" onClick={play} disabled={busy}>
              <Play size={19} />
              {busy ? 'Playing…' : 'Play Demo'}
            </Button>}
          </div>
          <p className="gs-help" role="status">
            {cameraOn && !anchors && busy
              ? 'Face lost · come back to continue'
              : detectorState === 'loading' && !cameraOn
                ? 'Allow camera access in your browser…'
              : waiting
              ? 'Looking for your face…'
              : cameraOn
                ? anchors
                  ? 'Face found · your ghost repeats automatically'
                  : cameraMessage
                : detectorState === 'fallback' ? cameraMessage : 'No camera needed for Play Demo.'}
          </p>
          <details className="gs-about">
            <summary>Why this ghost? ↗</summary>
            <div lang="zh-CN">
              <p>我以即将到来的万圣节为场景，探索一种常用的直播礼物：小幽灵找到主播嘴部，送上亲吻和星星头饰。</p>
              <p>我用 Codex（GPT-6 Astra）辅助拆解互动与实现分层图像动画。当前演示采用图像分层与程序动效；下一步计划接入 ComfyUI 生图和视频处理技能，将角色表情、透明素材、嘴部锚点与礼物动效整理成可复用工作流，用于节日礼物和直播互动。</p>
              <p>这是独立的额外探索。摄像头追踪在本机运行；Play Demo 使用模拟目标。</p>
            </div>
            <a href="/">Original expression test: rain + fireworks →</a>
          </details>
        </section>
        <div className="gs-stage-wrap">
          <div
            className={`gs-frame gs-${phase} ${cameraOn && !anchors ? 'gs-face-lost' : ''}`}
            ref={frameRef}
            style={style}
            data-ghost-phase={phase}
            data-face-source={cameraOn ? 'live' : 'preview'}
            onPointerMove={(event) => {
              const r = event.currentTarget.getBoundingClientRect();
              event.currentTarget.style.setProperty(
                '--mx',
                `${((event.clientX - r.left) / r.width) * 100}%`,
              );
              event.currentTarget.style.setProperty(
                '--my',
                `${((event.clientY - r.top) / r.height) * 100}%`,
              );
            }}
          >
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`gs-video ${cameraOn ? 'visible' : ''}`}
            />
            {!cameraOn && (
              <div className="gs-preview">
                <UserRound aria-hidden="true" />
                <span>Preview face</span>
                <i title="Simulated lip target" />
              </div>
            )}
            <div className="gs-ambient" />
            <div className="gs-live-header">
              <b className="gs-avatar">J</b>
              <span>
                <strong>Jamie</strong>
                <small>Just hanging out ✨</small>
              </span>
              <b className="gs-live-pill">LIVE</b>
              <small>248</small>
            </div>
            <span className="gs-simulated">SIMULATED LIVE UI</span>
            <div key={run} className="gs-action" aria-hidden="true">
              <div ref={actorRef} className="gs-actor">
                <div className="gs-comet" />
                <img
                  className="gs-front"
                  src="/gifts/premium-v01/frosted-ghost.webp"
                  alt=""
                />
                <img
                  className="gs-kissing"
                  src="/gifts/premium-v01/ghost-kiss-pose.webp"
                  alt=""
                />
              </div>
              <div className="gs-mwah">
                ♥<span>Mwah!</span>
              </div>
              <div className="gs-charms">
                <i>✦</i>
                <i>✦</i>
              </div>
              <div className="gs-confetti">
                {Array.from({ length: 12 }, (_, i) => (
                  <i
                    key={i}
                    style={
                      {
                        '--i': i,
                        '--dx': `${Math.cos(i * 2.4) * (80 + i * 5)}px`,
                        '--dy': `${Math.sin(i * 2.4) * (80 + i * 5)}px`,
                      } as CSSProperties
                    }
                  >
                    {i % 3 ? '✦' : '♥'}
                  </i>
                ))}
              </div>
              <div className="gs-companions">
                <i>✦</i>
                <i>♥</i>
                <i>✦</i>
              </div>
            </div>
            <div className="gs-chat">
              <p>
                <b>mila</b> the little ghost 🥹
              </p>
              <p>
                <b>noah</b> sending good vibes!
              </p>
              {busy && (
                <p className="gs-sent">
                  <Heart size={16} /> Nova sent Ghost Kiss
                </p>
              )}
              <span>
                Say something… <Heart size={17} />
                <Sparkles size={17} />
              </span>
            </div>
          </div>
        </div>
      </div>
      <footer className="gs-footer">
        Made for a smile. <span>Camera stays on your device.</span>
      </footer>
    </main>
  );
}
