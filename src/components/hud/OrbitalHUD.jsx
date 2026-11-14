import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Flame, Globe, Maximize2, Rocket, Snowflake, X } from 'lucide-react';
import { LANDING_ZONES, LANDING_ZONES_BY_ID, ORBITAL_LAYERS } from '../../data/landingZones';
import { useMissionStore } from '../../store/useMissionStore';
import { fetchLiveRoverTraverse, getMarsAlbedoCrop } from '../../utils/roverPathLoader';

const LAYER_ICONS = {
  OPTICAL: Globe,
  THERMAL: Flame,
  ICE: Snowflake,
};

export default function OrbitalHUD() {
  const orbitalLayer = useMissionStore((s) => s.orbitalLayer);
  const orbitalDataSource = useMissionStore((s) => s.orbitalDataSource);
  const selectedSiteId = useMissionStore((s) => s.selectedSiteId);
  const isDeploying = useMissionStore((s) => s.isDeploying);
  const deployProgress = useMissionStore((s) => s.deployProgress);
  const vaultedSamples = useMissionStore((s) => s.vaultedSamples);
  const abortNotice = useMissionStore((s) => s.abortNotice);
  const setOrbitalLayer = useMissionStore((s) => s.setOrbitalLayer);
  const selectSite = useMissionStore((s) => s.selectSite);
  const setHoveredSite = useMissionStore((s) => s.setHoveredSite);
  const deployToSurface = useMissionStore((s) => s.deployToSurface);
  const clearAbortNotice = useMissionStore((s) => s.clearAbortNotice);

  const selectedSite = selectedSiteId ? LANDING_ZONES_BY_ID[selectedSiteId] : null;
  const activeLayerObj = ORBITAL_LAYERS.find((l) => l.id === orbitalLayer);
  const siteSamplesCount = selectedSite ? (vaultedSamples[selectedSite.id] || []).length : 0;

  const [liveGeoJson, setLiveGeoJson] = useState(null);
  const [orbitalMapEnlarged, setOrbitalMapEnlarged] = useState(false);

  useEffect(() => {
    if (isDeploying || !selectedSiteId) {
      setOrbitalMapEnlarged(false);
    }
  }, [isDeploying, selectedSiteId]);

  useEffect(() => {
    if (!selectedSite?.id) {
      setLiveGeoJson(null);
      return undefined;
    }
    let active = true;
    fetchLiveRoverTraverse(selectedSite.id).then((res) => {
      if (active) setLiveGeoJson(res);
    });
    return () => {
      active = false;
    };
  }, [selectedSite?.id]);

  const roverPreview = useMemo(() => {
    if (!selectedSite) return null;
    const W = 360;
    const H = 180;
    const crop = getMarsAlbedoCrop(
      selectedSite.lat,
      selectedSite.lon,
      0.14,
      0.24,
      selectedSite.marsTrekBookmark?.extent
    );
    const imgW = W / crop.uSpan;
    const imgH = H / crop.vSpan;
    const imgX = -crop.u0 * imgW;
    const imgY = -crop.v0 * imgH;

    const geoPts =
      liveGeoJson?.geoJsonLonLat?.length >= 2
        ? liveGeoJson.geoJsonLonLat
        : selectedSite.nasaRover?.realGeoJsonLonLat || [];

    let projected = [];
    if (geoPts.length >= 2) {
      let minLon = Infinity;
      let maxLon = -Infinity;
      let minLat = Infinity;
      let maxLat = -Infinity;
      for (let i = 0; i < geoPts.length; i++) {
        const [lon, lat] = geoPts[i];
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
      const dLon = Math.max(0.01, maxLon - minLon);
      const dLat = Math.max(0.01, maxLat - minLat);
      projected = geoPts.map(([lon, lat]) => {
        const x = 42 + ((lon - minLon) / dLon) * (W - 84);
        const y = H - 28 - ((lat - minLat) / dLat) * (H - 56);
        return [Number(x.toFixed(1)), Number(y.toFixed(1))];
      });
    }

    const waypoints = selectedSite.nasaRover?.routeWaypoints || [];
    const milestoneNodes =
      projected.length >= 2 && waypoints.length > 0
        ? waypoints.map((wp, idx) => {
            const pIdx =
              waypoints.length === 1
                ? 0
                : Math.min(
                    projected.length - 1,
                    Math.round((idx / (waypoints.length - 1)) * (projected.length - 1))
                  );
            return {
              ...wp,
              svg: projected[pIdx],
            };
          })
        : [];

    return {
      W,
      H,
      imgW,
      imgH,
      imgX,
      imgY,
      pointsAttr: projected.map(([x, y]) => `${x},${y}`).join(' '),
      landingSvg: projected[0] || [W * 0.25, H * 0.55],
      roverSvg: projected[projected.length - 1] || [W * 0.75, H * 0.45],
      milestoneNodes,
      isLive: liveGeoJson?.status === 'LIVE',
      latestSol: liveGeoJson?.latestSol || selectedSite.nasaRover?.latestSol,
    };
  }, [selectedSite, liveGeoJson]);

  const descentAltKm = Math.max(0.2, 380 * Math.pow(1 - deployProgress, 2.1)).toFixed(1);

  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-4 sm:p-5">
      {/* Top Bar */}
      <div className="flex items-start justify-between gap-4">
        {/* Top-Left Watermark & Sleek Header */}
        <div className="space-y-0.5">
          <div className="font-mono text-[11px] tracking-[0.2em] text-white/70">
            ARES-V // ORBITAL RECON
          </div>
          <div className="flex items-baseline gap-2">
            <h1 className="text-sm font-semibold tracking-wide text-white/95">ARES-V</h1>
            <span className="hidden text-[11px] text-white/50 sm:inline">
              Augmented Reconnaissance &amp; EVA System – Visor
            </span>
          </div>
        </div>

        {/* Center Emergency Abort Notice if triggered by 0% O2 */}
        {abortNotice && !isDeploying && (
          <div className="pointer-events-auto flex items-center gap-2 rounded border border-red-400/55 bg-red-950/75 px-3 py-1 font-mono text-[10px] tracking-wider text-red-100 shadow-lg backdrop-blur-md">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-300" />
            <span>{abortNotice}</span>
            <button
              type="button"
              onClick={clearAbortNotice}
              aria-label="Dismiss emergency notice"
              className="rounded p-0.5 text-red-200/70 hover:bg-red-500/25 hover:text-white"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* Top-Right Minimal Telemetry Micro-Badge */}
        <div className="rounded border border-white/15 bg-black/40 px-2.5 py-1 font-mono text-[11px] tracking-wider text-white/75 backdrop-blur-md">
          {isDeploying && selectedSite
            ? `EDL DESCENT · ${selectedSite.shortName}`
            : 'MRO / ODYSSEY RELAY · ALT 380 KM'}
        </div>
      </div>

      {/* Actual NASA Rover Pinpoints Quick Selector Bar */}
      {!isDeploying && (
        <div className="pointer-events-auto mx-auto mt-1 flex flex-wrap items-center justify-center gap-1.5">
          {LANDING_ZONES.map((zone) => {
            const rv = zone.nasaRover;
            const active = selectedSiteId === zone.id;
            return (
              <button
                key={zone.id}
                type="button"
                onMouseEnter={() => setHoveredSite(zone.id)}
                onMouseLeave={() => setHoveredSite(null)}
                onClick={() => selectSite(zone.id)}
                className={`rounded-md border px-2.5 py-1 text-left font-mono text-[10px] tracking-wider backdrop-blur-md transition ${
                  active
                    ? 'border-sky-400/80 bg-sky-500/25 text-white shadow-[0_0_14px_rgba(56,189,248,0.3)]'
                    : 'border-white/15 bg-black/55 text-white/75 hover:border-amber-300/60 hover:bg-black/75 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-1.5 font-semibold">
                  <span className={active ? 'text-sky-300' : 'text-amber-300'}>●</span>
                  <span>{rv?.shortName || zone.shortName}</span>
                  <span className="text-[8.5px] text-white/45">({rv?.code})</span>
                </div>
                <div className="text-[8.5px] text-white/55">
                  {zone.name} · {rv?.totalOdometryKm} KM
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Middle Area: Center EDL Lock Reticle during Dive OR Enlarged Actual Rover Briefing Card */}
      <div className="flex flex-1 items-center justify-center">
        {isDeploying && selectedSite ? (
          <div className="flex flex-col items-center gap-3">
            {/* Minimal Lock-On Reticle Brackets */}
            <div className="relative flex h-16 w-16 items-center justify-center">
              <span className="absolute top-0 left-0 h-3 w-3 border-t-2 border-l-2 border-sky-400/90" />
              <span className="absolute top-0 right-0 h-3 w-3 border-t-2 border-r-2 border-sky-400/90" />
              <span className="absolute bottom-0 left-0 h-3 w-3 border-b-2 border-l-2 border-sky-400/90" />
              <span className="absolute bottom-0 right-0 h-3 w-3 border-b-2 border-r-2 border-sky-400/90" />
              <div className="h-1.5 w-1.5 rounded-full bg-sky-300 shadow-[0_0_8px_#38bdf8]" />
            </div>
            <div className="rounded border border-sky-400/35 bg-black/55 px-3 py-1 font-mono text-[10px] tracking-[0.18em] text-sky-200 backdrop-blur-md">
              EDL DESCENT LOCK // ALT: {descentAltKm} KM
            </div>
          </div>
        ) : (
          selectedSite && (
            <div className="pointer-events-auto ml-auto mr-0 w-full max-w-md rounded-xl border border-white/20 bg-black/70 p-4 shadow-2xl backdrop-blur-md sm:mr-2">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] tracking-widest text-sky-400">
                    <span>{selectedSite.nasaRover?.code}</span>
                    <span className="text-white/40">//</span>
                    <span>{selectedSite.coordinates}</span>
                  </div>
                  <h2 className="text-base font-semibold text-white">
                    {selectedSite.nasaRover?.name || selectedSite.name}
                  </h2>
                  <p className="text-[11px] text-cyan-200/80">
                    {selectedSite.name} — {selectedSite.subtitle}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => selectSite(null)}
                  aria-label="Close site briefing"
                  className="rounded p-1 text-white/50 transition hover:bg-white/10 hover:text-white"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {selectedSite.nasaRover && (
                <div className="mb-2.5 grid grid-cols-2 gap-1.5 rounded border border-white/10 bg-slate-900/75 p-2 font-mono text-[9.5px]">
                  <div>
                    <span className="text-white/50">STATUS:</span>{' '}
                    <span className="text-emerald-300">{selectedSite.nasaRover.status}</span>
                  </div>
                  <div>
                    <span className="text-white/50">TRAVERSE:</span>{' '}
                    <span className="text-green-300">{selectedSite.nasaRover.totalOdometryKm} KM</span>
                  </div>
                  <div className="col-span-2 truncate">
                    <span className="text-white/50">SOL 0 SITE:</span>{' '}
                    <span className="text-yellow-300">{selectedSite.nasaRover.landingName}</span>
                  </div>
                  {selectedSite.marsTrekBookmark && (
                    <div className="col-span-2 rounded border border-cyan-400/20 bg-black/45 px-1.5 py-1 text-[8.5px] leading-tight text-cyan-200/90">
                      <div>
                        <span className="text-white/50">ITEM TYPE:</span> {selectedSite.marsTrekBookmark.itemType} ·{' '}
                        <span className="text-white/90">{selectedSite.marsTrekBookmark.name}</span>
                      </div>
                      <div className="mt-0.5 break-all text-white/70">
                        <span className="text-white/50">EXTENT:</span>{' '}
                        {selectedSite.marsTrekBookmark.extent.join(', ')}
                      </div>
                    </div>
                  )}
                  <div className="col-span-2 text-white/70">
                    <span className="text-white/50">INSTRUMENTS:</span>{' '}
                    {selectedSite.nasaRover.instruments}
                  </div>
                </div>
              )}

              <p className="mb-2.5 text-xs leading-relaxed text-white/85">
                {selectedSite.nasaRover?.keyDiscoveries || selectedSite.objective}
              </p>

              <div className="mb-2.5 flex items-center gap-1.5 rounded border border-amber-400/25 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-200/90">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                <span className="truncate">{selectedSite.hazard}</span>
              </div>

              <div className="mb-2.5 flex items-center justify-between font-mono text-[10px] text-white/60">
                <span>BASE RAD: {selectedSite.baseRadiation} mSv/d</span>
                <span>VAULTED: {siteSamplesCount}/{selectedSite.targets.length}</span>
              </div>

              {/* Enlarged NASA Mars Trek Albedo & Actual Rover Landing (Yellow) + Path (Green Highlight) Preview */}
              {roverPreview && selectedSite.nasaRover && (
                <div className="mb-3 overflow-hidden rounded-lg border border-cyan-400/30 bg-slate-950/90">
                  <div className="flex items-center justify-between border-b border-white/10 bg-black/70 px-2.5 py-1.5 font-mono text-[9px]">
                    <span className="text-sky-300">TREK.NASA.GOV // MARS_ALBEDO.JPG</span>
                    <div className="flex items-center gap-2">
                      <span className={roverPreview.isLive ? 'text-emerald-300' : 'text-amber-300'}>
                        {roverPreview.isLive ? 'LIVE GEOJSON' : 'NASA CACHED'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setOrbitalMapEnlarged(true)}
                        className="flex items-center gap-1 rounded border border-cyan-400/50 bg-cyan-500/20 px-1.5 py-0.5 text-[8.5px] font-semibold text-cyan-200 transition hover:bg-cyan-500/35"
                      >
                        <Maximize2 className="h-2.5 w-2.5" />
                        <span>ENLARGE MAP</span>
                      </button>
                    </div>
                  </div>
                  <svg viewBox={`0 0 ${roverPreview.W} ${roverPreview.H}`} className="block h-48 w-full sm:h-52">
                    <image
                      href="/textures/mars_albedo.jpg"
                      x={roverPreview.imgX}
                      y={roverPreview.imgY}
                      width={roverPreview.imgW}
                      height={roverPreview.imgH}
                      preserveAspectRatio="none"
                      opacity="0.86"
                    />
                    <rect width={roverPreview.W} height={roverPreview.H} fill="#020617" opacity="0.34" />
                    {roverPreview.pointsAttr && (
                      <>
                        <polyline
                          points={roverPreview.pointsAttr}
                          fill="none"
                          stroke="#4ade80"
                          strokeWidth="7"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          opacity="0.38"
                        />
                        <polyline
                          points={roverPreview.pointsAttr}
                          fill="none"
                          stroke="#22c55e"
                          strokeWidth="2.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          opacity="0.98"
                        />
                        <polyline
                          points={roverPreview.pointsAttr}
                          fill="none"
                          stroke="#bbf7d0"
                          strokeWidth="1.3"
                          strokeDasharray="4 5"
                          className="animate-pulse"
                        />
                      </>
                    )}
                    {/* Route Milestone Nodes along Green Path */}
                    {roverPreview.milestoneNodes.slice(1).map((m) => (
                      <g key={m.id}>
                        <circle
                          cx={m.svg[0]}
                          cy={m.svg[1]}
                          r="3.2"
                          fill="#86efac"
                          stroke="#022c22"
                          strokeWidth="0.9"
                        />
                      </g>
                    ))}
                    {/* Yellow Rover Sol 0 Touchdown */}
                    <circle
                      cx={roverPreview.landingSvg[0]}
                      cy={roverPreview.landingSvg[1]}
                      r="8"
                      fill="rgba(250, 204, 21, 0.25)"
                      stroke="#fde047"
                      strokeWidth="1.2"
                      className="animate-pulse"
                    />
                    <polygon
                      points={`${roverPreview.landingSvg[0]},${roverPreview.landingSvg[1] - 5} ${roverPreview.landingSvg[0] + 5},${roverPreview.landingSvg[1]} ${roverPreview.landingSvg[0]},${roverPreview.landingSvg[1] + 5} ${roverPreview.landingSvg[0] - 5},${roverPreview.landingSvg[1]}`}
                      fill="#facc15"
                      stroke="#020617"
                      strokeWidth="0.8"
                    />
                    <text
                      x={roverPreview.landingSvg[0] + 8}
                      y={roverPreview.landingSvg[1] - 5}
                      fill="#fef08a"
                      fontSize="8.5"
                      fontWeight="bold"
                      fontFamily="monospace"
                    >
                      ★ SOL 0 LANDING
                    </text>
                    {/* Current Rover End Position */}
                    <circle
                      cx={roverPreview.roverSvg[0]}
                      cy={roverPreview.roverSvg[1]}
                      r="4.5"
                      fill="#22c55e"
                      stroke="#ecfdf5"
                      strokeWidth="1.2"
                    />
                    <text
                      x={roverPreview.roverSvg[0] - 6}
                      y={roverPreview.roverSvg[1] - 8}
                      textAnchor="end"
                      fill="#86efac"
                      fontSize="8.5"
                      fontWeight="bold"
                      fontFamily="monospace"
                    >
                      {selectedSite.nasaRover.shortName}
                    </text>
                  </svg>
                  <div className="flex items-center justify-between border-t border-white/10 bg-black/75 px-2.5 py-1 font-mono text-[8.5px]">
                    <span className="truncate text-yellow-200/90">
                      {selectedSite.nasaRover.landingCoordinates}
                    </span>
                    <span className="shrink-0 pl-2 text-green-300">
                      ODO: {selectedSite.nasaRover.totalOdometryKm} KM · SOL {roverPreview.latestSol}
                    </span>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => deployToSurface(selectedSite.id)}
                className="flex w-full items-center justify-center gap-2 rounded border border-sky-400/40 bg-sky-500/20 px-3 py-2 font-mono text-xs font-medium tracking-wider text-sky-100 transition hover:border-sky-300/70 hover:bg-sky-500/35 active:scale-[0.99]"
              >
                <Rocket className="h-3.5 w-3.5 text-sky-300" />
                DEPLOY TO {selectedSite.nasaRover?.shortName || selectedSite.shortName} SITE
              </button>
            </div>
          )
        )}
      </div>

      {/* Centered Enlarged Orbital Mars Trek & Rover Modal */}
      {orbitalMapEnlarged && selectedSite && roverPreview && selectedSite.nasaRover && (
        <div className="pointer-events-auto fixed inset-0 z-30 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md">
          <div className="flex max-h-[94vh] w-[95vw] max-w-6xl flex-col overflow-y-auto rounded-xl border border-cyan-400/45 bg-slate-950/95 p-4 font-mono shadow-[0_0_60px_rgba(14,165,233,0.35)]">
            <div className="mb-3 flex items-center justify-between border-b border-white/15 pb-2.5">
              <div>
                <div className="text-xs font-bold tracking-[0.18em] text-cyan-300">
                  {selectedSite.nasaRover.name} ({selectedSite.nasaRover.code}) — MARS TREK TRAVERSE
                </div>
                <div className="text-[10px] text-amber-200/85">
                  {selectedSite.name} ({selectedSite.coordinates}) · {selectedSite.nasaRover.landingName}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOrbitalMapEnlarged(false)}
                className="flex items-center gap-1 rounded border border-white/20 bg-black/50 px-2.5 py-1 text-[10px] text-white/85 hover:border-cyan-400/50 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
                <span>CLOSE MAP</span>
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_340px]">
              <div className="overflow-hidden rounded-lg border border-cyan-400/35 bg-black">
                <svg
                  viewBox={`0 0 ${roverPreview.W} ${roverPreview.H}`}
                  className="block h-[56vh] min-h-[380px] max-h-[640px] w-full"
                >
                  <image
                    href="/textures/mars_albedo.jpg"
                    x={roverPreview.imgX}
                    y={roverPreview.imgY}
                    width={roverPreview.imgW}
                    height={roverPreview.imgH}
                    preserveAspectRatio="none"
                    opacity="0.88"
                  />
                  <rect width={roverPreview.W} height={roverPreview.H} fill="#020617" opacity="0.3" />
                  {roverPreview.pointsAttr && (
                    <>
                      <polyline
                        points={roverPreview.pointsAttr}
                        fill="none"
                        stroke="#4ade80"
                        strokeWidth="8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        opacity="0.38"
                      />
                      <polyline
                        points={roverPreview.pointsAttr}
                        fill="none"
                        stroke="#22c55e"
                        strokeWidth="3.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        opacity="0.98"
                      />
                      <polyline
                        points={roverPreview.pointsAttr}
                        fill="none"
                        stroke="#bbf7d0"
                        strokeWidth="1.5"
                        strokeDasharray="4 5"
                        className="animate-pulse"
                      />
                    </>
                  )}
                  {roverPreview.milestoneNodes.map((m, idx) => (
                    <g key={m.id}>
                      <circle
                        cx={m.svg[0]}
                        cy={m.svg[1]}
                        r="3.8"
                        fill={idx === 0 ? '#facc15' : '#86efac'}
                        stroke="#020617"
                        strokeWidth="1"
                      />
                      <text
                        x={m.svg[0] + 5}
                        y={m.svg[1] + (idx % 2 === 0 ? -5 : 9)}
                        fill="#e2e8f0"
                        fontSize="7"
                        fontWeight="bold"
                      >
                        {m.sol}: {m.name}
                      </text>
                    </g>
                  ))}
                  <circle
                    cx={roverPreview.landingSvg[0]}
                    cy={roverPreview.landingSvg[1]}
                    r="9"
                    fill="rgba(250, 204, 21, 0.24)"
                    stroke="#fde047"
                    strokeWidth="1.4"
                    className="animate-pulse"
                  />
                  <circle
                    cx={roverPreview.roverSvg[0]}
                    cy={roverPreview.roverSvg[1]}
                    r="5"
                    fill="#22d3ee"
                    stroke="#020617"
                    strokeWidth="1.2"
                  />
                </svg>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-black/85 px-3 py-1.5 text-[9.5px]">
                  <span className="text-yellow-300">
                    ★ YELLOW: {selectedSite.nasaRover.landingName} ({selectedSite.nasaRover.landingDate})
                  </span>
                  <span className="text-green-400">
                    ━ GREEN: {selectedSite.nasaRover.totalOdometryKm} KM · SOL {roverPreview.latestSol}
                  </span>
                </div>
              </div>

              <div className="flex max-h-[60vh] flex-col gap-2.5 overflow-y-auto">
                <div className="rounded-lg border border-white/15 bg-black/65 p-3 text-[10px]">
                  <div className="font-bold text-cyan-300">ACTUAL ROVER REFERENCE DOSSIER</div>
                  <div className="mt-1 text-white/90">{selectedSite.nasaRover.mission}</div>
                  {selectedSite.marsTrekBookmark && (
                    <div className="mt-2 rounded border border-cyan-400/20 bg-slate-900/70 p-2 text-[8.5px] leading-tight text-cyan-200">
                      <div className="font-semibold">
                        ITEM TYPE: {selectedSite.marsTrekBookmark.itemType} ·{' '}
                        {selectedSite.marsTrekBookmark.name}
                      </div>
                      <div className="mt-0.5 break-all text-white/75">
                        EXTENT: {selectedSite.marsTrekBookmark.extent.join(', ')}
                      </div>
                    </div>
                  )}
                  <div className="mt-2 text-white/75">
                    <span className="text-cyan-300">INSTRUMENTS:</span> {selectedSite.nasaRover.instruments}
                  </div>
                  <div className="mt-1.5 text-white/80">
                    <span className="text-amber-300">KEY DISCOVERIES:</span> {selectedSite.nasaRover.keyDiscoveries}
                  </div>
                  <div className="mt-1.5 text-[9px] text-sky-300/85">
                    SOURCE: {selectedSite.nasaRover.referenceSource}
                  </div>
                </div>

                {selectedSite.nasaRover.routeWaypoints?.length > 0 && (
                  <div className="rounded-lg border border-white/15 bg-black/65 p-3 text-[9.5px]">
                    <div className="mb-1.5 font-bold text-green-300">MISSION TRAVERSE PINPOINTS</div>
                    <div className="space-y-1.5">
                      {selectedSite.nasaRover.routeWaypoints.map((wp) => (
                        <div key={wp.id} className="rounded border border-white/10 bg-slate-900/75 p-2">
                          <div className="flex items-center justify-between font-semibold text-white">
                            <span>{wp.name}</span>
                            <span className="text-green-300">{wp.sol}</span>
                          </div>
                          <div className="mt-0.5 text-[8.5px] text-white/70">{wp.detail}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap gap-x-3 gap-y-1 rounded border border-white/10 bg-black/60 p-2.5 text-[8.5px] text-white/70">
                  <span className="font-semibold text-cyan-300">REFERENCES:</span>
                  <a href="https://trek.nasa.gov/mars/" target="_blank" rel="noreferrer" className="underline hover:text-cyan-200">
                    Mars Trek
                  </a>
                  <a href="https://astrogeology-usgs.hub.arcgis.com/pages/interactive-maps-mars" target="_blank" rel="noreferrer" className="underline hover:text-cyan-200">
                    USGS Interactive Maps
                  </a>
                  <a href="https://science.nasa.gov/resource/curiositys-proposed-path-up-mount-sharp/" target="_blank" rel="noreferrer" className="underline hover:text-cyan-200">
                    Curiosity Mount Sharp Path
                  </a>
                  <a href="https://worldview.earthdata.nasa.gov/" target="_blank" rel="noreferrer" className="underline hover:text-cyan-200">
                    NASA Worldview
                  </a>
                  <a href="https://mars.nasa.gov/mars2020/multimedia/raw-images/" target="_blank" rel="noreferrer" className="underline hover:text-cyan-200">
                    Perseverance Raw Images
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Bar: Hidden during descent dive for unobstructed approach */}
      {!isDeploying ? (
        <div className="relative flex flex-col items-center gap-2">
        {orbitalLayer !== 'OPTICAL' && activeLayerObj ? (
          <div className="rounded border border-white/15 bg-black/50 px-2.5 py-0.5 font-mono text-[10px] tracking-wider text-sky-200/90 backdrop-blur-md">
            {activeLayerObj.caption}
          </div>
        ) : !selectedSite ? (
          <div className="font-mono text-[10px] tracking-widest text-white/45">
            SELECT A NASA ROVER PINPOINT ABOVE OR ON THE MARS GLOBE
          </div>
        ) : null}

        <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-white/15 bg-black/45 p-1 shadow-xl backdrop-blur-md">
          {ORBITAL_LAYERS.map((layer) => {
            const Icon = LAYER_ICONS[layer.id];
            const active = orbitalLayer === layer.id;
            return (
              <button
                key={layer.id}
                type="button"
                onClick={() => setOrbitalLayer(layer.id)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-[11px] tracking-wider transition ${
                  active
                    ? 'border border-sky-400/40 bg-sky-500/20 text-white shadow-inner'
                    : 'border border-transparent text-white/60 hover:bg-white/5 hover:text-white/90'
                }`}
              >
                <Icon className={`h-3 w-3 ${active ? 'text-sky-300' : 'text-white/50'}`} />
                <span className="text-white/40">[{layer.key}]</span>
                <span>{layer.label}</span>
              </button>
            );
          })}
        </div>

        {/* Subtle Data Source Micro-Badge */}
        <div className="pointer-events-none flex items-center gap-1.5 rounded border border-white/15 bg-black/40 px-2 py-0.5 font-mono text-[10px] tracking-wider text-white/70 backdrop-blur-md sm:absolute sm:right-0 sm:bottom-0.5">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              orbitalDataSource === 'ACTIVE' || orbitalDataSource === 'LIVE'
                ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]'
                : orbitalDataSource === 'LOADING'
                ? 'animate-pulse bg-sky-400'
                : 'bg-amber-400'
            }`}
          />
          <span>
            {orbitalDataSource === 'ACTIVE' || orbitalDataSource === 'LIVE'
              ? 'DATA: NASA MOLA / VIKING [ACTIVE]'
              : orbitalDataSource === 'LOADING'
              ? 'DATA: NASA MOLA / VIKING [SYNCING]'
              : 'DATA: CACHED SYNTHETIC'}
          </span>
        </div>
        </div>
      ) : (
        <div className="h-8" />
      )}
    </div>
  );
}
