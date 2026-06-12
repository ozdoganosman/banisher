// Prosedürel ses motoru (WebAudio): dosya yok, tüm sesler sentezlenir.
// Mesafeye göre kısılır: setListener her karede kamera konumunu bildirir.

let actx: AudioContext | null = null;
let master: GainNode | null = null;
let fireGain: GainNode | null = null;
let muted = false;

let lx = 0; // dinleyici (kamera) dünya konumu
let ly = 0;

export function setMuted(m: boolean): void {
  muted = m;
  if (master) master.gain.value = m ? 0 : 0.5;
}

export function isMuted(): boolean {
  return muted;
}

// İlk kullanıcı etkileşiminde çağrılmalı (tarayıcı kuralı)
export function initAudio(): void {
  if (actx) return;
  try {
    actx = new AudioContext();
    master = actx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(actx.destination);
    startFireLoop();
  } catch {
    actx = null;
  }
}

export function setListener(x: number, y: number): void {
  lx = x;
  ly = y;
}

// Dünya konumuna göre 0..1 kazanç (yaklaşık 360 piksel duyum menzili)
function gainAt(x: number, y: number): number {
  const d = Math.hypot(x - lx, y - ly);
  return Math.max(0, 1 - d / 360);
}

function noiseBuffer(seconds: number): AudioBuffer {
  const buf = actx!.createBuffer(1, actx!.sampleRate * seconds, actx!.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

// Kısa gürültü patlaması (filtre + zarf): balta, adım, çarpma
function noiseHit(
  x: number, y: number,
  freq: number, q: number, dur: number, vol: number
): void {
  if (!actx || !master) return;
  const g = gainAt(x, y) * vol;
  if (g <= 0.01) return;
  const src = actx.createBufferSource();
  src.buffer = noiseBuffer(dur);
  const filter = actx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = freq;
  filter.Q.value = q;
  const env = actx.createGain();
  env.gain.setValueAtTime(g, actx.currentTime);
  env.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + dur);
  src.connect(filter).connect(env).connect(master);
  src.start();
}

// Balta/kazma/çekiç darbesi: tok vuruş
export function sfxHit(x: number, y: number, kind: "wood" | "stone" | "build"): void {
  if (!actx) return;
  const f = kind === "wood" ? 320 : kind === "stone" ? 1400 : 700;
  noiseHit(x, y, f, 2.5, 0.09, kind === "stone" ? 0.5 : 0.65);
  // alt tok ses
  if (!master) return;
  const g = gainAt(x, y) * 0.4;
  if (g <= 0.01) return;
  const osc = actx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(kind === "wood" ? 120 : 180, actx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(60, actx.currentTime + 0.08);
  const env = actx.createGain();
  env.gain.setValueAtTime(g, actx.currentTime);
  env.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.1);
  osc.connect(env).connect(master);
  osc.start();
  osc.stop(actx.currentTime + 0.12);
}

// Adım: çok kısa yumuşak tıkırtı
export function sfxStep(x: number, y: number): void {
  noiseHit(x, y, 900, 1, 0.04, 0.16);
}

// Mızrak vınlaması
export function sfxWhoosh(x: number, y: number): void {
  if (!actx || !master) return;
  const g = gainAt(x, y) * 0.5;
  if (g <= 0.01) return;
  const src = actx.createBufferSource();
  src.buffer = noiseBuffer(0.25);
  const filter = actx.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 4;
  filter.frequency.setValueAtTime(400, actx.currentTime);
  filter.frequency.exponentialRampToValueAtTime(2400, actx.currentTime + 0.18);
  const env = actx.createGain();
  env.gain.setValueAtTime(0.001, actx.currentTime);
  env.gain.exponentialRampToValueAtTime(g, actx.currentTime + 0.06);
  env.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.25);
  src.connect(filter).connect(env).connect(master);
  src.start();
}

// Kurt uluması: vibratolu sinüs kayması (ayı için pesi)
export function sfxHowl(x: number, y: number, low = false): void {
  if (!actx || !master) return;
  const g = Math.max(0.15, gainAt(x, y)) * 0.45; // ulumalar uzaktan da duyulur
  const t0 = actx.currentTime;
  const osc = actx.createOscillator();
  osc.type = "sine";
  const base = low ? 160 : 320;
  osc.frequency.setValueAtTime(base * 0.7, t0);
  osc.frequency.linearRampToValueAtTime(base * 1.4, t0 + 0.5);
  osc.frequency.linearRampToValueAtTime(base * 1.2, t0 + 1.1);
  osc.frequency.linearRampToValueAtTime(base * 0.6, t0 + 1.6);
  const vib = actx.createOscillator();
  vib.frequency.value = 6;
  const vibGain = actx.createGain();
  vibGain.gain.value = 9;
  vib.connect(vibGain).connect(osc.frequency);
  const env = actx.createGain();
  env.gain.setValueAtTime(0.001, t0);
  env.gain.exponentialRampToValueAtTime(g, t0 + 0.25);
  env.gain.setValueAtTime(g, t0 + 1.1);
  env.gain.exponentialRampToValueAtTime(0.001, t0 + 1.7);
  osc.connect(env).connect(master);
  osc.start(t0);
  vib.start(t0);
  osc.stop(t0 + 1.8);
  vib.stop(t0 + 1.8);
}

// Ateş çıtırtısı: sürekli filtreli gürültü; yakınlık main'den ayarlanır
function startFireLoop(): void {
  if (!actx || !master) return;
  const src = actx.createBufferSource();
  src.buffer = noiseBuffer(2);
  src.loop = true;
  const filter = actx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 900;
  fireGain = actx.createGain();
  fireGain.gain.value = 0;
  // çıtırtı hissi: kazancı titreten LFO
  const lfo = actx.createOscillator();
  lfo.type = "square";
  lfo.frequency.value = 13;
  const lfoGain = actx.createGain();
  lfoGain.gain.value = 0.35;
  const crackle = actx.createGain();
  crackle.gain.value = 1;
  lfo.connect(lfoGain).connect(crackle.gain);
  src.connect(filter).connect(crackle).connect(fireGain).connect(master);
  src.start();
  lfo.start();
}

// Kameranın en yakın ateşe uzaklığına göre çıtırtı seviyesi (her kare)
export function setFireProximity(dist: number): void {
  if (!fireGain || !actx) return;
  const target = Math.max(0, 1 - dist / 220) * 0.35;
  fireGain.gain.setTargetAtTime(target, actx.currentTime, 0.2);
}
