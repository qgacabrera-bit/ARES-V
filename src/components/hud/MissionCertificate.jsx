import React from 'react';
import { downloadExpeditionCertificate } from '../../utils/certificateGenerator';

export function MissionPatchSVG({ size = 84 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="ARES-V Mission Patch"
      className="shrink-0"
    >
      <defs>
        <path
          id="ares-patch-ring-text"
          d="M 60,60 m -46,0 a 46,46 0 1,1 92,0 a 46,46 0 1,1 -92,0"
        />
      </defs>

      {/* Outer aerospace ring */}
      <circle cx="60" cy="60" r="57" stroke="#e2e8f0" strokeWidth="1.5" />
      {/* Mars rust accent inner ring */}
      <circle cx="60" cy="60" r="52.5" stroke="#c2410c" strokeWidth="1.75" />
      {/* Inner crest boundary */}
      <circle cx="60" cy="60" r="38" stroke="rgba(226,232,240,0.3)" strokeWidth="1" />

      {/* Curved perimeter aerospace text */}
      <text
        fill="#e2e8f0"
        fontSize="5.6"
        fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
        letterSpacing="1.65"
        fontWeight="600"
      >
        <textPath href="#ares-patch-ring-text" startOffset="50%" textAnchor="middle">
          ARES-V MISSION DIRECTORATE &bull; MARS SURFACE EVA
        </textPath>
      </text>

      {/* Subtle orbital trajectory arc lines */}
      <path
        d="M 27 72 Q 58 26 93 48"
        stroke="rgba(226,232,240,0.45)"
        strokeWidth="1"
        strokeDasharray="2.5 2.5"
      />
      <path d="M 24 64 Q 60 36 95 58" stroke="#c2410c" strokeWidth="1.15" />

      {/* Minimalist Mount Sharp topographic contour peaks */}
      <path
        d="M 28 79 L 45 55 L 55 64 L 66 44 L 82 70 L 92 79"
        stroke="#e2e8f0"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M 35 79 L 47 63 L 56 70 L 66 54 L 77 72 L 86 79"
        stroke="rgba(226,232,240,0.42)"
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <line x1="25" y1="79" x2="95" y2="79" stroke="rgba(226,232,240,0.45)" strokeWidth="1" />

      {/* 4-point orbital navigation star */}
      <path
        d="M 66 28 L 67.8 33.2 L 73 35 L 67.8 36.8 L 66 42 L 64.2 36.8 L 59 35 L 64.2 33.2 Z"
        fill="#e2e8f0"
      />
    </svg>
  );
}

const CORRIDORS = [
  { coords: '18.38\u00B0N', name: 'Jezero' },
  { coords: '4.59\u00B0S', name: 'Mount Sharp' },
  { coords: '1.95\u00B0S', name: 'Meridiani' },
  { coords: '14.57\u00B0S', name: 'Gusev' },
];

export default function MissionCertificate({
  astronautName,
  onChangeName,
  totalVaulted,
  totalPossible,
  sitesCount,
  roversCount,
  distLabel,
  timeLabel,
  peakRad,
}) {
  const issuedDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  const displayName = (astronautName || 'Commander Valkyrie').trim() || 'Commander Valkyrie';

  return (
    <div className="space-y-3">
      {/* Inline Astronaut Name Customization (outside certificate frame) */}
      <div className="flex flex-wrap items-center justify-between gap-2 border border-white/10 bg-ink/60 px-3 py-2">
        <label
          htmlFor="cert-astronaut-name"
          className="font-mono text-[10px] tracking-[0.18em] text-dim uppercase"
        >
          Astronaut Name:
        </label>
        <input
          id="cert-astronaut-name"
          type="text"
          value={astronautName}
          onChange={(e) => onChangeName(e.target.value)}
          maxLength={40}
          placeholder="Commander Valkyrie"
          className="min-w-[200px] flex-1 border-b border-white/20 bg-transparent px-2 py-0.5 font-mono text-[12px] text-bone outline-none focus:border-[#c2410c]"
        />
      </div>

      {/* Authentic NASA / JPL Planetary EVA Mission Certification Dossier */}
      <div className="relative overflow-hidden border border-white/15 bg-gradient-to-br from-[#0b0f17] via-[#0e1420] to-[#080b11] p-1 text-[#e2e8f0]">
        <div className="relative border border-white/10">
          {/* NASA Mars Surface Albedo Backdrop */}
          <img
            src="/textures/mars_albedo.jpg"
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-[0.30]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#0b0f17]/75 via-[#0e1420]/62 to-[#080b11]/80"
          />

          {/* Warm-amber radial glow tucked behind the right-hand Mission Patch */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(circle at 86% 32%, rgba(234, 88, 12, 0.06) 0%, rgba(234, 88, 12, 0) 44%)',
            }}
          />

          {/* Subtle Martian Topographic Contour Watermark (MOLA/HiRISE) */}
          <svg
            aria-hidden="true"
            viewBox="0 0 800 500"
            fill="none"
            preserveAspectRatio="xMidYMid slice"
            className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.045]"
          >
            <path
              d="M -40 340 C 80 280, 180 390, 320 310 C 440 240, 560 150, 720 190 C 780 205, 820 185, 850 170"
              stroke="#e2e8f0"
              strokeWidth="1.5"
            />
            <path
              d="M -40 385 C 95 320, 200 420, 350 340 C 475 270, 585 185, 735 225 C 790 240, 825 220, 850 205"
              stroke="#e2e8f0"
              strokeWidth="1.2"
            />
            <path
              d="M -40 295 C 70 235, 165 340, 295 275 C 410 215, 535 120, 695 155 C 760 170, 815 150, 850 135"
              stroke="#e2e8f0"
              strokeWidth="1.2"
            />
            <path
              d="M 110 -30 C 175 60, 125 145, 225 185 C 325 225, 395 125, 485 85 C 575 45, 650 80, 745 20"
              stroke="#e2e8f0"
              strokeWidth="1.2"
            />
            <path
              d="M 175 -30 C 225 45, 195 110, 270 140 C 345 170, 415 95, 495 55 C 565 20, 635 45, 705 -20"
              stroke="#e2e8f0"
              strokeWidth="1"
            />
            <ellipse cx="645" cy="145" rx="135" ry="78" transform="rotate(-14 645 145)" stroke="#e2e8f0" strokeWidth="1" />
            <ellipse cx="645" cy="145" rx="92" ry="50" transform="rotate(-14 645 145)" stroke="#e2e8f0" strokeWidth="1" />
            <ellipse cx="180" cy="395" rx="150" ry="68" transform="rotate(11 180 395)" stroke="#e2e8f0" strokeWidth="1" />
            <ellipse cx="180" cy="395" rx="96" ry="42" transform="rotate(11 180 395)" stroke="#e2e8f0" strokeWidth="1" />
          </svg>

          {/* Aerospace Registration Corner Crosshairs (+ 12px inset 16px) */}
          {[
            'top-4 left-4',
            'top-4 right-4',
            'bottom-4 left-4',
            'bottom-4 right-4',
          ].map((pos) => (
            <svg
              key={pos}
              aria-hidden="true"
              width="12"
              height="12"
              viewBox="0 0 12 12"
              className={`pointer-events-none absolute ${pos} text-white/25`}
            >
              <line x1="6" y1="0" x2="6" y2="12" stroke="currentColor" strokeWidth="1" />
              <line x1="0" y1="6" x2="12" y2="6" stroke="currentColor" strokeWidth="1" />
            </svg>
          ))}

          {/* Top Classification Header Bar */}
        <div
          className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 font-mono text-[9.5px] tracking-[0.14em] text-slate-400 uppercase"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.12)' }}
        >
          <span>DOC ID: ARES-V-EVA-412</span>
          <span className="text-slate-200">
            SURFACE EXPLORATION &amp; SAMPLE RETURN CERTIFICATION
          </span>
          <span>SOL 412 // MERIDIAN RELAY</span>
        </div>

        {/* Main Citation Block */}
        <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="font-mono text-[10px] tracking-[0.22em] text-[#c2410c] uppercase">
              THIS CERTIFIES THAT
            </div>
            <div className="mt-1.5 truncate text-[28px] leading-tight font-semibold tracking-tight text-white sm:text-[32px]">
              {displayName}
            </div>
            <div
              className="mt-2 mb-2.5 w-full"
              style={{ borderTop: '1px solid rgba(255,255,255,0.14)' }}
            />
            <p className="text-[12px] leading-relaxed text-slate-300">
              Has achieved 100% completion of orbital-to-surface reconnaissance and geological core
              recovery across all four designated NASA Mars landing corridors, returning all{' '}
              {totalPossible} priority specimens and archiving every Sol 0 &amp; rover landmark.
            </p>
          </div>

          <div className="flex shrink-0 justify-center sm:pl-4">
            <MissionPatchSVG size={88} />
          </div>
        </div>

        {/* Corridor Sign-Off Strip (Compact 4-Column Ledger) */}
        <div
          className="grid grid-cols-2 sm:grid-cols-4"
          style={{
            borderTop: '1px solid rgba(255,255,255,0.12)',
            borderBottom: '1px solid rgba(255,255,255,0.12)',
          }}
        >
          {CORRIDORS.map((c, idx) => (
            <div
              key={c.name}
              className={`px-3 py-2.5 ${idx > 0 ? 'sm:border-l sm:border-white/12' : ''} ${
                idx % 2 === 1 ? 'border-l border-white/12 sm:border-l' : ''
              } ${idx >= 2 ? 'border-t border-white/12 sm:border-t-0' : ''}`}
            >
              <div className="font-mono text-[10px] text-slate-400">
                {c.coords} {c.name}
              </div>
              <div className="mt-0.5 font-mono text-[10px] tracking-wider text-emerald-400">
                [VERIFIED]
              </div>
            </div>
          ))}
        </div>

        {/* Bottom Telemetry & Authentication Footer */}
        <div className="grid grid-cols-1 gap-4 px-5 py-3.5 sm:grid-cols-2 sm:items-end">
          {/* Left: Mission Telemetry Log */}
          <div>
            <div className="font-mono text-[9px] tracking-[0.18em] text-slate-400 uppercase">
              MISSION TELEMETRY LOG
            </div>
            <div className="mt-1 font-mono text-[11px] leading-relaxed text-slate-200">
              {totalVaulted}/{totalPossible} CORES &middot; {distLabel.toUpperCase()} TRAVERSE
              &middot; {timeLabel} EVA TIME &middot; {peakRad} PEAK RAD
            </div>
          </div>

          {/* Right: Flight Directorate Sign-Off */}
          <div className="flex flex-col sm:items-end">
            <div className="font-mono text-[9px] tracking-[0.18em] text-slate-400 uppercase">
              FLIGHT DIRECTORATE SIGN-OFF
            </div>
            {/* Minimalist vector signature flourish */}
            <svg
              width="124"
              height="24"
              viewBox="0 0 124 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="my-1"
              aria-hidden="true"
            >
              <path
                d="M 4 18 C 16 4, 24 20, 36 10 C 44 3, 46 19, 58 12 C 68 6, 74 17, 88 11 C 98 7, 108 13, 120 9"
                stroke="#e2e8f0"
                strokeWidth="1.25"
                strokeLinecap="round"
              />
            </svg>
            <div className="font-mono text-[10px] tracking-[0.08em] text-slate-300">
              ISSUED: {issuedDate.toUpperCase()} | TEAM AVENGINEERS
            </div>
          </div>
        </div>
        </div>
      </div>

      {/* Subtle Export Action Outside Certificate Border */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() =>
            downloadExpeditionCertificate({
              astronautName: displayName,
              totalVaulted,
              totalPossible,
              sitesCount,
              roversCount,
              distLabel,
              timeLabel,
              peakRad,
            })
          }
          className="border border-white/20 bg-transparent px-3 py-1.5 font-mono text-[11px] tracking-[0.14em] text-slate-200 transition-colors hover:border-[#c2410c] hover:text-white"
        >
          [ DOWNLOAD PNG ]
        </button>
      </div>
    </div>
  );
}
