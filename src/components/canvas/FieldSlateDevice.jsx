import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { EVA_LAYERS } from '../../data/landingZones';
import { useMissionStore } from '../../store/useMissionStore';
import { generateSectorHeatmap } from '../../utils/heatmapGenerator';
import { computeSafeTraversePath } from '../../utils/pathfinding';
import { getMarsAlbedoCrop, loadMarsAlbedoImage } from '../../utils/roverPathLoader';
import {
  CHUNK_SIZE,
  MAP_3X3_RANGE,
  MAP_3X3_SPAN,
  getActive3x3Chunks,
  worldToChunk,
} from '../../utils/terrainMath';

const SUN_DIR = new THREE.Vector3(35, 28, 22).normalize();

function formatSolTime(msElapsed) {
  const totalSec = Math.max(0, Math.floor(msElapsed / 1000));
  const hrs = String(Math.floor(totalSec / 3600)).padStart(2, '0');
  const mins = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
  const secs = String(totalSec % 60).padStart(2, '0');
  return `${hrs}:${mins}:${secs}`;
}

export default function FieldSlateDevice({ site, terrainVersion }) {
  const { camera } = useThree();

  const rigRootRef = useRef();
  const armGroupRef = useRef();
  const headlampRef = useRef();
  const headlampTargetObj = useMemo(() => new THREE.Object3D(), []);

  const prevCamPosRef = useRef(new THREE.Vector3());
  const prevCamEulerRef = useRef(new THREE.Euler(0, 0, 0, 'YXZ'));
  const bobPhaseRef = useRef(0);
  const swayRef = useRef({ x: 0, y: 0 });
  const glareReportedRef = useRef(0);
  const bezelTimerRef = useRef(0);

  const evaLayer = useMissionStore((s) => s.evaLayer);
  const headlampOn = useMissionStore((s) => s.headlampOn);
  const activeRoute = useMissionStore((s) => s.activeRoute);
  const radarPulse = useMissionStore((s) => s.radarPulse);
  const evaStartTime = useMissionStore((s) => s.evaStartTime);
  const playerPos = useMissionStore((s) => s.telemetry.position);

  const setEvaLayer = useMissionStore((s) => s.setEvaLayer);
  const setSunGlareFactor = useMissionStore((s) => s.setSunGlareFactor);

  const rover = site?.nasaRover;
  const [albedoImg, setAlbedoImg] = useState(null);

  useEffect(() => {
    let active = true;
    loadMarsAlbedoImage((img) => {
      if (active && img) setAlbedoImg(img);
    });
    return () => {
      active = false;
    };
  }, []);

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

  // Precompute Curiosity-style obstacle-avoiding traverse loop connecting Lander -> Science Stations
  const masterTraverseLoop = useMemo(() => {
    void terrainVersion;
    const waypoints = [[0, 6.2], ...site.targets.map((t) => t.position)];
    const stitched = [];
    for (let i = 0; i < waypoints.length - 1; i++) {
      const seg = computeSafeTraversePath(waypoints[i], waypoints[i + 1], site.terrainProfile);
      for (let j = 0; j < seg.points.length; j++) {
        if (i > 0 && j === 0) continue;
        stitched.push(seg.points[j]);
      }
    }
    return stitched;
  }, [site, terrainVersion]);

  // Dynamic CanvasTextures: Top Bezel Telemetry, Embedded Slate Screen (Peripheral Route + Heading), & Lower NASA Layer Switches
  const { bezelCanvas, bezelTexture } = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 96;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return { bezelCanvas: canvas, bezelTexture: tex };
  }, []);

  const { glassCanvas, glassTexture } = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return { glassCanvas: canvas, glassTexture: tex };
  }, []);

  const { layerSwitchesCanvas, layerSwitchesTexture } = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 72;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return { layerSwitchesCanvas: canvas, layerSwitchesTexture: tex };
  }, []);

  const hmCenterX = Math.round((playerPos?.[0] ?? 0) / 3) * 3;
  const hmCenterZ = Math.round((playerPos?.[1] ?? 0) / 3) * 3;
  const sectorHeatmap = useMemo(() => {
    void terrainVersion;
    return generateSectorHeatmap(site, evaLayer, rover, rover?.traversePoints || [], [
      hmCenterX,
      hmCenterZ,
    ]);
  }, [site, evaLayer, rover, terrainVersion, hmCenterX, hmCenterZ]);

  const drawSlateTextures = useMemo(() => {
    return () => {
      const state = useMissionStore.getState();
      const elapsed = state.evaStartTime ? Date.now() - state.evaStartTime : 0;
      const phys = state.physiology;
      const packMass = state.carriedMassKg ?? 0;
      const maxMass = state.maxPackMassKg ?? 25;
      const activeLayer = state.evaLayer;

      // 1. Top Bezel Telemetry Strip
      const bCtx = bezelCanvas.getContext('2d');
      bCtx.fillStyle = '#060b14';
      bCtx.fillRect(0, 0, 512, 96);
      bCtx.strokeStyle =
        phys.oxygen < 25
          ? 'rgba(248, 113, 113, 0.8)'
          : phys.bodyTempC < 35.8
            ? 'rgba(56, 189, 248, 0.78)'
            : 'rgba(34, 211, 238, 0.5)';
      bCtx.lineWidth = 2;
      bCtx.strokeRect(2, 2, 508, 92);

      bCtx.font = 'bold 16px monospace';
      bCtx.textAlign = 'left';
      bCtx.fillStyle = '#38bdf8';
      bCtx.fillText('ARES-V FIELD SLATE', 12, 28);

      bCtx.textAlign = 'right';
      bCtx.fillStyle = '#fbbf24';
      bCtx.fillText(`SOL ${formatSolTime(elapsed)}`, 500, 28);

      bCtx.fillStyle = 'rgba(255,255,255,0.12)';
      bCtx.fillRect(12, 40, 488, 1);

      bCtx.font = 'bold 16px monospace';
      bCtx.textAlign = 'left';
      bCtx.fillStyle = phys.oxygen < 30 ? '#f87171' : '#67e8f9';
      bCtx.fillText(`O2:${Math.round(phys.oxygen)}%`, 12, 74);

      bCtx.fillStyle = phys.bodyTempC < 35.8 ? '#38bdf8' : '#e2e8f0';
      bCtx.fillText(`T:${phys.bodyTempC.toFixed(1)}C`, 115, 74);

      bCtx.fillStyle = phys.stamina < 30 ? '#fb7185' : '#34d399';
      bCtx.fillText(`STM:${Math.round(phys.stamina)}%`, 228, 74);

      bCtx.textAlign = 'right';
      bCtx.fillStyle = packMass >= maxMass * 0.75 ? '#fbbf24' : '#cbd5e1';
      bCtx.fillText(`PACK:${packMass.toFixed(1)}/${maxMass}KG`, 500, 74);
      bezelTexture.needsUpdate = true;

      // 2. Embedded Slate Glass Screen (Player-Following 3x3 Chunks, Mars Albedo Ref, Translucent Heatmap)
      const gCtx = glassCanvas.getContext('2d');
      const pPos = state.telemetry.position || [0, 0];
      const mapToCanvas = (wx, wz) => [
        ((wx - pPos[0] + MAP_3X3_RANGE) / MAP_3X3_SPAN) * 512,
        ((wz - pPos[1] + MAP_3X3_RANGE) / MAP_3X3_SPAN) * 512,
      ];

      gCtx.fillStyle = '#03111c';
      gCtx.fillRect(0, 0, 512, 512);

      // Regional crop of NASA /textures/mars_albedo.jpg panning 1:1 with player
      if (albedoImg && albedoImg.naturalWidth > 0) {
        const crop = getMarsAlbedoCrop(site.lat, site.lon, 0.1, 0.2, site.marsTrekBookmark?.extent);
        const destW = 512 / crop.uSpan;
        const destH = 512 / crop.vSpan;
        const destX = -crop.u0 * destW - (pPos[0] / MAP_3X3_SPAN) * 512;
        const destY = -crop.v0 * destH - (pPos[1] / MAP_3X3_SPAN) * 512;
        gCtx.save();
        gCtx.globalAlpha = 0.86;
        gCtx.drawImage(albedoImg, destX, destY, destW, destH);
        gCtx.restore();
      }

      const [hmLeftCanvas, hmTopCanvas] = mapToCanvas(
        sectorHeatmap.centerXZ[0] - sectorHeatmap.worldRange,
        sectorHeatmap.centerXZ[1] - sectorHeatmap.worldRange
      );
      const hmCanvasSize = (sectorHeatmap.worldSpan / MAP_3X3_SPAN) * 512;

      // Translucent continuous raster heatmap overlay + organic isolines
      if (sectorHeatmap?.canvas) {
        gCtx.save();
        gCtx.globalAlpha = 0.52;
        gCtx.drawImage(sectorHeatmap.canvas, hmLeftCanvas, hmTopCanvas, hmCanvasSize, hmCanvasSize);
        gCtx.restore();
      }

      if (typeof Path2D !== 'undefined') {
        const svgTo512 = 512 / 220;
        gCtx.save();
        gCtx.translate(hmLeftCanvas, hmTopCanvas);
        gCtx.scale(svgTo512, svgTo512);
        if (sectorHeatmap?.expContourPath) {
          gCtx.strokeStyle = 'rgba(34, 211, 238, 0.5)';
          gCtx.lineWidth = 0.8;
          gCtx.setLineDash([3, 2.5]);
          gCtx.stroke(new Path2D(sectorHeatmap.expContourPath));
        }
        if (state.discoveredRovers?.[site.id] && sectorHeatmap?.unexpContourPath) {
          gCtx.strokeStyle = 'rgba(232, 121, 249, 0.68)';
          gCtx.lineWidth = 0.9;
          gCtx.setLineDash([3.5, 2]);
          gCtx.stroke(new Path2D(sectorHeatmap.unexpContourPath));
        }
        gCtx.restore();
      }

      // 3x3 Chunk Grid borders around player's active chunk
      const [curCx, curCz] = worldToChunk(pPos[0], pPos[1]);
      const chunks3x3 = getActive3x3Chunks(pPos[0], pPos[1]);
      const chunkPx = (CHUNK_SIZE / MAP_3X3_SPAN) * 512;
      chunks3x3.forEach((ch) => {
        const [cl, ct] = mapToCanvas(ch.minX, ch.minZ);
        const isCenter = ch.cx === curCx && ch.cz === curCz;
        gCtx.strokeStyle = isCenter ? 'rgba(56, 189, 248, 0.52)' : 'rgba(148, 163, 184, 0.22)';
        gCtx.lineWidth = isCenter ? 1.8 : 1;
        gCtx.strokeRect(cl, ct, chunkPx, chunkPx);
      });

      // Actual NASA Rover Traverse Path in Green (#22c55e) with Bright Green Highlight
      if (rover?.traversePoints?.length >= 2) {
        gCtx.save();
        gCtx.lineCap = 'round';
        gCtx.lineJoin = 'round';
        gCtx.beginPath();
        rover.traversePoints.forEach(([wx, wz], idx) => {
          const [cx, cy] = mapToCanvas(wx, wz);
          if (idx === 0) gCtx.moveTo(cx, cy);
          else gCtx.lineTo(cx, cy);
        });
        gCtx.strokeStyle = 'rgba(74, 222, 128, 0.45)';
        gCtx.lineWidth = 10;
        gCtx.stroke();

        gCtx.strokeStyle = '#22c55e';
        gCtx.lineWidth = 4;
        gCtx.stroke();

        gCtx.strokeStyle = '#86efac';
        gCtx.lineWidth = 1.6;
        gCtx.setLineDash([10, 6]);
        gCtx.stroke();
        gCtx.restore();
      }

      // Actual NASA Rover Landing Site (Sol 0) in Yellow (#facc15)
      const rLanding = rover?.landingPosition || rover?.traversePoints?.[0];
      if (rLanding) {
        const [ylx, yly] = mapToCanvas(rLanding[0], rLanding[1]);
        gCtx.save();
        gCtx.fillStyle = 'rgba(250, 204, 21, 0.25)';
        gCtx.strokeStyle = '#fde047';
        gCtx.lineWidth = 2.5;
        gCtx.beginPath();
        gCtx.arc(ylx, yly, 12, 0, Math.PI * 2);
        gCtx.fill();
        gCtx.stroke();

        gCtx.fillStyle = '#facc15';
        gCtx.beginPath();
        gCtx.moveTo(ylx, yly - 8);
        gCtx.lineTo(ylx + 8, yly);
        gCtx.lineTo(ylx, yly + 8);
        gCtx.lineTo(ylx - 8, yly);
        gCtx.closePath();
        gCtx.fill();
        gCtx.restore();
      }

      // Curiosity-style dashed cyan master traverse route
      if (masterTraverseLoop.length >= 2) {
        gCtx.save();
        gCtx.strokeStyle = 'rgba(34, 211, 238, 0.65)';
        gCtx.lineWidth = 4;
        gCtx.setLineDash([12, 8]);
        gCtx.beginPath();
        masterTraverseLoop.forEach(([wx, , wz], idx) => {
          const [cx, cy] = mapToCanvas(wx, wz);
          if (idx === 0) gCtx.moveTo(cx, cy);
          else gCtx.lineTo(cx, cy);
        });
        gCtx.stroke();
        gCtx.restore();
      }

      // Active highlighted A* route if one is set
      if (state.activeRoute?.points?.length >= 2) {
        gCtx.save();
        gCtx.strokeStyle = '#38bdf8';
        gCtx.lineWidth = 6;
        gCtx.setLineDash([14, 6]);
        gCtx.beginPath();
        state.activeRoute.points.forEach(([wx, , wz], idx) => {
          const [cx, cy] = mapToCanvas(wx, wz);
          if (idx === 0) gCtx.moveTo(cx, cy);
          else gCtx.lineTo(cx, cy);
        });
        gCtx.stroke();
        gCtx.restore();
      }

      // Science station pips
      const collectedList = state.collectedSamples[site.id] || [];
      let nextWp = null;
      let nextDist = Infinity;

      site.targets.forEach((tgt) => {
        const done = collectedList.includes(tgt.id);
        const [tx, ty] = mapToCanvas(tgt.position[0], tgt.position[1]);
        gCtx.fillStyle = done ? '#10b981' : tgt.roverExplored ? '#fbbf24' : '#c084fc';
        gCtx.beginPath();
        gCtx.arc(tx, ty, 8, 0, Math.PI * 2);
        gCtx.fill();

        if (!done) {
          const d = Math.hypot(tgt.position[0] - pPos[0], tgt.position[1] - pPos[1]);
          if (d < nextDist) {
            nextDist = d;
            nextWp = tgt;
          }
        }
      });

      // Lander marker
      const [lx, ly] = mapToCanvas(0, 8);
      gCtx.fillStyle = '#38bdf8';
      gCtx.beginPath();
      gCtx.moveTo(lx, ly - 12);
      gCtx.lineTo(lx + 11, ly + 9);
      gCtx.lineTo(lx - 11, ly + 9);
      gCtx.closePath();
      gCtx.fill();

      // Player heading arrow
      const [pxc, pyc] = mapToCanvas(pPos[0], pPos[1]);
      const hdgRad = ((state.telemetry.heading || 0) * Math.PI) / 180;
      gCtx.save();
      gCtx.translate(pxc, pyc);
      gCtx.rotate(hdgRad);
      gCtx.fillStyle = '#ffffff';
      gCtx.beginPath();
      gCtx.moveTo(0, -14);
      gCtx.lineTo(10, 11);
      gCtx.lineTo(0, 5);
      gCtx.lineTo(-10, 11);
      gCtx.closePath();
      gCtx.fill();
      gCtx.restore();

      // Bottom Stowed Info Ribbon on Device Glass
      gCtx.fillStyle = 'rgba(2, 6, 23, 0.88)';
      gCtx.fillRect(0, 444, 512, 68);
      gCtx.fillStyle = '#22d3ee';
      gCtx.font = 'bold 20px monospace';
      gCtx.textAlign = 'left';
      const wpLabel = state.activeRoute
        ? `WPT: ${Math.round(state.activeRoute.distanceMeters)}m`
        : nextWp
          ? `NEXT: ${nextWp.code} · ${nextDist.toFixed(0)}m`
          : 'ALL STATIONS CORED';
      gCtx.fillText(wpLabel, 14, 486);

      gCtx.textAlign = 'right';
      gCtx.fillStyle = '#bae6fd';
      gCtx.fillText(`HDG ${String(state.telemetry.heading ?? 0).padStart(3, '0')}°`, 498, 486);
      glassTexture.needsUpdate = true;

      // 3. Lower 4-Bezel NASA Data Layer Switches Texture
      const sCtx = layerSwitchesCanvas.getContext('2d');
      sCtx.fillStyle = '#070b14';
      sCtx.fillRect(0, 0, 512, 72);

      const switchColors = ['#38bdf8', '#fbbf24', '#34d399', '#c084fc'];
      EVA_LAYERS.forEach((layer, idx) => {
        const isActive = activeLayer === layer.id;
        const x = 6 + idx * 126;
        const w = 120;
        sCtx.fillStyle = isActive ? 'rgba(14, 165, 233, 0.28)' : 'rgba(15, 23, 42, 0.92)';
        sCtx.fillRect(x, 6, w, 60);
        sCtx.strokeStyle = isActive ? switchColors[idx] : 'rgba(148, 163, 184, 0.35)';
        sCtx.lineWidth = isActive ? 3 : 1.5;
        sCtx.strokeRect(x + 1, 7, w - 2, 58);

        sCtx.fillStyle = isActive ? '#ffffff' : switchColors[idx];
        sCtx.font = 'bold 15px monospace';
        sCtx.textAlign = 'center';
        sCtx.fillText(`[${layer.key}] ${layer.shortLabel}`, x + w / 2, 34);

        sCtx.fillStyle = isActive ? switchColors[idx] : '#64748b';
        sCtx.font = '11px monospace';
        sCtx.fillText(isActive ? '● ACTIVE' : 'STANDBY', x + w / 2, 54);
      });
      layerSwitchesTexture.needsUpdate = true;
    };
  }, [
    bezelCanvas,
    bezelTexture,
    glassCanvas,
    glassTexture,
    layerSwitchesCanvas,
    layerSwitchesTexture,
    masterTraverseLoop,
    site,
    rover,
    albedoImg,
    sectorHeatmap,
  ]);

  useEffect(() => {
    drawSlateTextures();
  }, [
    drawSlateTextures,
    evaLayer,
    headlampOn,
    activeRoute,
    radarPulse.active,
    evaStartTime,
    albedoImg,
    playerPos,
  ]);

  useEffect(() => {
    return () => {
      bezelTexture.dispose();
      glassTexture.dispose();
      layerSwitchesTexture.dispose();
    };
  }, [bezelTexture, glassTexture, layerSwitchesTexture]);

  const forwardVec = useMemo(() => new THREE.Vector3(), []);
  const targetPosVec = useMemo(() => new THREE.Vector3(), []);
  const curEuler = useMemo(() => new THREE.Euler(0, 0, 0, 'YXZ'), []);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const state = useMissionStore.getState();

    // 1. Sync root viewmodel rig to camera
    if (rigRootRef.current) {
      rigRootRef.current.position.copy(camera.position);
      rigRootRef.current.quaternion.copy(camera.quaternion);
    }

    // 2. Walking head-bob, heavy pack sag, & rotational inertial sway
    const dx = camera.position.x - prevCamPosRef.current.x;
    const dz = camera.position.z - prevCamPosRef.current.z;
    const speedHoriz = Math.hypot(dx, dz) / Math.max(dt, 0.001);
    prevCamPosRef.current.copy(camera.position);

    const loadRatio = Math.min(1, (state.carriedMassKg || 0) / (state.maxPackMassKg || 25));
    const walkAmt = Math.min(1, speedHoriz / 5.5);
    const swayBoost = 1.0 + loadRatio * 0.4;
    bobPhaseRef.current += dt * (walkAmt > 0.05 ? 9.5 - loadRatio * 0.85 : 1.5);
    const bobX = Math.cos(bobPhaseRef.current * 0.5) * 0.0018 * walkAmt * swayBoost;
    const bobY = Math.abs(Math.sin(bobPhaseRef.current)) * -0.0022 * walkAmt * swayBoost;

    curEuler.setFromQuaternion(camera.quaternion, 'YXZ');
    const dYaw = curEuler.y - prevCamEulerRef.current.y;
    const dPitch = curEuler.x - prevCamEulerRef.current.x;
    prevCamEulerRef.current.copy(curEuler);

    swayRef.current.x = THREE.MathUtils.lerp(
      swayRef.current.x,
      THREE.MathUtils.clamp(dYaw * 0.25, -0.015, 0.015),
      Math.min(1, dt * 10)
    );
    swayRef.current.y = THREE.MathUtils.lerp(
      swayRef.current.y,
      THREE.MathUtils.clamp(-dPitch * 0.25, -0.015, 0.015),
      Math.min(1, dt * 10)
    );

    // 3. Hide held 3D Field Slate when centered enlarged map is open; otherwise lerp forearm pose cleanly
    if (armGroupRef.current) {
      armGroupRef.current.visible = !state.wristMapOpen;
      const stowedSagY = state.wristMapOpen ? 0 : -loadRatio * 0.0075;
      const stowedSagPitch = state.wristMapOpen ? 0 : loadRatio * 0.018;

      const targetPosX = (state.wristMapOpen ? -0.155 : -0.275) + bobX + swayRef.current.x;
      const targetPosY =
        (state.wristMapOpen ? -0.055 : -0.215) + stowedSagY + bobY + swayRef.current.y;
      const targetPosZ = state.wristMapOpen ? -0.38 : -0.48;

      const targetRotX = (state.wristMapOpen ? 0.52 : 0.38) + stowedSagPitch;
      const targetRotY = state.wristMapOpen ? 0.16 : 0.34;
      const targetRotZ = state.wristMapOpen ? -0.03 : -0.14;

      const lerpAlpha = Math.min(1, dt * 9.0);
      armGroupRef.current.position.x = THREE.MathUtils.lerp(armGroupRef.current.position.x, targetPosX, lerpAlpha);
      armGroupRef.current.position.y = THREE.MathUtils.lerp(armGroupRef.current.position.y, targetPosY, lerpAlpha);
      armGroupRef.current.position.z = THREE.MathUtils.lerp(armGroupRef.current.position.z, targetPosZ, lerpAlpha);

      armGroupRef.current.rotation.x = THREE.MathUtils.lerp(armGroupRef.current.rotation.x, targetRotX, lerpAlpha);
      armGroupRef.current.rotation.y = THREE.MathUtils.lerp(armGroupRef.current.rotation.y, targetRotY, lerpAlpha);
      armGroupRef.current.rotation.z = THREE.MathUtils.lerp(armGroupRef.current.rotation.z, targetRotZ, lerpAlpha);
    }

    // 4. Update Helmet Headlamp spotlight & Sun Glare auto-tint factor
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

    // 5. Refresh Slate Bezel & Peripheral Glass CanvasTextures (~3 Hz)
    bezelTimerRef.current += dt;
    if (bezelTimerRef.current >= 0.32) {
      bezelTimerRef.current = 0;
      drawSlateTextures();
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

      {/* Articulated xEMU Forearm + ARES-V Field Slate Device + Hologram */}
      <group ref={armGroupRef} position={[-0.275, -0.215, -0.48]} rotation={[0.38, 0.34, -0.14]}>
        {/* NASA xEMU Pressurized Forearm Sleeve */}
        <group position={[-0.075, -0.032, 0.145]} rotation={[0.15, 0.12, 0.1]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.044, 0.056, 0.28, 16]} />
            <meshStandardMaterial color="#e2e8f0" roughness={0.55} metalness={0.08} />
          </mesh>
          <mesh position={[0, 0, -0.055]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.0465, 0.048, 0.028, 16]} />
            <meshStandardMaterial color="#ea580c" roughness={0.42} metalness={0.12} />
          </mesh>
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
          <mesh position={[0.024, 0.016, -0.028]} rotation={[0.2, 0.35, -0.3]}>
            <boxGeometry args={[0.028, 0.016, 0.042]} />
            <meshStandardMaterial color="#334155" roughness={0.72} />
          </mesh>
          <mesh position={[0.036, -0.015, 0.018]}>
            <boxGeometry args={[0.048, 0.014, 0.068]} />
            <meshStandardMaterial color="#0f172a" roughness={0.8} />
          </mesh>
        </group>

        {/* Ruggedized NASA ARES-V Field Slate Chassis */}
        <group position={[0.01, 0, 0]}>
          <mesh>
            <boxGeometry args={[0.215, 0.016, 0.228]} />
            <meshStandardMaterial color="#1e293b" roughness={0.5} metalness={0.55} />
          </mesh>
          {/* Titanium / NASA Orange Corner Guards */}
          <mesh position={[-0.102, 0.002, -0.108]}>
            <boxGeometry args={[0.019, 0.019, 0.019]} />
            <meshStandardMaterial color="#ea580c" roughness={0.45} />
          </mesh>
          <mesh position={[0.102, 0.002, -0.108]}>
            <boxGeometry args={[0.019, 0.019, 0.019]} />
            <meshStandardMaterial color="#ea580c" roughness={0.45} />
          </mesh>

          {/* Live Backlit Glass Screen (Stowed Curiosity Route + Heading Arrow + Waypoint Distance) */}
          <mesh position={[0, 0.0088, -0.003]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.175, 0.16]} />
            <meshBasicMaterial map={glassTexture} />
          </mesh>

          {/* Upper Bezel Diegetic LED Readout Strip */}
          <mesh position={[0, 0.0095, -0.097]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.184, 0.026]} />
            <meshBasicMaterial map={bezelTexture} />
          </mesh>

          {/* Lower Bezel 4 Toggleable NASA Data-Layer Switches */}
          <mesh position={[0, 0.0095, 0.094]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.186, 0.026]} />
            <meshBasicMaterial map={layerSwitchesTexture} />
          </mesh>

          {/* Clickable 3D Bezel Hitboxes for all 4 NASA Data Layer Switches */}
          {EVA_LAYERS.map((layer, idx) => {
            const xOffset = -0.068 + idx * 0.0453;
            return (
              <mesh
                key={layer.id}
                position={[xOffset, 0.012, 0.094]}
                onClick={(e) => {
                  e.stopPropagation();
                  setEvaLayer(layer.id);
                }}
                onPointerOver={() => {
                  document.body.style.cursor = 'pointer';
                }}
                onPointerOut={() => {
                  document.body.style.cursor = 'auto';
                }}
              >
                <boxGeometry args={[0.043, 0.01, 0.026]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
              </mesh>
            );
          })}

        </group>
      </group>
    </group>
  );
}
