import React, { useMemo, useState } from 'react';
import { Html } from '@react-three/drei';
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
}) {
  const [isHovered, setIsHovered] = useState(false);

  const scanningState = useMissionStore((s) => s.scanningState);
  const wristMapOpen = useMissionStore((s) => s.wristMapOpen);
  const viewMode = useMissionStore((s) => s.viewMode);
  const setActiveTarget = useMissionStore((s) => s.setActiveTarget);
  const observeTarget = useMissionStore((s) => s.observeTarget);
  const startScan = useMissionStore((s) => s.startScan);

  const isScanningThis = scanningState.active && scanningState.targetId === target.id;

  const worldPos = useMemo(() => {
    const [x, z] = target.position;
    const y = getTerrainHeightAt(x, z, siteProfile);
    return [x, y, z];
  }, [target.position, siteProfile, terrainVersion]);

  const showFloatingLabel =
    viewMode === 'EVA' && !wristMapOpen;

  return (
    <group position={worldPos}>
      {/* Generous Hit-Sphere for Target Focus & [E] / Click Scan */}
      <mesh
        position={[0, 0.9, 0]}
        onPointerOver={(e) => {
          e.stopPropagation();
          setIsHovered(true);
          document.body.style.cursor = 'pointer';
          setActiveTarget(target.id);
          observeTarget(target.id);
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          setIsHovered(false);
          document.body.style.cursor = 'auto';
        }}
        onClick={(e) => {
          e.stopPropagation();
          setActiveTarget(target.id);
          if (!isCollected && !scanningState.active) {
            startScan(target.id);
          }
        }}
      >
        <sphereGeometry args={[1.45, 16, 16]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
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

      {/* Laser Spectrometer Point Light while Actively Scanning */}
      {isScanningThis && (
        <pointLight position={[0, 1.1, 0]} color="#38bdf8" intensity={3.0} distance={5} />
      )}

      {/* Floating Question Mark / Active-Scan / Sampled Tooltip Above Specimen */}
      {showFloatingLabel && (isHovered || isScanningThis || !isCollected) && (
        <Html position={[0, 1.45, 0]} center style={{ pointerEvents: 'none' }}>
          {isScanningThis ? (
            <div className="whitespace-nowrap rounded border border-yellow-400/80 bg-black/85 px-2.5 py-0.5 font-mono text-[10px] tracking-wider text-yellow-200 shadow-lg backdrop-blur-md">
              ⏳ {target.code} // SCANNING {Math.round(scanningState.progress)}%
            </div>
          ) : isCollected ? (
            <div className="whitespace-nowrap rounded border border-emerald-400/50 bg-black/80 px-2.5 py-0.5 font-mono text-[10px] tracking-wider text-emerald-300 shadow-lg backdrop-blur-md">
              ✓ {target.code} // SAMPLED ({target.name})
            </div>
          ) : isHovered ? (
            <div className="whitespace-nowrap rounded border border-sky-300/70 bg-black/85 px-2.5 py-0.5 font-mono text-[10px] tracking-wider text-sky-100 shadow-lg backdrop-blur-md">
              ? · {target.code} · [E] SCAN SAMPLE
            </div>
          ) : (
            <div className="flex h-6 w-6 items-center justify-center rounded-full border border-amber-300/70 bg-slate-950/80 font-mono text-xs font-bold text-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.35)] backdrop-blur-md">
              ?
            </div>
          )}
        </Html>
      )}
    </group>
  );
}
