import type { Camera } from "../engine/camera";
import type { Villager } from "../sim/villager";
import {
  Building,
  BuildingType,
  isDepositPoint,
  LIGHT_RADIUS,
} from "../sim/buildings";
import { isFull, ITEM_INFO, ITEM_TYPES } from "../sim/resources";
import { darkness, season } from "../sim/time";
import { floaters, particles, FLOATER_TTL } from "./effects";
import { hash2 } from "../world/noise";
import { Tile, TILE_COLORS, TILE_SIZE } from "../world/tiles";
import type { World } from "../world/world";

const SKIN = "#e8b88a";
const LINE = "#26221e";
const WOOD_DARK = "#6b4a2b";
const WOOD_MID = "#8a6a43";
const WALL = "#b08d5a"; // bina duvarı: zemindeki toprak tonundan ayrışsın
const OUTLINE = "#3a2c1a";

// Su: sığdan derine doğru koyulaşan iki palet (alt kare başına karıştırılır)
const WATER_SHALLOW = ["#4383cc", "#477fc4", "#3f7abd"];
const WATER_DEEP = ["#1c4170", "#1e466f", "#193d66"];

// Ağaç tacı: koyudan açığa, ışık sol üstten gelir
const CANOPY = ["#27581d", "#2e6b22", "#3d8a2e", "#54a83d", "#6cbf4e"];

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
  private paintTile(x: number, y: number): void {
    const t = this.world.get(x, y) as Tile;
    const px = x * TILE_SIZE;
    const py = y * TILE_SIZE;
    this.paintMinimapPixel(x, y, t);

    if (t === Tile.Water) {
      this.paintWater(px, py, x, y);
      return;
    }

    const colors = TILE_COLORS[t];
    const sub = 4;
    for (let sy = 0; sy < sub; sy++) {
      for (let sx = 0; sx < sub; sx++) {
        const shade = Math.floor(hash2(x * sub + sx, y * sub + sy, 42) * colors.length);
        this.tctx.fillStyle = colors[shade];
        this.tctx.fillRect(px + sx * 4, py + sy * 4, 4, 4);
      }
    }

    // çimen zeminlerde tek tük ot pikselleri
    if (t === Tile.Grass || t === Tile.Tree || t === Tile.Bush) {
      this.tctx.fillStyle = "#3f6e2b";
      for (let k = 0; k < 3; k++) {
        const v = hash2(x * 3 + k, y * 7 + k, 21);
        if (v > 0.55) continue;
        const gx = px + 1 + Math.floor(hash2(x + k, y, 22) * 14);
        const gy = py + 2 + Math.floor(hash2(x, y + k, 23) * 12);
        this.tctx.fillRect(gx, gy, 1, 2);
      }
    }

    this.paintRelief(px, py, x, y);

    if (t === Tile.Tree) this.paintTree(px, py, x, y);
    else if (t === Tile.Bush) this.paintBush(px, py, x, y);
    else if (t === Tile.Mushroom) this.paintMushroom(px, py, x, y);
  }

  private paintMinimapPixel(x: number, y: number, t: Tile): void {
    let color: string;
    switch (t) {
      case Tile.Water:
        color = this.world.heightAt(x, y) < 0.2 ? "#1c4170" : "#2a5d9c";
        break;
      case Tile.Sand: color = "#d8c27a"; break;
      case Tile.Dirt: color = "#8a6a43"; break;
      case Tile.Stone: color = "#85888f"; break;
      case Tile.Tree: color = "#2e6b22"; break;
      case Tile.Bush: color = "#4a9438"; break;
      default: color = "#5a8f3c"; break;
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
    // yapraklar: yönlü ışıkla taç (sol üst açık, sağ alt koyu)
    for (let dy = -5; dy <= 5; dy++) {
      for (let dx = -5; dx <= 5; dx++) {
        if (dx * dx + dy * dy > 22) continue;
        const v = hash2(x * 16 + dx, y * 16 + dy, 99);
        const light = 0.55 - (dx + dy) * 0.07 + (v - 0.5) * 0.55;
        const idx = Math.min(CANOPY.length - 1, Math.max(0, Math.floor(light * CANOPY.length)));
        c.fillStyle = CANOPY[idx];
        c.fillRect(cx + dx, cy + dy, 1, 1);
      }
    }
  }

  private paintBush(px: number, py: number, x: number, y: number): void {
    const c = this.tctx;
    const cx = px + 8;
    const cy = py + 10;
    // küçük gölge
    c.fillStyle = "rgba(10, 20, 10, 0.18)";
    c.beginPath();
    c.ellipse(cx + 1, cy + 3, 4.5, 1.6, 0, 0, Math.PI * 2);
    c.fill();
    // alçak yuvarlak çalı: üstü açık, altı koyu + kırmızı meyveler
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        if (dx * dx + dy * dy * 2 > 16) continue;
        const v = hash2(x * 16 + dx, y * 16 + dy, 77);
        const light = 0.5 - (dx + dy) * 0.09 + (v - 0.5) * 0.5;
        c.fillStyle = light > 0.6 ? "#56a843" : light > 0.3 ? "#4a9438" : "#34701f";
        c.fillRect(cx + dx, cy + dy, 1, 1);
      }
    }
    c.fillStyle = "#d43f3f";
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
    hoverTile: { x: number; y: number } | null,
    ghost: Ghost | null,
    selectedVillager: Villager | null,
    selectedBuilding: Building | null,
    time: number
  ): void {
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
      if (t === Tile.Tree || t === Tile.Bush || t === Tile.Mushroom || t === Tile.Stone) {
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
      drawables.push({ baseY: v.y, draw: () => this.drawVillager(ctx, v) });
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

    // parçacıklar (talaş, taş kırıntısı) ve uçan kazanç yazıları
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

    // Hayalet bina (yerleştirme önizlemesi)
    if (ghost) {
      const gx = ghost.tileX * TILE_SIZE;
      const gy = ghost.tileY * TILE_SIZE;
      const s = ghost.size * TILE_SIZE;
      ctx.fillStyle = ghost.valid ? "rgba(80, 220, 100, 0.3)" : "rgba(230, 60, 60, 0.35)";
      ctx.fillRect(gx, gy, s, s);
      ctx.strokeStyle = ghost.valid ? "rgba(80, 220, 100, 0.9)" : "rgba(230, 60, 60, 0.9)";
      ctx.strokeRect(gx + 0.5, gy + 0.5, s - 1, s - 1);
      // meşale hayaletinde ışık yarıçapı önizlemesi
      const lr = LIGHT_RADIUS[ghost.type];
      if (lr) {
        ctx.strokeStyle = "rgba(255, 200, 80, 0.5)";
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(gx + s / 2, gy + s / 2, lr, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Mevsim atmosferi: sonbaharda sıcak ton, kışta soğuk ton + kar
    const s = season();
    if (s === 2) {
      ctx.fillStyle = "rgba(220, 140, 50, 0.06)";
      ctx.fillRect(0, 0, vw, vh);
    } else if (s === 3) {
      ctx.fillStyle = "rgba(190, 215, 250, 0.13)";
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
        const r = LIGHT_RADIUS[b.type];
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
    }
  }

  private drawFisher(ctx: CanvasRenderingContext2D, px: number, py: number): void {
    this.baseShadow(ctx, px + 11, py + 29, 10);
    // mavi çatılı kıyı kulübesi
    ctx.fillStyle = WALL;
    ctx.fillRect(px + 3, py + 12, 17, 17);
    this.outlineRect(ctx, px + 3, py + 12, 17, 17);
    ctx.fillStyle = "#3f7abd";
    ctx.fillRect(px + 2, py + 8, 19, 5);
    ctx.fillStyle = "#5b94d4";
    ctx.fillRect(px + 2, py + 8, 19, 2);
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.fillRect(px + 3, py + 13, 17, 2);
    ctx.fillStyle = "#4a2e1a";
    ctx.fillRect(px + 9, py + 21, 5, 8);
    // duvarda asılı balık tabelası
    ctx.fillStyle = "#6fa8c9";
    ctx.fillRect(px + 5, py + 16, 5, 2);
    ctx.fillRect(px + 10, py + 15, 1.5, 4);
    // fıçı + olta kamışı
    this.baseShadow(ctx, px + 26, py + 27, 4, 1.3);
    ctx.fillStyle = WOOD_DARK;
    ctx.fillRect(px + 23, py + 22, 6, 6);
    ctx.fillStyle = "#9a6c40";
    ctx.fillRect(px + 23, py + 24, 6, 1);
    ctx.strokeStyle = WOOD_DARK;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px + 28, py + 22);
    ctx.lineTo(px + 31, py + 14);
    ctx.stroke();
  }

  private drawCafeteria(ctx: CanvasRenderingContext2D, px: number, py: number): void {
    this.baseShadow(ctx, px + 16, py + 29, 15);
    // geniş yemek salonu
    ctx.fillStyle = WALL;
    ctx.fillRect(px + 2, py + 12, 28, 17);
    this.outlineRect(ctx, px + 2, py + 12, 28, 17);
    ctx.fillStyle = "#a85b32";
    ctx.fillRect(px + 1, py + 7, 30, 6); // turuncu çatı
    ctx.fillStyle = "#c07242";
    ctx.fillRect(px + 1, py + 7, 30, 2);
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.fillRect(px + 2, py + 13, 28, 2);
    // baca ve duman
    ctx.fillStyle = "#6e7178";
    ctx.fillRect(px + 24, py + 2, 3, 6);
    ctx.fillStyle = "rgba(220,220,220,0.5)";
    ctx.fillRect(px + 25, py - 1, 2, 2);
    ctx.fillRect(px + 27, py - 3, 2, 2);
    // tezgah ve çorba kasesi
    ctx.fillStyle = WOOD_DARK;
    ctx.fillRect(px + 6, py + 22, 20, 3);
    ctx.fillStyle = "#e8e0cc";
    ctx.fillRect(px + 13, py + 19, 6, 3);
    ctx.fillStyle = "#d43f3f";
    ctx.fillRect(px + 14, py + 19, 4, 1.5);
    // kapı
    ctx.fillStyle = "#4a2e1a";
    ctx.fillRect(px + 4, py + 21, 5, 8);
  }

  private drawNursery(ctx: CanvasRenderingContext2D, px: number, py: number): void {
    this.baseShadow(ctx, px + 16, py + 29, 14);
    // bakımevi: açık duvar, pembe çatı
    ctx.fillStyle = "#d8c9b0";
    ctx.fillRect(px + 3, py + 12, 26, 17);
    this.outlineRect(ctx, px + 3, py + 12, 26, 17);
    ctx.fillStyle = "#c97a9a";
    ctx.fillRect(px + 2, py + 7, 28, 6);
    ctx.fillStyle = "#e09ab8";
    ctx.fillRect(px + 2, py + 7, 28, 2);
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(px + 3, py + 13, 26, 2);
    // beşik: yarım daire üstüne yatak
    ctx.fillStyle = WOOD_DARK;
    ctx.beginPath();
    ctx.arc(px + 11, py + 24, 4, 0, Math.PI);
    ctx.fill();
    ctx.fillStyle = "#f0eaff";
    ctx.fillRect(px + 7, py + 21, 8, 3);
    ctx.fillStyle = "#ffb0d0";
    ctx.fillRect(px + 9, py + 20, 4, 2);
    // pencere ve kapı
    ctx.fillStyle = "#bcd9f0";
    ctx.fillRect(px + 20, py + 16, 5, 4);
    ctx.fillStyle = "#4a2e1a";
    ctx.fillRect(px + 19, py + 22, 5, 7);
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
    this.baseShadow(ctx, px + 16, py + 30, 15, 2);
    // taban platformu
    ctx.fillStyle = "#bba884";
    ctx.fillRect(px + 2, py + 24, 28, 6);
    this.outlineRect(ctx, px + 2, py + 24, 28, 6);
    // sütunlar
    ctx.fillStyle = "#d8c9a4";
    ctx.fillRect(px + 5, py + 12, 3, 13);
    ctx.fillRect(px + 24, py + 12, 3, 13);
    ctx.fillRect(px + 14, py + 12, 3, 13);
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(px + 7, py + 12, 1, 13);
    ctx.fillRect(px + 26, py + 12, 1, 13);
    ctx.fillRect(px + 16, py + 12, 1, 13);
    // alınlık (üçgen çatı)
    for (let r = 0; r < 8; r++) {
      const w = 6 + r * 3.2;
      ctx.fillStyle = r < 3 ? "#d8c9a4" : "#bba884";
      ctx.fillRect(px + 16 - w / 2, py + 3 + r, w, 1.4);
    }
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.fillRect(px + 3, py + 11, 26, 2); // saçak gölgesi
    // kutsal sembol: mor elmas
    ctx.fillStyle = "#b08fe0";
    ctx.fillRect(px + 15, py + 6, 2, 2);
    ctx.fillRect(px + 14.5, py + 6.5, 3, 1);
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

  private drawHouse(ctx: CanvasRenderingContext2D, px: number, py: number): void {
    this.baseShadow(ctx, px + 16, py + 29, 13);
    // duvarlar
    ctx.fillStyle = WALL;
    ctx.fillRect(px + 4, py + 13, 24, 16);
    ctx.fillStyle = WOOD_MID;
    ctx.fillRect(px + 4, py + 20, 24, 1);
    this.outlineRect(ctx, px + 4, py + 13, 24, 16);
    // çatı (üçgen, katmanlı; üst sıralar ışık alır)
    for (let r = 0; r < 10; r++) {
      const w = 4 + r * 2.6;
      ctx.fillStyle = r < 3 ? "#9c4f3c" : r < 7 ? "#7a3b2e" : "#5e2c22";
      ctx.fillRect(px + 16 - w / 2, py + 3 + r, w, 1.5);
    }
    // çatı saçağının duvara düşen gölgesi
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.fillRect(px + 4, py + 13, 24, 2);
    // kapı ve pencere
    ctx.fillStyle = "#4a2e1a";
    ctx.fillRect(px + 13, py + 21, 6, 8);
    ctx.fillStyle = "#bcd9f0";
    ctx.fillRect(px + 7, py + 16, 4, 4);
    ctx.fillRect(px + 21, py + 16, 4, 4);
  }

  private drawDepot(ctx: CanvasRenderingContext2D, px: number, py: number): void {
    this.baseShadow(ctx, px + 16, py + 29, 15);
    // geniş ambar
    ctx.fillStyle = WALL;
    ctx.fillRect(px + 2, py + 11, 28, 18);
    this.outlineRect(ctx, px + 2, py + 11, 28, 18);
    ctx.fillStyle = WOOD_DARK;
    ctx.fillRect(px + 1, py + 6, 30, 6); // düz çatı bandı
    ctx.fillStyle = "#7d5835";
    ctx.fillRect(px + 1, py + 6, 30, 2); // çatı ışığı
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.fillRect(px + 2, py + 12, 28, 2); // saçak gölgesi
    ctx.fillStyle = WOOD_DARK;
    ctx.fillRect(px + 12, py + 18, 8, 11); // büyük kapı
    // yandaki sandıklar
    ctx.fillStyle = "#c9a35a";
    ctx.fillRect(px + 4, py + 23, 5, 5);
    ctx.fillRect(px + 23, py + 23, 5, 5);
    ctx.strokeStyle = WOOD_DARK;
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 4.5, py + 23.5, 4, 4);
    ctx.strokeRect(px + 23.5, py + 23.5, 4, 4);
  }

  private drawWoodcutter(ctx: CanvasRenderingContext2D, px: number, py: number): void {
    this.baseShadow(ctx, px + 11, py + 29, 10);
    this.baseShadow(ctx, px + 26, py + 27, 5, 1.5); // kütük yığını
    // kulübe
    ctx.fillStyle = WALL;
    ctx.fillRect(px + 3, py + 12, 17, 17);
    this.outlineRect(ctx, px + 3, py + 12, 17, 17);
    ctx.fillStyle = WOOD_DARK;
    ctx.fillRect(px + 2, py + 8, 19, 5);
    ctx.fillStyle = "#7d5835";
    ctx.fillRect(px + 2, py + 8, 19, 2);
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.fillRect(px + 3, py + 13, 17, 2);
    ctx.fillStyle = "#4a2e1a";
    ctx.fillRect(px + 9, py + 21, 5, 8);
    // kütük yığını
    ctx.fillStyle = "#7a5230";
    ctx.fillRect(px + 22, py + 24, 8, 3);
    ctx.fillRect(px + 22, py + 20, 8, 3);
    ctx.fillStyle = "#9a6c40";
    ctx.fillRect(px + 23, py + 16, 6, 3);
  }

  private drawGatherer(ctx: CanvasRenderingContext2D, px: number, py: number): void {
    this.baseShadow(ctx, px + 11, py + 29, 10);
    this.baseShadow(ctx, px + 26, py + 27, 4, 1.3); // sepet
    // yeşil çatılı kulübe
    ctx.fillStyle = WALL;
    ctx.fillRect(px + 3, py + 12, 17, 17);
    this.outlineRect(ctx, px + 3, py + 12, 17, 17);
    ctx.fillStyle = "#4a7a3a";
    ctx.fillRect(px + 2, py + 8, 19, 5);
    ctx.fillStyle = "#62975a";
    ctx.fillRect(px + 2, py + 8, 19, 2);
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.fillRect(px + 3, py + 13, 17, 2);
    ctx.fillStyle = "#4a2e1a";
    ctx.fillRect(px + 9, py + 21, 5, 8);
    // meyve sepeti
    ctx.fillStyle = "#b8884a";
    ctx.fillRect(px + 23, py + 23, 6, 4);
    ctx.fillStyle = "#d43f3f";
    ctx.fillRect(px + 24, py + 21, 2, 2);
    ctx.fillRect(px + 27, py + 22, 1, 1);
  }

  // ---- Cin Ali tarzı çöp adam ----

  private drawVillager(ctx: CanvasRenderingContext2D, v: Villager): void {
    const x = v.x;
    const y = v.y; // ayakların bastığı nokta
    const swing = v.state === "walking" ? Math.sin(v.walkPhase) * 2.2 : 0;

    // bebekler ayak noktası etrafında küçültülerek çizilir
    const k = v.baby ? 0.6 : 1;
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

    // bacaklar
    ctx.strokeStyle = LINE;
    ctx.beginPath();
    ctx.moveTo(x, y - 5);
    ctx.lineTo(x + swing, y);
    ctx.moveTo(x, y - 5);
    ctx.lineTo(x - swing, y);
    ctx.stroke();

    // gövde (gömlek rengi)
    ctx.strokeStyle = v.shirt;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(x, y - 5);
    ctx.lineTo(x, y - 9);
    ctx.stroke();

    // kadın köylülerde küçük etek
    if (v.identity.female) {
      ctx.fillStyle = v.shirt;
      ctx.beginPath();
      ctx.moveTo(x - 2.5, y - 3.5);
      ctx.lineTo(x + 2.5, y - 3.5);
      ctx.lineTo(x, y - 6);
      ctx.closePath();
      ctx.fill();
    }

    // kollar
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 1.1;
    if (v.state === "chopping" || v.state === "building" || v.state === "mining") {
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
        ctx.fillStyle = v.state === "chopping" ? "#9aa0a8" : "#6e7178";
        ctx.fillRect(ax - 1, ay - 1, 2, 2);
      }
    } else if (v.state === "gathering") {
      // eğilip toplama: kollar aşağı uzanır
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
    } else if (v.state === "worshipping") {
      // dua: iki kol yukarı kalkık, hafifçe sallanır
      const sway = Math.sin(v.walkPhase) * 0.8;
      ctx.beginPath();
      ctx.moveTo(x, y - 8.5);
      ctx.lineTo(x - 2.2 + sway, y - 12);
      ctx.moveTo(x, y - 8.5);
      ctx.lineTo(x + 2.2 + sway, y - 12);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(x, y - 8.5);
      ctx.lineTo(x - swing * 0.8, y - 5.5);
      ctx.moveTo(x, y - 8.5);
      ctx.lineTo(x + swing * 0.8, y - 5.5);
      ctx.stroke();
    }

    // kafa
    ctx.fillStyle = SKIN;
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.arc(x, y - 11, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // yemek yerken kafanın yanında lokma
    if (v.state === "eating") {
      ctx.fillStyle = "#d43f3f";
      ctx.fillRect(x + 2.5 * v.facing, y - 10, 1.5, 1.5);
    }

    // açlık göstergesi: aç köylülerin tepesinde kırmızı bar
    if (v.hunger > 50) {
      const w = 6;
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(x - w / 2, y - 16, w, 1.6);
      ctx.fillStyle = v.starving ? "#ff2222" : "#ff8844";
      ctx.fillRect(x - w / 2, y - 16, (w * v.hunger) / 100, 1.6);
    }

    if (k !== 1) ctx.restore();
  }
}
