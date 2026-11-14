import React, { useEffect, useMemo, useState } from 'react';
import {
  Camera,
  Eye,
  Layers,
  MapPin,
  Mountain,
  Navigation,
  Radio,
  ScanLine,
  Sparkles,
  X,
} from 'lucide-react';
import { EVA_LAYERS } from '../../data/landingZones';
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

const LAYER_SEGMENT_LABELS = {
  OPTICAL: 'OPTICAL',
  TOPOGRAPHY: 'TOPO',
  SPECTRAL: 'GEOLOGY',
  ENV: 'RAD/WX',
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

  const collectedIds = collectedSamples[site.id] || [];
  const vaultedIds = vaultedSamples[site.id] || [];
  const rover = site.nasaRover || null;
  const isRoverDiscovered = Boolean(discoveredRovers[site.id]);
  const [px, pz] = telemetry.position;

  const [liveTraverseData, setLiveTraverseData] = useState(null);
  const [selectedPinpointInfo, setSelectedPinpointInfo] = useState(null);
  const [mapTooltip, setMapTooltip] = useState(null);

  useEffect(() => {
    setSelectedPinpointInfo(null);
    setMapTooltip(null);
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

  // Dashed cyan safe traverse loop from Lander -> stations
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

  // Continuous 3x3 spatial heatmap quantized every 3m so panning stays smooth with zero gap
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

  // Inspected item for right-hand MAP / ROUTE Inspector Card
  const fallbackTarget =
    site.targets.find((t) => t.id === (inspectedTargetId || activeTarget?.id)) ||
    nextWaypoint?.target ||
    site.targets[0];

  const inspectedItem = useMemo(() => {
    if (selectedPinpointInfo) return selectedPinpointInfo;
    if (!fallbackTarget) return null;
    const isCollected = collectedIds.includes(fallbackTarget.id);
    return {
      id: fallbackTarget.id,
      kind: isCollected
        ? `${fallbackTarget.code} · Cored`
        : fallbackTarget.roverExplored
          ? `${fallbackTarget.code} · Sample Target`
          : `${fallbackTarget.code} · Unvisited Target`,
      title: fallbackTarget.name,
      detail: fallbackTarget.mineralReadout,
      position: fallbackTarget.position,
      isTarget: true,
      targetObj: fallbackTarget,
    };
  }, [selectedPinpointInfo, fallbackTarget, collectedIds]);

  const inspectedRoute = useMemo(() => {
    if (!wristMapOpen || !inspectedItem?.position) {
      return { distanceMeters: 0, maxSlopeDeg: 0, points: [] };
    }
    return computeSafeTraversePath([px, pz], inspectedItem.position, site.terrainProfile);
  }, [wristMapOpen, px, pz, inspectedItem, site.terrainProfile]);

  // Inspected target for SPECTRA / REF tab
  const spectraTarget =
    site.targets.find((t) => t.id === (inspectedTargetId || activeTarget?.id)) ||
    nextWaypoint?.target ||
    site.targets[0];
  const spectraTargetDist = spectraTarget
    ? Math.hypot(spectraTarget.position[0] - px, spectraTarget.position[1] - pz)
    : 99;
  const isSpectraCollected = spectraTarget ? collectedIds.includes(spectraTarget.id) : false;
  const isSpectraVaulted = spectraTarget ? vaultedIds.includes(spectraTarget.id) : false;

  // Dynamic Mobility & Safe Return Calculator
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

    setMapTooltip(null);
    setSelectedPinpointInfo({
      id: 'custom-pinpoint',
      kind: isUnexplored ? 'Unexplored Sector' : 'Survey Point',
      title: isUnexplored ? 'Unexplored Frontier Waypoint' : 'Surface Survey Waypoint',
      detail: 'Terrain coordinate plotted from orbital elevation mosaic.',
      position: [wx, wz],
      isUnexplored,
    });
  };

  const handlePlotInspectedRoute = () => {
    if (!inspectedItem?.position) return;
    const matchingTarget = site.targets.find((t) => t.id === inspectedItem.id);
    if (matchingTarget) {
      setActiveRoute({
        targetId: matchingTarget.id,
        targetName: `${matchingTarget.code} · ${matchingTarget.name}`,
        ...inspectedRoute,
      });
    } else {
      setCustomPinpoint({
        id: inspectedItem.id || 'custom-pinpoint',
        name: inspectedItem.title || 'Survey Waypoint',
        position: inspectedItem.position,
        isUnexplored: Boolean(inspectedItem.isUnexplored),
      });
    }
  };

  const [playerSx, playerSy] = toSvgCoords(px, pz, px, pz);
  const [landerSx, landerSy] = toSvgCoords(0, 8, px, pz);
  const routeSvgPts = activeRoute?.points
    ? activeRoute.points.map(([wx, , wz]) => toSvgCoords(wx, wz, px, pz).join(',')).join(' ')
    : null;

  // PERIPHERAL STOWED VIEW (Default in lower-left corner alongside 3D forearm device)
  if (!wristMapOpen) {
    const stowedWpDist = activeRoute
      ? Math.round(activeRoute.distanceMeters)
      : nextWaypoint
        ? Math.round(nextWaypoint.dist)
        : 0;
    const stowedWpLabel = activeRoute
      ? collectedIds.includes(activeRoute.targetId) || activeRoute.targetId === 'lander-base'
        ? activeRoute.targetName
        : `${site.targets.find((t) => t.id === activeRoute.targetId)?.code || 'WAYPOINT'} · ?`
      : nextWaypoint
        ? `${nextWaypoint.target.code} · ?`
        : 'ALL CORES VAULTED';

    return (
      <div className="pointer-events-none fixed bottom-6 right-6 z-20 flex flex-col items-end gap-2.5">
        {/* Proximity Verification Card when approaching an uncollected rock target */}
        {activeTarget && !isActiveCollected && !nearLander && !scanningState.active && (
          <div className="pointer-events-auto w-64 rounded-xl border border-white/15 bg-slate-950/85 p-2.5 shadow-2xl backdrop-blur-md sm:w-72">
            <div className="mb-1.5 flex items-center justify-between text-[10px] font-medium text-cyan-300">
              <span className="flex items-center gap-1">
                <Camera className="h-3 w-3" />
                Specimen Target
              </span>
              <span className="text-amber-300">{activeTarget.code}</span>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="flex h-12 w-20 shrink-0 items-center justify-center rounded border border-amber-400/35 bg-slate-900/90 font-mono text-lg font-bold text-amber-300">
                ?
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-semibold text-white">
                  Unscanned Specimen
                </div>
                <div className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-slate-300">
                  Press [E] to scan &amp; core sample.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Bottom-Right Circular Minimap with Crisp 2-Line Waypoint Pill Below */}
        <button
          type="button"
          onClick={() => setWristMapOpen(true)}
          title="Open ARES-V Field Slate ([M] or [TAB])"
          className="pointer-events-auto group flex flex-col items-center gap-1.5 text-center font-sans transition"
        >
          <div className="relative h-32 w-32 shrink-0 overflow-hidden rounded-full border-2 border-cyan-300/45 bg-slate-950 shadow-[0_0_24px_rgba(34,211,238,0.2)] ring-1 ring-cyan-400/20 transition group-hover:border-cyan-300/80 sm:h-36 sm:w-36">
            <svg viewBox={`0 0 ${MAP_PX} ${MAP_PX}`} className="h-full w-full">
              <defs>
                <clipPath id="miniSectorClip">
                  <circle cx={MAP_PX / 2} cy={MAP_PX / 2} r={MAP_PX / 2} />
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
              <circle
                cx={MAP_PX / 2}
                cy={MAP_PX / 2}
                r={MAP_PX / 2}
                fill="#020617"
                opacity="0.06"
              />

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
                <circle
                  cx={MAP_PX / 2}
                  cy={MAP_PX / 2}
                  r={MAP_PX * 0.32}
                  fill="none"
                  stroke="rgba(125,211,252,0.2)"
                  strokeWidth="1"
                  strokeDasharray="4 5"
                />
              </g>

              {roverPathSvgPts && (
                <polyline
                  points={roverPathSvgPts}
                  fill="none"
                  stroke="#22c55e"
                  strokeWidth="4.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity="0.96"
                  clipPath="url(#miniSectorClip)"
                />
              )}
              {roverLandingPos &&
                (() => {
                  const [ylx, yly] = toSvgCoords(roverLandingPos[0], roverLandingPos[1], px, pz);
                  return (
                    <polygon
                      points={`${ylx},${yly - 7} ${ylx + 6},${yly} ${ylx},${yly + 7} ${ylx - 6},${yly}`}
                      fill="#facc15"
                      clipPath="url(#miniSectorClip)"
                    />
                  );
                })()}
              {rover &&
                (() => {
                  const [rx, ry] = toSvgCoords(rover.position[0], rover.position[1], px, pz);
                  return (
                    <circle
                      cx={rx}
                      cy={ry}
                      r="5.5"
                      fill="#22d3ee"
                      clipPath="url(#miniSectorClip)"
                    />
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
                  clipPath="url(#miniSectorClip)"
                />
              )}
              <polygon
                points={`${landerSx},${landerSy - 8} ${landerSx + 7},${landerSy + 6} ${landerSx - 7},${landerSy + 6}`}
                fill="#38bdf8"
                clipPath="url(#miniSectorClip)"
              />
              <g transform={`translate(${playerSx}, ${playerSy}) rotate(${telemetry.heading})`}>
                <polygon points="0,-13 8,10 0,5 -8,10" fill="#ffffff" />
              </g>
            </svg>
            <span className="pointer-events-none absolute top-0.5 left-1/2 -translate-x-1/2 font-mono text-[8px] font-bold text-cyan-200/80">
              N
            </span>
          </div>

          <div className="max-w-[180px] text-center drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)]">
            <div className="truncate text-[11px] font-semibold leading-tight text-white">
              {stowedWpLabel}
            </div>
            {stowedWpDist > 0 && (
              <div className="mt-0.5 truncate font-mono text-[10px] leading-tight text-cyan-200/90">
                {stowedWpDist}m
              </div>
            )}
          </div>
        </button>
      </div>
    );
  }

  // ACTIVE INSPECTION VIEW ([M], [TAB], or Right-Click): Centered Compact Field Slate Tablet
  const isRouteActiveToInspected =
    activeRoute?.targetId && inspectedItem?.id && activeRoute.targetId === inspectedItem.id;

  return (
    <div
      onClick={() => setWristMapOpen(false)}
      className="pointer-events-auto fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-3xl flex-col gap-4 overflow-y-auto rounded-2xl border border-white/15 bg-slate-950/90 p-5 font-sans text-white shadow-2xl backdrop-blur-xl"
      >
        {/* Clean Tablet Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <h2 className="truncate text-base font-semibold tracking-tight text-white">
              {site.name}
            </h2>
            <span className="hidden shrink-0 rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[11px] font-medium text-slate-300 sm:inline-flex">
              {rover?.shortName || site.shortName} · {vaultedIds.length} / {site.targets.length} Vaulted
            </span>
          </div>

          <button
            type="button"
            onClick={() => setWristMapOpen(false)}
            aria-label="Stow field slate"
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 2 Clean Tab Switches */}
        <div className="grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
          {[
            { id: 'MAP', label: 'MAP / ROUTE', icon: MapPin },
            { id: 'SPECTRA', label: 'SPECTRA / REF', icon: Sparkles },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = (slateTab === 'SPECTRA' ? 'SPECTRA' : 'MAP') === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSlateTab(tab.id)}
                className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition ${
                  active
                    ? 'bg-white/15 text-white shadow-sm'
                    : 'text-slate-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon className={`h-3.5 w-3.5 ${active ? 'text-cyan-400' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* TAB 1: MAP / ROUTE (60% Interactive Map + 40% Single Compact Inspector Card) */}
        {slateTab !== 'SPECTRA' && (
          <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-5">
            {/* Left (60%): Clean Interactive Map */}
            <div className="md:col-span-3">
              <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-white/10 bg-slate-950">
                {/* Hover/Click Pin Tooltip ONLY */}
                {mapTooltip && (
                  <div className="pointer-events-none absolute top-3 left-3 z-10 max-w-[85%] truncate rounded-lg border border-white/15 bg-slate-950/90 px-2.5 py-1 text-xs font-medium text-white shadow-lg backdrop-blur-md">
                    {mapTooltip}
                  </div>
                )}

                <svg
                  viewBox={`0 0 ${MAP_PX} ${MAP_PX}`}
                  onClick={handleSvgMapClick}
                  onMouseLeave={() => setMapTooltip(null)}
                  className="block h-full w-full cursor-crosshair select-none"
                >
                  <defs>
                    <clipPath id="marsSectorClip">
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
                    clipPath="url(#marsSectorClip)"
                    opacity="0.92"
                  />
                  <rect width={MAP_PX} height={MAP_PX} fill="#020617" opacity="0.08" />

                  {sectorHeatmap.dataUrl && (
                    <image
                      href={sectorHeatmap.dataUrl}
                      x={hmLeft}
                      y={hmTop}
                      width={sectorHeatmap.svgExtent}
                      height={sectorHeatmap.svgExtent}
                      preserveAspectRatio="none"
                      clipPath="url(#marsSectorClip)"
                      opacity="0.52"
                    />
                  )}

                  {/* Subtle 3x3 Chunk Grid Lines (zero raw coordinate text) */}
                  <g clipPath="url(#marsSectorClip)">
                    {activeChunks.map((chunk) => {
                      const [cLeft, cTop] = toSvgCoords(chunk.minX, chunk.minZ, px, pz);
                      const sizeSvg = (CHUNK_SIZE / MAP_SPAN) * MAP_PX;
                      const isCenterChunk = chunk.cx === playerCx && chunk.cz === playerCz;
                      return (
                        <rect
                          key={chunk.key}
                          x={cLeft}
                          y={cTop}
                          width={sizeSvg}
                          height={sizeSvg}
                          fill="none"
                          stroke={isCenterChunk ? 'rgba(56, 189, 248, 0.35)' : 'rgba(148, 163, 184, 0.14)'}
                          strokeDasharray={isCenterChunk ? undefined : '2.5 2.5'}
                          strokeWidth={isCenterChunk ? '0.7' : '0.5'}
                        />
                      );
                    })}
                  </g>

                  {/* Iso-Contours */}
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

                  {/* NASA Rover Traverse Path */}
                  {roverPathSvgPts && (
                    <g>
                      <polyline
                        points={roverPathSvgPts}
                        fill="none"
                        stroke="#4ade80"
                        strokeWidth="5.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        opacity="0.3"
                      />
                      <polyline
                        points={roverPathSvgPts}
                        fill="none"
                        stroke="#22c55e"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        opacity="0.96"
                      />
                    </g>
                  )}

                  {/* Safe Loop Preview */}
                  {masterLoopSvgPtsStr && (
                    <polyline
                      points={masterLoopSvgPtsStr}
                      fill="none"
                      stroke="#22d3ee"
                      strokeWidth="0.95"
                      strokeDasharray="4 3"
                      opacity="0.42"
                    />
                  )}

                  {/* Active Plotted A* Route */}
                  {routeSvgPts && (
                    <polyline
                      points={routeSvgPts}
                      fill="none"
                      stroke="#38bdf8"
                      strokeWidth="2.3"
                      strokeDasharray="5 3"
                      opacity="0.98"
                    />
                  )}

                  {/* Rover Route Milestone Circular Pins */}
                  {alignedRouteWaypoints.map((wp) => {
                    const [wxp, wyp] = toSvgCoords(wp.position[0], wp.position[1], px, pz);
                    const isSelected = inspectedItem?.id === wp.id;
                    return (
                      <g
                        key={wp.id}
                        onMouseEnter={() => setMapTooltip(`${wp.sol} · ${wp.name}`)}
                        onMouseLeave={() => setMapTooltip(null)}
                        onClick={(e) => {
                          e.stopPropagation();
                          setMapTooltip(`${wp.sol} · ${wp.name}`);
                          setSelectedPinpointInfo({
                            id: wp.id,
                            kind: `Rover Milestone · ${wp.sol}`,
                            title: wp.name,
                            detail: wp.detail,
                            position: wp.position,
                          });
                        }}
                        className="cursor-pointer"
                      >
                        <circle cx={wxp} cy={wyp} r={7} fill="transparent" />
                        <circle
                          cx={wxp}
                          cy={wyp}
                          r={isSelected ? 4 : 2.6}
                          fill={isSelected ? '#fde047' : '#86efac'}
                          stroke="#022c22"
                          strokeWidth="0.9"
                        />
                      </g>
                    );
                  })}

                  {/* Sol 0 Touchdown Pin */}
                  {roverLandingPos &&
                    (() => {
                      const [lx0, ly0] = toSvgCoords(roverLandingPos[0], roverLandingPos[1], px, pz);
                      const isSelected = inspectedItem?.id === 'rover-landing-sol0';
                      return (
                        <g
                          onMouseEnter={() => setMapTooltip(rover?.landingName || 'Sol 0 Landing')}
                          onMouseLeave={() => setMapTooltip(null)}
                          onClick={(e) => {
                            e.stopPropagation();
                            setMapTooltip(rover?.landingName || 'Sol 0 Landing');
                            setSelectedPinpointInfo({
                              id: 'rover-landing-sol0',
                              kind: 'Sol 0 Touchdown',
                              title: rover?.landingName || 'Sol 0 Landing',
                              detail: rover?.mission || 'Initial surface landing site.',
                              position: roverLandingPos,
                            });
                          }}
                          className="cursor-pointer"
                        >
                          <circle
                            cx={lx0}
                            cy={ly0}
                            r={isSelected ? 7.5 : 5.5}
                            fill="rgba(250, 204, 21, 0.2)"
                            stroke="#fde047"
                            strokeWidth="1.1"
                          />
                          <polygon
                            points={`${lx0},${ly0 - 4.2} ${lx0 + 4},${ly0} ${lx0},${ly0 + 4.2} ${lx0 - 4},${ly0}`}
                            fill="#facc15"
                            stroke="#020617"
                            strokeWidth="0.8"
                          />
                        </g>
                      );
                    })()}

                  {/* NASA Rover Pin */}
                  {rover &&
                    (() => {
                      const [rx, ry] = toSvgCoords(rover.position[0], rover.position[1], px, pz);
                      const isSelected = inspectedItem?.id === rover.id;
                      return (
                        <g
                          onMouseEnter={() => setMapTooltip(`${rover.shortName} · Sol ${rover.latestSol}`)}
                          onMouseLeave={() => setMapTooltip(null)}
                          onClick={(e) => {
                            e.stopPropagation();
                            discoverRover(site.id);
                            setMapTooltip(`${rover.shortName} · Sol ${rover.latestSol}`);
                            setSelectedPinpointInfo({
                              id: rover.id,
                              kind: `NASA Rover · Sol ${rover.latestSol}`,
                              title: rover.name,
                              detail: rover.keyDiscoveries,
                              position: rover.position,
                            });
                          }}
                          className="cursor-pointer"
                        >
                          <circle
                            cx={rx}
                            cy={ry}
                            r={isSelected ? 8 : 6.2}
                            fill="rgba(34, 211, 238, 0.22)"
                            stroke="#22d3ee"
                            strokeWidth="1.2"
                          />
                          <circle cx={rx} cy={ry} r="3.4" fill="#22d3ee" stroke="#020617" strokeWidth="0.8" />
                        </g>
                      );
                    })()}

                  {/* Lander Base Pin */}
                  <g
                    onMouseEnter={() => setMapTooltip('ARES-V Lander Airlock')}
                    onMouseLeave={() => setMapTooltip(null)}
                    onClick={(e) => {
                      e.stopPropagation();
                      setMapTooltip('ARES-V Lander Airlock');
                      setSelectedPinpointInfo({
                        id: 'lander-base',
                        kind: 'EVA Lander Base',
                        title: 'ARES-V Lander Airlock',
                        detail: 'Base camp airlock for O₂ resupply and core sample vaulting.',
                        position: [0, 5.95],
                      });
                    }}
                    className="cursor-pointer"
                  >
                    <circle cx={landerSx} cy={landerSy} r={6.5} fill="transparent" />
                    <polygon
                      points={`${landerSx},${landerSy - 4.4} ${landerSx + 4.2},${landerSy + 3.4} ${landerSx - 4.2},${landerSy + 3.4}`}
                      fill="#38bdf8"
                      stroke="#020617"
                      strokeWidth="0.9"
                    />
                  </g>

                  {/* Geological Sample Target Circular Pins (Zero permanent text labels) */}
                  {site.targets.map((tgt) => {
                    const [tx, ty] = toSvgCoords(tgt.position[0], tgt.position[1], px, pz);
                    const done = collectedIds.includes(tgt.id);
                    const isSelected = inspectedItem?.id === tgt.id;
                    const isRouted = activeRoute?.targetId === tgt.id;
                    const fill = done ? '#10b981' : !tgt.roverExplored ? '#c084fc' : '#fbbf24';
                    return (
                      <g
                        key={tgt.id}
                        onMouseEnter={() =>
                          setMapTooltip(done ? `${tgt.code} · ${tgt.name}` : `${tgt.code} · ? (Unscanned)`)
                        }
                        onMouseLeave={() => setMapTooltip(null)}
                        onClick={(e) => {
                          e.stopPropagation();
                          setInspectedTargetId(tgt.id);
                          setMapTooltip(done ? `${tgt.code} · ${tgt.name}` : `${tgt.code} · ? (Unscanned)`);
                          setSelectedPinpointInfo({
                            id: tgt.id,
                            kind: done
                              ? `${tgt.code} · Cored`
                              : `${tgt.code} · ? Unscanned`,
                            title: done ? tgt.name : '? · Unscanned Specimen',
                            detail: done
                              ? tgt.mineralReadout
                              : 'Plot a safe route and press [E] at the site to scan & identify this specimen.',
                            position: tgt.position,
                            isUnexplored: !tgt.roverExplored,
                            isTarget: true,
                          });
                        }}
                        className="cursor-pointer"
                      >
                        <circle cx={tx} cy={ty} r={7.5} fill="transparent" />
                        {(isSelected || isRouted) && (
                          <circle
                            cx={tx}
                            cy={ty}
                            r={7}
                            fill="none"
                            stroke={isRouted ? '#38bdf8' : '#ffffff'}
                            strokeWidth="1.1"
                          />
                        )}
                        <circle
                          cx={tx}
                          cy={ty}
                          r={done ? (isSelected ? 4 : 3.2) : 5.2}
                          fill={fill}
                          stroke="#020617"
                          strokeWidth="0.9"
                        />
                        {!done && (
                          <text
                            x={tx}
                            y={ty + 2.4}
                            textAnchor="middle"
                            fontSize="7"
                            fontWeight="700"
                            fill="#020617"
                            className="pointer-events-none select-none font-mono"
                          >
                            ?
                          </text>
                        )}
                      </g>
                    );
                  })}

                  {/* Selected Terrain Crosshair */}
                  {selectedPinpointInfo?.id === 'custom-pinpoint' &&
                    (() => {
                      const [cxp, cyp] = toSvgCoords(
                        selectedPinpointInfo.position[0],
                        selectedPinpointInfo.position[1],
                        px,
                        pz
                      );
                      return (
                        <g>
                          <circle cx={cxp} cy={cyp} r={6} fill="none" stroke="#e879f9" strokeWidth="1.2" />
                          <circle cx={cxp} cy={cyp} r={2} fill="#f0abfc" />
                        </g>
                      );
                    })()}

                  {/* Active Route Custom Pinpoint */}
                  {customPinpoint?.position &&
                    selectedPinpointInfo?.id !== 'custom-pinpoint' &&
                    (() => {
                      const [cxp, cyp] = toSvgCoords(
                        customPinpoint.position[0],
                        customPinpoint.position[1],
                        px,
                        pz
                      );
                      return (
                        <circle cx={cxp} cy={cyp} r={5.5} fill="none" stroke="#38bdf8" strokeWidth="1.1" />
                      );
                    })()}

                  {/* Astronaut Position + Heading */}
                  <g transform={`translate(${playerSx}, ${playerSy}) rotate(${telemetry.heading})`}>
                    <polygon
                      points="0,-5.8 3.6,3.8 0,1.7 -3.6,3.8"
                      fill="#ffffff"
                      stroke="#0ea5e9"
                      strokeWidth="0.9"
                    />
                  </g>
                </svg>
              </div>
            </div>

            {/* Right (40%): Single Compact Waypoint Inspector Card */}
            <div className="md:col-span-2">
              <div className="flex h-full flex-col justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wider text-slate-400">
                      {inspectedItem?.kind || 'Waypoint'}
                    </span>
                    <h3 className="text-base font-semibold leading-snug text-white">
                      {inspectedItem?.title || 'Select a Waypoint'}
                    </h3>
                  </div>

                  <p className="line-clamp-2 text-xs leading-relaxed text-slate-300">
                    {inspectedItem?.detail || 'Click any pin or terrain point on the map to inspect.'}
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                      <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                        DISTANCE
                      </div>
                      <div className="mt-1 text-sm font-semibold text-white">
                        {Math.round(inspectedRoute.distanceMeters)} m
                      </div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                      <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                        MAX SLOPE
                      </div>
                      <div className="mt-1 text-sm font-semibold text-white">
                        {inspectedRoute.maxSlopeDeg}°
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={handlePlotInspectedRoute}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 py-2.5 text-xs font-semibold text-slate-950 transition hover:bg-cyan-400 active:scale-[0.99]"
                  >
                    <Navigation className="h-3.5 w-3.5" />
                    <span>{isRouteActiveToInspected ? 'ROUTE ACTIVE' : 'PLOT SAFE ROUTE'}</span>
                  </button>
                  {activeRoute && (
                    <button
                      type="button"
                      onClick={clearActiveRoute}
                      className="w-full rounded-xl border border-white/10 bg-white/[0.03] py-2 text-xs font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
                    >
                      Clear Route
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: SPECTRA / REF (2x2 Metric Tiles + 1-Line Summary) */}
        {slateTab === 'SPECTRA' && spectraTarget && (
          <div className="flex flex-col gap-4">
            {/* Compact Target Pills */}
            <div className="flex flex-wrap gap-1.5">
              {site.targets.map((tgt) => {
                const selected = tgt.id === spectraTarget.id;
                const collected = collectedIds.includes(tgt.id);
                return (
                  <button
                    key={tgt.id}
                    type="button"
                    onClick={() => setInspectedTargetId(tgt.id)}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                      selected
                        ? 'border-cyan-400/60 bg-cyan-500/20 text-white'
                        : collected
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                          : 'border-white/10 bg-white/[0.03] text-slate-400 hover:text-white'
                    }`}
                  >
                    {tgt.code}
                    {!collected ? ' · ?' : ''}
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="flex flex-col justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <div className="overflow-hidden rounded-lg border border-white/10">
                  {isSpectraCollected ? (
                    <RoverSpecimenPhoto target={spectraTarget} />
                  ) : (
                    <div className="flex aspect-[260/140] w-full flex-col items-center justify-center gap-1.5 bg-slate-950/90 text-amber-300">
                      <span className="flex h-12 w-12 items-center justify-center rounded-full border border-amber-300/45 bg-amber-500/10 font-mono text-2xl font-bold">
                        ?
                      </span>
                      <span className="font-mono text-[10px] tracking-wider text-slate-400">
                        UNSCANNED SPECIMEN
                      </span>
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-semibold text-white">
                    {isSpectraCollected ? spectraTarget.name : `${spectraTarget.code} · ? (Unscanned)`}
                  </h3>
                  <p className="line-clamp-2 text-xs leading-relaxed text-slate-300">
                    {isSpectraCollected
                      ? spectraTarget.mineralReadout
                      : 'Approach this target in the field and press [E] to scan & log its mineral signature.'}
                  </p>
                  {isSpectraVaulted && spectraTarget.discoveryNote && (
                    <div className="mt-2 rounded-lg border border-emerald-400/25 bg-emerald-500/10 p-2 text-[11px] leading-relaxed text-emerald-100/90">
                      <span className="font-mono text-[9px] tracking-wider text-emerald-300">
                        DISCOVERY NOTE ·{' '}
                      </span>
                      {spectraTarget.discoveryNote}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                    <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                      MINERAL
                    </div>
                    <div className="mt-1 truncate text-sm font-semibold capitalize text-white">
                      {isSpectraCollected ? spectraTarget.dominantMineral || 'Silicate' : '?'}
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                    <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                      STATUS
                    </div>
                    <div className="mt-1 text-sm font-semibold text-white">
                      {isSpectraCollected ? 'Cored' : '?'}
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                    <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                      CORE MASS
                    </div>
                    <div className="mt-1 text-sm font-semibold text-white">
                      {isSpectraCollected ? `${(spectraTarget.massKg ?? 5.5).toFixed(1)} kg` : '?'}
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                    <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                      RANGE
                    </div>
                    <div className="mt-1 text-sm font-semibold text-white">
                      {spectraTargetDist.toFixed(1)} m
                    </div>
                  </div>
                </div>

                {spectraTargetDist <= 4.0 && !isSpectraCollected ? (
                  <button
                    type="button"
                    onClick={() => startScan(spectraTarget.id)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 py-2.5 text-xs font-semibold text-slate-950 transition hover:bg-cyan-400"
                  >
                    <ScanLine className="h-4 w-4" />
                    <span>SCAN &amp; CORE SPECIMEN</span>
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
                      setSelectedPinpointInfo(null);
                      setSlateTab('MAP');
                    }}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 py-2.5 text-xs font-semibold text-slate-950 transition hover:bg-cyan-400"
                  >
                    <Navigation className="h-4 w-4" />
                    <span>PLOT SAFE ROUTE</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Bottom Compact Segmented Control Bar: 4 Layer Switches */}
        <div className="grid grid-cols-4 gap-1 rounded-xl border border-white/10 bg-slate-900/80 p-1">
          {EVA_LAYERS.map((layer) => {
            const Icon = LAYER_ICONS[layer.id];
            const active = evaLayer === layer.id;
            const label = LAYER_SEGMENT_LABELS[layer.id] || layer.shortLabel;
            return (
              <button
                key={layer.id}
                type="button"
                onClick={() => setEvaLayer(layer.id)}
                className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[11px] font-medium tracking-wider transition ${
                  active
                    ? 'bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-400/50'
                    : 'text-slate-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-cyan-300' : 'text-slate-400'}`} />
                <span className="truncate">
                  [{layer.key}] {label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
