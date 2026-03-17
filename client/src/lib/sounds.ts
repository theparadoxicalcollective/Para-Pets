let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  try {
    if (!ctx) {
      ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return ctx;
  } catch {
    return null;
  }
}

export function playClick() {
  try {
    const c = getCtx();
    if (!c) return;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.connect(gain);
    gain.connect(c.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(1100, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(700, c.currentTime + 0.035);
    gain.gain.setValueAtTime(0.07, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.045);
    osc.start(c.currentTime);
    osc.stop(c.currentTime + 0.05);
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
