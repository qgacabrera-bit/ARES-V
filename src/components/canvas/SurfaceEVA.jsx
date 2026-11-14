import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { LANDING_ZONES_BY_ID } from '../../data/landingZones';
import { useMissionStore } from '../../store/useMissionStore';
import {
  CHUNK_SIZE,
  TERRAIN_SIZE,
  getActive3x3Chunks,
  getLocalRadiation,
  getSpectralSignature,
  getTerrainHeightAt,
  getTerrainSlopeAndNormal,
  loadHiRiseTerrainAssets,
  worldToChunk,
} from '../../utils/terrainMath';
import { createPlaceholderTexture } from '../../utils/wmtsLoader';
import FieldSlateDevice from './FieldSlateDevice';
import FirstPersonRig from './FirstPersonRig';
import LanderBase from './LanderBase';
import NasaRoverSite from './NasaRoverSite';
import SampleTarget from './SampleTarget';

const CHUNK_SEGMENTS = 64;
const ROCKS_PER_CHUNK = 22;

const TERRAIN_VERTEX_SHADER = /* glsl */ `
  attribute float aSlope;
  attribute vec3 aSpectral;
  attribute float aRad;

  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying float vSlope;
  varying vec3 vSpectral;
  varying float vRad;
  varying float vElev;

  void main() {
    vUv = uv;
    vSlope = aSlope;
    vSpectral = aSpectral;
    vRad = aRad;
    vElev = position.y;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const TERRAIN_FRAGMENT_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uOptical;
  uniform float uTopo;
  uniform float uSpectral;
  uniform float uEnv;
  uniform float uHasAlbedoTex;
  uniform sampler2D uAlbedoTex;
  uniform vec3 uBaseTint;
  uniform vec3 uRockTint;
  uniform float uIceFactor;
  uniform vec3 uSunDir;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;

  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying float vSlope;
  varying vec3 vSpectral;
  varying float vRad;
  varying float vElev;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise2(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  void main() {
    vec3 N = normalize(vNormal);
    vec3 L = normalize(uSunDir);
    float ndotl = max(dot(N, L), 0.0);
    float lighting = 0.24 + 0.88 * ndotl;

    // Fine procedural grain & sedimentary striations
    float micro = noise2(vWorldPos.xz * 2.4) * 0.5 + noise2(vWorldPos.xz * 9.0) * 0.3;
    float strata = sin(vElev * 11.0 + noise2(vWorldPos.xz * 0.35) * 3.0) * 0.5 + 0.5;

    // 1. OPTICAL LAYER (HiRISE orthophoto when available, or procedural regolith fallback)
    float rockMask = smoothstep(10.0, 26.0, vSlope);
    vec3 sandCol = mix(uBaseTint * 0.88, uBaseTint * 1.15, micro);
    sandCol = mix(sandCol, sandCol * 0.9, strata * 0.22);
    vec3 rockCol = mix(uRockTint * 0.8, uRockTint * 1.15, micro);
    vec3 procOptCol = mix(sandCol, rockCol, rockMask);

    float frostPocket = smoothstep(0.55, 0.85, micro) * uIceFactor * smoothstep(2.0, -1.5, vElev);
    procOptCol = mix(procOptCol, vec3(0.76, 0.83, 0.88), frostPocket * 0.38);

    vec3 hiriseOrtho = texture2D(uAlbedoTex, vUv).rgb * vec3(1.18, 0.86, 0.72);
    vec3 optCol = mix(procOptCol, hiriseOrtho, uHasAlbedoTex) * lighting;

    // 2. TOPOGRAPHY (HiRISE Slope Angle Shader + Elevation Contours)
    vec3 safeGreen = vec3(0.08, 0.72, 0.45);
    vec3 warnAmber = vec3(0.95, 0.62, 0.10);
    vec3 hazardRed = vec3(0.92, 0.20, 0.22);
    vec3 slopeCol = mix(safeGreen, warnAmber, smoothstep(11.0, 17.5, vSlope));
    slopeCol = mix(slopeCol, hazardRed, smoothstep(23.0, 28.0, vSlope));

    float contourFrac = abs(fract(vElev * 1.0) - 0.5);
    float contourLine = 1.0 - smoothstep(0.015, 0.055, contourFrac);
    float majorContour = 1.0 - smoothstep(0.015, 0.06, abs(fract(vElev * 0.25) - 0.5));
    vec3 topoCol = mix(optCol * 0.35 + slopeCol * 0.65, vec3(0.92, 0.98, 1.0), contourLine * 0.3 + majorContour * 0.55);
    topoCol *= (0.45 + 0.55 * lighting);

    // 3. SPECTRAL (CRISM Mineral Highlights)
    vec3 baseDesat = vec3(dot(optCol, vec3(0.3, 0.59, 0.11))) * 0.55;
    vec3 clayCyan = vec3(0.06, 0.82, 0.92) * smoothstep(0.32, 0.95, vSpectral.x);
    vec3 sulfAmber = vec3(0.98, 0.56, 0.12) * smoothstep(0.32, 0.95, vSpectral.y);
    vec3 carbGreen = vec3(0.22, 0.92, 0.48) * smoothstep(0.32, 0.95, vSpectral.z);
    float pulse = 0.88 + 0.12 * sin(uTime * 2.5 - length(vWorldPos.xz) * 0.25);
    vec3 specCol = baseDesat + (clayCyan + sulfAmber + carbGreen) * 0.85 * pulse;

    // 4. RADIATION / ENV (RAD/MEDA Spatial Dose Heatmap)
    float radNorm = clamp((vRad - 0.55) / 0.35, 0.0, 1.0);
    vec3 radLow = vec3(0.08, 0.14, 0.28);
    vec3 radMid = vec3(0.48, 0.16, 0.68);
    vec3 radHigh = vec3(0.95, 0.22, 0.38);
    vec3 envHeat = mix(radLow, radMid, smoothstep(0.0, 0.55, radNorm));
    envHeat = mix(envHeat, radHigh, smoothstep(0.55, 1.0, radNorm));
    float grid = (1.0 - smoothstep(0.02, 0.06, abs(fract(vWorldPos.x * 0.2) - 0.5))) +
                 (1.0 - smoothstep(0.02, 0.06, abs(fract(vWorldPos.z * 0.2) - 0.5)));
    vec3 envCol = mix(optCol * 0.35 + envHeat * 0.68, vec3(0.45, 0.85, 1.0), clamp(grid, 0.0, 1.0) * 0.22);

    vec3 finalCol = optCol * uOptical + topoCol * uTopo + specCol * uSpectral + envCol * uEnv;

    float dist = length(cameraPosition - vWorldPos);
    float fogFactor = smoothstep(uFogNear, uFogFar, dist);
    finalCol = mix(finalCol, uFogColor, fogFactor);

    gl_FragColor = vec4(finalCol, 1.0);
  }
`;

function WindVectors({ siteProfile, terrainVersion, visibleFactor }) {
  const count = 260;
  const pointsRef = useRef();

  const { positions, speeds } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const spd = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * 85;
      const z = (Math.random() - 0.5) * 85;
      const y = getTerrainHeightAt(x, z, siteProfile) + 0.3 + Math.random() * 4.5;
      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;
      spd[i] = 6.5 + Math.random() * 6.0;
    }
    return { positions: pos, speeds: spd };
  }, [siteProfile, terrainVersion]);

  useFrame(({ camera }, delta) => {
    if (!pointsRef.current) return;
    const attr = pointsRef.current.geometry.attributes.position;
    const arr = attr.array;
    const camX = camera.position.x;
    const camZ = camera.position.z;
    const span = 96;
    const half = 48;
    for (let i = 0; i < count; i++) {
      const idx = i * 3;
      arr[idx] += speeds[i] * delta * (0.4 + visibleFactor * 1.1);
      arr[idx + 2] += speeds[i] * delta * 0.35;
      if (arr[idx] - camX > half) arr[idx] -= span;
      if (arr[idx] - camX < -half) arr[idx] += span;
      if (arr[idx + 2] - camZ > half) arr[idx + 2] -= span;
      if (arr[idx + 2] - camZ < -half) arr[idx + 2] += span;
    }
    attr.needsUpdate = true;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color={visibleFactor > 0.5 ? '#38bdf8' : '#f2b89b'}
        size={visibleFactor > 0.5 ? 0.24 : 0.11}
        transparent
        opacity={visibleFactor > 0.5 ? 0.8 : 0.28}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}

function ProceduralRocks({ siteProfile, roverPos, activeChunks, terrainVersion }) {
  const meshRef = useRef();
  const rockCount = activeChunks.length * ROCKS_PER_CHUNK;

  const transforms = useMemo(() => {
    const items = [];
    const seed = siteProfile?.seed || 17.3;

    activeChunks.forEach((chunk) => {
      const chunkSeed = chunk.cx * 73.13 + chunk.cz * 151.7 + seed;
      for (let i = 0; i < ROCKS_PER_CHUNK; i++) {
        const r1 = Math.sin(i * 12.9898 + chunkSeed) * 43758.5453;
        const r2 = Math.sin(i * 78.233 + chunkSeed * 2.1) * 43758.5453;
        const r3 = Math.sin(i * 45.164 + chunkSeed * 3.7) * 43758.5453;
        const f1 = r1 - Math.floor(r1);
        const f2 = r2 - Math.floor(r2);
        const f3 = r3 - Math.floor(r3);

        let x = chunk.minX + 1.2 + f1 * (CHUNK_SIZE - 2.4);
        let z = chunk.minZ + 1.2 + f2 * (CHUNK_SIZE - 2.4);

        // Keep player spawn & Lander landing apron clear of boulders
        if (Math.hypot(x, z) < 4.2) {
          const pushAngle = Math.atan2(z, x || 0.1);
          x = Math.cos(pushAngle) * 5.0;
          z = Math.sin(pushAngle) * 5.0;
        }
        const distToLander = Math.hypot(x, z - 8);
        if (distToLander < 6.4) {
          const pushAngle = Math.atan2(z - 8, x);
          x = Math.cos(pushAngle) * (6.8 + f3 * 4.0);
          z = 8 + Math.sin(pushAngle) * (6.8 + f3 * 4.0);
        }
        if (roverPos) {
          const distToRover = Math.hypot(x - roverPos[0], z - roverPos[1]);
          if (distToRover < 3.8) {
            const pushAngle = Math.atan2(z - roverPos[1], x - roverPos[0]);
            x = roverPos[0] + Math.cos(pushAngle) * (4.1 + f2 * 2.4);
            z = roverPos[1] + Math.sin(pushAngle) * (4.1 + f2 * 2.4);
          }
        }
        const y = getTerrainHeightAt(x, z, siteProfile);

        const scaleBase = 0.18 + Math.pow(f3, 2.2) * 1.15;
        items.push({
          position: [x, y + scaleBase * 0.22, z],
          rotation: [f1 * Math.PI, f2 * Math.PI * 2, f3 * Math.PI],
          scale: [
            scaleBase * (0.9 + f1 * 0.5),
            scaleBase * (0.55 + f2 * 0.4),
            scaleBase * (0.85 + f3 * 0.5),
          ],
        });
      }
    });
    return items;
  }, [siteProfile, roverPos, activeChunks, terrainVersion]);

  useEffect(() => {
    if (!meshRef.current) return;
    const dummy = new THREE.Object3D();
    transforms.forEach((item, i) => {
      dummy.position.set(...item.position);
      dummy.rotation.set(...item.rotation);
      dummy.scale.set(...item.scale);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [transforms]);

  return (
    <instancedMesh ref={meshRef} args={[null, null, rockCount]} castShadow receiveShadow>
      <dodecahedronGeometry args={[0.55, 0]} />
      <meshStandardMaterial color={siteProfile?.rockTint || '#5c3828'} roughness={0.93} metalness={0.04} />
    </instancedMesh>
  );
}

const SUBSURFACE_ECHO_OFFSETS = [
  { dx: 8, dz: -9, color: '#22d3ee', radius: 3.2 },
  { dx: -11, dz: -7, color: '#f59e0b', radius: 2.6 },
  { dx: 12, dz: 6, color: '#22d3ee', radius: 3.8 },
  { dx: -7, dz: 13, color: '#f59e0b', radius: 2.4 },
];

function RimfaxRadarWave({ siteProfile }) {
  const ringRef = useRef();
  const echoRefs = useRef([]);
  const radarPulse = useMissionStore((s) => s.radarPulse);
  const updateRadarPulse = useMissionStore((s) => s.updateRadarPulse);

  const echoes = useMemo(() => {
    const [ox, , oz] = radarPulse.origin;
    return SUBSURFACE_ECHO_OFFSETS.map((item) => {
      const wx = ox + item.dx;
      const wz = oz + item.dz;
      const wy = getTerrainHeightAt(wx, wz, siteProfile) + 0.14;
      const dist = Math.hypot(item.dx, item.dz);
      return { ...item, pos: [wx, wy, wz], dist };
    });
  }, [radarPulse.origin, siteProfile]);

  useFrame((_, delta) => {
    const state = useMissionStore.getState();
    if (!state.radarPulse.active) return;

    const nextProgress = state.radarPulse.progress + delta / 2.6;
    updateRadarPulse(nextProgress);

    const waveRadius = 0.5 + nextProgress * 46.0;
    if (ringRef.current) {
      ringRef.current.scale.set(waveRadius, waveRadius, 1);
      ringRef.current.material.opacity = (1.0 - nextProgress) * 0.78;
    }

    for (let i = 0; i < echoRefs.current.length; i++) {
      const mesh = echoRefs.current[i];
      if (!mesh) continue;
      const deltaDist = waveRadius - echoes[i].dist;
      const hit = deltaDist > 0 && deltaDist < 24 ? Math.exp(-deltaDist * 0.14) : 0;
      mesh.material.opacity = hit * 0.7;
    }
  });

  if (!radarPulse.active) return null;

  return (
    <group>
      <mesh
        ref={ringRef}
        position={[radarPulse.origin[0], radarPulse.origin[1] + 0.18, radarPulse.origin[2]]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <ringGeometry args={[0.92, 1.0, 64]} />
        <meshBasicMaterial
          color="#22d3ee"
          transparent
          opacity={0.75}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {echoes.map((e, idx) => (
        <mesh
          key={idx}
          ref={(el) => {
            echoRefs.current[idx] = el;
          }}
          position={e.pos}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <ringGeometry args={[e.radius * 0.55, e.radius, 32]} />
          <meshBasicMaterial
            color={e.color}
            transparent
            opacity={0}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}

function buildTerrainChunkGeometry(chunk, site) {
  const geom = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, CHUNK_SEGMENTS, CHUNK_SEGMENTS);
  geom.rotateX(-Math.PI / 2);

  const posAttr = geom.attributes.position;
  const uvAttr = geom.attributes.uv;
  const count = posAttr.count;
  const slopes = new Float32Array(count);
  const spectrals = new Float32Array(count * 3);
  const rads = new Float32Array(count);
  const normals = new Float32Array(count * 3);
  const halfTerrain = TERRAIN_SIZE * 0.5;

  for (let i = 0; i < count; i++) {
    const wx = chunk.centerX + posAttr.getX(i);
    const wz = chunk.centerZ + posAttr.getZ(i);
    const y = getTerrainHeightAt(wx, wz, site.terrainProfile);
    posAttr.setY(i, y);

    if (uvAttr) {
      const u = Math.min(1, Math.max(0, (wx + halfTerrain) / TERRAIN_SIZE));
      const v = Math.min(1, Math.max(0, 1.0 - (wz + halfTerrain) / TERRAIN_SIZE));
      uvAttr.setXY(i, u, v);
    }

    const { slopeDeg, normal } = getTerrainSlopeAndNormal(wx, wz, site.terrainProfile);
    slopes[i] = slopeDeg;
    normals[i * 3] = normal[0];
    normals[i * 3 + 1] = normal[1];
    normals[i * 3 + 2] = normal[2];

    const spec = getSpectralSignature(wx, wz, site.terrainProfile, site.targets);
    spectrals[i * 3] = spec.clay;
    spectrals[i * 3 + 1] = spec.sulfate;
    spectrals[i * 3 + 2] = spec.carbonate;

    rads[i] = getLocalRadiation(wx, wz, y, slopeDeg, site.baseRadiation);
  }

  geom.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geom.setAttribute('aSlope', new THREE.BufferAttribute(slopes, 1));
  geom.setAttribute('aSpectral', new THREE.BufferAttribute(spectrals, 3));
  geom.setAttribute('aRad', new THREE.BufferAttribute(rads, 1));
  geom.computeBoundingSphere();

  return geom;
}

export default function SurfaceEVA() {
  const selectedSiteId = useMissionStore((s) => s.selectedSiteId) || 'jezero';
  const evaLayer = useMissionStore((s) => s.evaLayer);
  const collectedSamples = useMissionStore((s) => s.collectedSamples);
  const playerPos = useMissionStore((s) => s.telemetry.position);
  const setSurfaceDataSource = useMissionStore((s) => s.setSurfaceDataSource);

  const site = LANDING_ZONES_BY_ID[selectedSiteId] || LANDING_ZONES_BY_ID.jezero;
  const siteCollectedIds = collectedSamples[site.id] || [];

  const [playerCx, playerCz] = worldToChunk(playerPos?.[0] ?? 0, playerPos?.[1] ?? 0);
  const activeChunks = useMemo(
    () => getActive3x3Chunks(playerCx * CHUNK_SIZE, playerCz * CHUNK_SIZE),
    [playerCx, playerCz]
  );

  const terrainMatRef = useRef();
  const dirLightRef = useRef();
  const dirLightTarget = useMemo(() => new THREE.Object3D(), []);
  const chunkGeomCacheRef = useRef(new Map());
  const [terrainVersion, setTerrainVersion] = useState(0);

  const placeholderTex = useMemo(() => createPlaceholderTexture(), []);

  const fogColorHex =
    evaLayer === 'OPTICAL'
      ? '#c16a43'
      : evaLayer === 'TOPOGRAPHY'
      ? '#3a2a24'
      : evaLayer === 'SPECTRAL'
      ? '#161b26'
      : '#121324';

  const terrainUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uOptical: { value: 1 },
      uTopo: { value: 0 },
      uSpectral: { value: 0 },
      uEnv: { value: 0 },
      uHasAlbedoTex: { value: 0 },
      uAlbedoTex: { value: placeholderTex },
      uBaseTint: { value: new THREE.Color(site.terrainProfile.baseTint) },
      uRockTint: { value: new THREE.Color(site.terrainProfile.rockTint) },
      uIceFactor: { value: site.terrainProfile.iceFactor },
      uSunDir: { value: new THREE.Vector3(35, 28, 22).normalize() },
      uFogColor: { value: new THREE.Color('#c16a43') },
      uFogNear: { value: 18.0 },
      uFogFar: { value: 105.0 },
    }),
    [site, placeholderTex]
  );

  const terrainMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: TERRAIN_VERTEX_SHADER,
        fragmentShader: TERRAIN_FRAGMENT_SHADER,
        uniforms: terrainUniforms,
      }),
    [terrainUniforms]
  );

  useEffect(() => {
    terrainMatRef.current = terrainMaterial;
    return () => {
      terrainMaterial.dispose();
    };
  }, [terrainMaterial]);

  // Dispose cached chunk geometries when site or terrain asset updates
  useEffect(() => {
    const cache = chunkGeomCacheRef.current;
    return () => {
      cache.forEach((g) => g.dispose());
      cache.clear();
    };
  }, [site.id, terrainVersion]);

  // Attempt loading HiRISE heightmap PNG & albedo JPG from /terrain/{zoneId}/
  useEffect(() => {
    let active = true;
    loadHiRiseTerrainAssets(site.id, site.terrainProfile).then((asset) => {
      if (!active) return;
      setSurfaceDataSource(asset.mode);
      if (terrainMatRef.current) {
        if (asset.albedoTexture) {
          terrainMatRef.current.uniforms.uAlbedoTex.value = asset.albedoTexture;
          terrainMatRef.current.uniforms.uHasAlbedoTex.value = 1.0;
        } else {
          terrainMatRef.current.uniforms.uAlbedoTex.value = placeholderTex;
          terrainMatRef.current.uniforms.uHasAlbedoTex.value = 0.0;
        }
      }
      setTerrainVersion((v) => v + 1);
    });
    return () => {
      active = false;
    };
  }, [site, placeholderTex, setSurfaceDataSource]);

  // Stream the 3x3 chunk meshes around the player's current chunk [playerCx, playerCz]
  const activeChunkMeshes = useMemo(() => {
    return activeChunks.map((chunk) => {
      const cacheKey = `${site.id}:${terrainVersion}:${chunk.key}`;
      let geometry = chunkGeomCacheRef.current.get(cacheKey);
      if (!geometry) {
        geometry = buildTerrainChunkGeometry(chunk, site);
        chunkGeomCacheRef.current.set(cacheKey, geometry);
      }
      return { chunk, geometry };
    });
  }, [activeChunks, site, terrainVersion]);

  // Keep shadow frustum centered on the active 3x3 chunk grid
  useEffect(() => {
    if (dirLightRef.current) {
      dirLightTarget.position.set(playerCx * CHUNK_SIZE, 0, playerCz * CHUNK_SIZE);
      dirLightTarget.updateMatrixWorld();
      dirLightRef.current.target = dirLightTarget;
    }
  }, [playerCx, playerCz, dirLightTarget]);

  const targetFogVec = useMemo(() => new THREE.Color(), []);

  useFrame(({ clock }, delta) => {
    const dt = Math.min(delta, 0.05);
    const t = clock.getElapsedTime();

    if (terrainMatRef.current) {
      terrainMatRef.current.uniforms.uTime.value = t;
      const lerpSpeed = Math.min(1, dt * 6.0);
      terrainMatRef.current.uniforms.uOptical.value = THREE.MathUtils.lerp(
        terrainMatRef.current.uniforms.uOptical.value,
        evaLayer === 'OPTICAL' ? 1 : 0,
        lerpSpeed
      );
      terrainMatRef.current.uniforms.uTopo.value = THREE.MathUtils.lerp(
        terrainMatRef.current.uniforms.uTopo.value,
        evaLayer === 'TOPOGRAPHY' ? 1 : 0,
        lerpSpeed
      );
      terrainMatRef.current.uniforms.uSpectral.value = THREE.MathUtils.lerp(
        terrainMatRef.current.uniforms.uSpectral.value,
        evaLayer === 'SPECTRAL' ? 1 : 0,
        lerpSpeed
      );
      terrainMatRef.current.uniforms.uEnv.value = THREE.MathUtils.lerp(
        terrainMatRef.current.uniforms.uEnv.value,
        evaLayer === 'ENV' ? 1 : 0,
        lerpSpeed
      );
      targetFogVec.set(fogColorHex);
      terrainMatRef.current.uniforms.uFogColor.value.lerp(targetFogVec, lerpSpeed);
    }
  });

  return (
    <>
      <color attach="background" args={[fogColorHex]} />
      <fog attach="fog" args={[fogColorHex, 18, 105]} />

      <hemisphereLight args={['#e29b7a', '#3d2218', 0.65]} />
      <primitive object={dirLightTarget} />
      <directionalLight
        ref={dirLightRef}
        position={[playerCx * CHUNK_SIZE + 35, 28, playerCz * CHUNK_SIZE + 22]}
        intensity={2.1}
        color="#ffe2cc"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={1}
        shadow-camera-far={140}
        shadow-camera-left={-55}
        shadow-camera-right={55}
        shadow-camera-top={55}
        shadow-camera-bottom={-55}
      />

      {/* Streamed 3x3 Terrain Chunks (34m x 34m per chunk = 102m x 102m loaded sector) */}
      {activeChunkMeshes.map(({ chunk, geometry }) => (
        <mesh
          key={chunk.key}
          position={[chunk.centerX, 0, chunk.centerZ]}
          geometry={geometry}
          material={terrainMaterial}
          receiveShadow
        />
      ))}

      {/* Mars Descent/Ascent Lander Base 8m behind spawn */}
      <LanderBase site={site} terrainVersion={terrainVersion} />

      {/* Historic NASA Rover Site, Traverse Tracks & Pinpoint Beacons */}
      <NasaRoverSite site={site} terrainVersion={terrainVersion} />

      {/* Streamed Basaltic Rocks across active 3x3 chunks */}
      <ProceduralRocks
        siteProfile={site.terrainProfile}
        roverPos={site.nasaRover?.position}
        activeChunks={activeChunks}
        terrainVersion={terrainVersion}
      />

      {/* Animated Martian Wind / Dust Vectors */}
      <WindVectors
        siteProfile={site.terrainProfile}
        terrainVersion={terrainVersion}
        visibleFactor={evaLayer === 'ENV' ? 1 : 0}
      />

      {/* Geological Sample Targets (Hover-Interactive Only) */}
      {site.targets.map((target) => (
        <SampleTarget
          key={target.id}
          target={target}
          siteProfile={site.terrainProfile}
          terrainVersion={terrainVersion}
          isCollected={siteCollectedIds.includes(target.id)}
        />
      ))}

      {/* Subsurface RIMFAX Radar Wave & Echo Rings */}
      <RimfaxRadarWave siteProfile={site.terrainProfile} />

      {/* First-Person Astronaut Rig */}
      <FirstPersonRig
        site={site}
        terrainVersion={terrainVersion}
      />

      {/* Hand-Held / Forearm-Mounted Interactive ARES-V Field Slate & Helmet Headlamp */}
      <FieldSlateDevice site={site} terrainVersion={terrainVersion} />
    </>
  );
}
