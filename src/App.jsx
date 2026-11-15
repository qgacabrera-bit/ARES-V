import React, { useEffect } from 'react';
import SceneContainer from './components/canvas/SceneContainer';
import OrbitalHUD from './components/hud/OrbitalHUD';
import VisorHUD from './components/hud/VisorHUD';
import { LANDING_ZONES_BY_ID } from './data/landingZones';
import { useMissionStore } from './store/useMissionStore';
import { computeSafeTraversePath } from './utils/pathfinding';
import { getTerrainHeightAt } from './utils/terrainMath';
import { unlockAudio } from './utils/missionAudio';

export default function App() {
  const viewMode = useMissionStore((s) => s.viewMode);
  const isTransitioning = useMissionStore((s) => s.isTransitioning);
  const transitionMode = useMissionStore((s) => s.transitionMode);
  const isDeploying = useMissionStore((s) => s.isDeploying);
  const deployProgress = useMissionStore((s) => s.deployProgress);
  const isAscending = useMissionStore((s) => s.isAscending);
  const ascendProgress = useMissionStore((s) => s.ascendProgress);
  const isTransferring = useMissionStore((s) => s.isTransferring);
  const transferProgress = useMissionStore((s) => s.transferProgress);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.repeat) return;
      const state = useMissionStore.getState();

      if (state.viewMode === 'ORBIT') {
        if (state.isDeploying || state.isAscending || state.isTransferring) return;
        if (e.key === '1') state.setOrbitalLayer('OPTICAL');
        else if (e.key === '2') state.setOrbitalLayer('THERMAL');
        else if (e.key === '3') state.setOrbitalLayer('ICE');
        return;
      }

      if (state.viewMode === 'EVA') {
        if (e.key === '1') state.setEvaLayer('OPTICAL');
        else if (e.key === '2') state.setEvaLayer('TOPOGRAPHY');
        else if (e.key === '3') state.setEvaLayer('SPECTRAL');
        else if (e.key === '4') state.setEvaLayer('ENV');
        else if (e.code === 'KeyE') {
          if (state.nearLander) {
            state.resupplyAndOffloadAtLander();
          } else if (state.activeTargetId) {
            const siteId = state.selectedSiteId || 'jezero';
            const collectedIds = state.collectedSamples[siteId] || [];
            if (!collectedIds.includes(state.activeTargetId)) {
              state.startScan(state.activeTargetId);
            }
          } else if (state.nearRover) {
            const siteId = state.selectedSiteId || 'jezero';
            state.discoverRover(siteId);
            state.setRoverModalOpen(!state.roverModalOpen);
          } else if (state.nearLandingMonument) {
            state.setLandingMonumentModalOpen(!state.landingMonumentModalOpen);
          }
        } else if (e.code === 'KeyM' || e.code === 'Tab') {
          e.preventDefault();
          state.toggleWristMap();
        } else if (e.code === 'KeyP') {
          if (state.activeRoute) {
            state.clearActiveRoute();
          } else {
            const siteId = state.selectedSiteId || 'jezero';
            const site = LANDING_ZONES_BY_ID[siteId] || LANDING_ZONES_BY_ID.jezero;
            const collected = state.collectedSamples[site.id] || [];
            const pool = site.targets.filter((t) => !collected.includes(t.id));
            const candidates = pool.length > 0 ? pool : site.targets;
            const pos = state.telemetry.position;

            let nearest = candidates[0];
            let bestDist = Infinity;
            for (let i = 0; i < candidates.length; i++) {
              const d = Math.hypot(candidates[i].position[0] - pos[0], candidates[i].position[1] - pos[1]);
              if (d < bestDist) {
                bestDist = d;
                nearest = candidates[i];
              }
            }
            const route = computeSafeTraversePath(pos, nearest.position, site.terrainProfile);
            state.setActiveRoute({
              targetId: nearest.id,
              targetName: nearest.name,
              ...route,
            });
          }
        } else if (e.code === 'KeyR') {
          const siteId = state.selectedSiteId || 'jezero';
          const site = LANDING_ZONES_BY_ID[siteId] || LANDING_ZONES_BY_ID.jezero;
          const pos = state.telemetry.position;
          const y = getTerrainHeightAt(pos[0], pos[1], site.terrainProfile);
          state.triggerRadarPulse([pos[0], y, pos[1]]);
        } else if (e.code === 'KeyF') {
          state.toggleHeadlamp();
        } else if (e.code === 'KeyC') {
          state.toggleSampleDrawer();
        } else if (e.code === 'KeyO') {
          state.returnToOrbit();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    const onFirstGesture = () => unlockAudio();
    window.addEventListener('pointerdown', onFirstGesture, { once: true });
    window.addEventListener('keydown', onFirstGesture, { once: true });
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onFirstGesture);
      window.removeEventListener('keydown', onFirstGesture);
    };
  }, []);

  const entryVeilOpacity = isTransitioning
    ? 1
    : isDeploying && deployProgress > 0.82
    ? Math.min(1, (deployProgress - 0.82) / 0.18)
    : isTransferring && transferProgress > 0.82
    ? Math.min(1, (transferProgress - 0.82) / 0.18)
    : (isAscending && ascendProgress < 0.18) || (isTransferring && transferProgress < 0.14)
    ? Math.max(0, 1 - (isAscending ? ascendProgress / 0.18 : transferProgress / 0.14))
    : 0;

  const isDustVeil =
    (isDeploying && deployProgress > 0.82) ||
    (isTransferring && transferProgress > 0.82) ||
    (isTransitioning && transitionMode === 'DEPLOY');

  const transitionMessage =
    transitionMode === 'DEPLOY'
      ? 'Touchdown. Sealing suit…'
      : transitionMode === 'TRANSFER'
      ? 'Igniting orbital transfer…'
      : 'Ascending to orbit…';

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-black text-bone">
      <SceneContainer />

      {viewMode === 'ORBIT' ? <OrbitalHUD /> : <VisorHUD />}

      {/* Atmospheric Entry Dust Veil (final 18% of orbital dive) & Ascent Transition */}
      <div
        className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-200"
        style={{
          opacity: entryVeilOpacity,
          background: isDustVeil
            ? 'radial-gradient(circle at center, rgba(193,106,67,0.92) 0%, rgba(120,53,30,0.98) 100%)'
            : 'rgba(0,0,0,0.88)',
        }}
      >
        {isTransitioning && (
          <div className="text-[14px] text-bone">{transitionMessage}</div>
        )}
      </div>
    </main>
  );
}
