import { fractalNoise, hash2 } from "./noise";
import { Tile, isWalkable, TILE_SIZE } from "./tiles";

export class World {
  readonly width: number;
  readonly height: number;
  readonly tiles: Uint8Array;

  // Kesilmek üzere işaretlenen ve bir köylü tarafından sahiplenilen ağaçlar
  readonly marked = new Set<number>();
  readonly claimed = new Set<number>();

  // Bir blok değiştiğinde (örn. ağaç kesildi) renderer'ın haberi olsun
  onTileChange: ((x: number, y: number) => void) | null = null;

  constructor(width: number, height: number, seed: number) {
    this.width = width;
    this.height = height;
    this.tiles = new Uint8Array(width * height);
    this.generate(seed);
  }

  index(x: number, y: number): number {
    return y * this.width + x;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  get(x: number, y: number): Tile {
    return this.tiles[this.index(x, y)] as Tile;
  }

  set(x: number, y: number, t: Tile): void {
    this.tiles[this.index(x, y)] = t;
    this.onTileChange?.(x, y);
  }

  walkableAt(x: number, y: number): boolean {
    return this.inBounds(x, y) && isWalkable(this.get(x, y));
  }

  private generate(seed: number): void {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const e = fractalNoise(x * 0.045, y * 0.045, seed, 4);
        let t: Tile;
        if (e < 0.36) t = Tile.Water;
        else if (e < 0.4) t = Tile.Sand;
        else if (e < 0.62) t = Tile.Grass;
        else if (e < 0.68) t = Tile.Dirt;
        else t = Tile.Stone;

        // Orman kuşakları: çimen üzerinde ayrı bir noise ile ağaç yerleştir
        if (t === Tile.Grass) {
          const f = fractalNoise(x * 0.09, y * 0.09, seed + 7777, 3);
          if (f > 0.55 && hash2(x, y, seed + 13) > 0.35) t = Tile.Tree;
        }
        this.tiles[this.index(x, y)] = t;
      }
    }
  }

  // Ağacı işaretle / işareti kaldır (oyuncu tıklaması)
  toggleMark(x: number, y: number): void {
    if (!this.inBounds(x, y) || this.get(x, y) !== Tile.Tree) return;
    const i = this.index(x, y);
    if (this.marked.has(i)) {
      this.marked.delete(i);
      this.claimed.delete(i);
    } else {
      this.marked.add(i);
    }
  }

  chopTree(x: number, y: number): void {
    const i = this.index(x, y);
    this.marked.delete(i);
    this.claimed.delete(i);
    this.set(x, y, Tile.Grass);
  }

  // Verilen konuma en yakın, sahiplenilmemiş işaretli ağacı bul
  findNearestMarkedTree(px: number, py: number): { x: number; y: number } | null {
    const tx = Math.floor(px / TILE_SIZE);
    const ty = Math.floor(py / TILE_SIZE);
    let best: { x: number; y: number } | null = null;
    let bestDist = Infinity;
    for (const i of this.marked) {
      if (this.claimed.has(i)) continue;
      const x = i % this.width;
      const y = Math.floor(i / this.width);
      const d = Math.abs(x - tx) + Math.abs(y - ty);
      if (d < bestDist) {
        bestDist = d;
        best = { x, y };
      }
    }
    return best;
  }

  // Haritanın ortasına en yakın yürünebilir blok (köylülerin doğma noktası)
  findSpawn(): { x: number; y: number } {
    const cx = Math.floor(this.width / 2);
    const cy = Math.floor(this.height / 2);
    for (let r = 0; r < Math.max(this.width, this.height); r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = cx + dx;
          const y = cy + dy;
          if (this.walkableAt(x, y)) return { x, y };
        }
      }
    }
    return { x: cx, y: cy };
  }
}
