import { fractalNoise, hash2 } from "./noise";
import { Tile, foodItemOf, isWalkable, TILE_SIZE } from "./tiles";

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
  // ormancının dikmek üzere sahiplendiği boş çimen blokları
  readonly claimedPlants = new Set<number>();

  // büyüyen fidanlar/filizler (target: olgunlaşınca dönüşeceği blok)
  private saplings: { x: number; y: number; t: number; target: Tile }[] = [];
  // budanmış ağaçlar: zamanla Tree'ye döner
  private prunedTrees: { x: number; y: number; t: number }[] = [];

  // Bina kaplayan bloklar: yürünemez
  readonly blocked = new Set<number>();

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
          if (f > 0.55 && hash2(x, y, seed + 13) > 0.65) {
            // orman kuşakları
            t = Tile.Tree;
          } else if (f > 0.55 && hash2(x, y, seed + 61) > 0.94) {
            // orman içlerinde seyrek mantarlar (yenileri binalardan uzakta biter)
            t = Tile.Mushroom;
          } else if (f > 0.46 && hash2(x, y, seed + 31) > 0.91) {
            // orman kenarlarında yemiş çalıları
            t = Tile.Bush;
          } else if (hash2(x, y, seed + 47) > 0.992) {
            // açık alanda tek tük çalı
            t = Tile.Bush;
          } else if (hash2(x, y, seed + 53) > 0.99) {
            // yerde çakıl kümeleri (Sert Cisimler ile toplanır)
            t = Tile.Pebbles;
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
    else if (foodItemOf(t)) toggle(this.markedBushes, this.claimedBushes);
    else if (t === Tile.Stone || t === Tile.Pebbles) toggle(this.markedStones, this.claimedStones);
  }

  markTree(x: number, y: number): void {
    if (this.get(x, y) === Tile.Tree) this.markedTrees.add(this.index(x, y));
  }

  // Çalı, mantar, meyve ağacı, yemiş: hepsi yemek toplama işaretine girer
  markFood(x: number, y: number): void {
    if (foodItemOf(this.get(x, y))) this.markedBushes.add(this.index(x, y));
  }

  markStone(x: number, y: number): void {
    const t = this.get(x, y);
    if (t === Tile.Stone || t === Tile.Pebbles) {
      this.markedStones.add(this.index(x, y));
    }
  }

  // Çakıl toplandı: zemin çimene döner (yenilenmez)
  harvestPebbles(x: number, y: number): void {
    const i = this.index(x, y);
    this.markedStones.delete(i);
    this.claimedStones.delete(i);
    this.set(x, y, Tile.Grass);
  }

  // Bloğun üzerindeki iş işaretini (varsa) kaldır; kaldırıldıysa true döner
  unmark(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false;
    const i = this.index(x, y);
    let removed = false;
    const drop = (marked: Set<number>, claimed: Set<number>) => {
      if (marked.delete(i)) {
        claimed.delete(i);
        removed = true;
      }
    };
    drop(this.markedTrees, this.claimedTrees);
    drop(this.markedBushes, this.claimedBushes);
    drop(this.markedStones, this.claimedStones);
    return removed;
  }

  // Fidan/filizler ve budanmış ağaçlar zamanla hedef bloğa dönüşür
  update(dt: number): void {
    for (let i = this.saplings.length - 1; i >= 0; i--) {
      const s = this.saplings[i];
      s.t -= dt;
      if (s.t <= 0) {
        this.saplings.splice(i, 1);
        if (this.get(s.x, s.y) === Tile.Sapling) this.set(s.x, s.y, s.target);
      }
    }
    // Budanmış ağaçlar yeniden büyür
    for (let i = this.prunedTrees.length - 1; i >= 0; i--) {
      const p = this.prunedTrees[i];
      p.t -= dt;
      if (p.t <= 0) {
        this.prunedTrees.splice(i, 1);
        if (this.get(p.x, p.y) === Tile.PrunedTree) this.set(p.x, p.y, Tile.Tree);
      }
    }
  }

  // Mantar türemesi için: rastgele bir budanmış ağaç konumu
  randomPrunedTree(): { x: number; y: number } | null {
    if (this.prunedTrees.length === 0) return null;
    const p = this.prunedTrees[Math.floor(Math.random() * this.prunedTrees.length)];
    return { x: p.x, y: p.y };
  }

  plantSapling(x: number, y: number, target: Tile): void {
    this.claimedPlants.delete(this.index(x, y));
    if (this.get(x, y) !== Tile.Grass || this.blocked.has(this.index(x, y))) return;
    this.set(x, y, Tile.Sapling);
    this.saplings.push({ x, y, t: target === Tile.Tree ? 90 : 70, target });
  }

  // Dikim için boş çimen blok bul (sahiplenilmemiş)
  findPlantSpot(
    cx: number,
    cy: number,
    r: number,
    fromX: number,
    fromY: number
  ): { x: number; y: number } | null {
    let best: { x: number; y: number } | null = null;
    let bestDist = Infinity;
    for (let y = Math.max(0, cy - r); y <= Math.min(this.height - 1, cy + r); y++) {
      for (let x = Math.max(0, cx - r); x <= Math.min(this.width - 1, cx + r); x++) {
        if (this.get(x, y) !== Tile.Grass) continue;
        const i = this.index(x, y);
        if (this.blocked.has(i) || this.claimedPlants.has(i)) continue;
        const d = Math.abs(x - fromX) + Math.abs(y - fromY);
        if (d < bestDist) {
          bestDist = d;
          best = { x, y };
        }
      }
    }
    return best;
  }

  // Çalışma alanındaki verilen tiplerin sayısı (doygunluk kontrolü)
  countTilesNear(types: Tile[], cx: number, cy: number, r: number): number {
    let n = 0;
    for (let y = Math.max(0, cy - r); y <= Math.min(this.height - 1, cy + r); y++) {
      for (let x = Math.max(0, cx - r); x <= Math.min(this.width - 1, cx + r); x++) {
        if (types.includes(this.get(x, y))) n++;
      }
    }
    return n;
  }

  // Dal toplama: ağaç budanır (PrunedTree), 3 oyun günü (450s) sonra yeniden büyür
  pruneTree(x: number, y: number): void {
    const i = this.index(x, y);
    this.markedTrees.delete(i);
    this.claimedTrees.delete(i);
    this.set(x, y, Tile.PrunedTree);
    this.prunedTrees.push({ x, y, t: 450 }); // 3 oyun günü = 3 × 150 sn
  }

  harvestFood(x: number, y: number): void {
    const i = this.index(x, y);
    this.markedBushes.delete(i);
    this.claimedBushes.delete(i);
    this.set(x, y, Tile.Grass);
  }

  // Baltayla kesim: ağaç tamamen devrilir, yeniden çıkmaz
  fellTree(x: number, y: number): void {
    const i = this.index(x, y);
    this.markedTrees.delete(i);
    this.claimedTrees.delete(i);
    this.set(x, y, Tile.Grass);
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

  // Ayak izinin çevresinde (çapraz dahil) su var mı? (balıkçı yerleşimi)
  hasAdjacentWater(tx: number, ty: number, size: number): boolean {
    for (let y = ty - 1; y <= ty + size; y++) {
      for (let x = tx - 1; x <= tx + size; x++) {
        if (this.inBounds(x, y) && this.get(x, y) === Tile.Water) return true;
      }
    }
    return false;
  }

  // Verilen merkeze yakın, su komşusu olan yürünebilir kıyı bloğu bul
  findShoreNear(
    cx: number,
    cy: number,
    r: number,
    fromX: number,
    fromY: number
  ): { x: number; y: number } | null {
    let best: { x: number; y: number } | null = null;
    let bestDist = Infinity;
    for (let y = Math.max(0, cy - r); y <= Math.min(this.height - 1, cy + r); y++) {
      for (let x = Math.max(0, cx - r); x <= Math.min(this.width - 1, cx + r); x++) {
        if (!this.walkableAt(x, y)) continue;
        const water =
          (this.inBounds(x + 1, y) && this.get(x + 1, y) === Tile.Water) ||
          (this.inBounds(x - 1, y) && this.get(x - 1, y) === Tile.Water) ||
          (this.inBounds(x, y + 1) && this.get(x, y + 1) === Tile.Water) ||
          (this.inBounds(x, y - 1) && this.get(x, y - 1) === Tile.Water);
        if (!water) continue;
        const d = Math.abs(x - fromX) + Math.abs(y - fromY);
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
