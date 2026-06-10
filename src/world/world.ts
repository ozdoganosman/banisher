import { fractalNoise, hash2 } from "./noise";
import { Tile, isWalkable, TILE_SIZE } from "./tiles";

const BUSH_REGROW_TIME = 75; // saniye
const MUSHROOM_REGROW_TIME = 95;

export class World {
  readonly width: number;
  readonly height: number;
  readonly tiles: Uint8Array;
  // Yükseklik haritası: kabartma gölgelendirme ve su derinliği için
  readonly heights: Float32Array;

  // Kesilmek/toplanmak/kazılmak üzere işaretlenen ve sahiplenilen bloklar
  // (markedBushes hem çalı hem mantar içerir: ikisi de yemek toplama işidir)
  readonly markedTrees = new Set<number>();
  readonly claimedTrees = new Set<number>();
  readonly markedBushes = new Set<number>();
  readonly claimedBushes = new Set<number>();
  readonly markedStones = new Set<number>();
  readonly claimedStones = new Set<number>();

  // Bina kaplayan bloklar: yürünemez
  readonly blocked = new Set<number>();

  // Toplanan çalı/mantarlar bir süre sonra yeniden büyür
  private regrow: { x: number; y: number; t: number; tile: Tile }[] = [];

  // Bir blok değiştiğinde (örn. ağaç kesildi) renderer'ın haberi olsun
  onTileChange: ((x: number, y: number) => void) | null = null;

  constructor(width: number, height: number, seed: number) {
    this.width = width;
    this.height = height;
    this.tiles = new Uint8Array(width * height);
    this.heights = new Float32Array(width * height);
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

  // Sınır dışında en yakın kenar değeri döner (gölgelendirme kenarlarda da çalışsın)
  heightAt(x: number, y: number): number {
    const cx = Math.min(this.width - 1, Math.max(0, x));
    const cy = Math.min(this.height - 1, Math.max(0, y));
    return this.heights[cy * this.width + cx];
  }

  walkableAt(x: number, y: number): boolean {
    return (
      this.inBounds(x, y) &&
      isWalkable(this.get(x, y)) &&
      !this.blocked.has(this.index(x, y))
    );
  }

  update(dt: number): void {
    for (let i = this.regrow.length - 1; i >= 0; i--) {
      const r = this.regrow[i];
      r.t -= dt;
      if (r.t <= 0) {
        this.regrow.splice(i, 1);
        // arada bina yapılmadıysa aynı tipte geri gelsin
        if (this.get(r.x, r.y) === Tile.Grass && !this.blocked.has(this.index(r.x, r.y))) {
          this.set(r.x, r.y, r.tile);
        }
      }
    }
  }

  private generate(seed: number): void {
    // kenar sönümü: yükseklikten kademeli pay düşülür; noise sayesinde kıyı
    // çizgisi düzensiz olur ve sular derinleşerek açık denize doğal karışır
    const FALLOFF = 18; // blok
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const edge = Math.min(x, y, this.width - 1 - x, this.height - 1 - y);
        const ft = Math.min(1, edge / FALLOFF);
        const fade = ft * ft * (3 - 2 * ft); // smoothstep
        const e = Math.max(
          0,
          fractalNoise(x * 0.045, y * 0.045, seed, 4) - (1 - fade) * 0.6
        );
        this.heights[this.index(x, y)] = e;
        let t: Tile;
        if (e < 0.36) t = Tile.Water;
        else if (e < 0.4) t = Tile.Sand;
        else if (e < 0.62) t = Tile.Grass;
        else if (e < 0.68) t = Tile.Dirt;
        else t = Tile.Stone;

        if (t === Tile.Grass) {
          const f = fractalNoise(x * 0.09, y * 0.09, seed + 7777, 3);
          if (f > 0.55 && hash2(x, y, seed + 13) > 0.35) {
            // orman kuşakları
            t = Tile.Tree;
          } else if (f > 0.55 && hash2(x, y, seed + 61) > 0.8) {
            // orman içlerinde mantarlar (ağaç çıkmayan boşluklarda)
            t = Tile.Mushroom;
          } else if (f > 0.46 && hash2(x, y, seed + 31) > 0.82) {
            // orman kenarlarında meyve çalıları
            t = Tile.Bush;
          } else if (hash2(x, y, seed + 47) > 0.985) {
            // açık alanda seyrek çalılar
            t = Tile.Bush;
          }
        }
        this.tiles[this.index(x, y)] = t;
      }
    }
  }

  // Ağaç/çalı/mantar/taş işaretle veya işareti kaldır (oyuncu tıklaması)
  toggleMark(x: number, y: number): void {
    if (!this.inBounds(x, y)) return;
    const t = this.get(x, y);
    const i = this.index(x, y);
    const toggle = (marked: Set<number>, claimed: Set<number>) => {
      if (marked.has(i)) {
        marked.delete(i);
        claimed.delete(i);
      } else {
        marked.add(i);
      }
    };
    if (t === Tile.Tree) toggle(this.markedTrees, this.claimedTrees);
    else if (t === Tile.Bush || t === Tile.Mushroom) toggle(this.markedBushes, this.claimedBushes);
    else if (t === Tile.Stone) toggle(this.markedStones, this.claimedStones);
  }

  markTree(x: number, y: number): void {
    if (this.get(x, y) === Tile.Tree) this.markedTrees.add(this.index(x, y));
  }

  // Çalı veya mantar: ikisi de yemek toplama işaretine girer
  markFood(x: number, y: number): void {
    const t = this.get(x, y);
    if (t === Tile.Bush || t === Tile.Mushroom) this.markedBushes.add(this.index(x, y));
  }

  chopTree(x: number, y: number): void {
    const i = this.index(x, y);
    this.markedTrees.delete(i);
    this.claimedTrees.delete(i);
    this.set(x, y, Tile.Grass);
  }

  harvestFood(x: number, y: number): void {
    const i = this.index(x, y);
    const t = this.get(x, y) as Tile;
    this.markedBushes.delete(i);
    this.claimedBushes.delete(i);
    this.set(x, y, Tile.Grass);
    this.regrow.push({
      x, y,
      t: t === Tile.Mushroom ? MUSHROOM_REGROW_TIME : BUSH_REGROW_TIME,
      tile: t,
    });
  }

  // Taş kazıldığında blok toprağa döner (taş ocağı); yükseklik de düşer ki
  // kabartma gölgelendirme kazılmış çukur gibi görünsün
  mineStone(x: number, y: number): void {
    const i = this.index(x, y);
    this.markedStones.delete(i);
    this.claimedStones.delete(i);
    this.heights[i] = Math.min(this.heights[i], 0.6);
    this.set(x, y, Tile.Dirt);
    // komşuların kabartması bu bloğa bağlı: onları da yeniden boyat
    if (this.inBounds(x + 1, y)) this.onTileChange?.(x + 1, y);
    if (this.inBounds(x, y + 1)) this.onTileChange?.(x, y + 1);
  }

  // Verilen konuma en yakın, sahiplenilmemiş işaretli bloğu bul
  // (accept verilirse onu da geçmesi gerekir; örn. deposu dolu ürünler elenir)
  findNearestMarked(
    marked: Set<number>,
    claimed: Set<number>,
    px: number,
    py: number,
    accept?: (x: number, y: number) => boolean
  ): { x: number; y: number; dist: number } | null {
    const tx = Math.floor(px / TILE_SIZE);
    const ty = Math.floor(py / TILE_SIZE);
    let best: { x: number; y: number; dist: number } | null = null;
    for (const i of marked) {
      if (claimed.has(i)) continue;
      const x = i % this.width;
      const y = Math.floor(i / this.width);
      if (accept && !accept(x, y)) continue;
      const d = Math.abs(x - tx) + Math.abs(y - ty);
      if (!best || d < best.dist) best = { x, y, dist: d };
    }
    return best;
  }

  // Bir merkez etrafındaki karede (yarıçap r) verilen tipte blok say / en yakını bul
  countMarkedNear(marked: Set<number>, cx: number, cy: number, r: number): number {
    let n = 0;
    for (const i of marked) {
      const x = i % this.width;
      const y = Math.floor(i / this.width);
      if (Math.abs(x - cx) <= r && Math.abs(y - cy) <= r) n++;
    }
    return n;
  }

  findNearestTileOfType(
    type: Tile,
    cx: number,
    cy: number,
    r: number,
    exclude: Set<number>
  ): { x: number; y: number } | null {
    let best: { x: number; y: number } | null = null;
    let bestDist = Infinity;
    for (let y = Math.max(0, cy - r); y <= Math.min(this.height - 1, cy + r); y++) {
      for (let x = Math.max(0, cx - r); x <= Math.min(this.width - 1, cx + r); x++) {
        if (this.get(x, y) !== type || exclude.has(this.index(x, y))) continue;
        const d = Math.abs(x - cx) + Math.abs(y - cy);
        if (d < bestDist) {
          bestDist = d;
          best = { x, y };
        }
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
