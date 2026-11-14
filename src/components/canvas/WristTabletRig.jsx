import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useMissionStore } from '../../store/useMissionStore';
import { computeSafeTraversePath } from '../../utils/pathfinding';
import {
  getTerrainHeightAt,
  getTerrainSlopeAndNormal,
} from '../../utils/terrainMath';

const HOLO_WORLD_SPAN = 84; // meters (-42m .. +42m)
const HOLO_SIZE = 0.165; // meters on wrist projection
const HOLO_HEIGHT_SCALE = 0.0045;
const HOLO_SEGS = 44;

const SUN_DIR = new THREE.Vector3(35, 28, 22).normalize();

const HOLO_VERTEX_SHADER = /* glsl */ `
  attribute float aSlope;
  varying vec2 vUv;
  varying float vSlope;
  varying float vElev;
  varying vec3 vLocalPos;

  void main() {
    vUv = uv;
    vSlope = aSlope;
    vElev = position.y;
    vLocalPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const HOLO_FRAGMENT_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uRadarProgress;
  uniform float uRadarActive;
  uniform float uOpacityBoost;

  varying vec2 vUv;
  varying float vSlope;
  varying float vElev;
  varying vec3 vLocalPos;

  void main() {
    // Wireframe grid lines + elevation contour rings
    vec2 grid = abs(fract(vUv * 18.0 - 0.5) - 0.5) / 0.06;
    float gridLine = 1.0 - min(min(grid.x, grid.y), 1.0);

    float contour = 1.0 - smoothstep(0.02, 0.08, abs(fract(vElev * 180.0) - 0.5));
    float scanline = 0.78 + 0.22 * sin(vUv.y * 140.0 - uTime * 4.5);

    vec3 cyanHolo = vec3(0.08, 0.85, 0.98);
    vec3 amberSlope = vec3(0.98, 0.65, 0.12);
    vec3 hazardRed = vec3(1.0, 0.20, 0.24);

    vec3 col = cyanHolo;
    col = mix(col, amberSlope, smoothstep(14.0, 22.0, vSlope));
    col = mix(col, hazardRed, smoothstep(24.5, 29.0, vSlope));

    // RIMFAX pulse sweep across hologram surface
    float distCenter = length(vLocalPos.xz) / 0.085;
    float pulseWave = exp(-pow((distCenter - uRadarProgress) * 14.0, 2.0)) * uRadarActive;
    col += vec3(0.35, 0.95, 1.0) * pulseWave * 1.4;

    // Edge vignette fade
    vec2 edge = abs(vUv - 0.5) * 2.0;
    float borderFade = 1.0 - smoothstep(0.82, 1.0, max(edge.x, edge.y));

    float alpha = (0.14 + gridLine * 0.42 + contour * 0.35 + pulseWave * 0.45) * scanline * borderFade * uOpacityBoost;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.92));
  }
`;

const RIMFAX_STRIP_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const RIMFAX_STRIP_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uIceFactor;
  uniform float uRadarActive;
  uniform float uRadarProgress;

  varying vec2 vUv;

  void main() {
    // Subsurface stratigraphy layers: dust -> fractured bedrock -> water-ice lenses
    float strata1 = sin(vUv.x * 22.0 + 0.5) * 0.06 + 0.72;
    float strata2 = cos(vUv.x * 14.0 - 1.2) * 0.08 + 0.42;

    float bedrockLine = 1.0 - smoothstep(0.015, 0.045, abs(vUv.y - strata1));
    float deepLine = 1.0 - smoothstep(0.015, 0.045, abs(vUv.y - strata2));

    // Buried water-ice lenses (stronger at Arcadia / when RIMFAX pulses)
    float lensA = exp(-pow((vUv.x - 0.32) * 7.5, 2.0) - pow((vUv.y - 0.36) * 10.0, 2.0));
    float lensB = exp(-pow((vUv.x - 0.74) * 6.5, 2.0) - pow((vUv.y - 0.28) * 11.0, 2.0));
    float iceIntensity = (lensA + lensB) * (0.35 + uIceFactor * 0.85);

    float scanSweep = exp(-pow((vUv.x - uRadarProgress) * 10.0, 2.0)) * uRadarActive;

    vec3 bg = vec3(0.02, 0.14, 0.22) * 0.35;
    vec3 bedrockCol = vec3(0.95, 0.58, 0.15) * (bedrockLine * 0.65 + deepLine * 0.45);
    vec3 iceCol = vec3(0.20, 0.92, 1.0) * iceIntensity * (0.65 + uRadarActive * 1.15);
    vec3 sweepCol = vec3(0.55, 0.98, 1.0) * scanSweep * 0.85;

    float scanlines = 0.8 + 0.2 * sin(vUv.y * 90.0 - uTime * 3.0);
    vec3 finalCol = (bg + bedrockCol + iceCol + sweepCol) * scanlines;
    float alpha = (0.32 + bedrockLine * 0.4 + iceIntensity * 0.55 + scanSweep * 0.4) * (0.75 + uRadarActive * 0.35);

    gl_FragColor = vec4(finalCol, clamp(alpha, 0.0, 0.92));
  }
`;

function worldToHolo(wx, wz, siteProfile) {
  const halfSpan = HOLO_WORLD_SPAN * 0.5;
  const cx = THREE.MathUtils.clamp(wx / halfSpan, -0.96, 0.96) * (HOLO_SIZE * 0.5);
  const cz = THREE.MathUtils.clamp(wz / halfSpan, -0.96, 0.96) * (HOLO_SIZE * 0.5);
  const wy = getTerrainHeightAt(wx, wz, siteProfile);
  return [cx, wy * HOLO_HEIGHT_SCALE, cz];
}

function formatSolTime(msElapsed) {
  const totalSec = Math.max(0, Math.floor(msElapsed / 1000));
  const hrs = String(Math.floor(totalSec / 3600)).padStart(2, '0');
  const mins = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
  const secs = String(totalSec % 60).padStart(2, '0');
  return `${hrs}:${mins}:${secs}`;
}

export default function WristTabletRig({ site, terrainVersion }) {
  const { camera } = useThree();

  const rigRootRef = useRef();
  const armGroupRef = useRef();
  const holoMatRef = useRef();
  const rimfaxStripMatRef = useRef();
  const playerMarkerRef = useRef();
  const headlampRef = useRef();
  const headlampTargetObj = useMemo(() => new THREE.Object3D(), []);

  const prevCamPosRef = useRef(new THREE.Vector3());
  const prevCamEulerRef = useRef(new THREE.Euler(0, 0, 0, 'YXZ'));
  const bobPhaseRef = useRef(0);
  const swayRef = useRef({ x: 0, y: 0 });
  const glareReportedRef = useRef(0);
  const bezelTimerRef = useRef(0);

  const wristMapOpen = useMissionStore((s) => s.wristMapOpen);
  const headlampOn = useMissionStore((s) => s.headlampOn);
  const activeRoute = useMissionStore((s) => s.activeRoute);
  const radarPulse = useMissionStore((s) => s.radarPulse);
  const collectedSamples = useMissionStore((s) => s.collectedSamples);
  const evaStartTime = useMissionStore((s) => s.evaStartTime);
  const discoveredRovers = useMissionStore((s) => s.discoveredRovers);
  const customPinpoint = useMissionStore((s) => s.customPinpoint);

  const toggleHeadlamp = useMissionStore((s) => s.toggleHeadlamp);
  const setActiveRoute = useMissionStore((s) => s.setActiveRoute);
  const clearActiveRoute = useMissionStore((s) => s.clearActiveRoute);
  const triggerRadarPulse = useMissionStore((s) => s.triggerRadarPulse);
  const setSunGlareFactor = useMissionStore((s) => s.setSunGlareFactor);
  const discoverRover = useMissionStore((s) => s.discoverRover);

  const siteCollectedIds = collectedSamples[site.id] || [];
  const rover = site?.nasaRover;
  const isRoverDiscovered = Boolean(discoveredRovers[site.id]);

  // Register headlamp spotlight target into the active scene
  useEffect(() => {
    const parent = rigRootRef.current?.parent;
    if (parent && !headlampTargetObj.parent) {
      parent.add(headlampTargetObj);
    }
    return () => {
      if (headlampTargetObj.parent) {
        headlampTargetObj.parent.remove(headlampTargetObj);
      }
    };
  }, [headlampTargetObj]);

  // Dynamic CanvasTexture for diegetic wrist bezel LED readouts
  const { bezelCanvas, bezelTexture } = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 96;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return { bezelCanvas: canvas, bezelTexture: tex };
  }, []);

  // Button bar CanvasTexture on lower bezel
  const buttonsTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#090e17';
    ctx.fillRect(0, 0, 512, 64);

    const drawBtn = (x, w, label, sub, color) => {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
      ctx.fillRect(x, 6, w, 52);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, 7, w - 2, 50);

      ctx.fillStyle = color;
      ctx.font = 'bold 17px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(label, x + w / 2, 30);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '12px monospace';
      ctx.fillText(sub, x + w / 2, 48);
    };

    drawBtn(8, 158, '[P] ROUTE', 'A* SAFE <15°', '#38bdf8');
    drawBtn(177, 158, '[R] RIMFAX', 'SUBSURFACE', '#22d3ee');
    drawBtn(346, 158, '[F] LAMP', 'HEADLAMP', '#fbbf24');

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }, []);

  const drawBezelTelemetry = useMemo(() => {
    return () => {
      const ctx = bezelCanvas.getContext('2d');
      const state = useMissionStore.getState();
      const elapsed = state.evaStartTime ? Date.now() - state.evaStartTime : 0;
      const phys = state.physiology;
      const packMass = state.carriedMassKg ?? 0;
      const maxMass = state.maxPackMassKg ?? 25;

      ctx.fillStyle = '#060a12';
      ctx.fillRect(0, 0, 512, 96);

      ctx.strokeStyle =
        phys.oxygen < 20
          ? 'rgba(251, 191, 36, 0.72)'
          : phys.bodyTempC < 35.8
            ? 'rgba(56, 189, 248, 0.72)'
            : 'rgba(56, 189, 248, 0.45)';
      ctx.lineWidth = 2;
      ctx.strokeRect(2, 2, 508, 92);

      // Top LED Physiology & Pack Bezel Row
      ctx.font = 'bold 17px monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle =
        phys.oxygen < 15 ? '#f87171' : phys.oxygen < 30 ? '#fbbf24' : '#67e8f9';
      ctx.fillText(`O2:${Math.round(phys.oxygen)}%`, 12, 34);

      ctx.fillStyle = phys.bodyTempC < 35.8 ? '#38bdf8' : '#e2e8f0';
      ctx.fillText(`T:${phys.bodyTempC.toFixed(1)}C`, 108, 34);

      ctx.fillStyle = phys.stamina < 25 ? '#fbbf24' : '#34d399';
      ctx.fillText(`STM:${Math.round(phys.stamina)}%`, 218, 34);

      ctx.textAlign = 'right';
      ctx.fillStyle = packMass >= maxMass * 0.75 ? '#fbbf24' : '#cbd5e1';
      ctx.fillText(`PACK:${packMass.toFixed(1)}/${maxMass}KG`, 500, 34);

      // Divider
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(12, 48, 488, 1);

      // Bottom micro status flags & SOL Timer
      ctx.font = 'bold 15px monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = state.nearLander
        ? '#fbbf24'
        : state.activeRoute
          ? '#34d399'
          : '#64748b';
      ctx.fillText(
        state.nearLander
          ? 'AIRLOCK [E] SYNC'
          : state.activeRoute
            ? `RTE:${state.activeRoute.distanceMeters}m`
            : 'RTE:STBY',
        12,
        76
      );

      ctx.textAlign = 'center';
      ctx.fillStyle = state.radarPulse.active ? '#22d3ee' : '#94a3b8';
      ctx.fillText(
        state.radarPulse.active ? 'RIMFAX:ON' : `BASE:${Math.round(state.landerDistance ?? 8)}m`,
        235,
        76
      );

      ctx.textAlign = 'center';
      ctx.fillStyle = state.headlampOn ? '#fbbf24' : '#64748b';
      ctx.fillText(state.headlampOn ? 'LMP:ON' : 'LMP:OFF', 355, 76);

      ctx.textAlign = 'right';
      ctx.fillStyle = '#fbbf24';
      ctx.fillText(`${formatSolTime(elapsed)}`, 500, 76);

      bezelTexture.needsUpdate = true;
    };
  }, [bezelCanvas, bezelTexture]);

  useEffect(() => {
    drawBezelTelemetry();
  }, [drawBezelTelemetry, headlampOn, activeRoute, radarPulse.active, evaStartTime]);

  useEffect(() => {
    return () => {
      bezelTexture.dispose();
      buttonsTexture.dispose();
    };
  }, [bezelTexture, buttonsTexture]);

  // Miniature 3D holographic terrain patch mesh floating above the wrist pad
  const holoGeometry = useMemo(() => {
    const geom = new THREE.PlaneGeometry(HOLO_SIZE, HOLO_SIZE, HOLO_SEGS, HOLO_SEGS);
    geom.rotateX(-Math.PI / 2);

    const pos = geom.attributes.position;
    const count = pos.count;
    const slopes = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const lx = pos.getX(i);
      const lz = pos.getZ(i);
      const wx = (lx / (HOLO_SIZE * 0.5)) * (HOLO_WORLD_SPAN * 0.5);
      const wz = (lz / (HOLO_SIZE * 0.5)) * (HOLO_WORLD_SPAN * 0.5);
      const wy = getTerrainHeightAt(wx, wz, site.terrainProfile);
      pos.setY(i, wy * HOLO_HEIGHT_SCALE);
      const { slopeDeg } = getTerrainSlopeAndNormal(wx, wz, site.terrainProfile);
      slopes[i] = slopeDeg;
    }

    geom.setAttribute('aSlope', new THREE.BufferAttribute(slopes, 1));
    geom.computeVertexNormals();
    return geom;
  }, [site, terrainVersion]);

  useEffect(() => {
    return () => {
      holoGeometry.dispose();
    };
  }, [holoGeometry]);

  const holoUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uRadarProgress: { value: 0 },
      uRadarActive: { value: 0 },
      uOpacityBoost: { value: 1 },
    }),
    []
  );

  const rimfaxStripUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uIceFactor: { value: site.terrainProfile.iceFactor ?? 0.1 },
      uRadarActive: { value: 0 },
      uRadarProgress: { value: 0 },
    }),
    [site.terrainProfile.iceFactor]
  );

  // Glowing A* route line geometry on wrist hologram
  const holoRouteLine = useMemo(() => {
    if (!activeRoute || !activeRoute.points || activeRoute.points.length < 2) return null;
    const pts = activeRoute.points.map(([wx, wy, wz]) => {
      const [hx, hy, hz] = worldToHolo(wx, wz, site.terrainProfile);
      return new THREE.Vector3(hx, hy + 0.004, hz);
    });
    const geom = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color: '#34d399', transparent: true, opacity: 0.95 });
    return new THREE.Line(geom, mat);
  }, [activeRoute, site.terrainProfile]);

  useEffect(() => {
    return () => {
      if (holoRouteLine) {
        holoRouteLine.geometry.dispose();
        holoRouteLine.material.dispose();
      }
    };
  }, [holoRouteLine]);

  // Helper to compute A* safe route from current player pos to a given target
  const routeToTarget = (target) => {
    if (!target) return;
    const pos = useMissionStore.getState().telemetry.position;
    const res = computeSafeTraversePath(pos, target.position, site.terrainProfile);
    setActiveRoute({
      targetId: target.id,
      targetName: target.name,
      ...res,
    });
  };

  const handleRouteButton = (e) => {
    e.stopPropagation();
    if (activeRoute) {
      clearActiveRoute();
      return;
    }
    const pos = useMissionStore.getState().telemetry.position;
    const uncollected = site.targets.filter((t) => !siteCollectedIds.includes(t.id));
    const pool = uncollected.length > 0 ? uncollected : site.targets;
    let nearest = pool[0];
    let bestD = Infinity;
    for (let i = 0; i < pool.length; i++) {
      const d = Math.hypot(pool[i].position[0] - pos[0], pool[i].position[1] - pos[1]);
      if (d < bestD) {
        bestD = d;
        nearest = pool[i];
      }
    }
    routeToTarget(nearest);
  };

  const forwardVec = useMemo(() => new THREE.Vector3(), []);
  const targetPosVec = useMemo(() => new THREE.Vector3(), []);
  const curEuler = useMemo(() => new THREE.Euler(0, 0, 0, 'YXZ'), []);

  useFrame(({ clock }, delta) => {
    const dt = Math.min(delta, 0.05);
    const t = clock.getElapsedTime();
    const state = useMissionStore.getState();

    // 1. Sync root viewmodel rig to camera
    if (rigRootRef.current) {
      rigRootRef.current.position.copy(camera.position);
      rigRootRef.current.quaternion.copy(camera.quaternion);
    }

    // 2. Walking head-bob, pack load arm sag, & rotational inertial sway
    const dx = camera.position.x - prevCamPosRef.current.x;
    const dz = camera.position.z - prevCamPosRef.current.z;
    const speedHoriz = Math.hypot(dx, dz) / Math.max(dt, 0.001);
    prevCamPosRef.current.copy(camera.position);

    const loadRatio = Math.min(1, (state.carriedMassKg || 0) / (state.maxPackMassKg || 25));
    const walkAmt = Math.min(1, speedHoriz / 5.5);
    const swayBoost = 1.0 + loadRatio * 1.35;
    bobPhaseRef.current += dt * (walkAmt > 0.05 ? 9.5 - loadRatio * 2.8 : 1.5);
    const bobX = Math.cos(bobPhaseRef.current * 0.5) * 0.004 * walkAmt * swayBoost;
    const bobY =
      Math.abs(Math.sin(bobPhaseRef.current)) * -0.0055 * walkAmt * swayBoost +
      Math.sin(t * 1.4) * 0.0012;

    curEuler.setFromQuaternion(camera.quaternion, 'YXZ');
    const dYaw = curEuler.y - prevCamEulerRef.current.y;
    const dPitch = curEuler.x - prevCamEulerRef.current.x;
    prevCamEulerRef.current.copy(curEuler);

    swayRef.current.x = THREE.MathUtils.lerp(swayRef.current.x, THREE.MathUtils.clamp(dYaw * 0.25, -0.015, 0.015), Math.min(1, dt * 10));
    swayRef.current.y = THREE.MathUtils.lerp(swayRef.current.y, THREE.MathUtils.clamp(-dPitch * 0.25, -0.015, 0.015), Math.min(1, dt * 10));

    // 3. Smoothly lerp arm between Stowed Peripheral and Raised Inspect pose (+ downward sag under heavy pack)
    if (armGroupRef.current) {
      const stowedSagY = state.wristMapOpen ? 0 : -loadRatio * 0.026;
      const stowedSagPitch = state.wristMapOpen ? 0 : loadRatio * 0.06;

      const targetPosX = (state.wristMapOpen ? -0.105 : -0.285) + bobX + swayRef.current.x;
      const targetPosY = (state.wristMapOpen ? -0.058 : -0.225) + stowedSagY + bobY + swayRef.current.y;
      const targetPosZ = state.wristMapOpen ? -0.39 : -0.49;

      const targetRotX = (state.wristMapOpen ? 0.54 : 0.36) + stowedSagPitch;
      const targetRotY = state.wristMapOpen ? 0.14 : 0.34;
      const targetRotZ = state.wristMapOpen ? -0.03 : -0.14;

      const lerpAlpha = Math.min(1, dt * 9.0);
      armGroupRef.current.position.x = THREE.MathUtils.lerp(armGroupRef.current.position.x, targetPosX, lerpAlpha);
      armGroupRef.current.position.y = THREE.MathUtils.lerp(armGroupRef.current.position.y, targetPosY, lerpAlpha);
      armGroupRef.current.position.z = THREE.MathUtils.lerp(armGroupRef.current.position.z, targetPosZ, lerpAlpha);

      armGroupRef.current.rotation.x = THREE.MathUtils.lerp(armGroupRef.current.rotation.x, targetRotX, lerpAlpha);
      armGroupRef.current.rotation.y = THREE.MathUtils.lerp(armGroupRef.current.rotation.y, targetRotY, lerpAlpha);
      armGroupRef.current.rotation.z = THREE.MathUtils.lerp(armGroupRef.current.rotation.z, targetRotZ, lerpAlpha);
    }

    // 4. Update holographic terrain & RIMFAX shaders
    if (holoMatRef.current) {
      holoMatRef.current.uniforms.uTime.value = t;
      holoMatRef.current.uniforms.uRadarActive.value = state.radarPulse.active ? 1.0 : 0.0;
      holoMatRef.current.uniforms.uRadarProgress.value = state.radarPulse.progress;
      holoMatRef.current.uniforms.uOpacityBoost.value = state.wristMapOpen ? 1.15 : 0.85;
    }

    if (rimfaxStripMatRef.current) {
      rimfaxStripMatRef.current.uniforms.uTime.value = t;
      rimfaxStripMatRef.current.uniforms.uRadarActive.value = state.radarPulse.active ? 1.0 : state.wristMapOpen ? 0.45 : 0.0;
      rimfaxStripMatRef.current.uniforms.uRadarProgress.value = state.radarPulse.progress;
    }

    // 5. Update pulsing astronaut marker & heading cone on wrist hologram
    if (playerMarkerRef.current) {
      const [hx, hy, hz] = worldToHolo(camera.position.x, camera.position.z, site.terrainProfile);
      playerMarkerRef.current.position.set(hx, hy + 0.007, hz);
      playerMarkerRef.current.rotation.y = curEuler.y;
      const pulseScale = 0.92 + Math.sin(t * 5.0) * 0.14;
      playerMarkerRef.current.scale.set(pulseScale, pulseScale, pulseScale);
    }

    // 6. Update Helmet Headlamp spotlight & Sun Glare auto-tint factor
    camera.getWorldDirection(forwardVec);
    if (headlampRef.current) {
      targetPosVec.copy(camera.position).addScaledVector(forwardVec, 14);
      headlampTargetObj.position.copy(targetPosVec);
      headlampRef.current.target = headlampTargetObj;
    }

    const sunAlign = Math.max(0, forwardVec.dot(SUN_DIR));
    const glare = Math.pow(sunAlign, 4.5);
    if (Math.abs(glare - glareReportedRef.current) > 0.04) {
      glareReportedRef.current = glare;
      setSunGlareFactor(Number(glare.toFixed(2)));
    }

    // 7. Refresh wrist bezel physiology & SOL TIMER canvas (~2 Hz)
    bezelTimerRef.current += dt;
    if (bezelTimerRef.current >= 0.45) {
      bezelTimerRef.current = 0;
      drawBezelTelemetry();
    }
  });

  return (
    <group ref={rigRootRef}>
      {/* Helmet Headlamp Directional Spotlight */}
      <spotLight
        ref={headlampRef}
        position={[0.08, 0.12, -0.05]}
        intensity={headlampOn ? 24 : 0}
        distance={58}
        angle={0.46}
        penumbra={0.55}
        decay={1.35}
        color="#f0f8ff"
      />

      {/* Articulated xEMU Forearm + EVA Wrist Pad + Holographic Projection */}
      <group ref={armGroupRef} position={[-0.285, -0.225, -0.49]} rotation={[0.36, 0.34, -0.14]}>
        {/* NASA xEMU Pressurized Forearm Sleeve */}
        <group position={[-0.075, -0.032, 0.145]} rotation={[0.15, 0.12, 0.1]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.044, 0.056, 0.28, 16]} />
            <meshStandardMaterial color="#e2e8f0" roughness={0.55} metalness={0.08} />
          </mesh>
          {/* Orange NASA Mission Trim Band */}
          <mesh position={[0, 0, -0.055]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.0465, 0.048, 0.028, 16]} />
            <meshStandardMaterial color="#ea580c" roughness={0.42} metalness={0.12} />
          </mesh>
          {/* Anodized Wrist Disconnect Ring */}
          <mesh position={[0, 0, -0.135]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.047, 0.047, 0.022, 18]} />
            <meshStandardMaterial color="#475569" roughness={0.32} metalness={0.78} />
          </mesh>
        </group>

        {/* EVA Articulated Glove Palm & Gripping Fingers */}
        <group position={[-0.085, -0.014, 0.005]}>
          <mesh>
            <boxGeometry args={[0.052, 0.032, 0.092]} />
            <meshStandardMaterial color="#1e293b" roughness={0.75} metalness={0.15} />
          </mesh>
          {/* Thumb gripping upper-left chassis */}
          <mesh position={[0.024, 0.016, -0.028]} rotation={[0.2, 0.35, -0.3]}>
            <boxGeometry args={[0.028, 0.016, 0.042]} />
            <meshStandardMaterial color="#334155" roughness={0.72} />
          </mesh>
          {/* Lower gloved fingers supporting underside */}
          <mesh position={[0.036, -0.015, 0.018]}>
            <boxGeometry args={[0.048, 0.014, 0.068]} />
            <meshStandardMaterial color="#0f172a" roughness={0.8} />
          </mesh>
        </group>

        {/* Ruggedized EVA Wrist-Pad Chassis */}
        <group position={[0.01, 0, 0]}>
          {/* Outer Bumper Chassis */}
          <mesh>
            <boxGeometry args={[0.205, 0.016, 0.215]} />
            <meshStandardMaterial color="#1e293b" roughness={0.5} metalness={0.55} />
          </mesh>
          {/* Orange Corner Guard Accents */}
          <mesh position={[-0.098, 0.002, -0.102]}>
            <boxGeometry args={[0.018, 0.018, 0.018]} />
            <meshStandardMaterial color="#ea580c" roughness={0.45} />
          </mesh>
          <mesh position={[0.098, 0.002, -0.102]}>
            <boxGeometry args={[0.018, 0.018, 0.018]} />
            <meshStandardMaterial color="#ea580c" roughness={0.45} />
          </mesh>

          {/* Backlit Holographic Emitter Bed */}
          <mesh position={[0, 0.0085, -0.004]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.172, 0.155]} />
            <meshBasicMaterial color="#041926" />
          </mesh>

          {/* Upper Bezel Diegetic LED Micro-Telemetry Strip (O2 / SUIT PSI / SOL TIMER) */}
          <mesh position={[0, 0.0095, -0.093]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.178, 0.026]} />
            <meshBasicMaterial map={bezelTexture} />
          </mesh>

          {/* Lower Bezel Tactile Interactive Strip */}
          <mesh position={[0, 0.0095, 0.088]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.178, 0.022]} />
            <meshBasicMaterial map={buttonsTexture} />
          </mesh>

          {/* Clickable 3D Hit Zones over Lower Bezel Buttons */}
          <mesh
            position={[-0.059, 0.012, 0.088]}
            onClick={handleRouteButton}
            onPointerOver={() => {
              document.body.style.cursor = 'pointer';
            }}
            onPointerOut={() => {
              document.body.style.cursor = 'auto';
            }}
          >
            <boxGeometry args={[0.056, 0.01, 0.022]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
          <mesh
            position={[0, 0.012, 0.088]}
            onClick={(e) => {
              e.stopPropagation();
              const pos = useMissionStore.getState().telemetry.position;
              const y = getTerrainHeightAt(pos[0], pos[1], site.terrainProfile);
              triggerRadarPulse([pos[0], y, pos[1]]);
            }}
            onPointerOver={() => {
              document.body.style.cursor = 'pointer';
            }}
            onPointerOut={() => {
              document.body.style.cursor = 'auto';
            }}
          >
            <boxGeometry args={[0.056, 0.01, 0.022]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
          <mesh
            position={[0.059, 0.012, 0.088]}
            onClick={(e) => {
              e.stopPropagation();
              toggleHeadlamp();
            }}
            onPointerOver={() => {
              document.body.style.cursor = 'pointer';
            }}
            onPointerOut={() => {
              document.body.style.cursor = 'auto';
            }}
          >
            <boxGeometry args={[0.056, 0.01, 0.022]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>

          {/* 3D HOLOGRAPHIC TERRAIN PROJECTION (Floating ~8cm above wrist screen) */}
          <group position={[0, 0.072, -0.004]}>
            {/* Translucent Emitter Projection Cone */}
            <mesh position={[0, -0.032, 0]}>
              <cylinderGeometry args={[0.085, 0.068, 0.064, 4, 1, true]} />
              <meshBasicMaterial
                color="#0ea5e9"
                transparent
                opacity={wristMapOpen ? 0.1 : 0.04}
                side={THREE.DoubleSide}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </mesh>

            {/* Holographic Terrain Mesh */}
            <mesh geometry={holoGeometry}>
              <shaderMaterial
                ref={holoMatRef}
                vertexShader={HOLO_VERTEX_SHADER}
                fragmentShader={HOLO_FRAGMENT_SHADER}
                uniforms={holoUniforms}
                transparent
                blending={THREE.AdditiveBlending}
                depthWrite={false}
                side={THREE.DoubleSide}
              />
            </mesh>

            {/* RIMFAX Subsurface Cross-Section Strip along front edge */}
            <mesh position={[0, -0.014, HOLO_SIZE * 0.5]}>
              <planeGeometry args={[HOLO_SIZE, 0.026]} />
              <shaderMaterial
                ref={rimfaxStripMatRef}
                vertexShader={RIMFAX_STRIP_VERTEX}
                fragmentShader={RIMFAX_STRIP_FRAGMENT}
                uniforms={rimfaxStripUniforms}
                transparent
                blending={THREE.AdditiveBlending}
                depthWrite={false}
                side={THREE.DoubleSide}
              />
            </mesh>

            {/* Active A* Safe Route Line on Hologram */}
            {holoRouteLine && <primitive object={holoRouteLine} />}

            {/* Real-Time Pulsing White Astronaut Marker + Heading Cone */}
            <group ref={playerMarkerRef}>
              <mesh>
                <sphereGeometry args={[0.0048, 12, 12]} />
                <meshBasicMaterial color="#ffffff" />
              </mesh>
              <mesh position={[0, 0, -0.0075]} rotation={[-Math.PI / 2, 0, 0]}>
                <coneGeometry args={[0.0036, 0.0085, 8]} />
                <meshBasicMaterial color="#38bdf8" />
              </mesh>
            </group>

            {/* Color-Coded Interactive Geological Target Pins on Hologram */}
            {site.targets.map((target) => {
              const collected = siteCollectedIds.includes(target.id);
              const isRouted = activeRoute?.targetId === target.id;
              const [hx, hy, hz] = worldToHolo(target.position[0], target.position[1], site.terrainProfile);
              const pinColor = collected ? '#10b981' : isRouted ? '#38bdf8' : '#fbbf24';

              return (
                <group key={target.id} position={[hx, hy, hz]}>
                  {/* Invisible generous hit sphere for effortless clicking in Inspect Mode */}
                  <mesh
                    position={[0, 0.012, 0]}
                    onClick={(e) => {
                      e.stopPropagation();
                      routeToTarget(target);
                    }}
                    onPointerOver={(e) => {
                      e.stopPropagation();
                      document.body.style.cursor = 'pointer';
                    }}
                    onPointerOut={() => {
                      document.body.style.cursor = 'auto';
                    }}
                  >
                    <sphereGeometry args={[0.016, 10, 10]} />
                    <meshBasicMaterial transparent opacity={0} depthWrite={false} />
                  </mesh>

                  {/* Pin Stem */}
                  <mesh position={[0, 0.009, 0]}>
                    <cylinderGeometry args={[0.0008, 0.0012, 0.018, 6]} />
                    <meshBasicMaterial color={pinColor} />
                  </mesh>
                  {/* Pin Head */}
                  <mesh position={[0, 0.019, 0]}>
                    <octahedronGeometry args={[isRouted ? 0.0052 : 0.004, 0]} />
                    <meshBasicMaterial color={pinColor} />
                  </mesh>
                  {/* Base Ring */}
                  <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                    <ringGeometry args={[0.005, 0.0072, 16]} />
                    <meshBasicMaterial color={pinColor} transparent opacity={0.85} side={THREE.DoubleSide} />
                  </mesh>
                  {/* Unexplored Mars Frontier Halo Ring on targets the rover hasn't visited */}
                  {!target.roverExplored && !collected && (
                    <mesh position={[0, 0.0024, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                      <ringGeometry args={[0.008, 0.0098, 16]} />
                      <meshBasicMaterial color="#a855f7" transparent opacity={0.85} side={THREE.DoubleSide} />
                    </mesh>
                  )}
                </group>
              );
            })}

            {/* NASA Rover Pinpoint Marker & Explored/Unexplored Sector Rings on Hologram */}
            {rover &&
              (() => {
                const [rx, ry, rz] = worldToHolo(
                  rover.position[0],
                  rover.position[1],
                  site.terrainProfile
                );
                const [ex, ey, ez] = worldToHolo(
                  rover.exploredCenter[0],
                  rover.exploredCenter[1],
                  site.terrainProfile
                );
                const exploredHoloR =
                  (rover.exploredRadius / (HOLO_WORLD_SPAN * 0.5)) * (HOLO_SIZE * 0.5);
                const [ux, uy, uz] = worldToHolo(
                  rover.unexploredSector.center[0],
                  rover.unexploredSector.center[1],
                  site.terrainProfile
                );
                const unexploredHoloR =
                  (rover.unexploredSector.radius / (HOLO_WORLD_SPAN * 0.5)) * (HOLO_SIZE * 0.5);
                const roverColor = isRoverDiscovered ? '#22d3ee' : '#f59e0b';

                return (
                  <group>
                    {/* Rover Explored Zone Ring */}
                    <mesh position={[ex, ey + 0.002, ez]} rotation={[-Math.PI / 2, 0, 0]}>
                      <ringGeometry args={[exploredHoloR - 0.0012, exploredHoloR, 32]} />
                      <meshBasicMaterial
                        color="#22d3ee"
                        transparent
                        opacity={isRoverDiscovered ? 0.55 : 0.2}
                        side={THREE.DoubleSide}
                      />
                    </mesh>

                    {/* Unexplored Frontier Sector Ring (revealed once rover is pinned) */}
                    {isRoverDiscovered && (
                      <mesh position={[ux, uy + 0.002, uz]} rotation={[-Math.PI / 2, 0, 0]}>
                        <ringGeometry args={[unexploredHoloR - 0.0014, unexploredHoloR, 32]} />
                        <meshBasicMaterial
                          color="#a855f7"
                          transparent
                          opacity={0.62}
                          side={THREE.DoubleSide}
                        />
                      </mesh>
                    )}

                    {/* Clickable NASA Rover Pinpoint Marker */}
                    <group position={[rx, ry, rz]}>
                      <mesh
                        position={[0, 0.01, 0]}
                        onClick={(e) => {
                          e.stopPropagation();
                          discoverRover(site.id);
                          routeToTarget({
                            id: rover.id,
                            name: rover.name,
                            position: rover.position,
                          });
                        }}
                        onPointerOver={(e) => {
                          e.stopPropagation();
                          document.body.style.cursor = 'pointer';
                        }}
                        onPointerOut={() => {
                          document.body.style.cursor = 'auto';
                        }}
                      >
                        <sphereGeometry args={[0.015, 10, 10]} />
                        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
                      </mesh>
                      <mesh position={[0, 0.005, 0]}>
                        <boxGeometry args={[0.0065, 0.004, 0.0085]} />
                        <meshBasicMaterial color={roverColor} />
                      </mesh>
                      <mesh position={[0, 0.016, 0]}>
                        <octahedronGeometry args={[0.0038, 0]} />
                        <meshBasicMaterial color={roverColor} />
                      </mesh>
                      <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                        <ringGeometry args={[0.006, 0.0082, 16]} />
                        <meshBasicMaterial
                          color={roverColor}
                          transparent
                          opacity={0.85}
                          side={THREE.DoubleSide}
                        />
                      </mesh>
                    </group>
                  </group>
                );
              })()}

            {/* Custom / Unexplored Pinpoint Marker on Hologram */}
            {customPinpoint?.position &&
              (() => {
                const [px, py, pz] = worldToHolo(
                  customPinpoint.position[0],
                  customPinpoint.position[1],
                  site.terrainProfile
                );
                return (
                  <group position={[px, py, pz]}>
                    <mesh position={[0, 0.011, 0]}>
                      <cylinderGeometry args={[0.0007, 0.001, 0.022, 6]} />
                      <meshBasicMaterial color="#c084fc" />
                    </mesh>
                    <mesh position={[0, 0.023, 0]}>
                      <octahedronGeometry args={[0.0046, 0]} />
                      <meshBasicMaterial color="#e879f9" />
                    </mesh>
                  </group>
                );
              })()}

            {/* Miniature Mars Lander Base Marker at (0, 8) — click to route back to airlock */}
            {(() => {
              const [lx, ly, lz] = worldToHolo(0, 8, site.terrainProfile);
              const isRoutedLander = activeRoute?.targetId === 'lander-base';
              const landerColor = isRoutedLander ? '#34d399' : '#f59e0b';
              return (
                <group position={[lx, ly, lz]}>
                  <mesh
                    position={[0, 0.009, 0]}
                    onClick={(e) => {
                      e.stopPropagation();
                      routeToTarget({
                        id: 'lander-base',
                        name: 'ARES-V Lander Airlock',
                        position: [0, 5.95],
                      });
                    }}
                    onPointerOver={(e) => {
                      e.stopPropagation();
                      document.body.style.cursor = 'pointer';
                    }}
                    onPointerOut={() => {
                      document.body.style.cursor = 'auto';
                    }}
                  >
                    <sphereGeometry args={[0.016, 10, 10]} />
                    <meshBasicMaterial transparent opacity={0} depthWrite={false} />
                  </mesh>
                  <mesh position={[0, 0.005, 0]}>
                    <cylinderGeometry args={[0.0038, 0.0056, 0.007, 8]} />
                    <meshBasicMaterial color={landerColor} />
                  </mesh>
                  <mesh position={[0, 0.011, 0]}>
                    <coneGeometry args={[0.0032, 0.0055, 8]} />
                    <meshBasicMaterial color="#e2e8f0" />
                  </mesh>
                  <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                    <ringGeometry args={[0.0062, 0.0085, 16]} />
                    <meshBasicMaterial color="#38bdf8" transparent opacity={0.8} side={THREE.DoubleSide} />
                  </mesh>
                </group>
              );
            })()}
          </group>
        </group>
      </group>
    </group>
  );
}
