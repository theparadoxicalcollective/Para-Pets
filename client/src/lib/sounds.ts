let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  try {
    if (!ctx) {
      ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    // Browsers (especially iOS/Safari) suspend the context until a user gesture.
    // Resume every time so sounds never silently fail after the first interaction.
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    return ctx;
  } catch {
    return null;
  }
}

/** Call once on the very first user gesture to pre-unlock the audio context. */
export function unlockAudio() {
  const c = getCtx();
  if (!c) return;
  // Play a silent buffer so iOS fully unlocks the context.
  try {
    const buf = c.createBuffer(1, 1, 22050);
    const src = c.createBufferSource();
    src.buffer = buf;
    src.connect(c.destination);
    src.start(0);
  } catch {}
}

export function playClick() {
  try {
    const c = getCtx();
    if (!c) return;
    const osc = c.createOscillator();
    const gain = c.createGain();
    const compressor = c.createDynamicsCompressor();
    osc.connect(gain);
    gain.connect(compressor);
    compressor.connect(c.destination);
    osc.type = "triangle";
    osc.frequency.setValueAtTime(520, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(260, c.currentTime + 0.022);
    gain.gain.setValueAtTime(0.55, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.04);
    osc.start(c.currentTime);
    osc.stop(c.currentTime + 0.045);
  } catch {}
}

export function playTick() {
  try {
    const c = getCtx();
    if (!c) return;
    const compressor = c.createDynamicsCompressor();
    compressor.connect(c.destination);

    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.connect(gain);
    gain.connect(compressor);
    osc.type = "sine";
    osc.frequency.setValueAtTime(1800, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(900, c.currentTime + 0.018);
    gain.gain.setValueAtTime(0.5, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.025);
    osc.start(c.currentTime);
    osc.stop(c.currentTime + 0.03);

    const osc2 = c.createOscillator();
    const gain2 = c.createGain();
    osc2.connect(gain2);
    gain2.connect(compressor);
    osc2.type = "square";
    osc2.frequency.setValueAtTime(3600, c.currentTime);
    gain2.gain.setValueAtTime(0.15, c.currentTime);
    gain2.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.012);
    osc2.start(c.currentTime);
    osc2.stop(c.currentTime + 0.015);
  } catch {}
}

export function playShopBell() {
  try {
    const c = getCtx();
    if (!c) return;
    const pairs = [
      { freq: 880, vol: 0.22, decay: 1.3 },
      { freq: 1108.7, vol: 0.16, decay: 1.0 },
      { freq: 1760, vol: 0.09, decay: 0.6 },
    ];
    pairs.forEach(({ freq, vol, decay }, i) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.connect(gain);
      gain.connect(c.destination);
      osc.type = "sine";
      const t = c.currentTime + i * 0.03;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.0, t);
      gain.gain.linearRampToValueAtTime(vol, t + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.001, t + decay);
      osc.start(t);
      osc.stop(t + decay + 0.05);
    });
  } catch {}
}

export function playPlop() {
  try {
    const c = getCtx();
    if (!c) return;

    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.connect(gain);
    gain.connect(c.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(420, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(90, c.currentTime + 0.22);
    gain.gain.setValueAtTime(0.35, c.currentTime);
    gain.gain.setValueAtTime(0.35, c.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.28);
    osc.start(c.currentTime);
    osc.stop(c.currentTime + 0.3);

    const osc2 = c.createOscillator();
    const gain2 = c.createGain();
    osc2.connect(gain2);
    gain2.connect(c.destination);
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(200, c.currentTime + 0.05);
    osc2.frequency.exponentialRampToValueAtTime(60, c.currentTime + 0.25);
    gain2.gain.setValueAtTime(0.0, c.currentTime);
    gain2.gain.setValueAtTime(0.18, c.currentTime + 0.05);
    gain2.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.3);
    osc2.start(c.currentTime);
    osc2.stop(c.currentTime + 0.35);
  } catch {}
}

export function playChime() {
  try {
    const c = getCtx();
    if (!c) return;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.connect(gain);
      gain.connect(c.destination);
      osc.type = "sine";
      const t = c.currentTime + i * 0.11;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.0, t);
      gain.gain.linearRampToValueAtTime(0.18, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      osc.start(t);
      osc.stop(t + 0.55);

      const osc2 = c.createOscillator();
      const gain2 = c.createGain();
      osc2.connect(gain2);
      gain2.connect(c.destination);
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(freq * 2, t);
      gain2.gain.setValueAtTime(0.0, t);
      gain2.gain.linearRampToValueAtTime(0.07, t + 0.01);
      gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      osc2.start(t);
      osc2.stop(t + 0.3);
    });
  } catch {}
}

export function playReelTick() {
  try {
    const c = getCtx();
    if (!c) return;

    const compressor = c.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-18, c.currentTime);
    compressor.ratio.setValueAtTime(6, c.currentTime);
    compressor.connect(c.destination);

    // Mechanical body — sawtooth dropping for a gear-tooth click quality
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.connect(gain);
    gain.connect(compressor);
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(340, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(120, c.currentTime + 0.018);
    gain.gain.setValueAtTime(0.20, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.022);
    osc.start(c.currentTime);
    osc.stop(c.currentTime + 0.025);

    // Texture layer — filtered noise burst for the metallic "snap"
    const bufLen = Math.floor(c.sampleRate * 0.012);
    const buf = c.createBuffer(1, bufLen, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = (Math.random() * 2 - 1);
    const noise = c.createBufferSource();
    const filter = c.createBiquadFilter();
    const noiseGain = c.createGain();
    filter.type = "bandpass";
    filter.frequency.value = 2800;
    filter.Q.value = 1.8;
    noise.buffer = buf;
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(compressor);
    noiseGain.gain.setValueAtTime(0.09, c.currentTime);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.012);
    noise.start(c.currentTime);
  } catch {}
}

export function playLevelUp() {
  try {
    const c = getCtx();
    if (!c) return;
    // Rising C-major arpeggio — each note gets a main tone + harmonic shimmer
    const notes = [
      { freq: 523.25, delay: 0.00, vol: 0.28, hold: 0.55 },
      { freq: 659.25, delay: 0.09, vol: 0.26, hold: 0.50 },
      { freq: 783.99, delay: 0.17, vol: 0.23, hold: 0.45 },
      { freq: 1046.5, delay: 0.24, vol: 0.30, hold: 0.70 },
      { freq: 1318.5, delay: 0.35, vol: 0.20, hold: 0.85 },
    ];
    notes.forEach(({ freq, delay, vol, hold }) => {
      const t = c.currentTime + delay;
      const osc = c.createOscillator(); const gain = c.createGain();
      osc.connect(gain); gain.connect(c.destination);
      osc.type = "sine"; osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(vol, t + 0.014);
      gain.gain.exponentialRampToValueAtTime(0.001, t + hold);
      osc.start(t); osc.stop(t + hold + 0.05);
      // Octave shimmer
      const osc2 = c.createOscillator(); const gain2 = c.createGain();
      osc2.connect(gain2); gain2.connect(c.destination);
      osc2.type = "sine"; osc2.frequency.setValueAtTime(freq * 2, t);
      gain2.gain.setValueAtTime(0, t);
      gain2.gain.linearRampToValueAtTime(vol * 0.22, t + 0.014);
      gain2.gain.exponentialRampToValueAtTime(0.001, t + hold * 0.55);
      osc2.start(t); osc2.stop(t + hold + 0.05);
    });
    // High sparkle noise burst at the peak
    const sparkT = c.currentTime + 0.3;
    const bufLen = Math.floor(c.sampleRate * 0.1);
    const buf = c.createBuffer(1, bufLen, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) d[i] = Math.random() * 2 - 1;
    const noise = c.createBufferSource();
    const filter = c.createBiquadFilter();
    const ng = c.createGain();
    filter.type = "highpass"; filter.frequency.value = 7000;
    noise.buffer = buf;
    noise.connect(filter); filter.connect(ng); ng.connect(c.destination);
    ng.gain.setValueAtTime(0.09, sparkT);
    ng.gain.exponentialRampToValueAtTime(0.001, sparkT + 0.1);
    noise.start(sparkT);
  } catch {}
}

export function playPowerUp() {
  try {
    const c = getCtx();
    if (!c) return;
    // Rising sawtooth sweep — energising charge-up
    const osc = c.createOscillator(); const gain = c.createGain();
    osc.connect(gain); gain.connect(c.destination);
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(200, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(900, c.currentTime + 0.22);
    gain.gain.setValueAtTime(0, c.currentTime);
    gain.gain.linearRampToValueAtTime(0.16, c.currentTime + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.3);
    osc.start(c.currentTime); osc.stop(c.currentTime + 0.35);
    // Punch accent at peak
    const osc2 = c.createOscillator(); const gain2 = c.createGain();
    osc2.connect(gain2); gain2.connect(c.destination);
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(900, c.currentTime + 0.19);
    osc2.frequency.exponentialRampToValueAtTime(1800, c.currentTime + 0.3);
    gain2.gain.setValueAtTime(0, c.currentTime + 0.19);
    gain2.gain.linearRampToValueAtTime(0.22, c.currentTime + 0.21);
    gain2.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.48);
    osc2.start(c.currentTime + 0.19); osc2.stop(c.currentTime + 0.52);
    // High shimmer on top
    const osc3 = c.createOscillator(); const gain3 = c.createGain();
    osc3.connect(gain3); gain3.connect(c.destination);
    osc3.type = "sine"; osc3.frequency.setValueAtTime(2400, c.currentTime + 0.21);
    gain3.gain.setValueAtTime(0.1, c.currentTime + 0.21);
    gain3.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.5);
    osc3.start(c.currentTime + 0.21); osc3.stop(c.currentTime + 0.55);
  } catch {}
}

export function playSpeedUp() {
  try {
    const c = getCtx();
    if (!c) return;
    // Whoosh — bandpass noise sweeping upward in frequency
    const bufLen = Math.floor(c.sampleRate * 0.28);
    const buf = c.createBuffer(1, bufLen, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) d[i] = Math.random() * 2 - 1;
    const noise = c.createBufferSource();
    const filter = c.createBiquadFilter();
    const ng = c.createGain();
    filter.type = "bandpass"; filter.Q.value = 3;
    filter.frequency.setValueAtTime(350, c.currentTime);
    filter.frequency.exponentialRampToValueAtTime(4500, c.currentTime + 0.22);
    noise.buffer = buf;
    noise.connect(filter); filter.connect(ng); ng.connect(c.destination);
    ng.gain.setValueAtTime(0, c.currentTime);
    ng.gain.linearRampToValueAtTime(0.22, c.currentTime + 0.04);
    ng.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.26);
    noise.start(c.currentTime);
    // Sparkling ascending dings at the tail
    [1046.5, 1567.98, 2093.0].forEach((freq, i) => {
      const t = c.currentTime + 0.13 + i * 0.055;
      const osc = c.createOscillator(); const g = c.createGain();
      osc.connect(g); g.connect(c.destination);
      osc.type = "sine"; osc.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.14, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      osc.start(t); osc.stop(t + 0.35);
    });
  } catch {}
}

export function playGrab() {
  try {
    const c = getCtx();
    if (!c) return;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.connect(gain);
    gain.connect(c.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(320, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(480, c.currentTime + 0.045);
    gain.gain.setValueAtTime(0.28, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.07);
    osc.start(c.currentTime);
    osc.stop(c.currentTime + 0.08);
    const osc2 = c.createOscillator();
    const gain2 = c.createGain();
    osc2.connect(gain2);
    gain2.connect(c.destination);
    osc2.type = "triangle";
    osc2.frequency.setValueAtTime(640, c.currentTime + 0.01);
    osc2.frequency.exponentialRampToValueAtTime(900, c.currentTime + 0.05);
    gain2.gain.setValueAtTime(0.12, c.currentTime + 0.01);
    gain2.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.07);
    osc2.start(c.currentTime + 0.01);
    osc2.stop(c.currentTime + 0.08);
  } catch {}
}

export function playCatch() {
  try {
    const c = getCtx();
    if (!c) return;
    const notes = [659.25, 880, 1174.66];
    notes.forEach((freq, i) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.connect(gain);
      gain.connect(c.destination);
      osc.type = "sine";
      const t = c.currentTime + i * 0.08;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.0, t);
      gain.gain.linearRampToValueAtTime(0.2, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
      osc.start(t);
      osc.stop(t + 0.5);
    });
  } catch {}
}

export function playHit() {
  try {
    const c = getCtx();
    if (!c) return;
    const compressor = c.createDynamicsCompressor();
    compressor.connect(c.destination);
    const noise = c.createOscillator();
    const noiseGain = c.createGain();
    noise.connect(noiseGain);
    noiseGain.connect(compressor);
    noise.type = "sawtooth";
    noise.frequency.setValueAtTime(180, c.currentTime);
    noise.frequency.exponentialRampToValueAtTime(60, c.currentTime + 0.07);
    noiseGain.gain.setValueAtTime(0.55, c.currentTime);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.1);
    noise.start(c.currentTime);
    noise.stop(c.currentTime + 0.12);
    const snap = c.createOscillator();
    const snapGain = c.createGain();
    snap.connect(snapGain);
    snapGain.connect(compressor);
    snap.type = "square";
    snap.frequency.setValueAtTime(420, c.currentTime);
    snap.frequency.exponentialRampToValueAtTime(200, c.currentTime + 0.04);
    snapGain.gain.setValueAtTime(0.35, c.currentTime);
    snapGain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.06);
    snap.start(c.currentTime);
    snap.stop(c.currentTime + 0.08);
  } catch {}
}

export function playBlock() {
  try {
    const c = getCtx();
    if (!c) return;
    const compressor = c.createDynamicsCompressor();
    compressor.connect(c.destination);
    [320, 480, 640].forEach((freq, i) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.connect(gain);
      gain.connect(compressor);
      osc.type = "triangle";
      const t = c.currentTime + i * 0.018;
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.25, t + 0.05);
      gain.gain.setValueAtTime(0.0, t);
      gain.gain.linearRampToValueAtTime(0.3, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      osc.start(t);
      osc.stop(t + 0.22);
    });
  } catch {}
}

export function playPlayerHurt() {
  try {
    const c = getCtx();
    if (!c) return;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.connect(gain);
    gain.connect(c.destination);
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(240, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(90, c.currentTime + 0.15);
    gain.gain.setValueAtTime(0.45, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.2);
    osc.start(c.currentTime);
    osc.stop(c.currentTime + 0.22);
    const osc2 = c.createOscillator();
    const gain2 = c.createGain();
    osc2.connect(gain2);
    gain2.connect(c.destination);
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(120, c.currentTime + 0.05);
    osc2.frequency.exponentialRampToValueAtTime(60, c.currentTime + 0.2);
    gain2.gain.setValueAtTime(0.3, c.currentTime + 0.05);
    gain2.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.25);
    osc2.start(c.currentTime + 0.05);
    osc2.stop(c.currentTime + 0.28);
  } catch {}
}

export function playDefeat() {
  try {
    const c = getCtx();
    if (!c) return;
    const notes = [330, 277, 220, 165];
    notes.forEach((freq, i) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.connect(gain);
      gain.connect(c.destination);
      osc.type = "sine";
      const t = c.currentTime + i * 0.22;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.0, t);
      gain.gain.linearRampToValueAtTime(0.28, t + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
      osc.start(t);
      osc.stop(t + 0.6);
    });
  } catch {}
}

export function playBattleVictory() {
  try {
    const c = getCtx();
    if (!c) return;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.connect(gain);
      gain.connect(c.destination);
      osc.type = "triangle";
      const t = c.currentTime + i * 0.14;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.0, t);
      gain.gain.linearRampToValueAtTime(0.22, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
      osc.start(t);
      osc.stop(t + 0.6);
    });
    const shimmer = c.createOscillator();
    const shimGain = c.createGain();
    shimmer.connect(shimGain);
    shimGain.connect(c.destination);
    shimmer.type = "sine";
    shimmer.frequency.setValueAtTime(2093, c.currentTime + 0.5);
    shimGain.gain.setValueAtTime(0.0, c.currentTime + 0.5);
    shimGain.gain.linearRampToValueAtTime(0.18, c.currentTime + 0.54);
    shimGain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 1.1);
    shimmer.start(c.currentTime + 0.5);
    shimmer.stop(c.currentTime + 1.2);
  } catch {}
}
