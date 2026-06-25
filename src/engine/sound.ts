// Prosedürel ses motoru (WebAudio): dosya yok, tüm sesler sentezlenir.
// Kalite için: master limiter + sentetik reverb; ateş çıtırtısı LFO ile
// "biçilmez" (eski helikopter sesi giderildi), bunun yerine kahverengi
// gürültü yatağı + seyrek rastgele çıtırtı patlamalarıyla doğal yanar.
// Mesafeye göre kısılır: setListener her karede kamera konumunu bildirir.

let actx: AudioContext | null = null;
let master: GainNode | null = null; // ana ses (mute burada)
let busDry: GainNode | null = null; // kuru karışım girişi
let reverb: ConvolverNode | null = null;
let fireGain: GainNode | null = null; // ateşin genel seviyesi (mesafe)
let currentFire = 0; // çıtırtı zamanlayıcısının okuduğu anlık seviye

// Ses kapalı/açık tercihi tarayıcıda saklanır: sayfa yenilense ya da "Ana
// Menü" (location.reload) sonrası bile korunur.
const MUTE_KEY = "banisher_muted";
function loadMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}
let muted = loadMuted();

let lx = 0; // dinleyici (kamera) dünya konumu
let ly = 0;

export function setMuted(m: boolean): void {
  muted = m;
  try {
    localStorage.setItem(MUTE_KEY, m ? "1" : "0");
  } catch {
    /* depolama yoksa sessizce geç */
  }
  if (master) master.gain.value = m ? 0 : 0.5;
}

export function isMuted(): boolean {
  return muted;
}

// Sentetik reverb darbesi: üstel sönen gürültü (mekân hissi verir)
function makeImpulse(seconds: number, decay: number): AudioBuffer {
  const len = Math.floor(actx!.sampleRate * seconds);
  const buf = actx!.createBuffer(2, len, actx!.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

// İlk kullanıcı etkileşiminde çağrılmalı (tarayıcı kuralı)
export function initAudio(): void {
  if (actx) return;
  try {
    actx = new AudioContext();

    // master -> limiter -> hoparlör (taşmayı/çatırtıyı önler)
    master = actx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    const limiter = actx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 6;
    limiter.ratio.value = 6;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    master.connect(limiter).connect(actx.destination);

    // kuru ve reverb yolları master'a girer
    busDry = actx.createGain();
    busDry.gain.value = 1;
    busDry.connect(master);
    reverb = actx.createConvolver();
    reverb.buffer = makeImpulse(1.6, 2.6);
    const reverbReturn = actx.createGain();
    reverbReturn.gain.value = 0.22; // hafif ıslaklık
    reverb.connect(reverbReturn).connect(master);

    startFireLoop();
    scheduleCrackle();
    // hata ayıklama/test kancası: ses grafiğini dışarıdan ölçebilmek için
    (window as unknown as { __audio?: unknown }).__audio = {
      ctx: actx,
      master,
      fire: () => currentFire,
    };
  } catch {
    actx = null;
  }
}

export function setListener(x: number, y: number): void {
  lx = x;
  ly = y;
}

// Bir kaynağı çıkışa bağla; wet>0 ise reverb'e de gönder
function connectOut(node: AudioNode, wet = 0): void {
  if (!busDry) return;
  node.connect(busDry);
  if (wet > 0 && reverb) {
    const send = actx!.createGain();
    send.gain.value = wet;
    node.connect(send);
    send.connect(reverb);
  }
}

// Dünya konumuna göre 0..1 kazanç (yumuşak sönüm, ~460 piksel menzil)
function gainAt(x: number, y: number): number {
  const d = Math.hypot(x - lx, y - ly);
  const r = 460;
  if (d >= r) return 0;
  const t = 1 - d / r;
  return t * t; // yakınken daha belirgin, uzakta yumuşak söner
}

function whiteBuffer(seconds: number): AudioBuffer {
  const len = Math.floor(actx!.sampleRate * seconds);
  const buf = actx!.createBuffer(1, len, actx!.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

// Sıcak, derin "kahverengi" gürültü (ateş yatağı için)
function brownBuffer(seconds: number): AudioBuffer {
  const len = Math.floor(actx!.sampleRate * seconds);
  const buf = actx!.createBuffer(1, len, actx!.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    last = (last + 0.02 * w) / 1.02;
    data[i] = last * 3.2;
  }
  return buf;
}

// Kısa gürültü patlaması (filtre + zarf): adım/çarpma katmanı
function noiseHit(
  x: number, y: number,
  freq: number, q: number, dur: number, vol: number,
  type: BiquadFilterType = "bandpass", wet = 0
): void {
  if (!actx || !busDry) return;
  const g = gainAt(x, y) * vol;
  if (g <= 0.004) return;
  const t0 = actx.currentTime;
  const src = actx.createBufferSource();
  src.buffer = whiteBuffer(dur);
  const filter = actx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;
  const env = actx.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(g, t0 + Math.min(0.008, dur * 0.3));
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter).connect(env);
  connectOut(env, wet);
  src.start();
  src.stop(t0 + dur + 0.02);
}

// Kısa tonal vuruş (gövde/tok ses)
function tone(
  x: number, y: number,
  type: OscillatorType, f0: number, f1: number, dur: number, vol: number, wet = 0
): void {
  if (!actx || !busDry) return;
  const g = gainAt(x, y) * vol;
  if (g <= 0.004) return;
  const t0 = actx.currentTime;
  const osc = actx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
  const env = actx.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(g, t0 + 0.006);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(env);
  connectOut(env, wet);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

// Balta/kazma/çekiç darbesi: tok gövde + malzemeye göre üst doku
export function sfxHit(x: number, y: number, kind: "wood" | "stone" | "build"): void {
  if (!actx) return;
  if (kind === "wood") {
    tone(x, y, "sine", 165, 70, 0.13, 0.5, 0.12); // "tok"
    noiseHit(x, y, 380, 1.5, 0.06, 0.4, "bandpass", 0.1); // odun lifi
  } else if (kind === "stone") {
    tone(x, y, "square", 420, 180, 0.05, 0.18); // sert "tak"
    noiseHit(x, y, 2600, 1.2, 0.05, 0.45, "highpass", 0.12);
  } else {
    tone(x, y, "sine", 200, 95, 0.13, 0.45, 0.12); // inşaat tokmağı
    noiseHit(x, y, 320, 1, 0.08, 0.3, "lowpass", 0.1);
  }
}

// Adım: yumuşak, kısık "puf" — çok sayıda köylü çakışmasın diye küresel kısıtlı
let stepTokens = 4;
let stepTokenAt = 0;
export function sfxStep(x: number, y: number): void {
  if (!actx) return;
  const now = actx.currentTime;
  // saniyede ~8 adımlık küresel bütçe (kalabalıkta "uğultu" olmaz)
  stepTokens = Math.min(4, stepTokens + (now - stepTokenAt) * 8);
  stepTokenAt = now;
  if (stepTokens < 1) return;
  stepTokens -= 1;
  const f = 200 + Math.random() * 120; // hafif perde değişimi
  noiseHit(x, y, f, 0.8, 0.05, 0.09, "lowpass");
}

// Araştırma tamamlandı: yumuşak çan arpeji (konuma bağlı değil, hep duyulur)
export function sfxResearch(): void {
  if (!actx || !busDry) return;
  const t0 = actx.currentTime;
  const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
  notes.forEach((freq, i) => {
    const start = t0 + i * 0.1;
    // çan: temel + oktav harmonik, yumuşak triangle
    for (const [mult, lvl] of [[1, 0.22], [2, 0.09]] as const) {
      const osc = actx!.createOscillator();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq * mult, start);
      const env = actx!.createGain();
      env.gain.setValueAtTime(0.0001, start);
      env.gain.exponentialRampToValueAtTime(lvl, start + 0.02);
      env.gain.exponentialRampToValueAtTime(0.0001, start + 0.7);
      osc.connect(env);
      connectOut(env, 0.45);
      osc.start(start);
      osc.stop(start + 0.75);
    }
  });
}

// Mızrak vınlaması: yükselen süzülmüş gürültü
export function sfxWhoosh(x: number, y: number): void {
  if (!actx || !busDry) return;
  const g = gainAt(x, y) * 0.4;
  if (g <= 0.004) return;
  const t0 = actx.currentTime;
  const src = actx.createBufferSource();
  src.buffer = whiteBuffer(0.3);
  const filter = actx.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 3;
  filter.frequency.setValueAtTime(500, t0);
  filter.frequency.exponentialRampToValueAtTime(2200, t0 + 0.2);
  const lp = actx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 3000;
  const env = actx.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(g, t0 + 0.05);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.26);
  src.connect(filter).connect(lp).connect(env);
  connectOut(env, 0.12);
  src.start();
  src.stop(t0 + 0.3);
}

// Kurt/ayı uluması: vibratolu, süzülmüş, mekânlı sinüs kayması
export function sfxHowl(x: number, y: number, low = false): void {
  if (!actx || !busDry) return;
  const g = Math.max(0.12, gainAt(x, y)) * 0.4; // uzaktan da duyulur
  const t0 = actx.currentTime;
  const osc = actx.createOscillator();
  osc.type = "sawtooth"; // daha zengin ton; lowpass yumuşatır
  const base = low ? 150 : 300;
  osc.frequency.setValueAtTime(base * 0.7, t0);
  osc.frequency.linearRampToValueAtTime(base * 1.35, t0 + 0.5);
  osc.frequency.linearRampToValueAtTime(base * 1.15, t0 + 1.1);
  osc.frequency.linearRampToValueAtTime(base * 0.6, t0 + 1.6);
  const lp = actx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = low ? 700 : 1300;
  const vib = actx.createOscillator();
  vib.frequency.value = 5;
  const vibGain = actx.createGain();
  vibGain.gain.value = base * 0.03;
  vib.connect(vibGain).connect(osc.frequency);
  const env = actx.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(g, t0 + 0.25);
  env.gain.setValueAtTime(g, t0 + 1.0);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.7);
  osc.connect(lp).connect(env);
  connectOut(env, 0.4); // ulumalar mekânlı yankılanır
  osc.start(t0);
  vib.start(t0);
  osc.stop(t0 + 1.8);
  vib.stop(t0 + 1.8);
}

// Ateş çıtırtısı: kahverengi gürültü yatağı + yumuşak titreşim (LFO chop YOK)
function startFireLoop(): void {
  if (!actx || !busDry) return;
  const t0 = actx.currentTime;
  const src = actx.createBufferSource();
  src.buffer = brownBuffer(4);
  src.loop = true;
  const filter = actx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 560; // sıcak, boğuk
  // yumuşak alev titremesi: iki yavaş sinüs LFO (kare dalga DEĞİL)
  const flicker = actx.createGain();
  flicker.gain.value = 0.8;
  for (const [rate, depth] of [[0.5, 0.13], [1.7, 0.07]] as const) {
    const lfo = actx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = rate;
    const lg = actx.createGain();
    lg.gain.value = depth;
    lfo.connect(lg).connect(flicker.gain);
    lfo.start(t0);
  }
  fireGain = actx.createGain();
  fireGain.gain.value = 0;
  src.connect(filter).connect(flicker).connect(fireGain);
  connectOut(fireGain, 0.1);
  src.start();
}

// Seyrek, rastgele çıtırtı patlamaları (gerçek ateş hissi)
function scheduleCrackle(): void {
  const delay = 45 + Math.random() * 170;
  setTimeout(() => {
    if (actx && busDry && currentFire > 0.02 && Math.random() < 0.7) {
      const t0 = actx.currentTime;
      const src = actx.createBufferSource();
      src.buffer = whiteBuffer(0.04);
      const bp = actx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 700 + Math.random() * 2200;
      bp.Q.value = 5;
      const env = actx.createGain();
      const pop = currentFire * (0.15 + Math.random() * 0.4);
      env.gain.setValueAtTime(0.0001, t0);
      env.gain.exponentialRampToValueAtTime(pop, t0 + 0.004);
      env.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.03 + Math.random() * 0.04);
      src.connect(bp).connect(env);
      connectOut(env, 0.08);
      src.start();
      src.stop(t0 + 0.1);
    }
    scheduleCrackle();
  }, delay);
}

// Kameranın en yakın ateşe uzaklığına göre çıtırtı seviyesi (her kare)
export function setFireProximity(dist: number): void {
  if (!fireGain || !actx) return;
  const target = Math.max(0, 1 - dist / 240) * 0.4;
  currentFire = target;
  fireGain.gain.setTargetAtTime(target, actx.currentTime, 0.25);
}
