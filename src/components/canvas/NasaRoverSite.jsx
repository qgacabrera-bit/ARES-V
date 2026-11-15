import React, { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
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

export default function NasaRoverSite({ site, terrainVersion }) {
  const mastRef = useRef();

  const viewMode = useMissionStore((s) => s.viewMode);
  const wristMapOpen = useMissionStore((s) => s.wristMapOpen);
  const discoveredRovers = useMissionStore((s) => s.discoveredRovers);
  const discoverRover = useMissionStore((s) => s.discoverRover);
  const setRoverModalOpen = useMissionStore((s) => s.setRoverModalOpen);
  const setCustomPinpoint = useMissionStore((s) => s.setCustomPinpoint);
  const setLandingMonumentModalOpen = useMissionStore((s) => s.setLandingMonumentModalOpen);

  const [roverHovered, setRoverHovered] = useState(false);
  const [landingHovered, setLandingHovered] = useState(false);

  const rover = site?.nasaRover;
  const isDiscovered = rover ? Boolean(discoveredRovers[site.id]) : false;

  const roverGroundY = useMemo(() => {
    void terrainVersion;
    if (!rover) return 0;
    return getTerrainHeightAt(rover.position[0], rover.position[1], site.terrainProfile);
  }, [rover, site, terrainVersion]);

  const landingPosXZ = rover?.landingPosition || rover?.traversePoints?.[0] || null;
  const landingGroundY = useMemo(() => {
    void terrainVersion;
    if (!landingPosXZ) return 0;
    return getTerrainHeightAt(landingPosXZ[0], landingPosXZ[1], site.terrainProfile);
  }, [landingPosXZ, site, terrainVersion]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (mastRef.current) {
      mastRef.current.rotation.y = Math.sin(t * 0.55) * 0.45;
    }
  });

  if (!rover) return null;

  const roverYaw = ((rover.heading || 135) * Math.PI) / 180;
  const showRoverLabel = viewMode === 'EVA' && !wristMapOpen && roverHovered;
  const showLandingLabel = viewMode === 'EVA' && !wristMapOpen && landingHovered;

  return (
    <group name="nasa-rover-site">
      {/* Physical NASA Sol 0 Touchdown Monument Plaque (No Highlight Beams or Rings) */}
      {landingPosXZ && (
        <group
          position={[landingPosXZ[0], landingGroundY, landingPosXZ[1]]}
          name="nasa-rover-landing-site"
          onPointerOver={(e) => {
            e.stopPropagation();
            setLandingHovered(true);
            document.body.style.cursor = 'pointer';
            setCustomPinpoint({
              id: 'rover-landing-sol0',
              name: rover.landingName || 'Rover Landing (Sol 0)',
              position: landingPosXZ,
              isUnexplored: false,
            });
          }}
          onPointerOut={(e) => {
            e.stopPropagation();
            setLandingHovered(false);
            document.body.style.cursor = 'auto';
          }}
          onClick={(e) => {
            e.stopPropagation();
            setLandingMonumentModalOpen(true);
          }}
        >
          {/* Invisible Hover Hit Sphere */}
          <mesh position={[0, 0.5, 0]}>
            <sphereGeometry args={[1.4, 12, 12]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
          {/* Low-profile physical metallic Sol 0 commemorative marker & blast pad */}
          <mesh position={[0, 0.04, 0]} receiveShadow>
            <cylinderGeometry args={[0.72, 0.84, 0.08, 12]} />
            <meshStandardMaterial color="#334155" roughness={0.78} metalness={0.45} />
          </mesh>
          <mesh position={[0, 0.16, 0]} castShadow>
            <cylinderGeometry args={[0.04, 0.05, 0.24, 8]} />
            <meshStandardMaterial color="#94a3b8" roughness={0.35} metalness={0.8} />
          </mesh>
          <mesh position={[0, 0.3, 0]} rotation={[-0.35, 0, 0]} castShadow>
            <boxGeometry args={[0.38, 0.22, 0.04]} />
            <meshStandardMaterial color="#eab308" roughness={0.35} metalness={0.75} />
          </mesh>
          {showLandingLabel && (
            <Html position={[0, 1.35, 0]} center style={{ pointerEvents: 'none' }}>
              <div className="scene-tag pointer-events-none">
                <div className="font-bold">
                  {rover.landingName || 'Rover landing, Sol 0'} · [E] Inspect
                </div>
                <div className="text-dim">
                  {rover.landingCoordinates} · {rover.landingDate}
                </div>
              </div>
            </Html>
          )}
        </group>
      )}

      {/* 3D NASA Rover Chassis (Natural Physical Model — Hover Only) */}
      <group
        position={[rover.position[0], roverGroundY, rover.position[1]]}
        rotation={[0, roverYaw, 0]}
        name={rover.id}
        onPointerOver={(e) => {
          e.stopPropagation();
          setRoverHovered(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          setRoverHovered(false);
          document.body.style.cursor = 'auto';
        }}
        onClick={(e) => {
          e.stopPropagation();
          discoverRover(site.id);
          setRoverModalOpen(true);
        }}
      >
        {/* Ground tire tracks / dust disturbance */}
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <circleGeometry args={[1.65, 24]} />
          <meshStandardMaterial color="#3c261d" roughness={0.96} transparent opacity={0.55} />
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

        {showRoverLabel && (
          <Html position={[0, 2.35, 0]} center distanceFactor={16}>
            <div className="scene-tag pointer-events-none">
              <div className="font-bold">{rover.name}</div>
              <div className="text-dim">
                {rover.totalOdometryKm} km driven · Sol {rover.latestSol}
                {isDiscovered ? ' · on your map' : ''}
              </div>
            </div>
          </Html>
        )}
      </group>
    </group>
  );
}
