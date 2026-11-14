import React from 'react';
import { AlertTriangle, Flame, Globe, Rocket, Snowflake, X } from 'lucide-react';
import { LANDING_ZONES_BY_ID, ORBITAL_LAYERS } from '../../data/landingZones';
import { useMissionStore } from '../../store/useMissionStore';

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
  const deployToSurface = useMissionStore((s) => s.deployToSurface);
  const clearAbortNotice = useMissionStore((s) => s.clearAbortNotice);

  const selectedSite = selectedSiteId ? LANDING_ZONES_BY_ID[selectedSiteId] : null;
  const activeLayerObj = ORBITAL_LAYERS.find((l) => l.id === orbitalLayer);
  const siteSamplesCount = selectedSite ? (vaultedSamples[selectedSite.id] || []).length : 0;

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

      {/* Middle Area: Center EDL Lock Reticle during Dive OR Progressive Site Briefing Card */}
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
            <div className="pointer-events-auto ml-auto mr-0 w-full max-w-xs rounded-lg border border-white/15 bg-black/55 p-3.5 shadow-2xl backdrop-blur-md sm:mr-2">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <div className="font-mono text-[10px] tracking-widest text-sky-400">
                    {selectedSite.coordinates}
                  </div>
                  <h2 className="text-sm font-semibold text-white">{selectedSite.name}</h2>
                  <p className="text-[11px] text-white/55">{selectedSite.subtitle}</p>
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

              <p className="mb-2.5 text-xs leading-relaxed text-white/85">
                {selectedSite.objective}
              </p>

              <div className="mb-3 flex items-center gap-1.5 rounded border border-amber-400/25 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-200/90">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                <span className="truncate">{selectedSite.hazard}</span>
              </div>

              <div className="mb-3 flex items-center justify-between font-mono text-[10px] text-white/60">
                <span>BASE RAD: {selectedSite.baseRadiation} mSv/d</span>
                <span>VAULTED: {siteSamplesCount}/{selectedSite.targets.length}</span>
              </div>

              <button
                type="button"
                onClick={() => deployToSurface(selectedSite.id)}
                className="flex w-full items-center justify-center gap-2 rounded border border-sky-400/40 bg-sky-500/20 px-3 py-2 font-mono text-xs font-medium tracking-wider text-sky-100 transition hover:border-sky-300/70 hover:bg-sky-500/35 active:scale-[0.99]"
              >
                <Rocket className="h-3.5 w-3.5 text-sky-300" />
                DEPLOY TO SURFACE
              </button>
            </div>
          )
        )}
      </div>

      {/* Bottom Bar: Hidden during descent dive for unobstructed approach */}
      {!isDeploying ? (
        <div className="relative flex flex-col items-center gap-2">
        {orbitalLayer !== 'OPTICAL' && activeLayerObj ? (
          <div className="rounded border border-white/15 bg-black/50 px-2.5 py-0.5 font-mono text-[10px] tracking-wider text-sky-200/90 backdrop-blur-md">
            {activeLayerObj.caption}
          </div>
        ) : !selectedSite ? (
          <div className="font-mono text-[10px] tracking-widest text-white/45">
            CLICK A LANDING BEACON TO INSPECT SITE
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
