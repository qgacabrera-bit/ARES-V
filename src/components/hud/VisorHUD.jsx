import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { LANDING_ZONES, LANDING_ZONES_BY_ID } from '../../data/landingZones';
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
  let waypointLabel = 'Lander';
  let waypointNav = landerNav;

  if (activeRoute?.points?.length > 0) {
    const lastPt = activeRoute.points[activeRoute.points.length - 1];
    waypointNav = getArrowAndPct(lastPt[0], lastPt[2]);
    waypointLabel = activeRoute.targetName || 'Route';
  } else if (customPinpoint?.position) {
    waypointNav = customNav;
    waypointLabel = customPinpoint.name || 'Pin';
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
    <div className="on-scene flex flex-col items-center gap-1.5">
      {/* A ruled tape, not a boxed widget: heading is read off the centre tick. */}
      <div className="num relative h-7 w-64 overflow-hidden border-b border-bone/70 text-[11px] sm:w-80">
        <div className="absolute bottom-0 left-1/2 h-2.5 w-px -translate-x-1/2 bg-bone" />

        {ticks.map((t) => {
          const delta = angleDelta(t.deg);
          if (Math.abs(delta) > 75) return null;
          const pct = 50 + (delta / 75) * 48;
          return (
            <span
              key={t.label}
              style={{ left: `${pct}%` }}
              className={`absolute top-0 -translate-x-1/2 select-none ${
                t.label.length === 1 ? 'font-bold text-bone' : 'text-bone/55'
              }`}
            >
              {t.label}
            </span>
          );
        })}

        {/* Lander: open triangle */}
        <span
          style={{ left: `${landerNav.pct}%` }}
          title="Lander"
          className="absolute bottom-0.5 h-0 w-0 -translate-x-1/2 border-x-[4px] border-b-[7px] border-x-transparent border-b-bone"
        />

        {/* Rover: square, filled once synced */}
        {roverNav && (
          <span
            style={{ left: `${roverNav.pct}%` }}
            title={rover.name}
            className={`absolute bottom-0.5 h-1.5 w-1.5 -translate-x-1/2 border border-bone ${
              isRoverDiscovered ? 'bg-bone' : 'bg-transparent'
            }`}
          />
        )}

        {/* Uncollected sample targets */}
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
              className="absolute bottom-0.5 h-1 w-1 -translate-x-1/2 rounded-full bg-bone/70"
            />
          );
        })}

        {/* Active waypoint */}
        <span
          style={{ left: `${waypointNav.pct}%` }}
          title={`Waypoint: ${waypointLabel}`}
          className="absolute bottom-0 h-2 w-2 -translate-x-1/2 rotate-45 bg-hivis"
        />
      </div>

      <div className="num flex items-baseline gap-4 text-[11px] text-bone">
        <span className="font-bold">{String(heading).padStart(3, '0')}°</span>
        <span className="text-bone/80">
          {landerNav.arrow} Lander {Math.round(landerDistance)} m
        </span>
        <span className="text-hivis">
          {waypointNav.arrow} {waypointLabel} {Math.round(waypointNav.dist)} m
        </span>
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
  const carriedSamples = useMissionStore((s) => s.carriedSamples);
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
  const evaStartTime = useMissionStore((s) => s.evaStartTime);
  const vaultedSamples = useMissionStore((s) => s.vaultedSamples);
  const areaCompleteModalOpen = useMissionStore((s) => s.areaCompleteModalOpen);
  const wristMapOpen = useMissionStore((s) => s.wristMapOpen);

  const startScan = useMissionStore((s) => s.startScan);
  const resupplyAndOffloadAtLander = useMissionStore((s) => s.resupplyAndOffloadAtLander);
  const discoverRover = useMissionStore((s) => s.discoverRover);
  const routeToUnexploredFrontier = useMissionStore((s) => s.routeToUnexploredFrontier);
  const clearLanderStatusMessage = useMissionStore((s) => s.clearLanderStatusMessage);
  const setAreaCompleteModalOpen = useMissionStore((s) => s.setAreaCompleteModalOpen);
  const switchAreaFromEva = useMissionStore((s) => s.switchAreaFromEva);
  const returnToOrbit = useMissionStore((s) => s.returnToOrbit);

  const [menuOpen, setMenuOpen] = useState(false);
  const [commsMessage, setCommsMessage] = useState(null);
  const commsStateRef = useRef({
    lastEvaStart: 0,
    prevCollectedCount: null,
    warnedStress: false,
    announcedVaultComplete: false,
  });

  useEffect(() => {
    if (!commsMessage) return undefined;
    const timer = setTimeout(() => setCommsMessage(null), 6000);
    return () => clearTimeout(timer);
  }, [commsMessage]);

  useEffect(() => {
    if (!landerStatusMessage) return undefined;
    const timer = setTimeout(() => {
      clearLanderStatusMessage();
    }, 3200);
    return () => clearTimeout(timer);
  }, [landerStatusMessage, clearLanderStatusMessage]);

  const [evaNow, setEvaNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setEvaNow(Date.now()), 100);
    return () => clearInterval(id);
  }, []);

  const evaElapsedMs = evaStartTime > 0 ? Math.max(0, evaNow - evaStartTime) : 0;
  const evaTotalSeconds = Math.floor(evaElapsedMs / 1000);
  const evaHours = Math.floor(evaTotalSeconds / 3600);
  const evaMinutes = Math.floor((evaTotalSeconds % 3600) / 60);
  const evaSeconds = evaTotalSeconds % 60;
  const evaCentis = Math.floor((evaElapsedMs % 1000) / 10);
  const evaClockText =
    evaHours > 0
      ? `${String(evaHours).padStart(2, '0')}:${String(evaMinutes).padStart(2, '0')}:${String(evaSeconds).padStart(2, '0')}`
      : `${String(evaMinutes).padStart(2, '0')}:${String(evaSeconds).padStart(2, '0')}:${String(evaCentis).padStart(2, '0')}`;

  const heartBpm = Math.round(
    64 + (100 - (physiology?.stamina ?? 100)) * 0.78 + (telemetry.slope > 18 ? 14 : 0)
  );
  const ambientTempC = Math.round(-78 + (sunGlareFactor || 0) * 38);
  const oxyPct = Math.max(0, Math.min(100, physiology?.oxygen ?? 100));
  const thermPct = Math.max(0, Math.min(100, physiology?.heaterReserve ?? 100));
  const stamPct = Math.max(0, Math.min(100, physiology?.stamina ?? 100));

  const site = LANDING_ZONES_BY_ID[selectedSiteId] || LANDING_ZONES_BY_ID.jezero;
  const collectedIds = collectedSamples[site.id] || [];
  const vaultedCount = (vaultedSamples[site.id] || []).length;
  const isAllSiteVaulted = site.targets.length > 0 && vaultedCount >= site.targets.length;

  useEffect(() => {
    const tracker = commsStateRef.current;
    if (evaStartTime && tracker.lastEvaStart !== evaStartTime) {
      tracker.lastEvaStart = evaStartTime;
      tracker.prevCollectedCount = collectedIds.length;
      tracker.warnedStress = false;
      tracker.announcedVaultComplete = false;
      setCommsMessage(
        'CAPCOM // Valkyrie, good touchdown. Bring up the field slate with M to pull the rover track and plot a route.'
      );
      return;
    }

    if (tracker.prevCollectedCount === 0 && collectedIds.length === 1) {
      setCommsMessage(
        'SCIENCE // Spectrum matches the archive, nice core. It adds weight, so watch your stamina on anything over 15°.'
      );
    }
    tracker.prevCollectedCount = collectedIds.length;
  }, [evaStartTime, collectedIds.length]);

  useEffect(() => {
    const tracker = commsStateRef.current;
    const isStressed = carriedSamples.length >= 2 || (physiology?.oxygen ?? 100) < 30;
    if (isStressed && !tracker.warnedStress) {
      tracker.warnedStress = true;
      setCommsMessage(
        'FLIGHT // You are burning O₂ fast. Head back to the airlock, drop the cores and top up.'
      );
    } else if (!isStressed) {
      tracker.warnedStress = false;
    }
  }, [carriedSamples.length, physiology?.oxygen]);

  useEffect(() => {
    const tracker = commsStateRef.current;
    if (isAllSiteVaulted && !tracker.announcedVaultComplete) {
      tracker.announcedVaultComplete = true;
      setCommsMessage(
        'CAPCOM // All cores are in the vault. Dust front is moving in, you are cleared to return to orbit.'
      );
    }
  }, [isAllSiteVaulted]);
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

  const comms = commsMessage ? commsMessage.split(' // ') : null;

  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-4 sm:p-6">
      {/* Helmet edge falloff */}
      <div className="visor-vignette pointer-events-none fixed inset-0 -z-10" />

      {/* Sun visor tint when facing the sun */}
      {sunGlareFactor > 0.15 && (
        <div
          className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-1/3 bg-gradient-to-b from-black/60 to-transparent transition-opacity duration-200"
          style={{ opacity: Math.min(0.22, sunGlareFactor * 0.3) }}
        />
      )}

      {headlampOn && (
        <div className="pointer-events-none fixed inset-0 -z-10 shadow-[inset_0_0_45px_rgba(255,255,255,0.07)]" />
      )}

      {/* Hypothermia: frost creeping in from the visor corners */}
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
            <polygon points="0,0 160,0 110,32 130,65 72,82 35,120 0,140" fill="#e0f2fe" opacity="0.14" />
            <path d="M0,0 L120,55 M24,0 L80,75 M0,30 L92,90" stroke="#f0f9ff" strokeWidth="1.2" opacity="0.25" />
            <polygon points="1000,0 840,0 890,32 870,65 928,82 965,120 1000,140" fill="#e0f2fe" opacity="0.14" />
            <path d="M1000,0 L880,55 M976,0 L920,75 M1000,30 L908,90" stroke="#f0f9ff" strokeWidth="1.2" opacity="0.25" />
            <polygon points="0,600 160,600 112,565 130,532 72,515 35,475 0,460" fill="#bae6fd" opacity="0.14" />
            <path d="M0,600 L125,540 M28,600 L82,520 M0,565 L95,505" stroke="#f0f9ff" strokeWidth="1.2" opacity="0.25" />
            <polygon points="1000,600 840,600 888,565 870,532 928,515 965,475 1000,460" fill="#bae6fd" opacity="0.14" />
            <path d="M1000,600 L875,540 M972,600 L918,520 M1000,565 L905,505" stroke="#f0f9ff" strokeWidth="1.2" opacity="0.25" />
            <rect x="0" y="0" width="1000" height="600" fill="none" stroke="#bae6fd" strokeWidth="4" opacity="0.22" />
          </svg>
        </div>
      )}

      {/* Exhaustion: pulse at the edges, breath on the glass */}
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

      {/* Hypoxia: tunnel vision */}
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

      {/* Heavy pack strain */}
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
        </div>
      )}

      {/* Slope and radiation warnings at the edge of vision */}
      {isSlopeHazard && (
        <div className="animate-hazard-vignette pointer-events-none fixed inset-0 -z-10 shadow-[inset_0_0_60px_rgba(239,68,68,0.15)]" />
      )}
      {!isSlopeHazard && isSlopeCaution && (
        <div className="pointer-events-none fixed inset-0 -z-10 shadow-[inset_0_0_50px_rgba(245,158,11,0.08)]" />
      )}
      {isRadElevated && (
        <div className="animate-hazard-vignette pointer-events-none fixed inset-0 -z-10 shadow-[inset_0_0_60px_rgba(168,85,247,0.12)]" />
      )}

      {/* Top row: consumables, clock and compass, body and pack */}
      <div className="on-scene grid grid-cols-[1fr_auto_1fr] items-start gap-4 select-none">
        <div className="w-full max-w-[200px] space-y-2.5">
          <Gauge label="O₂" pct={oxyPct} low={oxyPct < 25} lowClass="bg-crit" />
          <Gauge label="Heater" pct={thermPct} low={thermPct < 25} lowClass="bg-warn" />
          <div className="num flex items-baseline gap-3 pt-0.5 text-[11px]">
            <span className="text-bone">
              Body {(physiology?.bodyTempC ?? 36.8).toFixed(1)} °C
            </span>
            <span className="text-bone/65">Outside {ambientTempC} °C</span>
          </div>
        </div>

        <div className="flex flex-col items-center">
          <div className="num text-[26px] leading-none text-bone">{evaClockText}</div>
          <div className="mt-1 text-[10px] tracking-[0.08em] text-bone/70 uppercase">
            EVA elapsed · {site.name}
          </div>

          <div className="mt-3 hidden sm:block">
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

          {comms && (
            <div
              role="status"
              className="mt-3 max-w-md border-l-2 border-hivis bg-ink/85 px-3 py-2 text-left text-[12px] leading-snug text-bone [text-shadow:none]"
            >
              {comms.length > 1 && (
                <span className="mr-2 text-[10px] font-bold tracking-[0.08em] text-hivis">
                  {comms[0]}
                </span>
              )}
              {comms.length > 1 ? comms.slice(1).join(' ') : comms[0]}
            </div>
          )}
        </div>

        <div className="ml-auto w-full max-w-[200px] space-y-2.5">
          <Gauge label="Stamina" pct={stamPct} low={stamPct < 25} lowClass="bg-warn" />
          <div className="num flex items-baseline justify-between text-[11px] text-bone">
            <span>
              Pack {carriedMassKg.toFixed(0)}/{maxPackMassKg} kg
            </span>
            <span className="text-bone/65">{telemetry.radiation} mSv</span>
          </div>

          <div className="hidden items-center gap-2 sm:flex">
            <svg viewBox="0 0 180 26" className="h-4 flex-1 overflow-hidden">
              <polyline
                fill="none"
                stroke="#ebe4d4"
                strokeWidth="1.3"
                strokeLinejoin="round"
                points="0,16 18,16 23,13 27,16 32,16 35,20 39,4 43,23 47,16 54,16 59,13 64,16 86,16 91,13 95,16 100,16 103,20 107,4 111,23 115,16 122,16 127,13 132,16 154,16 159,13 163,16 168,16 171,20 175,4 179,23"
              >
                <animateTransform
                  attributeName="transform"
                  type="translate"
                  from="0 0"
                  to="-68 0"
                  dur={`${(60 / Math.max(50, heartBpm)).toFixed(2)}s`}
                  repeatCount="indefinite"
                />
              </polyline>
            </svg>
            <span className="num text-[11px] text-bone">{heartBpm} bpm</span>
          </div>
        </div>
      </div>

      {/* Centre: reticle and whatever you can interact with */}
      <div className="relative flex flex-1 items-center justify-center">
        <div className="flex flex-col items-center">
          <div
            className={`relative flex items-center justify-center transition-all duration-200 ${
              hasInteractFocus ? 'h-9 w-9' : 'h-5 w-5'
            }`}
          >
            <div className={`h-1 w-1 rounded-full ${hasInteractFocus ? 'bg-hivis' : 'bg-bone/70'}`} />
            {hasInteractFocus ? (
              <>
                <span className="absolute top-0 left-0 h-2 w-2 border-t border-l border-hivis" />
                <span className="absolute top-0 right-0 h-2 w-2 border-t border-r border-hivis" />
                <span className="absolute bottom-0 left-0 h-2 w-2 border-b border-l border-hivis" />
                <span className="absolute right-0 bottom-0 h-2 w-2 border-r border-b border-hivis" />
              </>
            ) : (
              <div className="absolute inset-0 rounded-full border border-bone/30" />
            )}
          </div>

          {nearLander && !scanningState.active && (
            <button type="button" onClick={resupplyAndOffloadAtLander} className={PROMPT_CLASS}>
              <kbd>E</kbd>
              <span>Resupply and offload cores</span>
            </button>
          )}

          {activeTarget && !nearLander && (
            <div className="mt-4 flex flex-col items-center">
              {scanningState.active ? (
                <div className="w-56 border border-rule bg-ink/90 px-3 py-2">
                  <div className="mb-1.5 flex items-baseline justify-between text-[12px] text-bone">
                    <span>Coring {activeTarget.code}</span>
                    <span className="num">{Math.round(scanningState.progress)}%</span>
                  </div>
                  <div className="gauge">
                    <i style={{ width: `${scanningState.progress}%`, transitionDuration: '75ms' }} />
                  </div>
                </div>
              ) : isActiveCollected ? (
                <div className="on-scene text-[12px] text-ok">
                  {activeTarget.code} cored and logged
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => startScan(activeTarget.id)}
                  className={PROMPT_CLASS.replace('mt-4 ', '')}
                >
                  <kbd>E</kbd>
                  <span>Scan and core {activeTarget.code}</span>
                </button>
              )}
            </div>
          )}

          {nearRover && !nearLander && !activeTarget && !scanningState.active && rover && (
            <button
              type="button"
              onClick={() => {
                discoverRover(site.id);
                routeToUnexploredFrontier();
              }}
              className={PROMPT_CLASS}
            >
              <kbd>E</kbd>
              <span>Sync with {rover.name}</span>
            </button>
          )}

          {landerStatusMessage && (
            <div
              role="status"
              className="mt-3 max-w-sm border-l-2 border-bone bg-ink/85 px-3 py-1.5 text-[12px] text-bone"
            >
              {landerStatusMessage}
            </div>
          )}
        </div>
      </div>

      <FieldSlateHUD
        site={site}
        activeTarget={activeTarget}
        isActiveCollected={isActiveCollected}
      />

      {/* Menu button */}
      {!wristMapOpen && !menuOpen && !areaCompleteModalOpen && (
        <button
          type="button"
          onClick={() => {
            if (document.pointerLockElement) {
              try {
                document.exitPointerLock();
              } catch {
                // ignore
              }
            }
            setMenuOpen(true);
          }}
          className="btn pointer-events-auto fixed bottom-6 left-6 z-20 bg-ink/85"
        >
          Menu
        </button>
      )}

      {/* Mission menu */}
      {menuOpen && (
        <div
          onClick={() => setMenuOpen(false)}
          className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4"
        >
          <div onClick={(e) => e.stopPropagation()} className="panel w-full max-w-md p-6 text-bone">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="label mb-1">Mission menu</div>
                <h2 className="place text-[22px] leading-tight">{site.name}</h2>
              </div>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="Close menu"
                className="icon-btn -mt-1 -mr-2"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                returnToOrbit();
              }}
              className="btn btn-primary mt-5 w-full"
            >
              Return to orbit
            </button>

            <div className="label mt-6 mb-1">Move to another site</div>
            <SiteList
              zones={LANDING_ZONES}
              currentId={site.id}
              vaultedSamples={vaultedSamples}
              onPick={(id) => {
                setMenuOpen(false);
                switchAreaFromEva(id);
              }}
            />
          </div>
        </div>
      )}

      {/* Site complete */}
      {areaCompleteModalOpen && (
        <div
          onClick={() => setAreaCompleteModalOpen(false)}
          className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4"
        >
          <div onClick={(e) => e.stopPropagation()} className="panel w-full max-w-md p-6 text-bone">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="label mb-1 text-ok">
                  Site complete · {site.targets.length} of {site.targets.length} cores vaulted
                </div>
                <h2 className="place text-[22px] leading-tight">{site.name}</h2>
              </div>
              <button
                type="button"
                onClick={() => setAreaCompleteModalOpen(false)}
                aria-label="Stay at this site"
                className="icon-btn -mt-1 -mr-2"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-3 text-[13px] leading-relaxed text-dim">
              Every target here has been cored and is in the lander vault. Where to next?
            </p>

            <div className="mt-4">
              <SiteList
                zones={LANDING_ZONES.filter((z) => z.id !== site.id)}
                currentId={site.id}
                vaultedSamples={vaultedSamples}
                onPick={(id) => switchAreaFromEva(id)}
              />
            </div>

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setAreaCompleteModalOpen(false);
                  returnToOrbit();
                }}
                className="btn btn-primary flex-1"
              >
                Return to orbit
              </button>
              <button type="button" onClick={() => setAreaCompleteModalOpen(false)} className="btn">
                Stay here
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Key hints */}
      <div className="on-scene pointer-events-none mx-auto hidden flex-wrap justify-center gap-x-4 gap-y-1 text-[11px] text-bone/75 sm:flex">
        <span><kbd>M</kbd> Map</span>
        <span><kbd>1</kbd>&ndash;<kbd>4</kbd> Layers</span>
        <span><kbd>E</kbd> Interact</span>
        <span><kbd>P</kbd> Route</span>
        <span><kbd>R</kbd> Radar</span>
        <span><kbd>F</kbd> Lamp</span>
        <span><kbd>O</kbd> Orbit</span>
      </div>
    </div>
  );
}

const PROMPT_CLASS =
  'pointer-events-auto mt-4 flex items-center gap-2.5 border border-rule bg-ink/90 px-3 py-1.5 text-[13px] text-bone transition-colors hover:border-bone';

function Gauge({ label, pct, low, lowClass }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-[11px]">
        <span className="text-bone">{label}</span>
        <span className="num text-bone">{Math.round(pct)}%</span>
      </div>
      <div className="gauge">
        <i className={low ? lowClass : ''} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function SiteList({ zones, currentId, vaultedSamples, onPick }) {
  return (
    <ul className="border-b border-rule">
      {zones.map((zone) => {
        const isCurrent = zone.id === currentId;
        const vaulted = (vaultedSamples[zone.id] || []).length;
        return (
          <li key={zone.id} className="border-t border-rule">
            <button
              type="button"
              disabled={isCurrent}
              onClick={() => onPick(zone.id)}
              className={`group flex w-full items-baseline justify-between gap-4 py-2.5 text-left ${
                isCurrent ? '' : 'hover:bg-raised'
              }`}
            >
              <span className="min-w-0">
                <span className={`place block truncate text-[15px] ${isCurrent ? 'text-dim' : 'text-bone'}`}>
                  {zone.name}
                </span>
                <span className="num block text-[11px] text-dim">
                  {vaulted} of {zone.targets.length} cores vaulted
                </span>
              </span>
              <span className="shrink-0 text-[12px] text-dim group-hover:text-bone">
                {isCurrent ? 'You are here' : 'Go'}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
