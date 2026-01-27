"use client";

import { useRef, useMemo, useState, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Points, PointMaterial } from "@react-three/drei";
import { useTheme } from "next-themes";
import * as THREE from "three";

// 动态波浪网格
function WaveMesh({ isDark }: { isDark: boolean }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const geometryRef = useRef<THREE.PlaneGeometry>(null);
  const { mouse } = useThree();

  const originalPositions = useMemo(() => {
    const geometry = new THREE.PlaneGeometry(30, 30, 80, 80);
    const positions = geometry.attributes.position;
    return new Float32Array(positions.array);
  }, []);

  useFrame((state) => {
    if (meshRef.current && geometryRef.current) {
      const positions = geometryRef.current.attributes.position;
      const time = state.clock.elapsedTime;

      for (let i = 0; i < positions.count; i++) {
        const x = originalPositions[i * 3];
        const y = originalPositions[i * 3 + 1];

        const wave1 = Math.sin(x * 0.3 + time * 0.8) * 0.8;
        const wave2 = Math.sin(y * 0.4 + time * 0.6) * 0.6;
        const wave3 = Math.sin((x + y) * 0.2 + time * 0.5) * 0.4;
        const wave4 = Math.cos(x * 0.5 - time * 0.3) * Math.sin(y * 0.5 + time * 0.4) * 0.3;
        const mouseInfluence = Math.sin(x * 0.1 + mouse.x * 2) * Math.cos(y * 0.1 + mouse.y * 2) * 0.5;

        positions.setZ(i, wave1 + wave2 + wave3 + wave4 + mouseInfluence);
      }

      positions.needsUpdate = true;
      meshRef.current.rotation.z = time * 0.02;
    }
  });

  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -5, 0]}>
      <planeGeometry ref={geometryRef} args={[30, 30, 80, 80]} />
      <meshStandardMaterial
        color={isDark ? "#667eea" : "#a855f7"}
        wireframe
        transparent
        opacity={isDark ? 0.4 : 0.3}
        side={THREE.DoubleSide}
        emissive={isDark ? "#667eea" : "#a855f7"}
        emissiveIntensity={isDark ? 0.2 : 0.1}
      />
    </mesh>
  );
}

// 悬浮光点
function FloatingLights({ isDark }: { isDark: boolean }) {
  const ref = useRef<THREE.Points>(null);

  const { positions, colors, speeds } = useMemo(() => {
    const count = 150;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const speeds: number[] = [];

    const colorPalette = [
      new THREE.Color("#a855f7"),
      new THREE.Color("#ec4899"),
      new THREE.Color("#3b82f6"),
      new THREE.Color("#667eea"),
    ];

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 25;
      positions[i * 3 + 1] = Math.random() * 15 - 3;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 25;

      const color = colorPalette[Math.floor(Math.random() * colorPalette.length)];
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;

      speeds.push(Math.random() * 0.02 + 0.01);
    }

    return { positions, colors, speeds };
  }, []);

  useFrame((state) => {
    if (ref.current) {
      const posArray = ref.current.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < posArray.length / 3; i++) {
        posArray[i * 3 + 1] += speeds[i];
        posArray[i * 3] += Math.sin(state.clock.elapsedTime + i) * 0.005;

        if (posArray[i * 3 + 1] > 12) {
          posArray[i * 3 + 1] = -3;
          posArray[i * 3] = (Math.random() - 0.5) * 25;
          posArray[i * 3 + 2] = (Math.random() - 0.5) * 25;
        }
      }
      ref.current.geometry.attributes.position.needsUpdate = true;
    }
  });

  return (
    <Points ref={ref} positions={positions} colors={colors} stride={3}>
      <PointMaterial
        transparent
        vertexColors
        size={0.12}
        sizeAttenuation={true}
        depthWrite={false}
        opacity={isDark ? 0.9 : 0.7}
        blending={isDark ? THREE.AdditiveBlending : THREE.NormalBlending}
      />
    </Points>
  );
}

// 光柱效果
function LightBeams() {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = state.clock.elapsedTime * 0.05;
    }
  });

  const beams = useMemo(() => {
    return Array.from({ length: 8 }, (_, i) => ({
      position: [
        Math.cos((i / 8) * Math.PI * 2) * 10,
        0,
        Math.sin((i / 8) * Math.PI * 2) * 10,
      ] as [number, number, number],
      color: i % 2 === 0 ? "#a855f7" : "#ec4899",
    }));
  }, []);

  return (
    <group ref={groupRef}>
      {beams.map((beam, i) => (
        <mesh key={i} position={beam.position}>
          <cylinderGeometry args={[0.05, 0.05, 20, 8]} />
          <meshBasicMaterial
            color={beam.color}
            transparent
            opacity={0.3}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      ))}
    </group>
  );
}

// 场景内容
function Scene({ isDark }: { isDark: boolean }) {
  return (
    <>
      <ambientLight intensity={isDark ? 0.2 : 0.4} />
      <pointLight position={[0, 10, 0]} intensity={isDark ? 2 : 1} color="#a855f7" />
      <pointLight position={[-10, 5, -10]} intensity={isDark ? 1 : 0.5} color="#ec4899" />
      <pointLight position={[10, 5, 10]} intensity={isDark ? 1 : 0.5} color="#3b82f6" />

      <WaveMesh isDark={isDark} />
      <FloatingLights isDark={isDark} />
      {isDark && <LightBeams />}
    </>
  );
}

export function WaveBackground() {
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
        camera={{ position: [0, 8, 15], fov: 50 }}
        style={{ background: "transparent" }}
        gl={{ alpha: true }}
      >
        <Scene isDark={isDark} />
      </Canvas>
    </div>
  );
}
