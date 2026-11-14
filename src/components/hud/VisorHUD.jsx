import React, { useEffect, useMemo, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Compass,
  Eye,
  LogOut,
  MapPin,
  Mountain,
  Navigation,
  Radio,
  Rocket,
  ScanLine,
  Sparkles,
  X,
} from 'lucide-react';
import { EVA_LAYERS, LANDING_ZONES_BY_ID } from '../../data/landingZones';
import { useMissionStore } from '../../store/useMissionStore';
import RoverSpecimenPhoto from './RoverSpecimenPhoto';

const LAYER_ICONS = {
  OPTICAL: Eye,
  TOPOGRAPHY: Mountain,
  SPECTRAL: Sparkles,
  ENV: Radio,
};

function CompassStrip({
  heading,
  targets,
  playerPos,
  collectedIds,
  landerDistance,
  rover,
  roverDistance,
  isRoverDiscovered,
  customPinpoint,
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
  const angleDelta = (targetDeg) => {
    let d = ((targetDeg - heading + 540) % 360) - 180;
    return d;
  };

  const getArrowAndPct = (tx, tz) => {
    const dx = tx - playerPos[0];
    const dz = tz - playerPos[1];
    const bearing = ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
    const delta = angleDelta(bearing);
    const pct = 50 + (Math.max(-72, Math.min(72, delta)) / 75) * 48;
    const arrow =
      Math.abs(delta) <= 25
        ? '↑'
        : delta > 135 || delta < -135
          ? '↓'
          : delta > 0
            ? '→'
            : '←';
    return { pct, arrow };
  };

  // Bearing to Mars Lander Base at (0, 8)
  const landerNav = getArrowAndPct(0, 8);
  const roverNav = rover ? getArrowAndPct(rover.position[0], rover.position[1]) : null;
  const customNav = customPinpoint?.position
    ? getArrowAndPct(customPinpoint.position[0], customPinpoint.position[1])
    : null;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative flex h-6 w-56 items-center justify-center overflow-hidden rounded border border-white/15 bg-black/40 font-mono text-[10px] backdrop-blur-md sm:w-64">
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

        {/* Lander Base bearing triangle on top edge of compass */}
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
            className={`absolute top-0.5 h-2 w-2 -translate-x-1/2 rotate-45 ${
              isRoverDiscovered
                ? 'bg-emerald-300 shadow-[0_0_6px_#34d399]'
                : 'animate-pulse bg-amber-300 shadow-[0_0_6px_#fbbf24]'
            }`}
          />
        )}

        {/* Active Custom / Unexplored Frontier Pinpoint */}
        {customNav && (
          <span
            style={{ left: `${customNav.pct}%` }}
            title={customPinpoint.name}
            className="absolute bottom-0.5 h-2 w-2 -translate-x-1/2 rotate-45 bg-purple-400 shadow-[0_0_6px_#c084fc]"
          />
        )}

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
              className={`absolute bottom-0.5 h-1.5 w-1.5 -translate-x-1/2 rounded-full ${
                !tgt.roverExplored
                  ? 'bg-purple-400 shadow-[0_0_6px_#c084fc]'
                  : 'bg-amber-400 shadow-[0_0_6px_#fbbf24]'
              }`}
            />
          );
        })}

        {/* Current heading readout */}
        <div className="absolute right-1.5 rounded bg-black/70 px-1 text-[9px] text-sky-300">
          {String(heading).padStart(3, '0')}°
        </div>
      </div>

      {/* Subtle Lander & NASA Rover Distance + Bearing Strip */}
      <div className="flex items-center gap-1.5 font-mono text-[9px] tracking-[0.12em]">
        <div className="rounded border border-cyan-400/20 bg-black/35 px-2 py-0.5 text-cyan-200/80 backdrop-blur-sm">
          {landerNav.arrow} LANDER: {Math.round(landerDistance)}m
        </div>
        {rover && roverNav && (
          <div
            className={`rounded border px-2 py-0.5 backdrop-blur-sm ${
              isRoverDiscovered
                ? 'border-emerald-400/35 bg-emerald-950/35 text-emerald-200'
                : 'border-amber-400/30 bg-amber-950/30 text-amber-200'
            }`}
          >
            {roverNav.arrow} {isRoverDiscovered ? '📌 ROVER' : '📡 ROVER'}: {Math.round(roverDistance)}m
          </div>
        )}
      </div>
    </div>
  );
}

const MAP_RANGE = 34; // covers [-34m .. +34m]
const MAP_SPAN = MAP_RANGE * 2;
const MAP_PX = 200;

function toSvgCoords(wx, wz) {
  return [
    ((wx + MAP_RANGE) / MAP_SPAN) * MAP_PX,
    ((wz + MAP_RANGE) / MAP_SPAN) * MAP_PX,
  ];
}

function SurfaceReconMap({
  site,
  telemetry,
  collectedIds,
  isRoverDiscovered,
  customPinpoint,
  activeRoute,
  expanded,
  onToggleExpand,
  onDiscoverRover,
  onSetCustomPinpoint,
  onClearRoute,
  onRouteUnexplored,
}) {
  const rover = site.nasaRover;
  const [px, pz] = telemetry.position;
  const [playerSx, playerSy] = toSvgCoords(px, pz);
  const [landerSx, landerSy] = toSvgCoords(0, 8);

  const handleSvgClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = ((e.clientX - rect.left) / rect.width) * MAP_PX;
    const sy = ((e.clientY - rect.top) / rect.height) * MAP_PX;
    const wx = Number(((sx / MAP_PX) * MAP_SPAN - MAP_RANGE).toFixed(1));
    const wz = Number(((sy / MAP_PX) * MAP_SPAN - MAP_RANGE).toFixed(1));

    let isUnexplored = true;
    if (rover?.exploredCenter) {
      const dExp = Math.hypot(wx - rover.exploredCenter[0], wz - rover.exploredCenter[1]);
      isUnexplored = dExp > rover.exploredRadius;
    }

    onSetCustomPinpoint({
      id: 'custom-pinpoint',
      name: isUnexplored ? `Frontier Pin (${wx}, ${wz})` : `Survey Pin (${wx}, ${wz})`,
      position: [wx, wz],
      isUnexplored,
    });
  };

  if (!rover) return null;

  const [rx, ry] = toSvgCoords(rover.position[0], rover.position[1]);
  const [ex, ey] = toSvgCoords(rover.exploredCenter[0], rover.exploredCenter[1]);
  const exploredSvgR = (rover.exploredRadius / MAP_SPAN) * MAP_PX;
  const [ux, uy] = toSvgCoords(rover.unexploredSector.center[0], rover.unexploredSector.center[1]);
  const unexploredSvgR = (rover.unexploredSector.radius / MAP_SPAN) * MAP_PX;

  const traverseSvgPts = rover.traversePoints
    .map(([tx, tz]) => toSvgCoords(tx, tz).join(','))
    .join(' ');

  const routeSvgPts = activeRoute?.points
    ? activeRoute.points.map(([tx, , tz]) => toSvgCoords(tx, tz).join(',')).join(' ')
    : null;

  const unexploredRemaining = site.targets.filter(
    (t) => !t.roverExplored && !collectedIds.includes(t.id)
  ).length;

  return (
    <div className="pointer-events-auto ml-auto flex flex-col items-end gap-1 font-mono">
      <button
        type="button"
        onClick={onToggleExpand}
        className="flex items-center gap-1.5 rounded border border-white/15 bg-black/60 px-2 py-0.5 text-[10px] tracking-wider text-sky-200 backdrop-blur-md transition hover:border-sky-400/50 hover:bg-black/80"
      >
        <MapPin className="h-3 w-3 text-cyan-300" />
        <span>
          RECON MAP {isRoverDiscovered ? `· 📌 ${rover.shortName}` : '· 📡 ROVER UNPINNED'}
        </span>
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>

      {expanded && (
        <div className="w-56 rounded-lg border border-white/15 bg-black/75 p-2 shadow-2xl backdrop-blur-md sm:w-64">
          <div className="mb-1.5 flex items-center justify-between text-[9px] tracking-wider">
            <span className={isRoverDiscovered ? 'text-cyan-300' : 'text-amber-300'}>
              {isRoverDiscovered ? `📌 ${rover.code} PINNED` : '📡 LOCATE NASA ROVER TO UNLOCK'}
            </span>
            <span className="text-purple-300">{unexploredRemaining} UNVISITED</span>
          </div>

          <div className="relative overflow-hidden rounded border border-white/10 bg-slate-950/90">
            <svg
              viewBox={`0 0 ${MAP_PX} ${MAP_PX}`}
              onClick={handleSvgClick}
              className="block h-44 w-full cursor-crosshair select-none sm:h-48"
            >
              {/* Subtle radar grid lines */}
              <g stroke="rgba(148, 163, 184, 0.14)" strokeWidth="0.7">
                <line x1="50" y1="0" x2="50" y2={MAP_PX} />
                <line x1="100" y1="0" x2="100" y2={MAP_PX} />
                <line x1="150" y1="0" x2="150" y2={MAP_PX} />
                <line x1="0" y1="50" x2={MAP_PX} y2="50" />
                <line x1="0" y1="100" x2={MAP_PX} y2="100" />
                <line x1="0" y1="150" x2={MAP_PX} y2="150" />
              </g>

              {/* Explored by NASA Rover Sector */}
              <circle
                cx={ex}
                cy={ey}
                r={exploredSvgR}
                fill={isRoverDiscovered ? 'rgba(34, 211, 238, 0.08)' : 'rgba(245, 158, 11, 0.05)'}
                stroke={isRoverDiscovered ? '#22d3ee' : 'rgba(245, 158, 11, 0.4)'}
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              {isRoverDiscovered && (
                <text
                  x={ex}
                  y={ey - exploredSvgR + 9}
                  textAnchor="middle"
                  fill="rgba(103, 232, 249, 0.78)"
                  fontSize="6.5"
                >
                  ROVER EXPLORED
                </text>
              )}

              {/* Unexplored Mars Frontier Sector (highlighted once Rover is pinned) */}
              {isRoverDiscovered && (
                <g>
                  <circle
                    cx={ux}
                    cy={uy}
                    r={unexploredSvgR}
                    fill="rgba(168, 85, 247, 0.12)"
                    stroke="#c084fc"
                    strokeWidth="1.25"
                    strokeDasharray="4 2"
                  />
                  <text
                    x={ux}
                    y={uy - unexploredSvgR + 9}
                    textAnchor="middle"
                    fill="#e9d5ff"
                    fontSize="6.5"
                    fontWeight="bold"
                  >
                    UNEXPLORED FRONTIER
                  </text>
                </g>
              )}

              {/* Historical Rover Traverse Trail */}
              {isRoverDiscovered && traverseSvgPts && (
                <polyline
                  points={traverseSvgPts}
                  fill="none"
                  stroke="#22d3ee"
                  strokeWidth="1.3"
                  strokeDasharray="2 2"
                  opacity="0.8"
                />
              )}

              {/* Active A* Safe Traverse Route */}
              {routeSvgPts && (
                <polyline
                  points={routeSvgPts}
                  fill="none"
                  stroke="#34d399"
                  strokeWidth="1.8"
                  opacity="0.95"
                />
              )}

              {/* Lander Base Marker */}
              <g
                onClick={(e) => {
                  e.stopPropagation();
                  onSetCustomPinpoint({
                    id: 'lander-base',
                    name: 'ARES-V Lander Airlock',
                    position: [0, 5.95],
                    isUnexplored: false,
                  });
                }}
                className="cursor-pointer"
              >
                <polygon
                  points={`${landerSx},${landerSy - 4.5} ${landerSx + 4.5},${landerSy + 3.5} ${landerSx - 4.5},${landerSy + 3.5}`}
                  fill="#38bdf8"
                  stroke="#0f172a"
                  strokeWidth="0.8"
                />
                <text
                  x={landerSx}
                  y={landerSy + 10}
                  textAnchor="middle"
                  fill="#bae6fd"
                  fontSize="6.5"
                >
                  BASE
                </text>
              </g>

              {/* Geological Target Pins */}
              {site.targets.map((tgt) => {
                const [tx, ty] = toSvgCoords(tgt.position[0], tgt.position[1]);
                const collected = collectedIds.includes(tgt.id);
                const isFrontier = !tgt.roverExplored;
                const fill = collected ? '#10b981' : isFrontier ? '#c084fc' : '#fbbf24';
                return (
                  <g
                    key={tgt.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSetCustomPinpoint({
                        id: tgt.id,
                        name: tgt.name,
                        position: tgt.position,
                        isUnexplored: isFrontier,
                      });
                    }}
                    className="cursor-pointer"
                  >
                    <circle cx={tx} cy={ty} r={6} fill="transparent" />
                    {isFrontier && !collected && isRoverDiscovered && (
                      <circle
                        cx={tx}
                        cy={ty}
                        r={5.2}
                        fill="none"
                        stroke="#c084fc"
                        strokeWidth="0.8"
                        opacity="0.85"
                      />
                    )}
                    <circle
                      cx={tx}
                      cy={ty}
                      r={3.1}
                      fill={fill}
                      stroke="#090d16"
                      strokeWidth="0.8"
                    />
                  </g>
                );
              })}

              {/* NASA Rover Pinpoint Marker */}
              <g
                onClick={(e) => {
                  e.stopPropagation();
                  onDiscoverRover(site.id);
                  onSetCustomPinpoint({
                    id: rover.id,
                    name: rover.name,
                    position: rover.position,
                    isUnexplored: false,
                  });
                }}
                className="cursor-pointer"
              >
                <circle
                  cx={rx}
                  cy={ry}
                  r={7.5}
                  fill="none"
                  stroke={isRoverDiscovered ? '#22d3ee' : '#f59e0b'}
                  strokeWidth="1"
                  opacity="0.85"
                />
                <rect
                  x={rx - 3.2}
                  y={ry - 3.2}
                  width="6.4"
                  height="6.4"
                  transform={`rotate(45 ${rx} ${ry})`}
                  fill={isRoverDiscovered ? '#22d3ee' : '#f59e0b'}
                  stroke="#090d16"
                  strokeWidth="0.8"
                />
                <text
                  x={rx}
                  y={ry - 8}
                  textAnchor="middle"
                  fill={isRoverDiscovered ? '#67e8f9' : '#fde68a'}
                  fontSize="6.5"
                  fontWeight="bold"
                >
                  {isRoverDiscovered ? rover.shortName : 'ROVER?'}
                </text>
              </g>

              {/* Active Custom / Unexplored Pinpoint Crosshair */}
              {customPinpoint?.position &&
                (() => {
                  const [cxp, cyp] = toSvgCoords(
                    customPinpoint.position[0],
                    customPinpoint.position[1]
                  );
                  return (
                    <g>
                      <circle
                        cx={cxp}
                        cy={cyp}
                        r={6.5}
                        fill="none"
                        stroke="#e879f9"
                        strokeWidth="1.2"
                      />
                      <circle cx={cxp} cy={cyp} r={2.2} fill="#f0abfc" />
                    </g>
                  );
                })()}

              {/* Astronaut Live Position + Heading Pointer */}
              <g transform={`translate(${playerSx}, ${playerSy}) rotate(${telemetry.heading})`}>
                <polygon
                  points="0,-5.5 3.6,4 0,1.8 -3.6,4"
                  fill="#ffffff"
                  stroke="#0284c7"
                  strokeWidth="0.8"
                />
              </g>
            </svg>
            <div className="border-t border-white/10 bg-black/50 px-2 py-0.5 text-[8.5px] text-white/60">
              CLICK MAP ANYWHERE TO DROP PINPOINT ROUTE
            </div>
          </div>

          <div className="mt-1.5 flex items-center gap-1">
            <button
              type="button"
              onClick={onRouteUnexplored}
              className="flex flex-1 items-center justify-center gap-1 rounded border border-purple-400/50 bg-purple-500/20 px-2 py-1 text-[9.5px] font-medium tracking-wider text-purple-100 transition hover:border-purple-300 hover:bg-purple-500/35"
            >
              <Compass className="h-3 w-3 text-purple-300" />
              <span>EXPLORE UNVISITED</span>
            </button>

            {!isRoverDiscovered ? (
              <button
                type="button"
                onClick={() => onDiscoverRover(site.id)}
                className="rounded border border-amber-400/50 bg-amber-500/20 px-2 py-1 text-[9.5px] text-amber-100 transition hover:bg-amber-500/35"
              >
                PIN ROVER
              </button>
            ) : activeRoute ? (
              <button
                type="button"
                onClick={onClearRoute}
                className="rounded border border-white/20 bg-white/10 px-2 py-1 text-[9.5px] text-white/80 transition hover:bg-white/20"
              >
                CLEAR
              </button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

export default function VisorHUD() {
  const selectedSiteId = useMissionStore((s) => s.selectedSiteId) || 'jezero';
  const evaLayer = useMissionStore((s) => s.evaLayer);
  const activeTargetId = useMissionStore((s) => s.activeTargetId);
  const observedTargetId = useMissionStore((s) => s.observedTargetId);
  const scanningState = useMissionStore((s) => s.scanningState);
  const collectedSamples = useMissionStore((s) => s.collectedSamples);
  const vaultedSamples = useMissionStore((s) => s.vaultedSamples);
  const carriedSamples = useMissionStore((s) => s.carriedSamples);
  const carriedMassKg = useMissionStore((s) => s.carriedMassKg);
  const maxPackMassKg = useMissionStore((s) => s.maxPackMassKg);
  const physiology = useMissionStore((s) => s.physiology);
  const landerReserves = useMissionStore((s) => s.landerReserves);
  const nearLander = useMissionStore((s) => s.nearLander);
  const landerDistance = useMissionStore((s) => s.landerDistance);
  const landerStatusMessage = useMissionStore((s) => s.landerStatusMessage);
  const sampleDrawerOpen = useMissionStore((s) => s.sampleDrawerOpen);
  const telemetry = useMissionStore((s) => s.telemetry);
  const headlampOn = useMissionStore((s) => s.headlampOn);
  const sunGlareFactor = useMissionStore((s) => s.sunGlareFactor);
  const wristMapOpen = useMissionStore((s) => s.wristMapOpen);
  const discoveredRovers = useMissionStore((s) => s.discoveredRovers);
  const nearRover = useMissionStore((s) => s.nearRover);
  const roverDistance = useMissionStore((s) => s.roverDistance);
  const customPinpoint = useMissionStore((s) => s.customPinpoint);
  const activeRoute = useMissionStore((s) => s.activeRoute);

  const setEvaLayer = useMissionStore((s) => s.setEvaLayer);
  const observeTarget = useMissionStore((s) => s.observeTarget);
  const closeObservation = useMissionStore((s) => s.closeObservation);
  const startScan = useMissionStore((s) => s.startScan);
  const resupplyAndOffloadAtLander = useMissionStore((s) => s.resupplyAndOffloadAtLander);
  const discoverRover = useMissionStore((s) => s.discoverRover);
  const setCustomPinpoint = useMissionStore((s) => s.setCustomPinpoint);
  const clearActiveRoute = useMissionStore((s) => s.clearActiveRoute);
  const routeToUnexploredFrontier = useMissionStore((s) => s.routeToUnexploredFrontier);
  const clearLanderStatusMessage = useMissionStore((s) => s.clearLanderStatusMessage);
  const toggleSampleDrawer = useMissionStore((s) => s.toggleSampleDrawer);
  const toggleCriticalTest = useMissionStore((s) => s.toggleCriticalTest);
  const returnToOrbit = useMissionStore((s) => s.returnToOrbit);

  const [previewDrawerId, setPreviewDrawerId] = useState(null);
  const [reconMapExpanded, setReconMapExpanded] = useState(true);

  useEffect(() => {
    if (!landerStatusMessage) return undefined;
    const timer = setTimeout(() => {
      clearLanderStatusMessage();
    }, 3200);
    return () => clearTimeout(timer);
  }, [landerStatusMessage, clearLanderStatusMessage]);

  const site = LANDING_ZONES_BY_ID[selectedSiteId] || LANDING_ZONES_BY_ID.jezero;
  const collectedIds = collectedSamples[site.id] || [];
  const vaultedIds = vaultedSamples[site.id] || [];
  const carriedIds = carriedSamples.map((s) => s.id);
  const activeTarget = site.targets.find((t) => t.id === activeTargetId) || null;
  const isActiveCollected = activeTarget ? collectedIds.includes(activeTarget.id) : false;
  const activeLayerObj = EVA_LAYERS.find((l) => l.id === evaLayer);
  const rover = site.nasaRover || null;
  const isRoverDiscovered = Boolean(discoveredRovers[site.id]);

  const isSlopeHazard = telemetry.slope > 25;
  const isSlopeCaution = telemetry.slope >= 15 && telemetry.slope <= 25;
  const isRadElevated = evaLayer === 'ENV' && telemetry.radiation > 0.78;
  const isLowOxygen = physiology.oxygen <= 30;
  const isHypothermia = physiology.bodyTempC <= 36.0;
  const isLowStamina = physiology.stamina <= 30;

  const hypoxiaSeverity = isLowOxygen ? Math.min(1, Math.max(0.25, (30 - physiology.oxygen) / 20)) : 0;
  const frostSeverity = isHypothermia ? Math.min(1, Math.max(0.25, (36.0 - physiology.bodyTempC) / 1.1)) : 0;
  const fatigueSeverity = isLowStamina ? Math.min(1, Math.max(0.25, (30 - physiology.stamina) / 22)) : 0;
  const hypoxiaClearRadius = Math.round(54 - hypoxiaSeverity * 26);

  const tempNormPct = Math.min(100, Math.max(8, ((physiology.bodyTempC - 34.5) / 3.0) * 100));
  const loadRatio = Math.min(1, carriedMassKg / (maxPackMassKg || 25));
  const isHeavyPack = loadRatio >= 0.4;
  const isOverburdened = loadRatio >= 0.78;
  const speedPenaltyPct = Math.round(Math.pow(loadRatio, 1.1) * 58);
  const packPct = Math.min(100, loadRatio * 100);

  const microBars = [
    {
      label: 'O₂',
      testKey: 'O₂',
      value: `${Math.round(physiology.oxygen)}%`,
      pct: physiology.oxygen,
      barColor:
        physiology.oxygen <= 30
          ? 'bg-red-500 animate-pulse'
          : physiology.oxygen <= 45
            ? 'bg-amber-400'
            : 'bg-cyan-400',
      textColor:
        physiology.oxygen <= 30
          ? 'text-red-300 font-semibold'
          : physiology.oxygen <= 45
            ? 'text-amber-300'
            : 'text-cyan-200/85',
    },
    {
      label: 'CORE',
      testKey: 'CORE',
      value: `${physiology.bodyTempC.toFixed(1)}°C`,
      pct: tempNormPct,
      barColor: isHypothermia ? 'bg-cyan-300 animate-pulse' : 'bg-emerald-400',
      textColor: isHypothermia ? 'text-cyan-200 font-semibold' : 'text-emerald-200/85',
    },
    {
      label: 'STAM',
      testKey: 'STAM',
      value: `${Math.round(physiology.stamina)}%`,
      pct: physiology.stamina,
      barColor: isLowStamina ? 'bg-rose-400 animate-pulse' : 'bg-sky-400',
      textColor: isLowStamina ? 'text-rose-300 font-semibold' : 'text-white/80',
    },
    {
      label: 'PACK',
      testKey: 'PACK',
      value:
        carriedMassKg > 0
          ? `${carriedMassKg.toFixed(1)}/${maxPackMassKg}KG (-${speedPenaltyPct}%)`
          : `${carriedMassKg.toFixed(1)}/${maxPackMassKg}KG`,
      pct: packPct,
      barColor: isOverburdened
        ? 'bg-amber-500 animate-pulse'
        : isHeavyPack
          ? 'bg-amber-400'
          : 'bg-slate-300',
      textColor: isOverburdened
        ? 'text-amber-300 font-semibold'
        : isHeavyPack
          ? 'text-amber-200'
          : 'text-white/75',
    },
  ];

  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-4 sm:p-5">
      {/* Subtle Visor Glass & Scanline Texture */}
      <div className="visor-scanlines visor-vignette pointer-events-none fixed inset-0 -z-10" />

      {/* Auto-Tint Polarized Sun Visor Gradient when facing Martian Sun */}
      {sunGlareFactor > 0.15 && (
        <div
          className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-1/2 bg-gradient-to-b from-amber-950/75 via-slate-950/35 to-transparent transition-opacity duration-200"
          style={{ opacity: Math.min(0.85, sunGlareFactor) }}
        />
      )}

      {/* Subtle High-Contrast Optical Filter Frame when Headlamp Active */}
      {headlampOn && (
        <div className="pointer-events-none fixed inset-0 -z-10 shadow-[inset_0_0_65px_rgba(56,189,248,0.16)]" />
      )}

      {/* 1. HYPOTHERMIA VISOR FREEZING: Icy Edge Glow + Crystalline Hoarfrost Creeping from Corners */}
      {isHypothermia && (
        <div
          className="pointer-events-none fixed inset-0 -z-10 transition-opacity duration-300"
          style={{ opacity: 0.38 + frostSeverity * 0.62 }}
        >
          <div
            className="fixed inset-0"
            style={{
              background:
                'radial-gradient(circle at center, transparent 42%, rgba(125, 211, 252, 0.24) 72%, rgba(224, 242, 254, 0.66) 100%)',
            }}
          />
          <svg
            viewBox="0 0 1000 600"
            preserveAspectRatio="none"
            className="animate-frost-shimmer fixed inset-0 h-full w-full"
          >
            {/* Top-left frost fan */}
            <polygon points="0,0 240,0 165,48 195,98 110,122 52,185 0,210" fill="#e0f2fe" opacity="0.34" />
            <path d="M0,0 L190,85 M35,0 L125,115 M0,45 L145,140 M75,0 L70,155" stroke="#f0f9ff" strokeWidth="1.8" opacity="0.7" />
            {/* Top-right frost fan */}
            <polygon points="1000,0 760,0 835,48 805,98 890,122 948,185 1000,210" fill="#e0f2fe" opacity="0.34" />
            <path d="M1000,0 L810,85 M965,0 L875,115 M1000,45 L855,140 M925,0 L930,155" stroke="#f0f9ff" strokeWidth="1.8" opacity="0.7" />
            {/* Bottom-left frost fan */}
            <polygon points="0,600 250,600 175,548 205,498 112,475 55,410 0,380" fill="#bae6fd" opacity="0.36" />
            <path d="M0,600 L195,510 M40,600 L132,480 M0,550 L150,455 M82,600 L72,440" stroke="#f0f9ff" strokeWidth="1.8" opacity="0.72" />
            {/* Bottom-right frost fan */}
            <polygon points="1000,600 750,600 825,548 795,498 888,475 945,410 1000,380" fill="#bae6fd" opacity="0.36" />
            <path d="M1000,600 L805,510 M960,600 L868,480 M1000,550 L850,455 M918,600 L928,440" stroke="#f0f9ff" strokeWidth="1.8" opacity="0.72" />
            {/* Rim ice halo */}
            <rect x="0" y="0" width="1000" height="600" fill="none" stroke="#bae6fd" strokeWidth="18" opacity="0.45" />
          </svg>
        </div>
      )}

      {/* 2. LOW STAMINA / EXHAUSTION: Double-Beat Cardiac Pulse + Lower-Visor Breath Condensation Fog */}
      {isLowStamina && (
        <div
          className="pointer-events-none fixed inset-0 -z-10"
          style={{ opacity: 0.42 + fatigueSeverity * 0.58 }}
        >
          <div
            className="animate-heartbeat-throb fixed inset-0"
            style={{
              background:
                'radial-gradient(circle at center, transparent 48%, rgba(220, 38, 38, 0.34) 80%, rgba(153, 27, 27, 0.72) 100%)',
            }}
          />
          <div
            className="animate-breath-fog fixed inset-x-0 bottom-0 h-[44%]"
            style={{
              background:
                'radial-gradient(ellipse at 50% 105%, rgba(226, 232, 240, 0.46) 0%, rgba(148, 163, 184, 0.2) 48%, transparent 74%)',
            }}
          />
        </div>
      )}

      {/* 3. LOW OXYGEN / HYPOXIA: Constricting Crimson/Black Tunnel Vision & Peripheral Blur */}
      {isLowOxygen && (
        <div
          className="pointer-events-none fixed inset-0 -z-10"
          style={{ opacity: 0.48 + hypoxiaSeverity * 0.52 }}
        >
          <div
            className="animate-hypoxia-tunnel fixed inset-0"
            style={{
              background: `radial-gradient(circle at center, transparent ${hypoxiaClearRadius}%, rgba(127, 29, 29, 0.45) ${hypoxiaClearRadius + 16}%, rgba(3, 4, 8, 0.94) 100%)`,
            }}
          />
          {physiology.oxygen <= 22 && (
            <div
              className="fixed inset-0 backdrop-blur-[2.5px]"
              style={{
                WebkitMaskImage: 'radial-gradient(circle at center, transparent 36%, black 76%)',
                maskImage: 'radial-gradient(circle at center, transparent 36%, black 76%)',
              }}
            />
          )}
        </div>
      )}

      {/* 4. HEAVY PACK ENCUMBRANCE STRAIN: Warm Amber Gravity-Load Peripheral Vignette */}
      {isHeavyPack && (
        <div
          className="pointer-events-none fixed inset-0 -z-10 transition-opacity duration-300"
          style={{ opacity: 0.25 + loadRatio * 0.65 }}
        >
          <div
            className="fixed inset-0"
            style={{
              background:
                'radial-gradient(ellipse at 50% 42%, transparent 56%, rgba(217, 119, 6, 0.26) 86%, rgba(120, 53, 15, 0.56) 100%)',
            }}
          />
          <div className="fixed inset-x-0 bottom-0 h-28 bg-gradient-to-t from-amber-950/55 via-amber-900/15 to-transparent" />
        </div>
      )}

      {/* Diegetic Edge-of-Screen Slope / Radiation Alert Vignette */}
      {isSlopeHazard && (
        <div className="animate-hazard-vignette pointer-events-none fixed inset-0 -z-10 shadow-[inset_0_0_110px_rgba(239,68,68,0.5)]" />
      )}
      {!isSlopeHazard && isSlopeCaution && (
        <div className="pointer-events-none fixed inset-0 -z-10 shadow-[inset_0_0_80px_rgba(245,158,11,0.24)]" />
      )}
      {isRadElevated && (
        <div className="animate-hazard-vignette pointer-events-none fixed inset-0 -z-10 shadow-[inset_0_0_95px_rgba(168,85,247,0.35)]" />
      )}

      {/* Subtle Helmet Visor Corner Ticks */}
      <div className="pointer-events-none fixed inset-3 border border-white/[0.04] rounded-3xl" />

      {/* TOP EDGE */}
      <div className="flex items-start justify-between gap-3">
        {/* Left: Micro-Label */}
        <div className="space-y-0.5">
          <div className="font-mono text-[11px] tracking-[0.18em] text-white/70">
            ARES-V // EVA VISOR
          </div>
          <div className="font-mono text-[10px] text-white/45">
            {site.shortName} · {site.coordinates}
          </div>
        </div>

        {/* Center: Thin Compass Strip + Lander & NASA Rover Markers */}
        <div className="hidden sm:block">
          <CompassStrip
            heading={telemetry.heading}
            targets={site.targets}
            playerPos={telemetry.position}
            collectedIds={collectedIds}
            landerDistance={landerDistance}
            rover={rover}
            roverDistance={roverDistance}
            isRoverDiscovered={isRoverDiscovered}
            customPinpoint={customPinpoint}
          />
        </div>

        {/* Right: RAD/SLOPE Badges + Collapsible Recon Map & Rover Pinpoint */}
        <div className="relative flex flex-col items-end">
          <div className="flex items-center gap-2 font-mono text-[11px]">
            <div
              className={`rounded border px-2 py-0.5 backdrop-blur-md ${
                isRadElevated
                  ? 'border-purple-400/50 bg-purple-950/50 text-purple-200'
                  : 'border-white/15 bg-black/40 text-white/80'
              }`}
            >
              RAD: {telemetry.radiation.toFixed(2)} mSv/d
            </div>

            <div
              className={`rounded border px-2 py-0.5 backdrop-blur-md transition-colors ${
                isSlopeHazard
                  ? 'border-red-400/70 bg-red-950/60 text-red-200'
                  : isSlopeCaution
                  ? 'border-amber-400/50 bg-amber-950/50 text-amber-200'
                  : 'border-white/15 bg-black/40 text-white/80'
              }`}
            >
              SLOPE: {telemetry.slope.toFixed(1)}°
            </div>
          </div>

          <div className="absolute top-full right-0 z-20 mt-2">
            <SurfaceReconMap
              site={site}
              telemetry={telemetry}
              collectedIds={collectedIds}
              isRoverDiscovered={isRoverDiscovered}
              customPinpoint={customPinpoint}
              activeRoute={activeRoute}
              expanded={reconMapExpanded || wristMapOpen}
              onToggleExpand={() => setReconMapExpanded((v) => !v)}
              onDiscoverRover={discoverRover}
              onSetCustomPinpoint={setCustomPinpoint}
              onClearRoute={clearActiveRoute}
              onRouteUnexplored={routeToUnexploredFrontier}
            />
          </div>
        </div>
      </div>

      {/* CENTER DIEGETIC RETICLE & TARGET / AIRLOCK PROMPT */}
      <div className="relative flex flex-1 items-center justify-center">
        <div className="flex flex-col items-center">
          {/* Dynamic Reticle Crosshair */}
          <div
            className={`relative flex items-center justify-center transition-all duration-200 ${
              activeTarget || nearLander || nearRover ? 'h-9 w-9' : 'h-5 w-5'
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
            {activeTarget || nearLander || nearRover ? (
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

          {/* Progressive Disclosure Mars Lander Airlock Resupply & Offload Prompt (within 4.0m) */}
          {nearLander && !scanningState.active && (
            <div className="mt-4 flex flex-col items-center gap-1">
              <button
                type="button"
                onClick={resupplyAndOffloadAtLander}
                className="pointer-events-auto flex items-center gap-2 rounded border border-amber-400/60 bg-black/75 px-3 py-1.5 font-mono text-[11px] tracking-wider text-amber-100 shadow-lg backdrop-blur-md transition hover:border-amber-300 hover:bg-amber-500/25"
              >
                <Rocket className="h-3.5 w-3.5 text-amber-300" />
                <span>[E] AIRLOCK RESUPPLY &amp; OFFLOAD SAMPLES</span>
              </button>
              <div className="rounded border border-white/10 bg-black/60 px-2.5 py-0.5 font-mono text-[9px] tracking-[0.14em] text-slate-300 backdrop-blur-sm">
                SHIP O₂:{' '}
                <span className="text-cyan-300">{Math.round(landerReserves.oxygenReserve)}%</span>
                {' | '}THERM:{' '}
                <span className="text-amber-300">{Math.round(landerReserves.heaterReserve)}%</span>
                {' | '}VAULT:{' '}
                <span className="text-emerald-300">
                  {vaultedIds.length}/{site.targets.length} CORES
                </span>
              </div>
            </div>
          )}

          {/* Progressive Disclosure Target Observation & Scan Prompt */}
          {activeTarget && !nearLander && (
            <div className="mt-4 flex flex-col items-center gap-1.5">
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
                <div className="pointer-events-auto flex max-w-sm items-center gap-2.5 rounded border border-emerald-400/40 bg-black/75 p-2 backdrop-blur-md">
                  <RoverSpecimenPhoto target={activeTarget} compact />
                  <div className="text-left">
                    <div className="font-mono text-[10px] font-medium text-emerald-300">
                      ✓ CORE LOGGED // {activeTarget.code}
                    </div>
                    <div className="mt-0.5 font-mono text-[9.5px] text-white/85">
                      {activeTarget.name}
                    </div>
                    <div className="mt-0.5 font-mono text-[9px] leading-snug text-white/60">
                      {activeTarget.mineralReadout}
                    </div>
                  </div>
                </div>
              ) : observedTargetId === activeTarget.id ? (
                <div className="pointer-events-auto w-72 rounded-lg border border-sky-400/50 bg-black/80 p-2.5 shadow-2xl backdrop-blur-md sm:w-80">
                  <div className="mb-1.5 flex items-center justify-between gap-2 font-mono text-[10px]">
                    <span className="truncate text-sky-300">
                      {activeTarget.code} · {activeTarget.instrument}
                    </span>
                    <button
                      type="button"
                      onClick={closeObservation}
                      aria-label="Close specimen observation"
                      className="rounded p-0.5 text-white/50 transition hover:bg-white/10 hover:text-white"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>

                  <RoverSpecimenPhoto target={activeTarget} />

                  <div className="mt-2 font-mono text-[11px] font-medium text-white">
                    {activeTarget.name}
                  </div>
                  {activeTarget.roverRef && (
                    <div className="mt-0.5 font-mono text-[9px] text-amber-200/85">
                      REF: {activeTarget.roverRef}
                    </div>
                  )}
                  <div className="mt-1 font-mono text-[9.5px] leading-relaxed text-white/75">
                    {activeTarget.mineralReadout}
                  </div>

                  <button
                    type="button"
                    onClick={() => startScan(activeTarget.id)}
                    className="mt-2 flex w-full items-center justify-center gap-1.5 rounded border border-sky-400/55 bg-sky-500/20 px-2.5 py-1.5 font-mono text-[10px] tracking-wider text-sky-100 transition hover:border-sky-300 hover:bg-sky-500/35"
                  >
                    <ScanLine className="h-3.5 w-3.5 text-sky-300" />
                    <span>[E] EXTRACT &amp; CORE ({activeTarget.massKg ?? 5.5} KG)</span>
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => observeTarget(activeTarget.id)}
                  className="pointer-events-auto flex items-center gap-2 rounded border border-sky-400/50 bg-black/70 px-3 py-1.5 font-mono text-[11px] tracking-wider text-sky-100 shadow-lg backdrop-blur-md transition hover:border-sky-300 hover:bg-sky-500/25"
                >
                  <Camera className="h-3.5 w-3.5 text-sky-300" />
                  <span>[E] OBSERVE SPECIMEN</span>
                  <span className="text-white/50">
                    · {activeTarget.code} ({activeTarget.massKg ?? 5.5} KG)
                  </span>
                </button>
              )}
            </div>
          )}

          {/* Progressive Disclosure NASA Rover Discovery & Frontier Pinpoint Prompt */}
          {nearRover && !nearLander && !activeTarget && !scanningState.active && rover && (
            <div className="mt-4 flex flex-col items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  discoverRover(site.id);
                  routeToUnexploredFrontier();
                }}
                className="pointer-events-auto flex items-center gap-2 rounded border border-cyan-400/65 bg-black/75 px-3 py-1.5 font-mono text-[11px] tracking-wider text-cyan-100 shadow-lg backdrop-blur-md transition hover:border-cyan-300 hover:bg-cyan-500/25"
              >
                <Navigation className="h-3.5 w-3.5 text-cyan-300" />
                <span>[E] {rover.shortName} TELEMETRY // PIN &amp; ROUTE TO UNEXPLORED FRONTIER</span>
              </button>
              <div className="rounded border border-purple-400/35 bg-black/65 px-2.5 py-0.5 font-mono text-[9px] tracking-[0.1em] text-purple-200 backdrop-blur-sm">
                UNVISITED: {rover.unexploredSector.name} ({rover.unexploredSector.reason})
              </div>
            </div>
          )}

          {/* Brief Airlock Sync / Pack Full Confirmation Micro-Toast */}
          {landerStatusMessage && (
            <div className="mt-2.5 rounded border border-emerald-400/45 bg-black/70 px-2.5 py-1 font-mono text-[10px] tracking-wider text-emerald-200 backdrop-blur-md">
              {landerStatusMessage}
            </div>
          )}

          {/* Physiological / Hazard Micro-Tags (only when critical/active) */}
          {isLowOxygen && (
            <div className="mt-2.5 animate-pulse rounded border border-red-400/75 bg-red-950/75 px-2.5 py-0.5 font-mono text-[10px] tracking-wider text-red-100 shadow-[0_0_16px_rgba(239,68,68,0.45)] backdrop-blur-md">
              ⚠ HYPOXIA CRITICAL // O₂ {Math.round(physiology.oxygen)}% · RETURN TO LANDER
            </div>
          )}
          {isHypothermia && (
            <div className="mt-2 rounded border border-cyan-300/75 bg-sky-950/75 px-2.5 py-0.5 font-mono text-[10px] tracking-wider text-cyan-100 shadow-[0_0_16px_rgba(56,189,248,0.4)] backdrop-blur-md">
              ❄ HYPOTHERMIA CRITICAL // CORE {physiology.bodyTempC.toFixed(1)}°C · VISOR FROST
            </div>
          )}
          {isLowStamina && (
            <div className="mt-2 rounded border border-rose-400/65 bg-rose-950/70 px-2.5 py-0.5 font-mono text-[10px] tracking-wider text-rose-100 backdrop-blur-md">
              ⚡ EXHAUSTION // STAMINA {Math.round(physiology.stamina)}% · HEAVY RESPIRATION
            </div>
          )}
          {isHeavyPack && (
            <div
              className={`mt-2 rounded border px-2.5 py-0.5 font-mono text-[10px] tracking-wider backdrop-blur-md ${
                isOverburdened
                  ? 'border-amber-400/80 bg-amber-950/80 text-amber-100 shadow-[0_0_14px_rgba(245,158,11,0.35)]'
                  : 'border-amber-400/50 bg-amber-950/60 text-amber-200'
              }`}
            >
              ⚖ {isOverburdened ? 'OVERBURDENED // SPRINT LOCKED' : 'HEAVY PACK LOAD'} //{' '}
              {carriedMassKg.toFixed(1)} KG · SPEED -{speedPenaltyPct}% · OFFLOAD AT LANDER
            </div>
          )}
          {isSlopeHazard && (
            <div className="mt-2 rounded border border-red-400/50 bg-red-950/60 px-2.5 py-0.5 font-mono text-[10px] tracking-wider text-red-200 backdrop-blur-md">
              ⚠ SLOPE HAZARD &gt; 25°
            </div>
          )}
        </div>
      </div>

      {/* BOTTOM EDGE + COLLAPSIBLE SAMPLE DRAWER */}
      <div className="flex flex-col gap-2">
        {/* Progressive Disclosure Collapsible Sample Drawer */}
        {sampleDrawerOpen && (
          <div className="pointer-events-auto ml-auto max-h-72 w-full max-w-md overflow-y-auto rounded-lg border border-white/15 bg-black/75 p-3 shadow-2xl backdrop-blur-md">
            <div className="mb-2 flex items-center justify-between border-b border-white/10 pb-1.5">
              <span className="font-mono text-[11px] tracking-wider text-white/85">
                CORE &amp; SAMPLE LOG // {site.shortName}
              </span>
              <span className="font-mono text-[10px] text-sky-300">
                {vaultedIds.length}/{site.targets.length} VAULTED · {carriedSamples.length} IN PACK
              </span>
            </div>
            <div className="space-y-2">
              {site.targets.map((tgt) => {
                const vaulted = vaultedIds.includes(tgt.id);
                const carried = carriedIds.includes(tgt.id);
                const done = vaulted || carried;
                const isExpanded = done && previewDrawerId === tgt.id;
                const dx = tgt.position[0] - telemetry.position[0];
                const dz = tgt.position[1] - telemetry.position[1];
                const dist = Math.sqrt(dx * dx + dz * dz).toFixed(1);
                return (
                  <div
                    key={tgt.id}
                    onClick={() => {
                      if (done) {
                        setPreviewDrawerId(isExpanded ? null : tgt.id);
                      }
                    }}
                    className={`rounded border px-2.5 py-1.5 ${
                      done ? 'cursor-pointer transition hover:border-sky-400/50' : ''
                    } ${
                      vaulted
                        ? 'border-emerald-400/35 bg-emerald-950/25'
                        : carried
                          ? 'border-amber-400/35 bg-amber-950/20'
                          : 'border-white/10 bg-white/[0.03]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2.5">
                      {done && <RoverSpecimenPhoto target={tgt} compact />}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2 font-mono text-[11px]">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <CheckCircle2
                              className={`h-3.5 w-3.5 shrink-0 ${
                                vaulted
                                  ? 'text-emerald-400'
                                  : carried
                                    ? 'text-amber-300'
                                    : 'text-white/25'
                              }`}
                            />
                            <span
                              className={`truncate ${
                                vaulted
                                  ? 'text-emerald-200'
                                  : carried
                                    ? 'text-amber-200'
                                    : 'text-white/85'
                              }`}
                            >
                              {tgt.code} · {tgt.name}
                            </span>
                          </div>
                          <span className="shrink-0 text-[10px] text-white/55">
                            {vaulted
                              ? 'VAULTED'
                              : carried
                                ? `IN PACK · ${(tgt.massKg ?? 5.5).toFixed(1)}KG`
                                : `${dist}m · ${(tgt.massKg ?? 5.5).toFixed(1)}KG`}
                          </span>
                        </div>
                        <div className="mt-0.5 pl-5 font-mono text-[10px] text-white/65">
                          {done ? tgt.mineralReadout : tgt.scienceGoal}
                        </div>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="mt-2 space-y-1 border-t border-white/10 pt-2">
                        <RoverSpecimenPhoto target={tgt} />
                        {tgt.roverRef && (
                          <div className="font-mono text-[9.5px] text-amber-200/85">
                            REF: {tgt.roverRef}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Active Data Layer Caption (Progressive Disclosure when non-optical layer selected) */}
        {evaLayer !== 'OPTICAL' && activeLayerObj && (
          <div className="mx-auto rounded border border-white/15 bg-black/50 px-2.5 py-0.5 font-mono text-[10px] tracking-wider text-sky-200/90 backdrop-blur-md">
            {activeLayerObj.description}
          </div>
        )}

        {/* Bottom Control Row */}
        <div className="flex flex-wrap items-end justify-between gap-2">
          {/* Bottom-Left Ultra-Slim Physiology & Pack Micro-Bars (4px height; click O2/CORE/STAM/PACK to test FX) */}
          <div className="pointer-events-auto w-48 rounded border border-white/10 bg-black/40 px-2.5 py-1.5 font-mono backdrop-blur-sm sm:w-52">
            <div className="space-y-1">
              {microBars.map((bar) => (
                <div
                  key={bar.label}
                  onClick={bar.testKey ? () => toggleCriticalTest(bar.testKey) : undefined}
                  title={
                    bar.testKey
                      ? `Click to toggle critical ${bar.label} visual effect`
                      : 'Current carried core mass'
                  }
                  className={`space-y-0.5 rounded px-0.5 transition ${
                    bar.testKey ? 'cursor-pointer hover:bg-white/10' : ''
                  }`}
                >
                  <div className="flex items-center justify-between text-[9px] leading-none tracking-wider">
                    <span className="text-white/55">{bar.label}</span>
                    <span className={bar.textColor}>{bar.value}</span>
                  </div>
                  <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      className={`h-full ${bar.barColor} opacity-85 transition-all duration-150`}
                      style={{ width: `${Math.min(100, Math.max(2, bar.pct))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Center: Minimal 4-Icon Layer Switcher */}
          <div className="pointer-events-auto mx-auto flex items-center gap-1 rounded-full border border-white/15 bg-black/45 p-1 backdrop-blur-md lg:mx-0">
            {EVA_LAYERS.map((layer) => {
              const Icon = LAYER_ICONS[layer.id];
              const active = evaLayer === layer.id;
              return (
                <button
                  key={layer.id}
                  type="button"
                  onClick={() => setEvaLayer(layer.id)}
                  className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[11px] tracking-wider transition ${
                    active
                      ? 'border border-sky-400/45 bg-sky-500/25 text-white'
                      : 'border border-transparent text-white/60 hover:bg-white/5 hover:text-white/90'
                  }`}
                >
                  <Icon className={`h-3 w-3 ${active ? 'text-sky-300' : 'text-white/50'}`} />
                  <span>
                    [{layer.key}] {layer.shortLabel}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Right: Sample Counter Badge & Return to Orbit */}
          <div className="pointer-events-auto flex items-center gap-2 font-mono text-[11px]">
            <button
              type="button"
              onClick={toggleSampleDrawer}
              className="flex items-center gap-1.5 rounded border border-white/15 bg-black/45 px-2.5 py-1 text-white/85 backdrop-blur-md transition hover:border-white/30 hover:bg-black/60"
            >
              <span>
                VAULT: <span className="text-emerald-300">{vaultedIds.length}/{site.targets.length}</span>
                {carriedSamples.length > 0 && (
                  <span className="ml-1 text-amber-300">(+{carriedSamples.length})</span>
                )}
              </span>
              {sampleDrawerOpen ? (
                <ChevronDown className="h-3 w-3 text-white/50" />
              ) : (
                <ChevronUp className="h-3 w-3 text-white/50" />
              )}
            </button>

            <button
              type="button"
              onClick={returnToOrbit}
              className="flex items-center gap-1.5 rounded border border-white/15 bg-black/45 px-2.5 py-1 text-white/80 backdrop-blur-md transition hover:border-amber-400/40 hover:bg-amber-500/15 hover:text-amber-200"
            >
              <LogOut className="h-3 w-3" />
              <span>[ESC / ORBIT]</span>
            </button>
          </div>
        </div>

        {/* Single Unobtrusive 1-Line Bottom Hotkey Hint Bar */}
        <div className="pointer-events-auto mx-auto text-center font-mono text-[10px] tracking-wider text-white/75 opacity-60 transition-opacity hover:opacity-100">
          {wristMapOpen
            ? 'INSPECTING WRIST HOLOGRAM · CLICK TARGET OR LANDER PIN FOR A* ROUTE · [M/TAB] STOW'
            : '[M/TAB] WRIST MAP · [P] SAFE ROUTE · [R] RADAR · [F] HEADLAMP · [1-4] LAYERS · [E] OBSERVE/AIRLOCK · [C] SAMPLES'}
        </div>
      </div>
    </div>
  );
}
