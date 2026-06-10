import type { World } from "../world/world";

export interface PathNode {
  x: number;
  y: number;
}

// Grid üzerinde 4 yönlü A* — küçük bir binary heap ile
export function findPath(
  world: World,
  sx: number,
  sy: number,
  tx: number,
  ty: number
): PathNode[] | null {
  if (!world.walkableAt(tx, ty)) return null;
  if (sx === tx && sy === ty) return [{ x: tx, y: ty }];

  const w = world.width;
  const h = world.height;
  const size = w * h;
  const gScore = new Float32Array(size).fill(Infinity);
  const cameFrom = new Int32Array(size).fill(-1);
  const closed = new Uint8Array(size);

  // heap: f skoruna göre sıralı min-heap (eleman: düğüm indexi)
  const heap: number[] = [];
  const fScore = new Float32Array(size).fill(Infinity);

  const push = (i: number) => {
    heap.push(i);
    let c = heap.length - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (fScore[heap[p]] <= fScore[heap[c]]) break;
      [heap[p], heap[c]] = [heap[c], heap[p]];
      c = p;
    }
  };

  const pop = (): number => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = last;
      let p = 0;
      for (;;) {
        const l = p * 2 + 1;
        const r = l + 1;
        let m = p;
        if (l < heap.length && fScore[heap[l]] < fScore[heap[m]]) m = l;
        if (r < heap.length && fScore[heap[r]] < fScore[heap[m]]) m = r;
        if (m === p) break;
        [heap[p], heap[m]] = [heap[m], heap[p]];
        p = m;
      }
    }
    return top;
  };

  const heuristic = (x: number, y: number) =>
    Math.abs(x - tx) + Math.abs(y - ty);

  const start = sy * w + sx;
  const target = ty * w + tx;
  gScore[start] = 0;
  fScore[start] = heuristic(sx, sy);
  push(start);

  const dirs = [1, -1, w, -w];

  while (heap.length > 0) {
    const cur = pop();
    if (cur === target) {
      // yolu geriye doğru kur
      const path: PathNode[] = [];
      let i = cur;
      while (i !== -1) {
        path.push({ x: i % w, y: Math.floor(i / w) });
        i = cameFrom[i];
      }
      path.reverse();
      return path;
    }
    if (closed[cur]) continue;
    closed[cur] = 1;

    const cx = cur % w;
    for (const d of dirs) {
      const next = cur + d;
      // satır kenarlarından taşmayı engelle
      if (d === 1 && cx === w - 1) continue;
      if (d === -1 && cx === 0) continue;
      if (next < 0 || next >= size) continue;
      const nx = next % w;
      const ny = Math.floor(next / w);
      if (!world.walkableAt(nx, ny) || closed[next]) continue;
      const g = gScore[cur] + 1;
      if (g < gScore[next]) {
        gScore[next] = g;
        fScore[next] = g + heuristic(nx, ny);
        cameFrom[next] = cur;
        push(next);
      }
    }
  }
  return null;
}

function tryCandidates(
  world: World,
  sx: number,
  sy: number,
  candidates: PathNode[]
): PathNode[] | null {
  const walkable = candidates.filter((c) => world.walkableAt(c.x, c.y));
  // en yakın adaydan başlayarak dene
  walkable.sort(
    (a, b) =>
      Math.abs(a.x - sx) + Math.abs(a.y - sy) -
      (Math.abs(b.x - sx) + Math.abs(b.y - sy))
  );
  for (const c of walkable) {
    const path = findPath(world, sx, sy, c.x, c.y);
    if (path) return path;
  }
  return null;
}

// Hedef bloğun (örn. ağaç) yanındaki yürünebilir bir bloğa yol bul
export function findPathAdjacent(
  world: World,
  sx: number,
  sy: number,
  tx: number,
  ty: number
): PathNode[] | null {
  return tryCandidates(world, sx, sy, [
    { x: tx + 1, y: ty },
    { x: tx - 1, y: ty },
    { x: tx, y: ty + 1 },
    { x: tx, y: ty - 1 },
  ]);
}

// Bir dikdörtgenin (örn. 2x2 bina) çevresindeki yürünebilir bir bloğa yol bul
export function findPathAdjacentRect(
  world: World,
  sx: number,
  sy: number,
  rx: number,
  ry: number,
  size: number
): PathNode[] | null {
  const candidates: PathNode[] = [];
  for (let i = 0; i < size; i++) {
    candidates.push({ x: rx + i, y: ry - 1 }); // üst
    candidates.push({ x: rx + i, y: ry + size }); // alt
    candidates.push({ x: rx - 1, y: ry + i }); // sol
    candidates.push({ x: rx + size, y: ry + i }); // sağ
  }
  return tryCandidates(world, sx, sy, candidates);
}
