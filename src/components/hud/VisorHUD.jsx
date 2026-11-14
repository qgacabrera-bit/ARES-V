import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Globe2, Home, MapPin, Menu, Navigation, Rocket, ScanLine, X } from 'lucide-react';
import { LANDING_ZONES, LANDING_ZONES_BY_ID } from '../../data/landingZones';
import { useMissionStore } from '../../store/useMissionStore';
import FieldSlateHUD from './FieldSlateHUD';

function getDirectionArrow(deltaDeg) {
  if (Math.abs(deltaDeg) <= 22) return '↑';
  if (deltaDeg > 157 || deltaDeg < -157) return '↓';
  if (deltaDeg > 112) return '↘';
  if (deltaDeg > 67) return '→';
  if (deltaDeg > 22) return '↗';
  if (deltaDeg < -112) return '↙';
  if (deltaDeg < -67) return '←';
  return '↖';
}

function CompassStrip({
  heading,
  targets,
  playerPos,
  collectedIds,
  landerDistance,
  rover,
  isRoverDiscovered,
  customPinpoint,
  activeRoute,
}) {
  const ticks = useMemo(
    () => [
      { deg: 0, label: 'N' },
      { deg: 45, label: 'NE' },
      { deg: 90, label: 'E' },
      { deg: 135, label: 'SE' },
      { deg: 180, label: 'S' },
      { deg: 225, label: 'SW' },
      { deg: 270, label: 'W' },
      { deg: 315, label: 'NW' },
    ],
    []
  );

  // Shortest signed angular offset in [-180, 180]
  const angleDelta = (targetDeg) => ((targetDeg - heading + 540) % 360) - 180;

  const getArrowAndPct = (tx, tz) => {
    const dx = tx - playerPos[0];
    const dz = tz - playerPos[1];
    const bearing = ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
    const delta = angleDelta(bearing);
    const pct = 50 + (Math.max(-72, Math.min(72, delta)) / 75) * 48;
    return {
      pct,
      arrow: getDirectionArrow(delta),
      dist: Math.sqrt(dx * dx + dz * dz),
    };
  };

  // Bearing to Mars Lander Base at (0, 8)
  const landerNav = getArrowAndPct(0, 8);
  const roverNav = rover ? getArrowAndPct(rover.position[0], rover.position[1]) : null;
  const customNav = customPinpoint?.position
    ? getArrowAndPct(customPinpoint.position[0], customPinpoint.position[1])
    : null;

  // Determine active geologic waypoint (explicit plotted route -> custom pinpoint -> nearest uncollected core -> lander)
  let waypointLabel = 'LANDER';
  let waypointNav = landerNav;

  if (activeRoute?.points?.length > 0) {
    const lastPt = activeRoute.points[activeRoute.points.length - 1];
    waypointNav = getArrowAndPct(lastPt[0], lastPt[2]);
    waypointLabel = activeRoute.targetName || 'ROUTE';
  } else if (customPinpoint?.position) {
    waypointNav = customNav;
    waypointLabel = customPinpoint.name || 'FRONTIER';
  } else {
    let bestTarget = null;
    let bestDist = Infinity;
    for (let i = 0; i < targets.length; i++) {
      const tgt = targets[i];
      if (collectedIds.includes(tgt.id)) continue;
      const d = Math.hypot(tgt.position[0] - playerPos[0], tgt.position[1] - playerPos[1]);
      if (d < bestDist) {
        bestDist = d;
        bestTarget = tgt;
      }
    }
    if (bestTarget) {
      waypointNav = getArrowAndPct(bestTarget.position[0], bestTarget.position[1]);
      waypointLabel = bestTarget.code;
    } else if (rover && !isRoverDiscovered && roverNav) {
      waypointNav = roverNav;
      waypointLabel = rover.shortName;
    }
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative flex h-6 w-56 items-center justify-center overflow-hidden rounded border border-white/15 bg-black/45 font-mono text-[10px] backdrop-blur-md sm:w-68">
        {/* Center reticle line */}
        <div className="absolute top-0 bottom-0 left-1/2 z-10 w-px -translate-x-1/2 bg-sky-400/70" />

        {/* Cardinal & intercardinal markers */}
        {ticks.map((t) => {
          const delta = angleDelta(t.deg);
          if (Math.abs(delta) > 75) return null;
          const pct = 50 + (delta / 75) * 48;
          return (
            <span
              key={t.label}
              style={{ left: `${pct}%` }}
              className={`absolute -translate-x-1/2 select-none ${
                t.label.length === 1 ? 'font-semibold text-white/85' : 'text-white/45'
              }`}
            >
              {t.label}
            </span>
          );
        })}

        {/* Lander Base bearing triangle on top edge */}
        <span
          style={{ left: `${landerNav.pct}%` }}
          title="ARES-V Mars Lander"
          className="absolute top-0.5 h-1.5 w-1.5 -translate-x-1/2 rotate-45 bg-cyan-300 shadow-[0_0_6px_#67e8f9]"
        />

        {/* NASA Rover bearing pip */}
        {roverNav && (
          <span
            style={{ left: `${roverNav.pct}%` }}
            title={rover.name}
            className={`absolute top-0.5 h-1.5 w-1.5 -translate-x-1/2 rotate-45 ${
              isRoverDiscovered
                ? 'bg-emerald-300 shadow-[0_0_6px_#34d399]'
                : 'bg-amber-300 shadow-[0_0_6px_#fbbf24]'
            }`}
          />
        )}

        {/* Active Waypoint bearing diamond on bottom edge */}
        <span
          style={{ left: `${waypointNav.pct}%` }}
          title={`Waypoint: ${waypointLabel}`}
          className="absolute bottom-0.5 h-2 w-2 -translate-x-1/2 rotate-45 bg-sky-400 shadow-[0_0_8px_#38bdf8]"
        />

        {/* Uncollected sample target bearing pips */}
        {targets.map((tgt) => {
          if (collectedIds.includes(tgt.id)) return null;
          const dx = tgt.position[0] - playerPos[0];
          const dz = tgt.position[1] - playerPos[1];
          const bearing = ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
          const delta = Math.max(-72, Math.min(72, angleDelta(bearing)));
          const pct = 50 + (delta / 75) * 48;
          return (
            <span
              key={tgt.id}
              style={{ left: `${pct}%` }}
              title={tgt.name}
              className="absolute bottom-0.5 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-amber-400/80"
            />
          );
        })}

        {/* Current heading readout */}
        <div className="absolute right-1.5 rounded bg-black/70 px-1 text-[9px] text-sky-300">
          {String(heading).padStart(3, '0')}°
        </div>
      </div>

      {/* Slim Dual Bearing Readout: LANDER & Active WAYPOINT */}
      <div className="flex items-center gap-1.5 font-mono text-[9px] tracking-[0.12em]">
        <div className="rounded border border-cyan-400/25 bg-black/40 px-2 py-0.5 text-cyan-200/90 backdrop-blur-sm">
          {landerNav.arrow} LANDER: {Math.round(landerDistance)}m
        </div>
        <div className="rounded border border-sky-400/30 bg-black/40 px-2 py-0.5 text-sky-200/95 backdrop-blur-sm">
          {waypointNav.arrow} WAYPOINT: {waypointLabel} · {Math.round(waypointNav.dist)}m
        </div>
      </div>
    </div>
  );
}

export default function VisorHUD() {
  const selectedSiteId = useMissionStore((s) => s.selectedSiteId) || 'jezero';
  const evaLayer = useMissionStore((s) => s.evaLayer);
  const activeTargetId = useMissionStore((s) => s.activeTargetId);
  const scanningState = useMissionStore((s) => s.scanningState);
  const collectedSamples = useMissionStore((s) => s.collectedSamples);
  const carriedSamples = useMissionStore((s) => s.carriedSamples);
  const carriedMassKg = useMissionStore((s) => s.carriedMassKg);
  const maxPackMassKg = useMissionStore((s) => s.maxPackMassKg);
  const physiology = useMissionStore((s) => s.physiology);
  const nearLander = useMissionStore((s) => s.nearLander);
  const landerDistance = useMissionStore((s) => s.landerDistance);
  const landerStatusMessage = useMissionStore((s) => s.landerStatusMessage);
  const telemetry = useMissionStore((s) => s.telemetry);
  const headlampOn = useMissionStore((s) => s.headlampOn);
  const sunGlareFactor = useMissionStore((s) => s.sunGlareFactor);
  const discoveredRovers = useMissionStore((s) => s.discoveredRovers);
  const nearRover = useMissionStore((s) => s.nearRover);
  const customPinpoint = useMissionStore((s) => s.customPinpoint);
  const activeRoute = useMissionStore((s) => s.activeRoute);
  const evaStartTime = useMissionStore((s) => s.evaStartTime);
  const vaultedSamples = useMissionStore((s) => s.vaultedSamples);
  const areaCompleteModalOpen = useMissionStore((s) => s.areaCompleteModalOpen);
  const wristMapOpen = useMissionStore((s) => s.wristMapOpen);

  const startScan = useMissionStore((s) => s.startScan);
  const resupplyAndOffloadAtLander = useMissionStore((s) => s.resupplyAndOffloadAtLander);
  const discoverRover = useMissionStore((s) => s.discoverRover);
  const routeToUnexploredFrontier = useMissionStore((s) => s.routeToUnexploredFrontier);
  const clearLanderStatusMessage = useMissionStore((s) => s.clearLanderStatusMessage);
  const setAreaCompleteModalOpen = useMissionStore((s) => s.setAreaCompleteModalOpen);
  const switchAreaFromEva = useMissionStore((s) => s.switchAreaFromEva);
  const returnToOrbit = useMissionStore((s) => s.returnToOrbit);

  const [menuOpen, setMenuOpen] = useState(false);
  const [commsMessage, setCommsMessage] = useState(null);
  const commsStateRef = useRef({
    lastEvaStart: 0,
    prevCollectedCount: null,
    warnedStress: false,
    announcedVaultComplete: false,
  });

  useEffect(() => {
    if (!commsMessage) return undefined;
    const timer = setTimeout(() => setCommsMessage(null), 6000);
    return () => clearTimeout(timer);
  }, [commsMessage]);

  useEffect(() => {
    if (!landerStatusMessage) return undefined;
    const timer = setTimeout(() => {
      clearLanderStatusMessage();
    }, 3200);
    return () => clearTimeout(timer);
  }, [landerStatusMessage, clearLanderStatusMessage]);

  const [evaNow, setEvaNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setEvaNow(Date.now()), 100);
    return () => clearInterval(id);
  }, []);

  const evaElapsedMs = evaStartTime > 0 ? Math.max(0, evaNow - evaStartTime) : 0;
  const evaTotalSeconds = Math.floor(evaElapsedMs / 1000);
  const evaHours = Math.floor(evaTotalSeconds / 3600);
  const evaMinutes = Math.floor((evaTotalSeconds % 3600) / 60);
  const evaSeconds = evaTotalSeconds % 60;
  const evaCentis = Math.floor((evaElapsedMs % 1000) / 10);
  const evaClockText =
    evaHours > 0
      ? `${String(evaHours).padStart(2, '0')}:${String(evaMinutes).padStart(2, '0')}:${String(evaSeconds).padStart(2, '0')}`
      : `${String(evaMinutes).padStart(2, '0')}:${String(evaSeconds).padStart(2, '0')}:${String(evaCentis).padStart(2, '0')}`;

  const heartBpm = Math.round(
    64 + (100 - (physiology?.stamina ?? 100)) * 0.78 + (telemetry.slope > 18 ? 14 : 0)
  );
  const ambientTempC = Math.round(-78 + (sunGlareFactor || 0) * 38);
  const suitIntegrityPct = Math.max(
    45,
    Math.round(((physiology?.oxygen ?? 100) * 0.55 + (physiology?.heaterReserve ?? 100) * 0.45))
  );
  const oxyPct = Math.max(0, Math.min(100, physiology?.oxygen ?? 100));
  const thermPct = Math.max(0, Math.min(100, physiology?.heaterReserve ?? 100));
  const stamPct = Math.max(0, Math.min(100, physiology?.stamina ?? 100));

  const site = LANDING_ZONES_BY_ID[selectedSiteId] || LANDING_ZONES_BY_ID.jezero;
  const collectedIds = collectedSamples[site.id] || [];
  const vaultedCount = (vaultedSamples[site.id] || []).length;
  const isAllSiteVaulted = site.targets.length > 0 && vaultedCount >= site.targets.length;

  useEffect(() => {
    const tracker = commsStateRef.current;
    if (evaStartTime && tracker.lastEvaStart !== evaStartTime) {
      tracker.lastEvaStart = evaStartTime;
      tracker.prevCollectedCount = collectedIds.length;
      tracker.warnedStress = false;
      tracker.announcedVaultComplete = false;
      setCommsMessage(
        'CAPCOM // Valkyrie touchdown confirmed. Raise Field Slate [M] to sync NASA rover telemetry and plot your route.'
      );
      return;
    }

    if (tracker.prevCollectedCount === 0 && collectedIds.length === 1) {
      setCommsMessage(
        'SCIENCE // Spectral match verified against NASA archive. Pack mass updated—monitor stamina on >15° slopes.'
      );
    }
    tracker.prevCollectedCount = collectedIds.length;
  }, [evaStartTime, collectedIds.length]);

  useEffect(() => {
    const tracker = commsStateRef.current;
    const isStressed = carriedSamples.length >= 2 || (physiology?.oxygen ?? 100) < 30;
    if (isStressed && !tracker.warnedStress) {
      tracker.warnedStress = true;
      setCommsMessage(
        'FLIGHT // Metabolic O₂ burn elevated. Return to Lander airlock to offload cores and replenish reserves.'
      );
    } else if (!isStressed) {
      tracker.warnedStress = false;
    }
  }, [carriedSamples.length, physiology?.oxygen]);

  useEffect(() => {
    const tracker = commsStateRef.current;
    if (isAllSiteVaulted && !tracker.announcedVaultComplete) {
      tracker.announcedVaultComplete = true;
      setCommsMessage(
        'CAPCOM // Priority cores secured in ascent vault. Dust front approaching—cleared for orbital return.'
      );
    }
  }, [isAllSiteVaulted]);
  const activeTarget = site.targets.find((t) => t.id === activeTargetId) || null;
  const isActiveCollected = activeTarget ? collectedIds.includes(activeTarget.id) : false;
  const rover = site.nasaRover || null;
  const isRoverDiscovered = Boolean(discoveredRovers[site.id]);

  // Environmental & Physiological Visor Overlay States
  const isSlopeHazard = telemetry.slope > 25;
  const isSlopeCaution = telemetry.slope >= 15 && telemetry.slope <= 25;
  const isRadElevated = evaLayer === 'ENV' && telemetry.radiation > 0.78;
  const isLowOxygen = physiology.oxygen <= 30;
  const isHypothermia = physiology.bodyTempC <= 36.0;
  const isLowStamina = physiology.stamina <= 30;

  const hypoxiaSeverity = isLowOxygen ? Math.min(1, Math.max(0.25, (30 - physiology.oxygen) / 20)) : 0;
  const frostSeverity = isHypothermia ? Math.min(1, Math.max(0.25, (36.0 - physiology.bodyTempC) / 1.1)) : 0;
  const fatigueSeverity = isLowStamina ? Math.min(1, Math.max(0.25, (30 - physiology.stamina) / 22)) : 0;
  const hypoxiaClearRadius = Math.round(74 - hypoxiaSeverity * 12);

  const loadRatio = Math.min(1, carriedMassKg / (maxPackMassKg || 25));
  const isHeavyPack = loadRatio >= 0.4;

  const hasInteractFocus =
    nearLander || nearRover || (Boolean(activeTarget) && !isActiveCollected);

  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-4 sm:p-5">
      {/* Subtle Visor Glass & Scanline Texture */}
      <div className="visor-scanlines visor-vignette pointer-events-none fixed inset-0 -z-10" />

      {/* Auto-Tint Polarized Sun Visor Gradient when facing Martian Sun (minimized) */}
      {sunGlareFactor > 0.15 && (
        <div
          className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-1/3 bg-gradient-to-b from-amber-950/55 via-slate-950/20 to-transparent transition-opacity duration-200"
          style={{ opacity: Math.min(0.22, sunGlareFactor * 0.3) }}
        />
      )}

      {/* Subtle High-Contrast Optical Filter Frame when Headlamp Active */}
      {headlampOn && (
        <div className="pointer-events-none fixed inset-0 -z-10 shadow-[inset_0_0_45px_rgba(56,189,248,0.1)]" />
      )}

      {/* 1. HYPOTHERMIA VISOR FREEZING (Minimized Edge Indicator) */}
      {isHypothermia && (
        <div
          className="pointer-events-none fixed inset-0 -z-10 transition-opacity duration-300"
          style={{ opacity: 0.06 + frostSeverity * 0.1 }}
        >
          <div
            className="fixed inset-0"
            style={{
              background:
                'radial-gradient(circle at center, transparent 62%, rgba(125, 211, 252, 0.16) 84%, rgba(224, 242, 254, 0.35) 100%)',
            }}
          />
          <svg
            viewBox="0 0 1000 600"
            preserveAspectRatio="none"
            className="animate-frost-shimmer fixed inset-0 h-full w-full"
          >
            {/* Top-left frost fan */}
            <polygon points="0,0 160,0 110,32 130,65 72,82 35,120 0,140" fill="#e0f2fe" opacity="0.14" />
            <path d="M0,0 L120,55 M24,0 L80,75 M0,30 L92,90" stroke="#f0f9ff" strokeWidth="1.2" opacity="0.25" />
            {/* Top-right frost fan */}
            <polygon points="1000,0 840,0 890,32 870,65 928,82 965,120 1000,140" fill="#e0f2fe" opacity="0.14" />
            <path d="M1000,0 L880,55 M976,0 L920,75 M1000,30 L908,90" stroke="#f0f9ff" strokeWidth="1.2" opacity="0.25" />
            {/* Bottom-left frost fan */}
            <polygon points="0,600 160,600 112,565 130,532 72,515 35,475 0,460" fill="#bae6fd" opacity="0.14" />
            <path d="M0,600 L125,540 M28,600 L82,520 M0,565 L95,505" stroke="#f0f9ff" strokeWidth="1.2" opacity="0.25" />
            {/* Bottom-right frost fan */}
            <polygon points="1000,600 840,600 888,565 870,532 928,515 965,475 1000,460" fill="#bae6fd" opacity="0.14" />
            <path d="M1000,600 L875,540 M972,600 L918,520 M1000,565 L905,505" stroke="#f0f9ff" strokeWidth="1.2" opacity="0.25" />
            {/* Thin rim halo */}
            <rect x="0" y="0" width="1000" height="600" fill="none" stroke="#bae6fd" strokeWidth="4" opacity="0.22" />
          </svg>
        </div>
      )}

      {/* 2. LOW STAMINA / EXHAUSTION (Minimized Edge Indicator) */}
      {isLowStamina && (
        <div
          className="pointer-events-none fixed inset-0 -z-10"
          style={{ opacity: 0.06 + fatigueSeverity * 0.1 }}
        >
          <div
            className="animate-heartbeat-throb fixed inset-0"
            style={{
              background:
                'radial-gradient(circle at center, transparent 66%, rgba(220, 38, 38, 0.22) 88%, rgba(153, 27, 27, 0.42) 100%)',
            }}
          />
          <div
            className="animate-breath-fog fixed inset-x-0 bottom-0 h-[14%]"
            style={{
              background:
                'radial-gradient(ellipse at 50% 108%, rgba(226, 232, 240, 0.28) 0%, rgba(148, 163, 184, 0.1) 48%, transparent 74%)',
            }}
          />
        </div>
      )}

      {/* 3. LOW OXYGEN / HYPOXIA (Minimized Edge Indicator, No Blur) */}
      {isLowOxygen && (
        <div
          className="pointer-events-none fixed inset-0 -z-10"
          style={{ opacity: 0.08 + hypoxiaSeverity * 0.12 }}
        >
          <div
            className="animate-hypoxia-tunnel fixed inset-0"
            style={{
              background: `radial-gradient(circle at center, transparent ${hypoxiaClearRadius}%, rgba(127, 29, 29, 0.28) ${hypoxiaClearRadius + 14}%, rgba(3, 4, 8, 0.65) 100%)`,
            }}
          />
        </div>
      )}

      {/* 4. HEAVY PACK ENCUMBRANCE STRAIN (Minimized Edge Indicator) */}
      {isHeavyPack && (
        <div
          className="pointer-events-none fixed inset-0 -z-10 transition-opacity duration-300"
          style={{ opacity: 0.05 + loadRatio * 0.1 }}
        >
          <div
            className="fixed inset-0"
            style={{
              background:
                'radial-gradient(ellipse at 50% 42%, transparent 66%, rgba(217, 119, 6, 0.16) 88%, rgba(120, 53, 15, 0.32) 100%)',
            }}
          />
          <div className="fixed inset-x-0 bottom-0 h-8 bg-gradient-to-t from-amber-950/35 via-amber-900/10 to-transparent" />
        </div>
      )}

      {/* Diegetic Edge-of-Screen Slope / Radiation Alert Vignette (Minimized) */}
      {isSlopeHazard && (
        <div className="animate-hazard-vignette pointer-events-none fixed inset-0 -z-10 shadow-[inset_0_0_60px_rgba(239,68,68,0.15)]" />
      )}
      {!isSlopeHazard && isSlopeCaution && (
        <div className="pointer-events-none fixed inset-0 -z-10 shadow-[inset_0_0_50px_rgba(245,158,11,0.08)]" />
      )}
      {isRadElevated && (
        <div className="animate-hazard-vignette pointer-events-none fixed inset-0 -z-10 shadow-[inset_0_0_60px_rgba(168,85,247,0.12)]" />
      )}

      {/* Curved Astronaut Helmet Visor Bezel & Glass Vignette */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          boxShadow:
            'inset 0 0 90px 18px rgba(4, 7, 13, 0.78), inset 0 0 26px 4px rgba(34, 211, 238, 0.08)',
        }}
      />
      <div className="pointer-events-none fixed inset-2 rounded-[52px] border-[3px] border-slate-900/80 shadow-[0_0_0_24px_rgba(3,6,11,0.58)] ring-1 ring-cyan-300/15" />

      {/* TOP CURVED VISOR HUD ARC (Gravity-style EVA Visor Telemetry) */}
      <div className="pointer-events-none relative mx-auto mt-1 w-full max-w-6xl select-none px-6">
        {/* Background Curved SVG Visor Frame */}
        <svg
          viewBox="0 0 1200 155"
          preserveAspectRatio="none"
          className="h-28 w-full overflow-visible opacity-90 sm:h-32"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="visorCyanGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(56, 189, 248, 0.06)" />
              <stop offset="22%" stopColor="rgba(56, 189, 248, 0.28)" />
              <stop offset="50%" stopColor="rgba(125, 211, 252, 0.52)" />
              <stop offset="78%" stopColor="rgba(56, 189, 248, 0.28)" />
              <stop offset="100%" stopColor="rgba(56, 189, 248, 0.06)" />
            </linearGradient>
            <linearGradient id="visorFillGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="rgba(14, 116, 144, 0.22)" />
              <stop offset="100%" stopColor="rgba(8, 47, 73, 0.04)" />
            </linearGradient>
          </defs>
          {/* Outer curved rim */}
          <path
            d="M 28 38 Q 220 8 445 14 L 478 2 L 722 2 L 755 14 Q 980 8 1172 38"
            fill="none"
            stroke="url(#visorCyanGrad)"
            strokeWidth="2"
          />
          {/* Subtle translucent visor glass band */}
          <path
            d="M 40 48 Q 230 20 455 24 L 485 12 L 715 12 L 745 24 Q 970 20 1160 48 L 1142 96 Q 940 70 738 66 L 710 56 L 490 56 L 462 66 Q 260 70 58 96 Z"
            fill="url(#visorFillGrad)"
          />
          {/* Center clock housing underline */}
          <path
            d="M 465 56 L 735 56"
            stroke="rgba(125, 211, 252, 0.5)"
            strokeWidth="1.4"
          />
        </svg>

        {/* Overlay Telemetry Content aligned to the curved visor arc */}
        <div className="absolute inset-x-0 top-4 grid grid-cols-[1fr_auto_1fr] items-start gap-3 px-6">
          {/* UPPER LEFT: O2 / THERM Bars + Suit Wireframe + Temps */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2 font-mono text-[9px] tracking-[0.2em] text-cyan-200/70">
              <span>HUD SYS V2.1</span>
              <span className="hidden text-cyan-300/45 sm:inline">· {site.shortName}</span>
            </div>

            <div className="flex items-start gap-2.5">
              {/* Suit Integrity Wireframe Box */}
              <div className="hidden flex-col items-center rounded-lg border border-cyan-300/30 bg-cyan-950/35 px-2 py-1.5 backdrop-blur-sm sm:flex">
                <svg viewBox="0 0 36 42" className="h-9 w-8 text-cyan-300/85" fill="none" stroke="currentColor" strokeWidth="1.3">
                  <circle cx="18" cy="7" r="4.5" />
                  <path d="M11 14 L25 14 L27 25 L23 25 L22 18 L22 30 L24 40 L19.5 40 L18 31 L16.5 40 L12 40 L14 30 L14 18 L13 25 L9 25 Z" />
                  <line x1="13" y1="20" x2="23" y2="20" strokeOpacity="0.45" />
                </svg>
                <span className="mt-0.5 font-mono text-[8px] tracking-wider text-cyan-200/75">
                  INT {suitIntegrityPct}%
                </span>
              </div>

              {/* O2 / THERM Segmented Bars & Temps */}
              <div className="w-full max-w-[195px] space-y-1.5">
                <div className="space-y-0.5">
                  <div className="flex items-center justify-between font-mono text-[10px]">
                    <span className={oxyPct < 25 ? 'text-rose-300' : 'text-cyan-200/85'}>O₂</span>
                    <span className="text-cyan-100/80">{Math.round(oxyPct)}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-cyan-950/70 ring-1 ring-cyan-300/25">
                    <div
                      className={`h-full transition-all duration-300 ${
                        oxyPct < 25 ? 'bg-rose-400' : 'bg-cyan-300'
                      }`}
                      style={{ width: `${oxyPct}%` }}
                    />
                  </div>
                </div>

                <div className="space-y-0.5">
                  <div className="flex items-center justify-between font-mono text-[10px]">
                    <span className={thermPct < 25 ? 'text-amber-300' : 'text-cyan-200/75'}>THERM</span>
                    <span className="text-cyan-100/75">{Math.round(thermPct)}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-cyan-950/70 ring-1 ring-cyan-300/20">
                    <div
                      className={`h-full transition-all duration-300 ${
                        thermPct < 25 ? 'bg-amber-400' : 'bg-sky-400/85'
                      }`}
                      style={{ width: `${thermPct}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-baseline gap-2.5 pt-0.5 font-mono text-[11px]">
                  <span className="font-semibold text-cyan-100">
                    {(physiology?.bodyTempC ?? 36.8).toFixed(1)}°C
                  </span>
                  <span className="text-[10px] text-cyan-200/60">{ambientTempC}°C EXT</span>
                </div>
              </div>
            </div>
          </div>

          {/* TOP CENTER: EVA TIME Clock + Slim Compass */}
          <div className="flex flex-col items-center">
            <div className="flex flex-col items-center rounded-b-xl border-x border-b border-cyan-300/35 bg-slate-950/55 px-5 py-1 shadow-[0_6px_24px_rgba(34,211,238,0.14)] backdrop-blur-md">
              <div className="font-mono text-lg font-semibold tracking-[0.16em] text-white sm:text-xl">
                {evaClockText}
              </div>
              <div className="font-mono text-[9px] tracking-[0.26em] text-cyan-200/70">
                EVA TIME
              </div>
            </div>

            <div className="mt-2 hidden sm:block">
              <CompassStrip
                heading={telemetry.heading}
                targets={site.targets}
                playerPos={telemetry.position}
                collectedIds={collectedIds}
                landerDistance={landerDistance}
                rover={rover}
                isRoverDiscovered={isRoverDiscovered}
                customPinpoint={customPinpoint}
                activeRoute={activeRoute}
              />
            </div>

            {commsMessage && (
              <div className="mx-auto mt-2 max-w-xl rounded-full border border-cyan-500/30 bg-slate-950/75 px-4 py-1.5 text-center font-mono text-xs text-cyan-100 shadow-lg backdrop-blur-md">
                {commsMessage}
              </div>
            )}
          </div>

          {/* UPPER RIGHT: PACK / RAD + H2O / Stamina + Animated ECG + BPM */}
          <div className="flex flex-col items-end gap-1.5">
            <div className="flex items-center gap-2 font-mono text-[9px] tracking-[0.18em] text-cyan-200/75">
              <span>PACK {carriedMassKg.toFixed(0)}/{maxPackMassKg}KG</span>
              <span className="text-cyan-300/45">·</span>
              <span>RAD {telemetry.radiation} mSv</span>
            </div>

            <div className="w-full max-w-[195px] space-y-1.5">
              <div className="space-y-0.5">
                <div className="flex items-center justify-between font-mono text-[10px]">
                  <span className="text-cyan-100/80">{Math.round(stamPct)}%</span>
                  <span className={stamPct < 25 ? 'text-amber-300' : 'text-cyan-200/85'}>
                    H₂O / STAM
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-cyan-950/70 ring-1 ring-cyan-300/25">
                  <div
                    className={`ml-auto h-full transition-all duration-300 ${
                      stamPct < 25 ? 'bg-amber-400' : 'bg-cyan-300'
                    }`}
                    style={{ width: `${stamPct}%` }}
                  />
                </div>
              </div>

              {/* Animated ECG Waveform + BPM */}
              <div className="hidden rounded-lg border border-cyan-300/25 bg-cyan-950/30 px-2 py-1 backdrop-blur-sm sm:block">
                <svg viewBox="0 0 180 26" className="h-5 w-full overflow-hidden">
                  <polyline
                    fill="none"
                    stroke="rgba(103, 232, 249, 0.9)"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points="0,16 18,16 23,13 27,16 32,16 35,20 39,4 43,23 47,16 54,16 59,13 64,16 86,16 91,13 95,16 100,16 103,20 107,4 111,23 115,16 122,16 127,13 132,16 154,16 159,13 163,16 168,16 171,20 175,4 179,23"
                  >
                    <animateTransform
                      attributeName="transform"
                      type="translate"
                      from="0 0"
                      to="-68 0"
                      dur={`${(60 / Math.max(50, heartBpm)).toFixed(2)}s`}
                      repeatCount="indefinite"
                    />
                  </polyline>
                </svg>
                <div className="mt-0.5 flex items-center justify-between font-mono text-[10px] text-cyan-100/85">
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300" />
                    {heartBpm} bpm
                  </span>
                  <span className="text-[9px] text-cyan-200/60">4.3 PSI</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CENTER SUBTLE RETICLE & DIEGETIC INTERACTION PROMPT */}
      <div className="relative flex flex-1 items-center justify-center">
        <div className="flex flex-col items-center">
          <div
            className={`relative flex items-center justify-center transition-all duration-200 ${
              hasInteractFocus ? 'h-9 w-9' : 'h-5 w-5'
            }`}
          >
            <div
              className={`h-1 w-1 rounded-full ${
                nearLander
                  ? 'bg-amber-400'
                  : nearRover
                    ? 'bg-cyan-400'
                    : activeTarget
                      ? 'bg-sky-400'
                      : 'bg-white/60'
              }`}
            />
            {hasInteractFocus ? (
              <>
                <span
                  className={`absolute top-0 left-0 h-2 w-2 border-t border-l ${
                    nearLander
                      ? 'border-amber-400'
                      : nearRover
                        ? 'border-cyan-400'
                        : 'border-sky-400'
                  }`}
                />
                <span
                  className={`absolute top-0 right-0 h-2 w-2 border-t border-r ${
                    nearLander
                      ? 'border-amber-400'
                      : nearRover
                        ? 'border-cyan-400'
                        : 'border-sky-400'
                  }`}
                />
                <span
                  className={`absolute bottom-0 left-0 h-2 w-2 border-b border-l ${
                    nearLander
                      ? 'border-amber-400'
                      : nearRover
                        ? 'border-cyan-400'
                        : 'border-sky-400'
                  }`}
                />
                <span
                  className={`absolute bottom-0 right-0 h-2 w-2 border-b border-r ${
                    nearLander
                      ? 'border-amber-400'
                      : nearRover
                        ? 'border-cyan-400'
                        : 'border-sky-400'
                  }`}
                />
              </>
            ) : (
              <div className="absolute inset-0 rounded-full border border-white/25" />
            )}
          </div>

          {/* Lander Airlock Resupply & Offload Prompt */}
          {nearLander && !scanningState.active && (
            <button
              type="button"
              onClick={resupplyAndOffloadAtLander}
              className="pointer-events-auto mt-4 flex items-center gap-2 rounded border border-amber-400/60 bg-black/70 px-3 py-1 font-mono text-[11px] tracking-wider text-amber-100 shadow-lg backdrop-blur-md transition hover:border-amber-300 hover:bg-amber-500/25"
            >
              <Rocket className="h-3.5 w-3.5 text-amber-300" />
              <span>[E] RESUPPLY &amp; OFFLOAD</span>
            </button>
          )}

          {/* Direct Target Scan / Core Extraction Prompt */}
          {activeTarget && !nearLander && (
            <div className="mt-4 flex flex-col items-center">
              {scanningState.active ? (
                <div className="w-52 rounded border border-amber-400/50 bg-black/70 px-3 py-1.5 backdrop-blur-md">
                  <div className="mb-1 flex items-center justify-between font-mono text-[10px] text-amber-200">
                    <span>DRILLING &amp; CORING...</span>
                    <span>{Math.round(scanningState.progress)}%</span>
                  </div>
                  <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full bg-amber-400 transition-all duration-75"
                      style={{ width: `${scanningState.progress}%` }}
                    />
                  </div>
                </div>
              ) : isActiveCollected ? (
                <div className="flex items-center gap-1.5 rounded border border-emerald-400/40 bg-black/65 px-2.5 py-1 font-mono text-[10px] tracking-wider text-emerald-300 backdrop-blur-md">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>CORE LOGGED // {activeTarget.code}</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => startScan(activeTarget.id)}
                  className="pointer-events-auto flex items-center gap-2 rounded border border-sky-400/55 bg-black/70 px-3 py-1 font-mono text-[11px] tracking-wider text-sky-100 shadow-lg backdrop-blur-md transition hover:border-sky-300 hover:bg-sky-500/25"
                >
                  <ScanLine className="h-3.5 w-3.5 text-sky-300" />
                  <span>
                    [E] SCAN &amp; CORE · ? ({activeTarget.code})
                  </span>
                </button>
              )}
            </div>
          )}

          {/* NASA Rover Telemetry Sync Prompt */}
          {nearRover && !nearLander && !activeTarget && !scanningState.active && rover && (
            <button
              type="button"
              onClick={() => {
                discoverRover(site.id);
                routeToUnexploredFrontier();
              }}
              className="pointer-events-auto mt-4 flex items-center gap-2 rounded border border-cyan-400/60 bg-black/70 px-3 py-1 font-mono text-[11px] tracking-wider text-cyan-100 shadow-lg backdrop-blur-md transition hover:border-cyan-300 hover:bg-cyan-500/25"
            >
              <Navigation className="h-3.5 w-3.5 text-cyan-300" />
              <span>[E] SYNC ROVER · {rover.shortName}</span>
            </button>
          )}

          {/* Brief Lander Airlock / Status Micro-Toast */}
          {landerStatusMessage && (
            <div className="mt-2.5 rounded border border-emerald-400/45 bg-black/70 px-2.5 py-1 font-mono text-[10px] tracking-wider text-emerald-200 backdrop-blur-md">
              {landerStatusMessage}
            </div>
          )}
        </div>
      </div>

      {/* Interactive Hand-Held / Forearm-Mounted ARES-V Field Slate HUD */}
      <FieldSlateHUD
        site={site}
        activeTarget={activeTarget}
        isActiveCollected={isActiveCollected}
      />

      {/* BOTTOM-LEFT: EVA Command Menu Button (Home Page & Area Switcher) */}
      {!wristMapOpen && !menuOpen && !areaCompleteModalOpen && (
        <button
          type="button"
          onClick={() => {
            if (document.pointerLockElement) {
              try {
                document.exitPointerLock();
              } catch {
                // ignore
              }
            }
            setMenuOpen(true);
          }}
          className="pointer-events-auto fixed bottom-6 left-6 z-20 flex items-center gap-2 rounded-xl border border-cyan-300/30 bg-slate-950/75 px-3.5 py-2 font-mono text-xs tracking-wider text-cyan-100 shadow-lg backdrop-blur-md transition hover:border-cyan-300/70 hover:bg-slate-900/90"
        >
          <Menu className="h-4 w-4 text-cyan-300" />
          <span>MENU</span>
        </button>
      )}

      {/* EVA COMMAND MENU MODAL: Return to Home Page or Switch Area */}
      {menuOpen && (
        <div
          onClick={() => setMenuOpen(false)}
          className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-black/55 p-4 backdrop-blur-xs"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-cyan-300/25 bg-slate-950/95 p-5 text-slate-100 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <div className="font-mono text-[10px] tracking-[0.2em] text-cyan-300">
                  ARES-V // MISSION MENU
                </div>
                <h2 className="text-base font-semibold text-white">{site.name}</h2>
              </div>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="Close menu"
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-2.5">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  returnToOrbit();
                }}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 py-2.5 text-xs font-semibold text-slate-950 transition hover:bg-cyan-400"
              >
                <Home className="h-4 w-4" />
                <span>BACK TO HOME PAGE (ORBIT)</span>
              </button>

              <div className="pt-2">
                <div className="mb-2 font-mono text-[10px] tracking-[0.18em] text-slate-400">
                  DEPLOY TO OTHER AREAS
                </div>
                <div className="space-y-1.5">
                  {LANDING_ZONES.map((zone) => {
                    const isCurrent = zone.id === site.id;
                    const vaultedCount = (vaultedSamples[zone.id] || []).length;
                    return (
                      <button
                        key={zone.id}
                        type="button"
                        disabled={isCurrent}
                        onClick={() => {
                          setMenuOpen(false);
                          switchAreaFromEva(zone.id);
                        }}
                        className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-xs transition ${
                          isCurrent
                            ? 'border-cyan-400/40 bg-cyan-500/10 text-cyan-200'
                            : 'border-white/10 bg-white/[0.03] text-slate-200 hover:border-cyan-400/50 hover:bg-white/[0.07]'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <MapPin className="h-3.5 w-3.5 text-cyan-300" />
                          <div>
                            <div className="font-semibold">{zone.name}</div>
                            <div className="text-[10px] text-slate-400">
                              {zone.nasaRover?.shortName} · {vaultedCount} / {zone.targets.length} Vaulted
                            </div>
                          </div>
                        </div>
                        <span className="font-mono text-[10px] text-cyan-300">
                          {isCurrent ? 'ACTIVE' : 'DEPLOY →'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SECTOR COMPLETE MODAL: Shown after collecting & offloading all area samples */}
      {areaCompleteModalOpen && (
        <div
          onClick={() => setAreaCompleteModalOpen(false)}
          className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl border border-emerald-400/35 bg-slate-950/95 p-5 text-slate-100 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-3">
              <div>
                <div className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.2em] text-emerald-300">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>SECTOR COMPLETE // ALL {site.targets.length} / {site.targets.length} CORES VAULTED</span>
                </div>
                <h2 className="mt-1 text-lg font-semibold text-white">{site.name}</h2>
                <p className="mt-0.5 text-xs text-slate-300">
                  All local geological specimens have been scanned and offloaded to the lander vault.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAreaCompleteModalOpen(false)}
                aria-label="Stay in sector"
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-2">
              <div className="font-mono text-[10px] tracking-[0.18em] text-cyan-300">
                SELECT NEXT LANDING AREA
              </div>
              <div className="grid grid-cols-1 gap-2">
                {LANDING_ZONES.filter((z) => z.id !== site.id).map((zone) => {
                  const vaultedCount = (vaultedSamples[zone.id] || []).length;
                  return (
                    <button
                      key={zone.id}
                      type="button"
                      onClick={() => switchAreaFromEva(zone.id)}
                      className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-left transition hover:border-cyan-400/55 hover:bg-cyan-500/10"
                    >
                      <div>
                        <div className="text-sm font-semibold text-white">{zone.name}</div>
                        <div className="text-[11px] text-slate-400">
                          {zone.nasaRover?.shortName} · {zone.coordinates} · {vaultedCount}/{zone.targets.length} Vaulted
                        </div>
                      </div>
                      <span className="flex items-center gap-1 rounded-lg bg-cyan-500/20 px-2.5 py-1 font-mono text-[10px] font-semibold text-cyan-200">
                        <Globe2 className="h-3 w-3" />
                        <span>GO TO AREA</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setAreaCompleteModalOpen(false);
                  returnToOrbit();
                }}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-cyan-500 py-2.5 text-xs font-semibold text-slate-950 transition hover:bg-cyan-400"
              >
                <Home className="h-4 w-4" />
                <span>BACK TO HOME PAGE</span>
              </button>
              <button
                type="button"
                onClick={() => setAreaCompleteModalOpen(false)}
                className="rounded-xl border border-white/15 bg-white/[0.04] px-4 py-2.5 text-xs font-medium text-slate-200 transition hover:bg-white/10"
              >
                STAY HERE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BOTTOM EDGE: Single-Line Minimalist Hotkey Bar */}
      <div className="pointer-events-none mx-auto text-center font-mono text-[10px] tracking-[0.14em] text-white/60">
        [M / TAB] ENLARGED MAP · [1-4] DATA LAYERS · [R] RADAR PULSE · [E] SCAN / INTERACT · [O] HOME
      </div>
    </div>
  );
}
