import React, { useEffect, useMemo, useState } from 'react';
import { Download, Lock, Volume2, VolumeX, X } from 'lucide-react';
import { LANDING_ZONES, LANDING_ZONES_BY_ID, ORBITAL_LAYERS } from '../../data/landingZones';
import { useMissionStore } from '../../store/useMissionStore';
import { fetchLiveRoverTraverse, getMarsAlbedoCrop } from '../../utils/roverPathLoader';
import MissionCertificate from './MissionCertificate';

const NAV_ITEMS = [
  { id: null, label: 'Map' },
  { id: 'EXPEDITION', label: 'Expedition' },
  { id: 'ABOUT', label: 'About' },
  { id: 'HOW_TO', label: 'Controls' },
  { id: 'TEAM', label: 'Team' },
];

const SITE_BRIEFING_META = {
  jezero: {
    roverTag: 'M2020 Perseverance',
    coords: '18.44°N, 77.45°E',
    terrain: 'Delta scarps, up to 29°',
  },
  gale: {
    roverTag: 'MSL Curiosity',
    coords: '4.59°S, 137.44°E',
    terrain: 'Ridged slopes, up to 28°',
  },
  meridiani: {
    roverTag: 'MER-B Opportunity',
    coords: '1.95°S, 354.47°E',
    terrain: 'Crater slopes, up to 24°',
  },
  gusev: {
    roverTag: 'MER-A Spirit',
    coords: '14.57°S, 175.47°E',
    terrain: 'Talus slopes, up to 25°',
  },
};

export default function OrbitalHUD() {
  const orbitalLayer = useMissionStore((s) => s.orbitalLayer);
  const selectedSiteId = useMissionStore((s) => s.selectedSiteId);
  const isDeploying = useMissionStore((s) => s.isDeploying);
  const deployProgress = useMissionStore((s) => s.deployProgress);
  const isAscending = useMissionStore((s) => s.isAscending);
  const ascendProgress = useMissionStore((s) => s.ascendProgress);
  const ascendFromSiteId = useMissionStore((s) => s.ascendFromSiteId);
  const isTransferring = useMissionStore((s) => s.isTransferring);
  const transferProgress = useMissionStore((s) => s.transferProgress);
  const transferFromSiteId = useMissionStore((s) => s.transferFromSiteId);
  const isInTransit = isDeploying || isAscending || isTransferring;
  const vaultedSamples = useMissionStore((s) => s.vaultedSamples);
  const discoveredRovers = useMissionStore((s) => s.discoveredRovers);
  const discoveredLandingSites = useMissionStore((s) => s.discoveredLandingSites);
  const expeditionStats = useMissionStore((s) => s.expeditionStats);
  const audioMuted = useMissionStore((s) => s.audioMuted);
  const toggleAudioMuted = useMissionStore((s) => s.toggleAudioMuted);
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
  const [activeModal, setActiveModal] = useState(null); // null | 'EXPEDITION' | 'ABOUT' | 'HOW_TO' | 'TEAM'
  const [astronautName, setAstronautName] = useState('Commander Valkyrie');

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

  const ascendFromSite = ascendFromSiteId ? LANDING_ZONES_BY_ID[ascendFromSiteId] : null;
  const transferFromSite = transferFromSiteId ? LANDING_ZONES_BY_ID[transferFromSiteId] : null;
  const transitAltKm = isDeploying
    ? Math.max(0.2, 380 * Math.pow(1 - deployProgress, 2.1)).toFixed(1)
    : isAscending
    ? Math.max(0.2, 380 * Math.pow(ascendProgress, 0.75)).toFixed(1)
    : isTransferring
    ? Math.max(0.2, 220 * Math.sin(transferProgress * Math.PI)).toFixed(1)
    : '380.0';
  const siteIndex = selectedSite ? LANDING_ZONES.findIndex((z) => z.id === selectedSite.id) : -1;

  const openInfo = (id) => {
    setActiveModal(id);
    if (id !== null && selectedSiteId) selectSite(null);
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-4 sm:p-6">
      {/* Top bar */}
      <header className="on-scene flex items-baseline justify-between gap-6">
        <div className="flex items-baseline gap-6">
          <div className="text-[15px] font-bold tracking-wide text-bone">ARES-V</div>
          {!isInTransit && (
            <nav aria-label="Sections" className="pointer-events-auto flex items-baseline gap-5 text-[13px]">
              {NAV_ITEMS.map((item) => {
                const isActive = activeModal === item.id;
                return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => openInfo(item.id)}
                    className={`border-b pb-0.5 transition-colors ${
                      isActive
                        ? 'border-bone text-bone'
                        : 'border-transparent text-dim hover:text-bone'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </nav>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="num hidden text-[11px] text-dim sm:block">
            {isDeploying && selectedSite
              ? `Descending to ${selectedSite.name}`
              : isAscending && ascendFromSite
              ? `Ascending from ${ascendFromSite.name}`
              : isTransferring && transferFromSite && selectedSite
              ? `Transferring: ${transferFromSite.name} -> ${selectedSite.name}`
              : 'Orbit 380 km · 1 grid unit = 1,000 km'}
          </div>
          <button
            type="button"
            onClick={toggleAudioMuted}
            aria-label={audioMuted ? 'Unmute audio' : 'Mute audio'}
            title={audioMuted ? 'Unmute audio' : 'Mute audio'}
            className="icon-btn pointer-events-auto"
          >
            {audioMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4 text-bone" />}
          </button>
        </div>
      </header>

      {/* Emergency abort notice (EVA ended at 0% O2) */}
      {abortNotice && !isInTransit && (
        <div className="pointer-events-auto mx-auto mt-3 flex max-w-xl items-start gap-3 border-l-2 border-crit bg-panel px-3 py-2 text-[13px] text-bone">
          <span className="flex-1">{abortNotice}</span>
          <button
            type="button"
            onClick={clearAbortNotice}
            aria-label="Dismiss notice"
            className="icon-btn -m-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Landing site list */}
      {!isInTransit && (
        <div className="pointer-events-auto fixed top-1/2 left-4 z-10 w-60 -translate-y-1/2 sm:left-6">
          <div className="label on-scene mb-2">Landing sites</div>
          <ol className="panel">
            {LANDING_ZONES.map((zone, idx) => {
              const rv = zone.nasaRover;
              const active = selectedSiteId === zone.id;
              const vaulted = (vaultedSamples[zone.id] || []).length;
              return (
                <li key={zone.id} className={idx > 0 ? 'border-t border-rule' : ''}>
                  <button
                    type="button"
                    onMouseEnter={() => setHoveredSite(zone.id)}
                    onMouseLeave={() => setHoveredSite(null)}
                    onClick={() => {
                      setActiveModal(null);
                      selectSite(zone.id);
                    }}
                    aria-pressed={active}
                    className={`flex w-full items-baseline gap-3 border-l-2 px-3 py-2.5 text-left transition-colors ${
                      active
                        ? 'border-hivis bg-raised'
                        : 'border-transparent hover:bg-raised'
                    }`}
                  >
                    <span className={`num text-[11px] ${active ? 'text-hivis' : 'text-faint'}`}>
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="place block text-[15px] leading-tight text-bone">
                        {zone.name}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-dim">
                        {titleCase(rv?.shortName || zone.shortName)}
                        {rv?.totalOdometryKm != null ? `, ${rv.totalOdometryKm} km driven` : ''}
                        {vaulted > 0 ? ` · ${vaulted}/${zone.targets.length}` : ''}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {/* Descent / Ascent / Transfer reticle */}
      <div className="flex flex-1 items-center justify-center">
        {isInTransit && (selectedSite || ascendFromSite) && (
          <div className="on-scene flex flex-col items-center gap-3">
            <div className="relative flex h-16 w-16 items-center justify-center">
              <span className="absolute top-0 left-0 h-3 w-3 border-t border-l border-bone" />
              <span className="absolute top-0 right-0 h-3 w-3 border-t border-r border-bone" />
              <span className="absolute bottom-0 left-0 h-3 w-3 border-b border-l border-bone" />
              <span className="absolute right-0 bottom-0 h-3 w-3 border-r border-b border-bone" />
              <div className="h-1 w-1 bg-bone" />
            </div>
            <div className="num text-[12px] text-bone">Alt {transitAltKm} km</div>
          </div>
        )}
      </div>

      {/* Expedition / About / Controls / Team */}
      {!isInTransit && activeModal && (
        <Sheet
          eyebrow="ARES-V"
          title={
            activeModal === 'EXPEDITION'
              ? 'Expedition report'
              : activeModal === 'ABOUT'
                ? 'About the sim'
                : activeModal === 'HOW_TO'
                  ? 'Controls'
                  : 'Team'
          }
          onClose={() => setActiveModal(null)}
        >
          {activeModal === 'EXPEDITION' && (() => {
            const totalPossible = LANDING_ZONES.reduce((sum, z) => sum + z.targets.length, 0);
            const totalVaulted = LANDING_ZONES.reduce(
              (sum, z) => sum + (vaultedSamples[z.id] || []).length,
              0
            );
            const unlockedHeritage = LANDING_ZONES.reduce(
              (sum, z) =>
                sum +
                (discoveredLandingSites[z.id] ? 1 : 0) +
                (discoveredRovers[z.id] ? 1 : 0),
              0
            );
            const evaMins = Math.floor((expeditionStats?.totalEvaSeconds || 0) / 60);
            const evaSecs = Math.floor((expeditionStats?.totalEvaSeconds || 0) % 60);
            const distM = expeditionStats?.totalDistanceMeters || 0;
            const distLabel = distM >= 1000 ? `${(distM / 1000).toFixed(2)} km` : `${Math.round(distM)} m`;
            const pct = totalPossible > 0 ? Math.round((totalVaulted / totalPossible) * 100) : 0;

            const handleDownloadReport = () => {
              const lines = [
                '# ARES-V Expedition Report',
                `Generated: ${new Date().toISOString()}`,
                '',
                '## Summary',
                `- Cores vaulted: ${totalVaulted} / ${totalPossible} (${pct}%)`,
                `- Heritage landmarks unlocked: ${unlockedHeritage} / ${LANDING_ZONES.length * 2}`,
                `- Total EVA distance: ${distLabel}`,
                `- Total EVA time: ${String(evaMins).padStart(2, '0')}:${String(evaSecs).padStart(2, '0')}`,
                `- Peak radiation: ${(expeditionStats?.peakRadiationMSv ?? 0.61).toFixed(2)} mSv/d`,
                `- Lowest suit core temp: ${(expeditionStats?.minBodyTempC ?? 37.0).toFixed(1)} °C`,
                '',
                '## Landing Zones',
                ...LANDING_ZONES.map((z) => {
                  const v = (vaultedSamples[z.id] || []).length;
                  const siteOk = discoveredLandingSites[z.id] ? 'Unlocked' : 'Locked';
                  const roverOk = discoveredRovers[z.id] ? 'Unlocked' : 'Locked';
                  return `- **${z.name}** (${z.coordinates}): ${v}/${z.targets.length} cores · Sol 0 Site: ${siteOk} · Rover (${z.nasaRover?.shortName}): ${roverOk}`;
                }),
              ];
              const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'ares-v-expedition-report.md';
              a.click();
              URL.revokeObjectURL(url);
            };

            return (
              <div className="space-y-4 text-[13px] text-bone/90">
                <div>
                  <div className="mb-1.5 flex items-baseline justify-between text-[12px]">
                    <span className="text-dim">Global core recovery</span>
                    <span className="num text-bone">
                      {totalVaulted} / {totalPossible} ({pct}%)
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden bg-rule">
                    <div
                      className="h-full bg-ok transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  <div className="border border-rule bg-ink/50 p-2.5">
                    <div className="label">Landmarks</div>
                    <div className="num mt-0.5 text-[15px] text-bone">
                      {unlockedHeritage} / {LANDING_ZONES.length * 2}
                    </div>
                  </div>
                  <div className="border border-rule bg-ink/50 p-2.5">
                    <div className="label">EVA distance</div>
                    <div className="num mt-0.5 text-[15px] text-bone">{distLabel}</div>
                  </div>
                  <div className="border border-rule bg-ink/50 p-2.5">
                    <div className="label">Surface time</div>
                    <div className="num mt-0.5 text-[15px] text-bone">
                      {String(evaMins).padStart(2, '0')}:{String(evaSecs).padStart(2, '0')}
                    </div>
                  </div>
                  <div className="border border-rule bg-ink/50 p-2.5">
                    <div className="label">Peak rad</div>
                    <div className="num mt-0.5 text-[15px] text-bone">
                      {(expeditionStats?.peakRadiationMSv ?? 0.61).toFixed(2)} mSv/d
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="label">Site breakdown</div>
                  {LANDING_ZONES.map((z) => {
                    const v = (vaultedSamples[z.id] || []).length;
                    const siteDone = v >= z.targets.length;
                    const siteOk = Boolean(discoveredLandingSites[z.id]);
                    const roverOk = Boolean(discoveredRovers[z.id]);
                    return (
                      <div
                        key={z.id}
                        className="flex flex-wrap items-center justify-between gap-2 border border-rule bg-ink/40 px-3 py-2"
                      >
                        <div>
                          <div className="font-semibold text-bone">{z.name}</div>
                          <div className="mt-0.5 text-[11px] text-dim">
                            Sol 0: <span className={siteOk ? 'text-ok' : 'text-faint'}>{siteOk ? 'Unlocked' : 'Locked'}</span>
                            {' · '}
                            {z.nasaRover?.shortName}: <span className={roverOk ? 'text-ok' : 'text-faint'}>{roverOk ? 'Unlocked' : 'Locked'}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`num text-[12px] ${siteDone ? 'text-ok' : 'text-bone'}`}>
                            {v}/{z.targets.length} cores
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setActiveModal(null);
                              selectSite(z.id);
                            }}
                            className="btn px-2.5 py-1 text-[11px]"
                          >
                            Select
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={handleDownloadReport}
                  className="btn btn-primary flex w-full items-center justify-center gap-2"
                >
                  <Download className="h-4 w-4" />
                  <span>Export field report (.md)</span>
                </button>

                {/* Planetary Field Geologist Commendation Certificate */}
                {(() => {
                  const sitesUnlocked = LANDING_ZONES.filter((z) => discoveredLandingSites[z.id]).length;
                  const roversUnlocked = LANDING_ZONES.filter((z) => discoveredRovers[z.id]).length;
                  const certUnlocked =
                    totalVaulted >= totalPossible &&
                    sitesUnlocked >= LANDING_ZONES.length &&
                    roversUnlocked >= LANDING_ZONES.length;
                  const timeLabel = `${String(evaMins).padStart(2, '0')}:${String(evaSecs).padStart(2, '0')}`;
                  const peakRadLabel = `${(expeditionStats?.peakRadiationMSv ?? 0.61).toFixed(2)} mSv/d`;

                  if (!certUnlocked) {
                    return (
                      <div className="border border-rule bg-ink/50 p-4">
                        <div className="flex items-center justify-between gap-2">
                          <span className="label flex items-center gap-1.5 text-dim">
                            <Lock className="h-3.5 w-3.5" />
                            Field Geologist Certificate (Locked)
                          </span>
                          <span className="num text-[11px] text-faint">100% required</span>
                        </div>
                        <p className="mt-1.5 text-[12px] text-dim">
                          Vault every core and inspect every Sol 0 touchdown monument and NASA rover across all four craters to earn your commendation.
                        </p>
                        <ul className="mt-3 space-y-1.5 text-[12px]">
                          <li className="flex items-center justify-between">
                            <span className="text-dim">Cores vaulted</span>
                            <span className={`num ${totalVaulted >= totalPossible ? 'text-ok' : 'text-bone'}`}>
                              {totalVaulted} / {totalPossible}
                            </span>
                          </li>
                          <li className="flex items-center justify-between">
                            <span className="text-dim">Sol 0 landing sites unlocked</span>
                            <span className={`num ${sitesUnlocked >= LANDING_ZONES.length ? 'text-ok' : 'text-bone'}`}>
                              {sitesUnlocked} / {LANDING_ZONES.length}
                            </span>
                          </li>
                          <li className="flex items-center justify-between">
                            <span className="text-dim">NASA rovers inspected</span>
                            <span className={`num ${roversUnlocked >= LANDING_ZONES.length ? 'text-ok' : 'text-bone'}`}>
                              {roversUnlocked} / {LANDING_ZONES.length}
                            </span>
                          </li>
                        </ul>
                      </div>
                    );
                  }

                  return (
                    <MissionCertificate
                      astronautName={astronautName}
                      onChangeName={setAstronautName}
                      totalVaulted={totalVaulted}
                      totalPossible={totalPossible}
                      sitesCount={sitesUnlocked}
                      roversCount={roversUnlocked}
                      distLabel={distLabel}
                      timeLabel={timeLabel}
                      peakRad={peakRadLabel}
                    />
                  );
                })()}
              </div>
            );
          })()}

          {activeModal === 'ABOUT' && (
            <div className="space-y-5 text-[13px] leading-relaxed text-bone/90">
              <p>
                Pick one of four real rover landing sites from orbit, drop to the surface, and walk
                the rover&rsquo;s route on foot. Core the rock targets, haul them back to the lander,
                and get out before your oxygen does.
              </p>

              <div className="border-l-2 border-hivis pl-3">
                <div className="label mb-1">Mission brief, Sol 412</div>
                <p>
                  You are the lead field geologist on the lander <em>Valkyrie</em>. Orbiters have
                  mapped these sites for decades and the rovers have driven them. Your job is the
                  part that needs hands: recover the priority cores along each rover corridor before
                  the seasonal dust front closes the launch window.
                </p>
              </div>

              <div>
                <div className="label mb-1">Data used</div>
                <dl className="rows">
                  <div>
                    <dt>Global imagery</dt>
                    <dd>JPL Mars Trek (WMTS)</dd>
                  </div>
                  <div>
                    <dt>Elevation</dt>
                    <dd>MGS MOLA</dd>
                  </div>
                  <div>
                    <dt>Thermal inertia</dt>
                    <dd>Odyssey THEMIS</dd>
                  </div>
                  <div>
                    <dt>Subsurface ice</dt>
                    <dd>MRO SHARAD</dd>
                  </div>
                  <div>
                    <dt>Rover traverses</dt>
                    <dd>NASA MMGIS</dd>
                  </div>
                </dl>
              </div>
            </div>
          )}

          {activeModal === 'HOW_TO' && (
            <div className="space-y-5 text-[13px] text-bone/90">
              <div>
                <div className="label mb-1">In orbit</div>
                <dl className="rows">
                  <div>
                    <dt>Rotate the globe</dt>
                    <dd>Drag</dd>
                  </div>
                  <div>
                    <dt>Zoom</dt>
                    <dd>Scroll</dd>
                  </div>
                  <div>
                    <dt>Switch map layer</dt>
                    <dd>
                      <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd>
                    </dd>
                  </div>
                  <div>
                    <dt>Open a site briefing</dt>
                    <dd>Click a beacon</dd>
                  </div>
                </dl>
              </div>

              <div>
                <div className="label mb-1">On the surface</div>
                <dl className="rows">
                  <div>
                    <dt>Walk, sprint</dt>
                    <dd>
                      <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd>, <kbd>Shift</kbd>
                    </dd>
                  </div>
                  <div>
                    <dt>Field slate (map)</dt>
                    <dd>
                      <kbd>M</kbd> or <kbd>Tab</kbd>
                    </dd>
                  </div>
                  <div>
                    <dt>Data layers</dt>
                    <dd>
                      <kbd>1</kbd>&ndash;<kbd>4</kbd>
                    </dd>
                  </div>
                  <div>
                    <dt>Scan a core, resupply, sync rover</dt>
                    <dd>
                      <kbd>E</kbd>
                    </dd>
                  </div>
                  <div>
                    <dt>Route to nearest target</dt>
                    <dd>
                      <kbd>P</kbd>
                    </dd>
                  </div>
                  <div>
                    <dt>Radar pulse</dt>
                    <dd>
                      <kbd>R</kbd>
                    </dd>
                  </div>
                  <div>
                    <dt>Headlamp</dt>
                    <dd>
                      <kbd>F</kbd>
                    </dd>
                  </div>
                  <div>
                    <dt>Back to orbit</dt>
                    <dd>
                      <kbd>O</kbd>
                    </dd>
                  </div>
                </dl>
              </div>

              <p className="leading-relaxed text-dim">
                Cores are heavy. Every one you carry slows you down and burns oxygen faster, so drop
                them at the lander airlock (<kbd>E</kbd>) before going back out.
              </p>
            </div>
          )}

          {activeModal === 'TEAM' && (
            <div className="space-y-5 text-[13px] text-bone/90">
              <div>
                <div className="text-[17px] font-bold text-bone">Avengineers</div>
                <p className="mt-1 text-dim">
                  Computer Engineering, Technological Institute of the Philippines, Quezon City
                </p>
              </div>
              <ul className="rows">
                <li>Gabriel Cabrera</li>
                <li>Ron Von Angeles</li>
                <li>Angelo Base</li>
                <li>Christian Bondoc</li>
                <li>Jomari Iglesia</li>
              </ul>
              <p className="leading-relaxed text-dim">
                We built the orbital globe and terrain, the NASA data pipeline and shaders, and the
                EVA systems and visor.
              </p>
            </div>
          )}
        </Sheet>
      )}

      {/* Site briefing */}
      {!isInTransit && selectedSite && (
        <Sheet
          eyebrow={`Landing site ${String(siteIndex + 1).padStart(2, '0')}`}
          title={<span className="place text-[26px] leading-tight">{selectedSite.name}</span>}
          onClose={() => selectSite(null)}
          closeLabel="Close site briefing"
          footer={
            <button
              type="button"
              onClick={() => deployToSurface(selectedSite.id)}
              className="btn btn-primary w-full py-3 text-[14px]"
            >
              Deploy to surface
            </button>
          }
        >
          <div className="num -mt-2 text-[11px] text-dim">
            {siteMeta.roverTag} · {siteMeta.coords}
          </div>

          <p className="mt-4 text-[14px] leading-relaxed text-bone/90">{selectedSite.objective}</p>

          <dl className="rows mt-5">
            <div>
              <dt>Terrain</dt>
              <dd>{siteMeta.terrain}</dd>
            </div>
            <div>
              <dt>Surface radiation</dt>
              <dd>{selectedSite.baseRadiation} mSv/day</dd>
            </div>
            <div>
              <dt>Cores vaulted</dt>
              <dd>
                {siteSamplesCount} of {selectedSite.targets.length}
              </dd>
            </div>
          </dl>

          {roverPreview && selectedSite.nasaRover && (
            <figure className="mt-5">
              <div className="h-40 overflow-hidden border border-rule bg-ink">
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
                    opacity="0.9"
                  />
                  <rect width={roverPreview.W} height={roverPreview.H} fill="#0d0c0b" opacity="0.3" />
                  {roverPreview.pointsAttr && (
                    <>
                      <polyline
                        points={roverPreview.pointsAttr}
                        fill="none"
                        stroke="#0d0c0b"
                        strokeWidth="4.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        opacity="0.7"
                      />
                      <polyline
                        points={roverPreview.pointsAttr}
                        fill="none"
                        stroke="#ebe4d4"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </>
                  )}
                  {roverPreview.milestoneNodes.slice(1, -1).map((m) => (
                    <circle
                      key={m.id}
                      cx={m.svg[0]}
                      cy={m.svg[1]}
                      r="2.6"
                      fill="#0d0c0b"
                      stroke="#ebe4d4"
                      strokeWidth="1.1"
                    />
                  ))}
                  {/* Landing point */}
                  <polygon
                    points={`${roverPreview.landingSvg[0]},${roverPreview.landingSvg[1] - 5} ${roverPreview.landingSvg[0] + 5},${roverPreview.landingSvg[1]} ${roverPreview.landingSvg[0]},${roverPreview.landingSvg[1] + 5} ${roverPreview.landingSvg[0] - 5},${roverPreview.landingSvg[1]}`}
                    fill="#ebe4d4"
                    stroke="#0d0c0b"
                    strokeWidth="1"
                  />
                  {/* Rover's latest position */}
                  <circle
                    cx={roverPreview.roverSvg[0]}
                    cy={roverPreview.roverSvg[1]}
                    r="4.5"
                    fill="#d6f24a"
                    stroke="#0d0c0b"
                    strokeWidth="1.2"
                  />
                </svg>
              </div>
              <figcaption className="mt-1.5 text-[11px] leading-snug text-dim">
                {titleCase(selectedSite.nasaRover.shortName || 'Rover')} traverse, from landing (
                <span className="text-bone">&#9670;</span>) to latest position (
                <span className="text-hivis">&#9679;</span>).
              </figcaption>
            </figure>
          )}
        </Sheet>
      )}

      {/* Map layer switch */}
      {!isInTransit ? (
        <div className="flex flex-col items-center gap-2">
          <div className="on-scene h-4 text-center text-[11px] text-dim">
            {orbitalLayer !== 'OPTICAL' && activeLayerObj
              ? activeLayerObj.caption
              : !selectedSite
                ? 'Pick a landing site from the list, or click a beacon on the globe.'
                : null}
          </div>

          <div className="panel pointer-events-auto flex">
            {ORBITAL_LAYERS.map((layer, idx) => {
              const active = orbitalLayer === layer.id;
              return (
                <button
                  key={layer.id}
                  type="button"
                  onClick={() => setOrbitalLayer(layer.id)}
                  aria-pressed={active}
                  className={`flex items-center gap-2 px-3.5 py-2 text-[12px] transition-colors ${
                    idx > 0 ? 'border-l border-rule' : ''
                  } ${active ? 'bg-bone text-ink' : 'text-dim hover:bg-raised hover:text-bone'}`}
                >
                  <kbd>{layer.key}</kbd>
                  <span>{titleCase(layer.label)}</span>
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

function titleCase(str) {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .replace(/(^|[\s/-])([a-z])/g, (m, pre, ch) => pre + ch.toUpperCase());
}

/* Docked side sheet. Leaves the globe visible and clickable beside it. */
function Sheet({ eyebrow, title, onClose, closeLabel = 'Close', footer, children }) {
  return (
    <aside className="pointer-events-auto fixed inset-x-0 bottom-0 z-30 flex max-h-[85vh] flex-col border-t border-rule bg-panel text-bone sm:inset-x-auto sm:top-0 sm:right-0 sm:max-h-none sm:w-[400px] sm:border-t-0 sm:border-l">
      <div className="flex items-start justify-between gap-4 px-6 pt-6">
        <div className="min-w-0">
          <div className="label mb-1">{eyebrow}</div>
          <h2 className="text-[20px] leading-tight font-bold text-bone">{title}</h2>
        </div>
        <button type="button" onClick={onClose} aria-label={closeLabel} className="icon-btn -mt-1 -mr-2">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-6 pt-4 pb-6">{children}</div>
      {footer && <div className="border-t border-rule px-6 py-4">{footer}</div>}
    </aside>
  );
}
