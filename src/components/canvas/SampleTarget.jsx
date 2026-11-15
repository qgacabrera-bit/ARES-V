import React, { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { getTerrainHeightAt } from '../../utils/terrainMath';
import {
  createBoxworkVeinGeometry,
  createOutcropGeometry,
  createSandDriftGeometry,
  createStratifiedSlabGeometry,
  getRockTextures,
} from '../../utils/rockGeometry';
import { useMissionStore } from '../../store/useMissionStore';

function BoreholeCollar({ position = [0, 0.5, 0], rotation = [0, 0, 0], isCollected }) {
  return (
    <group position={position} rotation={rotation}>
      {/* Freshly abraded/drilled rock dust halo */}
      <mesh position={[0, 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.055, 0.14, 18]} />
        <meshStandardMaterial color={isCollected ? '#cbd5e1' : '#94a3b8'} roughness={0.85} />
      </mesh>
      {/* Core borehole */}
      <mesh position={[0, 0.008, 0]}>
        <cylinderGeometry args={[0.052, 0.048, 0.02, 16]} />
        <meshStandardMaterial color={isCollected ? '#10b981' : '#0f172a'} roughness={0.4} />
      </mesh>
    </group>
  );
}

function SurveyBeaconPin({ position = [0.95, 0, 0.72], isCollected, isScanning }) {
  const ledColor = isScanning ? '#38bdf8' : isCollected ? '#10b981' : '#f59e0b';
  return (
    <group position={position}>
      {/* Weighted base foot */}
      <mesh position={[0, 0.03, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.08, 0.06, 8]} />
        <meshStandardMaterial color="#334155" roughness={0.5} metalness={0.65} />
      </mesh>
      {/* Carbon-fiber survey stake */}
      <mesh position={[0, 0.34, 0]} castShadow>
        <cylinderGeometry args={[0.014, 0.018, 0.62, 8]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.35} metalness={0.75} />
      </mesh>
      {/* High-vis collar band */}
      <mesh position={[0, 0.48, 0]}>
        <cylinderGeometry args={[0.022, 0.022, 0.08, 10]} />
        <meshStandardMaterial color="#ea580c" roughness={0.45} />
      </mesh>
      {/* Status LED cap */}
      <mesh position={[0, 0.67, 0]}>
        <sphereGeometry args={[0.034, 12, 12]} />
        <meshStandardMaterial
          color={ledColor}
          emissive={ledColor}
          emissiveIntensity={isScanning ? 2.2 : 1.1}
          roughness={0.2}
        />
      </mesh>
    </group>
  );
}

/**
 * Renders distinct vertex-displaced Martian geological outcrops per target type:
 * - mudstone: Stratified delta mudstone terraces
 * - basalt: Angular vesicular flood basalt boulder + RAT abrasion window
 * - carbonate: Pale shore-margin carbonate / opaline silica bench
 * - boxwork: Eroded host slab with intersecting mineralized fracture ridges
 * - regolith: Wind-sculpted aeolian ripple drift & subsurface scoop trench
 */
export default function SampleTarget({
  target,
  siteProfile,
  terrainVersion = 0,
  isCollected,
}) {
  const [isHovered, setIsHovered] = useState(false);
  const scanRingRef = useRef();

  const scanningState = useMissionStore((s) => s.scanningState);
  const wristMapOpen = useMissionStore((s) => s.wristMapOpen);
  const viewMode = useMissionStore((s) => s.viewMode);
  const setActiveTarget = useMissionStore((s) => s.setActiveTarget);
  const observeTarget = useMissionStore((s) => s.observeTarget);
  const startScan = useMissionStore((s) => s.startScan);

  const isScanningThis = scanningState.active && scanningState.targetId === target.id;
  const textures = useMemo(() => getRockTextures(), []);

  // Deterministic per-target seed from target ID/position
  const seed = useMemo(() => {
    const [x, z] = target.position;
    return Math.abs(x * 1.37 + z * 2.91) + 1.5;
  }, [target.position]);

  const worldPos = useMemo(() => {
    const [x, z] = target.position;
    const y = getTerrainHeightAt(x, z, siteProfile);
    return [x, y, z];
  }, [target.position, siteProfile, terrainVersion]);

  const geos = useMemo(() => {
    if (target.type === 'mudstone') {
      return {
        slab1: createStratifiedSlabGeometry(seed, 1.85, 0.3, 1.45),
        slab2: createStratifiedSlabGeometry(seed + 4.1, 1.3, 0.22, 1.02),
        slab3: createStratifiedSlabGeometry(seed + 8.7, 0.78, 0.16, 0.65),
        cobble: createOutcropGeometry(seed + 11.2, 0.28, 0.16, 0.22, 1, 0.04),
      };
    }
    if (target.type === 'basalt') {
      return {
        main: createOutcropGeometry(seed, 0.88, 0.62, 0.78, 2, 0),
        side: createOutcropGeometry(seed + 3.4, 0.46, 0.34, 0.42, 1, 0),
        talus: createOutcropGeometry(seed + 7.9, 0.26, 0.18, 0.24, 1, 0),
      };
    }
    if (target.type === 'carbonate') {
      return {
        bench1: createStratifiedSlabGeometry(seed, 2.05, 0.28, 1.75),
        bench2: createStratifiedSlabGeometry(seed + 2.8, 1.35, 0.2, 1.15),
        nodule1: createOutcropGeometry(seed + 5.5, 0.28, 0.18, 0.24, 1, 0.05),
        nodule2: createOutcropGeometry(seed + 9.1, 0.2, 0.14, 0.18, 1, 0.05),
      };
    }
    if (target.type === 'boxwork') {
      return {
        host: createStratifiedSlabGeometry(seed, 2.1, 0.18, 1.8),
        vein1: createBoxworkVeinGeometry(seed + 1.2, 1.65, 0.28, 0.12),
        vein2: createBoxworkVeinGeometry(seed + 3.7, 1.5, 0.25, 0.11),
        vein3: createBoxworkVeinGeometry(seed + 6.4, 1.05, 0.22, 0.095),
        vein4: createBoxworkVeinGeometry(seed + 9.2, 0.85, 0.19, 0.09),
      };
    }
    return {
      boulder: createOutcropGeometry(seed, 0.62, 0.44, 0.52, 2, 0),
      cobble: createOutcropGeometry(seed + 4.2, 0.24, 0.16, 0.2, 1, 0),
      drift: createSandDriftGeometry(seed + 1.8, 0.92, 0.28, 0.68),
    };
  }, [target.type, seed]);

  useFrame(({ clock }) => {
    if (isScanningThis && scanRingRef.current) {
      const t = clock.getElapsedTime();
      scanRingRef.current.position.y = 0.12 + (Math.sin(t * 4.5) * 0.5 + 0.5) * 0.72;
    }
  });

  const showFloatingLabel = viewMode === 'EVA' && !wristMapOpen;

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
          <mesh
            geometry={geos.slab1}
            position={[0, -0.02, 0]}
            rotation={[0.04, 0.35, -0.03]}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial map={textures.mudstoneMap} roughness={0.92} metalness={0.04} />
          </mesh>
          <mesh
            geometry={geos.slab2}
            position={[0.12, 0.22, -0.06]}
            rotation={[-0.03, 0.58, 0.02]}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial
              map={textures.mudstoneMap}
              color="#eab89d"
              roughness={0.88}
              metalness={0.04}
            />
          </mesh>
          <mesh
            geometry={geos.slab3}
            position={[-0.06, 0.4, 0.04]}
            rotation={[0.02, 0.15, 0]}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial
              map={textures.mudstoneMap}
              color="#f3cbb3"
              roughness={0.84}
              metalness={0.04}
            />
          </mesh>
          <mesh geometry={geos.cobble} position={[-0.72, 0.05, 0.45]} castShadow receiveShadow>
            <meshStandardMaterial map={textures.mudstoneMap} roughness={0.92} />
          </mesh>
          <BoreholeCollar position={[-0.04, 0.56, 0.04]} isCollected={isCollected} />
        </group>
      )}

      {target.type === 'basalt' && (
        <group>
          <mesh
            geometry={geos.main}
            position={[0, 0.36, 0]}
            rotation={[0.08, seed % 3, -0.06]}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial map={textures.basaltMap} roughness={0.9} metalness={0.12} />
          </mesh>
          <mesh
            geometry={geos.side}
            position={[0.54, 0.18, 0.36]}
            rotation={[-0.1, 0.9, 0.18]}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial map={textures.basaltMap} roughness={0.93} metalness={0.08} />
          </mesh>
          <mesh
            geometry={geos.talus}
            position={[-0.58, 0.08, 0.38]}
            rotation={[0.2, 0.4, -0.15]}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial map={textures.basaltMap} roughness={0.95} />
          </mesh>
          {/* Fresh gray RAT abrasion patch + core borehole on upper face */}
          <mesh position={[-0.02, 0.78, 0.06]} rotation={[-Math.PI / 2 + 0.1, 0, 0]}>
            <circleGeometry args={[0.24, 20]} />
            <meshStandardMaterial color="#64748b" roughness={0.52} metalness={0.22} />
          </mesh>
          <BoreholeCollar
            position={[-0.02, 0.79, 0.06]}
            rotation={[0.1, 0, 0]}
            isCollected={isCollected}
          />
        </group>
      )}

      {target.type === 'carbonate' && (
        <group>
          <mesh
            geometry={geos.bench1}
            position={[0, -0.02, 0]}
            rotation={[0.02, 0.28, -0.02]}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial map={textures.carbonateMap} roughness={0.84} metalness={0.05} />
          </mesh>
          <mesh
            geometry={geos.bench2}
            position={[0.1, 0.22, -0.05]}
            rotation={[-0.03, -0.45, 0.02]}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial
              map={textures.carbonateMap}
              color="#f6efe4"
              roughness={0.78}
              metalness={0.06}
            />
          </mesh>
          <mesh geometry={geos.nodule1} position={[-0.36, 0.28, 0.26]} castShadow receiveShadow>
            <meshStandardMaterial color="#e8eef5" roughness={0.62} metalness={0.08} />
          </mesh>
          <mesh geometry={geos.nodule2} position={[0.42, 0.24, 0.34]} castShadow receiveShadow>
            <meshStandardMaterial color="#f1f5f9" roughness={0.65} metalness={0.08} />
          </mesh>
          <BoreholeCollar position={[0.12, 0.42, -0.04]} isCollected={isCollected} />
        </group>
      )}

      {target.type === 'boxwork' && (
        <group>
          <mesh geometry={geos.host} position={[0, -0.02, 0]} receiveShadow castShadow>
            <meshStandardMaterial map={textures.mudstoneMap} color="#8a5644" roughness={0.94} />
          </mesh>
          {/* Intersecting mineralized boxwork fracture ridges */}
          <mesh
            geometry={geos.vein1}
            position={[0, 0.19, 0]}
            rotation={[0.03, 0.38, 0]}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial map={textures.boxworkMap} roughness={0.68} metalness={0.1} />
          </mesh>
          <mesh
            geometry={geos.vein2}
            position={[0.05, 0.18, 0.06]}
            rotation={[-0.02, 1.48, 0.02]}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial map={textures.boxworkMap} roughness={0.68} metalness={0.1} />
          </mesh>
          <mesh
            geometry={geos.vein3}
            position={[-0.28, 0.17, -0.2]}
            rotation={[0.02, 0.92, -0.02]}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial map={textures.boxworkMap} roughness={0.72} metalness={0.08} />
          </mesh>
          <mesh
            geometry={geos.vein4}
            position={[0.32, 0.16, -0.18]}
            rotation={[0, -0.55, 0]}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial map={textures.boxworkMap} roughness={0.72} metalness={0.08} />
          </mesh>
          <BoreholeCollar position={[0.02, 0.16, 0.04]} isCollected={isCollected} />
        </group>
      )}

      {target.type === 'regolith' && (
        <group>
          <mesh
            geometry={geos.boulder}
            position={[-0.48, 0.28, -0.22]}
            rotation={[0.18, 0.85, 0.14]}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial map={textures.basaltMap} roughness={0.93} />
          </mesh>
          <mesh geometry={geos.cobble} position={[-0.78, 0.07, 0.16]} castShadow receiveShadow>
            <meshStandardMaterial map={textures.basaltMap} roughness={0.94} />
          </mesh>
          {/* Wind-sculpted aeolian sand ripple drift */}
          <mesh
            geometry={geos.drift}
            position={[0.24, -0.01, 0.14]}
            rotation={[0, -0.45, 0]}
            receiveShadow
            castShadow
          >
            <meshStandardMaterial map={textures.regolithMap} roughness={0.96} />
          </mesh>
          {/* Shallow rover/astronaut scoop trench & subsurface exposure */}
          <mesh position={[0.28, 0.14, 0.18]} rotation={[-Math.PI / 2, 0, -0.3]}>
            <ringGeometry args={[0.02, 0.24, 18]} />
            <meshStandardMaterial
              color={siteProfile?.iceFactor > 0.4 ? '#bae6fd' : '#6c3420'}
              roughness={0.55}
            />
          </mesh>
        </group>
      )}

      {/* NASA Survey Marker Pin beside Outcrop */}
      <SurveyBeaconPin isCollected={isCollected} isScanning={isScanningThis} />

      {/* Active Spectrometer Laser Scan Ring & Point Light */}
      {isScanningThis && (
        <>
          <pointLight position={[0, 1.15, 0]} color="#38bdf8" intensity={3.2} distance={5} />
          <mesh ref={scanRingRef} position={[0, 0.3, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.92, 1.02, 32]} />
            <meshBasicMaterial color="#38bdf8" transparent opacity={0.75} side={2} />
          </mesh>
        </>
      )}

      {/* Floating Question Mark / Active-Scan / Sampled Tooltip Above Specimen */}
      {showFloatingLabel && (isHovered || isScanningThis || !isCollected) && (
        <Html position={[0, 1.45, 0]} center style={{ pointerEvents: 'none' }}>
          {isScanningThis ? (
            <div className="scene-tag">
              {target.code} · scanning {Math.round(scanningState.progress)}%
            </div>
          ) : isCollected ? (
            <div className="scene-tag">
              <span className="text-ok">{target.code} cored</span> · {target.name}
            </div>
          ) : isHovered ? (
            <div className="scene-tag">
              {target.code} · <kbd>E</kbd> to scan
            </div>
          ) : (
            <div className="border border-bone/70 bg-ink/85 px-1 text-[10px] leading-4 whitespace-nowrap text-bone">
              {target.code}
            </div>
          )}
        </Html>
      )}
    </group>
  );
}
