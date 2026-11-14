import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { getTerrainHeightAt } from '../../utils/terrainMath';
import { useMissionStore } from '../../store/useMissionStore';

/**
 * Renders 1 of the 3 distinct geological sample targets on the Martian surface:
 * - mudstone: Layered sedimentary outcrop slab
 * - boxwork: Intersecting mineralized fracture vein ridges
 * - regolith: Wind-sheltered boulder leeward aeolian drift & trench
 */
export default function SampleTarget({
  target,
  siteProfile,
  terrainVersion = 0,
  isCollected,
  isActive,
  distance,
}) {
  const ringRef = useRef();
  const beamRef = useRef();
  const scanRingRef = useRef();

  const evaLayer = useMissionStore((s) => s.evaLayer);
  const scanningState = useMissionStore((s) => s.scanningState);
  const observedTargetId = useMissionStore((s) => s.observedTargetId);
  const observeTarget = useMissionStore((s) => s.observeTarget);
  const startScan = useMissionStore((s) => s.startScan);

  const isScanningThis = scanningState.active && scanningState.targetId === target.id;
  const isObservingThis = observedTargetId === target.id;

  const worldPos = useMemo(() => {
    const [x, z] = target.position;
    const y = getTerrainHeightAt(x, z, siteProfile);
    return [x, y, z];
  }, [target.position, siteProfile, terrainVersion]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (ringRef.current) {
      const pulse = isActive ? 1.08 + Math.sin(t * 5.0) * 0.08 : 1.0 + Math.sin(t * 2.2) * 0.04;
      ringRef.current.scale.set(pulse, pulse, 1);
      ringRef.current.rotation.z = t * (isActive ? 0.9 : 0.25);
    }
    if (beamRef.current) {
      beamRef.current.material.opacity = isCollected
        ? 0.08
        : evaLayer === 'SPECTRAL' || isActive
        ? 0.28 + Math.sin(t * 3.5) * 0.1
        : 0.12;
    }
    if (scanRingRef.current && isScanningThis) {
      const p = scanningState.progress / 100;
      scanRingRef.current.position.y = 0.1 + Math.sin(p * Math.PI * 3) * 0.45 + 0.35;
      scanRingRef.current.rotation.z = t * 6.0;
    }
  });

  const markerColor = isCollected
    ? '#10b981'
    : isScanningThis
    ? '#facc15'
    : isActive
    ? '#38bdf8'
    : evaLayer === 'SPECTRAL'
    ? '#22d3ee'
    : '#f59e0b';

  const showFloatingLabel = isActive || distance <= 18 || evaLayer === 'SPECTRAL';

  return (
    <group
      position={worldPos}
      onClick={(e) => {
        e.stopPropagation();
        if (isActive && !isCollected) {
          if (isObservingThis) {
            startScan(target.id);
          } else {
            observeTarget(target.id);
          }
        }
      }}
    >
      {/* Distinct 3D Geological Outcrop Mesh per Target Type */}
      {target.type === 'mudstone' && (
        <group>
          {/* Terraced layered mudstone slabs */}
          <mesh position={[0, 0.14, 0]} rotation={[0.05, 0.4, -0.04]} castShadow receiveShadow>
            <boxGeometry args={[1.55, 0.28, 1.15]} />
            <meshStandardMaterial color="#6b4232" roughness={0.92} metalness={0.05} />
          </mesh>
          <mesh position={[0.1, 0.33, -0.05]} rotation={[-0.04, 0.6, 0.03]} castShadow receiveShadow>
            <boxGeometry args={[1.15, 0.18, 0.85]} />
            <meshStandardMaterial color="#83523c" roughness={0.88} metalness={0.05} />
          </mesh>
          <mesh position={[-0.05, 0.46, 0.04]} rotation={[0.02, 0.2, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.72, 0.12, 0.55]} />
            <meshStandardMaterial color="#9c6a50" roughness={0.85} metalness={0.04} />
          </mesh>
          {/* Drill core borehole spot */}
          <mesh position={[0, 0.525, 0]}>
            <cylinderGeometry args={[0.06, 0.06, 0.02, 16]} />
            <meshStandardMaterial color={isCollected ? '#10b981' : '#1e293b'} />
          </mesh>
        </group>
      )}

      {target.type === 'basalt' && (
        <group>
          {/* Angular vesicular flood basalt boulder + rover abrasion patch */}
          <mesh position={[0, 0.32, 0]} rotation={[0.15, 0.55, -0.12]} castShadow receiveShadow>
            <dodecahedronGeometry args={[0.78, 1]} />
            <meshStandardMaterial color="#3b2f2d" roughness={0.93} metalness={0.1} />
          </mesh>
          <mesh position={[0.38, 0.2, 0.32]} rotation={[-0.1, 0.8, 0.2]} castShadow receiveShadow>
            <dodecahedronGeometry args={[0.46, 0]} />
            <meshStandardMaterial color="#4b3a35" roughness={0.94} />
          </mesh>
          {/* Fresh gray rover abrasion patch on top */}
          <mesh position={[-0.04, 0.88, 0.04]} rotation={[-Math.PI / 2 + 0.12, 0, 0]}>
            <circleGeometry args={[0.24, 18]} />
            <meshStandardMaterial color="#64748b" roughness={0.55} metalness={0.18} />
          </mesh>
          <mesh position={[-0.04, 0.89, 0.04]} rotation={[0.12, 0, 0]}>
            <cylinderGeometry args={[0.05, 0.05, 0.03, 14]} />
            <meshStandardMaterial color={isCollected ? '#10b981' : '#0f172a'} />
          </mesh>
        </group>
      )}

      {target.type === 'carbonate' && (
        <group>
          {/* Pale shore-margin carbonate / hydrated opaline silica bench */}
          <mesh position={[0, 0.14, 0]} rotation={[0.02, 0.28, -0.03]} castShadow receiveShadow>
            <cylinderGeometry args={[1.05, 1.24, 0.28, 9]} />
            <meshStandardMaterial color="#b49a7c" roughness={0.86} metalness={0.04} />
          </mesh>
          <mesh position={[0.12, 0.3, -0.06]} rotation={[-0.04, -0.45, 0.02]} castShadow receiveShadow>
            <cylinderGeometry args={[0.68, 0.84, 0.18, 7]} />
            <meshStandardMaterial color="#d6c6ae" roughness={0.8} metalness={0.05} />
          </mesh>
          <mesh position={[-0.24, 0.26, 0.24]} rotation={[0.1, 0.7, 0]} castShadow>
            <boxGeometry args={[0.45, 0.16, 0.34]} />
            <meshStandardMaterial color="#e2e8f0" roughness={0.75} />
          </mesh>
        </group>
      )}

      {target.type === 'boxwork' && (
        <group>
          {/* Host rock slab */}
          <mesh position={[0, 0.09, 0]} receiveShadow castShadow>
            <cylinderGeometry args={[0.95, 1.15, 0.2, 7]} />
            <meshStandardMaterial color="#593528" roughness={0.95} />
          </mesh>
          {/* Intersecting mineralized boxwork fracture veins */}
          <mesh position={[0, 0.26, 0]} rotation={[0.08, 0.35, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.45, 0.24, 0.11]} />
            <meshStandardMaterial color="#d8bfa8" roughness={0.72} metalness={0.08} />
          </mesh>
          <mesh position={[0.06, 0.24, 0.05]} rotation={[-0.06, 1.45, 0.04]} castShadow receiveShadow>
            <boxGeometry args={[1.35, 0.22, 0.1]} />
            <meshStandardMaterial color="#e7d4bf" roughness={0.7} metalness={0.08} />
          </mesh>
          <mesh position={[-0.25, 0.23, -0.18]} rotation={[0.04, 0.88, -0.05]} castShadow receiveShadow>
            <boxGeometry args={[0.92, 0.2, 0.09]} />
            <meshStandardMaterial color="#cbb098" roughness={0.75} />
          </mesh>
        </group>
      )}

      {target.type === 'regolith' && (
        <group>
          {/* Wind-sheltering basalt boulder */}
          <mesh position={[-0.45, 0.36, -0.25]} rotation={[0.3, 0.8, 0.2]} castShadow receiveShadow>
            <dodecahedronGeometry args={[0.58, 1]} />
            <meshStandardMaterial color="#3c2b26" roughness={0.94} />
          </mesh>
          {/* Leeward fine aeolian sand ripple drift */}
          <mesh position={[0.28, 0.12, 0.18]} rotation={[0, -0.5, 0]} scale={[1.4, 0.38, 0.9]} receiveShadow castShadow>
            <sphereGeometry args={[0.65, 16, 12]} />
            <meshStandardMaterial color="#b96441" roughness={0.97} />
          </mesh>
          {/* Shallow ISRU trench / ice glint exposure */}
          <mesh position={[0.25, 0.09, 0.22]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.24, 16]} />
            <meshStandardMaterial color={siteProfile?.iceFactor > 0.4 ? '#bae6fd' : '#783f2a'} roughness={0.5} />
          </mesh>
        </group>
      )}

      {/* Holographic Visor Ground Ring */}
      <mesh ref={ringRef} position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.25, 1.34, 48]} />
        <meshBasicMaterial color={markerColor} transparent opacity={isCollected ? 0.45 : 0.85} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>

      {/* Subtle Vertical Beacon Column for Visibility across Terrain */}
      <mesh ref={beamRef} position={[0, 1.6, 0]}>
        <cylinderGeometry args={[0.03, 0.22, 3.2, 16, 1, true]} />
        <meshBasicMaterial
          color={markerColor}
          transparent
          opacity={0.14}
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Active Laser Spectrometer Scan Ring Animation */}
      {isScanningThis && (
        <group>
          <mesh ref={scanRingRef} position={[0, 0.45, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.75, 0.92, 32]} />
            <meshBasicMaterial color="#fde047" transparent opacity={0.9} side={THREE.DoubleSide} />
          </mesh>
          <pointLight position={[0, 1.1, 0]} color="#38bdf8" intensity={3.5} distance={5} />
        </group>
      )}

      {/* Progressive Disclosure 1-Line Floating Badge */}
      {showFloatingLabel && (
        <Html position={[0, 1.25, 0]} center style={{ pointerEvents: 'none' }}>
          <div
            className={`whitespace-nowrap rounded border px-2 py-0.5 font-mono text-[10px] tracking-wider shadow-lg backdrop-blur-md transition-colors ${
              isCollected
                ? 'border-emerald-400/40 bg-black/70 text-emerald-300'
                : isActive
                ? 'border-sky-400/60 bg-black/80 text-sky-200'
                : 'border-white/20 bg-black/60 text-white/85'
            }`}
          >
            {isCollected ? (
              <span>✓ {target.code} // SAMPLED</span>
            ) : isActive ? (
              <span>
                {isObservingThis
                  ? `[E] EXTRACT CORE // ${target.massKg ?? 5.5} KG`
                  : `[E] OBSERVE SPECIMEN // ${target.instrument}`}
              </span>
            ) : (
              <span>
                {target.code} // {target.name.toUpperCase()} · {distance.toFixed(1)}m
              </span>
            )}
          </div>
        </Html>
      )}
    </group>
  );
}
