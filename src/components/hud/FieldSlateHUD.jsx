import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Lock, X } from 'lucide-react';
import { EVA_LAYERS, LANDING_ZONES, LANDING_ZONES_BY_ID } from '../../data/landingZones';
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

const LAYER_SEGMENT_LABELS = {
  OPTICAL: 'Optical',
  TOPOGRAPHY: 'Terrain',
  SPECTRAL: 'Geology',
  ENV: 'Radiation',
};

const SLATE_TABS = [
  { id: 'MAP', label: 'Map and route' },
  { id: 'SPECTRA', label: 'Samples' },
  { id: 'HERITAGE', label: 'Sites & Rovers' },
];

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
  const discoveredLandingSites = useMissionStore((s) => s.discoveredLandingSites);
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
  const [heritageSiteId, setHeritageSiteId] = useState(site.id);

  useEffect(() => {
    setSelectedPinpointInfo(null);
    setMapTooltip(null);
    setHeritageSiteId(site.id);
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
          ? `${fallbackTarget.code} · Sample target`
          : `${fallbackTarget.code} · Off the rover track`,
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
      kind: isUnexplored ? 'Off the rover track' : 'Survey point',
      title: isUnexplored ? 'Unexplored ground' : 'Picked point',
      detail: 'A point you picked on the map.',
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
        name: inspectedItem.title || 'Picked point',
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
        : site.targets.find((t) => t.id === activeRoute.targetId)?.code || 'Waypoint'
      : nextWaypoint
        ? nextWaypoint.target.code
        : 'All cores vaulted';

    return (
      <div className="pointer-events-none fixed right-6 bottom-6 z-20 flex flex-col items-end gap-3">
        {/* Shown when you walk up to a rock you have not scanned */}
        {activeTarget && !isActiveCollected && !nearLander && !scanningState.active && (
          <div className="panel pointer-events-auto w-64 px-3 py-2.5">
            <div className="flex items-baseline justify-between">
              <span className="label">Target in range</span>
              <span className="num text-[11px] text-bone">{activeTarget.code}</span>
            </div>
            <p className="mt-1 text-[12px] leading-snug text-bone/90">
              Not scanned yet. Press <kbd>E</kbd> to scan and core it.
            </p>
          </div>
        )}

        {/* Minimap. Click or press M to open the slate. */}
        <button
          type="button"
          onClick={() => setWristMapOpen(true)}
          title="Open the field slate (M or Tab)"
          className="group pointer-events-auto flex flex-col items-center gap-1.5 text-center"
        >
          <div className="relative h-32 w-32 shrink-0 overflow-hidden rounded-full border border-bone/70 bg-ink transition-colors group-hover:border-bone sm:h-36 sm:w-36">
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
                fill="#0d0c0b"
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
                      stroke={isCenter ? 'rgba(235,228,212,0.4)' : 'rgba(148,163,184,0.22)'}
                      strokeWidth={isCenter ? '1.1' : '0.7'}
                    />
                  );
                })}
                <circle
                  cx={MAP_PX / 2}
                  cy={MAP_PX / 2}
                  r={MAP_PX * 0.32}
                  fill="none"
                  stroke="rgba(235,228,212,0.2)"
                  strokeWidth="1"
                  strokeDasharray="4 5"
                />
              </g>

              {roverPathSvgPts && (
                <polyline
                  points={roverPathSvgPts}
                  fill="none"
                  stroke="#ebe4d4"
                  strokeWidth="3"
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
                      fill="#ebe4d4"
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
                      fill="#ebe4d4"
                      clipPath="url(#miniSectorClip)"
                    />
                  );
                })()}
              {routeSvgPts && (
                <polyline
                  points={routeSvgPts}
                  fill="none"
                  stroke="#d6f24a"
                  strokeWidth="5"
                  strokeDasharray="8 6"
                  opacity="0.95"
                  clipPath="url(#miniSectorClip)"
                />
              )}
              <polygon
                points={`${landerSx},${landerSy - 8} ${landerSx + 7},${landerSy + 6} ${landerSx - 7},${landerSy + 6}`}
                fill="#0d0c0b"
                stroke="#ebe4d4"
                strokeWidth="2.2"
                clipPath="url(#miniSectorClip)"
              />
              <g transform={`translate(${playerSx}, ${playerSy}) rotate(${telemetry.heading})`}>
                <polygon points="0,-13 8,10 0,5 -8,10" fill="#ffffff" />
              </g>
            </svg>
            <span className="num pointer-events-none absolute top-1 left-1/2 -translate-x-1/2 text-[9px] font-bold text-bone [text-shadow:0_0_2px_#000]">
              N
            </span>
          </div>

          <div className="on-scene max-w-[180px] text-center">
            <div className="truncate text-[12px] leading-tight text-bone">{stowedWpLabel}</div>
            {stowedWpDist > 0 && (
              <div className="num mt-0.5 text-[11px] leading-tight text-hivis">{stowedWpDist} m</div>
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
      className="pointer-events-auto fixed inset-0 z-30 flex items-center justify-center bg-black/55 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="panel flex max-h-[92vh] w-full max-w-3xl flex-col overflow-y-auto text-bone"
      >
        <div className="flex items-start justify-between gap-4 px-5 pt-5">
          <div className="min-w-0">
            <div className="label mb-1">
              Field slate · {vaultedIds.length} of {site.targets.length} cores vaulted
            </div>
            <h2 className="place truncate text-[22px] leading-tight">{site.name}</h2>
          </div>
          <button
            type="button"
            onClick={() => setWristMapOpen(false)}
            aria-label="Stow field slate"
            className="icon-btn -mt-1 -mr-2"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div role="tablist" className="mt-4 flex gap-6 border-b border-rule px-5 text-[13px]">
          {SLATE_TABS.map((tab) => {
            const currentTab = SLATE_TABS.some((t) => t.id === slateTab) ? slateTab : 'MAP';
            const active = currentTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSlateTab(tab.id)}
                className={`-mb-px border-b-2 pb-2 transition-colors ${
                  active
                    ? 'border-bone text-bone'
                    : 'border-transparent text-dim hover:text-bone'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Map and route */}
        {slateTab !== 'SPECTRA' && slateTab !== 'HERITAGE' && (
          <div className="grid grid-cols-1 items-stretch gap-5 p-5 md:grid-cols-5">
            <div className="md:col-span-3">
              <div className="relative aspect-square w-full overflow-hidden border border-rule bg-ink">
                {mapTooltip && (
                  <div className="pointer-events-none absolute top-2 left-2 z-10 max-w-[85%] truncate bg-ink px-2 py-1 text-[12px] text-bone">
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
                  <rect width={MAP_PX} height={MAP_PX} fill="#0d0c0b" opacity="0.08" />

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
                          stroke={isCenterChunk ? 'rgba(235, 228, 212, 0.3)' : 'rgba(148, 163, 184, 0.14)'}
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
                        stroke="#0d0c0b"
                        strokeWidth="4.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        opacity="0.65"
                      />
                      <polyline
                        points={roverPathSvgPts}
                        fill="none"
                        stroke="#ebe4d4"
                        strokeWidth="1.6"
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
                      stroke="#ebe4d4"
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
                      stroke="#d6f24a"
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
                            kind: `Rover stop · ${wp.sol}`,
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
                          fill={isSelected ? '#d6f24a' : '#ebe4d4'}
                          stroke="#0d0c0b"
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
                              kind: 'Rover landing, Sol 0',
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
                            fill="rgba(235, 228, 212, 0.18)"
                            stroke="#ebe4d4"
                            strokeWidth="1.1"
                          />
                          <polygon
                            points={`${lx0},${ly0 - 4.2} ${lx0 + 4},${ly0} ${lx0},${ly0 + 4.2} ${lx0 - 4},${ly0}`}
                            fill="#ebe4d4"
                            stroke="#0d0c0b"
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
                              kind: `Rover · Sol ${rover.latestSol}`,
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
                            fill="rgba(235, 228, 212, 0.18)"
                            stroke="#ebe4d4"
                            strokeWidth="1.2"
                          />
                          <circle cx={rx} cy={ry} r="3.4" fill="#ebe4d4" stroke="#0d0c0b" strokeWidth="0.8" />
                        </g>
                      );
                    })()}

                  {/* Lander Base Pin */}
                  <g
                    onMouseEnter={() => setMapTooltip('Lander airlock')}
                    onMouseLeave={() => setMapTooltip(null)}
                    onClick={(e) => {
                      e.stopPropagation();
                      setMapTooltip('Lander airlock');
                      setSelectedPinpointInfo({
                        id: 'lander-base',
                        kind: 'Base',
                        title: 'Lander airlock',
                        detail: 'Refill O₂ and heater here, and vault the cores you are carrying.',
                        position: [0, 5.95],
                      });
                    }}
                    className="cursor-pointer"
                  >
                    <circle cx={landerSx} cy={landerSy} r={6.5} fill="transparent" />
                    <polygon
                      points={`${landerSx},${landerSy - 4.4} ${landerSx + 4.2},${landerSy + 3.4} ${landerSx - 4.2},${landerSy + 3.4}`}
                      fill="#0d0c0b"
                      stroke="#ebe4d4"
                      strokeWidth="1.2"
                    />
                  </g>

                  {/* Geological Sample Target Circular Pins (Zero permanent text labels) */}
                  {site.targets.map((tgt) => {
                    const [tx, ty] = toSvgCoords(tgt.position[0], tgt.position[1], px, pz);
                    const done = collectedIds.includes(tgt.id);
                    const isSelected = inspectedItem?.id === tgt.id;
                    const isRouted = activeRoute?.targetId === tgt.id;
                    const fill = done ? '#8fd694' : !tgt.roverExplored ? '#c084fc' : '#ffb454';
                    return (
                      <g
                        key={tgt.id}
                        onMouseEnter={() =>
                          setMapTooltip(done ? `${tgt.code} · ${tgt.name}` : `${tgt.code}, not scanned`)
                        }
                        onMouseLeave={() => setMapTooltip(null)}
                        onClick={(e) => {
                          e.stopPropagation();
                          setInspectedTargetId(tgt.id);
                          setMapTooltip(done ? `${tgt.code} · ${tgt.name}` : `${tgt.code}, not scanned`);
                          setSelectedPinpointInfo({
                            id: tgt.id,
                            kind: done
                              ? `${tgt.code} · Cored`
                              : `${tgt.code} · Not scanned`,
                            title: done ? tgt.name : 'Unscanned specimen',
                            detail: done
                              ? tgt.mineralReadout
                              : 'Plot a route, walk there and press E to scan it.',
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
                            stroke={isRouted ? '#d6f24a' : '#ebe4d4'}
                            strokeWidth="1.1"
                          />
                        )}
                        <circle
                          cx={tx}
                          cy={ty}
                          r={done ? (isSelected ? 4 : 3.2) : 4}
                          fill={fill}
                          stroke="#0d0c0b"
                          strokeWidth="0.9"
                        />
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
                        <circle cx={cxp} cy={cyp} r={5.5} fill="none" stroke="#d6f24a" strokeWidth="1.1" />
                      );
                    })()}

                  {/* Astronaut Position + Heading */}
                  <g transform={`translate(${playerSx}, ${playerSy}) rotate(${telemetry.heading})`}>
                    <polygon
                      points="0,-5.8 3.6,3.8 0,1.7 -3.6,3.8"
                      fill="#ffffff"
                      stroke="#0d0c0b"
                      strokeWidth="0.9"
                    />
                  </g>
                </svg>
              </div>

              <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-dim">
                <li><span className="text-bone">&#9651;</span> Lander</li>
                <li><span className="text-bone">&#9670;</span> Rover landing</li>
                <li><span className="text-bone">&#9679;</span> Rover now</li>
                <li><span className="text-warn">&#9679;</span> Target</li>
                <li><span className="text-[#c084fc]">&#9679;</span> Off the rover track</li>
                <li><span className="text-ok">&#9679;</span> Cored</li>
                <li><span className="text-hivis">- -</span> Your route</li>
              </ul>
            </div>

            <div className="flex flex-col justify-between gap-5 md:col-span-2">
              <div>
                <div className="label">{inspectedItem?.kind || 'Waypoint'}</div>
                <h3 className="mt-1 text-[17px] leading-snug font-bold text-bone">
                  {inspectedItem?.title || 'Nothing selected'}
                </h3>
                <p className="mt-2 line-clamp-4 text-[13px] leading-relaxed text-dim">
                  {inspectedItem?.detail || 'Click a pin, or anywhere on the map, to inspect it.'}
                </p>

                <dl className="rows mt-4">
                  <div>
                    <dt>Distance on foot</dt>
                    <dd>{Math.round(inspectedRoute.distanceMeters)} m</dd>
                  </div>
                  <div>
                    <dt>Steepest slope</dt>
                    <dd>{inspectedRoute.maxSlopeDeg}°</dd>
                  </div>
                </dl>
              </div>

              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handlePlotInspectedRoute}
                  className="btn btn-primary w-full"
                >
                  {isRouteActiveToInspected ? 'Route is active' : 'Plot safe route'}
                </button>
                {activeRoute && (
                  <button type="button" onClick={clearActiveRoute} className="btn w-full">
                    Clear route
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Samples */}
        {slateTab === 'SPECTRA' && spectraTarget && (
          <div className="p-5">
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
              {site.targets.map((tgt) => {
                const selected = tgt.id === spectraTarget.id;
                const collected = collectedIds.includes(tgt.id);
                return (
                  <button
                    key={tgt.id}
                    type="button"
                    onClick={() => setInspectedTargetId(tgt.id)}
                    aria-pressed={selected}
                    className={`num border-b-2 pb-1 transition-colors ${
                      selected ? 'border-bone' : 'border-transparent'
                    } ${collected ? 'text-ok' : selected ? 'text-bone' : 'text-dim hover:text-bone'}`}
                  >
                    {tgt.code}
                  </button>
                );
              })}
            </div>

            <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
              <div>
                <div className="overflow-hidden border border-rule">
                  {isSpectraCollected ? (
                    <RoverSpecimenPhoto target={spectraTarget} />
                  ) : (
                    <div className="flex aspect-[260/140] w-full items-center justify-center bg-ink text-[12px] text-faint">
                      No image until scanned
                    </div>
                  )}
                </div>
                <h3 className="mt-3 text-[17px] leading-snug font-bold text-bone">
                  {isSpectraCollected ? spectraTarget.name : `${spectraTarget.code}, not scanned`}
                </h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-dim">
                  {isSpectraCollected
                    ? spectraTarget.mineralReadout
                    : 'Walk up to this target and press E to scan it and log its mineral signature.'}
                </p>
                {isSpectraVaulted && spectraTarget.discoveryNote && (
                  <div className="mt-3 border-l-2 border-ok pl-3 text-[12px] leading-relaxed text-bone/90">
                    <div className="label mb-0.5">Discovery note</div>
                    {spectraTarget.discoveryNote}
                  </div>
                )}
              </div>

              <div className="flex flex-col justify-between gap-5">
                <dl className="rows">
                  <div>
                    <dt>Dominant mineral</dt>
                    <dd className="capitalize">
                      {isSpectraCollected ? spectraTarget.dominantMineral || 'Silicate' : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>
                      {isSpectraVaulted ? 'In the vault' : isSpectraCollected ? 'Cored' : 'Not scanned'}
                    </dd>
                  </div>
                  <div>
                    <dt>Core mass</dt>
                    <dd>
                      {isSpectraCollected ? `${(spectraTarget.massKg ?? 5.5).toFixed(1)} kg` : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt>Distance</dt>
                    <dd>{spectraTargetDist.toFixed(1)} m</dd>
                  </div>
                </dl>

                {spectraTargetDist <= 4.0 && !isSpectraCollected ? (
                  <button
                    type="button"
                    onClick={() => startScan(spectraTarget.id)}
                    className="btn btn-primary w-full"
                  >
                    Scan and core
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
                    className="btn btn-primary w-full"
                  >
                    Plot safe route
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Sites & Rovers Heritage Archive */}
        {slateTab === 'HERITAGE' && (() => {
          const heritageZone = LANDING_ZONES_BY_ID[heritageSiteId] || site;
          const hRover = heritageZone.nasaRover;
          const isSiteUnlocked = Boolean(discoveredLandingSites[heritageZone.id]);
          const isRoverUnlocked = Boolean(discoveredRovers[heritageZone.id]);
          const isCurrentArea = heritageZone.id === site.id;
          const landingCoords = hRover?.landingPosition || hRover?.traversePoints?.[0] || null;

          return (
            <div className="max-h-[66vh] overflow-y-auto p-5">
              {/* Area selector */}
              <div className="flex flex-wrap gap-x-5 gap-y-2 border-b border-rule pb-3 text-[13px]">
                {LANDING_ZONES.map((zone) => {
                  const selected = zone.id === heritageZone.id;
                  const unlockedCount =
                    (discoveredLandingSites[zone.id] ? 1 : 0) +
                    (discoveredRovers[zone.id] ? 1 : 0);
                  return (
                    <button
                      key={zone.id}
                      type="button"
                      onClick={() => setHeritageSiteId(zone.id)}
                      aria-pressed={selected}
                      className={`flex items-center gap-1.5 border-b-2 pb-1 transition-colors ${
                        selected
                          ? 'border-bone text-bone'
                          : 'border-transparent text-dim hover:text-bone'
                      }`}
                    >
                      <span>{zone.shortName}</span>
                      <span
                        className={`num text-[11px] ${
                          unlockedCount === 2 ? 'text-ok' : unlockedCount === 1 ? 'text-warn' : 'text-faint'
                        }`}
                      >
                        {unlockedCount}/2
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <h3 className="place text-[18px] leading-tight text-bone">{heritageZone.name}</h3>
                  <div className="mt-0.5 text-[12px] text-dim">{heritageZone.subtitle}</div>
                </div>
                <div className="num text-[11px] text-dim">{heritageZone.coordinates}</div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                {/* Landing Site Card */}
                <div className="flex flex-col justify-between border border-rule bg-ink/60 p-4">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="label text-warn">Sol 0 Landing Site</span>
                      {isSiteUnlocked ? (
                        <span className="flex items-center gap-1 text-[11px] text-ok">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Unlocked
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[11px] text-faint">
                          <Lock className="h-3.5 w-3.5" />
                          Locked
                        </span>
                      )}
                    </div>

                    {isSiteUnlocked && hRover ? (
                      <div className="mt-2.5 space-y-2.5">
                        <div>
                          <div className="text-[15px] font-bold text-bone">
                            {hRover.landingName}
                          </div>
                          <div className="num mt-0.5 text-[11px] text-dim">
                            {hRover.landingCoordinates} · {hRover.landingDate}
                          </div>
                        </div>
                        <p className="text-[12px] leading-relaxed text-bone/90">
                          {hRover.landingStory || hRover.keyDiscoveries}
                        </p>
                        {heritageZone.siteDossier?.era && (
                          <div className="border-t border-rule/70 pt-2 text-[11px] text-dim">
                            Geologic era: <span className="text-bone">{heritageZone.siteDossier.era}</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="mt-3 space-y-2">
                        <div className="text-[14px] font-semibold text-dim">
                          Touchdown archive locked
                        </div>
                        <p className="text-[12px] leading-relaxed text-faint">
                          Deploy to {heritageZone.name} and inspect the Sol 0 touchdown monument (<kbd>E</kbd> or click) to unlock this landing site’s history.
                        </p>
                      </div>
                    )}
                  </div>

                  {isCurrentArea && landingCoords && (
                    <button
                      type="button"
                      onClick={() => {
                        const res = computeSafeTraversePath(
                          telemetry.position,
                          landingCoords,
                          site.terrainProfile
                        );
                        setActiveRoute({
                          targetId: 'rover-landing-sol0',
                          targetName: hRover?.landingName || 'Sol 0 Touchdown Monument',
                          ...res,
                        });
                        setSelectedPinpointInfo(null);
                        setSlateTab('MAP');
                      }}
                      className="btn mt-4 w-full"
                    >
                      Plot route to landing site
                    </button>
                  )}
                </div>

                {/* Rover Card */}
                <div className="flex flex-col justify-between border border-rule bg-ink/60 p-4">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="label text-accent">NASA Surface Rover</span>
                      {isRoverUnlocked ? (
                        <span className="flex items-center gap-1 text-[11px] text-ok">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Unlocked
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[11px] text-faint">
                          <Lock className="h-3.5 w-3.5" />
                          Locked
                        </span>
                      )}
                    </div>

                    {isRoverUnlocked && hRover ? (
                      <div className="mt-2.5 space-y-2.5">
                        <div>
                          <div className="text-[15px] font-bold text-bone">{hRover.name}</div>
                          <div className="num mt-0.5 text-[11px] text-dim">
                            {hRover.code} · {hRover.status}
                          </div>
                        </div>
                        <p className="text-[12px] leading-relaxed text-bone/90">
                          {hRover.keyDiscoveries}
                        </p>
                        <div className="grid grid-cols-2 gap-2 border-t border-rule/70 pt-2 text-[11px]">
                          <div>
                            <div className="text-faint">ODOMETRY</div>
                            <div className="num text-bone">{hRover.totalOdometryKm} km</div>
                          </div>
                          <div>
                            <div className="text-faint">LATEST SOL</div>
                            <div className="num text-bone">Sol {hRover.latestSol}</div>
                          </div>
                        </div>
                        <div className="text-[11px] text-dim">
                          <span className="text-faint">Payload: </span>
                          {hRover.instruments}
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 space-y-2">
                        <div className="text-[14px] font-semibold text-dim">
                          Rover telemetry locked
                        </div>
                        <p className="text-[12px] leading-relaxed text-faint">
                          Approach and inspect {hRover?.shortName || 'the NASA rover'} at {heritageZone.name} (<kbd>E</kbd> or click) to unlock its mission dossier.
                        </p>
                      </div>
                    )}
                  </div>

                  {isCurrentArea && hRover && (
                    <button
                      type="button"
                      onClick={() => {
                        const res = computeSafeTraversePath(
                          telemetry.position,
                          hRover.position,
                          site.terrainProfile
                        );
                        setActiveRoute({
                          targetId: hRover.id,
                          targetName: hRover.name,
                          ...res,
                        });
                        setSelectedPinpointInfo(null);
                        setSlateTab('MAP');
                      }}
                      className="btn mt-4 w-full"
                    >
                      Plot route to {hRover.shortName}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Data layer switch */}
        <div className="mt-auto flex border-t border-rule">
          {EVA_LAYERS.map((layer, idx) => {
            const active = evaLayer === layer.id;
            const label = LAYER_SEGMENT_LABELS[layer.id] || layer.shortLabel;
            return (
              <button
                key={layer.id}
                type="button"
                onClick={() => setEvaLayer(layer.id)}
                aria-pressed={active}
                title={layer.description}
                className={`flex flex-1 items-center justify-center gap-2 px-2 py-2.5 text-[12px] transition-colors ${
                  idx > 0 ? 'border-l border-rule' : ''
                } ${active ? 'bg-bone text-ink' : 'text-dim hover:bg-raised hover:text-bone'}`}
              >
                <kbd>{layer.key}</kbd>
                <span className="truncate">{label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
