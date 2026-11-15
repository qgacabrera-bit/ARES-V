let audioCtx = null;
let masterGain = null;
let muted = false;
let scanHumNodes = null;
let noiseBuffer = null;

function getContext() {
  if (typeof window === 'undefined') return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) {
    audioCtx = new Ctx();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = muted ? 0 : 0.22;
    masterGain.connect(audioCtx.destination);
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function getNoiseBuffer(ctx) {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) return noiseBuffer;
  const length = ctx.sampleRate * 1.5;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let lastOut = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    // Soft pink/brownish noise for natural air & thruster texture
    data[i] = (lastOut + 0.04 * white) / 1.04;
    lastOut = data[i];
    data[i] *= 2.8;
  }
  noiseBuffer = buffer;
  return noiseBuffer;
}

export function unlockAudio() {
  try {
    getContext();
  } catch {
    // Ignore audio context errors
  }
}

export function setAudioMuted(nextMuted) {
  muted = Boolean(nextMuted);
  if (muted) stopScanHum();
  if (masterGain && audioCtx) {
    masterGain.gain.setTargetAtTime(muted ? 0 : 0.22, audioCtx.currentTime, 0.03);
  }
}

export function playCommsChirp() {
  if (muted) return;
  try {
    const ctx = getContext();
    if (!ctx || !masterGain) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1180, now);
    osc.frequency.setValueAtTime(1520, now + 0.045);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.14, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);

    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(now);
    osc.stop(now + 0.12);
  } catch {
    // Ignore
  }
}

export function startScanHum() {
  if (muted || scanHumNodes) return;
  try {
    const ctx = getContext();
    if (!ctx || !masterGain) return;
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc1.type = 'triangle';
    osc2.type = 'sine';
    osc1.frequency.setValueAtTime(180, now);
    osc2.frequency.setValueAtTime(360, now);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(520, now);
    filter.Q.value = 2.2;

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.11, now + 0.12);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);

    osc1.start(now);
    osc2.start(now);
    scanHumNodes = { osc1, osc2, filter, gain };
  } catch {
    // Ignore
  }
}

export function updateScanHum(progress01) {
  if (muted) {
    stopScanHum();
    return;
  }
  if (!scanHumNodes) {
    startScanHum();
    return;
  }
  try {
    const ctx = getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const p = Math.min(1, Math.max(0, progress01));
    scanHumNodes.osc1.frequency.setTargetAtTime(180 + p * 210, now, 0.05);
    scanHumNodes.osc2.frequency.setTargetAtTime(360 + p * 420, now, 0.05);
    scanHumNodes.filter.frequency.setTargetAtTime(520 + p * 900, now, 0.05);
  } catch {
    // Ignore
  }
}

export function stopScanHum() {
  if (!scanHumNodes) return;
  try {
    const ctx = getContext();
    const { osc1, osc2, gain } = scanHumNodes;
    scanHumNodes = null;
    if (ctx) {
      const now = ctx.currentTime;
      gain.gain.setTargetAtTime(0.0001, now, 0.04);
      setTimeout(() => {
        try {
          osc1.stop();
          osc2.stop();
        } catch {
          // Ignore
        }
      }, 120);
    }
  } catch {
    scanHumNodes = null;
  }
}

export function playScanComplete() {
  stopScanHum();
  if (muted) return;
  try {
    const ctx = getContext();
    if (!ctx || !masterGain) return;
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      const t = now + i * 0.065;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.exponentialRampToValueAtTime(0.16, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(t);
      osc.stop(t + 0.24);
    });
  } catch {
    // Ignore
  }
}

export function playResupplySound() {
  if (muted) return;
  try {
    const ctx = getContext();
    if (!ctx || !masterGain) return;
    const now = ctx.currentTime;

    // Pressurized airlock hiss
    const src = ctx.createBufferSource();
    src.buffer = getNoiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1600, now);
    filter.Q.value = 1.4;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.18, now + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);
    src.start(now);
    src.stop(now + 0.45);

    // Chime
    const osc = ctx.createOscillator();
    const oGain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(587.33, now + 0.08);
    osc.frequency.setValueAtTime(880, now + 0.16);
    oGain.gain.setValueAtTime(0.001, now + 0.08);
    oGain.gain.exponentialRampToValueAtTime(0.15, now + 0.11);
    oGain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);
    osc.connect(oGain);
    oGain.connect(masterGain);
    osc.start(now + 0.08);
    osc.stop(now + 0.36);
  } catch {
    // Ignore
  }
}

export function playTransitWhoosh(mode = 'DEPLOY') {
  if (muted) return;
  try {
    const ctx = getContext();
    if (!ctx || !masterGain) return;
    const now = ctx.currentTime;
    const duration = mode === 'TRANSFER' ? 1.4 : 1.05;

    const src = ctx.createBufferSource();
    src.buffer = getNoiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    if (mode === 'ASCEND') {
      filter.frequency.setValueAtTime(220, now);
      filter.frequency.exponentialRampToValueAtTime(920, now + duration * 0.7);
      filter.frequency.exponentialRampToValueAtTime(180, now + duration);
    } else {
      filter.frequency.setValueAtTime(750, now);
      filter.frequency.exponentialRampToValueAtTime(210, now + duration);
    }

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.24, now + duration * 0.25);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);
    src.start(now);
    src.stop(now + duration + 0.05);
  } catch {
    // Ignore
  }
}

export function playSuitBreath(exertion01 = 0.1) {
  if (muted) return;
  try {
    const ctx = getContext();
    if (!ctx || !masterGain) return;
    const now = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = getNoiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(640 + exertion01 * 280, now);
    filter.Q.value = 1.6;

    const peak = 0.035 + exertion01 * 0.045;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(peak, now + 0.18);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.62);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);
    src.start(now);
    src.stop(now + 0.65);
  } catch {
    // Ignore
  }
}

export function playHeartbeat(intensity01 = 0.2) {
  if (muted) return;
  try {
    const ctx = getContext();
    if (!ctx || !masterGain) return;
    const now = ctx.currentTime;
    const peak = 0.04 + intensity01 * 0.07;

    [0, 0.16].forEach((offset, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      const t = now + offset;
      osc.frequency.setValueAtTime(idx === 0 ? 58 : 48, t);
      osc.frequency.exponentialRampToValueAtTime(32, t + 0.09);

      gain.gain.setValueAtTime(0.001, t);
      gain.gain.exponentialRampToValueAtTime(peak * (idx === 0 ? 1 : 0.72), t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.11);

      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(t);
      osc.stop(t + 0.12);
    });
  } catch {
    // Ignore
  }
}

export function playWarningBeep() {
  if (muted) return;
  try {
    const ctx = getContext();
    if (!ctx || !masterGain) return;
    const now = ctx.currentTime;
    [0, 0.14].forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      const t = now + offset;
      osc.frequency.setValueAtTime(880, t);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.exponentialRampToValueAtTime(0.055, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(t);
      osc.stop(t + 0.09);
    });
  } catch {
    // Ignore
  }
}
