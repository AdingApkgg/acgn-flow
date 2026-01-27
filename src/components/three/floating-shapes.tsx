"use client";

import { useRef, useMemo, useState, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, MeshDistortMaterial, MeshWobbleMaterial } from "@react-three/drei";
import { useTheme } from "next-themes";
import * as THREE from "three";

// 发光球体
function GlowingSphere({
  position,
  color,
  size = 1,
  speed = 1,
}: {
  position: [number, number, number];
  color: string;
  size?: number;
  speed?: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.x = state.clock.elapsedTime * speed * 0.1;
      meshRef.current.rotation.y = state.clock.elapsedTime * speed * 0.15;
      // 脉动效果
      const scale = 1 + Math.sin(state.clock.elapsedTime * speed) * 0.1;
      meshRef.current.scale.setScalar(scale);
    }
    if (glowRef.current) {
      glowRef.current.scale.setScalar(1.3 + Math.sin(state.clock.elapsedTime * speed * 2) * 0.1);
    }
  });

  return (
    <Float speed={speed * 2} rotationIntensity={1} floatIntensity={2}>
      <group position={position}>
        {/* 外发光 */}
        <mesh ref={glowRef}>
          <sphereGeometry args={[size * 1.2, 32, 32]} />
          <meshBasicMaterial color={color} transparent opacity={0.15} side={THREE.BackSide} />
        </mesh>
        {/* 主球体 */}
        <mesh ref={meshRef}>
          <sphereGeometry args={[size, 64, 64]} />
          <MeshDistortMaterial
            color={color}
            transparent
            opacity={0.7}
            distort={0.4}
            speed={3}
            roughness={0}
            metalness={0.8}
          />
        </mesh>
      </group>
    </Float>
  );
}

// 霓虹环
function NeonRing({
  position,
  color,
  size = 1,
  speed = 1,
}: {
  position: [number, number, number];
  color: string;
  size?: number;
  speed?: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.x = state.clock.elapsedTime * speed * 0.3;
      meshRef.current.rotation.y = state.clock.elapsedTime * speed * 0.2;
      meshRef.current.rotation.z = state.clock.elapsedTime * speed * 0.1;
    }
  });

  return (
    <Float speed={speed * 1.5} rotationIntensity={2} floatIntensity={1.5}>
      <mesh ref={meshRef} position={position}>
        <torusGeometry args={[size, size * 0.15, 16, 100]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={2}
          transparent
          opacity={0.9}
          roughness={0}
          metalness={1}
        />
      </mesh>
    </Float>
  );
}

// 晶体
function Crystal({
  position,
  color,
  speed = 1,
}: {
  position: [number, number, number];
  color: string;
  speed?: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.x = state.clock.elapsedTime * speed * 0.2;
      meshRef.current.rotation.y = state.clock.elapsedTime * speed * 0.3;
    }
  });

  return (
    <Float speed={speed} rotationIntensity={1.5} floatIntensity={2}>
      <mesh ref={meshRef} position={position}>
        <icosahedronGeometry args={[0.8, 0]} />
        <MeshWobbleMaterial
          color={color}
          factor={0.3}
          speed={2}
          transparent
          opacity={0.8}
          roughness={0}
          metalness={0.9}
        />
      </mesh>
    </Float>
  );
}

// 粒子轨道
function OrbitingParticles({ color, radius, count, speed, isDark = true }: { color: string; radius: number; count: number; speed: number; isDark?: boolean }) {
  const ref = useRef<THREE.Points>(null);

  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      pos[i * 3] = Math.cos(angle) * radius;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 0.5;
      pos[i * 3 + 2] = Math.sin(angle) * radius;
    }
    return pos;
  }, [count, radius]);

  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.y = state.clock.elapsedTime * speed;
      ref.current.rotation.x = Math.sin(state.clock.elapsedTime * speed * 0.5) * 0.3;
    }
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color={color}
        size={0.08}
        transparent
        opacity={isDark ? 0.8 : 0.6}
        blending={isDark ? THREE.AdditiveBlending : THREE.NormalBlending}
        depthWrite={false}
      />
    </points>
  );
}

// 场景内容
function Scene({ isDark }: { isDark: boolean }) {
  return (
    <>
      <ambientLight intensity={isDark ? 0.3 : 0.5} />
      <directionalLight position={[10, 10, 5]} intensity={isDark ? 1 : 0.8} color="#ffffff" />
      <pointLight position={[-5, 5, 5]} intensity={isDark ? 2 : 1} color="#a855f7" />
      <pointLight position={[5, -5, 5]} intensity={isDark ? 2 : 1} color="#ec4899" />
      <pointLight position={[0, 0, -5]} intensity={isDark ? 1 : 0.5} color="#3b82f6" />

      {/* 发光球体 */}
      <GlowingSphere position={[-4, 2, -3]} color="#a855f7" size={1.2} speed={0.8} />
      <GlowingSphere position={[4, -1, -2]} color="#ec4899" size={1} speed={1.2} />
      <GlowingSphere position={[0, 3, -4]} color="#3b82f6" size={0.8} speed={1} />
      <GlowingSphere position={[-2, -3, -1]} color="#f43f5e" size={0.6} speed={1.5} />

      {/* 霓虹环 */}
      <NeonRing position={[3, 2, -2]} color="#8b5cf6" size={1.5} speed={0.6} />
      <NeonRing position={[-3, -2, -3]} color="#06b6d4" size={1.2} speed={0.8} />

      {/* 晶体 */}
      <Crystal position={[2, -2, 0]} color="#f472b6" speed={0.7} />
      <Crystal position={[-1, 1, -1]} color="#a78bfa" speed={0.9} />

      {/* 粒子轨道 */}
      <OrbitingParticles color="#a855f7" radius={6} count={100} speed={0.2} isDark={isDark} />
      <OrbitingParticles color="#ec4899" radius={8} count={150} speed={-0.15} isDark={isDark} />
      <OrbitingParticles color="#3b82f6" radius={10} count={200} speed={0.1} isDark={isDark} />
    </>
  );
}

export function FloatingShapes() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const isDark = resolvedTheme === "dark";

  return (
    <div className={`fixed inset-0 -z-10 ${isDark ? "opacity-100" : "opacity-70"}`}>
      <Canvas
        camera={{ position: [0, 0, 12], fov: 50 }}
        style={{ background: "transparent" }}
        gl={{ alpha: true }}
      >
        <Scene isDark={isDark} />
      </Canvas>
    </div>
  );
}
