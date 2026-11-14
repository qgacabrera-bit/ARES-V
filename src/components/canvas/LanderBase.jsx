import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { getTerrainHeightAt } from '../../utils/terrainMath';
import { useMissionStore } from '../../store/useMissionStore';

const STRUT_ANGLES = [
  Math.PI * 0.25,
  Math.PI * 0.75,
  Math.PI * 1.25,
  Math.PI * 1.75,
];

export default function LanderBase({ site, terrainVersion }) {
  const strobeRef = useRef();
  const beaconMatRef = useRef();
  const approachRingRef = useRef();

  const viewMode = useMissionStore((s) => s.viewMode);
  const wristMapOpen = useMissionStore((s) => s.wristMapOpen);
  const landerDistance = useMissionStore((s) => s.landerDistance);
  const nearLander = useMissionStore((s) => s.nearLander);
  const landerReserves = useMissionStore((s) => s.landerReserves);
  const vaultedSamples = useMissionStore((s) => s.vaultedSamples);

  const groundY = useMemo(() => {
    void terrainVersion;
    return getTerrainHeightAt(0, 8, site?.terrainProfile);
  }, [site, terrainVersion]);

  const vaultedList = site ? vaultedSamples[site.id] || [] : [];
  const totalTargets = site?.targets?.length || 3;

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (strobeRef.current) {
      const pulse = Math.pow(Math.max(0, Math.sin(t * 2.8)), 6);
      strobeRef.current.intensity = 0.2 + pulse * 1.8;
    }
    if (beaconMatRef.current) {
      beaconMatRef.current.emissiveIntensity = 1.2 + Math.sin(t * 3.2) * 0.45;
    }
    if (approachRingRef.current) {
      approachRingRef.current.opacity = nearLander
        ? 0.42 + Math.sin(t * 4.5) * 0.14
        : 0.16;
    }
  });

  // Only show the compact diegetic reserve counter when near or approaching the airlock
  const showReserveLabel =
    viewMode === 'EVA' && !wristMapOpen && landerDistance <= 11.5;

  return (
    <group position={[0, groundY, 8]} name="mars-lander-base">
      {/* Ground landing blast apron & regolith scorching */}
      <mesh position={[0, 0.025, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[3.6, 32]} />
        <meshStandardMaterial
          color="#2b1b16"
          roughness={0.96}
          metalness={0.05}
          transparent
          opacity={0.72}
        />
      </mesh>

      {/* Airlock approach indicator ring on the regolith (centered around airlock stair z = -2.35) */}
      <mesh position={[0, 0.04, -2.35]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.55, 1.72, 36]} />
        <meshBasicMaterial
          ref={approachRingRef}
          color={nearLander ? '#22d3ee' : '#f59e0b'}
          transparent
          opacity={0.18}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Descent Engine Nozzle Bell under stage */}
      <mesh position={[0, 0.72, 0]} castShadow>
        <cylinderGeometry args={[0.42, 0.85, 0.72, 20, 1, true]} />
        <meshStandardMaterial
          color="#334155"
          metalness={0.85}
          roughness={0.38}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* 4 Articulated Landing Struts & Footpads */}
      {STRUT_ANGLES.map((angle, idx) => {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const padX = cos * 3.15;
        const padZ = sin * 3.15;
        const hipX = cos * 1.95;
        const hipZ = sin * 1.95;
        const midX = (padX + hipX) * 0.5;
        const midZ = (padZ + hipZ) * 0.5;

        return (
          <group key={idx}>
            {/* Regolith Footpad */}
            <mesh position={[padX, 0.08, padZ]} castShadow receiveShadow>
              <cylinderGeometry args={[0.46, 0.54, 0.14, 16]} />
              <meshStandardMaterial
                color="#475569"
                metalness={0.75}
                roughness={0.45}
              />
            </mesh>
            {/* Primary Primary Leg Strut */}
            <mesh
              position={[midX, 0.76, midZ]}
              rotation={[
                Math.atan2(padZ - hipZ, 1.28) * 0.68,
                -angle,
                Math.PI * 0.24,
              ]}
              castShadow
            >
              <cylinderGeometry args={[0.09, 0.11, 1.92, 10]} />
              <meshStandardMaterial
                color="#d97706"
                metalness={0.7}
                roughness={0.35}
              />
            </mesh>
            {/* Diagonal Stabilizer Strut */}
            <mesh
              position={[cos * 2.45, 0.62, sin * 2.45]}
              rotation={[0, -angle, Math.PI * 0.34]}
              castShadow
            >
              <cylinderGeometry args={[0.055, 0.055, 1.55, 8]} />
              <meshStandardMaterial
                color="#94a3b8"
                metalness={0.82}
                roughness={0.3}
              />
            </mesh>
          </group>
        );
      })}

      {/* Octagonal Descent Stage Deck wrapped in Gold MLI Thermal Foil */}
      <mesh position={[0, 1.38, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[2.38, 2.52, 0.92, 8]} />
        <meshStandardMaterial
          color="#d97706"
          metalness={0.78}
          roughness={0.32}
        />
      </mesh>

      {/* Structural Carbon-Titanium Upper Collar Ring */}
      <mesh position={[0, 1.9, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[2.12, 2.38, 0.22, 8]} />
        <meshStandardMaterial
          color="#1e293b"
          metalness={0.7}
          roughness={0.45}
        />
      </mesh>

      {/* Spherical Propellant / LOX Storage Tanks tucked around perimeter */}
      {[0, Math.PI * 0.5, Math.PI * 1.5].map((ang, i) => (
        <mesh
          key={`tank-${i}`}
          position={[Math.cos(ang) * 2.1, 1.35, Math.sin(ang) * 2.1]}
          castShadow
        >
          <sphereGeometry args={[0.42, 14, 14]} />
          <meshStandardMaterial
            color="#cbd5e1"
            metalness={0.65}
            roughness={0.28}
          />
        </mesh>
      ))}

      {/* Upper Pressurized Crew Ascent Cabin */}
      <mesh position={[0, 2.95, 0.22]} castShadow receiveShadow>
        <cylinderGeometry args={[1.65, 1.88, 1.95, 16]} />
        <meshStandardMaterial
          color="#e2e8f0"
          metalness={0.28}
          roughness={0.45}
        />
      </mesh>

      {/* Conic Nose Cap & Docking Collar */}
      <mesh position={[0, 4.25, 0.22]} castShadow>
        <cylinderGeometry args={[0.88, 1.65, 0.68, 16]} />
        <meshStandardMaterial
          color="#cbd5e1"
          metalness={0.35}
          roughness={0.4}
        />
      </mesh>
      <mesh position={[0, 4.72, 0.22]} castShadow>
        <cylinderGeometry args={[0.62, 0.72, 0.26, 16]} />
        <meshStandardMaterial
          color="#334155"
          metalness={0.78}
          roughness={0.35}
        />
      </mesh>

      {/* Twin Cockpit Viewports facing -Z (toward EVA exploration zone) */}
      {[-0.55, 0.55].map((vx, i) => (
        <mesh
          key={`win-${i}`}
          position={[vx, 3.42, -1.38]}
          rotation={[-0.12, vx > 0 ? 0.28 : -0.28, 0]}
        >
          <boxGeometry args={[0.58, 0.34, 0.14]} />
          <meshStandardMaterial
            color="#0b1322"
            emissive="#0ea5e9"
            emissiveIntensity={0.22}
            metalness={0.9}
            roughness={0.12}
          />
        </mesh>
      ))}

      {/* Front Airlock Extension Vestibule & Pressurized Hatch (-Z facing spawn [0,0]) */}
      <group position={[0, 1.56, -2.05]}>
        {/* Vestibule Housing */}
        <mesh castShadow receiveShadow>
          <boxGeometry args={[1.45, 1.55, 0.86]} />
          <meshStandardMaterial
            color="#cbd5e1"
            metalness={0.45}
            roughness={0.42}
          />
        </mesh>
        {/* Airlock Hatch Door */}
        <mesh position={[0, -0.02, -0.45]} castShadow>
          <boxGeometry args={[0.96, 1.26, 0.08]} />
          <meshStandardMaterial
            color="#334155"
            metalness={0.75}
            roughness={0.35}
          />
        </mesh>
        {/* Hatch Porthole */}
        <mesh position={[0, 0.22, -0.5]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.16, 0.16, 0.04, 16]} />
          <meshStandardMaterial
            color="#0f172a"
            emissive="#38bdf8"
            emissiveIntensity={0.45}
            metalness={0.85}
            roughness={0.15}
          />
        </mesh>
        {/* Airlock Warm Beacon Lamp & PointLight */}
        <mesh position={[0, 0.82, -0.46]}>
          <boxGeometry args={[0.38, 0.12, 0.14]} />
          <meshStandardMaterial
            ref={beaconMatRef}
            color="#fbbf24"
            emissive="#f59e0b"
            emissiveIntensity={1.4}
          />
        </mesh>
        <pointLight
          position={[0, 0.72, -0.9]}
          color="#fbbf24"
          intensity={2.4}
          distance={9}
          decay={2}
        />

        {/* Angled Boarding Ladder to Martian Regolith */}
        {[-0.28, 0.28].map((lx, idx) => (
          <mesh
            key={`rail-${idx}`}
            position={[lx, -0.82, -0.58]}
            rotation={[0.28, 0, 0]}
            castShadow
          >
            <cylinderGeometry args={[0.026, 0.026, 1.65, 8]} />
            <meshStandardMaterial
              color="#94a3b8"
              metalness={0.8}
              roughness={0.28}
            />
          </mesh>
        ))}
        {[0, 1, 2, 3].map((step) => (
          <mesh
            key={`step-${step}`}
            position={[0, -0.35 - step * 0.34, -0.45 - step * 0.095]}
            rotation={[0, 0, Math.PI / 2]}
          >
            <cylinderGeometry args={[0.018, 0.018, 0.56, 8]} />
            <meshStandardMaterial color="#e2e8f0" metalness={0.75} roughness={0.3} />
          </mesh>
        ))}
      </group>

      {/* External Sample Return Cache Locker (Starboard of Airlock) */}
      <group position={[1.38, 1.38, -1.78]} rotation={[0, 0.32, 0]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[0.72, 0.84, 0.52]} />
          <meshStandardMaterial
            color="#475569"
            metalness={0.76}
            roughness={0.34}
          />
        </mesh>
        {/* Gold MLI Thermal Door Trim */}
        <mesh position={[0, 0, -0.27]}>
          <boxGeometry args={[0.58, 0.68, 0.04]} />
          <meshStandardMaterial
            color="#f59e0b"
            metalness={0.82}
            roughness={0.28}
          />
        </mesh>
        {/* Sample Vault Slot LEDs (neat 2-row x 3-col core bay indicators) */}
        {Array.from({ length: totalTargets }).map((_, i) => {
          const filled = i < vaultedList.length;
          const col = i % 3;
          const row = Math.floor(i / 3);
          return (
            <mesh
              key={`slot-${i}`}
              position={[-0.14 + col * 0.14, 0.2 - row * 0.12, -0.3]}
            >
              <sphereGeometry args={[0.028, 10, 10]} />
              <meshStandardMaterial
                color={filled ? '#10b981' : '#1e293b'}
                emissive={filled ? '#10b981' : '#334155'}
                emissiveIntensity={filled ? 1.8 : 0.3}
              />
            </mesh>
          );
        })}
      </group>

      {/* High-Gain Dish Antenna & Strobe Mast on Upper Deck */}
      <group position={[0.75, 4.7, 0.4]}>
        <mesh position={[0, 0.45, 0]}>
          <cylinderGeometry args={[0.04, 0.05, 0.9, 8]} />
          <meshStandardMaterial color="#94a3b8" metalness={0.85} roughness={0.25} />
        </mesh>
        <mesh position={[0.25, 0.85, -0.1]} rotation={[0.65, 0, -0.35]}>
          <cylinderGeometry args={[0.56, 0.12, 0.18, 20]} />
          <meshStandardMaterial color="#f8fafc" metalness={0.4} roughness={0.32} />
        </mesh>
      </group>

      {/* Top Aviation/Nav Strobe Mast */}
      <group position={[-0.45, 5.2, 0.25]}>
        <mesh>
          <cylinderGeometry args={[0.025, 0.03, 0.95, 8]} />
          <meshStandardMaterial color="#94a3b8" metalness={0.85} roughness={0.25} />
        </mesh>
        <mesh position={[0, 0.52, 0]}>
          <sphereGeometry args={[0.065, 10, 10]} />
          <meshStandardMaterial
            color="#ef4444"
            emissive="#ef4444"
            emissiveIntensity={2.0}
          />
        </mesh>
        <pointLight
          ref={strobeRef}
          position={[0, 0.55, 0]}
          color="#f87171"
          intensity={1.0}
          distance={16}
          decay={2}
        />
      </group>

      {/* Progressive-disclosure compact reserve readout when standing near / looking at airlock */}
      {showReserveLabel && (
        <Html position={[0, 3.05, -2.2]} center distanceFactor={10}>
          <div className="pointer-events-none select-none whitespace-nowrap rounded border border-amber-400/35 bg-slate-950/75 px-2.5 py-1 font-mono text-[10px] tracking-[0.14em] text-slate-200 backdrop-blur-sm">
            <span className="text-amber-300">ARES-V LANDER</span>
            <span className="mx-1.5 text-slate-600">|</span>
            <span>
              SHIP O₂:{' '}
              <strong className="text-cyan-300">
                {Math.round(landerReserves.oxygenReserve)}%
              </strong>
            </span>
            <span className="mx-1.5 text-slate-600">|</span>
            <span>
              VAULT:{' '}
              <strong className="text-emerald-300">
                {vaultedList.length}/{totalTargets} CORES
              </strong>
            </span>
          </div>
        </Html>
      )}
    </group>
  );
}
