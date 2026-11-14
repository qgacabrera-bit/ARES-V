import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Camera,
  CheckCircle2,
  Compass,
  Eye,
  Flame,
  Layers,
  MapPin,
  Mountain,
  Navigation,
  Radio,
  Rocket,
  ScanLine,
  ShieldAlert,
  Sparkles,
  ThermometerSnowflake,
  Weight,
  X,
} from 'lucide-react';
import { EVA_LAYERS, LANDING_ZONES_BY_ID } from '../../data/landingZones';
import { useMissionStore } from '../../store/useMissionStore';
import { computeSafeTraversePath } from '../../utils/pathfinding';
import { fetchLiveRoverTraverse, getMarsAlbedoCrop } from '../../utils/roverPathLoader';
import { generateSectorHeatmap } from '../../utils/heatmapGenerator';
import {
  CHUNK_SIZE,
  MAP_3X3_RANGE,
  MAP_3X3_SPAN,
  getActive3x3Chunks,
  worldToChunk,
} from '../../utils/terrainMath';
import RoverSpecimenPhoto from './RoverSpecimenPhoto';

const MAP_RANGE = MAP_3X3_RANGE; // 51m half-span => 3x3 chunks (102m x 102m)
const MAP_SPAN = MAP_3X3_SPAN;
const MAP_PX = 220;

const LAYER_ICONS = {
  OPTICAL: Eye,
  TOPOGRAPHY: Mountain,
  SPECTRAL: Layers,
  ENV: Radio,
};

function toSvgCoords(wx, wz, centerX = 0, centerZ = 0) {
  return [
    ((wx - centerX + MAP_RANGE) / MAP_SPAN) * MAP_PX,
    ((wz - centerZ + MAP_RANGE) / MAP_SPAN) * MAP_PX,
  ];
}

export default function FieldSlateHUD({ site, activeTarget, isActiveCollected }) {
  const wristMapOpen = useMissionStore((s) => s.wristMapOpen);
  const slateTab = useMissionStore((s) => s.slateTab);
  const inspectedTargetId = useMissionStore((s) => s.inspectedTargetId);
  const evaLayer = useMissionStore((s) => s.evaLayer);
  const collectedSamples = useMissionStore((s) => s.collectedSamples);
  const vaultedSamples = useMissionStore((s) => s.vaultedSamples);
  const carriedSamples = useMissionStore((s) => s.carriedSamples);
  const carriedMassKg = useMissionStore((s) => s.carriedMassKg);
  const maxPackMassKg = useMissionStore((s) => s.maxPackMassKg);
  const physiology = useMissionStore((s) => s.physiology);
  const telemetry = useMissionStore((s) => s.telemetry);
  const nearLander = useMissionStore((s) => s.nearLander);
  const landerDistance = useMissionStore((s) => s.landerDistance);
  const activeRoute = useMissionStore((s) => s.activeRoute);
  const scanningState = useMissionStore((s) => s.scanningState);
  const discoveredRovers = useMissionStore((s) => s.discoveredRovers);
  const customPinpoint = useMissionStore((s) => s.customPinpoint);

  const setWristMapOpen = useMissionStore((s) => s.setWristMapOpen);
  const setSlateTab = useMissionStore((s) => s.setSlateTab);
  const setInspectedTargetId = useMissionStore((s) => s.setInspectedTargetId);
  const setEvaLayer = useMissionStore((s) => s.setEvaLayer);
  const startScan = useMissionStore((s) => s.startScan);
  const setActiveRoute = useMissionStore((s) => s.setActiveRoute);
  const clearActiveRoute = useMissionStore((s) => s.clearActiveRoute);
  const discoverRover = useMissionStore((s) => s.discoverRover);
  const setCustomPinpoint = useMissionStore((s) => s.setCustomPinpoint);
  const routeToUnexploredFrontier = useMissionStore((s) => s.routeToUnexploredFrontier);
  const toggleCriticalTest = useMissionStore((s) => s.toggleCriticalTest);

  const collectedIds = collectedSamples[site.id] || [];
  const vaultedIds = vaultedSamples[site.id] || [];
  const rover = site.nasaRover || null;
  const isRoverDiscovered = Boolean(discoveredRovers[site.id]);
  const [px, pz] = telemetry.position;

  const [highlightRoverPath, setHighlightRoverPath] = useState(true);
  const [liveTraverseData, setLiveTraverseData] = useState(null);
  const [selectedPinpointInfo, setSelectedPinpointInfo] = useState(null);

  useEffect(() => {
    setSelectedPinpointInfo(null);
  }, [site.id]);

  useEffect(() => {
    let active = true;
    fetchLiveRoverTraverse(site.id).then((res) => {
      if (active) setLiveTraverseData(res);
    });
    return () => {
      active = false;
    };
  }, [site.id]);

  const roverTraversePoints = useMemo(() => {
    if (liveTraverseData?.points?.length >= 2) return liveTraverseData.points;
    return rover?.traversePoints || [];
  }, [liveTraverseData, rover]);

  const alignedRouteWaypoints = useMemo(() => {
    const wps = rover?.routeWaypoints || [];
    if (!wps.length) return [];
    if (liveTraverseData?.status === 'LIVE' && roverTraversePoints.length >= 2) {
      return wps.map((wp, idx) => {
        const ptIdx =
          wps.length === 1
            ? 0
            : Math.round((idx / (wps.length - 1)) * (roverTraversePoints.length - 1));
        return { ...wp, position: roverTraversePoints[ptIdx] };
      });
    }
    return wps;
  }, [rover, liveTraverseData, roverTraversePoints]);

  const [playerCx, playerCz] = worldToChunk(px, pz);
  const activeChunks = useMemo(
    () => getActive3x3Chunks(px, pz),
    [playerCx, playerCz]
  );

  const roverPathSvgPts = useMemo(() => {
    if (!roverTraversePoints.length) return '';
    return roverTraversePoints.map(([wx, wz]) => toSvgCoords(wx, wz, px, pz).join(',')).join(' ');
  }, [roverTraversePoints, px, pz]);

  const roverLandingPos = rover?.landingPosition || roverTraversePoints[0] || null;
  const albedoCrop = useMemo(
    () => getMarsAlbedoCrop(site.lat, site.lon, 0.1, 0.2, site.marsTrekBookmark?.extent),
    [site.lat, site.lon, site.marsTrekBookmark]
  );
  const albedoImgW = MAP_PX / albedoCrop.uSpan;
  const albedoImgH = MAP_PX / albedoCrop.vSpan;
  const albedoImgX = -albedoCrop.u0 * albedoImgW - (px / MAP_SPAN) * MAP_PX;
  const albedoImgY = -albedoCrop.v0 * albedoImgH - (pz / MAP_SPAN) * MAP_PX;

  // Curiosity-style dashed cyan safe traverse loop from Lander -> stations
  const masterLoopSvgPts = useMemo(() => {
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
  }, [site]);

  const masterLoopSvgPtsStr = useMemo(
    () => masterLoopSvgPts.map(([wx, , wz]) => toSvgCoords(wx, wz, px, pz).join(',')).join(' '),
    [masterLoopSvgPts, px, pz]
  );

  // Continuous 3x3 spatial heatmap quantized every 3m so panning stays 60fps with zero gap
  const hmCenterX = Math.round(px / 3) * 3;
  const hmCenterZ = Math.round(pz / 3) * 3;
  const sectorHeatmap = useMemo(
    () =>
      generateSectorHeatmap(site, evaLayer, rover, roverTraversePoints, [hmCenterX, hmCenterZ]),
    [site, evaLayer, rover, roverTraversePoints, hmCenterX, hmCenterZ]
  );
  const [hmLeft, hmTop] = toSvgCoords(
    sectorHeatmap.centerXZ[0] - sectorHeatmap.worldRange,
    sectorHeatmap.centerXZ[1] - sectorHeatmap.worldRange,
    px,
    pz
  );

  // Nearest next uncollected waypoint
  const nextWaypoint = useMemo(() => {
    let best = null;
    let bestDist = Infinity;
    for (let i = 0; i < site.targets.length; i++) {
      const t = site.targets[i];
      if (collectedIds.includes(t.id)) continue;
      const d = Math.hypot(t.position[0] - px, t.position[1] - pz);
      if (d < bestDist) {
        bestDist = d;
        best = { target: t, dist: d };
      }
    }
    return best;
  }, [site.targets, collectedIds, px, pz]);

  // Inspected target for SPECTRA / REF tab
  const spectraTarget =
    site.targets.find((t) => t.id === (activeTarget?.id || inspectedTargetId)) ||
    nextWaypoint?.target ||
    site.targets[0];
  const spectraTargetDist = spectraTarget
    ? Math.hypot(spectraTarget.position[0] - px, spectraTarget.position[1] - pz)
    : 99;
  const isSpectraCollected = spectraTarget ? collectedIds.includes(spectraTarget.id) : false;

  // Dynamic Mobility & Safe Return Calculator (minimized exploration penalty)
  const loadRatio = Math.min(1, carriedMassKg / (maxPackMassKg || 25));
  const speedPenaltyPct = Math.round(Math.pow(loadRatio, 1.1) * 18);
  const coldSpeedFactor = physiology.bodyTempC < 35.8 ? 0.96 : 1.0;
  const effectiveSpeedMs = Math.max(
    2.5,
    5.6 * (1.0 - Math.pow(loadRatio, 1.1) * 0.18) * coldSpeedFactor
  );
  const returnTimeSec = (landerDistance / effectiveSpeedMs) * 1.25;
  const sampleBurnMult = 1.0 + carriedSamples.length * 0.12;
  const returnO2Cost = 0.22 * 1.28 * sampleBurnMult * returnTimeSec * 1.25;
  const returnO2Margin = Number((physiology.oxygen - returnO2Cost).toFixed(1));
  const returnMarginStatus =
    returnO2Margin < 15 || physiology.stamina < 15
      ? 'CRITICAL'
      : returnO2Margin < 35 || loadRatio >= 0.78
        ? 'CAUTION'
        : 'NOMINAL';

  const handleSvgMapClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = ((e.clientX - rect.left) / rect.width) * MAP_PX;
    const sy = ((e.clientY - rect.top) / rect.height) * MAP_PX;
    const wx = Number((px + (sx / MAP_PX) * MAP_SPAN - MAP_RANGE).toFixed(1));
    const wz = Number((pz + (sy / MAP_PX) * MAP_SPAN - MAP_RANGE).toFixed(1));

    let isUnexplored = true;
    if (rover?.exploredCenter) {
      const dExp = Math.hypot(wx - rover.exploredCenter[0], wz - rover.exploredCenter[1]);
      isUnexplored = dExp > rover.exploredRadius;
    }

    setCustomPinpoint({
      id: 'custom-pinpoint',
      name: isUnexplored ? `Frontier (${wx}, ${wz})` : `Survey Pin (${wx}, ${wz})`,
      position: [wx, wz],
      isUnexplored,
    });
  };

  const [playerSx, playerSy] = toSvgCoords(px, pz, px, pz);
  const [landerSx, landerSy] = toSvgCoords(0, 8, px, pz);
  const routeSvgPts = activeRoute?.points
    ? activeRoute.points.map(([wx, , wz]) => toSvgCoords(wx, wz, px, pz).join(',')).join(' ')
    : null;

  const activeLayerObj = EVA_LAYERS.find((l) => l.id === evaLayer);

  // PERIPHERAL STOWED VIEW (Default in lower-left corner alongside 3D forearm device)
  if (!wristMapOpen) {
    const stowedWpDist = activeRoute
      ? Math.round(activeRoute.distanceMeters)
      : nextWaypoint
        ? Math.round(nextWaypoint.dist)
        : 0;
    const stowedWpLabel = activeRoute
      ? activeRoute.targetName
      : nextWaypoint
        ? `${nextWaypoint.target.code} · ${nextWaypoint.target.name}`
        : 'ALL CORES VAULTED';

    return (
      <div className="pointer-events-none fixed bottom-10 left-4 z-20 flex flex-col items-start gap-2 sm:left-5">
        {/* Proximity NASA Reference Verification Card when approaching an uncollected rock target */}
        {activeTarget && !isActiveCollected && !nearLander && !scanningState.active && (
          <div className="pointer-events-auto w-64 rounded-lg border border-sky-400/50 bg-black/80 p-2 shadow-2xl backdrop-blur-md sm:w-72">
            <div className="mb-1 flex items-center justify-between font-mono text-[9px] tracking-wider text-sky-300">
              <span className="flex items-center gap-1">
                <Camera className="h-3 w-3" />
                SPECTRA // NASA REF VERIFY
              </span>
              <span className="text-amber-300">{activeTarget.code}</span>
            </div>
            <div className="flex items-start gap-2">
              <RoverSpecimenPhoto target={activeTarget} compact />
              <div className="min-w-0 flex-1 font-mono">
                <div className="truncate text-[10px] font-semibold text-white">
                  {activeTarget.name}
                </div>
                {activeTarget.roverRef && (
                  <div className="mt-0.5 line-clamp-2 text-[8.5px] leading-tight text-amber-200/85">
                    {activeTarget.roverRef}
                  </div>
                )}
                <div className="mt-0.5 line-clamp-2 text-[8.5px] leading-tight text-white/65">
                  {activeTarget.mineralReadout}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Enlarged Stowed Peripheral Field Slate Mini-Display */}
        <button
          type="button"
          onClick={() => setWristMapOpen(true)}
          title="Open ARES-V Field Slate Inspection View ([M] or Right-Click)"
          className="pointer-events-auto group flex w-80 items-center gap-3 rounded-xl border border-cyan-400/40 bg-black/70 p-2.5 text-left font-mono shadow-xl backdrop-blur-md transition hover:border-cyan-300/80 hover:bg-black/85 sm:w-96"
        >
          {/* Enlarged Mini-Map: Mars Albedo + 3x3 Chunk Grid + Translucent Heatmap + Highlighted Green Rover Traverse */}
          <div className="relative h-24 w-28 shrink-0 overflow-hidden rounded-lg border border-cyan-400/35 bg-slate-950/90">
            <svg viewBox={`0 0 ${MAP_PX} ${MAP_PX}`} className="h-full w-full">
              <defs>
                <clipPath id="miniSectorClip">
                  <rect x="0" y="0" width={MAP_PX} height={MAP_PX} />
                </clipPath>
              </defs>
              <image
                href="/textures/mars_albedo.jpg"
                x={albedoImgX}
                y={albedoImgY}
                width={albedoImgW}
                height={albedoImgH}
                preserveAspectRatio="none"
                clipPath="url(#miniSectorClip)"
                opacity="0.9"
              />
              {sectorHeatmap.dataUrl && (
                <image
                  href={sectorHeatmap.dataUrl}
                  x={hmLeft}
                  y={hmTop}
                  width={sectorHeatmap.svgExtent}
                  height={sectorHeatmap.svgExtent}
                  preserveAspectRatio="none"
                  clipPath="url(#miniSectorClip)"
                  opacity="0.52"
                />
              )}
              <rect width={MAP_PX} height={MAP_PX} fill="#020617" opacity="0.06" />

              {/* Active 3x3 Chunk Grid Overlay */}
              <g clipPath="url(#miniSectorClip)">
                {activeChunks.map((chunk) => {
                  const [cLeft, cTop] = toSvgCoords(chunk.minX, chunk.minZ, px, pz);
                  const sizeSvg = (CHUNK_SIZE / MAP_SPAN) * MAP_PX;
                  const isCenter = chunk.cx === playerCx && chunk.cz === playerCz;
                  return (
                    <rect
                      key={chunk.key}
                      x={cLeft}
                      y={cTop}
                      width={sizeSvg}
                      height={sizeSvg}
                      fill="none"
                      stroke={isCenter ? 'rgba(56,189,248,0.55)' : 'rgba(148,163,184,0.22)'}
                      strokeWidth={isCenter ? '1.1' : '0.7'}
                    />
                  );
                })}
              </g>

              <g transform={`translate(${hmLeft}, ${hmTop})`} clipPath="url(#miniSectorClip)">
                {sectorHeatmap.expContourPath && (
                  <path
                    d={sectorHeatmap.expContourPath}
                    fill="none"
                    stroke="rgba(34,211,238,0.5)"
                    strokeWidth="1.2"
                    strokeDasharray="4 3"
                  />
                )}
                {isRoverDiscovered && sectorHeatmap.unexpContourPath && (
                  <path
                    d={sectorHeatmap.unexpContourPath}
                    fill="none"
                    stroke="rgba(217,70,239,0.72)"
                    strokeWidth="1.3"
                    strokeDasharray="4 2.5"
                  />
                )}
              </g>
              {roverPathSvgPts && (
                <>
                  <polyline
                    points={roverPathSvgPts}
                    fill="none"
                    stroke="#4ade80"
                    strokeWidth="9"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity="0.4"
                  />
                  <polyline
                    points={roverPathSvgPts}
                    fill="none"
                    stroke="#22c55e"
                    strokeWidth="4.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity="0.96"
                  />
                </>
              )}
              {roverLandingPos &&
                (() => {
                  const [ylx, yly] = toSvgCoords(roverLandingPos[0], roverLandingPos[1], px, pz);
                  return (
                    <g>
                      <circle cx={ylx} cy={yly} r="10" fill="rgba(250, 204, 21, 0.25)" stroke="#fde047" strokeWidth="2" />
                      <polygon
                        points={`${ylx},${yly - 8} ${ylx + 7},${yly} ${ylx},${yly + 8} ${ylx - 7},${yly}`}
                        fill="#facc15"
                      />
                    </g>
                  );
                })()}
              {rover &&
                (() => {
                  const [rx, ry] = toSvgCoords(rover.position[0], rover.position[1], px, pz);
                  return (
                    <g>
                      <circle cx={rx} cy={ry} r="9" fill="rgba(34,211,238,0.22)" stroke="#22d3ee" strokeWidth="1.5" />
                      <rect x={rx - 4.5} y={ry - 3.5} width="9" height="7" rx="1.5" fill="#22d3ee" />
                    </g>
                  );
                })()}
              {routeSvgPts && (
                <polyline
                  points={routeSvgPts}
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="5"
                  strokeDasharray="8 6"
                  opacity="0.95"
                />
              )}
              <polygon
                points={`${landerSx},${landerSy - 9} ${landerSx + 8},${landerSy + 7} ${landerSx - 8},${landerSy + 7}`}
                fill="#38bdf8"
              />
              <g transform={`translate(${playerSx}, ${playerSy}) rotate(${telemetry.heading})`}>
                <polygon points="0,-13 8,10 0,5 -8,10" fill="#ffffff" />
              </g>
            </svg>
          </div>

          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center justify-between text-[9.5px] tracking-wider text-cyan-300">
              <span className="truncate font-semibold">
                {rover ? `${rover.shortName} · ${rover.code}` : 'FIELD SLATE'}
              </span>
              <span className="shrink-0 pl-1 text-white/80">
                {String(telemetry.heading).padStart(3, '0')}°
              </span>
            </div>
            <div className="truncate text-[10px] font-semibold text-white">
              {stowedWpLabel}
            </div>
            <div className="text-[8.5px] text-amber-200/80">
              {rover ? `${site.name} · ${rover.totalOdometryKm} KM` : site.name}
            </div>
            <div className="flex items-center justify-between text-[8.5px] text-white/65">
              <span className="text-cyan-200">
                {stowedWpDist > 0 ? `WPT ${stowedWpDist}m · [M] ENLARGE` : '[M / CLICK] ENLARGE MAP'}
              </span>
              <span
                className={
                  returnMarginStatus === 'CRITICAL'
                    ? 'animate-pulse text-red-300'
                    : returnMarginStatus === 'CAUTION'
                      ? 'text-amber-300'
                      : 'text-emerald-300'
                }
              >
                O₂ {Math.round(physiology.oxygen)}% · {carriedMassKg.toFixed(1)}KG
              </span>
            </div>
          </div>
        </button>
      </div>
    );
  }

  // ACTIVE INSPECTION VIEW ([M], [TAB], or Right-Click): Centered & Enlarged NASA Field Slate Glass UI
  return (
    <div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm sm:p-4">
      <div className="pointer-events-auto flex max-h-[94vh] w-[95vw] max-w-6xl flex-col overflow-y-auto rounded-xl border-2 border-slate-600/80 bg-slate-950/94 font-mono shadow-[0_0_60px_rgba(14,165,233,0.32)] backdrop-blur-xl">
        {/* Ruggedized Slate Top Titanium Bezel */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-cyan-500/30 bg-slate-900/95 px-4 py-2.5">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold tracking-[0.18em] text-cyan-300">
              <span className="h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee]" />
              <span>ARES-V // ENLARGED MARS TREK &amp; ROVER MAP</span>
              {rover && (
                <span className="rounded border border-cyan-400/35 bg-cyan-500/15 px-1.5 py-0.5 text-[9.5px] text-cyan-100">
                  {rover.name} ({rover.code})
                </span>
              )}
            </div>
            <div className="mt-0.5 text-[9.5px] text-amber-200/85">
              {site.name} ({site.coordinates}) · {site.geologicHighlight || site.subtitle}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setWristMapOpen(false)}
            className="flex items-center gap-1 rounded border border-white/20 bg-black/55 px-2.5 py-1 text-[10px] text-white/85 transition hover:border-cyan-400/50 hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
            <span>[M] STOW MAP</span>
          </button>
        </div>

        {/* 3 Functional Screen Tabs */}
        <div className="grid grid-cols-3 border-b border-white/10 bg-black/50 text-[10px] tracking-wider">
          {[
            { id: 'MAP', label: 'MAP / ROUTE', icon: MapPin },
            { id: 'SPECTRA', label: 'SPECTRA / REF', icon: Sparkles },
            { id: 'MOBILITY', label: 'EVA MOBILITY', icon: Activity },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = slateTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSlateTab(tab.id)}
                className={`flex items-center justify-center gap-1.5 border-b-2 py-2 transition ${
                  active
                    ? 'border-cyan-400 bg-cyan-500/15 font-semibold text-cyan-200'
                    : 'border-transparent text-white/55 hover:bg-white/5 hover:text-white/85'
                }`}
              >
                <Icon className="h-3 w-3" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* TAB 1: [MAP / ROUTE] (Enlarged Mars Trek Albedo + Actual NASA Rover Pinpoints & Reference Dossier) */}
        {slateTab === 'MAP' && (
          <div className="space-y-2.5 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[9.5px]">
              <span className="text-sky-200">{activeLayerObj?.description}</span>
              <span className="shrink-0 text-emerald-300">
                {vaultedIds.length}/{site.targets.length} VAULTED
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_340px]">
              {/* Left Column: Enlarged Interactive Mars Trek Continuous Heatmap */}
              <div className="space-y-2">
                <div className="relative overflow-hidden rounded-lg border border-cyan-400/35 bg-slate-950">
                  {/* Top non-overlapping status badges */}
                  <div className="pointer-events-none absolute top-2 left-2 right-2 z-10 flex items-center justify-between gap-2 text-[8.5px]">
                    <span className="rounded border border-cyan-400/35 bg-black/75 px-2 py-0.5 font-semibold tracking-wider text-cyan-200 backdrop-blur-sm">
                      {sectorHeatmap.meta.title}
                    </span>
                    {isRoverDiscovered && rover?.unexploredSector && (
                      <span className="truncate rounded border border-fuchsia-400/50 bg-fuchsia-950/80 px-2 py-0.5 font-semibold text-fuchsia-200 backdrop-blur-sm">
                        FRONTIER: {rover.unexploredSector.name.toUpperCase()}
                      </span>
                    )}
                  </div>

                  <div className="flex w-full items-center justify-center bg-slate-950/90 pt-2 pb-1">
                    <svg
                      viewBox={`0 0 ${MAP_PX} ${MAP_PX}`}
                      onClick={handleSvgMapClick}
                      className="mx-auto block aspect-square h-[52vh] min-h-[350px] max-h-[540px] w-auto max-w-full cursor-crosshair select-none"
                    >
                      <defs>
                        <clipPath id="marsSectorClip">
                          <rect x="0" y="0" width={MAP_PX} height={MAP_PX} />
                        </clipPath>
                      </defs>

                      {/* NASA Mars Trek Albedo Regional Reference Layer (pans 1:1 with player) */}
                      <image
                        href="/textures/mars_albedo.jpg"
                        x={albedoImgX}
                        y={albedoImgY}
                        width={albedoImgW}
                        height={albedoImgH}
                        preserveAspectRatio="none"
                        clipPath="url(#marsSectorClip)"
                        opacity="0.92"
                      />
                      <rect width={MAP_PX} height={MAP_PX} fill="#020617" opacity="0.06" />

                      {/* Translucent Continuous Raster Heatmap Layer */}
                      {sectorHeatmap.dataUrl && (
                        <image
                          href={sectorHeatmap.dataUrl}
                          x={hmLeft}
                          y={hmTop}
                          width={sectorHeatmap.svgExtent}
                          height={sectorHeatmap.svgExtent}
                          preserveAspectRatio="none"
                          clipPath="url(#marsSectorClip)"
                          opacity="0.54"
                        />
                      )}

                      {/* Live 3x3 Chunk Grid & Chunk Coordinates */}
                      <g clipPath="url(#marsSectorClip)">
                        {activeChunks.map((chunk) => {
                          const [cLeft, cTop] = toSvgCoords(chunk.minX, chunk.minZ, px, pz);
                          const sizeSvg = (CHUNK_SIZE / MAP_SPAN) * MAP_PX;
                          const isCenterChunk = chunk.cx === playerCx && chunk.cz === playerCz;
                          return (
                            <g key={chunk.key}>
                              <rect
                                x={cLeft}
                                y={cTop}
                                width={sizeSvg}
                                height={sizeSvg}
                                fill="none"
                                stroke={isCenterChunk ? 'rgba(56, 189, 248, 0.5)' : 'rgba(148, 163, 184, 0.22)'}
                                strokeDasharray={isCenterChunk ? undefined : '2.5 2.5'}
                                strokeWidth={isCenterChunk ? '0.8' : '0.55'}
                              />
                              <text
                                x={cLeft + 2.5}
                                y={cTop + 6.5}
                                fill={isCenterChunk ? 'rgba(125, 211, 252, 0.85)' : 'rgba(148, 163, 184, 0.5)'}
                                fontSize="4.1"
                                fontWeight="bold"
                              >
                                [{chunk.cx},{chunk.cz}]
                              </text>
                            </g>
                          );
                        })}
                        <rect
                          x="0.5"
                          y="0.5"
                          width={MAP_PX - 1}
                          height={MAP_PX - 1}
                          fill="none"
                          stroke="rgba(34, 211, 238, 0.35)"
                          strokeWidth="0.8"
                        />
                      </g>

                      {/* Layer-specific Physical Iso-Contours + Organic Rover Corridor & Frontier Isolines */}
                      <g transform={`translate(${hmLeft}, ${hmTop})`} clipPath="url(#marsSectorClip)">
                        {sectorHeatmap.layerContours.map((cnt, idx) => (
                          <path
                            key={idx}
                            d={cnt.d}
                            fill="none"
                            stroke={cnt.color}
                            strokeWidth={cnt.width}
                            strokeLinecap="round"
                          />
                        ))}

                        {sectorHeatmap.expContourPath && (
                          <path
                            d={sectorHeatmap.expContourPath}
                            fill="none"
                            stroke="rgba(34, 211, 238, 0.52)"
                            strokeDasharray="3 2.5"
                            strokeWidth="0.75"
                          />
                        )}
                        {isRoverDiscovered && sectorHeatmap.unexpContourPath && (
                          <path
                            d={sectorHeatmap.unexpContourPath}
                            fill="none"
                            stroke="rgba(232, 121, 249, 0.72)"
                            strokeDasharray="3.5 2"
                            strokeWidth="0.9"
                          />
                        )}
                      </g>

                      {/* Actual NASA Rover Traverse Path in Green + Multi-Layer Highlight */}
                      {roverPathSvgPts && (
                        <g>
                          <polyline
                            points={roverPathSvgPts}
                            fill="none"
                            stroke="#4ade80"
                            strokeWidth={highlightRoverPath ? 6.0 : 3.2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            opacity={highlightRoverPath ? 0.38 : 0.18}
                          />
                          <polyline
                            points={roverPathSvgPts}
                            fill="none"
                            stroke="#22c55e"
                            strokeWidth={highlightRoverPath ? 2.4 : 1.7}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            opacity="0.98"
                          />
                          <polyline
                            points={roverPathSvgPts}
                            fill="none"
                            stroke="#bbf7d0"
                            strokeWidth="1.1"
                            strokeDasharray="4 6"
                            className="animate-pulse"
                            opacity={highlightRoverPath ? 0.95 : 0.45}
                          />
                        </g>
                      )}

                      {/* Actual NASA Rover Mission Route Milestones (Aligned to Live Traverse + Decluttered) */}
                      {alignedRouteWaypoints.map((wp, wpIdx) => {
                        const [wxp, wyp] = toSvgCoords(wp.position[0], wp.position[1], px, pz);
                        const isSelectedWp = selectedPinpointInfo?.id === wp.id;
                        const distToRover = rover
                          ? Math.hypot(wp.position[0] - rover.position[0], wp.position[1] - rover.position[1])
                          : 99;
                        const distToLanding = roverLandingPos
                          ? Math.hypot(
                              wp.position[0] - roverLandingPos[0],
                              wp.position[1] - roverLandingPos[1]
                            )
                          : 99;
                        const nearTarget = site.targets.some(
                          (t) => Math.hypot(t.position[0] - wp.position[0], t.position[1] - wp.position[1]) < 3.6
                        );
                        const hideSolText =
                          !isSelectedWp &&
                          (wpIdx === 0 || distToLanding < 2.2 || distToRover < 3.4 || nearTarget);
                        const labelLeft = wpIdx % 2 === 1;
                        return (
                          <g
                            key={wp.id}
                            onMouseEnter={() =>
                              setSelectedPinpointInfo({
                                id: wp.id,
                                title: wp.name,
                                subtitle: `${rover.name} · ${wp.sol}`,
                                detail: wp.detail,
                                position: wp.position,
                                kind: 'ROVER MILESTONE',
                              })
                            }
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedPinpointInfo({
                                id: wp.id,
                                title: wp.name,
                                subtitle: `${rover.name} · ${wp.sol}`,
                                detail: wp.detail,
                                position: wp.position,
                                kind: 'ROVER MILESTONE',
                              });
                              setCustomPinpoint({
                                id: wp.id,
                                name: `${wp.name} (${wp.sol})`,
                                position: wp.position,
                                isUnexplored: false,
                              });
                            }}
                            className="cursor-pointer"
                          >
                            <circle cx={wxp} cy={wyp} r={7} fill="transparent" />
                            <circle
                              cx={wxp}
                              cy={wyp}
                              r={isSelectedWp ? 4.4 : 2.8}
                              fill={isSelectedWp ? '#fde047' : '#86efac'}
                              stroke="#022c22"
                              strokeWidth="0.9"
                            />
                            {!hideSolText && (
                              <text
                                x={wxp + (labelLeft ? -4.5 : 4.5)}
                                y={wyp - 3.2}
                                textAnchor={labelLeft ? 'end' : 'start'}
                                fill="#ecfdf5"
                                stroke="rgba(2, 6, 23, 0.92)"
                                strokeWidth="2.1"
                                paintOrder="stroke"
                                fontSize="4.8"
                                fontWeight="bold"
                              >
                                {wp.sol}
                              </text>
                            )}
                          </g>
                        );
                      })}

                      {/* Actual NASA Rover Landing Site (Yellow Highlighted Sol 0 Touchdown) */}
                      {roverLandingPos &&
                        (() => {
                          const [lx0, ly0] = toSvgCoords(roverLandingPos[0], roverLandingPos[1], px, pz);
                          return (
                            <g
                              onMouseEnter={() =>
                                setSelectedPinpointInfo({
                                  id: 'rover-landing-sol0',
                                  title: rover?.landingName || 'Sol 0 Landing',
                                  subtitle: `${rover?.name} · ${rover?.landingCoordinates}`,
                                  detail: `${rover?.landingDate || ''} — Initial Mars touchdown monument recorded in NASA Mars Trek / USGS datasets.`,
                                  position: roverLandingPos,
                                  kind: 'SOL 0 TOUCHDOWN',
                                })
                              }
                              onClick={(e) => {
                                e.stopPropagation();
                                setCustomPinpoint({
                                  id: 'rover-landing-sol0',
                                  name: rover?.landingName || 'Rover Landing (Sol 0)',
                                  position: roverLandingPos,
                                  isUnexplored: false,
                                });
                              }}
                              className="cursor-pointer"
                            >
                              <circle
                                cx={lx0}
                                cy={ly0}
                                r={highlightRoverPath ? 7.2 : 5.2}
                                fill="rgba(250, 204, 21, 0.22)"
                                stroke="#fde047"
                                strokeWidth={highlightRoverPath ? 1.4 : 0.9}
                                className={highlightRoverPath ? 'animate-pulse' : ''}
                              />
                              <polygon
                                points={`${lx0},${ly0 - 4.8} ${lx0 + 4.5},${ly0} ${lx0},${ly0 + 4.8} ${lx0 - 4.5},${ly0}`}
                                fill="#facc15"
                                stroke="#020617"
                                strokeWidth="0.8"
                              />
                              <text
                                x={lx0 - 5.5}
                                y={ly0 + 8.5}
                                textAnchor="end"
                                fill="#fef08a"
                                stroke="rgba(2, 6, 23, 0.94)"
                                strokeWidth="2.3"
                                paintOrder="stroke"
                                fontSize="5.1"
                                fontWeight="bold"
                              >
                                ★ SOL 0 LANDING
                              </text>
                            </g>
                          );
                        })()}

                      {/* Actual NASA Rover Chassis Pinpoint */}
                      {rover &&
                        (() => {
                          const [rx, ry] = toSvgCoords(rover.position[0], rover.position[1], px, pz);
                          return (
                            <g
                              onMouseEnter={() =>
                                setSelectedPinpointInfo({
                                  id: rover.id,
                                  title: `${rover.name} (${rover.code})`,
                                  subtitle: `${rover.status} · Sol ${rover.latestSol} · ${rover.totalOdometryKm} KM`,
                                  detail: rover.keyDiscoveries,
                                  position: rover.position,
                                  kind: 'ACTUAL NASA ROVER',
                                })
                              }
                              onClick={(e) => {
                                e.stopPropagation();
                                discoverRover(site.id);
                                setCustomPinpoint({
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
                                r={8.5}
                                fill="rgba(34, 211, 238, 0.18)"
                                stroke="#22d3ee"
                                strokeWidth="1.1"
                              />
                              {/* Stylized 6-wheel Rover Silhouette */}
                              <rect
                                x={rx - 4.8}
                                y={ry - 3.2}
                                width="9.6"
                                height="6.4"
                                rx="1.2"
                                fill="#f8fafc"
                                stroke="#0f172a"
                                strokeWidth="0.8"
                              />
                              <rect x={rx - 3.6} y={ry - 1.8} width="7.2" height="3.6" fill="#0284c7" />
                              <line
                                x1={rx + 2}
                                y1={ry - 2}
                                x2={rx + 5}
                                y2={ry - 6}
                                stroke="#38bdf8"
                                strokeWidth="1.1"
                              />
                              <circle cx={rx + 5.2} cy={ry - 6.2} r="1.4" fill="#ef4444" />
                              <text
                                x={rx}
                                y={ry - 10.5}
                                textAnchor="middle"
                                fill="#67e8f9"
                                stroke="rgba(2, 6, 23, 0.94)"
                                strokeWidth="2.4"
                                paintOrder="stroke"
                                fontSize="5.4"
                                fontWeight="bold"
                              >
                                {rover.shortName} ({rover.code})
                              </text>
                            </g>
                          );
                        })()}

                      {/* Curiosity-Style Dashed Cyan Traverse Route Loop */}
                      {masterLoopSvgPtsStr && (
                        <polyline
                          points={masterLoopSvgPtsStr}
                          fill="none"
                          stroke="#22d3ee"
                          strokeWidth="1.05"
                          strokeDasharray="4 3"
                          opacity="0.48"
                        />
                      )}

                      {/* Active Highlighted A* Suit Navigation Route (Sky Cyan, distinct from Green Rover Path) */}
                      {routeSvgPts && (
                        <polyline
                          points={routeSvgPts}
                          fill="none"
                          stroke="#38bdf8"
                          strokeWidth="2.2"
                          strokeDasharray="5 3"
                          opacity="0.96"
                        />
                      )}

                      {/* Lander Base */}
                      <g
                        onMouseEnter={() =>
                          setSelectedPinpointInfo({
                            id: 'lander-base',
                            title: 'ARES-V Mars Ascent/Descent Lander',
                            subtitle: 'EVA Base Camp · O₂ & Core Vault Resupply',
                            detail: `Base camp coordinates at (${site.coordinates}). Offload drilled core samples and recharge suit reserves.`,
                            position: [0, 5.95],
                            kind: 'EVA LANDER BASE',
                          })
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          setCustomPinpoint({
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
                          stroke="#020617"
                          strokeWidth="0.9"
                        />
                        <text
                          x={landerSx}
                          y={landerSy + 10.5}
                          textAnchor="middle"
                          fill="#bae6fd"
                          stroke="rgba(2, 6, 23, 0.92)"
                          strokeWidth="2.2"
                          paintOrder="stroke"
                          fontSize="5.2"
                          fontWeight="bold"
                        >
                          ARES-V LANDER
                        </text>
                      </g>

                      {/* Geological Sample Stations */}
                      {site.targets.map((tgt) => {
                        const [tx, ty] = toSvgCoords(tgt.position[0], tgt.position[1], px, pz);
                        const done = collectedIds.includes(tgt.id);
                        const isRouted = activeRoute?.targetId === tgt.id;
                        const fill = done ? '#10b981' : !tgt.roverExplored ? '#c084fc' : '#fbbf24';
                        return (
                          <g
                            key={tgt.id}
                            onMouseEnter={() =>
                              setSelectedPinpointInfo({
                                id: tgt.id,
                                title: `${tgt.code} · ${tgt.name}`,
                                subtitle: tgt.roverRef || tgt.scienceGoal,
                                detail: tgt.mineralReadout,
                                position: tgt.position,
                                kind: tgt.roverExplored ? 'ROVER SAMPLED SITE' : 'UNEXPLORED TARGET',
                              })
                            }
                            onClick={(e) => {
                              e.stopPropagation();
                              setInspectedTargetId(tgt.id);
                              setCustomPinpoint({
                                id: tgt.id,
                                name: `${tgt.code} · ${tgt.name}`,
                                position: tgt.position,
                                isUnexplored: !tgt.roverExplored,
                              });
                            }}
                            className="cursor-pointer"
                          >
                            <circle cx={tx} cy={ty} r={7.5} fill="transparent" />
                            {isRouted && (
                              <circle
                                cx={tx}
                                cy={ty}
                                r={5.8}
                                fill="none"
                                stroke="#34d399"
                                strokeWidth="1.1"
                              />
                            )}
                            <circle
                              cx={tx}
                              cy={ty}
                              r={3.2}
                              fill={fill}
                              stroke="#020617"
                              strokeWidth="0.9"
                            />
                            <text
                              x={tx + 4.4}
                              y={ty + 3.4}
                              fill={done ? '#a7f3d0' : '#f8fafc'}
                              stroke="rgba(2, 6, 23, 0.94)"
                              strokeWidth="2.2"
                              paintOrder="stroke"
                              fontSize="5.1"
                              fontWeight="bold"
                            >
                              {tgt.code}
                            </text>
                          </g>
                        );
                      })}

                      {/* Custom Map Pinpoint Crosshair */}
                      {customPinpoint?.position &&
                        (() => {
                          const [cxp, cyp] = toSvgCoords(
                            customPinpoint.position[0],
                            customPinpoint.position[1],
                            px,
                            pz
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
                              <circle cx={cxp} cy={cyp} r={2} fill="#f0abfc" />
                            </g>
                          );
                        })()}

                      {/* Astronaut Position + Heading Triangle */}
                      <g transform={`translate(${playerSx}, ${playerSy}) rotate(${telemetry.heading})`}>
                        <polygon
                          points="0,-6 3.8,4 0,1.8 -3.8,4"
                          fill="#ffffff"
                          stroke="#0ea5e9"
                          strokeWidth="0.9"
                        />
                      </g>
                    </svg>
                  </div>

                  {/* Quantitative Heatmap Colorbar Scale */}
                  <div className="border-t border-white/10 bg-slate-950/95 px-3 py-1.5">
                    <div className="mb-1 flex items-center justify-between text-[8.5px] text-white/70">
                      <span className="font-semibold text-cyan-200">{sectorHeatmap.meta.minLabel}</span>
                      <span className="text-white/80">{sectorHeatmap.meta.midLabel}</span>
                      <span className="font-semibold text-amber-200">{sectorHeatmap.meta.maxLabel}</span>
                    </div>
                    <div
                      className="h-2 w-full rounded-full border border-white/15"
                      style={{ background: sectorHeatmap.meta.gradientCss }}
                    />
                    <div className="mt-1 flex items-center justify-between text-[8px] text-white/55">
                      <span>{sectorHeatmap.meta.sourceNote}</span>
                      <span>
                        3×3 CHUNKS: 102m × 102m · CHUNK [{playerCx},{playerCz}] · POS ({px.toFixed(0)}m, {pz.toFixed(0)}m)
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-black/80 px-3 py-1.5 text-[9px] text-white/75">
                    <span>HOVER OR CLICK ANY ROVER PINPOINT TO INSPECT &amp; SET A* ROUTE</span>
                    {activeRoute ? (
                      <span className="text-emerald-300">
                        ACTIVE ROUTE: {activeRoute.targetName} · {activeRoute.distanceMeters}m ({activeRoute.maxSlopeDeg}° MAX)
                      </span>
                    ) : (
                      <span className="text-sky-300/85">REF: MARS_ALBEDO.JPG // TREK.NASA.GOV</span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-slate-950/95 px-3 py-1.5 text-[9px]">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-semibold text-yellow-300">
                        ★ YELLOW: {rover?.landingName || 'SOL 0 LANDING'}
                      </span>
                      <span className="font-semibold text-green-400">
                        ━ GREEN: {rover?.shortName || 'ROVER'} PATH ({rover?.totalOdometryKm ?? 33.4} KM)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setHighlightRoverPath((v) => !v)}
                      className={`rounded border px-2 py-0.5 font-semibold tracking-wider transition ${
                        highlightRoverPath
                          ? 'border-green-400/70 bg-green-500/25 text-green-200'
                          : 'border-white/20 bg-white/5 text-white/60 hover:text-white'
                      }`}
                    >
                      HIGHLIGHT PATH {highlightRoverPath ? 'ON' : 'OFF'}
                    </button>
                  </div>
                </div>

                {/* Map Action Controls */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={routeToUnexploredFrontier}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded border border-purple-400/55 bg-purple-500/20 px-3 py-1.5 text-[10px] font-semibold tracking-wider text-purple-100 transition hover:bg-purple-500/35"
                  >
                    <Compass className="h-3.5 w-3.5 text-purple-300" />
                    <span>ROUTE UNEXPLORED FRONTIER</span>
                  </button>
                  {activeRoute && (
                    <button
                      type="button"
                      onClick={clearActiveRoute}
                      className="rounded border border-white/20 bg-white/10 px-3 py-1.5 text-[10px] text-white/85 transition hover:bg-white/20"
                    >
                      CLEAR ROUTE
                    </button>
                  )}
                </div>
              </div>

              {/* Right Column: Actual NASA Rover & Milestone Reference Dossier */}
              <div className="flex max-h-[68vh] flex-col gap-2 overflow-y-auto pr-0.5">
                {rover && (
                  <div className="rounded-lg border border-cyan-400/35 bg-black/65 p-2.5">
                    <div className="flex items-center justify-between gap-2 text-[9px]">
                      <span className="font-semibold text-cyan-300">{rover.agency || 'NASA / JPL'}</span>
                      <span className="rounded border border-emerald-400/40 bg-emerald-500/15 px-1.5 py-0.5 text-[8.5px] text-emerald-200">
                        {rover.status || 'ACTIVE'}
                      </span>
                    </div>
                    <div className="mt-1 text-xs font-bold text-white">{rover.name}</div>
                    <div className="text-[9.5px] text-sky-200/85">{rover.mission}</div>

                    <div className="mt-2 grid grid-cols-2 gap-1.5 rounded border border-white/10 bg-slate-900/75 p-2 text-[9px]">
                      <div>
                        <span className="text-white/50">ODOMETRY:</span>{' '}
                        <strong className="text-green-300">{rover.totalOdometryKm} KM</strong>
                      </div>
                      <div>
                        <span className="text-white/50">LATEST SOL:</span>{' '}
                        <strong className="text-cyan-200">
                          SOL {liveTraverseData?.latestSol || rover.latestSol}
                        </strong>
                      </div>
                      <div className="col-span-2">
                        <span className="text-white/50">SOL 0 SITE:</span>{' '}
                        <strong className="text-yellow-300">{rover.landingName}</strong>
                      </div>
                      <div className="col-span-2 text-white/75">
                        {rover.landingCoordinates} · {rover.landingDate}
                      </div>
                      {site.marsTrekBookmark && (
                        <div className="col-span-2 mt-0.5 rounded border border-cyan-400/20 bg-black/45 p-1.5 text-[8.5px] leading-tight text-cyan-200/90">
                          <div>
                            <span className="text-white/50">ITEM TYPE:</span> {site.marsTrekBookmark.itemType} ·{' '}
                            <span className="text-white/90">{site.marsTrekBookmark.name}</span>
                          </div>
                          <div className="mt-0.5 break-all text-white/70">
                            <span className="text-white/50">EXTENT:</span>{' '}
                            {site.marsTrekBookmark.extent.join(', ')}
                          </div>
                        </div>
                      )}
                    </div>

                    {rover.instruments && (
                      <div className="mt-2 text-[9px] leading-relaxed text-white/75">
                        <span className="font-semibold text-cyan-300">INSTRUMENTS: </span>
                        {rover.instruments}
                      </div>
                    )}
                    {rover.keyDiscoveries && (
                      <div className="mt-1.5 text-[9px] leading-relaxed text-white/80">
                        <span className="font-semibold text-amber-300">FINDINGS: </span>
                        {rover.keyDiscoveries}
                      </div>
                    )}
                    {rover.referenceSource && (
                      <div className="mt-1.5 text-[8.5px] text-sky-300/85">
                        SOURCE: {rover.referenceSource}
                      </div>
                    )}
                  </div>
                )}

                {/* Hovered / Selected Pinpoint Inspector */}
                {selectedPinpointInfo && (
                  <div className="rounded-lg border border-amber-400/45 bg-amber-950/25 p-2.5">
                    <div className="text-[8.5px] font-semibold tracking-wider text-amber-300">
                      PINPOINT DETAILS // {selectedPinpointInfo.kind}
                    </div>
                    <div className="mt-0.5 text-[11px] font-semibold text-white">
                      {selectedPinpointInfo.title}
                    </div>
                    <div className="text-[9px] text-cyan-200">{selectedPinpointInfo.subtitle}</div>
                    <p className="mt-1 text-[9px] leading-relaxed text-white/80">
                      {selectedPinpointInfo.detail}
                    </p>
                  </div>
                )}

                {/* Interactive Rover Route Milestone Pinpoints */}
                {rover?.routeWaypoints?.length > 0 && (
                  <div className="rounded-lg border border-white/15 bg-black/60 p-2.5">
                    <div className="mb-1.5 text-[9.5px] font-semibold tracking-wider text-green-300">
                      ACTUAL ROVER TRAVERSE PINPOINTS ({rover.routeWaypoints.length})
                    </div>
                    <div className="space-y-1">
                      {rover.routeWaypoints.map((wp) => {
                        const activeWp = selectedPinpointInfo?.id === wp.id;
                        return (
                          <button
                            key={wp.id}
                            type="button"
                            onMouseEnter={() =>
                              setSelectedPinpointInfo({
                                id: wp.id,
                                title: wp.name,
                                subtitle: `${rover.name} · ${wp.sol}`,
                                detail: wp.detail,
                                position: wp.position,
                                kind: 'ROVER MILESTONE',
                              })
                            }
                            onClick={() =>
                              setCustomPinpoint({
                                id: wp.id,
                                name: `${wp.name} (${wp.sol})`,
                                position: wp.position,
                                isUnexplored: false,
                              })
                            }
                            className={`flex w-full items-start justify-between gap-2 rounded border px-2 py-1 text-left text-[9px] transition ${
                              activeWp
                                ? 'border-green-400/70 bg-green-500/20 text-white'
                                : 'border-white/10 bg-slate-900/60 text-white/80 hover:border-green-400/40 hover:bg-green-500/10'
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="truncate font-semibold">{wp.name}</div>
                              <div className="line-clamp-1 text-[8px] text-white/55">{wp.detail}</div>
                            </div>
                            <span className="shrink-0 text-[8.5px] font-semibold text-green-300">
                              {wp.sol}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Official Reference Data Sources */}
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded border border-white/10 bg-black/55 px-2.5 py-1.5 text-[8.5px] text-white/70">
              <span className="font-semibold text-cyan-300/90">REF SOURCES:</span>
              <a
                href="https://trek.nasa.gov/mars/"
                target="_blank"
                rel="noreferrer"
                className="underline decoration-white/25 hover:text-cyan-200"
              >
                Mars Trek
              </a>
              <a
                href="https://astrogeology-usgs.hub.arcgis.com/pages/interactive-maps-mars"
                target="_blank"
                rel="noreferrer"
                className="underline decoration-white/25 hover:text-cyan-200"
              >
                USGS Interactive Maps: Mars
              </a>
              <a
                href="https://science.nasa.gov/resource/curiositys-proposed-path-up-mount-sharp/"
                target="_blank"
                rel="noreferrer"
                className="underline decoration-white/25 hover:text-cyan-200"
              >
                Curiosity Mount Sharp Path
              </a>
              <a
                href="https://worldview.earthdata.nasa.gov/"
                target="_blank"
                rel="noreferrer"
                className="underline decoration-white/25 hover:text-cyan-200"
              >
                NASA Worldview
              </a>
              <a
                href="https://mars.nasa.gov/mars2020/multimedia/raw-images/"
                target="_blank"
                rel="noreferrer"
                className="underline decoration-white/25 hover:text-cyan-200"
              >
                Perseverance Raw Images
              </a>
            </div>
          </div>
        )}

        {/* TAB 2: [SPECTRA / REF] (Perseverance Raw Gallery + Rover Reference) */}
        {slateTab === 'SPECTRA' && spectraTarget && (
          <div className="space-y-2.5 p-3">
            {/* Station Selector Pills */}
            <div className="flex flex-wrap gap-1">
              {site.targets.map((tgt) => {
                const selected = tgt.id === spectraTarget.id;
                const collected = collectedIds.includes(tgt.id);
                return (
                  <button
                    key={tgt.id}
                    type="button"
                    onClick={() => setInspectedTargetId(tgt.id)}
                    className={`rounded border px-1.5 py-0.5 text-[9px] transition ${
                      selected
                        ? 'border-sky-400 bg-sky-500/25 text-white'
                        : collected
                          ? 'border-emerald-500/40 bg-emerald-950/35 text-emerald-300'
                          : 'border-white/15 bg-black/40 text-white/65 hover:text-white'
                    }`}
                  >
                    {tgt.code}
                  </button>
                );
              })}
            </div>

            {/* NASA Reference Verification Card */}
            <div className="rounded-lg border border-sky-400/35 bg-black/60 p-2.5">
              <div className="mb-1.5 flex items-center justify-between text-[9.5px]">
                <span className="text-sky-300">
                  {spectraTarget.code} · {spectraTarget.instrument}
                </span>
                <span
                  className={
                    isSpectraCollected
                      ? 'text-emerald-300'
                      : spectraTarget.roverExplored
                        ? 'text-amber-300'
                        : 'text-purple-300'
                  }
                >
                  {isSpectraCollected
                    ? '✓ CORED'
                    : spectraTarget.roverExplored
                      ? 'ROVER ANALYZED'
                      : '★ UNVISITED TARGET'}
                </span>
              </div>

              <RoverSpecimenPhoto target={spectraTarget} />

              <div className="mt-2 text-xs font-semibold text-white">{spectraTarget.name}</div>
              {spectraTarget.roverRef && (
                <div className="mt-0.5 text-[9.5px] text-amber-200/90">
                  NASA REF: {spectraTarget.roverRef}
                </div>
              )}
              <div className="mt-1 text-[10px] leading-relaxed text-white/75">
                {spectraTarget.mineralReadout}
              </div>

              <div className="mt-2 flex items-center justify-between border-t border-white/10 pt-2 text-[9.5px] text-white/60">
                <span>MASS: {(spectraTarget.massKg ?? 5.5).toFixed(1)} KG</span>
                <span>RANGE: {spectraTargetDist.toFixed(1)} m</span>
              </div>
            </div>

            <div className="flex gap-1.5">
              {spectraTargetDist <= 4.0 && !isSpectraCollected ? (
                <button
                  type="button"
                  onClick={() => startScan(spectraTarget.id)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded border border-sky-400/60 bg-sky-500/25 py-1.5 text-[10px] font-semibold text-sky-100 transition hover:bg-sky-500/40"
                >
                  <ScanLine className="h-3.5 w-3.5" />
                  <span>[E] SCAN &amp; CORE SPECIMEN</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    const res = computeSafeTraversePath(
                      telemetry.position,
                      spectraTarget.position,
                      site.terrainProfile
                    );
                    setActiveRoute({
                      targetId: spectraTarget.id,
                      targetName: `${spectraTarget.code} · ${spectraTarget.name}`,
                      ...res,
                    });
                    setSlateTab('MAP');
                  }}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded border border-cyan-400/50 bg-cyan-500/20 py-1.5 text-[10px] font-semibold text-cyan-100 transition hover:bg-cyan-500/35"
                >
                  <Navigation className="h-3.5 w-3.5" />
                  <span>PLOT ROUTE TO {spectraTarget.code}</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: [EVA MOBILITY] (Suit Safety & Dynamic Safe Return Calculator) */}
        {slateTab === 'MOBILITY' && (
          <div className="space-y-2.5 p-3">
            {/* Real-Time Suit Telemetry Gauges (Click any row to toggle critical test FX) */}
            <div className="space-y-1.5 rounded-lg border border-white/10 bg-black/55 p-2.5">
              {[
                {
                  key: 'O₂',
                  label: 'SUIT O₂ RESERVE',
                  val: `${Math.round(physiology.oxygen)}%`,
                  pct: physiology.oxygen,
                  bar: physiology.oxygen <= 30 ? 'bg-red-500 animate-pulse' : 'bg-cyan-400',
                  text: physiology.oxygen <= 30 ? 'text-red-300' : 'text-cyan-200',
                },
                {
                  key: 'CORE',
                  label: 'CORE TEMP (-63°C AMBIENT)',
                  val: `${physiology.bodyTempC.toFixed(1)}°C`,
                  pct: Math.min(100, Math.max(8, ((physiology.bodyTempC - 34.5) / 3.0) * 100)),
                  bar: physiology.bodyTempC <= 36.0 ? 'bg-cyan-300 animate-pulse' : 'bg-emerald-400',
                  text: physiology.bodyTempC <= 36.0 ? 'text-cyan-200' : 'text-emerald-200',
                },
                {
                  key: 'STAM',
                  label: 'ASTRONAUT STAMINA',
                  val: `${Math.round(physiology.stamina)}%`,
                  pct: physiology.stamina,
                  bar: physiology.stamina <= 30 ? 'bg-rose-400 animate-pulse' : 'bg-sky-400',
                  text: physiology.stamina <= 30 ? 'text-rose-300' : 'text-sky-200',
                },
                {
                  key: 'PACK',
                  label: 'CARRIED SAMPLE MASS',
                  val: `${carriedMassKg.toFixed(1)} / ${maxPackMassKg} KG (-${speedPenaltyPct}% SPD)`,
                  pct: loadRatio * 100,
                  bar: loadRatio >= 0.78 ? 'bg-amber-500 animate-pulse' : 'bg-amber-400',
                  text: loadRatio >= 0.4 ? 'text-amber-200' : 'text-white/80',
                },
              ].map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => toggleCriticalTest(m.key)}
                  title={`Click to test ${m.label} critical effect`}
                  className="block w-full rounded px-1 py-0.5 text-left transition hover:bg-white/5"
                >
                  <div className="flex items-center justify-between text-[9.5px]">
                    <span className="text-white/65">{m.label}</span>
                    <span className={m.text}>{m.val}</span>
                  </div>
                  <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      className={`h-full ${m.bar} transition-all duration-150`}
                      style={{ width: `${Math.min(100, Math.max(3, m.pct))}%` }}
                    />
                  </div>
                </button>
              ))}
              <div className="pt-0.5 text-[8.5px] text-white/45">
                TIP: CLICK ANY TELEMETRY BAR TO SIMULATE CRITICAL CONDITION
              </div>
            </div>

            {/* Dynamic Safe Return Margin Calculator */}
            <div
              className={`rounded-lg border p-2.5 ${
                returnMarginStatus === 'CRITICAL'
                  ? 'border-red-400/65 bg-red-950/45'
                  : returnMarginStatus === 'CAUTION'
                    ? 'border-amber-400/55 bg-amber-950/40'
                    : 'border-emerald-400/45 bg-emerald-950/30'
              }`}
            >
              <div className="mb-1.5 flex items-center justify-between text-[10px] font-bold">
                <span className="flex items-center gap-1.5">
                  <ShieldAlert className="h-3.5 w-3.5" />
                  SAFE RETURN MARGIN CALCULATOR
                </span>
                <span
                  className={
                    returnMarginStatus === 'CRITICAL'
                      ? 'text-red-300'
                      : returnMarginStatus === 'CAUTION'
                        ? 'text-amber-300'
                        : 'text-emerald-300'
                  }
                >
                  {returnMarginStatus}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[9.5px] text-white/80">
                <div>LANDER DIST: {Math.round(landerDistance)} m</div>
                <div>ENCUMBRANCE SPD: {effectiveSpeedMs.toFixed(1)} m/s</div>
                <div>EST. RETURN TIME: {Math.round(returnTimeSec)} s</div>
                <div>RETURN O₂ COST: {returnO2Cost.toFixed(1)}%</div>
              </div>

              <div className="mt-2 flex items-center justify-between border-t border-white/10 pt-1.5 text-[10px]">
                <span className="text-white/70">PROJECTED LANDER ARRIVAL O₂:</span>
                <span
                  className={`font-bold ${
                    returnO2Margin >= 35
                      ? 'text-emerald-300'
                      : returnO2Margin >= 15
                        ? 'text-amber-300'
                        : 'text-red-300'
                  }`}
                >
                  {returnO2Margin > 0 ? `+${returnO2Margin}% MARGIN` : `${returnO2Margin}% DEFICIT`}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setCustomPinpoint({
                  id: 'lander-base',
                  name: 'ARES-V Lander Airlock',
                  position: [0, 5.95],
                  isUnexplored: false,
                });
                setSlateTab('MAP');
              }}
              className="flex w-full items-center justify-center gap-1.5 rounded border border-cyan-400/50 bg-cyan-500/20 py-1.5 text-[10px] font-semibold text-cyan-100 transition hover:bg-cyan-500/35"
            >
              <Rocket className="h-3.5 w-3.5 text-cyan-300" />
              <span>PLOT RETURN TRAVERSE TO LANDER AIRLOCK</span>
            </button>
          </div>
        )}

        {/* Lower Slate Bezel: 4 Toggleable NASA Data Layer Switches */}
        <div className="grid grid-cols-4 gap-1 border-t border-cyan-500/30 bg-slate-900/95 p-1.5">
          {EVA_LAYERS.map((layer) => {
            const Icon = LAYER_ICONS[layer.id];
            const active = evaLayer === layer.id;
            return (
              <button
                key={layer.id}
                type="button"
                onClick={() => setEvaLayer(layer.id)}
                className={`flex flex-col items-center justify-center rounded border px-1 py-1.5 text-center transition ${
                  active
                    ? 'border-cyan-400/80 bg-cyan-500/25 text-white shadow-[0_0_12px_rgba(34,211,238,0.25)]'
                    : 'border-white/10 bg-black/45 text-white/60 hover:border-white/25 hover:text-white/90'
                }`}
              >
                <Icon className={`mb-0.5 h-3 w-3 ${active ? 'text-cyan-300' : 'text-white/50'}`} />
                <span className="text-[8.5px] font-semibold leading-none tracking-wider">
                  [{layer.key}] {layer.shortLabel}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
