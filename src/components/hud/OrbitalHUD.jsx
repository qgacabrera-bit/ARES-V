import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Flame, Globe, Rocket, Snowflake, X } from 'lucide-react';
import { LANDING_ZONES, LANDING_ZONES_BY_ID, ORBITAL_LAYERS } from '../../data/landingZones';
import { useMissionStore } from '../../store/useMissionStore';
import { fetchLiveRoverTraverse, getMarsAlbedoCrop } from '../../utils/roverPathLoader';

const LAYER_ICONS = {
  OPTICAL: Globe,
  THERMAL: Flame,
  ICE: Snowflake,
};

const SITE_BRIEFING_META = {
  jezero: {
    roverTag: 'M2020 Perseverance',
    coords: '18.44°N, 77.45°E',
    terrain: '29° Delta Scarps',
  },
  gale: {
    roverTag: 'MSL Curiosity',
    coords: '4.59°S, 137.44°E',
    terrain: '28° Slope Ridges',
  },
  meridiani: {
    roverTag: 'MER-B Opportunity',
    coords: '1.95°S, 354.47°E',
    terrain: '24° Crater Slopes',
  },
  gusev: {
    roverTag: 'MER-A Spirit',
    coords: '14.57°S, 175.47°E',
    terrain: '25° Talus Slopes',
  },
};

export default function OrbitalHUD() {
  const orbitalLayer = useMissionStore((s) => s.orbitalLayer);
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
  const siteMeta = selectedSite
    ? SITE_BRIEFING_META[selectedSite.id] || {
        roverTag: selectedSite.nasaRover?.shortName || selectedSite.shortName,
        coords: selectedSite.coordinates,
        terrain: selectedSite.hazard,
      }
    : null;

  const [liveGeoJson, setLiveGeoJson] = useState(null);
  const [activeModal, setActiveModal] = useState(null); // null | 'ABOUT' | 'HOW_TO' | 'TEAM'

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
    const W = 440;
    const H = 160;
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
        const x = 48 + ((lon - minLon) / dLon) * (W - 96);
        const y = H - 24 - ((lat - minLat) / dLat) * (H - 48);
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
    };
  }, [selectedSite, liveGeoJson]);

  const descentAltKm = Math.max(0.2, 380 * Math.pow(1 - deployProgress, 2.1)).toFixed(1);

  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-4 sm:p-5">
      {/* Top Bar */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
        <div className="justify-self-start font-mono text-[11px] tracking-[0.2em] text-white/70">
          ARES-V // ORBITAL RECON
        </div>

        {/* Center Top Navigation Pill Bar */}
        {!isDeploying ? (
          <nav
            aria-label="Orbital Navigation"
            className="pointer-events-auto flex items-center justify-self-center gap-1 rounded-full border border-white/15 bg-slate-950/75 px-2 py-1 backdrop-blur-md"
          >
            {[
              { id: null, label: 'ORBITAL MAP' },
              { id: 'ABOUT', label: 'ABOUT' },
              { id: 'HOW_TO', label: 'HOW TO' },
              { id: 'TEAM', label: 'TEAM' },
            ].map((item) => {
              const isActive = activeModal === item.id;
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => {
                    setActiveModal(item.id);
                    if (item.id !== null && selectedSiteId) selectSite(null);
                  }}
                  className={`rounded-full px-3 py-1 font-mono text-[10px] tracking-[0.14em] transition ${
                    isActive
                      ? 'bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-400/50'
                      : 'text-white/70 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>
        ) : (
          <div />
        )}

        {/* Top-Right Minimal Telemetry & Scale Micro-Badge */}
        <div className="justify-self-end rounded border border-white/15 bg-black/40 px-2.5 py-1 font-mono text-[11px] tracking-wider text-white/75 backdrop-blur-md">
          {isDeploying && selectedSite
            ? `EDL DESCENT · ${selectedSite.shortName} · 1 UNIT = 1,000 KM`
            : '1 UNIT = 1,000 KM · MRO RELAY · ALT 380 KM'}
        </div>
      </div>

      {/* Center Emergency Abort Notice if triggered by 0% O2 */}
      {abortNotice && !isDeploying && (
        <div className="pointer-events-auto mx-auto mt-2 flex items-center gap-2 rounded border border-red-400/55 bg-red-950/75 px-3 py-1 font-mono text-[10px] tracking-wider text-red-100 shadow-lg backdrop-blur-md">
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

      {/* Compact Left-Side Landing Site Quick Selector Rail */}
      {!isDeploying && (
        <div className="pointer-events-auto fixed top-1/2 left-6 z-10 flex w-56 -translate-y-1/2 flex-col gap-2">
          {LANDING_ZONES.map((zone) => {
            const rv = zone.nasaRover;
            const active = selectedSiteId === zone.id;
            return (
              <button
                key={zone.id}
                type="button"
                onMouseEnter={() => setHoveredSite(zone.id)}
                onMouseLeave={() => setHoveredSite(null)}
                onClick={() => {
                  setActiveModal(null);
                  selectSite(zone.id);
                }}
                className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 text-left backdrop-blur-md transition ${
                  active
                    ? 'border-cyan-400/75 bg-slate-950/85 text-white shadow-[0_0_16px_rgba(34,211,238,0.22)]'
                    : 'border-white/15 bg-slate-950/65 text-white/80 hover:border-amber-300/60 hover:bg-slate-950/85 hover:text-white'
                }`}
              >
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    active
                      ? 'bg-cyan-400 shadow-[0_0_8px_#22d3ee]'
                      : 'bg-amber-400 shadow-[0_0_6px_#fbbf24]'
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold text-white">{zone.name}</div>
                  <div className="truncate font-mono text-[10px] text-slate-400">
                    {rv?.shortName || zone.shortName} · {rv?.totalOdometryKm} km
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Middle Area: Center EDL Lock Reticle during Dive */}
      <div className="flex flex-1 items-center justify-center">
        {isDeploying && selectedSite && (
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
        )}
      </div>

      {/* Centered ABOUT / HOW TO / TEAM Modals */}
      {!isDeploying && activeModal && (
        <div
          onClick={() => setActiveModal(null)}
          className="pointer-events-auto fixed inset-0 z-30 flex items-center justify-center bg-black/45 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl border border-white/15 bg-slate-950/90 p-6 font-sans text-white shadow-2xl backdrop-blur-xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-3">
              <div>
                <div className="font-mono text-[10px] tracking-[0.2em] text-cyan-300">
                  ARES-V // {activeModal === 'HOW_TO' ? 'MISSION GUIDE' : activeModal}
                </div>
                <h2 className="mt-0.5 text-lg font-semibold tracking-tight text-white">
                  {activeModal === 'ABOUT' && 'Augmented Reconnaissance & EVA System'}
                  {activeModal === 'HOW_TO' && 'Controls & Mission Loop'}
                  {activeModal === 'TEAM' && 'Avengineers'}
                </h2>
                {activeModal === 'TEAM' && (
                  <p className="mt-0.5 text-xs text-slate-400">
                    Technological Institute of the Philippines – Quezon City · Computer Engineering
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                aria-label="Close modal"
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {activeModal === 'ABOUT' && (
              <div className="mt-4 space-y-3">
                <div className="rounded-xl border border-cyan-400/25 bg-cyan-500/10 p-3.5">
                  <div className="mb-1.5 font-mono text-[10px] tracking-[0.18em] text-cyan-300">
                    MISSION BRIEF // SOL 412 · ARES-1
                  </div>
                  <p className="text-xs leading-relaxed text-cyan-50/90">
                    Deployed as Lead Field Geologist aboard <em>Lander Valkyrie</em>, you operate the{' '}
                    <strong className="text-white">ARES-V Visor</strong> to bridge orbital NASA datasets
                    with human field intuition, recovering priority cores along historic rover corridors
                    before the seasonal dust front closes the launch window.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
                    <div className="mb-1.5 font-mono text-[10px] tracking-wider text-cyan-300">
                      ORBITAL TELEMETRY
                    </div>
                    <p className="text-xs leading-relaxed text-slate-300">
                      Planetary-scale reconnaissance powered by <strong className="text-white">JPL Mars Trek WMTS</strong>,{' '}
                      <strong className="text-white">MOLA</strong> elevation,{' '}
                      <strong className="text-white">THEMIS</strong> thermal, and{' '}
                      <strong className="text-white">SHARAD</strong> subsurface ice layers.
                    </p>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
                    <div className="mb-1.5 font-mono text-[10px] tracking-wider text-cyan-300">
                      SURFACE EVA
                    </div>
                    <p className="text-xs leading-relaxed text-slate-300">
                      First-person terrain navigation along authentic NASA rover traverses with
                      field-slate pathfinding and live spectral specimen verification.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {activeModal === 'HOW_TO' && (
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
                    <div className="mb-2 font-mono text-[10px] tracking-wider text-cyan-300">
                      ORBITAL RECON
                    </div>
                    <ul className="space-y-1.5 text-xs text-slate-300">
                      <li><span className="font-mono text-white">Drag</span> — Rotate Mars globe</li>
                      <li><span className="font-mono text-white">Scroll</span> — Zoom altitude</li>
                      <li><span className="font-mono text-white">1–3</span> — Switch orbital layers</li>
                      <li><span className="font-mono text-white">Click Beacon</span> — Inspect &amp; deploy</li>
                    </ul>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
                    <div className="mb-2 font-mono text-[10px] tracking-wider text-cyan-300">
                      SURFACE EVA
                    </div>
                    <ul className="space-y-1.5 text-xs text-slate-300">
                      <li><span className="font-mono text-white">WASD / Shift</span> — Move &amp; sprint</li>
                      <li><span className="font-mono text-white">M / Tab</span> — Raise Field Slate</li>
                      <li><span className="font-mono text-white">1–4</span> — NASA data layers</li>
                      <li><span className="font-mono text-white">R</span> — Subsurface radar pulse</li>
                      <li><span className="font-mono text-white">E</span> — Scan core / Resupply</li>
                    </ul>
                  </div>
                </div>

                <div className="rounded-xl border border-amber-400/25 bg-amber-500/10 px-3.5 py-2 text-xs text-amber-200">
                  Tip: Offload heavy rock cores at the Lander airlock (<span className="font-mono font-semibold">[E]</span>) to restore stamina and O₂ reserves.
                </div>
              </div>
            )}

            {activeModal === 'TEAM' && (
              <div className="mt-4 space-y-4">
                <div className="flex flex-wrap gap-1.5">
                  {[
                    '3D Orbital & Terrain Architecture',
                    'NASA Data Pipeline & Shaders',
                    'EVA Systems & Visor UX',
                  ].map((role) => (
                    <span
                      key={role}
                      className="rounded-full border border-cyan-300/25 bg-cyan-500/10 px-2.5 py-1 font-mono text-[10px] text-cyan-200"
                    >
                      {role}
                    </span>
                  ))}
                </div>

                <div className="space-y-1.5 rounded-xl border border-white/10 bg-white/[0.02] p-3 text-xs text-slate-300">
                  <div className="font-mono text-[10px] tracking-wider text-slate-400">
                    CREW ROSTER
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 pt-1 text-white/90">
                    <span>• Gabriel Cabrera</span>
                    <span>• Ron Von Angeles</span>
                    <span>• Angelo Base</span>
                    <span>• Christian Bondoc</span>
                    <span>• Jomari Iglesia</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Centered Pre-Deployment Briefing Modal */}
      {!isDeploying && selectedSite && (
        <div
          onClick={() => selectSite(null)}
          className="pointer-events-auto fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex w-full max-w-lg flex-col gap-4 rounded-2xl border border-white/15 bg-slate-950/85 p-6 font-sans text-white shadow-2xl backdrop-blur-xl"
          >
            {/* 1. Header */}
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 space-y-1">
                <h2 className="text-lg font-semibold tracking-tight text-white">
                  {selectedSite.name}
                </h2>
                <div className="font-mono text-[11px] tracking-wide text-cyan-200/80">
                  {siteMeta.roverTag} · {siteMeta.coords}
                </div>
              </div>
              <button
                type="button"
                onClick={() => selectSite(null)}
                aria-label="Close site briefing"
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* 2. 1-Sentence Mission Goal */}
            <p className="line-clamp-2 text-sm leading-relaxed text-slate-300">
              {selectedSite.objective}
            </p>

            {/* 3. Compact 3-Column Spec Grid */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                  TERRAIN
                </div>
                <div className="mt-1 truncate text-sm font-semibold text-white">
                  {siteMeta.terrain}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                  RADIATION
                </div>
                <div className="mt-1 text-sm font-semibold text-white">
                  {selectedSite.baseRadiation} mSv/d
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                  OBJECTIVES
                </div>
                <div className="mt-1 text-sm font-semibold text-white">
                  {siteSamplesCount} / {selectedSite.targets.length} Samples
                </div>
              </div>
            </div>

            {/* 4. Compact Interactive Route Preview */}
            {roverPreview && selectedSite.nasaRover && (
              <div className="h-40 overflow-hidden rounded-xl border border-white/10 bg-slate-950">
                <svg
                  viewBox={`0 0 ${roverPreview.W} ${roverPreview.H}`}
                  preserveAspectRatio="xMidYMid slice"
                  className="block h-full w-full"
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
                  <rect width={roverPreview.W} height={roverPreview.H} fill="#020617" opacity="0.28" />
                  {roverPreview.pointsAttr && (
                    <>
                      <polyline
                        points={roverPreview.pointsAttr}
                        fill="none"
                        stroke="#4ade80"
                        strokeWidth="6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        opacity="0.32"
                      />
                      <polyline
                        points={roverPreview.pointsAttr}
                        fill="none"
                        stroke="#22c55e"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        opacity="0.96"
                      />
                    </>
                  )}
                  {roverPreview.milestoneNodes.slice(1, -1).map((m) => (
                    <circle
                      key={m.id}
                      cx={m.svg[0]}
                      cy={m.svg[1]}
                      r="2.8"
                      fill="#86efac"
                      stroke="#022c22"
                      strokeWidth="0.9"
                    />
                  ))}
                  {/* Sol 0 Touchdown Pin */}
                  <circle
                    cx={roverPreview.landingSvg[0]}
                    cy={roverPreview.landingSvg[1]}
                    r="6.5"
                    fill="rgba(250, 204, 21, 0.22)"
                    stroke="#fde047"
                    strokeWidth="1.2"
                  />
                  <polygon
                    points={`${roverPreview.landingSvg[0]},${roverPreview.landingSvg[1] - 4.2} ${roverPreview.landingSvg[0] + 4.2},${roverPreview.landingSvg[1]} ${roverPreview.landingSvg[0]},${roverPreview.landingSvg[1] + 4.2} ${roverPreview.landingSvg[0] - 4.2},${roverPreview.landingSvg[1]}`}
                    fill="#facc15"
                    stroke="#020617"
                    strokeWidth="0.8"
                  />
                  {/* Current Rover Pin */}
                  <circle
                    cx={roverPreview.roverSvg[0]}
                    cy={roverPreview.roverSvg[1]}
                    r="4.5"
                    fill="#22d3ee"
                    stroke="#020617"
                    strokeWidth="1.2"
                  />
                </svg>
              </div>
            )}

            {/* 5. Primary Action */}
            <button
              type="button"
              onClick={() => deployToSurface(selectedSite.id)}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 active:scale-[0.99]"
            >
              <Rocket className="h-4 w-4" />
              <span>DEPLOY TO SURFACE</span>
            </button>
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
        </div>
      ) : (
        <div className="h-8" />
      )}
    </div>
  );
}
