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
