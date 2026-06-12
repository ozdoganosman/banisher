// Dünya uzayında geçici efektler: uçan kazanç yazıları ve talaş parçacıkları

export interface Floater {
  x: number;
  y: number;
  text: string;
  color: string;
  ttl: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  ttl: number;
}

export const FLOATER_TTL = 1.6;

export const floaters: Floater[] = [];
export const particles: Particle[] = [];

export function addFloater(x: number, y: number, text: string, color: string): void {
  floaters.push({ x, y, text, color, ttl: FLOATER_TTL });
  if (floaters.length > 40) floaters.shift();
}

// Balta/kazma vuruşlarında saçılan küçük parçacıklar
export function burst(x: number, y: number, color: string, n: number): void {
  for (let i = 0; i < n; i++) {
    particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 34,
      vy: -Math.random() * 26 - 6,
      color,
      ttl: 0.45 + Math.random() * 0.3,
    });
  }
  if (particles.length > 200) particles.splice(0, particles.length - 200);
}

// Uçan mızraklar: avcıdan hedefe süzülür, varınca saplanma efekti bırakır
export interface SpearShot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  ttl: number;
  onHit?: () => void;
}

export const spearShots: SpearShot[] = [];

export function throwSpearFx(
  fromX: number, fromY: number,
  toX: number, toY: number,
  onHit?: () => void
): void {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const dist = Math.hypot(dx, dy) || 1;
  const SPEED = 260; // dünya-piksel/sn
  spearShots.push({
    x: fromX,
    y: fromY,
    vx: (dx / dist) * SPEED,
    vy: (dy / dist) * SPEED,
    angle: Math.atan2(dy, dx),
    ttl: dist / SPEED,
    onHit,
  });
}

export function updateEffects(dt: number): void {
  for (let i = spearShots.length - 1; i >= 0; i--) {
    const sp = spearShots[i];
    sp.ttl -= dt;
    sp.x += sp.vx * dt;
    sp.y += sp.vy * dt;
    if (sp.ttl <= 0) {
      sp.onHit?.();
      spearShots.splice(i, 1);
    }
  }
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i];
    f.ttl -= dt;
    f.y -= 9 * dt;
    if (f.ttl <= 0) floaters.splice(i, 1);
  }
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.ttl -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 70 * dt; // yerçekimi
    if (p.ttl <= 0) particles.splice(i, 1);
  }
}
