import type { Camera } from "../engine/camera";
import type { Villager } from "../sim/villager";
import { Building, BuildingType, BUILDING_SIZE } from "../sim/buildings";
import { hash2 } from "../world/noise";
import { Tile, TILE_COLORS, TILE_SIZE } from "../world/tiles";
import type { World } from "../world/world";

const SKIN = "#e8b88a";
const LINE = "#26221e";
const WOOD_DARK = "#6b4a2b";
const WOOD_MID = "#8a6a43";
const WALL = "#b08d5a"; // bina duvarı: zemindeki toprak tonundan ayrışsın
const OUTLINE = "#3a2c1a";

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
    const colors = TILE_COLORS[t];
    const px = x * TILE_SIZE;
    const py = y * TILE_SIZE;
    const sub = 4;
    for (let sy = 0; sy < sub; sy++) {
      for (let sx = 0; sx < sub; sx++) {
        const shade = Math.floor(hash2(x * sub + sx, y * sub + sy, 42) * colors.length);
        this.tctx.fillStyle = colors[shade];
        this.tctx.fillRect(px + sx * 4, py + sy * 4, 4, 4);
      }
    }
    if (t === Tile.Tree) this.paintTree(px, py, x, y);
    else if (t === Tile.Bush) this.paintBush(px, py, x, y);
  }

  private paintTree(px: number, py: number, x: number, y: number): void {
    const c = this.tctx;
    // gövde
    c.fillStyle = WOOD_DARK;
    c.fillRect(px + 7, py + 9, 2, 6);
    // yapraklar: piksel piksel kabaca yuvarlak bir taç
    const cx = px + 8;
    const cy = py + 6;
    for (let dy = -5; dy <= 5; dy++) {
      for (let dx = -5; dx <= 5; dx++) {
        if (dx * dx + dy * dy > 22) continue;
        const v = hash2(x * 16 + dx, y * 16 + dy, 99);
        c.fillStyle = v < 0.25 ? "#2e6b22" : v < 0.8 ? "#3d8a2e" : "#54a83d";
        c.fillRect(cx + dx, cy + dy, 1, 1);
      }
    }
  }

  private paintBush(px: number, py: number, x: number, y: number): void {
    const c = this.tctx;
    // alçak yuvarlak çalı + kırmızı meyveler
    const cx = px + 8;
    const cy = py + 10;
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        if (dx * dx + dy * dy * 2 > 16) continue;
        const v = hash2(x * 16 + dx, y * 16 + dy, 77);
        c.fillStyle = v < 0.5 ? "#3a7a2c" : "#4a9438";
        c.fillRect(cx + dx, cy + dy, 1, 1);
      }
    }
    c.fillStyle = "#d43f3f";
    for (let k = 0; k < 4; k++) {
      const bx = cx - 3 + Math.floor(hash2(x, y * 4 + k, 55) * 6);
      const by = cy - 2 + Math.floor(hash2(x * 4 + k, y, 66) * 4);
      c.fillRect(bx, by, 1, 1);
    }
  }

  render(
    ctx: CanvasRenderingContext2D,
    camera: Camera,
    villagers: Villager[],
    buildings: Building[],
    hoverTile: { x: number; y: number } | null,
    ghost: Ghost | null,
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

    // İşaretli bloklar: yanıp sönen çerçeveler (ağaç sarı, çalı turuncu)
    const pulse = 0.45 + 0.3 * Math.sin(time * 5);
    ctx.lineWidth = 1;
    this.strokeMarked(ctx, this.world.markedTrees, `rgba(255, 210, 60, ${pulse})`);
    this.strokeMarked(ctx, this.world.markedBushes, `rgba(255, 130, 60, ${pulse})`);

    // İmleç altındaki ağaca/çalıya beyaz çerçeve (bina yerleştirilmiyorken)
    if (!ghost && hoverTile) {
      const t = this.world.get(hoverTile.x, hoverTile.y);
      if (t === Tile.Tree || t === Tile.Bush) {
        ctx.strokeStyle = "rgba(255,255,255,0.8)";
        ctx.strokeRect(
          hoverTile.x * TILE_SIZE + 0.5,
          hoverTile.y * TILE_SIZE + 0.5,
          TILE_SIZE - 1,
          TILE_SIZE - 1
        );
      }
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
    switch (b.type) {
      case BuildingType.House: this.drawHouse(ctx, px, py); break;
      case BuildingType.Depot: this.drawDepot(ctx, px, py); break;
      case BuildingType.Woodcutter: this.drawWoodcutter(ctx, px, py); break;
      case BuildingType.Gatherer: this.drawGatherer(ctx, px, py); break;
    }
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
    // çatı (üçgen, katmanlı)
    ctx.fillStyle = "#7a3b2e";
    for (let r = 0; r < 10; r++) {
      const w = 4 + r * 2.6;
      ctx.fillRect(px + 16 - w / 2, py + 3 + r, w, 1.5);
    }
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

    // kollar
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 1.1;
    if (v.state === "chopping" || v.state === "building") {
      // alet sallayan kol: omuzdan dönen tek çizgi + balta/çekiç
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
      ctx.fillStyle = v.state === "chopping" ? "#9aa0a8" : "#6e7178";
      ctx.fillRect(ax - 1, ay - 1, 2, 2);
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
