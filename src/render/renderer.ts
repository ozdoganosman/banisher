import type { Camera } from "../engine/camera";
import type { Villager } from "../sim/villager";
import { Building, BuildingType, BUILDING_SIZE } from "../sim/buildings";
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
  valid: boolean;
}

export class Renderer {
  // Zemin bir kez offscreen canvas'a çizilir; sadece değişen bloklar yeniden boyanır
  private terrain: HTMLCanvasElement;
  private tctx: CanvasRenderingContext2D;

  constructor(private world: World) {
    this.terrain = document.createElement("canvas");
    this.terrain.width = world.width * TILE_SIZE;
    this.terrain.height = world.height * TILE_SIZE;
    this.tctx = this.terrain.getContext("2d")!;
    for (let y = 0; y < world.height; y++) {
      for (let x = 0; x < world.width; x++) {
        this.paintTile(x, y);
      }
    }
    world.onTileChange = (x, y) => this.paintTile(x, y);
  }

  // Tek bir bloğu offscreen zemine boya (4x4'lük alt karelerle pixel dokusu)
  private paintTile(x: number, y: number): void {
    const t = this.world.get(x, y) as Tile;
    const px = x * TILE_SIZE;
    const py = y * TILE_SIZE;

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

    ctx.drawImage(this.terrain, 0, 0);

    // Su parıltısı: görünür su bloklarında zamana bağlı küçük ışıltılar
    const halfW = vw / 2 / camera.zoom;
    const halfH = vh / 2 / camera.zoom;
    const x0 = Math.max(0, Math.floor((camera.x - halfW) / TILE_SIZE));
    const x1 = Math.min(this.world.width - 1, Math.ceil((camera.x + halfW) / TILE_SIZE));
    const y0 = Math.max(0, Math.floor((camera.y - halfH) / TILE_SIZE));
    const y1 = Math.min(this.world.height - 1, Math.ceil((camera.y + halfH) / TILE_SIZE));
    const phase = Math.floor(time * 1.6);
    ctx.fillStyle = "rgba(235, 248, 255, 0.25)";
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (this.world.get(tx, ty) !== Tile.Water) continue;
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
        baseY: (b.y + BUILDING_SIZE) * TILE_SIZE,
        draw: () => this.drawBuilding(ctx, b),
      });
    }
    for (const v of villagers) {
      drawables.push({ baseY: v.y, draw: () => this.drawVillager(ctx, v) });
    }
    drawables.sort((a, b) => a.baseY - b.baseY);
    for (const d of drawables) d.draw();

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
      const s = BUILDING_SIZE * TILE_SIZE;
      ctx.fillStyle = ghost.valid ? "rgba(80, 220, 100, 0.3)" : "rgba(230, 60, 60, 0.35)";
      ctx.fillRect(gx, gy, s, s);
      ctx.strokeStyle = ghost.valid ? "rgba(80, 220, 100, 0.9)" : "rgba(230, 60, 60, 0.9)";
      ctx.strokeRect(gx + 0.5, gy + 0.5, s - 1, s - 1);
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
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

  private drawBuilding(ctx: CanvasRenderingContext2D, b: Building): void {
    const px = b.x * TILE_SIZE;
    const py = b.y * TILE_SIZE;
    if (!b.done) {
      this.drawSite(ctx, px, py, b.progress / b.def.buildTime);
      return;
    }
    // binanın güneydoğuya düşen gölgesi
    ctx.fillStyle = "rgba(10, 15, 10, 0.2)";
    ctx.fillRect(px + 4, py + 29, 28, 4);
    ctx.fillRect(px + 29, py + 8, 4, 21);
    switch (b.type) {
      case BuildingType.House: this.drawHouse(ctx, px, py); break;
      case BuildingType.Depot: this.drawDepot(ctx, px, py); break;
      case BuildingType.Woodcutter: this.drawWoodcutter(ctx, px, py); break;
      case BuildingType.Gatherer: this.drawGatherer(ctx, px, py); break;
      case BuildingType.Camp: this.drawCamp(ctx, px, py); break;
    }
  }

  private drawCamp(ctx: CanvasRenderingContext2D, px: number, py: number): void {
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

  private drawHouse(ctx: CanvasRenderingContext2D, px: number, py: number): void {
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
  }
}
