import { TILE_SIZE } from "../world/tiles";
import type { World } from "../world/world";
import { findPath, findPathAdjacent, type PathNode } from "./pathfinding";
import { resources } from "./resources";

const WALK_SPEED = 36; // dünya-piksel / saniye
const CHOP_TIME = 3; // saniye
const WOOD_PER_TREE = 4;

const SHIRT_COLORS = ["#c0392b", "#2980b9", "#8e44ad", "#d35400", "#16a085"];
let shirtIndex = 0;

type VillagerState = "idle" | "walking" | "chopping";

export class Villager {
  x: number; // dünya-piksel (ayakların bastığı nokta)
  y: number;
  state: VillagerState = "idle";
  shirt: string;
  facing: 1 | -1 = 1;
  walkPhase = 0; // bacak/kol salınımı için
  private path: PathNode[] = [];
  private pathIdx = 0;
  private timer = 1 + Math.random() * 2;
  private jobTile = -1; // sahiplendiği ağacın indexi, -1 = yok

  constructor(tileX: number, tileY: number) {
    this.x = (tileX + 0.5) * TILE_SIZE;
    this.y = (tileY + 0.5) * TILE_SIZE;
    this.shirt = SHIRT_COLORS[shirtIndex++ % SHIRT_COLORS.length];
  }

  get tileX(): number {
    return Math.floor(this.x / TILE_SIZE);
  }
  get tileY(): number {
    return Math.floor(this.y / TILE_SIZE);
  }

  update(dt: number, world: World): void {
    switch (this.state) {
      case "idle":
        this.timer -= dt;
        if (this.timer <= 0) this.decide(world);
        break;
      case "walking":
        this.walk(dt, world);
        break;
      case "chopping":
        this.chop(dt, world);
        break;
    }
  }

  private decide(world: World): void {
    // Önce iş var mı bak: işaretli ve sahiplenilmemiş bir ağaç
    const tree = world.findNearestMarkedTree(this.x, this.y);
    if (tree) {
      const path = findPathAdjacent(world, this.tileX, this.tileY, tree.x, tree.y);
      if (path) {
        this.jobTile = world.index(tree.x, tree.y);
        world.claimed.add(this.jobTile);
        this.startPath(path);
        return;
      }
    }
    // İş yoksa yakınlarda rastgele dolan
    const r = 6;
    for (let attempt = 0; attempt < 8; attempt++) {
      const tx = this.tileX + Math.floor((Math.random() * 2 - 1) * r);
      const ty = this.tileY + Math.floor((Math.random() * 2 - 1) * r);
      if (!world.walkableAt(tx, ty)) continue;
      const path = findPath(world, this.tileX, this.tileY, tx, ty);
      if (path) {
        this.startPath(path);
        return;
      }
    }
    this.timer = 1 + Math.random() * 2;
  }

  private startPath(path: PathNode[]): void {
    this.path = path;
    this.pathIdx = 0;
    this.state = "walking";
  }

  private walk(dt: number, world: World): void {
    // İş yürürken iptal edildiyse (işaret kaldırıldı) vazgeç
    if (this.jobTile !== -1 && !world.marked.has(this.jobTile)) {
      world.claimed.delete(this.jobTile);
      this.jobTile = -1;
      this.toIdle();
      return;
    }

    if (this.pathIdx >= this.path.length) {
      this.arrive();
      return;
    }
    const node = this.path[this.pathIdx];
    const targetX = (node.x + 0.5) * TILE_SIZE;
    const targetY = (node.y + 0.5) * TILE_SIZE;
    const dx = targetX - this.x;
    const dy = targetY - this.y;
    const dist = Math.hypot(dx, dy);
    const step = WALK_SPEED * dt;

    if (dx !== 0) this.facing = dx > 0 ? 1 : -1;
    this.walkPhase += dt * 9;

    if (dist <= step) {
      this.x = targetX;
      this.y = targetY;
      this.pathIdx++;
      if (this.pathIdx >= this.path.length) this.arrive();
    } else {
      this.x += (dx / dist) * step;
      this.y += (dy / dist) * step;
    }
  }

  private arrive(): void {
    if (this.jobTile !== -1) {
      this.state = "chopping";
      this.timer = CHOP_TIME;
      this.walkPhase = 0;
    } else {
      this.toIdle();
    }
  }

  private chop(dt: number, world: World): void {
    const i = this.jobTile;
    if (i === -1 || !world.marked.has(i)) {
      this.jobTile = -1;
      this.toIdle();
      return;
    }
    // Ağaca dönük dur
    const tx = i % world.width;
    this.facing = (tx + 0.5) * TILE_SIZE >= this.x ? 1 : -1;
    this.walkPhase += dt * 14; // hızlı kol sallama = balta vuruşu
    this.timer -= dt;
    if (this.timer <= 0) {
      world.chopTree(tx, Math.floor(i / world.width));
      resources.wood += WOOD_PER_TREE;
      this.jobTile = -1;
      this.toIdle();
    }
  }

  private toIdle(): void {
    this.state = "idle";
    this.path = [];
    this.walkPhase = 0;
    this.timer = 0.5 + Math.random() * 2;
  }
}
