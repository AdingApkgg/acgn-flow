"use client";

import { useRef, useMemo, useState, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Points, PointMaterial, Stars } from "@react-three/drei";
import { useTheme } from "next-themes";
import * as THREE from "three";

// 彩色粒子场
function ColorfulParticles({ isDark }: { isDark: boolean }) {
  const ref = useRef<THREE.Points>(null);
  const { mouse } = useThree();

  const { positions, colors } = useMemo(() => {
    const count = 2000;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    const colorPalette = [
      new THREE.Color("#a855f7"),
      new THREE.Color("#ec4899"),
      new THREE.Color("#3b82f6"),
      new THREE.Color("#f43f5e"),
      new THREE.Color("#8b5cf6"),
    ];

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const radius = Math.random() * 15 + 5;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);

      positions[i3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i3 + 2] = radius * Math.cos(phi);

      const color = colorPalette[Math.floor(Math.random() * colorPalette.length)];
      colors[i3] = color.r;
      colors[i3 + 1] = color.g;
      colors[i3 + 2] = color.b;
    }

    return { positions, colors };
  }, []);

  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.x = state.clock.elapsedTime * 0.03 + mouse.y * 0.1;
      ref.current.rotation.y = state.clock.elapsedTime * 0.05 + mouse.x * 0.1;
    }
  });

  return (
    <Points ref={ref} positions={positions} colors={colors} stride={3} frustumCulled={false}>
      <PointMaterial
        transparent
        vertexColors
        size={0.06}
        sizeAttenuation={true}
        depthWrite={false}
        opacity={isDark ? 0.9 : 0.7}
        blending={isDark ? THREE.AdditiveBlending : THREE.NormalBlending}
      />
    </Points>
  );
}

// 流星效果
function ShootingStars({ isDark }: { isDark: boolean }) {
  const ref = useRef<THREE.Points>(null);

  const { positions, velocities } = useMemo(() => {
    const count = 30;
    const positions = new Float32Array(count * 3);
    const velocities: number[] = [];

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      positions[i3] = (Math.random() - 0.5) * 40;
      positions[i3 + 1] = Math.random() * 20 + 10;
      positions[i3 + 2] = (Math.random() - 0.5) * 40;
      velocities.push(Math.random() * 0.3 + 0.1);
    }

    return { positions, velocities };
  }, []);

  useFrame(() => {
    if (ref.current) {
      const posArray = ref.current.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < posArray.length / 3; i++) {
        const i3 = i * 3;
        posArray[i3] -= velocities[i] * 0.5;
        posArray[i3 + 1] -= velocities[i];

        if (posArray[i3 + 1] < -15) {
          posArray[i3] = (Math.random() - 0.5) * 40;
          posArray[i3 + 1] = Math.random() * 10 + 15;
          posArray[i3 + 2] = (Math.random() - 0.5) * 40;
        }
      }
      ref.current.geometry.attributes.position.needsUpdate = true;
    }
  });

  return (
    <Points ref={ref} positions={positions} stride={3} frustumCulled={false}>
      <PointMaterial
        transparent
        color={isDark ? "#ffffff" : "#a855f7"}
        size={0.12}
        sizeAttenuation={true}
        depthWrite={false}
        opacity={isDark ? 0.8 : 0.6}
        blending={isDark ? THREE.AdditiveBlending : THREE.NormalBlending}
      />
    </Points>
  );
}

// 场景内容
function Scene({ isDark }: { isDark: boolean }) {
  return (
    <>
      <ambientLight intensity={0.2} />
      {isDark && <Stars radius={100} depth={50} count={3000} factor={3} saturation={0} fade speed={1} />}
      <ColorfulParticles isDark={isDark} />
      <ShootingStars isDark={isDark} />
    </>
  );
}

export function ParticleBackground() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const isDark = resolvedTheme === "dark";

  return (
    <div className={`fixed inset-0 -z-10 ${isDark ? "opacity-100" : "opacity-60"}`}>
      <Canvas
        camera={{ position: [0, 0, 15], fov: 60 }}
        style={{ background: "transparent" }}
        gl={{ alpha: true }}
      >
        <Scene isDark={isDark} />
      </Canvas>
    </div>
  );
}
