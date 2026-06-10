import { TILE_SIZE } from "../world/tiles";
import type { World } from "../world/world";
import type { Building } from "./buildings";
import { BUILDING_SIZE } from "./buildings";
import { randomIdentity, type Identity } from "./names";
import {
  findPath,
  findPathAdjacent,
  findPathAdjacentRect,
  type PathNode,
} from "./pathfinding";
import { addFood, addWood, resources, takeFood } from "./resources";

const WALK_SPEED = 36; // dünya-piksel / saniye
const CHOP_TIME = 3; // saniye
const GATHER_TIME = 2.5;
const WOOD_PER_TREE = 4;
const FOOD_PER_BUSH = 4;

const HUNGER_RATE = 100 / 150; // 150 saniyede 0 -> 100
const EAT_THRESHOLD = 65; // bu açlığın üstünde yemek arar
const EAT_TIME = 1.2;
const FOOD_PER_MEAL = 2;
const HUNGER_PER_MEAL = 55;
const STARVE_TIME = 45; // açlık 100'de bu kadar kalırsa ölür

const SHIRT_COLORS = ["#c0392b", "#2980b9", "#8e44ad", "#d35400", "#16a085"];
let shirtIndex = 0;

type VillagerState =
  | "idle"
  | "walking"
  | "chopping"
  | "gathering"
  | "building"
  | "eating";

type Job =
  | { kind: "chop"; tile: number }
  | { kind: "gather"; tile: number }
  | { kind: "build"; building: Building };

export class Villager {
  x: number; // dünya-piksel (ayakların bastığı nokta)
  y: number;
  state: VillagerState = "idle";
  shirt: string;
  facing: 1 | -1 = 1;
  walkPhase = 0; // bacak/kol salınımı için
  hunger: number;
  dead = false;
  readonly identity: Identity = randomIdentity();
  private starveTimer = 0;
  private path: PathNode[] = [];
  private pathIdx = 0;
  private timer = 1 + Math.random() * 2;
  private job: Job | null = null;

  constructor(tileX: number, tileY: number) {
    this.x = (tileX + 0.5) * TILE_SIZE;
    this.y = (tileY + 0.5) * TILE_SIZE;
    this.shirt = SHIRT_COLORS[shirtIndex++ % SHIRT_COLORS.length];
    this.hunger = Math.random() * 30;
  }

  get tileX(): number {
    return Math.floor(this.x / TILE_SIZE);
  }
  get tileY(): number {
    return Math.floor(this.y / TILE_SIZE);
  }
  get starving(): boolean {
    return this.hunger >= 100;
  }

  get fullName(): string {
    return `${this.identity.firstName} ${this.identity.lastName}`.trim();
  }

  // Profil panelinde gösterilen anlık durum
  get statusText(): string {
    switch (this.state) {
      case "idle":
        return this.starving ? "Açlıktan bitkin" : "Boşta";
      case "walking":
        if (!this.job) return "Geziniyor";
        if (this.job.kind === "chop") return "Ağaca gidiyor";
        if (this.job.kind === "gather") return "Çalıya gidiyor";
        return "Şantiyeye gidiyor";
      case "chopping":
        return "Ağaç kesiyor";
      case "gathering":
        return "Meyve topluyor";
      case "building":
        return "İnşaat yapıyor";
      case "eating":
        return "Yemek yiyor";
    }
  }

  update(dt: number, world: World, buildings: Building[]): void {
    // açlık her durumda işler
    this.hunger = Math.min(100, this.hunger + HUNGER_RATE * dt);
    if (this.starving) {
      this.starveTimer += dt;
      if (this.starveTimer >= STARVE_TIME) {
        this.die(world);
        return;
      }
    } else {
      this.starveTimer = 0;
    }

    switch (this.state) {
      case "idle":
        this.timer -= dt;
        if (this.timer <= 0) this.decide(world, buildings);
        break;
      case "walking":
        this.walk(dt, world);
        break;
      case "chopping":
        this.chop(dt, world);
        break;
      case "gathering":
        this.gather(dt, world);
        break;
      case "building":
        this.build(dt);
        break;
      case "eating":
        this.timer -= dt;
        if (this.timer <= 0) {
          if (takeFood(FOOD_PER_MEAL)) {
            this.hunger = Math.max(0, this.hunger - HUNGER_PER_MEAL);
          }
          this.toIdle();
        }
        break;
    }
  }

  die(world: World): void {
    this.dead = true;
    this.releaseJob(world);
  }

  private releaseJob(world: World): void {
    if (!this.job) return;
    if (this.job.kind === "chop") world.claimedTrees.delete(this.job.tile);
    else if (this.job.kind === "gather") world.claimedBushes.delete(this.job.tile);
    else if (this.job.kind === "build") this.job.building.claimed = false;
    this.job = null;
  }

  private decide(world: World, buildings: Building[]): void {
    // 1) Acıkmışsa ve yemek varsa: ye
    if (this.hunger > EAT_THRESHOLD && resources.food >= FOOD_PER_MEAL) {
      this.state = "eating";
      this.timer = EAT_TIME;
      return;
    }

    // 2) En yakın işi seç: inşaat, ağaç kesimi veya meyve toplama
    type Candidate = { dist: number; start: () => boolean };
    const candidates: Candidate[] = [];

    for (const b of buildings) {
      if (b.done || b.claimed) continue;
      const d =
        Math.abs(b.x + 1 - this.tileX) + Math.abs(b.y + 1 - this.tileY);
      candidates.push({
        dist: d,
        start: () => {
          const path = findPathAdjacentRect(
            world, this.tileX, this.tileY, b.x, b.y, BUILDING_SIZE
          );
          if (!path) return false;
          b.claimed = true;
          this.job = { kind: "build", building: b };
          this.startPath(path);
          return true;
        },
      });
    }

    const tree = world.findNearestMarked(
      world.markedTrees, world.claimedTrees, this.x, this.y
    );
    if (tree) {
      candidates.push({
        dist: tree.dist,
        start: () => {
          const path = findPathAdjacent(world, this.tileX, this.tileY, tree.x, tree.y);
          if (!path) return false;
          const i = world.index(tree.x, tree.y);
          world.claimedTrees.add(i);
          this.job = { kind: "chop", tile: i };
          this.startPath(path);
          return true;
        },
      });
    }

    const bush = world.findNearestMarked(
      world.markedBushes, world.claimedBushes, this.x, this.y
    );
    if (bush) {
      candidates.push({
        dist: bush.dist,
        start: () => {
          const path = findPathAdjacent(world, this.tileX, this.tileY, bush.x, bush.y);
          if (!path) return false;
          const i = world.index(bush.x, bush.y);
          world.claimedBushes.add(i);
          this.job = { kind: "gather", tile: i };
          this.startPath(path);
          return true;
        },
      });
    }

    candidates.sort((a, b) => a.dist - b.dist);
    for (const c of candidates) {
      if (c.start()) return;
    }

    // 3) İş yoksa yakınlarda rastgele dolan
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

  // İş yürürken iptal edildiyse (işaret kaldırıldı) doğru/yanlış döner
  private jobStillValid(world: World): boolean {
    if (!this.job) return true;
    if (this.job.kind === "chop") return world.markedTrees.has(this.job.tile);
    if (this.job.kind === "gather") return world.markedBushes.has(this.job.tile);
    return true; // inşaat iptal edilemez (şimdilik)
  }

  private walk(dt: number, world: World): void {
    if (!this.jobStillValid(world)) {
      this.releaseJob(world);
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
    const speed = this.starving ? WALK_SPEED * 0.5 : WALK_SPEED;
    const step = speed * dt;

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
    if (!this.job) {
      this.toIdle();
      return;
    }
    this.walkPhase = 0;
    if (this.job.kind === "chop") {
      this.state = "chopping";
      this.timer = CHOP_TIME;
    } else if (this.job.kind === "gather") {
      this.state = "gathering";
      this.timer = GATHER_TIME;
    } else {
      this.state = "building";
      this.faceTowards(this.job.building.centerX);
    }
  }

  private faceTowards(worldX: number): void {
    this.facing = worldX >= this.x ? 1 : -1;
  }

  private chop(dt: number, world: World): void {
    const job = this.job;
    if (!job || job.kind !== "chop" || !world.markedTrees.has(job.tile)) {
      this.releaseJob(world);
      this.toIdle();
      return;
    }
    const tx = job.tile % world.width;
    this.faceTowards((tx + 0.5) * TILE_SIZE);
    this.walkPhase += dt * 14; // hızlı kol sallama = balta vuruşu
    this.timer -= dt;
    if (this.timer <= 0) {
      world.chopTree(tx, Math.floor(job.tile / world.width));
      addWood(WOOD_PER_TREE);
      this.job = null;
      this.toIdle();
    }
  }

  private gather(dt: number, world: World): void {
    const job = this.job;
    if (!job || job.kind !== "gather" || !world.markedBushes.has(job.tile)) {
      this.releaseJob(world);
      this.toIdle();
      return;
    }
    const tx = job.tile % world.width;
    this.faceTowards((tx + 0.5) * TILE_SIZE);
    this.walkPhase += dt * 7; // yavaş eğilip toplama
    this.timer -= dt;
    if (this.timer <= 0) {
      world.harvestBush(tx, Math.floor(job.tile / world.width));
      addFood(FOOD_PER_BUSH);
      this.job = null;
      this.toIdle();
    }
  }

  private build(dt: number): void {
    const job = this.job;
    if (!job || job.kind !== "build") {
      this.toIdle();
      return;
    }
    this.walkPhase += dt * 12; // çekiç sallama
    job.building.progress += dt;
    if (job.building.done) {
      job.building.claimed = false;
      this.job = null;
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
