'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import type { EffectMode } from '@/lib/prompt-effects';

type GiftCharmThreeProps = {
  mode: EffectMode;
  intensity: number;
  headTilt: number;
  quality: 'high' | 'mid';
  reduceMotion: boolean;
};

function normalizeModel(object: THREE.Object3D, targetSize: number) {
  const bounds = new THREE.Box3().setFromObject(object);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const scale = targetSize / Math.max(size.x, size.y, size.z, 0.001);
  object.scale.setScalar(scale);
  object.position.sub(center.multiplyScalar(scale));
}

export function GiftCharmThree({
  mode,
  intensity,
  headTilt,
  quality,
  reduceMotion,
}: GiftCharmThreeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({ mode, intensity, headTilt, reduceMotion });

  useEffect(() => {
    stateRef.current = { mode, intensity, headTilt, reduceMotion };
  }, [headTilt, intensity, mode, reduceMotion]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: quality === 'high',
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, quality === 'high' ? 1.5 : 1.1),
    );
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 30);
    camera.position.set(0, 0.1, 5.4);

    const gift = new THREE.Group();
    scene.add(gift);
    scene.add(new THREE.HemisphereLight(0x8cecff, 0x150718, 1.8));
    const keyLight = new THREE.PointLight(0xff8b35, 13, 8, 1.7);
    keyLight.position.set(2.1, 1.5, 3.4);
    scene.add(keyLight);
    const rimLight = new THREE.PointLight(0x70f6d2, 10, 7, 1.6);
    rimLight.position.set(-2.2, -0.3, 2.8);
    scene.add(rimLight);

    const placeholder = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.72, 2),
      new THREE.MeshPhysicalMaterial({
        color: 0x5c49b9,
        emissive: 0x27155e,
        emissiveIntensity: 1.3,
        metalness: 0.34,
        roughness: 0.2,
        clearcoat: 1,
        clearcoatRoughness: 0.12,
      }),
    );
    gift.add(placeholder);

    const haloMaterial = new THREE.MeshBasicMaterial({
      color: 0x79e8ff,
      transparent: true,
      opacity: 0.58,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(0.98, 0.025, 8, 64),
      haloMaterial,
    );
    halo.rotation.x = 1.08;
    gift.add(halo);

    const orbitMaterial = new THREE.PointsMaterial({
      color: 0xffb547,
      size: 0.055,
      transparent: true,
      opacity: 0.78,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const orbitPositions: number[] = [];
    for (let index = 0; index < 18; index += 1) {
      const angle = (index / 18) * Math.PI * 2;
      orbitPositions.push(Math.cos(angle) * 1.04, Math.sin(angle) * 0.42, 0);
    }
    const orbitGeometry = new THREE.BufferGeometry();
    orbitGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(orbitPositions, 3),
    );
    const orbit = new THREE.Points(orbitGeometry, orbitMaterial);
    gift.add(orbit);

    const modelMaterials: THREE.MeshStandardMaterial[] = [];
    let disposed = false;
    new GLTFLoader().load(
      '/models/halloween/lantern-glass.glb',
      (gltf) => {
        if (disposed) return;
        const model = gltf.scene;
        normalizeModel(model, 1.65);
        model.rotation.set(0.08, -0.3, 0);
        model.traverse((child) => {
          if (!(child instanceof THREE.Mesh)) return;
          const original = Array.isArray(child.material)
            ? child.material[0]
            : child.material;
          const material = new THREE.MeshStandardMaterial({
            map:
              original instanceof THREE.MeshStandardMaterial
                ? original.map
                : null,
            color: 0xf7e7ff,
            emissive: 0x34204f,
            emissiveIntensity: 0.65,
            metalness: 0.5,
            roughness: 0.22,
          });
          child.material = material;
          modelMaterials.push(material);
        });
        placeholder.visible = false;
        gift.add(model);
      },
      undefined,
      () => undefined,
    );

    let frame = 0;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      renderer.setSize(
        Math.max(1, rect.width),
        Math.max(1, rect.height),
        false,
      );
      camera.aspect = Math.max(1, rect.width) / Math.max(1, rect.height);
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const cyan = new THREE.Color(0x72ddff);
    const orange = new THREE.Color(0xff7a32);
    const violet = new THREE.Color(0xa869ff);
    const currentColor = cyan.clone();
    const targetScale = new THREE.Vector3();
    const startedAt = performance.now();
    const render = (now: number) => {
      const elapsed = (now - startedAt) / 1000;
      const current = stateRef.current;
      const targetColor =
        current.mode === 'fireworks'
          ? orange
          : current.mode === 'rain'
            ? cyan
            : violet;
      currentColor.lerp(targetColor, 0.055);
      haloMaterial.color.copy(currentColor);
      orbitMaterial.color.copy(targetColor);
      modelMaterials.forEach((material) => {
        material.emissive.copy(currentColor).multiplyScalar(0.24);
        material.emissiveIntensity =
          current.mode === 'fireworks'
            ? 1.25
            : current.mode === 'rain'
              ? 0.82
              : 0.55;
      });
      keyLight.color.lerp(targetColor, 0.045);
      gift.rotation.y =
        (current.reduceMotion ? 0.25 : elapsed * 0.34) +
        current.headTilt * 0.28;
      gift.rotation.z =
        (current.reduceMotion ? 0 : Math.sin(elapsed * 0.8) * 0.045) +
        current.headTilt * 0.08;
      gift.position.y = current.reduceMotion
        ? 0
        : Math.sin(elapsed * 1.2) * 0.08;
      const pulse =
        current.mode === 'fireworks'
          ? 1.06 + (current.reduceMotion ? 0 : Math.sin(elapsed * 4.2) * 0.05)
          : 0.98 + current.intensity * 0.08;
      targetScale.setScalar(pulse);
      gift.scale.lerp(targetScale, 0.08);
      if (!current.reduceMotion) {
        halo.rotation.z += current.mode === 'fireworks' ? 0.026 : 0.012;
        orbit.rotation.z -= current.mode === 'rain' ? 0.014 : 0.022;
      }
      renderer.render(scene, camera);
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      scene.traverse((child) => {
        if (!(child instanceof THREE.Mesh || child instanceof THREE.Points))
          return;
        child.geometry.dispose();
        const materials = Array.isArray(child.material)
          ? child.material
          : [child.material];
        materials.forEach((material) => material.dispose());
      });
      renderer.dispose();
    };
  }, [quality]);

  return (
    <canvas ref={canvasRef} className="gift-charm-three" aria-hidden="true" />
  );
}
