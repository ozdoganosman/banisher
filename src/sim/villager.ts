import { addFloater, burst } from "../render/effects";
import { foodItemOf, Tile, TILE_SIZE } from "../world/tiles";
import type { World } from "../world/world";
import type { Animal } from "./animals";
import type { Building } from "./buildings";
import {
  AUTO_MARK_RADIUS,
  BuildingType,
  isDepositPoint,
  isLit,
  KNOWLEDGE_PER_WORSHIP,
  ROLE_NAMES,
  WORSHIP_INTERVAL,
  WORSHIP_TIME,
} from "./buildings";
import { babyIdentity, randomIdentity, type Identity } from "./names";
import { hasTech } from "./tech";
import { isNight, isSleepTime, totalDays } from "./time";
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
const STONE_PER_MINE = 3;

const FISH_TIME = 6;
const FISH_PER_CATCH = 2;
const TEND_TIME = 2.5;

// Toplanabilir yemeklerin verimi (eşya başına)
const GATHER_YIELD: Partial<Record<ItemType, number>> = {
  berry: 4, mushroom: 3, apple: 3, orange: 3, tangerine: 3, nut: 3,
};

// Teknolojiye göre değişen değerler
function invCap(): number {
  return hasTech("bags") ? 12 : 8;
}
function depositAt(): number {
  return invCap() - 2;
}
function chopTime(): number {
  return hasTech("axes") ? CHOP_TIME * 0.75 : CHOP_TIME;
}
function forageBonus(): number {
  return hasTech("forage") ? 1 : 0;
}

const HUNGER_RATE = 100 / 150; // 150 saniyede 0 -> 100
const EAT_THRESHOLD = 65;
const EAT_TIME = 1.2;
const FOOD_PER_MEAL = 2;
const HUNGER_PER_MEAL = 55;
const STARVE_TIME = 45;

const GROW_DAYS = 4; // bebek bu kadar günde büyür (bakımevi varsa yarısı)
const GROW_DAYS_NURSERY = 2;

const SHIRT_COLORS = ["#c0392b", "#2980b9", "#8e44ad", "#d35400", "#16a085"];
let shirtIndex = 0;

// Banished tarzı iş bazlı görevler: herkes varsayılan ortalık işçisidir,
// inşaatçılık sayıyla, üretim işleri bina bazlı istihdamla yönetilir
export type Assignment =
  | { kind: "laborer" } // ortalık işleri: elle işaretlenen her şey + taşıma
  | { kind: "builder" } // şantiyelerde çalışır
  | { kind: "building"; building: Building }; // belirli bir binada istihdam

export function assignmentLabel(a: Assignment): string {
  switch (a.kind) {
    case "laborer": return "Ortalık işleri";
    case "builder": return "İnşaatçı";
    case "building":
      return `${ROLE_NAMES[a.building.type] ?? "Çalışan"} • ${a.building.def.name}`;
  }
}


type VillagerState =
  | "idle"
  | "walking"
  | "chopping"
  | "gathering"
  | "mining"
  | "building"
  | "worshipping"
  | "fishing"
  | "tending"
  | "sleeping"
  | "eating";

type Job =
  | { kind: "chop"; tile: number }
  | { kind: "gather"; tile: number; item: ItemType }
  | { kind: "mine"; tile: number }
  | { kind: "fish"; tile: number }
  | { kind: "tend"; animal: Animal }
  | { kind: "hunt"; animal: Animal }
  | { kind: "build"; building: Building }
  | { kind: "worship"; building: Building }
  | { kind: "sleep"; building: Building | null }
  | { kind: "eat"; building: Building }
  | { kind: "deposit"; building: Building };

export class Villager {
  x: number; // dünya-piksel (ayakların bastığı nokta)
  y: number;
  state: VillagerState = "idle";
  shirt: string;
  facing: 1 | -1 = 1;
  walkPhase = 0; // bacak/kol salınımı için
  hunger: number;
  morale = 80; // evsiz yerde yatanların morali düşer, evde uyuyanın yükselir
  groundSleep = false; // bu gece yerde mi uyuyor
  dead = false;
  assignment: Assignment = { kind: "laborer" };
  baby: boolean;
  birthDay: number; // doğduğu gün (toplam gün sayısı)
  grewUp = false; // main bunu görünce "büyüdü" bildirimi gösterir
  home: Building | null = null; // atandığı konut (ev/kamp)
  readonly identity: Identity;
  // Kişisel çanta: toplananlar önce buraya, sonra kampa/depoya gider
  readonly inventory: Record<ItemType, number> = Object.fromEntries(
    ITEM_TYPES.map((t) => [t, 0])
  ) as Record<ItemType, number>;

  private starveTimer = 0;
  private atCafeteria = false; // şu anki yemek yemekhanede mi
  private hitTimer = 0; // parçacık efektleri için vuruş ritmi
  private path: PathNode[] = [];
  private pathIdx = 0;
  private timer = 1 + Math.random() * 2;
  private job: Job | null = null;

  constructor(tileX: number, tileY: number, baby = false) {
    this.x = (tileX + 0.5) * TILE_SIZE;
    this.y = (tileY + 0.5) * TILE_SIZE;
    this.shirt = SHIRT_COLORS[shirtIndex++ % SHIRT_COLORS.length];
    this.hunger = baby ? 0 : Math.random() * 30;
    this.baby = baby;
    this.birthDay = totalDays();
    this.identity = baby ? babyIdentity() : randomIdentity();
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
    let total = 0;
    for (const item of ITEM_TYPES) total += this.inventory[item];
    return total;
  }

  get fullName(): string {
    return `${this.identity.firstName} ${this.identity.lastName}`.trim();
  }

  get ageDays(): number {
    return totalDays() - this.birthDay;
  }

  // Profil panelinde gösterilen anlık durum
  get statusText(): string {
    if (this.baby) return `Bebek (${this.ageDays} günlük)`;
    switch (this.state) {
      case "idle":
        return this.starving ? "Açlıktan bitkin" : "Dinleniyor";
      case "walking":
        if (!this.job) return "Geziniyor";
        switch (this.job.kind) {
          case "chop": return "Ağaca gidiyor";
          case "gather": return "Toplamaya gidiyor";
          case "mine": return "Taş ocağına gidiyor";
          case "fish": return "Kıyıya gidiyor";
          case "tend": return "Hayvana gidiyor";
          case "hunt": return "Ava gidiyor";
          case "build": return "Şantiyeye gidiyor";
          case "worship": return "Tapınağa gidiyor";
          case "sleep":
            return this.job.building && this.job.building === this.home
              ? "Eve dönüyor" : "Kampa dönüyor";
          case "eat": return "Yemekhaneye gidiyor";
          case "deposit": return "Depoya taşıyor";
        }
        break;
      case "chopping":
        return "Ağaç kesiyor";
      case "gathering": {
        if (this.job?.kind !== "gather") return "Topluyor";
        const n = ITEM_INFO[this.job.item].name;
        return `${n[0].toUpperCase()}${n.slice(1)} topluyor`;
      }
      case "tending":
        return this.job?.kind === "hunt" ? "Avlanıyor" : "Hayvanla ilgileniyor";
      case "mining":
        return "Taş kazıyor";
      case "fishing":
        return "Balık tutuyor";
      case "building":
        return "İnşaat yapıyor";
      case "worshipping":
        return "Tapınıyor";
      case "sleeping":
        return this.groundSleep ? "Yerde uyuyor" : "Uyuyor";
      case "eating":
        return "Yemek yiyor";
    }
    return "";
  }

  update(dt: number, world: World, buildings: Building[], animals: Animal[]): void {
    const hasNursery = buildings.some(
      (b) => b.type === BuildingType.Nursery && b.done
    );

    // Bebek büyümesi: bakımevi varsa iki kat hızlı
    if (this.baby && this.ageDays >= (hasNursery ? GROW_DAYS_NURSERY : GROW_DAYS)) {
      this.baby = false;
      this.grewUp = true;
      this.identity.age = 16;
      this.assignment = { kind: "laborer" };
    }

    // açlık her durumda işler; bakımevi bebeklere bakar: acıkmaz, toparlanır
    if (this.baby && hasNursery) {
      this.hunger = Math.max(0, this.hunger - 8 * dt);
    } else {
      this.hunger = Math.min(100, this.hunger + HUNGER_RATE * dt);
    }
    if (this.starving) {
      this.starveTimer += dt;
      if (this.starveTimer >= STARVE_TIME) {
        this.die(world);
        return;
      }
    } else {
      this.starveTimer = 0;
    }

    // Gece çöktü ve çalıştığı yer karanlıkta kaldıysa, ya da uyku vakti
    // geldiyse işi bırak
    const working =
      this.state === "chopping" || this.state === "gathering" ||
      this.state === "mining" || this.state === "building" ||
      this.state === "worshipping" || this.state === "fishing" ||
      this.state === "tending";
    if (working && ((isNight() && !isLit(buildings, this.x, this.y)) || isSleepTime())) {
      this.releaseJob(world);
      this.toIdle();
    }

    // sabah oldu: uyan
    if (this.state === "sleeping" && !isSleepTime()) {
      this.groundSleep = false;
      this.toIdle();
    }

    // uyurken moral değişir: evde dinlenmek iyi, yerde yatmak kötü
    if (this.state === "sleeping") {
      this.morale = Math.max(
        0,
        Math.min(100, this.morale + (this.groundSleep ? -0.45 : 0.3) * dt)
      );
      this.walkPhase += dt; // "z" animasyonu
      return;
    }

    switch (this.state) {
      case "idle":
        this.timer -= dt;
        if (this.timer <= 0) this.decide(world, buildings, animals);
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
      case "fishing":
        this.fish(dt, world);
        break;
      case "tending":
        this.tend(dt);
        break;
      case "worshipping":
        this.worship(dt);
        break;
      case "eating":
        this.timer -= dt;
        if (this.timer <= 0) {
          if (takeFood(FOOD_PER_MEAL)) {
            // yemekhanede yenen yemek tokluğu tamamen doldurur
            this.hunger = this.atCafeteria
              ? 0
              : Math.max(0, this.hunger - HUNGER_PER_MEAL);
          }
          this.atCafeteria = false;
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
      case "tend": this.job.animal.claimed = false; break;
      case "hunt": this.job.animal.claimed = false; break;
      case "worship": this.job.building.worshipClaimed = false; break;
      case "deposit": break;
    }
    this.job = null;
  }


  private decide(world: World, buildings: Building[], animals: Animal[]): void {
    // 1) Acıkmışsa ve yemek varsa: ye (varsa yemekhanede — tokluk tam dolar)
    if (this.hunger > EAT_THRESHOLD && foodTotal() >= FOOD_PER_MEAL) {
      if (!this.baby) {
        let cafe: Building | null = null;
        let cafeDist = Infinity;
        for (const b of buildings) {
          if (b.type !== BuildingType.Cafeteria || !b.done) continue;
          const d = Math.abs(b.x + 1 - this.tileX) + Math.abs(b.y + 1 - this.tileY);
          if (d < cafeDist) {
            cafeDist = d;
            cafe = b;
          }
        }
        if (cafe) {
          const path = findPathAdjacentRect(
            world, this.tileX, this.tileY, cafe.x, cafe.y, cafe.size
          );
          if (path) {
            this.job = { kind: "eat", building: cafe };
            this.startPath(path);
            return;
          }
        }
      }
      this.state = "eating";
      this.timer = EAT_TIME;
      return;
    }

    // Uyku vakti: eve (yoksa kampın yanına) git ve uyu
    if (isSleepTime()) {
      this.goSleep(world, buildings);
      return;
    }

    // Bebekler çalışmaz: evlerinin (varsa bakımevinin) etrafında oyalanır
    if (this.baby) {
      const nursery = buildings.find((b) => b.type === BuildingType.Nursery && b.done);
      const anchor = nursery ?? this.home;
      const ax = anchor ? Math.floor(anchor.centerX / TILE_SIZE) : this.tileX;
      const ay = anchor ? Math.floor(anchor.centerY / TILE_SIZE) : this.tileY;
      for (let attempt = 0; attempt < 8; attempt++) {
        const tx = ax + Math.floor((Math.random() * 2 - 1) * 3);
        const ty = ay + Math.floor((Math.random() * 2 - 1) * 3);
        if (!world.walkableAt(tx, ty)) continue;
        const path = findPath(world, this.tileX, this.tileY, tx, ty);
        if (path) {
          this.startPath(path);
          return;
        }
      }
      this.timer = 1.5 + Math.random() * 2;
      return;
    }

    // 2) Çanta dolduysa depoya/kampa taşı
    // (deposu dolu ürünler için boş yere gidip gelme: teslim edilebilir olmalı)
    const depositable = ITEM_TYPES.some(
      (it) => this.inventory[it] > 0 && !isFull(it)
    );
    if (this.inventoryTotal >= depositAt() && depositable && this.tryDeposit(world, buildings)) {
      return;
    }
    // çanta tamamen doluysa yeni hasat kaybolur: iş alma, bekle
    const bagFull = this.inventoryTotal >= invCap();

    // Gece yalnızca ışıklı (meşale/kamp ateşi yakını) noktalarda çalışılır
    const lit = (wx: number, wy: number) => !isNight() || isLit(buildings, wx, wy);
    const litTile = (x: number, y: number) =>
      lit((x + 0.5) * TILE_SIZE, (y + 0.5) * TILE_SIZE);

    // 3) Görevine uygun en yakın işi seç
    type Candidate = { dist: number; start: () => boolean };
    const candidates: Candidate[] = [];
    const a = this.assignment;

    if (a.kind === "builder") {
      // inşaatçılar şantiyelerde çalışır
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
    } else if (a.kind === "building") {
      // bina çalışanı: yalnızca kendi binasının işini, çalışma alanı içinde yapar
      const hut = a.building;
      const hx = hut.x + 1;
      const hy = hut.y + 1;
      const inArea = (x: number, y: number) =>
        Math.abs(x - hx) <= AUTO_MARK_RADIUS && Math.abs(y - hy) <= AUTO_MARK_RADIUS;

      if (hut.type === BuildingType.Woodcutter && !isFull("wood") && !bagFull) {
        this.pushTileJobCandidate(
          world, candidates, world.markedTrees, world.claimedTrees,
          (x, y) => inArea(x, y) && litTile(x, y),
          (i) => {
            world.claimedTrees.add(i);
            this.job = { kind: "chop", tile: i };
          }
        );
      } else if (hut.type === BuildingType.Gatherer && !bagFull) {
        this.pushTileJobCandidate(
          world, candidates, world.markedBushes, world.claimedBushes,
          (x, y) => {
            const item = foodItemOf(world.get(x, y));
            return !!item && inArea(x, y) && litTile(x, y) && !isFull(item);
          },
          (i, fx, fy) => {
            world.claimedBushes.add(i);
            const item = foodItemOf(world.get(fx, fy)) ?? "berry";
            this.job = { kind: "gather", tile: i, item };
          }
        );
      } else if (hut.type === BuildingType.Fisher) {
        if (!isFull("fish") && !bagFull) {
          // kulübe alanında su komşusu olan kıyı bloğu bul, oraya git
          const spot = world.findShoreNear(hx, hy, AUTO_MARK_RADIUS, this.tileX, this.tileY);
          if (spot && litTile(spot.x, spot.y)) {
            candidates.push({
              dist: Math.abs(spot.x - this.tileX) + Math.abs(spot.y - this.tileY),
              start: () => {
                const path = findPath(world, this.tileX, this.tileY, spot.x, spot.y);
                if (!path) return false;
                this.job = { kind: "fish", tile: world.index(spot.x, spot.y) };
                this.startPath(path);
                return true;
              },
            });
          }
        }
      } else if (hut.type === BuildingType.Barn) {
        if (!bagFull) {
          let bestA: Animal | null = null;
          let bestD = Infinity;
          for (const a of animals) {
            if (a.barn !== hut || !a.ready || !lit(a.x, a.y)) continue;
            const d = Math.abs(a.x - this.x) + Math.abs(a.y - this.y);
            if (d < bestD) {
              bestD = d;
              bestA = a;
            }
          }
          if (bestA) {
            const target = bestA;
            candidates.push({
              dist: bestD / TILE_SIZE,
              start: () => {
                const path = findPath(
                  world, this.tileX, this.tileY,
                  Math.floor(target.x / TILE_SIZE), Math.floor(target.y / TILE_SIZE)
                );
                if (!path) return false;
                target.claimed = true;
                this.job = { kind: "tend", animal: target };
                this.startPath(path);
                return true;
              },
            });
          }
        }
      } else if (hut.type === BuildingType.Temple) {
        if (hut.worshipReady && lit(hut.centerX, hut.centerY)) {
          candidates.push({
            dist: 0,
            start: () => {
              const path = findPathAdjacentRect(
                world, this.tileX, this.tileY, hut.x, hut.y, hut.size
              );
              if (!path) return false;
              hut.worshipClaimed = true;
              this.job = { kind: "worship", building: hut };
              this.startPath(path);
              return true;
            },
          });
        }
      }
    } else {
      // av: oyuncunun işaretlediği yabani hayvanlar
      if (!bagFull && !isFull("meat")) {
        let bestA: Animal | null = null;
        let bestD = Infinity;
        for (const a of animals) {
          if (!a.hunted || a.claimed || a.dead || !lit(a.x, a.y)) continue;
          const d = Math.abs(a.x - this.x) + Math.abs(a.y - this.y);
          if (d < bestD) {
            bestD = d;
            bestA = a;
          }
        }
        if (bestA) {
          const target = bestA;
          candidates.push({
            dist: bestD / TILE_SIZE,
            start: () => {
              const path = findPath(
                world, this.tileX, this.tileY,
                Math.floor(target.x / TILE_SIZE), Math.floor(target.y / TILE_SIZE)
              );
              if (!path) return false;
              target.claimed = true;
              this.job = { kind: "hunt", animal: target };
              this.startPath(path);
              return true;
            },
          });
        }
      }

      // ortalık işçisi: elle/kulübece işaretlenmiş her kaynağa gider
      if (!isFull("wood") && !bagFull) {
        this.pushTileJobCandidate(
          world, candidates, world.markedTrees, world.claimedTrees, litTile,
          (i) => {
            world.claimedTrees.add(i);
            this.job = { kind: "chop", tile: i };
          }
        );
      }

      if (!bagFull) {
        this.pushTileJobCandidate(
          world, candidates, world.markedBushes, world.claimedBushes,
          (x, y) => {
            const item = foodItemOf(world.get(x, y));
            return !!item && litTile(x, y) && !isFull(item);
          },
          (i, fx, fy) => {
            world.claimedBushes.add(i);
            const item = foodItemOf(world.get(fx, fy)) ?? "berry";
            this.job = { kind: "gather", tile: i, item };
          }
        );
      }

      if (!isFull("stone") && !bagFull) {
        this.pushTileJobCandidate(
          world, candidates, world.markedStones, world.claimedStones, litTile,
          (i) => {
            world.claimedStones.add(i);
            this.job = { kind: "mine", tile: i };
          }
        );
      }
    }

    candidates.sort((c1, c2) => c1.dist - c2.dist);
    for (const c of candidates) {
      if (c.start()) return;
    }

    // 4) İş yoksa: çantada teslim edilebilir bir şey varsa teslim et, yoksa dolan
    // (bina çalışanları iş yerlerinin çevresinde bekler)
    if (this.inventoryTotal > 0 && depositable && this.tryDeposit(world, buildings)) return;

    const anchor = a.kind === "building" ? a.building : null;
    const ax = anchor ? Math.floor(anchor.centerX / TILE_SIZE) : this.tileX;
    const ay = anchor ? Math.floor(anchor.centerY / TILE_SIZE) : this.tileY;
    const r = anchor ? 4 : 6;
    for (let attempt = 0; attempt < 8; attempt++) {
      const tx = ax + Math.floor((Math.random() * 2 - 1) * r);
      const ty = ay + Math.floor((Math.random() * 2 - 1) * r);
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

  // İşaretli blok işi adayı ekler; en yakın hedefe yol yoksa
  // sıradaki birkaç hedefi dener (işçiler boşuna beklemesin)
  private pushTileJobCandidate(
    world: World,
    candidates: { dist: number; start: () => boolean }[],
    marked: Set<number>,
    claimed: Set<number>,
    accept: (x: number, y: number) => boolean,
    claim: (index: number, x: number, y: number) => void
  ): void {
    const first = world.findNearestMarked(marked, claimed, this.x, this.y, accept);
    if (!first) return;
    candidates.push({
      dist: first.dist,
      start: () => {
        const tried = new Set<number>();
        for (let k = 0; k < 4; k++) {
          const t = world.findNearestMarked(
            marked, claimed, this.x, this.y,
            (x, y) => !tried.has(world.index(x, y)) && accept(x, y)
          );
          if (!t) return false;
          if (this.startTileJob(world, t.x, t.y, (i) => claim(i, t.x, t.y))) return true;
          tried.add(world.index(t.x, t.y));
        }
        return false;
      },
    });
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

  // Eve, ev yoksa kampın çevresine gidip uyu (evsizler yerde yatar)
  private goSleep(world: World, buildings: Building[]): void {
    const target =
      this.home ??
      buildings.find((b) => b.type === BuildingType.Camp && b.done) ??
      null;
    this.groundSleep = !this.home;
    if (target) {
      const near = TILE_SIZE * (this.groundSleep ? 3.5 : 2.5);
      const d = Math.abs(this.x - target.centerX) + Math.abs(this.y - target.centerY);
      if (d <= near) {
        this.state = "sleeping";
        this.walkPhase = 0;
        return;
      }
      // evsizler kampın çevresine dağılarak yatar (üst üste yığılmasınlar)
      if (this.groundSleep) {
        const cx = Math.floor(target.centerX / TILE_SIZE);
        const cy = Math.floor(target.centerY / TILE_SIZE);
        for (let attempt = 0; attempt < 8; attempt++) {
          const tx = cx + Math.floor((Math.random() * 2 - 1) * 3.5);
          const ty = cy + Math.floor((Math.random() * 2 - 1) * 3.5);
          if (!world.walkableAt(tx, ty)) continue;
          const path = findPath(world, this.tileX, this.tileY, tx, ty);
          if (path) {
            this.job = { kind: "sleep", building: target };
            this.startPath(path);
            return;
          }
        }
      }
      const path = findPathAdjacentRect(
        world, this.tileX, this.tileY, target.x, target.y, target.size
      );
      if (path) {
        this.job = { kind: "sleep", building: target };
        this.startPath(path);
        return;
      }
    }
    // hedefe ulaşılamıyorsa olduğu yerde uyu
    this.state = "sleeping";
    this.walkPhase = 0;
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
      case "fish":
        return !isFull("fish") && tileLit(this.job.tile);
      case "tend":
        return !this.job.animal.dead;
      case "hunt":
        return !this.job.animal.dead && this.job.animal.hunted;
      case "build":
      case "worship":
        return !this.job.building.removed &&
          (!night || isLit(buildings, this.job.building.centerX, this.job.building.centerY));
      case "sleep":
        return isSleepTime();
      case "eat":
        return foodTotal() >= FOOD_PER_MEAL; // hayatta kalma: ışık aranmaz
      case "deposit":
        return !this.job.building.removed;
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
    let speed = this.starving ? WALK_SPEED * 0.5 : WALK_SPEED;
    if (this.baby) speed *= 0.55; // bebekler tıpış tıpış yürür
    speed *= 0.8 + this.morale / 500; // morali düşük köylü ağır çalışır
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
        this.timer = chopTime();
        break;
      case "gather":
        this.state = "gathering";
        this.timer = GATHER_TIME;
        break;
      case "mine":
        this.state = "mining";
        this.timer = MINE_TIME;
        break;
      case "fish": {
        this.state = "fishing";
        this.timer = FISH_TIME;
        // yüzünü suya dön
        const fx = this.job.tile % world.width;
        const fy = Math.floor(this.job.tile / world.width);
        if (world.inBounds(fx + 1, fy) && world.get(fx + 1, fy) === Tile.Water) this.facing = 1;
        else if (world.inBounds(fx - 1, fy) && world.get(fx - 1, fy) === Tile.Water) this.facing = -1;
        break;
      }
      case "tend":
      case "hunt":
        this.state = "tending";
        this.timer = TEND_TIME;
        this.faceTowards(this.job.animal.x);
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
      case "sleep":
        this.job = null;
        this.state = "sleeping";
        this.walkPhase = 0;
        break;
      case "eat":
        this.atCafeteria = true;
        this.job = null;
        this.state = "eating";
        this.timer = EAT_TIME;
        break;
      case "deposit":
        this.doDeposit(world);
        break;
    }
  }

  private worship(dt: number): void {
    const job = this.job;
    if (!job || job.kind !== "worship" || job.building.removed) {
      if (job?.kind === "worship") job.building.worshipClaimed = false;
      this.job = null;
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
    let anyFull = false;
    for (const item of ITEM_TYPES) {
      const n = this.inventory[item];
      if (n <= 0) continue;
      const added = addItem(item, n);
      // sığmayanlar çantada kalır (depo boşalınca tekrar denenir)
      this.inventory[item] = n - added;
      if (added > 0) {
        addFloater(
          job.building.centerX,
          job.building.centerY - 18 - line * 7,
          `+${added} ${ITEM_INFO[item].name}`,
          ITEM_INFO[item].color
        );
        line++;
      }
      if (added < n) anyFull = true;
    }
    if (anyFull) {
      addFloater(job.building.centerX, job.building.centerY - 18 - line * 7, "Depo dolu!", "#ff6655");
    }
    this.job = null;
    this.toIdle();
  }

  private faceTowards(worldX: number): void {
    this.facing = worldX >= this.x ? 1 : -1;
  }

  // Çantaya sığdığı kadar ekle, kazanç yazısı göster
  private gainItem(item: ItemType, n: number, fx: number, fy: number): void {
    const gain = Math.min(n, invCap() - this.inventoryTotal);
    if (gain > 0) {
      this.inventory[item] += gain;
      addFloater(fx, fy, `+${gain} ${ITEM_INFO[item].name}`, ITEM_INFO[item].color);
    }
    if (gain < n) addFloater(fx, fy + 7, "Çanta dolu!", "#b8b2a0");
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
      this.gainItem("wood", WOOD_PER_TREE + (hasTech("axes") ? 1 : 0), c.x, c.y - 10);
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
      const amount = (GATHER_YIELD[job.item] ?? 3) + forageBonus();
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

  private fish(dt: number, world: World): void {
    const job = this.job;
    if (!job || job.kind !== "fish" || isFull("fish")) {
      this.job = null;
      this.toIdle();
      return;
    }
    this.walkPhase += dt * 2; // olta hafifçe sallanır
    this.timer -= dt;
    if (this.timer <= 0) {
      const c = this.jobTileCenter(world, job.tile);
      this.gainItem("fish", FISH_PER_CATCH + forageBonus(), c.x, c.y - 10);
      this.job = null;
      this.toIdle();
    }
  }

  private tend(dt: number): void {
    const job = this.job;
    if (!job || (job.kind !== "tend" && job.kind !== "hunt") || job.animal.dead) {
      if (job?.kind === "tend" || job?.kind === "hunt") job.animal.claimed = false;
      this.job = null;
      this.toIdle();
      return;
    }
    this.walkPhase += dt * 7;
    this.timer -= dt;
    if (this.timer <= 0) {
      const a = job.animal;
      if (job.kind === "hunt") {
        // av: hayvan gider, et gelir
        this.gainItem("meat", a.def.huntYield, a.x, a.y - 10);
        a.slaughtered = true;
        a.dead = true;
      } else {
        this.gainItem(a.def.product, a.def.yieldAmount, a.x, a.y - 10);
        if (a.def.slaughter) {
          a.slaughtered = true;
          a.dead = true;
        } else {
          a.produceTimer = a.def.interval;
        }
      }
      a.claimed = false;
      this.job = null;
      this.toIdle();
    }
  }

  private build(dt: number): void {
    const job = this.job;
    if (!job || job.kind !== "build" || job.building.removed) {
      if (job?.kind === "build") job.building.claimed = false;
      this.job = null;
      this.toIdle();
      return;
    }
    this.walkPhase += dt * 12; // çekiç sallama
    this.hitParticles(dt, job.building.centerX, job.building.centerY - 4, "#c9a35a");
    job.building.progress += dt * (hasTech("construction") ? 1.3 : 1);
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
    this.timer = 0.3 + Math.random() * 0.7;
  }
}
