'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import type { ThreeSceneEvent } from '@/lib/three-evidence';

type HalloweenThreeSceneProps = {
  stage: string;
  result: 'treat' | 'trick' | 'secret' | null;
  power: number;
  quality: 'high' | 'mid' | 'low';
  headTilt: number;
  onEvidence: (event: ThreeSceneEvent) => void;
};

let sceneRunSequence = 0;

const MODEL_URLS = {
  pumpkin: '/models/halloween/pumpkin-carved.glb',
  ghost: '/models/halloween/character-ghost.glb',
  lantern: '/models/halloween/lantern-glass.glb',
} as const;

function normalizeModel(object: THREE.Object3D, targetSize: number) {
  const bounds = new THREE.Box3().setFromObject(object);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const scale = targetSize / Math.max(size.x, size.y, size.z, 0.001);
  object.scale.setScalar(scale);
  object.position.sub(center.multiplyScalar(scale));
}

function createOutcomeAura(
  primary: THREE.ColorRepresentation,
  accent: THREE.ColorRepresentation,
  quality: HalloweenThreeSceneProps['quality'],
) {
  const group = new THREE.Group();
  const hazeMaterial = new THREE.MeshBasicMaterial({
    color: primary,
    transparent: true,
    opacity: 0.14,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const haze = new THREE.Mesh(
    new THREE.TorusGeometry(
      1.3,
      0.11,
      quality === 'high' ? 12 : 8,
      quality === 'high' ? 56 : 32,
    ),
    hazeMaterial,
  );
  group.add(haze);

  const primaryMaterial = new THREE.MeshBasicMaterial({
    color: primary,
    transparent: true,
    opacity: 0.76,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const primaryArc = new THREE.Mesh(
    new THREE.TorusGeometry(
      1.31,
      0.026,
      quality === 'high' ? 10 : 6,
      quality === 'high' ? 40 : 24,
      Math.PI,
    ),
    primaryMaterial,
  );
  primaryArc.position.z = 0.025;
  group.add(primaryArc);

  const accentMaterial = new THREE.MeshBasicMaterial({
    color: accent,
    transparent: true,
    opacity: 0.52,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const accentArc = new THREE.Mesh(
    new THREE.TorusGeometry(
      1.31,
      0.018,
      quality === 'high' ? 10 : 6,
      quality === 'high' ? 40 : 24,
      Math.PI,
    ),
    accentMaterial,
  );
  accentArc.position.z = 0.03;
  accentArc.rotation.z = Math.PI;
  group.add(accentArc);

  const particlePositions: number[] = [];
  const particleCount = quality === 'high' ? 24 : 14;
  for (let index = 0; index < particleCount; index += 1) {
    const angle = index * 2.399963;
    const radius = 1.02 + ((index * 29) % 38) / 100;
    particlePositions.push(
      Math.cos(angle) * radius,
      Math.sin(angle) * radius,
      0.04 + (index % 4) * 0.015,
    );
  }
  const particleGeometry = new THREE.BufferGeometry();
  particleGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(particlePositions, 3),
  );
  const particles = new THREE.Points(
    particleGeometry,
    new THREE.PointsMaterial({
      color: accent,
      size: quality === 'high' ? 0.045 : 0.035,
      transparent: true,
      opacity: 0.62,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
      toneMapped: false,
    }),
  );
  group.add(particles);
  group.visible = false;
  group.scale.set(1, 0.62, 1);

  return {
    group,
    hazeMaterial,
    primaryMaterial,
    accentMaterial,
    particles,
  };
}

export function HalloweenThreeScene({
  stage,
  result,
  power,
  quality,
  headTilt,
  onEvidence,
}: HalloweenThreeSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({ stage, result, power, quality, headTilt });
  const revealRequestedAtRef = useRef<number | null>(null);

  useEffect(() => {
    stateRef.current = { stage, result, power, quality, headTilt };
    const revealing = ['reveal', 'peak', 'afterglow', 'cooldown'].includes(
      stage,
    );
    if (revealing && result && revealRequestedAtRef.current === null)
      revealRequestedAtRef.current = performance.now();
    if (!result) revealRequestedAtRef.current = null;
  }, [headTilt, power, quality, result, stage]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const sceneStartedAt = performance.now();
    const sceneRunId = `three-${Date.now().toString(36)}-${++sceneRunSequence}`;
    let loadedModels = 0;
    const evidence = () => ({
      elapsedMs: Number((performance.now() - sceneStartedAt).toFixed(1)),
      loadedModels,
    });
    onEvidence({
      type: 'scene_started',
      sceneRunId,
      elapsedMs: 0,
      loadedModels: 0,
    });
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: quality !== 'low',
        powerPreference: 'high-performance',
      });
    } catch {
      onEvidence({
        type: 'fallback',
        sceneRunId,
        reason: 'webgl_unavailable',
        phase: 'initializing',
        ...evidence(),
      });
      return;
    }
    renderer.setPixelRatio(
      Math.min(
        window.devicePixelRatio,
        quality === 'high' ? 1.5 : quality === 'mid' ? 1.25 : 1,
      ),
    );
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.16;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 40);
    camera.position.set(0, 0.15, 6.2);

    const world = new THREE.Group();
    scene.add(world);
    scene.add(new THREE.HemisphereLight(0x895cff, 0x130718, 1.25));
    const orange = new THREE.PointLight(0xff681f, 18, 9, 1.7);
    orange.position.set(-2.4, 1.1, 2.6);
    scene.add(orange);
    const cyan = new THREE.PointLight(0x42f5d1, 11, 8, 1.8);
    cyan.position.set(2.2, -0.2, 2.2);
    scene.add(cyan);

    // Treat and Trick share Secret's split-edge energy language while keeping
    // their GLB texture detail intact. One ring group and one Points draw call
    // per outcome keeps the visual upgrade predictable on mid-tier devices.
    const treatAura = createOutcomeAura(0xffc557, 0xff648e, quality);
    treatAura.group.position.set(-0.1, -0.12, -0.72);
    world.add(treatAura.group);
    const trickAura = createOutcomeAura(0x7cff4e, 0x8f4cff, quality);
    trickAura.group.position.set(0.2, 0.02, -0.82);
    trickAura.group.rotation.z = Math.PI * 0.12;
    world.add(trickAura.group);

    // Secret route hero: one procedural Moon Rift, independent of the two GLB outcomes.
    const rift = new THREE.Group();
    rift.visible = false;
    rift.position.set(0, 0.08, 0.28);
    rift.scale.set(0.36, 0.04, 1);
    const riftCoreMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPower: { value: 0.25 },
        uFlash: { value: 0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform float uTime;
        uniform float uPower;
        uniform float uFlash;
        void main() {
          vec2 p = (vUv - 0.5) * 2.0;
          float radius = length(p);
          float angle = atan(p.y, p.x);
          float spiral = 0.5 + 0.5 * sin(angle * 5.0 - uTime * 1.35 + radius * 15.0);
          float cloud = smoothstep(1.0, 0.08, radius) * (0.38 + spiral * 0.5);
          float ember = smoothstep(0.66, 0.06, radius) *
            (0.35 + 0.65 * sin(angle * 3.0 + uTime * 0.72) * sin(angle * 3.0 + uTime * 0.72));
          float horizon = exp(-abs(p.y) * 4.2) * smoothstep(1.0, 0.18, radius);
          vec3 deep = vec3(0.018, 0.003, 0.04);
          vec3 violet = vec3(0.38, 0.035, 0.52);
          vec3 orange = vec3(1.0, 0.18, 0.025);
          vec3 color = mix(deep, violet, cloud);
          color += orange * ember * (0.24 + uPower * 0.3);
          color += mix(orange, vec3(1.0, 0.72, 0.45), uFlash) * horizon * (0.34 + uFlash * 0.66);
          color += vec3(0.02, 0.42, 0.36) * (1.0 - p.y) * cloud * 0.08;
          color *= 1.0 - smoothstep(0.92, 1.0, radius);
          gl_FragColor = vec4(color, 1.0);
        }
      `,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const riftCore = new THREE.Mesh(
      new THREE.CircleGeometry(1.23, quality === 'high' ? 64 : 36),
      riftCoreMaterial,
    );
    riftCore.position.z = -0.05;
    riftCore.renderOrder = 1;
    rift.add(riftCore);
    const riftRimMaterial = new THREE.MeshStandardMaterial({
      color: 0x3b1834,
      emissive: 0x5f160a,
      emissiveIntensity: 0.9,
      metalness: 0.86,
      roughness: 0.26,
    });
    const riftRim = new THREE.Mesh(
      new THREE.TorusGeometry(
        1.28,
        0.055,
        quality === 'high' ? 14 : 8,
        quality === 'high' ? 72 : 40,
      ),
      riftRimMaterial,
    );
    riftRim.renderOrder = 2;
    rift.add(riftRim);
    const upperRim = new THREE.Mesh(
      new THREE.TorusGeometry(
        1.285,
        0.026,
        quality === 'high' ? 10 : 6,
        quality === 'high' ? 48 : 28,
        Math.PI,
      ),
      new THREE.MeshBasicMaterial({
        color: 0xff5d20,
        transparent: true,
        opacity: 0.92,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    upperRim.position.z = 0.025;
    upperRim.renderOrder = 3;
    rift.add(upperRim);
    const lowerRim = new THREE.Mesh(
      new THREE.TorusGeometry(
        1.285,
        0.018,
        quality === 'high' ? 10 : 6,
        quality === 'high' ? 48 : 28,
        Math.PI,
      ),
      new THREE.MeshBasicMaterial({
        color: 0x48e8d0,
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    lowerRim.position.z = 0.02;
    lowerRim.rotation.z = Math.PI;
    lowerRim.renderOrder = 3;
    rift.add(lowerRim);
    const riftGlowMaterial = new THREE.MeshBasicMaterial({
      color: 0x7b2ea8,
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const riftGlow = new THREE.Mesh(
      new THREE.TorusGeometry(
        1.28,
        0.13,
        quality === 'high' ? 14 : 8,
        quality === 'high' ? 72 : 40,
      ),
      riftGlowMaterial,
    );
    riftGlow.position.z = -0.02;
    riftGlow.renderOrder = 0;
    rift.add(riftGlow);
    const starPositions: number[] = [];
    const starCount = quality === 'high' ? 42 : 24;
    for (let index = 0; index < starCount; index += 1) {
      const angle = index * 2.399963;
      const radius = 0.18 + ((index * 37) % 79) / 100;
      starPositions.push(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
        0.035 + (index % 5) * 0.006,
      );
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(starPositions, 3),
    );
    const riftStars = new THREE.Points(
      starGeometry,
      new THREE.PointsMaterial({
        color: 0xffd0a0,
        size: quality === 'high' ? 0.032 : 0.026,
        transparent: true,
        opacity: 0.72,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
        toneMapped: false,
      }),
    );
    riftStars.renderOrder = 2;
    rift.add(riftStars);
    const shardMaterial = new THREE.MeshStandardMaterial({
      color: 0x8f5127,
      emissive: 0x174b47,
      emissiveIntensity: 0.42,
      metalness: 0.9,
      roughness: 0.16,
    });
    const shardGeometry = new THREE.BoxGeometry(0.23, 0.035, 0.045);
    const shardCount = quality === 'high' ? 12 : 8;
    const shards = new THREE.InstancedMesh(
      shardGeometry,
      shardMaterial,
      shardCount,
    );
    const shardTransform = new THREE.Object3D();
    for (let index = 0; index < shardCount; index += 1) {
      const angle = (index / shardCount) * Math.PI * 2;
      shardTransform.position.set(
        Math.cos(angle) * 1.5,
        Math.sin(angle) * 1.5,
        0.03,
      );
      shardTransform.rotation.z = angle + Math.PI / 2;
      shardTransform.scale.set(0.7 + (index % 3) * 0.18, 1, 1);
      shardTransform.updateMatrix();
      shards.setMatrixAt(index, shardTransform.matrix);
    }
    shards.instanceMatrix.needsUpdate = true;
    shards.renderOrder = 4;
    rift.add(shards);
    world.add(rift);

    const loader = new GLTFLoader();
    const mixers: THREE.AnimationMixer[] = [];
    let ghostAnimator: {
      actions: Map<string, THREE.AnimationAction>;
      current: string;
    } | null = null;
    const loaded: Partial<Record<keyof typeof MODEL_URLS, THREE.Group>> = {};
    let disposed = false;
    let terminal = false;
    let modelsReady = false;
    let firstVisibleFrameReported = false;
    let firstVisibleFramePending = false;
    let firstFrameConfirmation = 0;
    const reduceMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;

    const addModel = async (
      key: keyof typeof MODEL_URLS,
      targetSize: number,
      position: THREE.Vector3,
    ) => {
      const gltf = await loader.loadAsync(MODEL_URLS[key]);
      if (disposed) return;
      const model = gltf.scene;
      normalizeModel(model, targetSize);
      model.position.add(position);
      model.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        child.castShadow = false;
        child.receiveShadow = false;
        const materials = Array.isArray(child.material)
          ? child.material
          : [child.material];
        materials.forEach((material) => {
          if ('roughness' in material)
            material.roughness = key === 'lantern' ? 0.28 : 0.4;
          if ('metalness' in material)
            material.metalness = key === 'lantern' ? 0.34 : 0.1;
          if (material instanceof THREE.MeshStandardMaterial) {
            material.color.lerp(
              new THREE.Color(
                key === 'ghost'
                  ? 0xcab9ff
                  : key === 'pumpkin'
                    ? 0x9b3c22
                    : 0x71342a,
              ),
              key === 'ghost' ? 0.34 : 0.48,
            );
            material.emissive.set(
              key === 'ghost'
                ? 0x19082f
                : key === 'pumpkin'
                  ? 0x321006
                  : 0x381208,
            );
            material.emissiveIntensity =
              key === 'ghost' ? 0.16 : key === 'pumpkin' ? 0.08 : 0.34;
          }
        });
      });
      loaded[key] = model;
      loadedModels += 1;
      world.add(model);
      if (gltf.animations.length) {
        const mixer = new THREE.AnimationMixer(model);
        const actions = new Map(
          gltf.animations.map((clip) => [clip.name, mixer.clipAction(clip)]),
        );
        const initialName = actions.has('idle')
          ? 'idle'
          : gltf.animations[0].name;
        actions.get(initialName)?.play();
        if (key === 'ghost') {
          ghostAnimator = { actions, current: initialName };
        }
        mixers.push(mixer);
      }
    };

    void Promise.all([
      addModel('pumpkin', 1.72, new THREE.Vector3(-0.12, -0.18, 0)),
      addModel('ghost', 1.66, new THREE.Vector3(0.08, -0.13, -0.3)),
      addModel('lantern', 0.78, new THREE.Vector3(1.3, 0.92, 0.35)),
    ])
      .then(() => {
        if (disposed || terminal) return;
        modelsReady = true;
        onEvidence({
          type: 'models_loaded',
          sceneRunId,
          ...evidence(),
        });
      })
      .catch(() => {
        if (disposed || terminal) return;
        terminal = true;
        onEvidence({
          type: 'fallback',
          sceneRunId,
          reason: 'model_load_failed',
          phase: 'loading',
          ...evidence(),
        });
      });

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    let frame = 0;
    let elapsed = 0;
    let lastFrameAt = performance.now();
    let lastRenderedAt = 0;
    let observedStage = stateRef.current.stage;
    let stageStartedAt = performance.now();
    const contextLost = (event: Event) => {
      event.preventDefault();
      if (terminal) return;
      terminal = true;
      cancelAnimationFrame(frame);
      if (firstFrameConfirmation)
        cancelAnimationFrame(firstFrameConfirmation);
      onEvidence({
        type: 'fallback',
        sceneRunId,
        reason: 'context_lost',
        phase: 'rendering',
        ...evidence(),
      });
    };
    canvas.addEventListener('webglcontextlost', contextLost, false);
    const render = (now: number) => {
      if (terminal) return;
      if (reduceMotion && now - lastRenderedAt < 66) {
        frame = requestAnimationFrame(render);
        return;
      }
      lastRenderedAt = now;
      const delta = Math.min(Math.max(0, (now - lastFrameAt) / 1000), 0.05);
      lastFrameAt = now;
      if (!reduceMotion) elapsed += delta;
      const current = stateRef.current;
      if (ghostAnimator) {
        const desired = reduceMotion
          ? 'idle'
          : current.stage === 'peak'
            ? 'emote-no'
            : current.stage === 'reveal'
              ? 'jump'
              : 'idle';
        if (
          desired !== ghostAnimator.current &&
          ghostAnimator.actions.has(desired)
        ) {
          ghostAnimator.actions.get(ghostAnimator.current)?.fadeOut(0.16);
          ghostAnimator.actions.get(desired)?.reset().fadeIn(0.16).play();
          ghostAnimator.current = desired;
        }
      }
      if (!reduceMotion) mixers.forEach((mixer) => mixer.update(delta));

      const revealing = ['reveal', 'peak', 'afterglow', 'cooldown'].includes(
        current.stage,
      );
      if (observedStage !== current.stage) {
        observedStage = current.stage;
        stageStartedAt = now;
      }
      const stageElapsedMs = Math.max(0, now - stageStartedAt);
      const showingResult = revealing && current.result !== null;
      world.visible = showingResult;
      const pumpkin = loaded.pumpkin;
      const ghost = loaded.ghost;
      const lantern = loaded.lantern;
      if (pumpkin) {
        pumpkin.visible =
          showingResult &&
          current.result === 'treat';
        pumpkin.rotation.y =
          elapsed * 0.34 + current.headTilt * (reduceMotion ? 0.08 : 0.4);
        pumpkin.rotation.z = reduceMotion ? 0 : Math.sin(elapsed * 1.5) * 0.035;
        const pulse = revealing
          ? 1 +
            (reduceMotion ? 0 : Math.sin(elapsed * 4.2) * 0.045 * current.power)
          : 0.72;
        pumpkin.scale.multiplyScalar(pulse / (pumpkin.userData.lastPulse ?? 1));
        pumpkin.userData.lastPulse = pulse;
      }
      if (ghost) {
        ghost.visible =
          showingResult && current.result === 'trick';
        ghost.position.y =
          0.05 + (reduceMotion ? 0 : Math.sin(elapsed * 1.8) * 0.15);
        ghost.rotation.y =
          -0.22 +
          (reduceMotion ? 0 : Math.sin(elapsed * 0.8) * 0.12) +
          current.headTilt * (reduceMotion ? 0.06 : 0.28);
      }
      if (lantern) {
        lantern.visible =
          showingResult &&
          current.quality !== 'low' &&
          current.result === 'treat';
        lantern.rotation.z =
          -current.headTilt * (reduceMotion ? 0.08 : 0.48) +
          (reduceMotion ? 0 : Math.sin(elapsed * 1.4) * 0.035);
        lantern.position.x =
          1.3 + current.headTilt * (reduceMotion ? 0.08 : 0.3);
      }
      treatAura.group.visible = showingResult && current.result === 'treat';
      trickAura.group.visible = showingResult && current.result === 'trick';
      if (treatAura.group.visible) {
        treatAura.particles.visible = ['reveal', 'peak'].includes(
          current.stage,
        );
        const energy = 1 + current.power * 0.055;
        treatAura.group.scale.set(energy, 0.62 * energy, 1);
        treatAura.group.rotation.z = reduceMotion
          ? 0
          : Math.sin(elapsed * 0.72) * 0.035;
        treatAura.particles.rotation.z = reduceMotion ? 0 : elapsed * 0.08;
        treatAura.hazeMaterial.opacity = 0.1 + current.power * 0.1;
        treatAura.primaryMaterial.opacity = 0.62 + current.power * 0.2;
        treatAura.accentMaterial.opacity = 0.38 + current.power * 0.16;
      }
      if (trickAura.group.visible) {
        trickAura.particles.visible = ['reveal', 'peak'].includes(
          current.stage,
        );
        const energy = 1 + current.power * 0.065;
        trickAura.group.scale.set(energy, 0.67 * energy, 1);
        trickAura.group.rotation.z = reduceMotion
          ? Math.PI * 0.12
          : Math.PI * 0.12 - elapsed * 0.035;
        trickAura.particles.rotation.z = reduceMotion ? 0 : -elapsed * 0.11;
        trickAura.hazeMaterial.opacity = 0.12 + current.power * 0.1;
        trickAura.primaryMaterial.opacity = 0.66 + current.power * 0.18;
        trickAura.accentMaterial.opacity = 0.34 + current.power * 0.18;
      }
      rift.visible = showingResult && current.result === 'secret';
      if (rift.visible) {
        let targetX = 0.9;
        let targetY = 0.25;
        let peakFlash = 0;
        if (current.stage === 'reveal') {
          const charge = Math.min(1, stageElapsedMs / 720);
          const heldCharge = charge < 0.44 ? charge / 0.44 : 1;
          targetX = THREE.MathUtils.lerp(0.12, 0.82, heldCharge);
          targetY = THREE.MathUtils.lerp(0.025, 0.055, heldCharge);
        } else if (current.stage === 'peak') {
          const peakProgress = Math.min(1, stageElapsedMs / 1500);
          if (peakProgress < 0.12) {
            targetX = THREE.MathUtils.lerp(0.82, 0.76, peakProgress / 0.12);
            targetY = THREE.MathUtils.lerp(0.055, 0.035, peakProgress / 0.12);
          } else if (peakProgress < 0.24) {
            const tear = (peakProgress - 0.12) / 0.12;
            targetX = THREE.MathUtils.lerp(0.76, 1.02, tear);
            targetY = THREE.MathUtils.lerp(0.035, 0.36, tear);
            peakFlash = Math.sin(tear * Math.PI);
          } else {
            const settle = Math.min(1, (peakProgress - 0.24) / 0.34);
            targetX = THREE.MathUtils.lerp(1.02, 0.9, settle);
            targetY = THREE.MathUtils.lerp(0.36, 0.25, settle);
          }
        } else if (current.stage === 'cooldown') {
          targetX = 0.78;
          targetY = 0.18;
        }
        if (reduceMotion) {
          targetX = current.stage === 'reveal' ? 0.82 : 0.9;
          targetY = current.stage === 'reveal' ? 0.055 : 0.25;
          peakFlash = 0;
        }
        rift.scale.x = THREE.MathUtils.lerp(
          rift.scale.x,
          targetX,
          reduceMotion ? 1 : 0.13,
        );
        rift.scale.y = THREE.MathUtils.lerp(
          rift.scale.y,
          targetY,
          reduceMotion ? 1 : 0.1,
        );
        rift.rotation.z =
          reduceMotion
            ? 0
            : current.headTilt * 0.07 + Math.sin(elapsed * 0.72) * 0.018;
        rift.rotation.x = reduceMotion
          ? 0.08
          : 0.12 + Math.sin(elapsed * 0.48) * 0.018;
        riftRimMaterial.emissiveIntensity =
          0.7 + current.power * 0.5 + peakFlash * 1.15;
        riftGlowMaterial.opacity =
          0.1 + current.power * 0.08 + peakFlash * 0.12;
        shardMaterial.emissiveIntensity = 0.34 + peakFlash * 1.1;
        riftCoreMaterial.uniforms.uTime.value = elapsed;
        riftCoreMaterial.uniforms.uPower.value = current.power;
        riftCoreMaterial.uniforms.uFlash.value = peakFlash;
        riftStars.rotation.z = reduceMotion ? 0 : elapsed * 0.045;
      } else {
        rift.scale.set(0.36, 0.04, 1);
      }

      world.rotation.y += reduceMotion
        ? -world.rotation.y
        : (current.headTilt * 0.22 - world.rotation.y) * 0.08;
      world.rotation.x = reduceMotion ? 0 : Math.sin(elapsed * 0.7) * 0.025;
      const secretPeakProgress =
        current.result === 'secret' && current.stage === 'peak'
          ? Math.min(1, stageElapsedMs / 1500)
          : 0;
      const secretCameraZ =
        secretPeakProgress > 0.12 && secretPeakProgress < 0.24
          ? THREE.MathUtils.lerp(
              6.2,
              5.8,
              (secretPeakProgress - 0.12) / 0.12,
            )
          : secretPeakProgress >= 0.24
            ? 5.9
            : 6.2;
      camera.position.z = reduceMotion
        ? 6.2
        : current.result === 'secret'
          ? secretCameraZ
          : current.stage === 'peak'
            ? 5.72
            : 6.2;
      orange.intensity =
        current.result === 'secret'
          ? 28 + current.power * 12
          : 15 +
            current.power * 10 +
            (current.stage === 'peak' ? 8 : 0);
      try {
        renderer.render(scene, camera);
      } catch {
        terminal = true;
        if (firstFrameConfirmation)
          cancelAnimationFrame(firstFrameConfirmation);
        onEvidence({
          type: 'fallback',
          sceneRunId,
          reason: 'render_failed',
          phase: 'rendering',
          ...evidence(),
        });
        return;
      }
      const rect = canvas.getBoundingClientRect();
      if (
        modelsReady &&
        showingResult &&
        current.result &&
        rect.width > 0 &&
        rect.height > 0 &&
        !firstVisibleFrameReported &&
        !firstVisibleFramePending
      ) {
        firstVisibleFramePending = true;
        const submittedResult = current.result;
        firstFrameConfirmation = requestAnimationFrame(() => {
          firstFrameConfirmation = requestAnimationFrame((confirmedAt) => {
            firstVisibleFramePending = false;
            if (disposed || terminal || firstVisibleFrameReported) return;
            const canvasStyle = window.getComputedStyle(canvas);
            if (
              !canvas.isConnected ||
              canvasStyle.visibility === 'hidden' ||
              canvasStyle.display === 'none' ||
              Number.parseFloat(canvasStyle.opacity || '1') <= 0
            )
              return;
            firstVisibleFrameReported = true;
            onEvidence({
              type: 'first_visible_frame',
              sceneRunId,
              result: submittedResult,
              elapsedMs: Number((confirmedAt - sceneStartedAt).toFixed(1)),
              revealToFrameMs: Number(
                (
                  confirmedAt -
                  (revealRequestedAtRef.current ?? confirmedAt)
                ).toFixed(1),
              ),
              loadedModels,
            });
          });
        });
      }
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      if (firstFrameConfirmation)
        cancelAnimationFrame(firstFrameConfirmation);
      canvas.removeEventListener('webglcontextlost', contextLost);
      observer.disconnect();
      mixers.forEach((mixer) => mixer.stopAllAction());
      scene.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        child.geometry.dispose();
        const materials = Array.isArray(child.material)
          ? child.material
          : [child.material];
        materials.forEach((material) => material.dispose());
      });
      renderer.dispose();
    };
  }, [onEvidence, quality]);

  return (
    <canvas
      ref={canvasRef}
      className="halloween-three-scene"
      aria-hidden="true"
    />
  );
}
