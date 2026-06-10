import { addFloater, burst } from "../render/effects";
import { Tile, TILE_SIZE } from "../world/tiles";
import type { World } from "../world/world";
import type { Building } from "./buildings";
import {
  isDepositPoint,
  isLit,
  KNOWLEDGE_PER_WORSHIP,
  WORSHIP_INTERVAL,
  WORSHIP_TIME,
} from "./buildings";
import { randomIdentity, type Identity } from "./names";
import { isNight } from "./time";
import {
  findPath,
  findPathAdjacent,
  findPathAdjacentRect,
  type PathNode,
} from "./pathfinding";
import {
  addItem,
  foodTotal,
  isFull,
  ITEM_INFO,
  ITEM_TYPES,
  resources,
  takeFood,
  type ItemType,
} from "./resources";

const WALK_SPEED = 36; // dünya-piksel / saniye
const CHOP_TIME = 3; // saniye
const GATHER_TIME = 2.5;
const MINE_TIME = 4;
const WOOD_PER_TREE = 4;
const BERRY_PER_BUSH = 4;
const MUSHROOM_PER_PATCH = 3;
const STONE_PER_MINE = 3;

const INVENTORY_CAP = 8; // çantada taşınabilecek toplam eşya
const DEPOSIT_AT = 6; // çanta bu kadar dolunca depoya taşır

const HUNGER_RATE = 100 / 150; // 150 saniyede 0 -> 100
const EAT_THRESHOLD = 65;
const EAT_TIME = 1.2;
const FOOD_PER_MEAL = 2;
const HUNGER_PER_MEAL = 55;
const STARVE_TIME = 45;

const SHIRT_COLORS = ["#c0392b", "#2980b9", "#8e44ad", "#d35400", "#16a085"];
let shirtIndex = 0;

export type Profession = "worker" | "woodcutter" | "gatherer" | "miner" | "builder";

export const PROFESSIONS: Profession[] = [
  "worker", "woodcutter", "gatherer", "miner", "builder",
];

export const PROFESSION_NAMES: Record<Profession, string> = {
  worker: "İşçi",
  woodcutter: "Oduncu",
  gatherer: "Toplayıcı",
  miner: "Madenci",
  builder: "İnşaatçı",
};

type VillagerState =
  | "idle"
  | "walking"
  | "chopping"
  | "gathering"
  | "mining"
  | "building"
  | "worshipping"
  | "eating";

type Job =
  | { kind: "chop"; tile: number }
  | { kind: "gather"; tile: number; item: "berry" | "mushroom" }
  | { kind: "mine"; tile: number }
  | { kind: "build"; building: Building }
  | { kind: "worship"; building: Building }
  | { kind: "deposit"; building: Building };

export class Villager {
  x: number; // dünya-piksel (ayakların bastığı nokta)
  y: number;
  state: VillagerState = "idle";
  shirt: string;
  facing: 1 | -1 = 1;
  walkPhase = 0; // bacak/kol salınımı için
  hunger: number;
  dead = false;
  profession: Profession = "worker";
  readonly identity: Identity = randomIdentity();
  // Kişisel çanta: toplananlar önce buraya, sonra kampa/depoya gider
  readonly inventory: Record<ItemType, number> = {
    wood: 0, stone: 0, berry: 0, mushroom: 0,
  };

  private starveTimer = 0;
  private hitTimer = 0; // parçacık efektleri için vuruş ritmi
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
  get inventoryTotal(): number {
    return this.inventory.wood + this.inventory.stone + this.inventory.berry + this.inventory.mushroom;
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
        switch (this.job.kind) {
          case "chop": return "Ağaca gidiyor";
          case "gather": return "Toplamaya gidiyor";
          case "mine": return "Taş ocağına gidiyor";
          case "build": return "Şantiyeye gidiyor";
          case "worship": return "Tapınağa gidiyor";
          case "deposit": return "Depoya taşıyor";
        }
        break;
      case "chopping":
        return "Ağaç kesiyor";
      case "gathering":
        return this.job?.kind === "gather" && this.job.item === "mushroom"
          ? "Mantar topluyor"
          : "Meyve topluyor";
      case "mining":
        return "Taş kazıyor";
      case "building":
        return "İnşaat yapıyor";
      case "worshipping":
        return "Tapınıyor";
      case "eating":
        return "Yemek yiyor";
    }
    return "";
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

    // Gece çöktü ve çalıştığı yer karanlıkta kaldıysa işi bırak
    if (
      isNight() &&
      !isLit(buildings, this.x, this.y) &&
      (this.state === "chopping" || this.state === "gathering" ||
        this.state === "mining" || this.state === "building" ||
        this.state === "worshipping")
    ) {
      this.releaseJob(world);
      this.toIdle();
    }

    switch (this.state) {
      case "idle":
        this.timer -= dt;
        if (this.timer <= 0) this.decide(world, buildings);
        break;
      case "walking":
        this.walk(dt, world, buildings);
        break;
      case "chopping":
        this.chop(dt, world);
        break;
      case "gathering":
        this.gather(dt, world);
        break;
      case "mining":
        this.mine(dt, world);
        break;
      case "building":
        this.build(dt);
        break;
      case "worshipping":
        this.worship(dt);
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
    switch (this.job.kind) {
      case "chop": world.claimedTrees.delete(this.job.tile); break;
      case "gather": world.claimedBushes.delete(this.job.tile); break;
      case "mine": world.claimedStones.delete(this.job.tile); break;
      case "build": this.job.building.claimed = false; break;
      case "worship": this.job.building.worshipClaimed = false; break;
      case "deposit": break;
    }
    this.job = null;
  }

  private canDo(kind: "chop" | "gather" | "mine" | "build"): boolean {
    if (this.profession === "worker") return true;
    return (
      (kind === "chop" && this.profession === "woodcutter") ||
      (kind === "gather" && this.profession === "gatherer") ||
      (kind === "mine" && this.profession === "miner") ||
      (kind === "build" && this.profession === "builder")
    );
  }

  private decide(world: World, buildings: Building[]): void {
    // 1) Acıkmışsa ve yemek varsa: ye
    if (this.hunger > EAT_THRESHOLD && foodTotal() >= FOOD_PER_MEAL) {
      this.state = "eating";
      this.timer = EAT_TIME;
      return;
    }

    // 2) Çanta dolduysa depoya/kampa taşı
    if (this.inventoryTotal >= DEPOSIT_AT && this.tryDeposit(world, buildings)) return;

    // Gece yalnızca ışıklı (meşale/kamp ateşi yakını) noktalarda çalışılır
    const lit = (wx: number, wy: number) => !isNight() || isLit(buildings, wx, wy);
    const litTile = (x: number, y: number) =>
      lit((x + 0.5) * TILE_SIZE, (y + 0.5) * TILE_SIZE);

    // 3) Mesleğine uygun en yakın işi seç
    type Candidate = { dist: number; start: () => boolean };
    const candidates: Candidate[] = [];

    if (this.canDo("build")) {
      for (const b of buildings) {
        if (b.done || b.claimed || !lit(b.centerX, b.centerY)) continue;
        const d = Math.abs(b.x + 1 - this.tileX) + Math.abs(b.y + 1 - this.tileY);
        candidates.push({
          dist: d,
          start: () => {
            const path = findPathAdjacentRect(
              world, this.tileX, this.tileY, b.x, b.y, b.size
            );
            if (!path) return false;
            b.claimed = true;
            this.job = { kind: "build", building: b };
            this.startPath(path);
            return true;
          },
        });
      }
    }

    // tapınak ayini (her meslek yapabilir; bilgi üretir)
    for (const b of buildings) {
      if (!b.worshipReady || !lit(b.centerX, b.centerY)) continue;
      const d = Math.abs(b.x + 1 - this.tileX) + Math.abs(b.y + 1 - this.tileY);
      candidates.push({
        dist: d,
        start: () => {
          const path = findPathAdjacentRect(
            world, this.tileX, this.tileY, b.x, b.y, b.size
          );
          if (!path) return false;
          b.worshipClaimed = true;
          this.job = { kind: "worship", building: b };
          this.startPath(path);
          return true;
        },
      });
    }

    if (this.canDo("chop") && !isFull("wood")) {
      const tree = world.findNearestMarked(
        world.markedTrees, world.claimedTrees, this.x, this.y, litTile
      );
      if (tree) {
        candidates.push({
          dist: tree.dist,
          start: () => this.startTileJob(world, tree.x, tree.y, (i) => {
            world.claimedTrees.add(i);
            this.job = { kind: "chop", tile: i };
          }),
        });
      }
    }

    if (this.canDo("gather")) {
      // deposu dolu olan yemek türünü toplamaya gitme; gece ışık şart
      const food = world.findNearestMarked(
        world.markedBushes, world.claimedBushes, this.x, this.y,
        (x, y) =>
          litTile(x, y) &&
          (world.get(x, y) === Tile.Mushroom ? !isFull("mushroom") : !isFull("berry"))
      );
      if (food) {
        candidates.push({
          dist: food.dist,
          start: () => this.startTileJob(world, food.x, food.y, (i) => {
            world.claimedBushes.add(i);
            const item = world.get(food.x, food.y) === Tile.Mushroom ? "mushroom" : "berry";
            this.job = { kind: "gather", tile: i, item };
          }),
        });
      }
    }

    if (this.canDo("mine") && !isFull("stone")) {
      const stone = world.findNearestMarked(
        world.markedStones, world.claimedStones, this.x, this.y, litTile
      );
      if (stone) {
        candidates.push({
          dist: stone.dist,
          start: () => this.startTileJob(world, stone.x, stone.y, (i) => {
            world.claimedStones.add(i);
            this.job = { kind: "mine", tile: i };
          }),
        });
      }
    }

    candidates.sort((a, b) => a.dist - b.dist);
    for (const c of candidates) {
      if (c.start()) return;
    }

    // 4) İş yoksa: çantada bir şey varsa teslim et, yoksa dolan
    if (this.inventoryTotal > 0 && this.tryDeposit(world, buildings)) return;

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

  private startTileJob(
    world: World,
    tx: number,
    ty: number,
    claim: (index: number) => void
  ): boolean {
    const path = findPathAdjacent(world, this.tileX, this.tileY, tx, ty);
    if (!path) return false;
    claim(world.index(tx, ty));
    this.startPath(path);
    return true;
  }

  private tryDeposit(world: World, buildings: Building[]): boolean {
    let best: Building | null = null;
    let bestDist = Infinity;
    for (const b of buildings) {
      if (!isDepositPoint(b)) continue;
      const d = Math.abs(b.x + 1 - this.tileX) + Math.abs(b.y + 1 - this.tileY);
      if (d < bestDist) {
        bestDist = d;
        best = b;
      }
    }
    if (!best) return false;
    const path = findPathAdjacentRect(world, this.tileX, this.tileY, best.x, best.y, best.size);
    if (!path) return false;
    this.job = { kind: "deposit", building: best };
    this.startPath(path);
    return true;
  }

  private startPath(path: PathNode[]): void {
    this.path = path;
    this.pathIdx = 0;
    this.state = "walking";
  }

  // İş yürürken iptal edildiyse (işaret kaldırıldı, depo doldu veya hedef karanlıkta)
  private jobStillValid(world: World, buildings: Building[]): boolean {
    if (!this.job) return true;
    const night = isNight();
    const tileLit = (tile: number) =>
      !night ||
      isLit(
        buildings,
        (tile % world.width + 0.5) * TILE_SIZE,
        (Math.floor(tile / world.width) + 0.5) * TILE_SIZE
      );
    switch (this.job.kind) {
      case "chop":
        return world.markedTrees.has(this.job.tile) && !isFull("wood") && tileLit(this.job.tile);
      case "gather":
        return world.markedBushes.has(this.job.tile) && !isFull(this.job.item) && tileLit(this.job.tile);
      case "mine":
        return world.markedStones.has(this.job.tile) && !isFull("stone") && tileLit(this.job.tile);
      case "build":
      case "worship":
        return !night || isLit(buildings, this.job.building.centerX, this.job.building.centerY);
      default:
        return true;
    }
  }

  private walk(dt: number, world: World, buildings: Building[]): void {
    if (!this.jobStillValid(world, buildings)) {
      this.releaseJob(world);
      this.toIdle();
      return;
    }

    if (this.pathIdx >= this.path.length) {
      this.arrive(world);
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
      if (this.pathIdx >= this.path.length) this.arrive(world);
    } else {
      this.x += (dx / dist) * step;
      this.y += (dy / dist) * step;
    }
  }

  private arrive(world: World): void {
    if (!this.job) {
      this.toIdle();
      return;
    }
    this.walkPhase = 0;
    this.hitTimer = 0;
    switch (this.job.kind) {
      case "chop":
        this.state = "chopping";
        this.timer = CHOP_TIME;
        break;
      case "gather":
        this.state = "gathering";
        this.timer = GATHER_TIME;
        break;
      case "mine":
        this.state = "mining";
        this.timer = MINE_TIME;
        break;
      case "build":
        this.state = "building";
        this.faceTowards(this.job.building.centerX);
        break;
      case "worship":
        this.state = "worshipping";
        this.timer = WORSHIP_TIME;
        this.faceTowards(this.job.building.centerX);
        break;
      case "deposit":
        this.doDeposit(world);
        break;
    }
  }

  private worship(dt: number): void {
    const job = this.job;
    if (!job || job.kind !== "worship") {
      this.toIdle();
      return;
    }
    this.walkPhase += dt * 3; // yavaş sallanarak dua
    this.timer -= dt;
    if (this.timer <= 0) {
      resources.knowledge += KNOWLEDGE_PER_WORSHIP;
      addFloater(
        job.building.centerX, job.building.y * TILE_SIZE - 6,
        `+${KNOWLEDGE_PER_WORSHIP} bilgi`, "#b08fe0"
      );
      job.building.worshipClaimed = false;
      job.building.worshipTimer = WORSHIP_INTERVAL;
      this.job = null;
      this.toIdle();
    }
  }

  private doDeposit(world: World): void {
    void world;
    const job = this.job;
    if (!job || job.kind !== "deposit") {
      this.toIdle();
      return;
    }
    let line = 0;
    for (const item of ITEM_TYPES) {
      const n = this.inventory[item];
      if (n <= 0) continue;
      const added = addItem(item, n);
      this.inventory[item] = 0;
      if (added > 0) {
        addFloater(
          job.building.centerX,
          job.building.centerY - 18 - line * 7,
          `+${added} ${ITEM_INFO[item].name}`,
          ITEM_INFO[item].color
        );
        line++;
      } else {
        addFloater(job.building.centerX, job.building.centerY - 18, "Depo dolu!", "#ff6655");
      }
    }
    this.job = null;
    this.toIdle();
  }

  private faceTowards(worldX: number): void {
    this.facing = worldX >= this.x ? 1 : -1;
  }

  // Çantaya sığdığı kadar ekle, kazanç yazısı göster
  private gainItem(item: ItemType, n: number, fx: number, fy: number): void {
    const gain = Math.min(n, INVENTORY_CAP - this.inventoryTotal);
    if (gain <= 0) return;
    this.inventory[item] += gain;
    addFloater(fx, fy, `+${gain} ${ITEM_INFO[item].name}`, ITEM_INFO[item].color);
  }

  // Vuruş ritmiyle parçacık saç (balta/kazma/çekiç efekti)
  private hitParticles(dt: number, x: number, y: number, color: string): void {
    this.hitTimer -= dt;
    if (this.hitTimer <= 0) {
      this.hitTimer = 0.45;
      burst(x, y, color, 4);
    }
  }

  private jobTileCenter(world: World, tile: number): { x: number; y: number } {
    return {
      x: (tile % world.width + 0.5) * TILE_SIZE,
      y: (Math.floor(tile / world.width) + 0.5) * TILE_SIZE,
    };
  }

  private chop(dt: number, world: World): void {
    const job = this.job;
    if (!job || job.kind !== "chop" || !world.markedTrees.has(job.tile)) {
      this.releaseJob(world);
      this.toIdle();
      return;
    }
    const c = this.jobTileCenter(world, job.tile);
    this.faceTowards(c.x);
    this.walkPhase += dt * 14; // hızlı kol sallama = balta vuruşu
    this.hitParticles(dt, c.x, c.y - 4, "#8a6a43");
    this.timer -= dt;
    if (this.timer <= 0) {
      world.chopTree(job.tile % world.width, Math.floor(job.tile / world.width));
      this.gainItem("wood", WOOD_PER_TREE, c.x, c.y - 10);
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
    const c = this.jobTileCenter(world, job.tile);
    this.faceTowards(c.x);
    this.walkPhase += dt * 7; // yavaş eğilip toplama
    this.timer -= dt;
    if (this.timer <= 0) {
      world.harvestFood(job.tile % world.width, Math.floor(job.tile / world.width));
      const amount = job.item === "mushroom" ? MUSHROOM_PER_PATCH : BERRY_PER_BUSH;
      this.gainItem(job.item, amount, c.x, c.y - 8);
      this.job = null;
      this.toIdle();
    }
  }

  private mine(dt: number, world: World): void {
    const job = this.job;
    if (!job || job.kind !== "mine" || !world.markedStones.has(job.tile)) {
      this.releaseJob(world);
      this.toIdle();
      return;
    }
    const c = this.jobTileCenter(world, job.tile);
    this.faceTowards(c.x);
    this.walkPhase += dt * 11; // kazma sallama
    this.hitParticles(dt, c.x, c.y - 2, "#aab0b8");
    this.timer -= dt;
    if (this.timer <= 0) {
      world.mineStone(job.tile % world.width, Math.floor(job.tile / world.width));
      this.gainItem("stone", STONE_PER_MINE, c.x, c.y - 10);
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
    this.hitParticles(dt, job.building.centerX, job.building.centerY - 4, "#c9a35a");
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
