import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { PointerLockControls } from '@react-three/drei';
import * as THREE from 'three';
import { useMissionStore } from '../../store/useMissionStore';
import {
  getLocalRadiation,
  getTerrainHeightAt,
  getTerrainSlopeAndNormal,
} from '../../utils/terrainMath';

const EYE_HEIGHT = 1.75;
const WALK_SPEED = 5.6;
const SPRINT_SPEED = 9.0;
const SCAN_DURATION_SEC = 1.05;

export default function FirstPersonRig({ site, terrainVersion, onTargetDistances }) {
  const { camera, gl } = useThree();
  const controlsRef = useRef();

  const keysRef = useRef({});
  const dragLookRef = useRef({
    dragging: false,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    moved: 0,
  });
  const telemetryTimerRef = useRef(0);
  const physioDtRef = useRef(0);
  const headBobPhaseRef = useRef(0);
  const velocityRef = useRef({ x: 0, z: 0 });
  const abortTriggeredRef = useRef(false);
  const exhaustedLockRef = useRef(false);
  const lastHoverTriggerRef = useRef({ landerAt: 0, scanTargetId: null, scanAt: 0 });

  const activeTargetId = useMissionStore((s) => s.activeTargetId);
  const wristMapOpen = useMissionStore((s) => s.wristMapOpen);
  const carriedMassKg = useMissionStore((s) => s.carriedMassKg);
  const maxPackMassKg = useMissionStore((s) => s.maxPackMassKg);
  const setActiveTarget = useMissionStore((s) => s.setActiveTarget);
  const updateTelemetry = useMissionStore((s) => s.updateTelemetry);

  // Initialize astronaut spawn at (0, ground + 1.75, 0) looking straight ahead (-Z)
  useEffect(() => {
    const startY = getTerrainHeightAt(0, 0, site.terrainProfile) + EYE_HEIGHT;
    camera.position.set(0, startY, 0);
    camera.rotation.order = 'YXZ';
    camera.rotation.set(-0.04, 0, 0);
    abortTriggeredRef.current = false;
  }, [camera, site]);

  // Adjust eye elevation cleanly if HiRISE heightmap finishes loading after spawn
  useEffect(() => {
    if (terrainVersion > 0) {
      const groundY = getTerrainHeightAt(camera.position.x, camera.position.z, site.terrainProfile);
      camera.position.y = groundY + EYE_HEIGHT;
    }
  }, [terrainVersion, camera, site.terrainProfile]);

  // Keyboard movement + drag-look fallback + safe pointer lock
  useEffect(() => {
    const onKeyDown = (e) => {
      keysRef.current[e.code] = true;
    };
    const onKeyUp = (e) => {
      keysRef.current[e.code] = false;
    };

    const canvasEl = gl.domElement;

    const onPointerDown = (e) => {
      if (e.target !== canvasEl) return;
      if (document.pointerLockElement !== canvasEl) {
        dragLookRef.current = {
          dragging: true,
          startX: e.clientX,
          startY: e.clientY,
          lastX: e.clientX,
          lastY: e.clientY,
          moved: 0,
        };
      }
    };

    const onPointerMove = (e) => {
      if (!dragLookRef.current.dragging || document.pointerLockElement === canvasEl) return;
      const dx = e.clientX - dragLookRef.current.lastX;
      const dy = e.clientY - dragLookRef.current.lastY;
      dragLookRef.current.lastX = e.clientX;
      dragLookRef.current.lastY = e.clientY;
      dragLookRef.current.moved += Math.abs(dx) + Math.abs(dy);

      const { carriedMassKg: massKg, maxPackMassKg: maxMass } = useMissionStore.getState();
      const lookLoadPenalty = 1.0 - Math.min(1, massKg / (maxMass || 25)) * 0.08;

      camera.rotation.order = 'YXZ';
      camera.rotation.y -= dx * 0.0042 * lookLoadPenalty;
      camera.rotation.x = THREE.MathUtils.clamp(
        camera.rotation.x - dy * 0.0038 * lookLoadPenalty,
        -1.3,
        1.3
      );
    };

    const onPointerUp = (e) => {
      const wasShortClick =
        dragLookRef.current.dragging &&
        dragLookRef.current.moved < 6 &&
        e.target === canvasEl &&
        document.pointerLockElement !== canvasEl;
      dragLookRef.current.dragging = false;

      if (wasShortClick && controlsRef.current) {
        try {
          const res = controlsRef.current.lock();
          if (res && typeof res.catch === 'function') {
            res.catch(() => {});
          }
        } catch {
          // Pointer lock unavailable; drag/keyboard look remains active
        }
      }
    };

    const onPointerLockChange = () => {
      updateTelemetry({ pointerLocked: document.pointerLockElement === canvasEl });
    };

    const onPointerLockError = () => {
      updateTelemetry({ pointerLocked: false });
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    canvasEl.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointerlockchange', onPointerLockChange);
    document.addEventListener('pointerlockerror', onPointerLockError);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvasEl.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      document.removeEventListener('pointerlockerror', onPointerLockError);
    };
  }, [camera, gl.domElement, updateTelemetry]);

  const forwardVec = useMemo(() => new THREE.Vector3(), []);
  const lookDirVec = useMemo(() => new THREE.Vector3(), []);
  const toObjVec = useMemo(() => new THREE.Vector3(), []);
  const rightVec = useMemo(() => new THREE.Vector3(), []);
  const moveVec = useMemo(() => new THREE.Vector3(), []);
  const worldUp = useMemo(() => new THREE.Vector3(0, 1, 0), []);

  useFrame(({ clock }, delta) => {
    const dt = Math.min(delta, 0.05);
    const elapsedT = clock.getElapsedTime();
    const keys = keysRef.current;

    const storeState = useMissionStore.getState();
    const carriedCount = storeState.carriedSamples.length;
    const packMassKg = storeState.carriedMassKg;
    const packMaxKg = storeState.maxPackMassKg || 25;
    const loadRatio = Math.min(1, packMassKg / packMaxKg);
    const physio = storeState.physiology;

    // ArrowLeft/ArrowRight yaw turn fallback (minimized load dampening)
    const turnRate = 1.65 * (1.0 - loadRatio * 0.1);
    if (keys['ArrowLeft']) {
      camera.rotation.order = 'YXZ';
      camera.rotation.y += turnRate * dt;
    }
    if (keys['ArrowRight']) {
      camera.rotation.order = 'YXZ';
      camera.rotation.y -= turnRate * dt;
    }

    // WASD + ArrowUp/Down horizontal walk
    camera.getWorldDirection(lookDirVec);
    forwardVec.copy(lookDirVec);
    forwardVec.y = 0;
    if (forwardVec.lengthSq() > 0.0001) forwardVec.normalize();
    rightVec.crossVectors(forwardVec, worldUp).normalize();

    if (physio.stamina <= 1.5) exhaustedLockRef.current = true;
    else if (physio.stamina >= 15.0) exhaustedLockRef.current = false;

    moveVec.set(0, 0, 0);
    if (keys['KeyW'] || keys['ArrowUp']) moveVec.add(forwardVec);
    if (keys['KeyS'] || keys['ArrowDown']) moveVec.sub(forwardVec);
    if (keys['KeyD']) moveVec.add(rightVec);
    if (keys['KeyA']) moveVec.sub(rightVec);

    const isMoving = moveVec.lengthSq() > 0;
    const wantSprint = Boolean(keys['ShiftLeft'] || keys['ShiftRight']);
    const canSprint =
      isMoving &&
      wantSprint &&
      !exhaustedLockRef.current &&
      physio.stamina > 1.5;
    const coldSpeedFactor = physio.bodyTempC < 35.8 ? 0.96 : 1.0;
    const massWalkFactor = 1.0 - Math.pow(loadRatio, 1.1) * 0.18;
    const massSprintFactor = 1.0 - Math.pow(loadRatio, 1.05) * 0.22;
    const encumbranceSpeedFactor = (canSprint ? massSprintFactor : massWalkFactor) * coldSpeedFactor;

    let targetVx = 0;
    let targetVz = 0;
    if (isMoving) {
      moveVec.normalize();
      const baseSpeed = canSprint ? SPRINT_SPEED : WALK_SPEED;
      const targetSpeed = baseSpeed * encumbranceSpeedFactor;
      targetVx = moveVec.x * targetSpeed;
      targetVz = moveVec.z * targetSpeed;
    }

    // Snappy horizontal movement with minimized pack inertia
    const inertiaLerp = Math.min(1, dt * (12.0 - loadRatio * 2.5));
    velocityRef.current.x = THREE.MathUtils.lerp(velocityRef.current.x, targetVx, inertiaLerp);
    velocityRef.current.z = THREE.MathUtils.lerp(velocityRef.current.z, targetVz, inertiaLerp);

    const actualSpeed = Math.hypot(velocityRef.current.x, velocityRef.current.z);
    const isTrudging = actualSpeed > 0.15;

    if (actualSpeed > 0.01) {
      camera.position.x = THREE.MathUtils.clamp(
        camera.position.x + velocityRef.current.x * dt,
        -510,
        510
      );
      camera.position.z = THREE.MathUtils.clamp(
        camera.position.z + velocityRef.current.z * dt,
        -510,
        510
      );
    }

    if (isTrudging) {
      headBobPhaseRef.current +=
        dt * (canSprint ? 5.2 : 3.6) * (0.52 + 0.48 * encumbranceSpeedFactor);
    } else {
      headBobPhaseRef.current += dt * 1.1;
    }

    // Prevent clipping straight through the Lander's central descent stage at (0, 8)
    const hullDx = camera.position.x;
    const hullDz = camera.position.z - 8;
    const hullDist = Math.hypot(hullDx, hullDz);
    if (hullDist > 0.001 && hullDist < 2.45) {
      const pushScale = 2.45 / hullDist;
      camera.position.x = hullDx * pushScale;
      camera.position.z = 8 + hullDz * pushScale;
    }

    // Prevent clipping through the NASA Rover chassis & detect discovery / telemetry proximity
    const roverPos = site.nasaRover?.position;
    if (roverPos) {
      const rDx = camera.position.x - roverPos[0];
      const rDz = camera.position.z - roverPos[1];
      const roverDist = Math.hypot(rDx, rDz);
      if (roverDist > 0.001 && roverDist < 1.35) {
        const pushScale = 1.35 / roverDist;
        camera.position.x = roverPos[0] + rDx * pushScale;
        camera.position.z = roverPos[1] + rDz * pushScale;
      }
      storeState.setRoverProximity(roverDist <= 5.0, roverDist);
      const roverY = getTerrainHeightAt(roverPos[0], roverPos[1], site.terrainProfile);
      toObjVec
        .set(roverPos[0] - camera.position.x, roverY + 1.1 - camera.position.y, roverPos[1] - camera.position.z)
        .normalize();
      const roverLookDot = lookDirVec.dot(toObjVec);
      if (
        (roverDist <= 11.0 || (roverDist <= 12.0 && roverLookDot > 0.92)) &&
        !storeState.discoveredRovers[site.id]
      ) {
        storeState.discoverRover(site.id);
        storeState.routeToUnexploredFrontier();
      }
    }

    // Minimized physiological & encumbrance camera feedback
    const exhaustionIntensity = physio.stamina < 30 ? (30 - physio.stamina) / 30 : 0;
    const shiverIntensity = physio.bodyTempC < 36.0 ? Math.min(1, (36.0 - physio.bodyTempC) / 1.2) : 0;
    const hypoxiaIntensity = physio.oxygen < 26 ? (26 - physio.oxygen) / 26 : 0;

    const breathHeave = Math.sin(elapsedT * 4.2) * 0.004 * exhaustionIntensity;
    const shiverJitter = Math.sin(elapsedT * 38.0) * 0.0008 * shiverIntensity;
    const lumberRoll = isTrudging
      ? Math.sin(headBobPhaseRef.current) * (0.002 + loadRatio * 0.008)
      : 0;

    camera.rotation.order = 'YXZ';
    const targetRoll =
      lumberRoll + (hypoxiaIntensity > 0 ? Math.sin(elapsedT * 2.1) * 0.006 * hypoxiaIntensity : 0);
    camera.rotation.z = THREE.MathUtils.lerp(camera.rotation.z, targetRoll, Math.min(1, dt * 8));

    // Bilinear HiRISE / procedural terrain height clamping (+1.75m eye height, minimized load crouch)
    const groundY = getTerrainHeightAt(camera.position.x, camera.position.z, site.terrainProfile);
    const loadCrouchOffset = -loadRatio * 0.025;
    const bobAmp = isTrudging ? (canSprint ? 0.022 : 0.012) + loadRatio * 0.012 : 0.003;
    const stepVertical = isTrudging
      ? Math.cos(headBobPhaseRef.current * 2) * bobAmp
      : Math.sin(elapsedT * 1.6) * 0.003;
    const bobOffset = loadCrouchOffset + stepVertical + breathHeave + shiverJitter;
    const targetCamY = groundY + EYE_HEIGHT + bobOffset;
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetCamY, Math.min(1, dt * 16));

    // Active spectrometer scan progress
    if (storeState.scanningState.active && storeState.scanningState.targetId) {
      const nextProgress = storeState.scanningState.progress + (dt / SCAN_DURATION_SEC) * 100;
      if (nextProgress >= 100) {
        const scannedTarget = site.targets.find((tgt) => tgt.id === storeState.scanningState.targetId);
        storeState.completeScan(site.id, scannedTarget);
      } else {
        storeState.updateScanProgress(nextProgress);
      }
    }

    // Closest geological sample target by reticle gaze hover (within 14m, dot > 0.94) OR proximity (4.0m)
    let closestId = null;
    let closestDist = Infinity;
    let bestGazeScore = -Infinity;
    const distMap = {};
    const collectedIds = storeState.collectedSamples[site.id] || [];

    for (let i = 0; i < site.targets.length; i++) {
      const tgt = site.targets[i];
      const dx = tgt.position[0] - camera.position.x;
      const dz = tgt.position[1] - camera.position.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      distMap[tgt.id] = d;

      const tgtY = getTerrainHeightAt(tgt.position[0], tgt.position[1], site.terrainProfile) + 0.95;
      toObjVec.set(dx, tgtY - camera.position.y, dz).normalize();
      const dot = lookDirVec.dot(toObjVec);

      const isGazeHover = d <= 14.0 && dot > 0.94;
      const isCloseHover = d <= 4.0;
      if (isGazeHover || isCloseHover) {
        const score = isGazeHover ? dot * 2.0 - d * 0.02 : 1.0 - d * 0.1;
        if (score > bestGazeScore) {
          bestGazeScore = score;
          closestId = tgt.id;
          closestDist = d;
        }
      }
    }

    if (closestId !== activeTargetId) {
      setActiveTarget(closestId);
    }
    if (closestId) {
      if (storeState.observedTargetId !== closestId) {
        storeState.observeTarget(closestId);
      }
    }

    // Lander airlock / sample return locker proximity check
    const airlockDist = Math.hypot(camera.position.x, camera.position.z - 5.95);
    const lockerDist = Math.hypot(camera.position.x - 1.38, camera.position.z - 6.22);
    const landerBayDist = Math.min(airlockDist, lockerDist);
    const nearLander = landerBayDist <= 4.0;
    storeState.setLanderProximity(nearLander, Math.hypot(camera.position.x, camera.position.z - 8));

    // Throttled HUD telemetry & Martian EVA physiology simulation (~10–13 Hz)
    telemetryTimerRef.current += dt;
    physioDtRef.current += dt;
    if (telemetryTimerRef.current >= 0.085) {
      const pdt = physioDtRef.current;
      telemetryTimerRef.current = 0;
      physioDtRef.current = 0;
      if (onTargetDistances) onTargetDistances(distMap);

      const rad = Math.atan2(forwardVec.x, -forwardVec.z);
      const heading = ((rad * 180) / Math.PI + 360) % 360;

      const { slopeDeg } = getTerrainSlopeAndNormal(camera.position.x, camera.position.z, site.terrainProfile);
      const localRad = getLocalRadiation(
        camera.position.x,
        camera.position.z,
        groundY,
        slopeDeg,
        site.baseRadiation
      );

      updateTelemetry({
        heading: Math.round(heading),
        slope: Number(slopeDeg.toFixed(1)),
        radiation: localRad,
        elevation: Math.round(site.baseElevation + groundY),
        position: [Number(camera.position.x.toFixed(2)), Number(camera.position.z.toFixed(2))],
      });

      if (storeState.viewMode === 'EVA' && !storeState.isTransitioning && !abortTriggeredRef.current) {
        // 1. Suit Oxygen (0–100%): minimized drain rate while exploring
        const exertionMult = canSprint ? 1.65 : isMoving ? 1.15 : 1.0;
        const sampleBurnMult = 1.0 + carriedCount * 0.04;
        const fatigueRespMult = physio.stamina < 20 ? 1.12 : 1.0;
        const nextOxygen = Math.max(
          0,
          physio.oxygen - 0.08 * exertionMult * sampleBurnMult * fatigueRespMult * pdt
        );

        if (nextOxygen <= 0) {
          abortTriggeredRef.current = true;
          storeState.updatePhysiology({ oxygen: 0 });
          storeState.returnToOrbit('HYPOXIA');
          return;
        }

        // 2. Stamina (0–100%): minimized sprint/uphill drain
        const isUphill = isMoving && slopeDeg > 15;
        const massStrain = 1.0 + packMassKg * 0.015;
        let nextStamina = physio.stamina;
        if (canSprint || isUphill) {
          const drainRate =
            ((canSprint ? 3.6 : 0) + (isUphill ? (slopeDeg - 13) * 0.14 : 0)) * massStrain;
          nextStamina = Math.max(0, physio.stamina - drainRate * pdt);
        } else {
          const recoveryRate =
            (isMoving ? 2.4 : 4.8) * Math.max(0.65, 1.0 - packMassKg * 0.01);
          nextStamina = Math.min(100, physio.stamina + recoveryRate * pdt);
        }

        // 3. Body Core Temperature (37.0°C nominal) & Suit Thermal Heater Loop (0–100%, minimized drain)
        const inColdZone = groundY < -0.3 || (site.terrainProfile?.iceFactor ?? 0) > 0.4;
        const heaterDrain = inColdZone ? 0.22 : 0.12;
        const nextHeater = Math.max(0, physio.heaterReserve - heaterDrain * pdt);

        let targetTemp = 37.0;
        if (landerBayDist <= 4.5) {
          targetTemp = 37.0;
        } else if (nextHeater <= 0) {
          targetTemp = 34.7;
        } else if (nextHeater <= 18) {
          targetTemp = 35.1;
        } else if (inColdZone && !isMoving) {
          targetTemp = 35.2;
        } else if (nextHeater < 65) {
          targetTemp = 37.0 - ((65 - nextHeater) / 65) * 1.4;
        }
        if (canSprint) {
          targetTemp = Math.min(37.35, targetTemp + 0.35);
        }
        const tempRate = canSprint ? 0.2 : inColdZone && !isMoving ? 0.28 : 0.22;
        const nextBodyTemp = THREE.MathUtils.lerp(
          physio.bodyTempC,
          targetTemp,
          Math.min(1, pdt * tempRate)
        );

        storeState.updatePhysiology({
          oxygen: Number(nextOxygen.toFixed(2)),
          stamina: Number(nextStamina.toFixed(1)),
          heaterReserve: Number(nextHeater.toFixed(2)),
          bodyTempC: Number(nextBodyTemp.toFixed(2)),
        });
      }
    }
  });

  const pointerLoadSpeed = Math.max(
    0.92,
    1.0 - Math.min(1, carriedMassKg / (maxPackMassKg || 25)) * 0.08
  );

  return (
    <PointerLockControls
      ref={controlsRef}
      enabled={!wristMapOpen}
      pointerSpeed={pointerLoadSpeed}
      selector="#eva-manual-lock"
    />
  );
}
