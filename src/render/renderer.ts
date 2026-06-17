import type { Camera } from "../engine/camera";
import { pastureBounds, type Animal } from "../sim/animals";
import { EAT_THRESHOLD, type Villager } from "../sim/villager";
import {
  AUTO_MARK_RADIUS,
  Building,
  BuildingType,
  isDepositPoint,
  LIGHT_RADIUS,
  TORCH_LIGHT_RADIUS,
} from "../sim/buildings";
import { isFull, ITEM_INFO, ITEM_TYPES, foodTotal } from "../sim/resources";
import { darkness, season } from "../sim/time";
import { floaters, particles, spearShots, FLOATER_TTL } from "./effects";
import { hash2 } from "../world/noise";
import { Tile, TILE_SIZE } from "../world/tiles";
import type { World } from "../world/world";

const SKIN = "#e8b88a";
const LINE = "#26221e";
const WOOD_DARK = "#6b4a2b";
const WOOD_MID = "#8a6a43";
const OUTLINE = "#3a2c1a";

// Su: sığdan derine doğru koyulaşan iki palet (alt kare başına karıştırılır)
const WATER_SHALLOW = ["#4383cc", "#477fc4", "#3f7abd"];
const WATER_DEEP = ["#1c4170", "#1e466f", "#193d66"];

// ---- Mevsime göre zemin paletleri (ilkbahar, yaz, sonbahar, kış) ----

const GRASS_BY_SEASON: string[][] = [
  ["#5a8f3c", "#558838", "#609541"], // ilkbahar: taze yeşil
  ["#549435", "#4e8c31", "#5c9c3c"], // yaz: canlı yeşil
  ["#7d8b3a", "#768434", "#849240"], // sonbahar: sararmış
  ["#e8edf2", "#dfe5ec", "#f2f5f9"], // kış: kar örtüsü
];

const DIRT_BY_SEASON: string[][] = [
  ["#8a6a43", "#84653f", "#907048"],
  ["#8a6a43", "#84653f", "#907048"],
  ["#8f6a3c", "#886438", "#967144"],
  ["#b3aea2", "#aaa498", "#bcb7ab"], // kırağılı toprak
];

const SAND_BY_SEASON: string[][] = [
  ["#d8c27a", "#d1bb74", "#dfc983"],
  ["#d8c27a", "#d1bb74", "#dfc983"],
  ["#d4bb72", "#ccb36b", "#dcc37c"],
  ["#e6e1cd", "#ded9c4", "#eee9d6"], // karla karışık kum
];

const STONE_BY_SEASON: string[][] = [
  ["#7c7f86", "#75787f", "#84878e"],
  ["#7c7f86", "#75787f", "#84878e"],
  ["#7c7f86", "#75787f", "#84878e"],
  ["#a6abb3", "#9da2aa", "#b2b7bf"], // karlı kayalar
];

// Ağaç tacı: koyudan açığa, ışık sol üstten gelir
const CANOPY_BY_SEASON: string[][] = [
  ["#27581d", "#2e6b22", "#3d8a2e", "#54a83d", "#6cbf4e"], // ilkbahar
  ["#24561a", "#2c6c20", "#3b8c2c", "#52aa3b", "#6ac24c"], // yaz
  ["#7a3c12", "#9c5a1e", "#bb7228", "#d98e3a", "#e8a84c"], // sonbahar: turuncu
  ["#2f5a3c", "#3a6a48", "#7fa395", "#d8e4ea", "#eef4f8"], // kış: karlı taç
];

const BUSH_BY_SEASON: string[][] = [
  ["#34701f", "#4a9438", "#56a843"],
  ["#316f1c", "#479236", "#54a641"],
  ["#7a4a1d", "#b06a28", "#c98438"], // sonbahar çalısı
  ["#5a7a6a", "#cfdce4", "#eef4f8"], // karlı çalı
];

// İki hex rengi karıştır (t: 0 -> a, 1 -> b)
function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
  const g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
  const bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
  return `rgb(${r},${g},${bl})`;
}

// Yerleştirme önizlemesi (hayalet bina)
export interface Ghost {
  type: BuildingType;
  tileX: number;
  tileY: number;
  size: number;
  valid: boolean;
}

export class Renderer {
  // Zemin bir kez offscreen canvas'a çizilir; sadece değişen bloklar yeniden boyanır
  private terrain: HTMLCanvasElement;
  private tctx: CanvasRenderingContext2D;
  // Gece karanlığı katmanı (ışık delikleri açılır)
  private night = document.createElement("canvas");
  // Harita dışını kaplayan açık deniz dokusu (desen ana context'ten üretilir)
  private seaTile = document.createElement("canvas");
  private sea: CanvasPattern | null = null;
  // Mini harita: blok başına 1 piksel, blok değişince güncellenir
  private minimap = document.createElement("canvas");
  private mctx: CanvasRenderingContext2D;
  private minimapRect = { x: 0, y: 0, w: 0, h: 0 };
  // Mevsim değişince zemin tamamen yeniden boyanır
  private lastSeason = season();

  constructor(private world: World) {
    this.terrain = document.createElement("canvas");
    this.terrain.width = world.width * TILE_SIZE;
    this.terrain.height = world.height * TILE_SIZE;
    this.tctx = this.terrain.getContext("2d")!;
    this.minimap.width = world.width;
    this.minimap.height = world.height;
    this.mctx = this.minimap.getContext("2d")!;
    for (let y = 0; y < world.height; y++) {
      for (let x = 0; x < world.width; x++) {
        this.paintTile(x, y);
      }
    }
    world.onTileChange = (x, y) => this.paintTile(x, y);

    // açık deniz deseni: derin su renkleriyle 4 bloğluk karo
    this.seaTile.width = 64;
    this.seaTile.height = 64;
    const sctx = this.seaTile.getContext("2d")!;
    for (let sy = 0; sy < 16; sy++) {
      for (let sx = 0; sx < 16; sx++) {
        const i = Math.floor(hash2(sx, sy, 4242) * WATER_DEEP.length);
        sctx.fillStyle = WATER_DEEP[i];
        sctx.fillRect(sx * 4, sy * 4, 4, 4);
      }
    }
  }

  // Tek bir bloğu offscreen zemine boya (4x4'lük alt karelerle pixel dokusu)
  // Kayıt yüklendiğinde tüm zemini ve mini haritayı yeniden boya
  repaintAll(): void {
    for (let y = 0; y < this.world.height; y++) {
      for (let x = 0; x < this.world.width; x++) {
        this.paintTile(x, y);
      }
    }
  }

  private paintTile(x: number, y: number): void {
    const t = this.world.get(x, y) as Tile;
    const px = x * TILE_SIZE;
    const py = y * TILE_SIZE;
    this.paintMinimapPixel(x, y, t);

    if (t === Tile.Water) {
      this.paintWater(px, py, x, y);
      return;
    }

    // mevsime göre zemin paleti
    const s = season();
    let colors: string[];
    switch (t) {
      case Tile.Sand: colors = SAND_BY_SEASON[s]; break;
      case Tile.Dirt: colors = DIRT_BY_SEASON[s]; break;
      case Tile.Stone: colors = STONE_BY_SEASON[s]; break;
      case Tile.Road: colors = ["#9a9690", "#928e88", "#a29e98"]; break; // döşeli taş
      default: colors = GRASS_BY_SEASON[s]; break; // çimen ve üstündekiler
    }
    const sub = 4;
    for (let sy = 0; sy < sub; sy++) {
      for (let sx = 0; sx < sub; sx++) {
        const shade = Math.floor(hash2(x * sub + sx, y * sub + sy, 42) * colors.length);
        this.tctx.fillStyle = colors[shade];
        this.tctx.fillRect(px + sx * 4, py + sy * 4, 4, 4);
      }
    }

    // çimen zeminlerde mevsim detayları: ot, ilkbaharda çiçek, kışta yok
    if ((t === Tile.Grass || t === Tile.Tree || t === Tile.Bush) && s !== 3) {
      for (let k = 0; k < 3; k++) {
        const v = hash2(x * 3 + k, y * 7 + k, 21);
        if (v > 0.55) continue;
        const gx = px + 1 + Math.floor(hash2(x + k, y, 22) * 14);
        const gy = py + 2 + Math.floor(hash2(x, y + k, 23) * 12);
        if (s === 0 && v < 0.12) {
          // ilkbahar çiçekleri
          this.tctx.fillStyle = v < 0.06 ? "#f0c8e0" : "#f5f0d8";
          this.tctx.fillRect(gx, gy, 2, 2);
        } else {
          this.tctx.fillStyle = s === 2 ? "#6e7530" : "#3f6e2b";
          this.tctx.fillRect(gx, gy, 1, 2);
        }
      }
    }

    this.paintRelief(px, py, x, y);

    if (t === Tile.Road) {
      // taş plaka derzleri
      this.tctx.fillStyle = "rgba(60, 58, 54, 0.45)";
      this.tctx.fillRect(px, py + 7, 16, 1);
      this.tctx.fillRect(px + (hash2(x, y, 91) > 0.5 ? 5 : 10), py, 1, 8);
      this.tctx.fillRect(px + (hash2(x, y, 92) > 0.5 ? 11 : 4), py + 8, 1, 8);
      this.tctx.fillStyle = "rgba(255,255,255,0.12)";
      this.tctx.fillRect(px + 2, py + 2, 3, 1);
      this.tctx.fillRect(px + 9, py + 10, 3, 1);
    }

    if (t === Tile.Tree) this.paintTree(px, py, x, y);
    else if (t === Tile.PrunedTree) this.paintPrunedTree(px, py);
    else if (t === Tile.Bush || t === Tile.NutBush) this.paintBush(px, py, x, y, t);
    else if (t === Tile.Mushroom) this.paintMushroom(px, py, x, y);
    else if (t === Tile.Sapling) this.paintSapling(px, py, x, y);
    else if (t === Tile.Pebbles) this.paintPebbles(px, py, x, y);
    else if (t === Tile.AppleTree || t === Tile.OrangeTree || t === Tile.TangerineTree) {
      this.paintTree(px, py, x, y);
      this.paintTreeFruit(px, py, x, y, t);
    }
  }

  // Meyve ağacı: taç üzerine renkli meyve noktaları
  private paintTreeFruit(px: number, py: number, x: number, y: number, t: Tile): void {
    const c = this.tctx;
    const color =
      t === Tile.AppleTree ? "#e03434" :
      t === Tile.OrangeTree ? "#ff8a1e" : "#ffb23c";
    const cx = px + 8;
    const cy = py + 6;
    for (let k = 0; k < 5; k++) {
      const dx = -3 + Math.floor(hash2(x * 7 + k, y, 121) * 7);
      const dy = -3 + Math.floor(hash2(x, y * 7 + k, 122) * 6);
      if (dx * dx + dy * dy > 16) continue;
      c.fillStyle = color;
      c.fillRect(cx + dx, cy + dy, 1.5, 1.5);
    }
  }

  private paintMinimapPixel(x: number, y: number, t: Tile): void {
    const s = season();
    let color: string;
    switch (t) {
      case Tile.Water:
        color = this.world.heightAt(x, y) < 0.2 ? "#1c4170" : "#2a5d9c";
        break;
      case Tile.Sand: color = SAND_BY_SEASON[s][0]; break;
      case Tile.Dirt: color = DIRT_BY_SEASON[s][0]; break;
      case Tile.Stone: color = STONE_BY_SEASON[s][0]; break;
      case Tile.Tree: color = CANOPY_BY_SEASON[s][1]; break;
      case Tile.PrunedTree: color = "#7a5a30"; break;
      case Tile.Sapling: color = "#6cbf4e"; break;
      case Tile.Pebbles: color = "#8e9296"; break;
      case Tile.Bush: color = BUSH_BY_SEASON[s][1]; break;
      case Tile.Road: color = "#9a9690"; break;
      default: color = GRASS_BY_SEASON[s][0]; break;
    }
    this.mctx.fillStyle = color;
    this.mctx.fillRect(x, y, 1, 1);
  }

  // Mini haritayı sağ alta çiz; tıklama dönüşümü için konumu saklar
  drawMinimap(
    ctx: CanvasRenderingContext2D,
    camera: Camera,
    villagers: Villager[],
    buildings: Building[],
    toolbarHeight: number
  ): void {
    const size = 128;
    const vw = ctx.canvas.width;
    const vh = ctx.canvas.height;
    const x = vw - size - 12;
    const y = vh - toolbarHeight - size - 12;
    this.minimapRect = { x, y, w: size, h: size };

    ctx.fillStyle = "rgba(10, 12, 16, 0.75)";
    ctx.fillRect(x - 3, y - 3, size + 6, size + 6);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.minimap, x, y, size, size);
    ctx.strokeStyle = "#5a5f68";
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 2.5, y - 2.5, size + 5, size + 5);

    const sx = size / this.world.width;
    const sy = size / this.world.height;

    // binalar (turuncu) ve köylüler (beyaz, bebekler pembe)
    for (const b of buildings) {
      ctx.fillStyle = b.done ? "#ffb84d" : "#c9a35a";
      ctx.fillRect(x + b.x * sx, y + b.y * sy, Math.max(2, b.size * sx), Math.max(2, b.size * sy));
    }
    for (const v of villagers) {
      if (v.state === "sleeping" && !v.groundSleep && v.home) continue; // içeride
      ctx.fillStyle = v.baby ? "#ffb0d0" : "#ffffff";
      ctx.fillRect(x + (v.x / TILE_SIZE) * sx - 0.5, y + (v.y / TILE_SIZE) * sy - 0.5, 1.5, 1.5);
    }

    // görüş alanı çerçevesi
    const viewW = (ctx.canvas.width / camera.zoom / TILE_SIZE) * sx;
    const viewH = (ctx.canvas.height / camera.zoom / TILE_SIZE) * sy;
    const viewX = x + (camera.x / TILE_SIZE) * sx - viewW / 2;
    const viewY = y + (camera.y / TILE_SIZE) * sy - viewH / 2;
    ctx.strokeStyle = "rgba(255,255,255,0.75)";
    ctx.strokeRect(
      Math.max(x, viewX) + 0.5,
      Math.max(y, viewY) + 0.5,
      Math.min(viewW, size) - 1,
      Math.min(viewH, size) - 1
    );
  }

  // Mini haritaya tıklandıysa hedef dünya koordinatını döndür
  minimapHit(sx: number, sy: number): { x: number; y: number } | null {
    const r = this.minimapRect;
    if (sx < r.x || sx > r.x + r.w || sy < r.y || sy > r.y + r.h) return null;
    return {
      x: ((sx - r.x) / r.w) * this.world.width * TILE_SIZE,
      y: ((sy - r.y) / r.h) * this.world.height * TILE_SIZE,
    };
  }

  // Fidan/filiz: toprak tümseği üstünde küçük yeşil sürgün
  private paintSapling(px: number, py: number, x: number, y: number): void {
    const c = this.tctx;
    const cx = px + 8 + Math.floor(hash2(x, y, 131) * 3) - 1;
    const cy = py + 10;
    c.fillStyle = "rgba(10,20,10,0.15)";
    c.fillRect(cx - 2, cy + 3, 5, 1);
    c.fillStyle = "#7a5a36";
    c.fillRect(cx - 2, cy + 2, 5, 2); // tümsek
    c.fillStyle = "#57391f";
    c.fillRect(cx, cy - 1, 1, 3); // ince gövde
    c.fillStyle = "#54a83d";
    c.fillRect(cx - 1, cy - 3, 3, 2); // yapraklar
    c.fillRect(cx, cy - 4, 1, 1);
    c.fillStyle = "#6cbf4e";
    c.fillRect(cx - 1, cy - 3, 1, 1);
  }

  private paintMushroom(px: number, py: number, x: number, y: number): void {
    const c = this.tctx;
    // 2-3 kırmızı şapkalı orman mantarı
    const n = 2 + (Math.floor(hash2(x, y, 88) * 2) | 0);
    for (let k = 0; k < n; k++) {
      const mx = px + 3 + Math.floor(hash2(x * 5 + k, y, 89) * 9);
      const my = py + 5 + Math.floor(hash2(x, y * 5 + k, 90) * 7);
      // gölge ve sap
      c.fillStyle = "rgba(10,20,10,0.2)";
      c.fillRect(mx - 1, my + 3, 4, 1);
      c.fillStyle = "#e8e0cc";
      c.fillRect(mx, my + 1, 2, 3);
      // şapka
      c.fillStyle = "#c43030";
      c.fillRect(mx - 1, my - 1, 4, 2);
      c.fillRect(mx, my - 2, 2, 1);
      // benek
      c.fillStyle = "#f0e8e0";
      c.fillRect(mx + Math.floor(hash2(x + k, y + k, 91) * 3) - 1, my - 1, 1, 1);
    }
  }

  // Kabartma gölgelendirme: ışık kuzeybatıdan gelir; yokuş yukarı bakan
  // yüzeyler aydınlanır, aşağı bakanlar kararır (Minecraft haritası stili)
  private paintRelief(px: number, py: number, x: number, y: number): void {
    const w = this.world;
    const h = w.heightAt(x, y);
    const d = (h - w.heightAt(x, y - 1) + (h - w.heightAt(x - 1, y))) * 4;
    if (Math.abs(d) < 0.03) return;
    this.tctx.fillStyle =
      d > 0
        ? `rgba(255, 240, 200, ${Math.min(0.14, d)})`
        : `rgba(15, 25, 55, ${Math.min(0.16, -d)})`;
    this.tctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
  }

  // Su: derinleştikçe koyulaşır, kıyılarda köpük çizgisi
  private paintWater(px: number, py: number, x: number, y: number): void {
    const w = this.world;
    const depth = Math.min(1, Math.max(0, (0.36 - w.heightAt(x, y)) / 0.13));
    const sub = 4;
    for (let sy = 0; sy < sub; sy++) {
      for (let sx = 0; sx < sub; sx++) {
        const i = Math.floor(hash2(x * sub + sx, y * sub + sy, 42) * WATER_SHALLOW.length);
        this.tctx.fillStyle = mix(WATER_SHALLOW[i], WATER_DEEP[i], depth);
        this.tctx.fillRect(px + sx * 4, py + sy * 4, 4, 4);
      }
    }
    // kıyı köpüğü: kara komşusu olan kenarlara açık çizgi
    this.tctx.fillStyle = "rgba(225, 240, 255, 0.4)";
    const land = (nx: number, ny: number) =>
      w.inBounds(nx, ny) && w.get(nx, ny) !== Tile.Water;
    if (land(x, y - 1)) this.tctx.fillRect(px, py, TILE_SIZE, 2);
    if (land(x, y + 1)) this.tctx.fillRect(px, py + TILE_SIZE - 2, TILE_SIZE, 2);
    if (land(x - 1, y)) this.tctx.fillRect(px, py, 2, TILE_SIZE);
    if (land(x + 1, y)) this.tctx.fillRect(px + TILE_SIZE - 2, py, 2, TILE_SIZE);
  }

  // Yerde çakıl kümesi: irili ufaklı gri taşlar
  private paintPebbles(px: number, py: number, x: number, y: number): void {
    const c = this.tctx;
    for (let k = 0; k < 5; k++) {
      const gx = px + 2 + Math.floor(hash2(x * 5 + k, y, 141) * 11);
      const gy = py + 3 + Math.floor(hash2(x, y * 5 + k, 142) * 10);
      const size = 1.5 + hash2(x + k, y + k, 143) * 1.5;
      c.fillStyle = "rgba(10,15,10,0.18)";
      c.fillRect(gx - 0.5, gy + size - 0.5, size + 1, 1);
      c.fillStyle = k % 2 ? "#9aa0a8" : "#84878e";
      c.fillRect(gx, gy, size, size);
      c.fillStyle = "#b8bdc4";
      c.fillRect(gx, gy, size * 0.5, size * 0.4);
    }
  }

  private paintPrunedTree(px: number, py: number): void {
    const c = this.tctx;
    // Kök gölgesi (küçük)
    c.fillStyle = "rgba(10, 20, 10, 0.14)";
    c.beginPath();
    c.ellipse(px + 9, py + 14, 3.5, 1.4, 0, 0, Math.PI * 2);
    c.fill();
    // Ana gövde
    c.fillStyle = "#6b4422";
    c.fillRect(px + 7, py + 6, 2, 9);
    c.fillStyle = "#57391f";
    c.fillRect(px + 8, py + 6, 1, 9);
    // Dal kalıntıları: sağa ve sola çıkan çıplak ince dallar
    c.fillStyle = "#7a5230";
    c.fillRect(px + 5, py + 7, 2, 1);  // sol dal
    c.fillRect(px + 9, py + 7, 2, 1);  // sağ dal
    c.fillRect(px + 4, py + 9, 3, 1);  // sol alt dal
    c.fillRect(px + 9, py + 10, 3, 1); // sağ alt dal
    c.fillRect(px + 6, py + 5, 1, 2);  // tepe dal
    // Dal uçları (küçük parlama)
    c.fillStyle = "#a07848";
    c.fillRect(px + 4, py + 8, 1, 1);
    c.fillRect(px + 11, py + 9, 1, 1);
    c.fillRect(px + 6, py + 4, 1, 1);
  }

  private paintTree(px: number, py: number, x: number, y: number): void {
    const c = this.tctx;
    const cx = px + 8;
    const cy = py + 6;
    // yere düşen gölge (ışık kuzeybatıdan: gölge güneydoğuya)
    c.fillStyle = "rgba(10, 20, 10, 0.22)";
    c.beginPath();
    c.ellipse(cx + 1.5, py + 13, 5.5, 2.2, 0, 0, Math.PI * 2);
    c.fill();
    // gövde
    c.fillStyle = WOOD_DARK;
    c.fillRect(px + 7, py + 9, 2, 6);
    c.fillStyle = "#57391f";
    c.fillRect(px + 8, py + 9, 1, 6); // gövdenin gölgeli yarısı
    // yapraklar: yönlü ışıkla taç (sol üst açık, sağ alt koyu), mevsim renkli
    const canopy = CANOPY_BY_SEASON[season()];
    for (let dy = -5; dy <= 5; dy++) {
      for (let dx = -5; dx <= 5; dx++) {
        if (dx * dx + dy * dy > 22) continue;
        const v = hash2(x * 16 + dx, y * 16 + dy, 99);
        const light = 0.55 - (dx + dy) * 0.07 + (v - 0.5) * 0.55;
        const idx = Math.min(canopy.length - 1, Math.max(0, Math.floor(light * canopy.length)));
        c.fillStyle = canopy[idx];
        c.fillRect(cx + dx, cy + dy, 1, 1);
      }
    }
  }

  private paintBush(px: number, py: number, x: number, y: number, t: Tile = Tile.Bush): void {
    const c = this.tctx;
    const cx = px + 8;
    const cy = py + 10;
    // küçük gölge
    c.fillStyle = "rgba(10, 20, 10, 0.18)";
    c.beginPath();
    c.ellipse(cx + 1, cy + 3, 4.5, 1.6, 0, 0, Math.PI * 2);
    c.fill();
    // alçak yuvarlak çalı: üstü açık, altı koyu + kırmızı meyveler (mevsim renkli)
    const bushPal = BUSH_BY_SEASON[season()];
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        if (dx * dx + dy * dy * 2 > 16) continue;
        const v = hash2(x * 16 + dx, y * 16 + dy, 77);
        const light = 0.5 - (dx + dy) * 0.09 + (v - 0.5) * 0.5;
        c.fillStyle = light > 0.6 ? bushPal[2] : light > 0.3 ? bushPal[1] : bushPal[0];
        c.fillRect(cx + dx, cy + dy, 1, 1);
      }
    }
    // meyveler: çalıda kırmızı, yemiş çalısında kahverengi
    c.fillStyle = t === Tile.NutBush ? "#9a6c40" : "#d43f3f";
    for (let k = 0; k < 4; k++) {
      const bx = cx - 3 + Math.floor(hash2(x, y * 4 + k, 55) * 6);
      const by = cy - 2 + Math.floor(hash2(x * 4 + k, y, 66) * 4);
      c.fillRect(bx, by, 1, 1);
    }
    // meyvelerde parlama
    c.fillStyle = "rgba(255,255,255,0.5)";
    const hx = cx - 3 + Math.floor(hash2(x, y, 58) * 6);
    c.fillRect(hx, cy - 2, 1, 1);
  }

  render(
    ctx: CanvasRenderingContext2D,
    camera: Camera,
    villagers: Villager[],
    buildings: Building[],
    animals: Animal[],
    hoverTile: { x: number; y: number } | null,
    ghost: Ghost | null,
    selectedVillager: Villager | null,
    selectedBuilding: Building | null,
    selectionRect: { x0: number; y0: number; x1: number; y1: number } | null,
    time: number
  ): void {
    // mevsim değiştiyse zemini yeni paletle baştan boya
    if (season() !== this.lastSeason) {
      this.lastSeason = season();
      for (let y = 0; y < this.world.height; y++) {
        for (let x = 0; x < this.world.width; x++) {
          this.paintTile(x, y);
        }
      }
    }

    const vw = ctx.canvas.width;
    const vh = ctx.canvas.height;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#0b0e12";
    ctx.fillRect(0, 0, vw, vh);

    ctx.setTransform(
      camera.zoom, 0, 0, camera.zoom,
      vw / 2 - camera.x * camera.zoom,
      vh / 2 - camera.y * camera.zoom
    );

    // harita dışı: uçsuz bucaksız deniz (kenar suları derinleşerek buna karışır)
    if (!this.sea) this.sea = ctx.createPattern(this.seaTile, "repeat");
    if (this.sea) {
      const viewL = camera.x - vw / 2 / camera.zoom;
      const viewT = camera.y - vh / 2 / camera.zoom;
      ctx.fillStyle = this.sea;
      ctx.fillRect(viewL - 64, viewT - 64, vw / camera.zoom + 128, vh / camera.zoom + 128);
    }

    ctx.drawImage(this.terrain, 0, 0);

    // Su parıltısı: görünür su bloklarında (açık deniz dahil) küçük ışıltılar
    const halfW = vw / 2 / camera.zoom;
    const halfH = vh / 2 / camera.zoom;
    const x0 = Math.floor((camera.x - halfW) / TILE_SIZE);
    const x1 = Math.ceil((camera.x + halfW) / TILE_SIZE);
    const y0 = Math.floor((camera.y - halfH) / TILE_SIZE);
    const y1 = Math.ceil((camera.y + halfH) / TILE_SIZE);
    const phase = Math.floor(time * 1.6);
    ctx.fillStyle = "rgba(235, 248, 255, 0.25)";
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const isWater =
          !this.world.inBounds(tx, ty) || this.world.get(tx, ty) === Tile.Water;
        if (!isWater) continue;
        const v = hash2(tx * 7 + ty * 13, phase, 5);
        if (v < 0.88) continue;
        const ox = Math.floor(hash2(tx, ty + phase, 6) * 13);
        const oy = Math.floor(hash2(tx + phase, ty, 7) * 14);
        ctx.fillRect(tx * TILE_SIZE + ox, ty * TILE_SIZE + oy, 2, 1);
      }
    }

    // İşaretli bloklar: yanıp sönen çerçeveler (ağaç sarı, yemek turuncu, taş mavi)
    const pulse = 0.45 + 0.3 * Math.sin(time * 5);
    ctx.lineWidth = 1;
    this.strokeMarked(ctx, this.world.markedTrees, `rgba(255, 210, 60, ${pulse})`);
    this.strokeMarked(ctx, this.world.markedBushes, `rgba(255, 130, 60, ${pulse})`);
    this.strokeMarked(ctx, this.world.markedStones, `rgba(110, 200, 255, ${pulse})`);

    // İmleç altındaki toplanabilir bloğa beyaz çerçeve (bina yerleştirilmiyorken)
    if (!ghost && hoverTile) {
      const t = this.world.get(hoverTile.x, hoverTile.y);
      if (
        t === Tile.Tree || t === Tile.Bush || t === Tile.Mushroom ||
        t === Tile.Stone || t === Tile.Pebbles
      ) {
        ctx.strokeStyle = "rgba(255,255,255,0.8)";
        ctx.strokeRect(
          hoverTile.x * TILE_SIZE + 0.5,
          hoverTile.y * TILE_SIZE + 0.5,
          TILE_SIZE - 1,
          TILE_SIZE - 1
        );
      }
    }

    // Seçili binanın etrafında yanıp sönen çerçeve
    if (selectedBuilding) {
      const bPulse = 0.5 + 0.35 * Math.sin(time * 6);
      ctx.strokeStyle = `rgba(255, 255, 255, ${bPulse})`;
      ctx.lineWidth = 1;
      const s = selectedBuilding.size * TILE_SIZE;
      ctx.strokeRect(
        selectedBuilding.x * TILE_SIZE - 1.5,
        selectedBuilding.y * TILE_SIZE - 1.5,
        s + 3, s + 3
      );
    }

    // Seçili köylünün ayaklarının altında yanıp sönen halka
    if (selectedVillager) {
      const ringPulse = 0.6 + 0.3 * Math.sin(time * 6);
      ctx.strokeStyle = `rgba(255, 255, 255, ${ringPulse})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(selectedVillager.x, selectedVillager.y + 0.5, 4.5, 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Çiftlik padokları: çit ve trampled zemin sprite'ların altına çizilir
    for (const b of buildings) {
      if (b.type === BuildingType.Barn && b.done) this.drawPastureFence(ctx, b);
    }

    // Binalar ve köylüler: taban çizgisine (y) göre sırala ki önde olan üstte çizilsin
    type Drawable = { baseY: number; draw: () => void };
    const drawables: Drawable[] = [];
    for (const b of buildings) {
      drawables.push({
        baseY: (b.y + b.size) * TILE_SIZE,
        draw: () => this.drawBuilding(ctx, b, time),
      });
    }
    for (const v of villagers) {
      // evinde uyuyan köylü içeridedir: çizilmez (evin üstünde z çıkar)
      if (v.state === "sleeping" && !v.groundSleep && v.home) continue;
      drawables.push({ baseY: v.y, draw: () => this.drawVillager(ctx, v, time) });
    }
    for (const a of animals) {
      drawables.push({ baseY: a.y, draw: () => this.drawAnimal(ctx, a) });
    }
    drawables.sort((a, b) => a.baseY - b.baseY);
    for (const d of drawables) d.draw();

    // Depo dolu uyarısı: dolu ürün varsa teslimat binalarının üstünde sallanan "!"
    const fullItems = ITEM_TYPES.filter((i) => isFull(i));
    if (fullItems.length > 0) {
      const bob = Math.sin(time * 4) * 1.5;
      for (const b of buildings) {
        if (!isDepositPoint(b)) continue;
        const wx = b.centerX;
        const wy = b.y * TILE_SIZE - 8 + bob;
        ctx.fillStyle = "#ffd23c";
        ctx.fillRect(wx - 3, wy - 4, 6, 8);
        ctx.strokeStyle = "#3a2c1a";
        ctx.lineWidth = 0.6;
        ctx.strokeRect(wx - 3, wy - 4, 6, 8);
        ctx.fillStyle = "#3a2c1a";
        ctx.fillRect(wx - 0.6, wy - 2.5, 1.2, 3.5);
        ctx.fillRect(wx - 0.6, wy + 2, 1.2, 1.2);
        // hangi ürünler dolu: küçük renk kareleri
        const total = fullItems.length * 4 - 1;
        fullItems.forEach((item, k) => {
          ctx.fillStyle = ITEM_INFO[item].color;
          ctx.fillRect(wx - total / 2 + k * 4, wy + 6, 3, 3);
        });
      }
    }

    // İçinde uyuyan olan evlerin çatısında "z" animasyonu
    {
      const sleepingHomes = new Set<Building>();
      for (const v of villagers) {
        if (v.state === "sleeping" && !v.groundSleep && v.home) sleepingHomes.add(v.home);
      }
      ctx.font = "bold 5px monospace";
      ctx.fillStyle = "#cfe0f0";
      for (const b of sleepingHomes) {
        const zt = (time % 2) / 2;
        ctx.globalAlpha = 1 - zt;
        ctx.fillText("z", b.centerX + 6, b.y * TILE_SIZE - 1 - zt * 4);
        ctx.font = "bold 4px monospace";
        ctx.fillText("z", b.centerX + 10, b.y * TILE_SIZE - 4 - zt * 4);
        ctx.font = "bold 5px monospace";
      }
      ctx.globalAlpha = 1;
    }

    // Kaynağı biten üretim kulübeleri: turuncu "!" uyarısı
    {
      const bob2 = Math.sin(time * 4 + 1.5) * 1.5;
      for (const b of buildings) {
        if (!b.done || !b.outOfResources) continue;
        const wx = b.centerX;
        const wy = b.y * TILE_SIZE - 8 + bob2;
        ctx.fillStyle = "#f08a24";
        ctx.fillRect(wx - 3, wy - 4, 6, 8);
        ctx.strokeStyle = "#3a2c1a";
        ctx.lineWidth = 0.6;
        ctx.strokeRect(wx - 3, wy - 4, 6, 8);
        ctx.fillStyle = "#3a2c1a";
        ctx.fillRect(wx - 0.6, wy - 2.5, 1.2, 3.5);
        ctx.fillRect(wx - 0.6, wy + 2, 1.2, 1.2);
      }
    }

    // parçacıklar (talaş, taş kırıntısı) ve uçan kazanç yazıları
    // uçan mızraklar
    for (const sp of spearShots) {
      ctx.save();
      ctx.translate(sp.x, sp.y);
      ctx.rotate(sp.angle);
      ctx.strokeStyle = "#d4c49a";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-4, 0);
      ctx.lineTo(3, 0);
      ctx.stroke();
      ctx.fillStyle = "#9aa0a8";
      ctx.beginPath();
      ctx.moveTo(3, 0);
      ctx.lineTo(5.2, -0.9);
      ctx.lineTo(5.2, 0.9);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    for (const p of particles) {
      ctx.globalAlpha = Math.min(1, p.ttl * 2.5);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, 1.2, 1.2);
    }
    ctx.globalAlpha = 1;
    ctx.font = "bold 5px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    for (const f of floaters) {
      const a = Math.min(1, f.ttl / (FLOATER_TTL * 0.5));
      ctx.globalAlpha = a;
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillText(f.text, f.x + 0.5, f.y + 0.5);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = "left";

    // Alan seçimi karesi (blok ızgarasına oturur)
    if (selectionRect) {
      const tx0 = Math.floor(Math.min(selectionRect.x0, selectionRect.x1) / TILE_SIZE) * TILE_SIZE;
      const ty0 = Math.floor(Math.min(selectionRect.y0, selectionRect.y1) / TILE_SIZE) * TILE_SIZE;
      const tx1 = (Math.floor(Math.max(selectionRect.x0, selectionRect.x1) / TILE_SIZE) + 1) * TILE_SIZE;
      const ty1 = (Math.floor(Math.max(selectionRect.y0, selectionRect.y1) / TILE_SIZE) + 1) * TILE_SIZE;
      ctx.fillStyle = "rgba(140, 220, 160, 0.15)";
      ctx.fillRect(tx0, ty0, tx1 - tx0, ty1 - ty0);
      ctx.strokeStyle = "rgba(160, 240, 180, 0.9)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(tx0 + 0.5, ty0 + 0.5, tx1 - tx0 - 1, ty1 - ty0 - 1);
      ctx.setLineDash([]);
    }

    // Hayalet bina (yerleştirme önizlemesi)
    if (ghost) {
      const gx = ghost.tileX * TILE_SIZE;
      const gy = ghost.tileY * TILE_SIZE;
      const s = ghost.size * TILE_SIZE;
      ctx.fillStyle = ghost.valid ? "rgba(80, 220, 100, 0.3)" : "rgba(230, 60, 60, 0.35)";
      ctx.fillRect(gx, gy, s, s);
      ctx.strokeStyle = ghost.valid ? "rgba(80, 220, 100, 0.9)" : "rgba(230, 60, 60, 0.9)";
      ctx.strokeRect(gx + 0.5, gy + 0.5, s - 1, s - 1);
      // meşale hayaletinde ışık, üretim kulübelerinde çalışma alanı önizlemesi
      const lr = LIGHT_RADIUS[ghost.type];
      const isWorkHut =
        ghost.type === BuildingType.Woodcutter ||
        ghost.type === BuildingType.Gatherer ||
        ghost.type === BuildingType.Fisher;
      const pr = lr ?? (isWorkHut ? AUTO_MARK_RADIUS * TILE_SIZE : 0);
      if (pr) {
        ctx.strokeStyle = lr ? "rgba(255, 200, 80, 0.5)" : "rgba(110, 220, 200, 0.5)";
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(gx + s / 2, gy + s / 2, pr, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Mevsim atmosferi: sonbaharda sıcak ton, kışta hafif soğuk ton + kar
    // (zemin zaten mevsim paletiyle boyanır; tonlar inceltildi)
    const s = season();
    if (s === 2) {
      ctx.fillStyle = "rgba(220, 140, 50, 0.04)";
      ctx.fillRect(0, 0, vw, vh);
    } else if (s === 3) {
      ctx.fillStyle = "rgba(190, 215, 250, 0.06)";
      ctx.fillRect(0, 0, vw, vh);
      // süzülen kar taneleri (ekran uzayında, deterministik)
      ctx.fillStyle = "rgba(245, 250, 255, 0.75)";
      for (let i = 0; i < 70; i++) {
        const speed = 26 + hash2(i, 1, 11) * 30;
        const drift = Math.sin(time * 1.2 + i) * 18;
        const fx = (hash2(i, 2, 12) * vw + drift + time * 9 + 4096) % vw;
        const fy = (hash2(i, 3, 13) * vh + time * speed) % vh;
        const fs = 1 + hash2(i, 4, 14) * 1.6;
        ctx.fillRect(fx, fy, fs, fs);
      }
    }

    // Gece karanlığı: ışık kaynaklarının etrafında delikler açılır
    const dark = darkness();
    if (dark > 0.01) {
      if (this.night.width !== vw || this.night.height !== vh) {
        this.night.width = vw;
        this.night.height = vh;
      }
      const nctx = this.night.getContext("2d")!;
      nctx.globalCompositeOperation = "source-over";
      nctx.clearRect(0, 0, vw, vh);
      nctx.fillStyle = `rgba(8, 11, 34, ${0.66 * dark})`;
      nctx.fillRect(0, 0, vw, vh);
      nctx.globalCompositeOperation = "destination-out";
      let li = 0;
      for (const b of buildings) {
        if (!b.done) continue;
        const r = b.hasTorch ? TORCH_LIGHT_RADIUS : LIGHT_RADIUS[b.type];
        if (!r) continue;
        const sx = (b.centerX - camera.x) * camera.zoom + vw / 2;
        const sy = (b.centerY - camera.y) * camera.zoom + vh / 2;
        const flicker = 1 + 0.05 * Math.sin(time * 9 + li * 1.7);
        const sr = r * camera.zoom * flicker;
        li++;
        if (sx < -sr || sx > vw + sr || sy < -sr || sy > vh + sr) continue;
        const g = nctx.createRadialGradient(sx, sy, sr * 0.2, sx, sy, sr);
        g.addColorStop(0, "rgba(0,0,0,0.95)");
        g.addColorStop(0.7, "rgba(0,0,0,0.7)");
        g.addColorStop(1, "rgba(0,0,0,0)");
        nctx.fillStyle = g;
        nctx.beginPath();
        nctx.arc(sx, sy, sr, 0, Math.PI * 2);
        nctx.fill();
      }
      nctx.globalCompositeOperation = "source-over";
      ctx.drawImage(this.night, 0, 0);
    }
  }

  private strokeMarked(
    ctx: CanvasRenderingContext2D,
    marked: Set<number>,
    style: string
  ): void {
    ctx.strokeStyle = style;
    for (const i of marked) {
      const x = i % this.world.width;
      const y = Math.floor(i / this.world.width);
      ctx.strokeRect(x * TILE_SIZE + 0.5, y * TILE_SIZE + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
    }
  }

  // ---- Binalar (2x2 blok = 32x32 piksel sprite) ----

  private drawBuilding(ctx: CanvasRenderingContext2D, b: Building, time: number): void {
    const px = b.x * TILE_SIZE;
    const py = b.y * TILE_SIZE;
    if (!b.done) {
      if (b.size === 1) this.drawSmallSite(ctx, px, py, b.progress / b.def.buildTime);
      else this.drawSite(ctx, px, py, b.progress / b.def.buildTime);
      return;
    }
    if (b.hasTorch) {
      // sağ üst köşeye asılı meşale
      this.drawAttachedTorch(ctx, px + b.size * TILE_SIZE - 4, py + 6, time);
    }
    switch (b.type) {
      case BuildingType.House: this.drawHouse(ctx, px, py); break;
      case BuildingType.Depot: this.drawDepot(ctx, px, py); break;
      case BuildingType.Woodcutter: this.drawWoodcutter(ctx, px, py); break;
      case BuildingType.Gatherer: this.drawGatherer(ctx, px, py); break;
      case BuildingType.Camp: this.drawCamp(ctx, px, py); break;
      case BuildingType.Torch: this.drawTorch(ctx, px, py, time); break;
      case BuildingType.Temple: this.drawTemple(ctx, px, py); break;
      case BuildingType.Cafeteria: this.drawCafeteria(ctx, px, py); break;
      case BuildingType.Nursery: this.drawNursery(ctx, px, py); break;
      case BuildingType.Fisher: this.drawFisher(ctx, px, py); break;
      case BuildingType.Barn: this.drawBarn(ctx, px, py); break;
      case BuildingType.ToolWorkshop: this.drawToolWorkshop(ctx, px, py); break;
      case BuildingType.HunterLodge: this.drawHunterLodge(ctx, px, py); break;
      case BuildingType.Splitter: this.drawSplitter(ctx, px, py); break;
    }
  }

  // Çitle çevrili padok: trampled zemin + ahşap kazık-korkuluk çit
  private drawPastureFence(ctx: CanvasRenderingContext2D, b: Building): void {
    const pen = pastureBounds(b);
    const x0 = pen.x0 * TILE_SIZE;
    const y0 = pen.y0 * TILE_SIZE;
    const x1 = (pen.x1 + 1) * TILE_SIZE;
    const y1 = (pen.y1 + 1) * TILE_SIZE;
    const w = x1 - x0;
    const h = y1 - y0;

    // çiğnenmiş otlak: hafif toprak tonu
    ctx.fillStyle = "rgba(120, 104, 74, 0.22)";
    ctx.fillRect(x0, y0, w, h);

    // çit: köşelerden başlayarak kazıklar + iki yatay korkuluk
    const POST = 16; // kazık aralığı (piksel)
    const railTop = "#7a5733";
    const post = "#5e3f22";
    ctx.fillStyle = railTop;
    // üst ve alt korkuluk
    for (const ry of [y0, y1 - 2]) {
      ctx.fillRect(x0, ry, w, 2);
      ctx.fillRect(x0, ry - 2.5, w, 1.4);
    }
    // sol ve sağ korkuluk
    for (const rx of [x0, x1 - 2]) {
      ctx.fillRect(rx, y0, 2, h);
      ctx.fillRect(rx - 2.5, y0, 1.4, h);
    }
    // kazıklar (perimetre boyunca)
    ctx.fillStyle = post;
    for (let xx = x0; xx <= x1; xx += POST) {
      ctx.fillRect(xx - 1, y0 - 3, 2.4, 6);
      ctx.fillRect(xx - 1, y1 - 3, 2.4, 6);
    }
    for (let yy = y0; yy <= y1; yy += POST) {
      ctx.fillRect(x0 - 1, yy - 3, 2.4, 6);
      ctx.fillRect(x1 - 1, yy - 3, 2.4, 6);
    }
  }

  private drawBarn(ctx: CanvasRenderingContext2D, px: number, py: number): void {
    this.baseShadow(ctx, px + 16, py + 29, 15);
    ctx.fillStyle = "#6b4a2b";
    ctx.fillRect(px + 3, py + 10, 2.2, 12);
    ctx.fillRect(px + 14, py + 10, 2.2, 12);
    this.paintThatch(ctx, px + 1, py + 5, 17, 6);
    ctx.fillStyle = "#d8b84a";
    ctx.beginPath();
    ctx.ellipse(px + 9, py + 20, 4.6, 3.2, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(px + 4.4, py + 20, 9.2, 2);
    ctx.fillStyle = "#b89a38";
    ctx.fillRect(px + 5.4, py + 19, 7, 1);
    ctx.fillStyle = "#6b4a2b";
    for (const fx of [20, 25, 30] as const) ctx.fillRect(px + fx, py + 14, 1.8, 14);
    ctx.fillStyle = "#8a6a43";
    for (const fy of [17, 22] as const) ctx.fillRect(px + 20, py + fy, 11.4, 1.6);
    ctx.fillStyle = "#6b4a2b";
    ctx.fillRect(px + 4, py + 25.5, 14, 1.6);
    for (const fx2 of [4, 10, 16] as const) ctx.fillRect(px + fx2, py + 23.6, 1.8, 5.4);
  }

  // ---- Çiftlik hayvanları ----

  private drawAnimal(ctx: CanvasRenderingContext2D, a: Animal): void {
    // ısırık hamlesi: gövde ava doğru atılır
    const lunge = a.lungeT > 0 ? (a.lungeT / 0.22) * 3.5 : 0;
    const x = a.x + a.facing * lunge;
    const y = a.y;
    const bob = Math.sin(a.walkPhase) * 0.6;
    const f = a.facing;

    // gölge
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.beginPath();
    ctx.ellipse(x, y + 0.5, 3.5, 1.2, 0, 0, Math.PI * 2);
    ctx.fill();

    const headDrop = a.grazing ? 2.2 : 0; // otlarken kafa yere eğilir

    // yavru hayvan: gövdeyi küçült (büyüdükçe normal boya döner)
    const baby = !a.adult;
    if (baby) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(0.6, 0.6);
      ctx.translate(-x, -y);
    }

    switch (a.type) {
      case "chicken": {
        ctx.fillStyle = "#f0ead8";
        ctx.fillRect(x - 2, y - 4 + bob, 4, 3);
        ctx.fillRect(x + f * 2 - 0.5, y - 5.5 + bob + headDrop, 2, 2); // kafa
        ctx.fillStyle = "#d43f3f";
        ctx.fillRect(x + f * 2, y - 6.3 + bob + headDrop, 1, 1); // ibik
        ctx.fillStyle = "#f0a030";
        ctx.fillRect(x + f * 3.2, y - 4.8 + bob + headDrop, 1, 0.8); // gaga
        ctx.fillStyle = "#c09040";
        ctx.fillRect(x - 1, y - 1, 0.8, 1);
        ctx.fillRect(x + 0.5, y - 1, 0.8, 1);
        break;
      }
      case "cow": {
        ctx.fillStyle = "#ece8dc";
        ctx.fillRect(x - 4, y - 6 + bob, 8, 4);
        ctx.fillStyle = "#2a2622";
        ctx.fillRect(x - 3, y - 5.5 + bob, 2.5, 2);
        ctx.fillRect(x + 1, y - 4 + bob, 2, 1.5);
        ctx.fillStyle = "#ece8dc";
        ctx.fillRect(x + f * 4 - 1, y - 7 + bob + headDrop, 3, 3); // kafa
        ctx.fillStyle = "#d8a8b8";
        ctx.fillRect(x + f * 4, y - 5 + bob + headDrop, 2, 1); // burun
        ctx.fillStyle = "#2a2622";
        ctx.fillRect(x - 3, y - 2, 1, 2);
        ctx.fillRect(x + 2, y - 2, 1, 2);
        break;
      }
      case "pig": {
        ctx.fillStyle = "#e8a0a8";
        ctx.fillRect(x - 3, y - 5 + bob, 6, 3.5);
        ctx.fillRect(x + f * 3 - 1, y - 5.5 + bob + headDrop, 2.5, 2.5); // kafa
        ctx.fillStyle = "#d4848e";
        ctx.fillRect(x + f * 4, y - 4.5 + bob + headDrop, 1.2, 1.2); // burun
        ctx.fillStyle = "#c87880";
        ctx.fillRect(x - 2, y - 1.5, 1, 1.5);
        ctx.fillRect(x + 1.5, y - 1.5, 1, 1.5);
        break;
      }
      case "sheep": {
        // yünlü gövde: kabarık
        ctx.fillStyle = "#ece8d8";
        ctx.fillRect(x - 3.5, y - 5.5 + bob, 7, 4);
        ctx.fillRect(x - 2.5, y - 6.3 + bob, 5, 1);
        ctx.fillStyle = "#5a5048";
        ctx.fillRect(x + f * 3.5 - 1, y - 5 + bob + headDrop, 2.5, 2.5); // koyu kafa
        ctx.fillRect(x - 2, y - 1.5, 1, 1.5);
        ctx.fillRect(x + 1.5, y - 1.5, 1, 1.5);
        break;
      }
      case "goat": {
        ctx.fillStyle = "#b8a890";
        ctx.fillRect(x - 3, y - 5 + bob, 6, 3.5);
        ctx.fillRect(x + f * 3 - 1, y - 6 + bob + headDrop, 2.5, 3); // kafa
        ctx.fillStyle = "#7a6a55";
        ctx.fillRect(x + f * 3.5, y - 7 + bob + headDrop, 1, 1.2); // boynuz
        ctx.fillRect(x + f * 3 - 0.5, y - 3 + bob + headDrop, 1, 1.3); // sakal
        ctx.fillRect(x - 2, y - 1.5, 1, 1.5);
        ctx.fillRect(x + 1.5, y - 1.5, 1, 1.5);
        break;
      }
      case "bird": {
        // küçük yer kuşu: tombul gövde + gaga + kanat çizgisi
        ctx.fillStyle = "#8a7a64";
        ctx.beginPath();
        ctx.ellipse(x, y - 2.6 + bob, 2.6, 1.9, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#6e5f4c";
        ctx.fillRect(x - 1.6, y - 3.2 + bob, 2.6, 1); // kanat
        ctx.fillStyle = "#8a7a64";
        ctx.fillRect(x + f * 2.2 - 0.8, y - 4.6 + bob + headDrop, 1.8, 1.8); // kafa
        ctx.fillStyle = "#e0a030";
        ctx.fillRect(x + f * 3.2, y - 4 + bob + headDrop, 1.1, 0.8); // gaga
        ctx.fillStyle = "#2a2622";
        ctx.fillRect(x + f * 2.4, y - 4.2 + bob + headDrop, 0.6, 0.6); // göz
        ctx.fillStyle = "#e0a030";
        ctx.fillRect(x - 0.6, y - 0.8, 0.7, 1); // bacaklar
        ctx.fillRect(x + 0.4, y - 0.8, 0.7, 1);
        break;
      }
      case "dog": {
        // evcil köpek: kahverengi, kıvrık kuyruk, dik kulak
        ctx.fillStyle = "#b08050";
        ctx.fillRect(x - 3.2, y - 4.6 + bob, 6.4, 3);
        ctx.fillRect(x + f * 3.2 - 1, y - 5.4 + bob + headDrop, 2.6, 2.4); // kafa
        ctx.fillRect(x + f * 3.1, y - 6.4 + bob + headDrop, 0.9, 1.2); // kulak
        // kıvrık kuyruk
        ctx.strokeStyle = "#b08050";
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.arc(x - f * 3.6, y - 5 + bob, 1.6, 0, Math.PI * 1.2);
        ctx.stroke();
        ctx.fillStyle = "#8a6038";
        ctx.fillRect(x - 2.6, y - 1.8, 1, 1.8);
        ctx.fillRect(x + 1.6, y - 1.8, 1, 1.8);
        ctx.fillStyle = "#2a2622";
        ctx.fillRect(x + f * 4.6, y - 4.4 + bob + headDrop, 0.9, 0.9); // burun
        // tasma (evcil işareti)
        ctx.fillStyle = "#c0473f";
        ctx.fillRect(x + f * 2 - 0.6, y - 3.2 + bob, 1.6, 0.8);
        break;
      }
      case "deer": {
        ctx.fillStyle = "#a8713c";
        ctx.fillRect(x - 3.5, y - 7 + bob, 7, 4);
        ctx.fillRect(x + f * 3.5 - 1, y - 9 + bob + headDrop, 2.5, 3); // kafa (yüksek boyun)
        ctx.fillStyle = "#7a5026";
        // çatallı boynuz
        ctx.fillRect(x + f * 3.2, y - 11 + bob + headDrop, 0.8, 2.2);
        ctx.fillRect(x + f * 4.2, y - 10.6 + bob + headDrop, 0.8, 1.8);
        ctx.fillRect(x + f * 2.6, y - 10.3 + bob + headDrop, 1.8, 0.7);
        ctx.fillRect(x - 3, y - 3, 1, 3);
        ctx.fillRect(x + 2, y - 3, 1, 3);
        ctx.fillStyle = "#e8dcc8";
        ctx.fillRect(x - f * 3.8, y - 6 + bob, 1.2, 1.5); // kuyruk
        break;
      }
      case "boar": {
        ctx.fillStyle = "#5a4a3c";
        ctx.fillRect(x - 3.5, y - 5 + bob, 7, 4);
        ctx.fillRect(x + f * 3.5 - 1, y - 5.5 + bob + headDrop, 2.5, 3); // kafa
        ctx.fillStyle = "#3f342a";
        ctx.fillRect(x - 3, y - 5.8 + bob, 6, 1); // sırt kılları
        ctx.fillStyle = "#e8e2d0";
        ctx.fillRect(x + f * 4.3, y - 3.4 + bob + headDrop, 1, 1); // diş
        ctx.fillStyle = "#3f342a";
        ctx.fillRect(x - 2.5, y - 1.5, 1, 1.5);
        ctx.fillRect(x + 1.8, y - 1.5, 1, 1.5);
        break;
      }
      case "wolf": {
        // gri kurt: sivri kulaklar, kalkık kuyruk
        ctx.fillStyle = "#8a8e96";
        ctx.fillRect(x - 3.5, y - 5 + bob, 7, 3.2);
        ctx.fillRect(x + f * 3.5 - 1, y - 5.8 + bob + headDrop, 2.6, 2.6); // kafa
        ctx.fillRect(x + f * 3.4, y - 7 + bob + headDrop, 0.9, 1.4); // kulak
        ctx.fillRect(x + f * 4.4, y - 6.8 + bob + headDrop, 0.9, 1.2);
        ctx.fillStyle = "#6a6e76";
        ctx.fillRect(x - f * 4.4, y - 6.2 + bob, 1.4, 2.6); // kuyruk
        ctx.fillStyle = "#2a2622";
        ctx.fillRect(x + f * 5, y - 4.6 + bob + headDrop, 0.9, 0.9); // burun
        ctx.fillStyle = "#d44";
        ctx.fillRect(x + f * 4.2, y - 4.7 + bob + headDrop, 0.8, 0.8); // göz
        ctx.fillStyle = "#6a6e76";
        ctx.fillRect(x - 2.8, y - 2, 1, 2);
        ctx.fillRect(x + 1.8, y - 2, 1, 2);
        break;
      }
      case "bear": {
        // iri kahverengi ayı
        ctx.fillStyle = "#6a4a32";
        ctx.fillRect(x - 4.5, y - 7.5 + bob, 9, 5.5);
        ctx.fillRect(x + f * 4.5 - 1.2, y - 8 + bob + headDrop, 3.4, 3.4); // kafa
        ctx.fillRect(x + f * 4, y - 9 + bob + headDrop, 1.1, 1.1); // kulaklar
        ctx.fillRect(x + f * 5.6, y - 9 + bob + headDrop, 1.1, 1.1);
        ctx.fillStyle = "#503824";
        ctx.fillRect(x - 4, y - 3, 1.6, 2.6); // bacaklar
        ctx.fillRect(x + 2.4, y - 3, 1.6, 2.6);
        ctx.fillStyle = "#caa27a";
        ctx.fillRect(x + f * 5.4, y - 6.2 + bob + headDrop, 1.6, 1.2); // burun
        ctx.fillStyle = "#d44";
        ctx.fillRect(x + f * 4.6, y - 7 + bob + headDrop, 0.9, 0.9); // göz
        break;
      }
    }

    if (baby) ctx.restore();

    // isabet parlaması: vurulan hayvan bir an bembeyaz yanar
    if (a.hitFlash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${Math.min(0.85, a.hitFlash * 5)})`;
      ctx.beginPath();
      ctx.ellipse(x, y - 4.5, 5.5, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // evcilleştirme işareti: yeşil köşeli çerçeve
    if (a.tameMark) {
      ctx.strokeStyle = "rgba(110, 220, 120, 0.95)";
      ctx.lineWidth = 0.8;
      const r2 = 6;
      for (const [cxs, cys] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
        ctx.beginPath();
        ctx.moveTo(x + cxs * r2, y - 4 + cys * r2);
        ctx.lineTo(x + cxs * r2, y - 4 + cys * r2 * 0.45);
        ctx.moveTo(x + cxs * r2, y - 4 + cys * r2);
        ctx.lineTo(x + cxs * r2 * 0.45, y - 4 + cys * r2);
        ctx.stroke();
      }
    }

    // av işareti: kırmızı köşeli çerçeve
    if (a.hunted) {
      ctx.strokeStyle = "rgba(230, 60, 60, 0.9)";
      ctx.lineWidth = 0.8;
      const r = 6;
      for (const [cxs, cys] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
        ctx.beginPath();
        ctx.moveTo(x + cxs * r, y - 4 + cys * r - (cys < 0 ? 1 : -1) * 0);
        ctx.lineTo(x + cxs * r, y - 4 + cys * r * 0.45);
        ctx.moveTo(x + cxs * r, y - 4 + cys * r);
        ctx.lineTo(x + cxs * r * 0.45, y - 4 + cys * r);
        ctx.stroke();
      }
    }

    // yara göstergesi: mızrak yemiş hayvanın tepesinde kırmızı can barı
    if (a.hp < a.def.hp) {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(x - 3, y - 11, 6, 1.4);
      ctx.fillStyle = "#e04040";
      ctx.fillRect(x - 3, y - 11, (6 * Math.max(0, a.hp)) / a.def.hp, 1.4);
    }

    // açlık göstergesi: aç hayvanın tepesinde küçük bar
    if (a.hunger > 70) {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(x - 3, y - 9, 6, 1.4);
      ctx.fillStyle = a.hunger >= 100 ? "#ff2222" : "#ff8844";
      ctx.fillRect(x - 3, y - 9, (6 * a.hunger) / 100, 1.4);
    }
    // ürün hazır: küçük yeşil nokta
    if (a.ready) {
      ctx.fillStyle = "#8fd05e";
      ctx.fillRect(x - 0.8, y - 9.5, 1.6, 1.6);
    }
  }

  private drawFisher(ctx: CanvasRenderingContext2D, px: number, py: number): void {
    this.baseShadow(ctx, px + 11, py + 29, 10);
    this.paintLogWall(ctx, px + 3, py + 16, 15, 13);
    this.paintThatch(ctx, px + 1, py + 10, 19, 6);
    ctx.fillStyle = "#3a2616";
    ctx.fillRect(px + 8, py + 22, 5, 7);
    this.outlineRect(ctx, px + 8, py + 22, 5, 7);
    ctx.fillStyle = "#6b4a2b";
    ctx.fillRect(px + 21, py + 14, 1.8, 15);
    ctx.fillRect(px + 29, py + 14, 1.8, 15);
    ctx.strokeStyle = "#d8d2c0";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(px + 22, py + 16);
    ctx.lineTo(px + 30, py + 16);
    ctx.stroke();
    for (const fx of [23.4, 26, 28.4] as const) {
      ctx.fillStyle = "#6fa8c9";
      ctx.beginPath();
      ctx.ellipse(px + fx, py + 19, 1.1, 2.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#8fc4e0";
      ctx.fillRect(px + fx - 0.8, py + 21, 1.6, 1.2);
    }
  }

  private drawCafeteria(ctx: CanvasRenderingContext2D, px: number, py: number): void {
    this.baseShadow(ctx, px + 16, py + 28, 14);
    ctx.fillStyle = "#6b4a2b";
    ctx.fillRect(px + 3, py + 8, 2, 12);
    ctx.fillRect(px + 27, py + 8, 2, 12);
    this.paintThatch(ctx, px + 1, py + 3, 30, 5);
    ctx.fillStyle = "#7c7f86";
    ctx.beginPath();
    ctx.ellipse(px + 16, py + 22, 6, 3.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#4a3320";
    ctx.beginPath();
    ctx.ellipse(px + 16, py + 22, 4.2, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e8842c";
    ctx.fillRect(px + 14.4, py + 18.6, 3.2, 3);
    ctx.fillStyle = "#ffc83c";
    ctx.fillRect(px + 15.2, py + 17.6, 1.6, 2);
    ctx.strokeStyle = "#6b4a2b";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(px + 10, py + 22);
    ctx.lineTo(px + 10, py + 14);
    ctx.moveTo(px + 22, py + 22);
    ctx.lineTo(px + 22, py + 14);
    ctx.moveTo(px + 9, py + 15);
    ctx.lineTo(px + 23, py + 15);
    ctx.stroke();
    ctx.fillStyle = "#c0564a";
    ctx.beginPath();
    ctx.ellipse(px + 16, py + 15, 2.6, 1.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#8a6a43";
    ctx.fillRect(px + 4, py + 26, 9, 2.6);
    ctx.fillRect(px + 19, py + 26, 9, 2.6);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 0.7;
    ctx.strokeRect(px + 4, py + 26, 9, 2.6);
    ctx.strokeRect(px + 19, py + 26, 9, 2.6);
  }

  private drawNursery(ctx: CanvasRenderingContext2D, px: number, py: number): void {
    this.baseShadow(ctx, px + 14, py + 29, 12);
    ctx.fillStyle = "#caa888";
    ctx.beginPath();
    ctx.ellipse(px + 13, py + 24, 11, 11, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(px + 2, py + 24, 22, 5);
    ctx.fillStyle = "#b08e6e";
    ctx.beginPath();
    ctx.ellipse(px + 13, py + 24, 11, 11, 0, Math.PI, Math.PI * 1.35);
    ctx.lineTo(px + 13, py + 24);
    ctx.fill();
    ctx.strokeStyle = "#8a6a50";
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(px + 8, py + 15);
    ctx.lineTo(px + 7, py + 28);
    ctx.moveTo(px + 17, py + 14.6);
    ctx.lineTo(px + 18.6, py + 28);
    ctx.stroke();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(px + 13, py + 24, 11, 11, 0, Math.PI, 0);
    ctx.stroke();
    ctx.fillStyle = "#3a2616";
    ctx.fillRect(px + 10.5, py + 21.6, 5, 7.4);
    ctx.fillStyle = "#e09ab8";
    ctx.fillRect(px + 10.5, py + 21.6, 5, 2);
    this.outlineRect(ctx, px + 10.5, py + 21.6, 5, 7.4);
    ctx.fillStyle = "#8a6a43";
    ctx.fillRect(px + 25.4, py + 24.6, 6, 3.6);
    ctx.fillStyle = "#f0eaff";
    ctx.fillRect(px + 26.2, py + 23.4, 4.4, 2);
    ctx.fillStyle = "#ffb0d0";
    ctx.fillRect(px + 27.2, py + 22.6, 2.4, 1.6);
    this.outlineRect(ctx, px + 25.4, py + 23.4, 6, 4.8);
  }

  private drawSmallSite(ctx: CanvasRenderingContext2D, px: number, py: number, t: number): void {
    ctx.fillStyle = "rgba(110, 84, 50, 0.85)";
    ctx.fillRect(px + 3, py + 3, 10, 10);
    ctx.fillStyle = WOOD_DARK;
    ctx.fillRect(px + 7, py + 5, 2, 8);
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(px + 2, py - 4, 12, 3);
    ctx.fillStyle = "#ffd23c";
    ctx.fillRect(px + 3, py - 3, 10 * Math.min(1, t), 1.5);
  }

  private drawTorch(ctx: CanvasRenderingContext2D, px: number, py: number, time: number): void {
    // küçük gölge ve direk
    ctx.fillStyle = "rgba(10, 15, 10, 0.2)";
    ctx.fillRect(px + 6, py + 13, 5, 2);
    ctx.fillStyle = WOOD_DARK;
    ctx.fillRect(px + 7, py + 4, 2, 10);
    ctx.fillStyle = "#57391f";
    ctx.fillRect(px + 8, py + 4, 1, 10);
    // alev: iki karelik titreşen animasyon
    const f = Math.floor(time * 6) % 2;
    ctx.fillStyle = "#e8842c";
    ctx.fillRect(px + 6, py + (f ? 1 : 2), 4, 3);
    ctx.fillStyle = "#ffc83c";
    ctx.fillRect(px + 7, py + (f ? 0 : 1), 2, 2);
    ctx.fillStyle = "#fff3b0";
    ctx.fillRect(px + 7.5, py + (f ? 1 : 2), 1, 1);
  }

  private drawTemple(ctx: CanvasRenderingContext2D, px: number, py: number): void {
    this.baseShadow(ctx, px + 16, py + 30, 14, 2.5);

    // Kutsal alan zemini: çamur toprık çember
    ctx.fillStyle = "#7a6040";
    ctx.beginPath();
    ctx.ellipse(px + 16, py + 27, 13, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Çevre kazıkları (8 adet ilkel direk)
    const stakes = [
      [4, 24], [8, 19], [14, 16], [20, 16],
      [26, 19], [28, 24], [22, 27], [10, 27]
    ] as const;
    for (const [sx, sy] of stakes) {
      ctx.fillStyle = "#4a3018";
      ctx.fillRect(px + sx, py + sy - 9, 2, 10);
      ctx.fillStyle = "#6b4820";
      ctx.fillRect(px + sx, py + sy - 9, 1, 10);
      // kazık tepesi (sivri uç)
      ctx.fillStyle = "#3e2410";
      ctx.fillRect(px + sx, py + sy - 10, 2, 1);
    }

    // Kazıkları bağlayan yatay örgü dallar
    ctx.strokeStyle = "#5a3820";
    ctx.lineWidth = 1;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(px + 5,  py + 17); ctx.lineTo(px + 9,  py + 13);
    ctx.moveTo(px + 9,  py + 13); ctx.lineTo(px + 15, py + 10);
    ctx.moveTo(px + 15, py + 10); ctx.lineTo(px + 21, py + 10);
    ctx.moveTo(px + 21, py + 10); ctx.lineTo(px + 27, py + 13);
    ctx.moveTo(px + 27, py + 13); ctx.lineTo(px + 29, py + 17);
    ctx.stroke();

    // Orta totem direği
    ctx.fillStyle = "#3e2410";
    ctx.fillRect(px + 14, py + 9, 4, 18);
    ctx.fillStyle = "#6b4820";
    ctx.fillRect(px + 14, py + 9, 2, 18);
    // Totem yüzü (basit)
    ctx.fillStyle = "#c98c3c";
    ctx.fillRect(px + 13, py + 10, 6, 5); // yüz kabı
    ctx.fillStyle = "#3e2410";
    ctx.fillRect(px + 14, py + 11, 1, 1); // sol göz
    ctx.fillRect(px + 17, py + 11, 1, 1); // sağ göz
    ctx.fillRect(px + 14, py + 13, 3, 1); // ağız
    // Totem baş süslükleri (yan dallar)
    ctx.fillStyle = "#5a3820";
    ctx.fillRect(px + 10, py + 11, 3, 1);
    ctx.fillRect(px + 19, py + 11, 3, 1);
    // Kük semül: kırmızı ügen leke
    ctx.fillStyle = "#c0392b";
    ctx.fillRect(px + 15, py + 16, 2, 2);
  }

  private drawCamp(ctx: CanvasRenderingContext2D, px: number, py: number): void {
    this.baseShadow(ctx, px + 9, py + 23.5, 8, 2); // çadır
    this.baseShadow(ctx, px + 25, py + 13.5, 4, 1.2); // sandık
    // çadır (sol): katmanlı üçgen
    for (let r = 0; r < 11; r++) {
      const w = 2 + r * 1.3;
      ctx.fillStyle = r < 4 ? "#9a8868" : "#7a6a4e";
      ctx.fillRect(px + 9 - w / 2, py + 12 + r, w, 1.4);
    }
    ctx.fillStyle = "#3a3026";
    ctx.fillRect(px + 7, py + 18, 4, 5); // çadır girişi
    // kamp ateşi (sağ): taş çember + alev
    ctx.fillStyle = "#6e7178";
    for (const [dx, dy] of [[-3, 1], [3, 1], [-2, 3], [2, 3], [0, 4]] as const) {
      ctx.fillRect(px + 24 + dx, py + 21 + dy, 2, 2);
    }
    ctx.fillStyle = "#5a3a1e";
    ctx.fillRect(px + 22, py + 22, 5, 2); // odunlar
    ctx.fillStyle = "#e8842c";
    ctx.fillRect(px + 23, py + 19, 3, 3);
    ctx.fillStyle = "#ffc83c";
    ctx.fillRect(px + 24, py + 18, 1, 2);
    // erzak sandığı (üst sağ)
    ctx.fillStyle = "#c9a35a";
    ctx.fillRect(px + 22, py + 8, 6, 5);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 22.5, py + 8.5, 5, 4);
  }

  private drawSite(ctx: CanvasRenderingContext2D, px: number, py: number, t: number): void {
    // şantiye: toprak zemin, köşe direkleri, çapraz kirişler ve ilerleme çubuğu
    ctx.fillStyle = "rgba(110, 84, 50, 0.85)";
    ctx.fillRect(px + 1, py + 1, 30, 30);
    ctx.fillStyle = WOOD_DARK;
    for (const [dx, dy] of [[3, 3], [26, 3], [3, 24], [26, 24]] as const) {
      ctx.fillRect(px + dx, py + dy, 3, 5);
    }
    ctx.strokeStyle = WOOD_MID;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px + 4, py + 27);
    ctx.lineTo(px + 28, py + 5);
    ctx.moveTo(px + 4, py + 5);
    ctx.lineTo(px + 28, py + 27);
    ctx.stroke();
    // ilerleme çubuğu
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(px + 2, py - 5, 28, 4);
    ctx.fillStyle = "#ffd23c";
    ctx.fillRect(px + 3, py - 4, 26 * Math.min(1, t), 2);
  }

  private outlineRect(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number
  ): void {
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  // Yapı tabanına oturan yumuşak gölge (hafifçe güneydoğuya kaymış elips)
  private baseShadow(
    ctx: CanvasRenderingContext2D,
    cx: number, cy: number, rx: number, ry = 2.5
  ): void {
    ctx.fillStyle = "rgba(10, 15, 10, 0.22)";
    ctx.beginPath();
    ctx.ellipse(cx + 1, cy + 1, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---- İlkel çağ yapı dili: saz dam, kütük duvar, deri örtü ----

  // Katmanlı saz dam (püsküllü alt kenarlı)
  private paintThatch(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    ctx.fillStyle = "#c2a44e";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "#d8bc62";
    ctx.fillRect(x, y, w, 1.6);
    ctx.fillStyle = "#a8883c";
    for (let i = 1; i * 3 < h; i++) ctx.fillRect(x, y + i * 3, w, 1);
    ctx.fillStyle = "#b89a44";
    for (let i = 1; i < w - 2; i += 3) ctx.fillRect(x + i, y + h, 2, 1.6);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  // Dikey kütüklerden duvar
  private paintLogWall(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    ctx.fillStyle = "#8a6a43";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "#6b4a2b";
    for (let i = 3; i < w - 1; i += 4) ctx.fillRect(x + i, y, 1.3, h);
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.fillRect(x, y, w, 1.6);
    this.outlineRect(ctx, x, y, w, h);
  }

  // Yatay kütük istifi (uçları halkalı)
  private paintLogPile(ctx: CanvasRenderingContext2D, x: number, y: number, rows: number, len: number): void {
    for (let r = 0; r < rows; r++) {
      const ly = y - r * 3.2;
      const off = (r % 2) * 1.5;
      ctx.fillStyle = "#6b4a2b";
      ctx.fillRect(x + off, ly, len, 3);
      ctx.fillStyle = "#8a6a43";
      ctx.beginPath();
      ctx.ellipse(x + off + len, ly + 1.5, 1.6, 1.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#c9a35a";
      ctx.beginPath();
      ctx.ellipse(x + off + len, ly + 1.5, 0.7, 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawHouse(ctx: CanvasRenderingContext2D, px: number, py: number): void {
    this.baseShadow(ctx, px + 16, py + 29, 13);
    this.paintLogWall(ctx, px + 5, py + 15, 22, 14);
    this.paintThatch(ctx, px + 3, py + 9, 26, 6);
    this.paintThatch(ctx, px + 7, py + 4, 18, 5);
    ctx.fillStyle = "#3a2616";
    ctx.fillRect(px + 13, py + 21, 6, 8);
    ctx.fillStyle = "#b89878";
    ctx.fillRect(px + 13, py + 21, 6, 4);
    ctx.fillStyle = "#8a6a50";
    ctx.fillRect(px + 13, py + 24, 6, 0.8);
    this.outlineRect(ctx, px + 13, py + 21, 6, 8);
  }

  private drawDepot(ctx: CanvasRenderingContext2D, px: number, py: number): void {
    this.baseShadow(ctx, px + 16, py + 29, 13);
    ctx.fillStyle = "#6b4a2b";
    ctx.fillRect(px + 6, py + 17, 2.4, 12);
    ctx.fillRect(px + 24, py + 17, 2.4, 12);
    ctx.fillRect(px + 15, py + 17, 2.4, 12);
    ctx.fillStyle = "#8a6a43";
    ctx.fillRect(px + 3, py + 14, 26, 4);
    ctx.fillStyle = "#6b4a2b";
    for (let i = 6; i < 26; i += 5) ctx.fillRect(px + 3 + i, py + 14, 1, 4);
    this.outlineRect(ctx, px + 3, py + 14, 26, 4);
    this.paintThatch(ctx, px + 4, py + 5, 24, 6);
    ctx.fillStyle = "#b89878";
    ctx.beginPath();
    ctx.ellipse(px + 10, py + 12.6, 2.6, 2.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#8a6a50";
    ctx.lineWidth = 0.6;
    ctx.stroke();
    this.paintLogPile(ctx, px + 17, py + 11.4, 1, 7);
    ctx.fillStyle = "#b8884a";
    ctx.fillRect(px + 19, py + 22, 5, 4);
    ctx.strokeStyle = "#8a6230";
    ctx.strokeRect(px + 19.5, py + 22.5, 4, 3);
  }

  private drawWoodcutter(ctx: CanvasRenderingContext2D, px: number, py: number): void {
    this.baseShadow(ctx, px + 15, py + 29, 13);
    ctx.fillStyle = "#6b4a2b";
    ctx.fillRect(px + 4, py + 12, 2.2, 17);
    ctx.fillRect(px + 17, py + 12, 2.2, 17);
    this.paintThatch(ctx, px + 2, py + 7, 20, 6);
    this.paintLogPile(ctx, px + 6, py + 25, 3, 10);
    ctx.fillStyle = "#8a6a43";
    ctx.beginPath();
    ctx.ellipse(px + 26, py + 24, 3.4, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#6b4a2b";
    ctx.fillRect(px + 22.6, py + 24, 6.8, 4);
    ctx.fillStyle = "#c9a35a";
    ctx.beginPath();
    ctx.ellipse(px + 26, py + 24, 1.4, 0.9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#7a5a36";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(px + 27, py + 22.5);
    ctx.lineTo(px + 30, py + 17);
    ctx.stroke();
    ctx.fillStyle = "#c9d4dc";
    ctx.fillRect(px + 28.6, py + 16, 2.6, 2);
  }

  private drawGatherer(ctx: CanvasRenderingContext2D, px: number, py: number): void {
    this.baseShadow(ctx, px + 13, py + 29, 11);
    ctx.fillStyle = "#c2a44e";
    ctx.beginPath();
    ctx.ellipse(px + 12, py + 21, 9.5, 8.5, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(px + 2.5, py + 21, 19, 8);
    ctx.fillStyle = "#a8883c";
    for (let i = 0; i < 3; i++) ctx.fillRect(px + 3.5, py + 16 + i * 4, 17, 1);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(px + 12, py + 21, 9.5, 8.5, 0, Math.PI, 0);
    ctx.moveTo(px + 2.5, py + 21);
    ctx.lineTo(px + 2.5, py + 29);
    ctx.moveTo(px + 21.5, py + 21);
    ctx.lineTo(px + 21.5, py + 29);
    ctx.stroke();
    ctx.fillStyle = "#8a6a30";
    ctx.fillRect(px + 10.5, py + 11, 3, 2.4);
    ctx.fillStyle = "#3a2616";
    ctx.fillRect(px + 9.5, py + 22, 5, 7);
    this.outlineRect(ctx, px + 9.5, py + 22, 5, 7);
    for (const bx of [25, 28.5] as const) {
      ctx.fillStyle = "#b8884a";
      ctx.fillRect(px + bx - 2, py + 24, 4, 4);
      ctx.strokeStyle = "#8a6230";
      ctx.lineWidth = 0.6;
      ctx.strokeRect(px + bx - 1.7, py + 24.3, 3.4, 3.4);
      ctx.fillStyle = "#d43f3f";
      ctx.fillRect(px + bx - 1.4, py + 22.8, 1.4, 1.4);
      ctx.fillRect(px + bx + 0.2, py + 23.2, 1.2, 1.2);
    }
  }

  private drawToolWorkshop(ctx: CanvasRenderingContext2D, px: number, py: number): void {
    this.baseShadow(ctx, px + 15, py + 29, 13);
    ctx.fillStyle = "#6b4a2b";
    ctx.fillRect(px + 3, py + 9, 2.2, 20);
    ctx.fillRect(px + 26, py + 9, 2.2, 20);
    ctx.fillStyle = "#caa888";
    ctx.fillRect(px + 1, py + 5, 30, 5);
    ctx.fillStyle = "#b08e6e";
    ctx.fillRect(px + 1, py + 8, 30, 2);
    this.outlineRect(ctx, px + 1, py + 5, 30, 5);
    ctx.fillStyle = "#8a6a43";
    ctx.fillRect(px + 6, py + 19, 20, 4);
    ctx.fillStyle = "#6b4a2b";
    ctx.fillRect(px + 7, py + 23, 2.4, 6);
    ctx.fillRect(px + 22.6, py + 23, 2.4, 6);
    this.outlineRect(ctx, px + 6, py + 19, 20, 4);
    ctx.fillStyle = "#9aa4ae";
    ctx.fillRect(px + 9, py + 15.6, 5.4, 3.4);
    ctx.fillStyle = "#c9d4dc";
    ctx.fillRect(px + 9, py + 15.6, 5.4, 1.2);
    ctx.fillStyle = "#7a5a36";
    ctx.fillRect(px + 19, py + 13.6, 1.3, 6);
    ctx.fillStyle = "#c9d4dc";
    ctx.fillRect(px + 17.6, py + 13, 4, 1.8);
    ctx.fillStyle = "#7c7f86";
    ctx.fillRect(px + 12, py + 26, 4, 2.6);
    ctx.fillStyle = "#9aa0a8";
    ctx.fillRect(px + 13, py + 25, 2.6, 1.6);
  }

  // Binaya takılı meşale: kısa sap + titreyen alev
  private drawAttachedTorch(ctx: CanvasRenderingContext2D, x: number, y: number, time: number): void {
    ctx.fillStyle = "#6a4a2e";
    ctx.fillRect(x - 0.8, y, 1.6, 6);
    const fl = Math.sin(time * 11 + x) * 0.6;
    ctx.fillStyle = "#f0a030";
    ctx.beginPath();
    ctx.ellipse(x, y - 2 + fl * 0.3, 2.2, 3 + fl, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffd23c";
    ctx.beginPath();
    ctx.ellipse(x, y - 1.4, 1.1, 1.7, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawHunterLodge(ctx: CanvasRenderingContext2D, px: number, py: number): void {
    this.baseShadow(ctx, px + 12, py + 29, 11);
    ctx.fillStyle = "#caa888";
    ctx.beginPath();
    ctx.moveTo(px + 12, py + 6);
    ctx.lineTo(px + 22, py + 29);
    ctx.lineTo(px + 2, py + 29);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#b08e6e";
    ctx.beginPath();
    ctx.moveTo(px + 12, py + 6);
    ctx.lineTo(px + 22, py + 29);
    ctx.lineTo(px + 12, py + 29);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px + 12, py + 6);
    ctx.lineTo(px + 22, py + 29);
    ctx.moveTo(px + 12, py + 6);
    ctx.lineTo(px + 2, py + 29);
    ctx.stroke();
    ctx.strokeStyle = "#6b4a2b";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(px + 9, py + 2);
    ctx.lineTo(px + 14.6, py + 9);
    ctx.moveTo(px + 15, py + 2);
    ctx.lineTo(px + 9.4, py + 9);
    ctx.stroke();
    ctx.fillStyle = "#3a2616";
    ctx.beginPath();
    ctx.moveTo(px + 12, py + 19);
    ctx.lineTo(px + 15.6, py + 29);
    ctx.lineTo(px + 8.4, py + 29);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#d4c49a";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px + 24, py + 28);
    ctx.lineTo(px + 30, py + 14);
    ctx.moveTo(px + 30, py + 28);
    ctx.lineTo(px + 24, py + 14);
    ctx.stroke();
    ctx.fillStyle = "#9aa0a8";
    ctx.fillRect(px + 29.2, py + 12.6, 1.8, 2.4);
    ctx.fillRect(px + 23.2, py + 12.6, 1.8, 2.4);
    ctx.fillStyle = "#a87c4f";
    ctx.fillRect(px + 24.4, py + 20, 5.2, 5);
    ctx.strokeStyle = "#6b4a2b";
    ctx.lineWidth = 0.8;
    ctx.strokeRect(px + 24, py + 19.6, 6, 5.8);
  }


  private drawSplitter(ctx: CanvasRenderingContext2D, px: number, py: number): void {
    this.baseShadow(ctx, px + 14, py + 29, 12);
    ctx.fillStyle = "#6b4a2b";
    ctx.fillRect(px + 6.6, py + 18, 10.8, 8);
    ctx.fillStyle = "#8a6a43";
    ctx.beginPath();
    ctx.ellipse(px + 12, py + 18, 5.4, 3.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#c9a35a";
    ctx.beginPath();
    ctx.ellipse(px + 12, py + 18, 2.6, 1.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px + 6.6, py + 18);
    ctx.lineTo(px + 6.6, py + 26);
    ctx.moveTo(px + 17.4, py + 18);
    ctx.lineTo(px + 17.4, py + 26);
    ctx.stroke();
    ctx.strokeStyle = "#7a5a36";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(px + 13.4, py + 16);
    ctx.lineTo(px + 19, py + 8);
    ctx.stroke();
    ctx.fillStyle = "#c9d4dc";
    ctx.fillRect(px + 17.6, py + 6.6, 4, 2.6);
    this.paintLogPile(ctx, px + 22, py + 26, 2, 8);
    ctx.strokeStyle = "#8a6a43";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px + 3, py + 27);
    ctx.lineTo(px + 7, py + 25);
    ctx.moveTo(px + 4, py + 29);
    ctx.lineTo(px + 8, py + 28);
    ctx.stroke();
  }

  // ---- Köylüler: blok dünyaya uygun tombul piksel insanlar ----

  // Kimliğe göre kalıcı saç rengi
  private static hairColorOf(v: Villager): string {
    const name = v.identity.firstName + v.identity.lastName;
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
    const HAIR = ["#2e2620", "#4a3322", "#6e4a28", "#8a6034", "#c2913c", "#55504a"];
    return HAIR[Math.abs(h) % HAIR.length];
  }

  private drawVillager(ctx: CanvasRenderingContext2D, v: Villager, time: number): void {
    const x = v.x;
    const y = v.y; // ayakların bastığı nokta
    const swing =
      v.state === "walking" || v.state === "hunting" ? Math.sin(v.walkPhase) * 2.2 : 0;

    // bebekler ve çocuklar ayak noktası etrafında küçültülerek çizilir
    const k = v.baby ? 0.6 : v.child ? 0.8 : 1;
    if (k !== 1) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(k, k);
      ctx.translate(-x, -y);
    }

    ctx.lineCap = "round";
    ctx.lineWidth = 1.1;

    // gölge
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.ellipse(x, y + 0.5, 3, 1.2, 0, 0, Math.PI * 2);
    ctx.fill();

    // uyuyan köylü: yerde yatar, üstünde "z" harfleri süzülür
    if (v.state === "sleeping") {
      // yatan gövde + bacaklar
      ctx.fillStyle = v.shirtColor;
      ctx.fillRect(x - 3, y - 3, 5, 2.4);
      ctx.fillStyle = "#3a342c";
      ctx.fillRect(x + 2, y - 2.6, 2.6, 1.8);
      ctx.strokeStyle = LINE;
      ctx.lineWidth = 0.5;
      ctx.strokeRect(x - 3, y - 3, 7.6, 2.4);
      // kafa + saç
      ctx.fillStyle = SKIN;
      ctx.fillRect(x - 6.2, y - 3.6, 3.2, 3.2);
      ctx.fillStyle = Renderer.hairColorOf(v);
      ctx.fillRect(x - 6.6, y - 3.9, 1.4, 3.6);
      ctx.strokeStyle = LINE;
      ctx.strokeRect(x - 6.2, y - 3.6, 3.2, 3.2);
      // z... z...
      const zt = (v.walkPhase % 2) / 2;
      ctx.globalAlpha = 1 - zt;
      ctx.font = "bold 4px monospace";
      ctx.fillStyle = "#cfe0f0";
      ctx.fillText("z", x + 1, y - 6 - zt * 4);
      ctx.font = "bold 3px monospace";
      ctx.fillText("z", x + 4, y - 9 - zt * 4);
      ctx.globalAlpha = 1;
      if (k !== 1) ctx.restore();
      return;
    }

    // bacaklar: yürürken öne-arkaya salınan iki kısa pantolon bloğu
    ctx.fillStyle = "#3a342c";
    const legSwing = swing * 0.55;
    ctx.fillRect(x - 1.9 + legSwing, y - 4.6, 1.7, 4.6);
    ctx.fillRect(x + 0.2 - legSwing, y - 4.6, 1.7, 4.6);

    // eşya taşıyorsa sırtında çanta (bakış yönünün tersinde)
    if (v.inventoryTotal > 0 && !v.baby) {
      ctx.fillStyle = "#8a6a43";
      ctx.fillRect(x - v.facing * 3.5 - 1.5, y - 9, 3, 4);
      ctx.strokeStyle = "#5a4226";
      ctx.lineWidth = 0.6;
      ctx.strokeRect(x - v.facing * 3.5 - 1.5, y - 9, 3, 4);
    }

    // gövde: dolgun gömlek bloğu + sol kenarda gölge
    ctx.fillStyle = v.shirtColor;
    ctx.fillRect(x - 2.4, y - 9.6, 4.8, 5.4);
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(x - 2.4, y - 9.6, 1.1, 5.4);
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 0.55;
    ctx.strokeRect(x - 2.4, y - 9.6, 4.8, 5.4);

    // deri giysi: gömleğin üstüne yelek + kürk yaka (kışın koruma)
    if (v.hasClothes) {
      ctx.fillStyle = "#a87c4f";
      ctx.fillRect(x - 2.4, y - 9.6, 1.5, 5.4);
      ctx.fillRect(x + 0.9, y - 9.6, 1.5, 5.4);
      ctx.fillStyle = "#e8e0d0"; // kürk yaka
      ctx.fillRect(x - 2.4, y - 9.9, 4.8, 1);
    }

    // kadın köylülerde etek: gövdenin altında genişleyen parça
    if (v.identity.female) {
      ctx.fillStyle = v.shirtColor;
      ctx.beginPath();
      ctx.moveTo(x - 2.4, y - 4.2);
      ctx.lineTo(x + 2.4, y - 4.2);
      ctx.lineTo(x + 3.1, y - 2.2);
      ctx.lineTo(x - 3.1, y - 2.2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = LINE;
      ctx.stroke();
    }

    // hamile karnı: gövdenin önünden belirgin biçimde taşar, adım adım büyür
    if (v.pregnant) {
      const belly = 1.2 + v.pregnancyProgress * 2.0;
      const bx = x + v.facing * (2.4 + belly * 0.45);
      const by = y - 6.2;
      ctx.fillStyle = v.shirtColor;
      ctx.beginPath();
      ctx.arc(bx, by, belly, 0, Math.PI * 2);
      ctx.fill();
      // açık tonda yansıma: karın gövdeden ayrışsın
      ctx.fillStyle = "rgba(255,255,255,0.22)";
      ctx.beginPath();
      ctx.arc(bx + v.facing * belly * 0.3, by - belly * 0.3, belly * 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = LINE;
      ctx.lineWidth = 0.55;
      ctx.beginPath();
      ctx.arc(bx, by, belly, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1.1;
    }

    // kollar
    ctx.strokeStyle = SKIN;
    ctx.lineWidth = 1.2;
    ctx.lineCap = "round";
    if (v.state === "building" || v.state === "mining") {
      // alet sallayan kol: omuzdan dönen tek çizgi + balta/çekiç/kazma
      const a = -1.4 + Math.sin(v.walkPhase) * 0.8; // omuz açısı
      const hx = x + Math.cos(a) * 3.5 * v.facing;
      const hy = y - 8.5 + Math.sin(a) * 3.5;
      ctx.beginPath();
      ctx.moveTo(x, y - 8.5);
      ctx.lineTo(hx, hy);
      ctx.stroke();
      const ax = hx + Math.cos(a) * 2.5 * v.facing;
      const ay = hy + Math.sin(a) * 2.5;
      ctx.strokeStyle = WOOD_DARK;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(ax, ay);
      ctx.stroke();
      if (v.state === "mining") {
        // kazma: sapın ucunda enine çubuk
        ctx.strokeStyle = "#9aa0a8";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(ax - 2, ay + 1);
        ctx.lineTo(ax + 2, ay - 1);
        ctx.stroke();
        ctx.lineWidth = 1.1;
      } else {
        ctx.fillStyle = "#6e7178";
        ctx.fillRect(ax - 1, ay - 1, 2, 2);
      }
    } else if (v.state === "chopping" || v.state === "gathering" || v.state === "tending" || v.state === "planting") {
      // eğilip toplama (dal/yemiş) / hayvan bakımı / ekim: kollar aşağı uzanır
      const reach = 1.5 + Math.sin(v.walkPhase) * 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y - 8.5);
      ctx.lineTo(x + v.facing * 2.5, y - 8.5 + reach + 2);
      ctx.stroke();
    } else if (v.state === "fishing") {
      // olta: kol ileri uzanır, kamış suya eğilir, şamandıra yüzer
      const bob = Math.sin(v.walkPhase * 3) * 0.8;
      const hx = x + 3 * v.facing;
      const hy = y - 7.5;
      ctx.beginPath();
      ctx.moveTo(x, y - 8.5);
      ctx.lineTo(hx, hy);
      ctx.stroke();
      ctx.strokeStyle = WOOD_DARK;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(x + 10 * v.facing, y - 11);
      ctx.stroke();
      ctx.strokeStyle = "rgba(230,240,250,0.7)";
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(x + 10 * v.facing, y - 11);
      ctx.lineTo(x + 12 * v.facing, y + 2 + bob);
      ctx.stroke();
      ctx.lineWidth = 1.1;
      ctx.fillStyle = "#d4453f";
      ctx.fillRect(x + 12 * v.facing - 1, y + 1.5 + bob, 2, 2);
    } else if (v.state === "hunting") {
      // dövüş: mızrak/balta ileri savrulur (attackAnim atış anında tepe yapar)
      const punch = v.attackAnim > 0 ? (v.attackAnim / 0.3) * 2.5 : Math.sin(v.walkPhase) * 0.8;
      ctx.beginPath();
      ctx.moveTo(x + v.facing * 1.8, y - 9);
      ctx.lineTo(x + v.facing * (4 + punch), y - 8.2);
      ctx.stroke();
      // arka kol dengede
      ctx.beginPath();
      ctx.moveTo(x - v.facing * 1.8, y - 9);
      ctx.lineTo(x - v.facing * 3, y - 6.4);
      ctx.stroke();
    } else if (v.state === "worshipping" || v.pleadingTtl > 0) {
      // dua/yakarış: iki kol göğe kalkık, hafifçe sallanır
      const sway = Math.sin(v.walkPhase) * 0.8;
      ctx.beginPath();
      ctx.moveTo(x - 1.8, y - 9);
      ctx.lineTo(x - 3 + sway, y - 12.5);
      ctx.moveTo(x + 1.8, y - 9);
      ctx.lineTo(x + 3 + sway, y - 12.5);
      ctx.stroke();
    } else {
      // yanlarda sallanan kollar (gömlek kolu + ten uç)
      ctx.strokeStyle = v.shirtColor;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(x - 2.7, y - 8.8);
      ctx.lineTo(x - 2.7 - swing * 0.5, y - 5.6);
      ctx.moveTo(x + 2.7, y - 8.8);
      ctx.lineTo(x + 2.7 + swing * 0.5, y - 5.6);
      ctx.stroke();
      ctx.fillStyle = SKIN;
      ctx.fillRect(x - 3.3 - swing * 0.5, y - 6, 1.2, 1.2);
      ctx.fillRect(x + 2.1 + swing * 0.5, y - 6, 1.2, 1.2);
    }

    // kafa: köşeli piksel kafa + saç + tek göz (yan bakış)
    ctx.fillStyle = SKIN;
    ctx.fillRect(x - 2.1, y - 14, 4.2, 4.2);
    const hair = Renderer.hairColorOf(v);
    ctx.fillStyle = hair;
    ctx.fillRect(x - 2.3, y - 14.4, 4.6, 1.5); // tepe
    ctx.fillRect(v.facing > 0 ? x - 2.3 : x + 1.1, y - 14.4, 1.2, 2.6); // ense
    if (v.identity.female) {
      // uzun saç: iki yana iner
      ctx.fillRect(x - 2.6, y - 13.6, 1, 4.4);
      ctx.fillRect(x + 1.6, y - 13.6, 1, 4.4);
    }
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 0.55;
    ctx.strokeRect(x - 2.1, y - 14, 4.2, 4.2);
    ctx.fillStyle = "#26221e";
    ctx.fillRect(x + v.facing * 1.1 - 0.45, y - 12.4, 0.9, 0.9); // göz

    drawVillagerJobAccessories(ctx, x, y, v.facing, v.assignment, 1);

    // mızraklı köylü: dövüşte elde yatay, normalde sırtta taşınır
    if (v.spears > 0 && !v.baby) {
      ctx.strokeStyle = "#d4c49a";
      ctx.lineWidth = 0.9;
      if (v.state === "hunting") {
        const punch = v.attackAnim > 0 ? (v.attackAnim / 0.3) * 2.5 : Math.sin(v.walkPhase) * 0.8;
        const hx = x + v.facing * (4 + punch);
        ctx.beginPath();
        ctx.moveTo(hx - v.facing * 6, y - 8.6);
        ctx.lineTo(hx + v.facing * 2.4, y - 8.2);
        ctx.stroke();
        ctx.fillStyle = "#9aa0a8";
        ctx.beginPath();
        ctx.moveTo(hx + v.facing * 2.4, y - 8.2);
        ctx.lineTo(hx + v.facing * 4.4, y - 9);
        ctx.lineTo(hx + v.facing * 2.6, y - 7.2);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(x - v.facing * 2.2, y - 2.5);
        ctx.lineTo(x + v.facing * 2.6, y - 12.5);
        ctx.stroke();
        ctx.fillStyle = "#9aa0a8"; // taş uç
        ctx.beginPath();
        ctx.moveTo(x + v.facing * 2.6, y - 12.5);
        ctx.lineTo(x + v.facing * 3.6, y - 14.2);
        ctx.lineTo(x + v.facing * 1.8, y - 13.6);
        ctx.closePath();
        ctx.fill();
      }
    }

    // peygamber: başının üstünde altın hale (parıldar)
    if (v.isProphet) {
      const pulse = 0.6 + 0.4 * Math.sin(time * 4);
      ctx.strokeStyle = `rgba(255, 214, 90, ${pulse})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(x, y - 13, 3.4, 1.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // ileti gönderen köylü: başının üstünde işaret; şokta yıldırım
    if (v.pleadingTtl > 0) {
      const bob = Math.sin(time * 5) * 1.2;
      ctx.font = "bold 5px monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffe296";
      ctx.fillText("📨", x, y - 19 + bob);
      ctx.textAlign = "left";
    } else if (v.shockTtl > 0) {
      ctx.font = "bold 6px monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffd23c";
      ctx.fillText("⚡", x + Math.sin(time * 30) * 0.8, y - 19);
      ctx.textAlign = "left";
    }

    // baltalı köylü: elinde küçük balta taşır
    if (v.hasAxe && !v.baby) {
      const hx = x + 2.6 * v.facing;
      const hy = y - 5.2;
      ctx.fillStyle = "#7a5a36"; // sap
      ctx.fillRect(hx - 0.5, hy - 2.6, 1, 3.2);
      ctx.fillStyle = "#c9d4dc"; // demir baş
      ctx.fillRect(hx - 0.5 + 0.9 * v.facing, hy - 3.2, 1.8 * v.facing, 1.4);
    }

    // yemek yerken kafanın yanında lokma
    if (v.state === "eating") {
      ctx.fillStyle = "#d43f3f";
      ctx.fillRect(x + 2.5 * v.facing, y - 10, 1.5, 1.5);
    }

    // ısırık parlaması: hasar anında kırmızı yanıp söner
    if (v.hitFlash > 0) {
      ctx.fillStyle = `rgba(255,60,40,${Math.min(0.6, v.hitFlash * 3)})`;
      ctx.fillRect(x - 2.6, y - 14.4, 5.2, 14.4);
    }

    // yara göstergesi: yırtıcı saldırısı yemiş köylüde kırmızı can barı
    if (v.hp < 100) {
      const w = 6;
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(x - w / 2, y - 18, w, 1.6);
      ctx.fillStyle = "#e04040";
      ctx.fillRect(x - w / 2, y - 18, (w * Math.max(0, v.hp)) / 100, 1.6);
    }

    const noFood = v.getFoodInInventory() === 0 && foodTotal() === 0;
    const showHungerBar = v.hunger > 50 || (v.hunger > EAT_THRESHOLD && noFood);

    // açlık göstergesi: aç köylülerin tepesinde kırmızı bar
    if (showHungerBar) {
      const w = 6;
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(x - w / 2, y - 16, w, 1.6);
      
      let barColor = v.starving ? "#ff2222" : "#ff8844";
      if (v.hunger > EAT_THRESHOLD && noFood) {
        const flash = Math.floor(time * 8) % 2 === 0;
        barColor = flash ? "#ff3333" : "#ffff33";
      }
      ctx.fillStyle = barColor;
      ctx.fillRect(x - w / 2, y - 16, (w * v.hunger) / 100, 1.6);

      // yanlarında veya depolarda yemek kalmadığında açlık uyarısı çıksın üstlerinde
      if (noFood) {
        const bob = Math.sin(time * 8) * 1.2;
        const wx = x;
        const wy = y - 21.5 + bob;
        ctx.fillStyle = "#ff2222";
        ctx.beginPath();
        ctx.arc(wx, wy, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 0.5;
        ctx.stroke();

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 4px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("!", wx, wy);
      }
    }

    if (k !== 1) ctx.restore();
  }
}

export function drawVillagerJobAccessories(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  facing: number,
  assignment: any,
  s: number
): void {
  if (assignment.kind === "building") {
    const type = assignment.building.type;

    // 1. Woodcutter (Oduncu)
    if (type === 2) { // BuildingType.Woodcutter
      // Kırmızı oduncu beresi (Hat)
      ctx.fillStyle = "#c0392b";
      ctx.fillRect(x - 2 * s, y - 14.5 * s, 4 * s, 2 * s);
      // Bere ponponu
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x - 0.6 * s, y - 15.5 * s, 1.2 * s, 1.2 * s);
      
      // Kahverengi pantolon askısı (torso details)
      ctx.fillStyle = "#5c3d24";
      ctx.fillRect(x - 0.8 * s, y - 9 * s, 0.5 * s, 4 * s);
      ctx.fillRect(x + 0.3 * s, y - 9 * s, 0.5 * s, 4 * s);
    }
    
    // 2. Gatherer (Toplayıcı)
    else if (type === 3) { // BuildingType.Gatherer
      // Hasır şapka (straw hat)
      ctx.fillStyle = "#e5c158";
      // Şapka kubbesi
      ctx.fillRect(x - 1.5 * s, y - 14.8 * s, 3 * s, 2 * s);
      // Şapka siperliği (wide brim)
      ctx.fillRect(x - 3.5 * s, y - 13 * s, 7 * s, 0.8 * s);
      
      // Hasır şapka bandı
      ctx.fillStyle = "#a04000";
      ctx.fillRect(x - 1.5 * s, y - 13.6 * s, 3 * s, 0.6 * s);

      // Çapraz deri çanta askısı
      ctx.strokeStyle = "#5a3825";
      ctx.lineWidth = 0.6 * s;
      ctx.beginPath();
      ctx.moveTo(x - 1 * s * facing, y - 9 * s);
      ctx.lineTo(x + 1 * s * facing, y - 5 * s);
      ctx.stroke();
    }
    
    // 3. Fisher (Balıkçı)
    else if (type === 9) { // BuildingType.Fisher
      // Sarı balıkçı yağmurluk şapkası (yellow southwester hat)
      ctx.fillStyle = "#f1c40f";
      ctx.beginPath();
      // Kafa üstü kubbe
      ctx.arc(x, y - 12.5 * s, 2.2 * s, Math.PI, 0);
      ctx.fill();
      // Geriye doğru siperlik
      ctx.fillRect(x - 2.8 * s, y - 12.8 * s, 5.6 * s, 0.8 * s);
      ctx.fillRect(x - 3.2 * s * facing, y - 12.8 * s, 1.2 * s, 1.6 * s); // arka ense koruması
      
      // Sarı su geçirmez iş önlüğü/tulum (apron/overalls)
      ctx.fillStyle = "#f1c40f";
      ctx.fillRect(x - 0.9 * s, y - 8 * s, 1.8 * s, 3 * s);
      // Tulum askıları
      ctx.strokeStyle = "#d4ac0d";
      ctx.lineWidth = 0.5 * s;
      ctx.beginPath();
      ctx.moveTo(x - 0.7 * s, y - 9 * s);
      ctx.lineTo(x - 0.7 * s, y - 8 * s);
      ctx.moveTo(x + 0.7 * s, y - 9 * s);
      ctx.lineTo(x + 0.7 * s, y - 8 * s);
      ctx.stroke();
    }
    
    // 4. Temple Priest (Rahip)
    else if (type === 6) { // BuildingType.Temple
      // Kutsal kafa bandı / hale (halo)
      ctx.strokeStyle = "#ffd700";
      ctx.lineWidth = 0.7 * s;
      ctx.beginPath();
      ctx.arc(x, y - 13.5 * s, 1.8 * s, 0, Math.PI * 2);
      ctx.stroke();

      // Cübbe altın işlemeleri (robe details)
      ctx.fillStyle = "#ffd700";
      ctx.fillRect(x - 0.6 * s, y - 8.5 * s, 1.2 * s, 1.2 * s);
    }
    
    // 5. Farmer (Çiftçi)
    else if (type === 10) { // BuildingType.Barn
      // Düz köylü kasketi (flat cap)
      ctx.fillStyle = "#4a4f58";
      ctx.fillRect(x - 2 * s, y - 13.8 * s, 4 * s, 1.2 * s);
      ctx.fillRect(x - 0.5 * s * facing, y - 13.8 * s, 2.5 * s * facing, 0.8 * s); // kasket siperi
      
      // Yeşil işçi önlüğü
      ctx.fillStyle = "#1e8449";
      ctx.fillRect(x - 0.8 * s, y - 7.5 * s, 1.6 * s, 2.5 * s);
    }
    
    // 6. Tool Smith (Alet Ustası)
    else if (type === 12) { // BuildingType.ToolWorkshop
      // Koyu deri demirci önlüğü
      ctx.fillStyle = "#4a3526";
      ctx.fillRect(x - 0.9 * s, y - 8.5 * s, 1.8 * s, 3.5 * s);
      // Alın bandı
      ctx.fillStyle = "#7f8c8d";
      ctx.fillRect(x - 2 * s, y - 13.2 * s, 4 * s, 0.9 * s);
    }
  }
  
  // 6. Builder (İnşaatçı)
  else if (assignment.kind === "builder") {
    // Sarı güvenlik bareti (hard hat)
    ctx.fillStyle = "#f1c40f";
    ctx.beginPath();
    ctx.arc(x, y - 12.8 * s, 2.2 * s, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(x - 2.8 * s, y - 12.8 * s, 5.6 * s, 0.6 * s); // siperlik
    
    // Turuncu reflektörlü yelek (safety vest)
    ctx.fillStyle = "#e67e22";
    ctx.fillRect(x - 0.9 * s, y - 8.5 * s, 1.8 * s, 3.5 * s);
    // Gri yansıtıcı şeritler
    ctx.fillStyle = "#bdc3c7";
    ctx.fillRect(x - 0.9 * s, y - 7 * s, 1.8 * s, 0.6 * s);
  }
}
