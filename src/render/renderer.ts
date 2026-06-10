import type { Camera } from "../engine/camera";
import type { Villager } from "../sim/villager";
import { hash2 } from "../world/noise";
import { Tile, TILE_COLORS, TILE_SIZE } from "../world/tiles";
import type { World } from "../world/world";

const SKIN = "#e8b88a";
const LINE = "#26221e";

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
  }

  private paintTree(px: number, py: number, x: number, y: number): void {
    const c = this.tctx;
    // gövde
    c.fillStyle = "#6b4a2b";
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

  render(
    ctx: CanvasRenderingContext2D,
    camera: Camera,
    villagers: Villager[],
    hoverTile: { x: number; y: number } | null,
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

    // Kesim için işaretli ağaçlar: yanıp sönen sarı çerçeve
    const pulse = 0.45 + 0.3 * Math.sin(time * 5);
    ctx.lineWidth = 1;
    ctx.strokeStyle = `rgba(255, 210, 60, ${pulse})`;
    for (const i of this.world.marked) {
      const x = i % this.world.width;
      const y = Math.floor(i / this.world.width);
      ctx.strokeRect(x * TILE_SIZE + 0.5, y * TILE_SIZE + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
    }

    // İmleç altındaki ağaca beyaz çerçeve
    if (hoverTile && this.world.get(hoverTile.x, hoverTile.y) === Tile.Tree) {
      ctx.strokeStyle = "rgba(255,255,255,0.8)";
      ctx.strokeRect(
        hoverTile.x * TILE_SIZE + 0.5,
        hoverTile.y * TILE_SIZE + 0.5,
        TILE_SIZE - 1,
        TILE_SIZE - 1
      );
    }

    // Köylüler (önce yukarıdakiler çizilsin ki alttakiler önde dursun)
    const sorted = [...villagers].sort((a, b) => a.y - b.y);
    for (const v of sorted) this.drawVillager(ctx, v);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // Cin Ali tarzı çöp adam: daire kafa, çizgi gövde ve sallanan kol/bacaklar
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
    if (v.state === "chopping") {
      // balta sallayan kol: omuzdan dönen tek çizgi + balta
      const a = -1.4 + Math.sin(v.walkPhase) * 0.8; // omuz açısı
      const hx = x + Math.cos(a) * 3.5 * v.facing;
      const hy = y - 8.5 + Math.sin(a) * 3.5;
      ctx.beginPath();
      ctx.moveTo(x, y - 8.5);
      ctx.lineTo(hx, hy);
      ctx.stroke();
      // balta sapı ve başı
      const ax = hx + Math.cos(a) * 2.5 * v.facing;
      const ay = hy + Math.sin(a) * 2.5;
      ctx.strokeStyle = "#6b4a2b";
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(ax, ay);
      ctx.stroke();
      ctx.fillStyle = "#9aa0a8";
      ctx.fillRect(ax - 1, ay - 1, 2, 2);
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
  }
}
