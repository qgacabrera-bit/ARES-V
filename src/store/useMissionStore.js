import { create } from 'zustand';
import { LANDING_ZONES_BY_ID } from '../data/landingZones';
import { computeSafeTraversePath } from '../utils/pathfinding';

export const useMissionStore = create((set, get) => ({
  viewMode: 'ORBIT', // 'ORBIT' | 'EVA'
  isTransitioning: false,
  isDeploying: false,
  deployProgress: 0,
  orbitalLayer: 'OPTICAL', // 'OPTICAL' | 'THERMAL' | 'ICE'
  orbitalDataSource: 'LOADING', // 'LOADING' | 'LIVE' | 'SYNTHETIC'
  evaLayer: 'OPTICAL', // 'OPTICAL' | 'TOPOGRAPHY' | 'SPECTRAL' | 'ENV'
  surfaceDataSource: 'PROCEDURAL', // 'PROCEDURAL' | 'HIRISE'
  selectedSiteId: null,
  hoveredSiteId: null,
  activeTargetId: null,
  observedTargetId: null,

  // Diegetic ARES-V Field Slate & EVA Field Tools
  wristMapOpen: false,
  slateTab: 'MAP', // 'MAP' | 'SPECTRA' | 'MOBILITY'
  inspectedTargetId: null,
  headlampOn: false,
  sunGlareFactor: 0,
  activeRoute: null, // { targetId, targetName, points, distanceMeters, maxSlopeDeg }
  radarPulse: {
    active: false,
    origin: [0, 0, 0],
    progress: 0,
  },
  evaStartTime: 0,

  scanningState: {
    active: false,
    targetId: null,
    progress: 0,
  },

  collectedSamples: {
    jezero: [],
    gale: [],
    meridiani: [],
    gusev: [],
    arcadia: [],
  },

  vaultedSamples: {
    jezero: [],
    gale: [],
    meridiani: [],
    gusev: [],
    arcadia: [],
  },

  carriedSamples: [],
  carriedMassKg: 0,
  maxPackMassKg: 25,

  physiology: {
    oxygen: 100,
    bodyTempC: 37.0,
    heaterReserve: 100,
    stamina: 100,
  },

  landerReserves: {
    oxygenReserve: 300,
    heaterReserve: 300,
    maxReserve: 300,
  },

  nearLander: false,
  landerDistance: 8.0,
  landerStatusMessage: null,
  abortNotice: null,

  discoveredRovers: {
    jezero: false,
    gale: false,
    meridiani: false,
    gusev: false,
    arcadia: false,
  },
  nearRover: false,
  roverDistance: 14.0,
  customPinpoint: null,

  sampleDrawerOpen: false,
  lastCollectedSample: null,

  telemetry: {
    heading: 0,
    slope: 1.2,
    radiation: 0.61,
    elevation: -2560,
    position: [0, 0],
    pointerLocked: false,
  },

  setOrbitalLayer: (layer) => set({ orbitalLayer: layer }),

  setOrbitalDataSource: (status) => set({ orbitalDataSource: status }),

  setEvaLayer: (layer) => set({ evaLayer: layer }),

  setSurfaceDataSource: (status) => set({ surfaceDataSource: status }),

  selectSite: (siteId) => set({ selectedSiteId: siteId }),

  setHoveredSite: (siteId) => set({ hoveredSiteId: siteId }),

  deployToSurface: (siteId) => {
    const targetSiteId = siteId || get().selectedSiteId || 'jezero';
    const site = LANDING_ZONES_BY_ID[targetSiteId];
    set((state) => ({
      selectedSiteId: targetSiteId,
      hoveredSiteId: null,
      isDeploying: true,
      deployProgress: 0,
      isTransitioning: false,
      activeTargetId: null,
      observedTargetId: null,
      wristMapOpen: false,
      slateTab: 'MAP',
      inspectedTargetId: null,
      headlampOn: false,
      sunGlareFactor: 0,
      activeRoute: null,
      radarPulse: { active: false, origin: [0, 0, 0], progress: 0 },
      scanningState: { active: false, targetId: null, progress: 0 },
      sampleDrawerOpen: false,
      lastCollectedSample: null,
      carriedSamples: [],
      carriedMassKg: 0,
      collectedSamples: {
        ...state.collectedSamples,
        [targetSiteId]: [...(state.vaultedSamples[targetSiteId] || [])],
      },
      physiology: {
        oxygen: 100,
        bodyTempC: 37.0,
        heaterReserve: 100,
        stamina: 100,
      },
      landerReserves: {
        oxygenReserve: 300,
        heaterReserve: 300,
        maxReserve: 300,
      },
      nearLander: false,
      landerDistance: 8.0,
      landerStatusMessage: null,
      abortNotice: null,
      nearRover: false,
      roverDistance: 14.0,
      customPinpoint: null,
      telemetry: {
        heading: 0,
        slope: 0.8,
        radiation: site?.baseRadiation ?? 0.64,
        elevation: site?.baseElevation ?? -2560,
        position: [0, 0],
        pointerLocked: false,
      },
    }));
  },

  updateDeployProgress: (progress) =>
    set({ deployProgress: Math.min(1, Math.max(0, progress)) }),

  completeDeployToSurface: () => {
    set({
      viewMode: 'EVA',
      evaLayer: 'OPTICAL',
      evaStartTime: Date.now(),
      isDeploying: false,
      deployProgress: 0,
      isTransitioning: true,
    });

    setTimeout(() => {
      set({ isTransitioning: false });
    }, 280);
  },

  returnToOrbit: (reason = null) => {
    if (document.pointerLockElement) {
      try {
        document.exitPointerLock();
      } catch {
        // Ignore pointer lock exit errors
      }
    }
    set((state) => {
      const siteId = state.selectedSiteId;
      const syncedCollected = siteId
        ? {
            ...state.collectedSamples,
            [siteId]: [...(state.vaultedSamples[siteId] || [])],
          }
        : state.collectedSamples;

      return {
        isTransitioning: true,
        isDeploying: false,
        deployProgress: 0,
        activeTargetId: null,
        observedTargetId: null,
        wristMapOpen: false,
        slateTab: 'MAP',
        inspectedTargetId: null,
        headlampOn: false,
        sunGlareFactor: 0,
        activeRoute: null,
        radarPulse: { active: false, origin: [0, 0, 0], progress: 0 },
        scanningState: { active: false, targetId: null, progress: 0 },
        sampleDrawerOpen: false,
        carriedSamples: [],
        carriedMassKg: 0,
        collectedSamples: syncedCollected,
        nearLander: false,
        landerStatusMessage: null,
        nearRover: false,
        customPinpoint: null,
        abortNotice:
          reason === 'HYPOXIA'
            ? 'EMERGENCY ORBITAL ABORT: SUIT O₂ DEPLETED — UNVAULTED SAMPLES JETTISONED'
            : null,
      };
    });

    setTimeout(() => {
      set((state) => ({
        viewMode: 'ORBIT',
        isTransitioning: false,
        telemetry: { ...state.telemetry, pointerLocked: false },
      }));
    }, 260);
  },

  clearAbortNotice: () => set({ abortNotice: null }),

  setWristMapOpen: (open) => {
    if (open && document.pointerLockElement) {
      try {
        document.exitPointerLock();
      } catch {
        // Ignore pointer lock exit errors
      }
    }
    set((state) => ({
      wristMapOpen: open,
      telemetry: open ? { ...state.telemetry, pointerLocked: false } : state.telemetry,
    }));
  },

  toggleWristMap: () => {
    const next = !get().wristMapOpen;
    get().setWristMapOpen(next);
  },

  toggleHeadlamp: () => set((state) => ({ headlampOn: !state.headlampOn })),

  setSunGlareFactor: (val) => set({ sunGlareFactor: val }),

  setActiveRoute: (route) => set({ activeRoute: route, customPinpoint: null }),

  clearActiveRoute: () => set({ activeRoute: null, customPinpoint: null }),

  discoverRover: (siteId) => {
    const id = siteId || get().selectedSiteId || 'jezero';
    if (get().discoveredRovers[id]) return;
    set((state) => ({
      discoveredRovers: {
        ...state.discoveredRovers,
        [id]: true,
      },
      landerStatusMessage:
        '📡 NASA ROVER LOCATED & PINNED ON MAP // UNEXPLORED FRONTIER SECTORS UNLOCKED',
    }));
  },

  setRoverProximity: (nearRover, roverDistance) => {
    const state = get();
    const roundedDist = Number(roverDistance.toFixed(1));
    if (
      state.nearRover !== nearRover ||
      Math.abs(state.roverDistance - roundedDist) >= 0.4
    ) {
      set({ nearRover, roverDistance: roundedDist });
    }
  },

  setCustomPinpoint: (pinpoint) => {
    const state = get();
    const siteId = state.selectedSiteId || 'jezero';
    const site = LANDING_ZONES_BY_ID[siteId] || LANDING_ZONES_BY_ID.jezero;
    if (!pinpoint) {
      set({ customPinpoint: null, activeRoute: null });
      return;
    }
    const route = computeSafeTraversePath(
      state.telemetry.position,
      pinpoint.position,
      site.terrainProfile
    );
    set((s) => ({
      discoveredRovers: {
        ...s.discoveredRovers,
        [siteId]: true,
      },
      customPinpoint: pinpoint,
      activeRoute: {
        targetId: pinpoint.id || 'custom-pinpoint',
        targetName: pinpoint.name || 'Map Pinpoint',
        ...route,
      },
      landerStatusMessage: `📌 PINPOINT LOCKED // ROUTING TO ${pinpoint.name.toUpperCase()} (${route.distanceMeters}m)`,
    }));
  },

  routeToUnexploredFrontier: () => {
    const state = get();
    const siteId = state.selectedSiteId || 'jezero';
    const site = LANDING_ZONES_BY_ID[siteId] || LANDING_ZONES_BY_ID.jezero;
    const collected = state.collectedSamples[site.id] || [];
    const unexploredTargets = site.targets.filter(
      (t) => !t.roverExplored && !collected.includes(t.id)
    );
    const pos = state.telemetry.position;

    let goalPos = site.nasaRover?.unexploredSector?.center || [14, -17];
    let goalId = 'unexplored-sector';
    let goalName = site.nasaRover?.unexploredSector?.name || 'Unexplored Frontier';

    if (unexploredTargets.length > 0) {
      let nearest = unexploredTargets[0];
      let bestDist = Infinity;
      for (let i = 0; i < unexploredTargets.length; i++) {
        const d = Math.hypot(
          unexploredTargets[i].position[0] - pos[0],
          unexploredTargets[i].position[1] - pos[1]
        );
        if (d < bestDist) {
          bestDist = d;
          nearest = unexploredTargets[i];
        }
      }
      goalPos = nearest.position;
      goalId = nearest.id;
      goalName = nearest.name;
    }

    const route = computeSafeTraversePath(pos, goalPos, site.terrainProfile);
    const pinpoint = {
      id: goalId,
      name: goalName,
      position: goalPos,
      isUnexplored: true,
    };

    set((s) => ({
      discoveredRovers: {
        ...s.discoveredRovers,
        [siteId]: true,
      },
      customPinpoint: pinpoint,
      activeRoute: {
        targetId: goalId,
        targetName: goalName,
        ...route,
      },
      landerStatusMessage: `🧭 PINPOINT LOCKED // ROUTING TO UNEXPLORED MARS FRONTIER (${route.distanceMeters}m)`,
    }));
  },

  triggerRadarPulse: (origin) =>
    set({
      radarPulse: {
        active: true,
        origin: origin || [0, 0, 0],
        progress: 0,
      },
    }),

  updateRadarPulse: (progress) =>
    set((state) =>
      progress >= 1
        ? {
            radarPulse: {
              ...state.radarPulse,
              active: false,
              progress: 1,
            },
          }
        : {
            radarPulse: {
              ...state.radarPulse,
              progress,
            },
          }
    ),

  setSlateTab: (tab) => set({ slateTab: tab }),

  setInspectedTargetId: (id) => set({ inspectedTargetId: id }),

  setActiveTarget: (targetId) => {
    if (get().activeTargetId !== targetId) {
      set((state) => ({
        activeTargetId: targetId,
        observedTargetId: null,
        inspectedTargetId: targetId || state.inspectedTargetId,
      }));
    }
  },

  observeTarget: (targetId) => {
    if (!targetId) return;
    set({ observedTargetId: targetId });
  },

  closeObservation: () => set({ observedTargetId: null }),

  startScan: (targetId) => {
    const {
      selectedSiteId,
      collectedSamples,
      scanningState,
      carriedMassKg,
      maxPackMassKg,
    } = get();
    if (!targetId || scanningState.active) return;
    const siteSamples = collectedSamples[selectedSiteId] || [];
    if (siteSamples.includes(targetId)) return;

    const site = LANDING_ZONES_BY_ID[selectedSiteId];
    const targetObj = site?.targets.find((t) => t.id === targetId);
    const nextMass = targetObj?.massKg || 5.5;
    if (carriedMassKg + nextMass > maxPackMassKg + 0.01) {
      set({
        landerStatusMessage: 'PACK CAPACITY FULL (25 KG) // OFFLOAD CORES AT LANDER',
      });
      return;
    }

    set({
      observedTargetId: null,
      scanningState: {
        active: true,
        targetId,
        progress: 0,
      },
    });
  },

  updateScanProgress: (progress) =>
    set((state) => ({
      scanningState: {
        ...state.scanningState,
        progress: Math.min(100, Math.max(0, progress)),
      },
    })),

  completeScan: (siteId, target) => {
    if (!siteId || !target) return;
    set((state) => {
      const existing = state.collectedSamples[siteId] || [];
      const updatedSiteSamples = existing.includes(target.id)
        ? existing
        : [...existing, target.id];

      const massKg = target.massKg || 5.5;
      const alreadyCarried = state.carriedSamples.some((s) => s.id === target.id);
      const updatedCarried = alreadyCarried
        ? state.carriedSamples
        : [...state.carriedSamples, { ...target, siteId, massKg }];
      const nextMassKg = Number(
        updatedCarried.reduce((sum, s) => sum + (s.massKg || 5.5), 0).toFixed(1)
      );

      const clearRoute = state.activeRoute?.targetId === target.id;

      return {
        collectedSamples: {
          ...state.collectedSamples,
          [siteId]: updatedSiteSamples,
        },
        carriedSamples: updatedCarried,
        carriedMassKg: nextMassKg,
        activeRoute: clearRoute ? null : state.activeRoute,
        scanningState: {
          active: false,
          targetId: null,
          progress: 0,
        },
        lastCollectedSample: { ...target, massKg },
        sampleDrawerOpen: true,
      };
    });
  },

  resupplyAndOffloadAtLander: () => {
    const state = get();
    const siteId = state.selectedSiteId;
    const offloadedCount = state.carriedSamples.length;
    const offloadedMass = state.carriedMassKg;

    const existingVault = siteId ? state.vaultedSamples[siteId] || [] : [];
    const nextVault = siteId
      ? Array.from(
          new Set([
            ...existingVault,
            ...state.carriedSamples
              .filter((s) => s.siteId === siteId)
              .map((s) => s.id),
          ])
        )
      : existingVault;

    const o2Needed = Math.max(0, 100 - state.physiology.oxygen);
    const o2Transfer = Math.min(o2Needed, state.landerReserves.oxygenReserve);
    const nextSuitO2 = Math.min(100, state.physiology.oxygen + o2Transfer);
    const nextShipO2 = Math.max(0, state.landerReserves.oxygenReserve - o2Transfer);

    const heatNeeded = Math.max(0, 100 - state.physiology.heaterReserve);
    const heatTransfer = Math.min(heatNeeded, state.landerReserves.heaterReserve);
    const nextSuitHeat = Math.min(100, state.physiology.heaterReserve + heatTransfer);
    const nextShipHeat = Math.max(0, state.landerReserves.heaterReserve - heatTransfer);

    const statusParts = [];
    if (offloadedCount > 0) {
      statusParts.push(
        `VAULTED ${offloadedCount} CORE${offloadedCount > 1 ? 'S' : ''} (${offloadedMass.toFixed(1)} KG)`
      );
    }
    if (o2Transfer > 0.5 || heatTransfer > 0.5) {
      statusParts.push(
        `+O₂ ${Math.round(o2Transfer)}% · +THERM ${Math.round(heatTransfer)}%`
      );
    }
    const statusMsg =
      statusParts.length > 0
        ? `AIRLOCK SYNC // ${statusParts.join(' · ')}`
        : 'AIRLOCK CONNECTED // SUIT SYSTEMS & VAULT NOMINAL';

    set({
      vaultedSamples: siteId
        ? {
            ...state.vaultedSamples,
            [siteId]: nextVault,
          }
        : state.vaultedSamples,
      carriedSamples: [],
      carriedMassKg: 0,
      physiology: {
        oxygen: Number(nextSuitO2.toFixed(1)),
        heaterReserve: Number(nextSuitHeat.toFixed(1)),
        bodyTempC: 37.0,
        stamina: 100,
      },
      landerReserves: {
        ...state.landerReserves,
        oxygenReserve: Number(nextShipO2.toFixed(1)),
        heaterReserve: Number(nextShipHeat.toFixed(1)),
      },
      landerStatusMessage: statusMsg,
    });
  },

  clearLanderStatusMessage: () => set({ landerStatusMessage: null }),

  updatePhysiology: (partial) =>
    set((state) => ({
      physiology: {
        oxygen:
          partial.oxygen !== undefined
            ? Math.min(100, Math.max(0, partial.oxygen))
            : state.physiology.oxygen,
        heaterReserve:
          partial.heaterReserve !== undefined
            ? Math.min(100, Math.max(0, partial.heaterReserve))
            : state.physiology.heaterReserve,
        bodyTempC:
          partial.bodyTempC !== undefined
            ? Math.min(38.0, Math.max(33.5, partial.bodyTempC))
            : state.physiology.bodyTempC,
        stamina:
          partial.stamina !== undefined
            ? Math.min(100, Math.max(0, partial.stamina))
            : state.physiology.stamina,
      },
    })),

  toggleCriticalTest: (metric) =>
    set((state) => {
      const p = state.physiology;
      if (metric === 'O₂') {
        return {
          physiology: { ...p, oxygen: p.oxygen < 30 ? 100 : 12 },
        };
      }
      if (metric === 'CORE') {
        const isCritical = p.bodyTempC < 36.0;
        return {
          physiology: {
            ...p,
            bodyTempC: isCritical ? 37.0 : 34.8,
            heaterReserve: isCritical ? 100 : 10,
          },
        };
      }
      if (metric === 'STAM') {
        return {
          physiology: { ...p, stamina: p.stamina < 30 ? 100 : 8 },
        };
      }
      if (metric === 'PACK') {
        const isHeavy = state.carriedMassKg >= 15;
        if (isHeavy) {
          return {
            carriedSamples: [],
            carriedMassKg: 0,
          };
        }
        const site = LANDING_ZONES_BY_ID[state.selectedSiteId] || LANDING_ZONES_BY_ID.jezero;
        const demoCores = site.targets.slice(0, 4).map((t) => ({
          siteId: site.id,
          id: t.id,
          code: t.code,
          name: t.name,
          massKg: t.massKg ?? 5.7,
        }));
        const demoMass = Number(
          demoCores.reduce((acc, c) => acc + c.massKg, 0).toFixed(1)
        );
        return {
          carriedSamples: demoCores,
          carriedMassKg: demoMass,
        };
      }
      return {};
    }),

  setLanderProximity: (nearLander, landerDistance) => {
    const state = get();
    const roundedDist = Number(landerDistance.toFixed(1));
    if (
      state.nearLander !== nearLander ||
      Math.abs(state.landerDistance - roundedDist) >= 0.4
    ) {
      set({ nearLander, landerDistance: roundedDist });
    }
  },

  clearLastCollectedSample: () => set({ lastCollectedSample: null }),

  toggleSampleDrawer: () =>
    set((state) => ({ sampleDrawerOpen: !state.sampleDrawerOpen })),

  setSampleDrawerOpen: (open) => set({ sampleDrawerOpen: open }),

  updateTelemetry: (partial) =>
    set((state) => ({
      telemetry: {
        ...state.telemetry,
        ...partial,
      },
    })),
}));
