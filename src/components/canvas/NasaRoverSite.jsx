import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { getTerrainHeightAt } from '../../utils/terrainMath';
import { useMissionStore } from '../../store/useMissionStore';

const WHEEL_OFFSETS = [
  [-0.74, -0.76],
  [0.74, -0.76],
  [-0.78, 0.02],
  [0.78, 0.02],
  [-0.74, 0.82],
  [0.74, 0.82],
];

function CustomPinpointBeacon({ customPinpoint, siteProfile, terrainVersion }) {
  const gemRef = useRef();
  const ringRef = useRef();

  const groundPos = useMemo(() => {
    void terrainVersion;
    if (!customPinpoint?.position) return null;
    const [x, z] = customPinpoint.position;
    const y = getTerrainHeightAt(x, z, siteProfile);
    return [x, y, z];
  }, [customPinpoint, siteProfile, terrainVersion]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (gemRef.current) {
      gemRef.current.rotation.y = t * 2.2;
      gemRef.current.position.y = 3.2 + Math.sin(t * 3.0) * 0.22;
    }
    if (ringRef.current) {
      const s = 1.0 + Math.sin(t * 4.0) * 0.12;
      ringRef.current.scale.set(s, s, 1);
    }
  });

  if (!groundPos || !customPinpoint) return null;

  const pinColor = customPinpoint.isUnexplored ? '#a855f7' : '#38bdf8';

  return (
    <group position={groundPos} name="custom-pinpoint-beacon">
      <mesh position={[0, 0.14, 0]} rotation={[-Math.PI / 2, 0, 0]} ref={ringRef}>
        <ringGeometry args={[0.75, 1.05, 32]} />
        <meshBasicMaterial
          color={pinColor}
          transparent
          opacity={0.78}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <mesh position={[0, 7.5, 0]}>
        <cylinderGeometry args={[0.04, 0.08, 15, 10, 1, true]} />
        <meshBasicMaterial
          color={pinColor}
          transparent
          opacity={0.28}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={gemRef} position={[0, 3.2, 0]}>
        <octahedronGeometry args={[0.32, 0]} />
        <meshStandardMaterial
          color={pinColor}
          emissive={pinColor}
          emissiveIntensity={1.6}
        />
      </mesh>
      <Html position={[0, 4.0, 0]} center distanceFactor={20}>
        <div className="pointer-events-none whitespace-nowrap rounded border border-purple-400/60 bg-black/75 px-2 py-0.5 font-mono text-[10px] tracking-wider text-purple-100 backdrop-blur-md">
          📌 {customPinpoint.name}
        </div>
      </Html>
    </group>
  );
}

export default function NasaRoverSite({ site, terrainVersion }) {
  const mastRef = useRef();
  const roverGemRef = useRef();
  const roverRingRef = useRef();

  const viewMode = useMissionStore((s) => s.viewMode);
  const wristMapOpen = useMissionStore((s) => s.wristMapOpen);
  const discoveredRovers = useMissionStore((s) => s.discoveredRovers);
  const nearRover = useMissionStore((s) => s.nearRover);
  const roverDistance = useMissionStore((s) => s.roverDistance);
  const customPinpoint = useMissionStore((s) => s.customPinpoint);

  const rover = site?.nasaRover;
  const isDiscovered = rover ? Boolean(discoveredRovers[site.id]) : false;

  const roverGroundY = useMemo(() => {
    void terrainVersion;
    if (!rover) return 0;
    return getTerrainHeightAt(rover.position[0], rover.position[1], site.terrainProfile);
  }, [rover, site, terrainVersion]);

  const traverseLineObj = useMemo(() => {
    void terrainVersion;
    if (!rover?.traversePoints || rover.traversePoints.length < 2) return null;
    const pts = [];
    for (let i = 0; i < rover.traversePoints.length - 1; i++) {
      const a = rover.traversePoints[i];
      const b = rover.traversePoints[i + 1];
      const steps = 10;
      for (let s = 0; s <= steps; s++) {
        if (i > 0 && s === 0) continue;
        const t = s / steps;
        const wx = a[0] + (b[0] - a[0]) * t;
        const wz = a[1] + (b[1] - a[1]) * t;
        const wy = getTerrainHeightAt(wx, wz, site.terrainProfile) + 0.08;
        pts.push(new THREE.Vector3(wx, wy, wz));
      }
    }
    const geom = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({
      color: isDiscovered ? '#22d3ee' : '#f59e0b',
      transparent: true,
      opacity: isDiscovered ? 0.65 : 0.35,
    });
    return new THREE.Line(geom, mat);
  }, [rover, site, terrainVersion, isDiscovered]);

  useEffect(() => {
    return () => {
      if (traverseLineObj) {
        traverseLineObj.geometry.dispose();
        traverseLineObj.material.dispose();
      }
    };
  }, [traverseLineObj]);

  const unexploredCenterPos = useMemo(() => {
    void terrainVersion;
    if (!rover?.unexploredSector) return null;
    const [ux, uz] = rover.unexploredSector.center;
    const uy = getTerrainHeightAt(ux, uz, site.terrainProfile) + 0.14;
    return [ux, uy, uz];
  }, [rover, site, terrainVersion]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (mastRef.current) {
      mastRef.current.rotation.y = Math.sin(t * 0.55) * 0.45;
    }
    if (roverGemRef.current) {
      roverGemRef.current.rotation.y = t * 1.8;
      roverGemRef.current.position.y = 2.85 + Math.sin(t * 2.5) * 0.15;
    }
    if (roverRingRef.current) {
      const s = 1 + Math.sin(t * 3.2) * 0.08;
      roverRingRef.current.scale.set(s, s, 1);
    }
  });

  if (!rover) return null;

  const beaconColor = isDiscovered ? '#22d3ee' : '#f59e0b';
  const roverYaw = ((rover.heading || 135) * Math.PI) / 180;
  const showRoverLabel =
    viewMode === 'EVA' && !wristMapOpen && (isDiscovered || roverDistance <= 16 || nearRover);

  return (
    <group name="nasa-rover-site">
      {/* Historical NASA Rover Traverse Path & Explored Waypoint Nodes */}
      {traverseLineObj && <primitive object={traverseLineObj} />}
      {rover.traversePoints.map(([wx, wz], idx) => {
        const wy = getTerrainHeightAt(wx, wz, site.terrainProfile) + 0.09;
        return (
          <mesh key={idx} position={[wx, wy, wz]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.28, 0.42, 16]} />
            <meshBasicMaterial
              color={beaconColor}
              transparent
              opacity={isDiscovered ? 0.5 : 0.25}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
        );
      })}

      {/* Unexplored Mars Frontier Perimeter Ring (once Rover is Discovered/Pinned) */}
      {isDiscovered && unexploredCenterPos && (
        <mesh position={unexploredCenterPos} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[rover.unexploredSector.radius - 0.35, rover.unexploredSector.radius, 64]} />
          <meshBasicMaterial
            color="#a855f7"
            transparent
            opacity={0.28}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* 3D NASA Rover Chassis + Pinpoint Beacon */}
      <group
        position={[rover.position[0], roverGroundY, rover.position[1]]}
        rotation={[0, roverYaw, 0]}
        name={rover.id}
      >
        {/* Ground tire tracks / dust disturbance */}
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <circleGeometry args={[1.65, 24]} />
          <meshStandardMaterial color="#3c261d" roughness={0.96} transparent opacity={0.55} />
        </mesh>

        {/* Ground Telemetry Halo Ring */}
        <mesh ref={roverRingRef} position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.45, 1.72, 32]} />
          <meshBasicMaterial
            color={beaconColor}
            transparent
            opacity={nearRover ? 0.72 : 0.42}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>

        {/* 6 Cleated Rover Wheels & Struts */}
        {WHEEL_OFFSETS.map(([wx, wz], idx) => (
          <group key={idx} position={[wx, 0.25, wz]}>
            <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
              <cylinderGeometry args={[0.25, 0.25, 0.24, 16]} />
              <meshStandardMaterial color="#18181b" roughness={0.85} metalness={0.35} />
            </mesh>
            <mesh rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.14, 0.14, 0.255, 12]} />
              <meshStandardMaterial color="#cbd5e1" roughness={0.35} metalness={0.7} />
            </mesh>
            <mesh position={[wx > 0 ? -0.14 : 0.14, 0.28, 0]} castShadow>
              <boxGeometry args={[0.08, 0.52, 0.09]} />
              <meshStandardMaterial color="#475569" roughness={0.45} metalness={0.65} />
            </mesh>
          </group>
        ))}

        {/* Warm Electronics Box (Main Thermal Gold/White Chassis Cab) */}
        <mesh position={[0, 0.72, 0]} castShadow receiveShadow>
          <boxGeometry args={[1.05, 0.46, 1.55]} />
          <meshStandardMaterial color="#f1f5f9" roughness={0.42} metalness={0.25} />
        </mesh>
        <mesh position={[0, 0.68, 0]}>
          <boxGeometry args={[1.09, 0.24, 1.42]} />
          <meshStandardMaterial color="#d97706" roughness={0.35} metalness={0.55} />
        </mesh>
        {/* Top Deck Plate */}
        <mesh position={[0, 0.96, 0]} castShadow>
          <boxGeometry args={[1.15, 0.05, 1.68]} />
          <meshStandardMaterial color="#e2e8f0" roughness={0.45} metalness={0.3} />
        </mesh>

        {/* Rear Sloped MMRTG Nuclear Power Source */}
        <group position={[0, 0.96, 0.84]} rotation={[0.42, 0, 0]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.18, 0.22, 0.72, 12]} />
            <meshStandardMaterial color="#334155" roughness={0.5} metalness={0.65} />
          </mesh>
          <mesh position={[0, 0.05, 0]}>
            <boxGeometry args={[0.52, 0.46, 0.04]} />
            <meshStandardMaterial color="#e2e8f0" roughness={0.45} metalness={0.4} />
          </mesh>
          <mesh position={[0, 0.05, 0]} rotation={[0, Math.PI / 2, 0]}>
            <boxGeometry args={[0.52, 0.46, 0.04]} />
            <meshStandardMaterial color="#e2e8f0" roughness={0.45} metalness={0.4} />
          </mesh>
        </group>

        {/* High-Gain Communication Dish */}
        <group position={[-0.36, 1.18, 0.42]} rotation={[-0.35, 0.25, 0]}>
          <mesh>
            <cylinderGeometry args={[0.26, 0.06, 0.1, 18]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.35} metalness={0.35} />
          </mesh>
          <mesh position={[0, 0.1, 0]}>
            <cylinderGeometry args={[0.02, 0.02, 0.22, 8]} />
            <meshStandardMaterial color="#ea580c" roughness={0.4} />
          </mesh>
        </group>

        {/* Articulated Remote Sensing Mast (Mastcam-Z & SuperCam) */}
        <group ref={mastRef} position={[0.34, 0.98, -0.52]}>
          <mesh position={[0, 0.42, 0]} castShadow>
            <cylinderGeometry args={[0.045, 0.055, 0.84, 12]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.38} metalness={0.45} />
          </mesh>
          {/* Mast Camera Head */}
          <mesh position={[0, 0.88, -0.04]} castShadow>
            <boxGeometry args={[0.36, 0.18, 0.24]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.35} metalness={0.25} />
          </mesh>
          {/* SuperCam Laser Optics Cyclops */}
          <mesh position={[0, 0.91, -0.17]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.055, 0.055, 0.05, 16]} />
            <meshStandardMaterial
              color="#38bdf8"
              emissive="#ef4444"
              emissiveIntensity={1.6}
            />
          </mesh>
          {/* Mastcam-Z Stereo Lenses */}
          <mesh position={[-0.1, 0.86, -0.17]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.028, 0.028, 0.04, 12]} />
            <meshStandardMaterial color="#0ea5e9" emissive="#38bdf8" emissiveIntensity={1.2} />
          </mesh>
          <mesh position={[0.1, 0.86, -0.17]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.028, 0.028, 0.04, 12]} />
            <meshStandardMaterial color="#0ea5e9" emissive="#38bdf8" emissiveIntensity={1.2} />
          </mesh>
        </group>

        {/* Front Articulated Robotic Turret Arm */}
        <group position={[0, 0.68, -0.95]}>
          <mesh position={[0, -0.12, -0.22]} rotation={[0.55, 0, 0]} castShadow>
            <cylinderGeometry args={[0.035, 0.04, 0.65, 10]} />
            <meshStandardMaterial color="#94a3b8" roughness={0.35} metalness={0.75} />
          </mesh>
          <mesh position={[0, -0.36, -0.45]}>
            <cylinderGeometry args={[0.16, 0.18, 0.14, 12]} />
            <meshStandardMaterial color="#f59e0b" roughness={0.4} metalness={0.5} />
          </mesh>
        </group>

        {/* Vertical Pinpoint Telemetry Pillar */}
        <mesh position={[0, 6.2, 0]}>
          <cylinderGeometry args={[0.035, 0.075, 12.4, 10, 1, true]} />
          <meshBasicMaterial
            color={beaconColor}
            transparent
            opacity={isDiscovered ? 0.34 : 0.22}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
        <mesh ref={roverGemRef} position={[0, 2.85, 0]}>
          <octahedronGeometry args={[0.24, 0]} />
          <meshStandardMaterial
            color={beaconColor}
            emissive={beaconColor}
            emissiveIntensity={1.6}
          />
        </mesh>

        {showRoverLabel && (
          <Html position={[0, 3.35, 0]} center distanceFactor={16}>
            <div
              className={`pointer-events-none whitespace-nowrap rounded border px-2 py-0.5 font-mono text-[10px] tracking-wider backdrop-blur-md ${
                isDiscovered
                  ? 'border-cyan-400/70 bg-black/75 text-cyan-200'
                  : 'border-amber-400/70 bg-black/75 text-amber-200'
              }`}
            >
              {isDiscovered ? `📌 ${rover.shortName} [PINNED]` : `📡 UNREGISTERED ROVER SIGNAL`}
            </div>
          </Html>
        )}
      </group>

      {/* Active Map Custom / Unexplored Pinpoint Beacon */}
      <CustomPinpointBeacon
        customPinpoint={customPinpoint}
        siteProfile={site.terrainProfile}
        terrainVersion={terrainVersion}
      />
    </group>
  );
}
