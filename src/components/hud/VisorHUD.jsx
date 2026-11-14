import React, { useEffect, useMemo } from 'react';
import { CheckCircle2, Navigation, Rocket, ScanLine } from 'lucide-react';
import { LANDING_ZONES_BY_ID } from '../../data/landingZones';
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

  const startScan = useMissionStore((s) => s.startScan);
  const resupplyAndOffloadAtLander = useMissionStore((s) => s.resupplyAndOffloadAtLander);
  const discoverRover = useMissionStore((s) => s.discoverRover);
  const routeToUnexploredFrontier = useMissionStore((s) => s.routeToUnexploredFrontier);
  const clearLanderStatusMessage = useMissionStore((s) => s.clearLanderStatusMessage);

  useEffect(() => {
    if (!landerStatusMessage) return undefined;
    const timer = setTimeout(() => {
      clearLanderStatusMessage();
    }, 3200);
    return () => clearTimeout(timer);
  }, [landerStatusMessage, clearLanderStatusMessage]);

  const site = LANDING_ZONES_BY_ID[selectedSiteId] || LANDING_ZONES_BY_ID.jezero;
  const collectedIds = collectedSamples[site.id] || [];
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

      {/* Subtle Helmet Visor Corner Ticks */}
      <div className="pointer-events-none fixed inset-3 rounded-3xl border border-white/[0.04]" />

      {/* TOP EDGE: Clean Micro-Watermark + Slim Compass */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3">
        <div className="space-y-0.5">
          <div className="font-mono text-[11px] tracking-[0.18em] text-white/75">
            ARES-V // EVA FIELD SYSTEM
          </div>
          <div className="font-mono text-[10px] text-white/45">
            {site.shortName} · {site.coordinates}
          </div>
        </div>

        <div className="hidden justify-self-center sm:block">
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

        <div />
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
              onMouseEnter={resupplyAndOffloadAtLander}
              onClick={resupplyAndOffloadAtLander}
              className="pointer-events-auto mt-4 flex items-center gap-2 rounded border border-amber-400/60 bg-black/70 px-3 py-1 font-mono text-[11px] tracking-wider text-amber-100 shadow-lg backdrop-blur-md transition hover:border-amber-300 hover:bg-amber-500/25"
            >
              <Rocket className="h-3.5 w-3.5 text-amber-300" />
              <span>HOVER AIRLOCK TO RESUPPLY</span>
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
                  onMouseEnter={() => startScan(activeTarget.id)}
                  onClick={() => startScan(activeTarget.id)}
                  className="pointer-events-auto flex items-center gap-2 rounded border border-sky-400/55 bg-black/70 px-3 py-1 font-mono text-[11px] tracking-wider text-sky-100 shadow-lg backdrop-blur-md transition hover:border-sky-300 hover:bg-sky-500/25"
                >
                  <ScanLine className="h-3.5 w-3.5 text-sky-300" />
                  <span>
                    HOVER TARGET TO SCAN · {activeTarget.code} ({activeTarget.massKg ?? 5.5} KG)
                  </span>
                </button>
              )}
            </div>
          )}

          {/* NASA Rover Telemetry Sync Prompt */}
          {nearRover && !nearLander && !activeTarget && !scanningState.active && rover && (
            <button
              type="button"
              onMouseEnter={() => {
                discoverRover(site.id);
                routeToUnexploredFrontier();
              }}
              onClick={() => {
                discoverRover(site.id);
                routeToUnexploredFrontier();
              }}
              className="pointer-events-auto mt-4 flex items-center gap-2 rounded border border-cyan-400/60 bg-black/70 px-3 py-1 font-mono text-[11px] tracking-wider text-cyan-100 shadow-lg backdrop-blur-md transition hover:border-cyan-300 hover:bg-cyan-500/25"
            >
              <Navigation className="h-3.5 w-3.5 text-cyan-300" />
              <span>HOVER ROVER TO SYNC · {rover.shortName}</span>
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

      {/* BOTTOM EDGE: Single-Line Minimalist Hotkey Bar */}
      <div className="pointer-events-none mx-auto text-center font-mono text-[10px] tracking-[0.14em] text-white/60">
        [M / RIGHT-CLICK] ENLARGED MAP · [1-4] DATA LAYERS · [R] RADAR PULSE · HOVER OBJECTS TO INTERACT
      </div>
    </div>
  );
}
