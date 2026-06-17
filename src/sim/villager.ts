import { sfxHit, sfxStep, sfxWhoosh } from "../engine/sound";
import { addFloater, burst, throwSpearFx } from "../render/effects";
import { foodItemOf, Tile, TILE_SIZE } from "../world/tiles";
import type { World } from "../world/world";
import { ANIMAL_DEFS, TAME_TARGET, BARN_CAPACITY, type Animal } from "./animals";
import type { Building } from "./buildings";
import {
  AUTO_MARK_RADIUS,
  AXE_CRAFT_TIME,
  AXE_STONE_COST,
  AXE_WOOD_COST,
  CLOTH_CRAFT_TIME,
  CLOTH_LEATHER_COST,
  SPLIT_BRANCH_YIELD,
  SPLIT_LOG_COST,
  SPLIT_TIME,
  BuildingType,
  isDepositPoint,
  isLit,
  lightRadiusOf,
  worshipState,
  MAX_CARRIED_SPEARS,
  ROLE_NAMES,
  SPEAR_CRAFT_TIME,
  SPEAR_LOG_COST,
  SPEAR_STONE_COST,
  SPEAR_WOOD_COST,
  WORSHIP_TIME,
} from "./buildings";
import { difficulty } from "./difficulty";
import { coldSnapActive } from "./events";
import { bountyActive } from "./divine";
import { policy } from "./policy";
import { addJournal } from "./journal";
import { babyIdentity, randomIdentity, type Identity } from "./names";
import { hasTech } from "./tech";
import { isNight, isSleepTime, season, totalDays, dayFrac, tuning, DAYS_PER_YEAR } from "./time";
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
  type ItemType,
  FOOD_TYPES,
  FOOD_NUTRITION,
} from "./resources";

const WALK_SPEED = 36; // dünya-piksel / saniye
const CHOP_TIME = 8; // elle dal toplama: yavaş iş
const CHOP_TIME_AXE = 5; // baltayla kesim daha hızlı
const AXE_LOG_YIELD = 3; // devrilen ağaç kütük (odun) verir
const AXE_BRANCH_BONUS = 1; // tepesinden bir tutam da dal düşer
const GATHER_TIME = 8; // elle yemiş/mantar toplama: dal toplamayla aynı yavaşlıkta
const MINE_TIME = 4;
const STONE_PER_MINE = 3;
const PEBBLE_YIELD = 2; // çakıl elle toplanır, daha az taş verir

const FISH_TIME = 6;
const SPEAR_DAMAGE = 2; // mızrak isabeti
const SPEAR_THROW_RANGE = 4.5 * TILE_SIZE;
const SPEAR_THROW_TIME = 1.3; // atışlar arası süre
const MELEE_RANGE = 12; // baltayla yakın dövüş (dünya-piksel)
const MELEE_DAMAGE = 3;
const HUNT_GIVEUP_RANGE = 15 * TILE_SIZE; // mızrak attıktan sonra av bu kadar kaçarsa bırak
const HUNT_APPROACH_RANGE = 40 * TILE_SIZE; // ava yaklaşma için mutlak üst sınır
const EVENING_FRAC = 17 / 24; // 23:00 — iş biter, ateş başına toplanılır
const COLD_MORALE_RATE = 0.022; // kışın giysisiz dışarıda olmanın moral bedeli (sn başına)
const FISH_PER_CATCH = 2;
const TEND_TIME = 2.5;
const TAME_TIME = 6; // evcilleştirme: sabırlı yaklaşma
const PLANT_TIME = 2;
const FOOD_TARGET = 14; // toplayıcının alanında hedef çalı/mantar/yemiş

// Toplanabilir yemeklerin verimi (eşya başına)
const GATHER_YIELD: Partial<Record<ItemType, number>> = {
  berry: 5, mushroom: 2,
};

// Teknolojiye göre değişen değerler
function invCap(): number {
  return 8;
}
function depositAt(): number {
  return invCap() - 2;
}
function chopTime(): number {
  return CHOP_TIME;
}
function gatherTime(): number {
  return GATHER_TIME;
}
function forageBonus(): number {
  return bountyActive() ? 3 : 0; // Kehanet: Bereket — toplama verimi artar
}

// Günlük açlık zorluk seviyesinden, gün süresi tuning'den okunur
function hungerRate(): number {
  return difficulty.hungerPerDay / tuning.dayLength;
}
export const EAT_THRESHOLD = 40;
const EAT_TIME = 1.2;
const STARVE_TIME = 45;
const FAR_JOB_THRESHOLD = 25; // karolar cinsinden çok uzak iş mesafesi

// Yaşam evreleri: bebek annesine/bakımevine muhtaçtır,
// çocuk kendi gezer ama çalışamaz, 18'inde işe başlar.
// Büyüme çağı hızlı akar (günde 2 yaş); 18'den sonra normal takvim (1 yıl = 4 gün)
export const BABY_UNTIL_AGE = 7;
export const WORK_AGE = 18;
const CHILD_YEARS_PER_DAY = 2;
export const PREGNANCY_DAYS = 4; // karın 4 gün boyunca büyür, 4. günün sabahı doğum
const PREGNANCY_MORALE = 12; // hamilelik boyunca toplam moral kaybı (doğumda geri gelir)

const SHIRT_COLORS = ["#c0392b", "#2980b9", "#8e44ad", "#d35400", "#16a085"];
let shirtIndex = 0;

// Korku araştırması: tehlikedeki köylü çığlık atar, duyan silahlılar koşar
export const screams: { x: number; y: number; animal: Animal; ttl: number }[] = [];
const SCREAM_RANGE = 16 * TILE_SIZE;
const SCREAM_TTL = 6;

export function updateScreams(dt: number): void {
  for (let i = screams.length - 1; i >= 0; i--) {
    screams[i].ttl -= dt;
    if (screams[i].ttl <= 0 || screams[i].animal.dead) screams.splice(i, 1);
  }
}

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
  | "planting"
  | "tending"
  | "crafting"
  | "hunting"
  | "sleeping"
  | "eating";

type Job =
  | { kind: "chop"; tile: number; auto?: boolean }
  | { kind: "gather"; tile: number; item: ItemType; auto?: boolean }
  | { kind: "mine"; tile: number; auto?: boolean }
  | { kind: "fish"; tile: number }
  | { kind: "plant"; tile: number; target: Tile }
  | { kind: "tend"; animal: Animal }
  | { kind: "hunt"; animal: Animal }
  | { kind: "tame"; animal: Animal; barn: Building | null }
  | { kind: "build"; building: Building }
  | { kind: "worship"; building: Building; tile: number }
  | { kind: "craft"; building: Building; product: "axe" | "spear" | "cloth" }
  | { kind: "pickup"; building: Building; product: "axe" | "spear" | "cloth"; amount: number }
  | { kind: "spearhunt"; animal: Animal; thrown: number }
  | { kind: "split"; building: Building }
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
  morale = 20; // düşük başlar; moral kaynaklarıyla (ev, ileride eğlence) yükselir
  // Moral dökümü: neden bazında birikimli +/- toplamlar (profil panelinde gösterilir)
  readonly moraleLog = new Map<string, number>();
  sleepAccumulator = 0; // uyku süresi biriktirici (saniye)
  groundSleep = false; // bu gece yerde mi uyuyor
  dead = false;
  deathCause: "hunger" | "predator" = "hunger";
  hp = 100; // yırtıcı saldırılarıyla azalır, zamanla iyileşir
  hitFlash = 0; // ısırık yendiği anda kırmızı parlar
  attackAnim = 0; // fırlatma/saplama animasyon sayacı (renderer okur)
  educated = false; // bakımevinde yetişen çocuk: %20 hız bonusu
  hasAxe = false; // atölyeden balta aldı: ağaçları kesip odun çıkarır
  hasClothes = false; // deri giysi: kışın üşümez ve yavaşlamaz
  spears = 0; // taşınan mızrak (en çok 5); avcılar atölyeden alır
  fleeTimer = 0; // yırtıcıdan kaçış
  pleadingTtl = 0; // Merak: oyuncuya yakarıyor (tıklanıp teskin edilebilir)
  shockTtl = 0; // teskin edildi: kısa süre şokta donar
  sickUntilDay = -1; // hastalık olayı: bu güne dek halsiz (yavaş yürür/çalışır)
  prophetUntilDay = -1; // İlahî güç: bu güne dek peygamber (aura yayar, hızlı çalışır)
  private divineBuff: { untilDay: number; amount: number } | null = null;
  private fleeDirX = 0;
  private fleeDirY = 0;
  private threatTimer = Math.random() * 0.4; // yırtıcı kontrol ritmi
  private stepSoundTimer = Math.random() * 0.3;
  private screamCooldown = 0;
  private throwTimer = 0;
  assignment: Assignment = { kind: "laborer" };
  birthDay: number; // doğduğu gün (toplam gün sayısı)
  grewUp = false; // main bunu görünce "büyüdü" bildirimi gösterir
  home: Building | null = null; // atandığı konut (ev/kamp)
  // Yaşam döngüsü
  mother: Villager | null = null; // bebeğin annesi (bakımevi yoksa o bakar)
  nurseryCovered = false; // bu bebeğe bakımevi bakıyor (main hesaplar)
  caringBaby: Villager | null = null; // anne bu bebeğe bakıyor: iş yapamaz (main hesaplar)
  pregnantSince: number | null = null; // hamile kalınan gün (totalDays)
  private lastStage: number;
  readonly identity: Identity;
  // Kişisel çanta: toplananlar önce buraya, sonra kampa/depoya gider
  readonly inventory: Record<ItemType, number> = Object.fromEntries(
    ITEM_TYPES.map((t) => [t, 0])
  ) as Record<ItemType, number>;

  private starveTimer = 0;
  private eatingFromInventory = false;
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
    this.birthDay = totalDays();
    this.identity = baby ? babyIdentity() : randomIdentity();
    this.lastStage = this.baby ? 0 : this.canWork ? 2 : 1;
  }

  // Yaş: büyüme çağındakiler günde CHILD_YEARS_PER_DAY yaş alır,
  // yetişkinlikten sonra 1 yıl = 4 gün takvimi işler
  get age(): number {
    const start = this.identity.age;
    const days = this.ageDays;
    if (start >= WORK_AGE) return start + Math.floor(days / DAYS_PER_YEAR);
    const growDays = Math.ceil((WORK_AGE - start) / CHILD_YEARS_PER_DAY);
    if (days < growDays) return start + days * CHILD_YEARS_PER_DAY;
    return WORK_AGE + Math.floor((days - growDays) / DAYS_PER_YEAR);
  }

  get baby(): boolean {
    return this.age < BABY_UNTIL_AGE;
  }

  get child(): boolean {
    return this.age >= BABY_UNTIL_AGE && this.age < WORK_AGE;
  }

  get canWork(): boolean {
    return this.age >= WORK_AGE;
  }

  get pregnant(): boolean {
    return this.pregnantSince !== null;
  }

  get sick(): boolean {
    return totalDays() < this.sickUntilDay;
  }

  get isProphet(): boolean {
    return totalDays() < this.prophetUntilDay;
  }

  // Hamilelik ilerlemesi 0..1 (karın adım adım büyür)
  get pregnancyProgress(): number {
    if (this.pregnantSince === null) return 0;
    return Math.min(1, (totalDays() + dayFrac() - this.pregnantSince) / PREGNANCY_DAYS);
  }

  // 4. günün sabahı geldi mi? (doğum main tarafından gerçekleştirilir)
  get readyToGiveBirth(): boolean {
    return this.pregnantSince !== null &&
      totalDays() - this.pregnantSince >= PREGNANCY_DAYS && !isSleepTime();
  }

  get armed(): boolean {
    return this.spears > 0 || this.hasAxe;
  }

  // Köpekler sahiplerinin av hedefini okur (yardıma koşmak için)
  get currentHuntTarget(): Animal | null {
    return this.job?.kind === "spearhunt" ? this.job.animal : null;
  }

  // Korku: çığlık at — yakındaki silahlılar yardıma gelir
  private scream(animal: Animal): void {
    if (!hasTech("korku") || this.screamCooldown > 0) return;
    this.screamCooldown = 5;
    screams.push({ x: this.x, y: this.y, animal, ttl: SCREAM_TTL });
    addFloater(this.x, this.y - 20, "Çığlık! ❗", "#ff8855");
    addJournal(`❗ ${this.fullName} çığlık attı — yardım çağırıyor!`);
  }

  // Merak: oyuncu mikrofonla konuştu — şok + 2 günlük büyük moral
  calm(): void {
    if (this.pleadingTtl <= 0) return;
    this.pleadingTtl = 0;
    this.shockTtl = 3;
    const before = this.morale;
    this.changeMorale(40, "Tanrının sesi");
    this.divineBuff = { untilDay: totalDays() + 2, amount: this.morale - before };
    resources.faith += 15; // iletiye yanıt vermek inancı güçlendirir
    addFloater(this.x, this.y - 18, "⚡ Tanrı konuştu! (+15 inanç)", "#ffd23c");
  }

  // Yırtıcı saldırısı: hasar al; silahsızsa kaç, can biterse öl
  takeDamage(amount: number, from: Animal, world: World): void {
    if (this.dead) return;
    this.hp -= amount;
    this.hitFlash = 0.22;
    addFloater(this.x, this.y - 16, `-${amount}`, "#ff5544");
    this.scream(from);
    if (!this.armed || this.baby || this.child) {
      const dx = this.x - from.x;
      const dy = this.y - from.y;
      const d = Math.hypot(dx, dy) || 1;
      this.fleeDirX = dx / d;
      this.fleeDirY = dy / d;
      this.fleeTimer = 2.5;
      this.releaseJob(world);
    }
    if (this.hp <= 0) {
      this.deathCause = "predator";
      this.die(world);
    }
  }

  // Doğum: hamilelik biter, hamilelik moral kaybı geri gelir ("etki kalkar")
  giveBirth(): void {
    this.pregnantSince = null;
    const lost = this.moraleLog.get("Hamilelik") ?? 0;
    if (lost < 0) this.changeMorale(-lost, "Hamilelik");
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

  get shirtColor(): string {
    if (this.baby) return this.shirt;
    if (this.assignment.kind === "building") {
      const type = this.assignment.building.type;
      if (type === BuildingType.Woodcutter) return "#27ae60"; // Oduncu: Orman Yeşili
      if (type === BuildingType.Gatherer) return "#d35400";    // Toplayıcı: Turuncu/Kızıl
      if (type === BuildingType.ToolWorkshop) return "#7f8c8d"; // Alet ustası: Demir Grisi
      if (type === BuildingType.Fisher) return "#2980b9";      // Balıkçı: Deniz Mavisi
      if (type === BuildingType.Temple) return "#8e44ad";      // Rahip: Mor
      if (type === BuildingType.Barn) return "#8a6a43";        // Çiftçi: Çamur Kahvesi
    }
    if (this.assignment.kind === "builder") {
      return "#f1c40f"; // İnşaatçı: Şantiye Sarısı
    }
    return this.shirt; // Ortalık işçisi: Orijinal rastgele renk
  }

  // Profil panelinde gösterilen anlık durum
  get statusText(): string {
    if (this.shockTtl > 0) return "Şokta — Tanrı onunla konuştu!";
    if (this.pleadingTtl > 0) return "Sana ileti gönderiyor 📨 (tıkla ve yanıtla)";
    if (this.baby) {
      if (this.nurseryCovered) return `Bebek (bakımevinde)`;
      if (this.mother && !this.mother.dead) return `Bebek (annesine muhtaç)`;
      return `Bebek`;
    }
    if (this.child) return `Çocuk (${this.age} yaşında)`;
    if (this.caringBaby && !this.caringBaby.dead && this.state !== "sleeping" && this.state !== "eating") {
      return "Çocuğuna bakıyor";
    }
    switch (this.state) {
      case "idle":
        if (this.assignment.kind === "building" && this.assignment.building.type === BuildingType.Nursery) {
          return "Bebeklere bakıyor";
        }
        return this.starving ? "Açlıktan bitkin" : "Dinleniyor";
      case "walking":
        if (!this.job) return "Geziniyor";
        switch (this.job.kind) {
          case "chop": return "Ağaca gidiyor";
          case "gather": return "Toplamaya gidiyor";
          case "mine": return "Taş ocağına gidiyor";
          case "fish": return "Kıyıya gidiyor";
          case "plant": return "Ekime gidiyor";
          case "tend": return "Hayvana gidiyor";
          case "hunt": return "Ava gidiyor";
          case "tame": return "Evcilleştirmeye gidiyor";
          case "build": return "Şantiyeye gidiyor";
          case "worship": return "Tapınağa gidiyor";
          case "craft": return "Atölyeye gidiyor";
          case "split": return "Kırıcıya gidiyor";
          case "pickup":
            return this.job.product === "axe"
              ? "Balta almaya gidiyor"
              : this.job.product === "spear"
              ? "Mızrak almaya gidiyor"
              : "Giysi almaya gidiyor";
          case "spearhunt": return "Ava gidiyor";
          case "sleep":
            return this.job.building && this.job.building === this.home
              ? "Eve dönüyor" : "Kampa dönüyor";
          case "eat": return "Yemekhaneye gidiyor";
          case "deposit": return "Depoya taşıyor";
        }
        break;
      case "chopping":
        return this.hasAxe ? "Ağaç kesiyor" : "Dal topluyor";
      case "crafting":
        if (this.job?.kind === "split") return "Odun yarıyor";
        return this.job?.kind === "craft" && this.job.product === "spear"
          ? "Mızrak yapıyor"
          : this.job?.kind === "craft" && this.job.product === "cloth"
          ? "Giysi dikiyor"
          : "Balta yapıyor";
      case "hunting":
        return this.job?.kind === "spearhunt" && this.job.animal.def.predator
          ? "Yırtıcıyla dövüşüyor"
          : "Avlanıyor";
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
      case "planting":
        return this.job?.kind === "plant" && this.job.target === Tile.Tree
          ? "Fidan dikiyor" : "Ekim yapıyor";
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

  getFoodInInventory(): number {
    let total = 0;
    for (const item of FOOD_TYPES) {
      total += this.inventory[item];
    }
    return total;
  }

  takeFoodFromInventory(n: number): boolean {
    if (this.getFoodInInventory() < n) return false;
    let remaining = n;
    for (const item of FOOD_TYPES) {
      const take = Math.min(this.inventory[item], remaining);
      this.inventory[item] -= take;
      remaining -= take;
      if (remaining <= 0) break;
    }
    return true;
  }

  takeFoodForWork(): void {
    // Yanlarına yemek alamasınlar
  }

  getDepositableAmount(item: ItemType, foodKeepRef: { value: number }): number {
    const n = this.inventory[item];
    if (n <= 0) return 0;
    if (FOOD_TYPES.includes(item)) {
      const keep = Math.min(n, foodKeepRef.value);
      foodKeepRef.value -= keep;
      return n - keep;
    }
    return n;
  }

  getDepositableTotal(): number {
    let foodKeep = 0;
    let total = 0;
    const foodKeepRef = { value: foodKeep };
    for (const item of ITEM_TYPES) {
      total += this.getDepositableAmount(item, foodKeepRef);
    }
    return total;
  }

  // Morali sınırlar içinde değiştir ve gerçekleşen farkı neden bazında deftere işle
  changeMorale(amount: number, reason: string): void {
    const next = Math.max(0, Math.min(100, this.morale + amount));
    const delta = next - this.morale;
    if (delta === 0) return;
    this.morale = next;
    this.moraleLog.set(reason, (this.moraleLog.get(reason) ?? 0) + delta);
  }

  getWorkSpeedFactor(): number {
    // 100 moral -> 1.0, 0 moral -> 0.5 (yarı yarıya yavaş)
    let f = 0.5 + this.morale / 200;
    if (hasTech("motorskills")) f *= 1.2; // herkese %20 hız
    if (this.educated) f *= 1.2; // bakımevi eğitimi: ek %20
    if (season() === 3 && !this.hasClothes) f *= 0.75; // kışın giysisiz: %25 yavaş
    if (this.sick) f *= 0.55; // hastalık: halsiz
    if (this.isProphet) f *= 1.4; // peygamber ilhamla hızlı çalışır
    return f;
  }

  shouldGoSleep(buildings: Building[], litHere = false): boolean {
    if (isSleepTime()) return true;
    if (litHere) return false; // ışık varken 23:00'e dek dışarıda kalınabilir
    const target =
      this.home ??
      buildings.find((b) => b.type === BuildingType.Camp && b.done) ??
      null;
    if (!target) return false;
    const dist = Math.abs(this.x - target.centerX) + Math.abs(this.y - target.centerY);
    let speed = (this.starving ? WALK_SPEED * 0.5 : WALK_SPEED) * tuning.moveSpeed;
    if (this.baby) speed *= 0.55;
    else if (this.child) speed *= 0.75;
    speed *= this.getWorkSpeedFactor();
    const travelTime = dist / speed;
    const travelFrac = travelTime / tuning.dayLength;
    return dayFrac() + travelFrac >= 0.75;
  }

  findAvailableFoodToEat(): ItemType | null {
    if (this.eatingFromInventory) {
      for (const item of FOOD_TYPES) {
        if (this.inventory[item] > 0) return item;
      }
    } else {
      for (const item of FOOD_TYPES) {
        if (resources[item] > 0) return item;
      }
    }
    return null;
  }

  consumeFoodItem(item: ItemType): boolean {
    if (this.eatingFromInventory) {
      if (this.inventory[item] > 0) {
        this.inventory[item]--;
        return true;
      }
    } else {
      if (resources[item] > 0) {
        resources[item]--;
        return true;
      }
    }
    return false;
  }

  private lastBuildings: Building[] | null = null;

  update(dt: number, world: World, buildings: Building[], animals: Animal[]): void {
    this.lastBuildings = buildings;
    // Yalnız çiftçiler çitli ağıla girebilir; yol bulma bunu okur (sıralı sim).
    // İçeride kalan (örn. inşaatı biten) çiftçi olmayan da çıkabilsin diye
    // halihazırda padok karosunda duranlara da izin verilir.
    const isFarmer =
      this.assignment.kind === "building" &&
      this.assignment.building.type === BuildingType.Barn;
    world.allowPastureEntry =
      isFarmer || world.pastureTiles.has(world.index(this.tileX, this.tileY));
    // Yaş evresi geçişleri: bebek (0-7) -> çocuk (7-18) -> işçi (18+)
    const stage = this.baby ? 0 : this.canWork ? 2 : 1;
    if (stage !== this.lastStage) {
      if (this.lastStage === 0 && this.nurseryCovered) {
        // bakımevinde büyüyen bebek eğitim alarak çocuk olur
        this.educated = true;
      }
      if (stage === 2) {
        this.grewUp = true;
        this.assignment = { kind: "laborer" };
      }
      this.lastStage = stage;
    }

    // Hamilelik: ilerledikçe moral gittikçe daha hızlı düşer (doğumda geri gelir)
    if (this.pregnant) {
      const drainRate =
        (PREGNANCY_MORALE * 2) / (PREGNANCY_DAYS * tuning.dayLength);
      this.changeMorale(-drainRate * this.pregnancyProgress * dt, "Hamilelik");
    }

    // yaralar zamanla iyileşir
    if (this.hp < 100 && !this.starving) this.hp = Math.min(100, this.hp + 1.5 * dt);
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.attackAnim > 0) this.attackAnim -= dt;

    // yırtıcıdan kaçış: her şeyi bırak, düz uzaklaş
    if (this.fleeTimer > 0) {
      this.fleeTimer -= dt;
      const speed = WALK_SPEED * 1.4 * tuning.moveSpeed;
      const nx = this.x + this.fleeDirX * speed * dt;
      const ny = this.y + this.fleeDirY * speed * dt;
      if (world.walkableAt(Math.floor(nx / TILE_SIZE), Math.floor(ny / TILE_SIZE))) {
        this.x = nx;
        this.y = ny;
        if (this.fleeDirX !== 0) this.facing = this.fleeDirX > 0 ? 1 : -1;
      } else {
        const t = this.fleeDirX;
        this.fleeDirX = -this.fleeDirY;
        this.fleeDirY = t;
      }
      this.walkPhase += dt * 12;
      this.state = "idle";
      this.path = [];
      this.timer = 0.3;
      this.hunger = Math.min(100, this.hunger + hungerRate() * dt);
      return;
    }

    // Tanrının sesi: 2 gün sonra etkisi söner
    if (this.divineBuff && totalDays() >= this.divineBuff.untilDay) {
      this.changeMorale(-this.divineBuff.amount, "Tanrının sesi");
      this.divineBuff = null;
    }
    if (this.screamCooldown > 0) this.screamCooldown -= dt;

    // Yakarma/şok: olduğu yerde durur (uyku saati gelirse kesilir)
    if ((this.pleadingTtl > 0 || this.shockTtl > 0) && !isSleepTime()) {
      if (this.shockTtl > 0) this.shockTtl -= dt;
      else this.pleadingTtl -= dt;
      this.walkPhase += dt * 1.6; // eller havada yalvarış salınımı
      this.state = "idle";
      this.path = [];
      this.timer = 0.4;
      this.hunger = Math.min(100, this.hunger + hungerRate() * dt);
      return;
    }
    if (isSleepTime()) {
      this.pleadingTtl = 0;
      this.shockTtl = 0;
    }

    // yakındaki yırtıcı: silahlıysa karşı koy, değilse kaç
    this.threatTimer -= dt;
    if (this.threatTimer <= 0 && this.state !== "sleeping" && !this.dead) {
      this.threatTimer = 0.4;
      let threat: Animal | null = null;
      let threatD = 5 * TILE_SIZE;
      for (const a of animals) {
        if (!a.def.predator || a.dead || a.tameMark) continue;
        const d = Math.hypot(a.x - this.x, a.y - this.y);
        if (d < threatD) {
          threatD = d;
          threat = a;
        }
      }
      if (threat) {
        if (this.armed && this.canWork) {
          if (!(this.job?.kind === "spearhunt")) {
            this.releaseJob(world);
            this.job = { kind: "spearhunt", animal: threat, thrown: 0 };
            this.state = "hunting";
            this.throwTimer = 0.4;
          }
        } else {
          this.scream(threat);
          const dx = this.x - threat.x;
          const dy = this.y - threat.y;
          const d = Math.hypot(dx, dy) || 1;
          this.fleeDirX = dx / d;
          this.fleeDirY = dy / d;
          this.fleeTimer = 2;
          this.releaseJob(world);
          this.toIdle();
        }
      } else if (this.armed && this.canWork && this.job?.kind !== "spearhunt") {
        // çığlık duyan silahlılar yardıma koşar (Korku)
        for (const sc of screams) {
          if (sc.animal.dead) continue;
          const d = Math.hypot(sc.x - this.x, sc.y - this.y);
          if (d <= SCREAM_RANGE) {
            this.releaseJob(world);
            this.job = { kind: "spearhunt", animal: sc.animal, thrown: 0 };
            this.state = "hunting";
            this.throwTimer = 0.4;
            addFloater(this.x, this.y - 16, "Yardıma!", "#ffb060");
            break;
          }
        }
      }
    }

    // açlık her durumda işler; bakımevinin baktığı bebekler acıkmaz, toparlanır
    if (this.baby && this.nurseryCovered) {
      this.hunger = Math.max(0, this.hunger - 8 * dt);
    } else {
      this.hunger = Math.min(100, this.hunger + hungerRate() * dt);
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
      this.state === "tending" || this.state === "planting" ||
      this.state === "crafting" || this.state === "hunting";
    const litHere = isLit(buildings, this.x, this.y);
    // Işıklı yerde 23:00'e kadar çalışılır; karanlıkta kalan veya
    // uyku yolculuğu gereken işi bırakır
    if (
      working &&
      ((isNight() && !litHere) ||
        dayFrac() >= EVENING_FRAC ||
        this.shouldGoSleep(buildings, litHere))
    ) {
      this.releaseJob(world);
      this.toIdle();
    }

    // Kış: giysisi olmayan dışarıda üşür, morali erir.
    // Deri giysi VEYA ateş başında olmak (kamp ateşi/meşale ışığı) korur.
    // Ayaz olayı sırasında üşüme çok daha keskindir.
    if (
      season() === 3 && !this.hasClothes && !this.baby &&
      this.state !== "sleeping" &&
      !isLit(buildings, this.x, this.y)
    ) {
      const snap = coldSnapActive() ? 2.5 : 1;
      this.changeMorale(-COLD_MORALE_RATE * snap * dt, "Soğuk (giysisiz)");
    }

    // Gece ateş başında olmak içi ısıtır: yavaşça moral kazandırır
    // (kamp ateşi, meşale ya da kışın dal yakan ev)
    if (isNight() && this.state !== "sleeping" && !this.baby) {
      for (const b of buildings) {
        const r = lightRadiusOf(b);
        if (!r) continue;
        const dx = this.x - b.centerX;
        const dy = this.y - b.centerY;
        if (dx * dx + dy * dy <= r * r) {
          this.changeMorale(0.08 * dt, "Ateş başında");
          break;
        }
      }
    }

    // sabah oldu: uyan (evde uyuyan evin yanına çıkar)
    if (this.state === "sleeping" && !isSleepTime()) {
      if (!this.groundSleep && this.home) this.exitBuilding(world, this.home);
      this.groundSleep = false;
      this.toIdle();

      // Uyku süresi değerlendirmesi
      const targetSleep = 28; // saniye (yaklaşık 4.5 oyun saati)
      if (this.sleepAccumulator < targetSleep) {
        const deficit = targetSleep - this.sleepAccumulator;
        // ceza sınırlı: bir gece uykusuzluk insanı bitirmesin
        const moraleLoss = Math.min(8, Math.floor(deficit * 1.5));
        if (moraleLoss > 0) {
          this.changeMorale(-moraleLoss, "Az uyku");
          addFloater(this.x, this.y - 12, `Az uyku: -${moraleLoss} moral`, "#ff4444");
        }
      }
      this.sleepAccumulator = 0; // sıfırla
    }

    // uyurken moral değişir: evde dinlenmek iyi, yerde yatmak kötü
    if (this.state === "sleeping") {
      this.sleepAccumulator += dt;
      if (this.groundSleep) this.changeMorale(-0.133 * dt, "Yerde uyuma");
      else this.changeMorale(0.08 * dt, "Evde uyku");
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
      case "planting":
        this.plant(dt, world);
        break;
      case "tending":
        this.tend(dt);
        break;
      case "worshipping":
        this.worship(dt);
        break;
      case "crafting":
        this.craft(dt);
        break;
      case "hunting":
        this.huntTick(dt, world);
        break;
      case "eating":
        this.timer -= dt;
        if (this.timer <= 0) {
          while (this.hunger > 0) {
            const item = this.findAvailableFoodToEat();
            if (!item) break;
            if (this.consumeFoodItem(item)) {
              const nutrition = FOOD_NUTRITION[item] || 5;
              this.hunger = Math.max(0, this.hunger - nutrition);
            } else {
              break;
            }
          }
          this.eatingFromInventory = false;
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
      case "plant": world.claimedPlants.delete(this.job.tile); break;
      case "build": this.job.building.claimed = false; break;
      case "tend": this.job.animal.claimed = false; break;
      case "hunt": this.job.animal.claimed = false; break;
      case "tame": this.job.animal.claimed = false; break;
      case "worship":
        this.job.building.worshipClaimed = false;
        this.job.building.worshipSpots.delete(this.job.tile);
        break;
      case "pickup":
        if (this.job.product === "axe") {
          this.job.building.toolReserved = Math.max(0, this.job.building.toolReserved - this.job.amount);
        } else if (this.job.product === "spear") {
          this.job.building.spearReserved = Math.max(0, this.job.building.spearReserved - this.job.amount);
        } else {
          this.job.building.clothReserved = Math.max(0, this.job.building.clothReserved - this.job.amount);
        }
        break;
      case "spearhunt":
        // av yarıda kaldı: atılan mızraklar toplanıp geri alınır
        this.spears += this.job.thrown;
        this.job.thrown = 0;
        break;
      case "craft": break;
      case "split": break;
      case "deposit": break;
    }
    this.job = null;
  }


  private decide(world: World, buildings: Building[], animals: Animal[]): void {
    // 1) Acıkmışsa ve yemek varsa: ye (varsa yemekhanede — tokluk tam dolar)
    if (this.hunger > EAT_THRESHOLD && (this.getFoodInInventory() > 0 || foodTotal() > 0)) {
      if (this.getFoodInInventory() > 0) {
        this.eatingFromInventory = true;
        this.state = "eating";
        this.timer = EAT_TIME;
        return;
      }
      this.eatingFromInventory = false;
      if (!this.baby) {
        let target: Building | null = null;
        let bestDist = Infinity;
        // 1. Try to find a cafeteria
        for (const b of buildings) {
          if (b.type === BuildingType.Cafeteria && b.done) {
            const d = Math.abs(b.x + 1 - this.tileX) + Math.abs(b.y + 1 - this.tileY);
            if (d < bestDist) {
              bestDist = d;
              target = b;
            }
          }
        }
        // 2. If no cafeteria, try to find a depot or camp
        if (!target) {
          for (const b of buildings) {
            if (isDepositPoint(b) && b.done) {
              const d = Math.abs(b.x + 1 - this.tileX) + Math.abs(b.y + 1 - this.tileY);
              if (d < bestDist) {
                bestDist = d;
                target = b;
              }
            }
          }
        }
        if (target) {
          const path = findPathAdjacentRect(
            world, this.tileX, this.tileY, target.x, target.y, target.size
          );
          if (path) {
            this.job = { kind: "eat", building: target };
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
    if (this.shouldGoSleep(buildings, isLit(buildings, this.x, this.y))) {
      this.goSleep(world, buildings);
      return;
    }

    // Bebekler ve çocuklar çalışmaz: bebek bakımevinin (bakılıyorsa) ya da
    // annesinin/evinin, çocuk evinin etrafında oyalanır
    if (!this.canWork) {
      const nursery = buildings.find((b) => b.type === BuildingType.Nursery && b.done);
      const anchor = this.baby && this.nurseryCovered && nursery ? nursery : this.home;
      let ax = anchor ? Math.floor(anchor.centerX / TILE_SIZE) : this.tileX;
      let ay = anchor ? Math.floor(anchor.centerY / TILE_SIZE) : this.tileY;
      if (this.baby && !this.nurseryCovered && this.mother && !this.mother.dead) {
        ax = this.mother.tileX;
        ay = this.mother.tileY;
      }
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

    // Anne bakımı: bakımevi kapasitesi yetmeyen bebeğin annesi iş alamaz,
    // bebeğinin yanında kalır
    if (this.caringBaby && !this.caringBaby.dead) {
      const b = this.caringBaby;
      const dist = Math.abs(this.x - b.x) + Math.abs(this.y - b.y);
      if (dist > TILE_SIZE * 2.5) {
        for (let attempt = 0; attempt < 6; attempt++) {
          const tx = b.tileX + Math.floor((Math.random() * 2 - 1) * 2);
          const ty = b.tileY + Math.floor((Math.random() * 2 - 1) * 2);
          if (!world.walkableAt(tx, ty)) continue;
          const path = findPath(world, this.tileX, this.tileY, tx, ty);
          if (path) {
            this.startPath(path);
            return;
          }
        }
      }
      this.timer = 1.5 + Math.random() * 2;
      return;
    }

    // Akşam (23:00 sonrası): iş alınmaz, ateş başında toplanılır
    if (dayFrac() >= EVENING_FRAC && !isSleepTime()) {
      this.gatherAtFire(world, buildings);
      return;
    }

    // 2) Çanta dolduysa depoya/kampa taşı
    // (deposu dolu ürünler için boş yere gidip gelme: teslim edilebilir olmalı)
    const depositableTotal = this.getDepositableTotal();
    const depositable = ITEM_TYPES.some((it) => {
      let foodKeep = 0;
      const foodKeepRef = { value: foodKeep };
      return this.getDepositableAmount(it, foodKeepRef) > 0 && !isFull(it);
    });
    if (depositableTotal >= depositAt() && depositable && this.tryDeposit(world, buildings)) {
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
          this.takeFoodForWork();
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

      if (hut.type === BuildingType.Woodcutter) {
        // Ağaçlar budandıktan sonra kendi kendine yeniden büyür; ekim gerekmez
        if (!isFull("wood") && !bagFull) {
          this.pushTileJobCandidate(
            world, candidates, world.markedTrees, world.claimedTrees,
            (x, y) => inArea(x, y) && litTile(x, y),
            (i) => {
              world.claimedTrees.add(i);
              this.job = { kind: "chop", tile: i };
            }
          );
        }
      } else if (hut.type === BuildingType.Gatherer && !bagFull) {
        const currentCount = world.countTilesNear(
          [Tile.Bush, Tile.Sapling],
          hx, hy, AUTO_MARK_RADIUS
        );
        let plantedEnough = currentCount >= FOOD_TARGET;

        if (!plantedEnough) {
          this.pushPlantCandidate(world, candidates, hx, hy, Tile.Bush, litTile);
          if (candidates.length === 0) {
            plantedEnough = true;
          }
        }

        if (plantedEnough) {
          this.pushTileJobCandidate(
            world, candidates, world.markedBushes, world.claimedBushes,
            (x, y) => {
              const item = foodItemOf(world.get(x, y));
              return item === "berry" && inArea(x, y) && litTile(x, y) && !isFull(item);
            },
            (i) => {
              world.claimedBushes.add(i);
              this.job = { kind: "gather", tile: i, item: "berry" };
            }
          );
        }
      } else if (hut.type === BuildingType.ToolWorkshop) {
        // Alet ustası: bekleyen sipariş ve hammadde varsa tezgâha geçer
        const canAxe =
          hut.orders > 0 && resources.wood >= AXE_WOOD_COST && resources.stone >= AXE_STONE_COST;
        const canSpear =
          hut.spearOrders > 0 &&
          resources.wood >= SPEAR_WOOD_COST &&
          resources.log >= SPEAR_LOG_COST &&
          resources.stone >= SPEAR_STONE_COST;
        const canCloth =
          hut.clothOrders > 0 && resources.leather >= CLOTH_LEATHER_COST;
        if ((canAxe || canSpear || canCloth) && lit(hut.centerX, hut.centerY)) {
          const product: "axe" | "spear" | "cloth" = canAxe
            ? "axe"
            : canSpear
            ? "spear"
            : "cloth";
          candidates.push({
            dist: 0,
            start: () => {
              const path = findPathAdjacentRect(
                world, this.tileX, this.tileY, hut.x, hut.y, hut.size
              );
              if (!path) return false;
              this.job = { kind: "craft", building: hut, product };
              this.startPath(path);
              return true;
            },
          });
        }
      } else if (hut.type === BuildingType.Splitter) {
        // Kırıcı: stokta odun varsa ve dala (wood) yer varsa kütük yarar
        const space = resources.cap - resources.wood;
        if (
          resources.log >= SPLIT_LOG_COST &&
          space >= SPLIT_BRANCH_YIELD - SPLIT_LOG_COST &&
          lit(hut.centerX, hut.centerY)
        ) {
          candidates.push({
            dist: 0,
            start: () => {
              const path = findPathAdjacentRect(
                world, this.tileX, this.tileY, hut.x, hut.y, hut.size
              );
              if (!path) return false;
              this.job = { kind: "split", building: hut };
              this.startPath(path);
              return true;
            },
          });
        }
      } else if (hut.type === BuildingType.HunterLodge) {
        // Avcı: mızrağı varsa kulübe çevresindeki en yakın yabani hayvana gider
        // (köpeği olan avcının av sahası genişler)
        if (this.spears > 0 && !isFull("meat") && !bagFull) {
          const hasDog = animals.some(
            (d) => d.type === "dog" && !d.dead && d.owner === this
          );
          const range = (hasDog ? 45 : 30) * TILE_SIZE;
          let prey: Animal | null = null;
          let preyD = Infinity;
          for (const an of animals) {
            if (!an.wild || an.dead || an.fleeTimer > 0) continue;
            if (an.type === "dog" || an.tameMark) continue; // köpekler ve evcilleştirilecekler avlanmaz
            const lodgeD =
              Math.abs(an.x - hut.centerX) + Math.abs(an.y - hut.centerY);
            if (lodgeD > range) continue; // kulübenin av sahası
            if (!lit(an.x, an.y)) continue;
            const d = Math.abs(an.x - this.x) + Math.abs(an.y - this.y);
            if (d < preyD) {
              preyD = d;
              prey = an;
            }
          }
          if (prey) {
            const target = prey;
            candidates.push({
              dist: preyD / TILE_SIZE,
              start: () => {
                this.job = { kind: "spearhunt", animal: target, thrown: 0 };
                this.state = "hunting";
                this.throwTimer = 0.4;
                return true;
              },
            });
          }
        }
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
              this.takeFoodForWork();
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
        // çiftçi, çiftliğin türüne dönüşecek yabani bir hayvan görürse
        // kendiliğinden evcilleştirmeye gider (ağıl dolu değilse)
        if (hut.farmType && !bagFull) {
          const herd = animals.filter((a) => a.barn === hut && !a.dead).length;
          if (herd < BARN_CAPACITY) {
            const TAME_RANGE = 28 * TILE_SIZE;
            let bestW: Animal | null = null;
            let bestWD = Infinity;
            for (const a of animals) {
              if (!a.wild || a.dead || a.claimed || a.tameMark) continue;
              if (TAME_TARGET[a.type] !== hut.farmType) continue;
              const d = Math.abs(a.x - this.x) + Math.abs(a.y - this.y);
              if (d < TAME_RANGE && d < bestWD) {
                bestWD = d;
                bestW = a;
              }
            }
            if (bestW) {
              const target = bestW;
              candidates.push({
                dist: bestWD / TILE_SIZE + 4, // ürün toplama biraz öncelikli
                start: () => {
                  const path = findPath(
                    world, this.tileX, this.tileY,
                    Math.floor(target.x / TILE_SIZE), Math.floor(target.y / TILE_SIZE)
                  );
                  if (!path) return false;
                  target.claimed = true;
                  target.tameMark = true; // yeşil işaret: evcilleştiriliyor
                  this.job = { kind: "tame", animal: target, barn: hut };
                  this.startPath(path);
                  return true;
                },
              });
            }
          }
        }
      } else if (hut.type === BuildingType.Temple) {
        if (hut.worshipReady && lit(hut.centerX, hut.centerY)) {
          candidates.push({
            dist: 0,
            start: () => {
              // her rahip tapınak çevresinde ayrı bir dua yeri tutar
              let spot: { x: number; y: number; i: number } | null = null;
              let bestD = Infinity;
              for (let dy = -1; dy <= hut.size; dy++) {
                for (let dx = -1; dx <= hut.size; dx++) {
                  const inside =
                    dx >= 0 && dx < hut.size && dy >= 0 && dy < hut.size;
                  if (inside) continue;
                  const tx = hut.x + dx;
                  const ty = hut.y + dy;
                  if (!world.walkableAt(tx, ty)) continue;
                  const i = world.index(tx, ty);
                  if (hut.worshipSpots.has(i)) continue;
                  const d = Math.abs(tx - this.tileX) + Math.abs(ty - this.tileY);
                  if (d < bestD) {
                    bestD = d;
                    spot = { x: tx, y: ty, i };
                  }
                }
              }
              if (!spot) return false;
              const path = findPath(world, this.tileX, this.tileY, spot.x, spot.y);
              if (!path) return false;
              hut.worshipSpots.add(spot.i);
              hut.worshipClaimed = true;
              this.job = { kind: "worship", building: hut, tile: spot.i };
              this.takeFoodForWork();
              this.startPath(path);
              return true;
            },
          });
        }
      }
    } else {
      this.pushLaborerCandidates(world, candidates, animals, bagFull, lit, litTile);
    }

    // Ağaç işi yapanlar baltasızsa atölyeden balta, avcılar mızrak alır
    // (rezervasyon sayesinde boşa gidip dönen olmaz)
    const wantsAxe =
      !this.hasAxe &&
      (a.kind === "laborer" ||
        (a.kind === "building" && a.building.type === BuildingType.Woodcutter));
    const wantsSpears =
      a.kind === "building" &&
      a.building.type === BuildingType.HunterLodge &&
      this.spears < MAX_CARRIED_SPEARS;
    const wantsClothes = !this.hasClothes;
    if (wantsAxe || wantsSpears || wantsClothes) {
      let bestShop: Building | null = null;
      let bestShopD = Infinity;
      let bestKind: "axe" | "spear" | "cloth" = "axe";
      for (const b of buildings) {
        if (b.type !== BuildingType.ToolWorkshop || !b.done || b.removed) continue;
        // öncelik: avcıysa mızrak, ağaç işçisiyse balta, sonra giysi
        let kind: "axe" | "spear" | "cloth" | null = null;
        if (wantsSpears && b.spearStock - b.spearReserved > 0) kind = "spear";
        else if (wantsAxe && b.toolStock - b.toolReserved > 0) kind = "axe";
        else if (wantsClothes && b.clothStock - b.clothReserved > 0) kind = "cloth";
        if (!kind) continue;
        if (!lit(b.centerX, b.centerY)) continue;
        const d = Math.abs(b.x + 1 - this.tileX) + Math.abs(b.y + 1 - this.tileY);
        if (d < bestShopD) {
          bestShopD = d;
          bestShop = b;
          bestKind = kind;
        }
      }
      if (bestShop) {
        const shop = bestShop;
        const kind = bestKind;
        candidates.push({
          dist: bestShopD,
          start: () => {
            const path = findPathAdjacentRect(
              world, this.tileX, this.tileY, shop.x, shop.y, shop.size
            );
            if (!path) return false;
            if (kind === "spear") {
              const amount = Math.min(
                MAX_CARRIED_SPEARS - this.spears,
                shop.spearStock - shop.spearReserved
              );
              if (amount <= 0) return false;
              shop.spearReserved += amount;
              this.job = { kind: "pickup", building: shop, product: "spear", amount };
            } else if (kind === "cloth") {
              if (shop.clothStock - shop.clothReserved <= 0) return false;
              shop.clothReserved++;
              this.job = { kind: "pickup", building: shop, product: "cloth", amount: 1 };
            } else {
              if (shop.toolStock - shop.toolReserved <= 0) return false;
              shop.toolReserved++;
              this.job = { kind: "pickup", building: shop, product: "axe", amount: 1 };
            }
            this.startPath(path);
            return true;
          },
        });
      }
    }

    let minPrimaryDist = Infinity;
    for (const c of candidates) {
      if (c.dist < minPrimaryDist) {
        minPrimaryDist = c.dist;
      }
    }

    // Bakıcılar bakımevinden ayrılmaz (kapasiteleri bebeklere bakar)
    const isCaretaker =
      a.kind === "building" && a.building.type === BuildingType.Nursery;
    if (a.kind !== "laborer" && !isCaretaker && minPrimaryDist > FAR_JOB_THRESHOLD) {
      this.pushLaborerCandidates(world, candidates, animals, bagFull, lit, litTile);
    }

    candidates.sort((c1, c2) => c1.dist - c2.dist);
    for (const c of candidates) {
      if (c.start()) return;
    }

    // 4) İş yoksa: çantada teslim edilebilir bir şey varsa teslim et, yoksa dolan
    // (bina çalışanları iş yerlerinin çevresinde bekler)
    if (depositableTotal > 0 && depositable && this.tryDeposit(world, buildings)) return;

    const camp = buildings.find((b) => b.type === BuildingType.Camp && b.done) || null;
    const anchor = a.kind === "building" ? a.building : camp;
    const ax = anchor ? Math.floor(anchor.centerX / TILE_SIZE) : this.tileX;
    const ay = anchor ? Math.floor(anchor.centerY / TILE_SIZE) : this.tileY;
    const r = anchor ? (anchor === camp ? 8 : 4) : 6;
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

  private pushLaborerCandidates(
    world: World,
    candidates: { dist: number; start: () => boolean }[],
    animals: Animal[],
    bagFull: boolean,
    lit: (wx: number, wy: number) => boolean,
    litTile: (x: number, y: number) => boolean
  ): void {
    const a = this.assignment;
    const isWoodcutter = a.kind === "building" && a.building.type === BuildingType.Woodcutter;
    const isGatherer = a.kind === "building" && a.building.type === BuildingType.Gatherer;

    // Oduncular kendi depoları (wood) dolu değilse meyve/yiyecek toplamaz
    const woodcutterBlocksFood = isWoodcutter && !isFull("wood");

    // Toplayıcılar kendi depoları dolu değilse odun toplamaz
    const gathererBlocksWood = isGatherer && !isFull("berry");

    // av: oyuncunun işaretlediği yabani hayvanlar
    if (!bagFull && !isFull("fish") && !woodcutterBlocksFood) {
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
            this.takeFoodForWork();
            this.startPath(path);
            return true;
          },
        });
      }
    }

    // evcilleştirme: işaretli hayvana sabırla yaklaş
    {
      let bestT: Animal | null = null;
      let bestTD = Infinity;
      for (const an of animals) {
        if (!an.tameMark || an.claimed || an.dead || !lit(an.x, an.y)) continue;
        const d = Math.abs(an.x - this.x) + Math.abs(an.y - this.y);
        if (d < bestTD) {
          bestTD = d;
          bestT = an;
        }
      }
      if (bestT) {
        const target = bestT;
        candidates.push({
          // oyuncunun verdiği doğrudan emirdir: mesafe yarışında güçlü öncelik
          dist: (bestTD / TILE_SIZE) * 0.2,
          start: () => {
            const path = findPath(
              world, this.tileX, this.tileY,
              Math.floor(target.x / TILE_SIZE), Math.floor(target.y / TILE_SIZE)
            );
            if (!path) return false;
            target.claimed = true;
            const wanted = TAME_TARGET[target.type];
            const barn =
              this.lastBuildings?.find(
                (b) => b.type === BuildingType.Barn && b.done && b.farmType === wanted
              ) ?? null;
            this.job = { kind: "tame", animal: target, barn };
            this.startPath(path);
            return true;
          },
        });
      }
    }

    // ortalık işçisi de boştaki şantiyeleri inşa eder (ayrı inşaatçı atamaya gerek yok)
    if (a.kind === "laborer") {
      for (const b of this.lastBuildings ?? []) {
        if (b.done || b.claimed || b.removed || !lit(b.centerX, b.centerY)) continue;
        const bb = b;
        const d = Math.abs(b.x + 1 - this.tileX) + Math.abs(b.y + 1 - this.tileY);
        candidates.push({
          dist: d,
          start: () => {
            const path = findPathAdjacentRect(world, this.tileX, this.tileY, bb.x, bb.y, bb.size);
            if (!path) return false;
            bb.claimed = true;
            this.job = { kind: "build", building: bb };
            this.takeFoodForWork();
            this.startPath(path);
            return true;
          },
        });
      }
    }

    // ortalık işçisi: elle/kulübece işaretlenmiş her kaynağa gider
    if (!isFull("wood") && !bagFull && !gathererBlocksWood) {
      this.pushTileJobCandidate(
        world, candidates, world.markedTrees, world.claimedTrees, litTile,
        (i) => {
          world.claimedTrees.add(i);
          this.job = { kind: "chop", tile: i };
        }
      );
    }

    if (!bagFull && !woodcutterBlocksFood) {
      this.pushTileJobCandidate(
        world, candidates, world.markedBushes, world.claimedBushes,
        (x, y) => {
          const item = foodItemOf(world.get(x, y));
          // mantar işaretleri zaten Mantaroloji araştırılınca konabiliyor
          return (item === "berry" || item === "mushroom") && litTile(x, y) && !isFull(item);
        },
        (i, x, y) => {
          world.claimedBushes.add(i);
          const item = foodItemOf(world.get(x, y)) ?? "berry";
          this.job = { kind: "gather", tile: i, item };
        }
      );
    }

    if (!isFull("stone") && !bagFull && hasTech("hardobjects")) {
      this.pushTileJobCandidate(
        world, candidates, world.markedStones, world.claimedStones, litTile,
        (i) => {
          world.claimedStones.add(i);
          this.job = { kind: "mine", tile: i };
        }
      );
    }

    // Boştaki ortalık işçisi: işaretli iş yoksa eksik kalan kaynağı (dal/odun/
    // yemiş/mantar/taş) kendiliğinden toplamaya gider. Düşük öncelik: oyuncunun
    // işaretlediği işler ve emirler her zaman önce gelir.
    if (a.kind === "laborer" && policy.gather) {
      const AUTO = 1000;
      if (!isFull("wood") && !bagFull) {
        this.pushAutoCandidate(world, candidates, AUTO,
          (x, y) =>
            world.get(x, y) === Tile.Tree &&
            !world.claimedTrees.has(world.index(x, y)) && litTile(x, y),
          (i) => {
            world.claimedTrees.add(i);
            this.job = { kind: "chop", tile: i, auto: true };
          });
      }
      if (!bagFull && (!isFull("berry") || !isFull("mushroom"))) {
        this.pushAutoCandidate(world, candidates, AUTO,
          (x, y) => {
            const item = foodItemOf(world.get(x, y));
            return (item === "berry" || item === "mushroom") &&
              !isFull(item) && !world.claimedBushes.has(world.index(x, y)) && litTile(x, y);
          },
          (i, x, y) => {
            world.claimedBushes.add(i);
            const item = foodItemOf(world.get(x, y)) ?? "berry";
            this.job = { kind: "gather", tile: i, item, auto: true };
          });
      }
      if (!isFull("stone") && !bagFull && hasTech("hardobjects")) {
        this.pushAutoCandidate(world, candidates, AUTO,
          (x, y) =>
            world.get(x, y) === Tile.Pebbles &&
            !world.claimedStones.has(world.index(x, y)) && litTile(x, y),
          (i) => {
            world.claimedStones.add(i);
            this.job = { kind: "mine", tile: i, auto: true };
          });
      }
    }
  }

  // İşaretsiz bir kaynak karosunu kendiliğinden hedefle (boştaki işçi için)
  private pushAutoCandidate(
    world: World,
    candidates: { dist: number; start: () => boolean }[],
    penalty: number,
    accept: (x: number, y: number) => boolean,
    claim: (index: number, x: number, y: number) => void
  ): void {
    const first = world.findNearestTile(this.x, this.y, accept, 40);
    if (!first) return;
    candidates.push({
      dist: first.dist + penalty,
      start: () => {
        const t = world.findNearestTile(this.x, this.y, accept, 40);
        if (!t) return false;
        const path = findPathAdjacent(world, this.tileX, this.tileY, t.x, t.y);
        if (!path) return false;
        claim(world.index(t.x, t.y), t.x, t.y);
        this.takeFoodForWork();
        this.startPath(path);
        return true;
      },
    });
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
    this.takeFoodForWork();
    this.startPath(path);
    return true;
  }

  // Ekim adayı: alandaki boş çimene gidip fidan/filiz diker
  private pushPlantCandidate(
    world: World,
    candidates: { dist: number; start: () => boolean }[],
    hx: number,
    hy: number,
    target: Tile,
    litTile: (x: number, y: number) => boolean
  ): void {
    const spot = world.findPlantSpot(hx, hy, AUTO_MARK_RADIUS, this.tileX, this.tileY);
    if (!spot || !litTile(spot.x, spot.y)) return;
    candidates.push({
      dist: Math.abs(spot.x - this.tileX) + Math.abs(spot.y - this.tileY),
      start: () => {
        const path = findPath(world, this.tileX, this.tileY, spot.x, spot.y);
        if (!path) return false;
        const i = world.index(spot.x, spot.y);
      world.claimedPlants.add(i);
      this.job = { kind: "plant", tile: i, target };
      this.takeFoodForWork();
      this.startPath(path);
      return true;
      },
    });
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

      // can we deposit anything we are carrying to this specific building?
      let canUse = false;
      for (const item of ITEM_TYPES) {
        if (this.inventory[item] > 0) {
          canUse = true;
          break;
        }
      }
      if (!canUse) continue;

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
        this.enterSleep(target);
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

  // Uykuya geç: evi varsa içine girer (görünmez olur), yoksa yerde yatar
  private enterSleep(target: Building | null): void {
    if (!this.groundSleep && this.home && target === this.home) {
      this.x = this.home.centerX;
      this.y = this.home.centerY;
    }
    this.state = "sleeping";
    this.walkPhase = 0;
  }

  // Bina içinden çevredeki yürünebilir bloğa çık
  private exitBuilding(world: World, b: Building): void {
    for (let r = 1; r <= 3; r++) {
      for (let dy = -r; dy <= r + b.size - 1; dy++) {
        for (let dx = -r; dx <= r + b.size - 1; dx++) {
          const x = b.x + dx;
          const y = b.y + dy;
          if (!world.walkableAt(x, y)) continue;
          this.x = (x + 0.5) * TILE_SIZE;
          this.y = (y + 0.5) * TILE_SIZE;
          return;
        }
      }
    }
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
    const tileOf = (t: number) => ({ x: t % world.width, y: Math.floor(t / world.width) });
    switch (this.job.kind) {
      case "chop": {
        const p = tileOf(this.job.tile);
        const exists = this.job.auto
          ? world.get(p.x, p.y) === Tile.Tree
          : world.markedTrees.has(this.job.tile);
        return exists && !isFull("wood") && tileLit(this.job.tile);
      }
      case "gather": {
        const p = tileOf(this.job.tile);
        const exists = this.job.auto
          ? foodItemOf(world.get(p.x, p.y)) === this.job.item
          : world.markedBushes.has(this.job.tile);
        return exists && !isFull(this.job.item) && tileLit(this.job.tile);
      }
      case "mine": {
        const p = tileOf(this.job.tile);
        const t = world.get(p.x, p.y);
        const exists = this.job.auto
          ? t === Tile.Pebbles
          : world.markedStones.has(this.job.tile);
        return exists && !isFull("stone") && tileLit(this.job.tile);
      }
      case "fish":
        return !isFull("fish") && tileLit(this.job.tile);
      case "plant": {
        const px = this.job.tile % world.width;
        const py = Math.floor(this.job.tile / world.width);
        return world.get(px, py) === Tile.Grass && tileLit(this.job.tile);
      }
      case "tend":
        return !this.job.animal.dead;
      case "hunt":
        return !this.job.animal.dead && this.job.animal.hunted;
      case "tame":
        return !this.job.animal.dead && this.job.animal.tameMark;
      case "build":
      case "worship":
        return !this.job.building.removed &&
          (!night || isLit(buildings, this.job.building.centerX, this.job.building.centerY));
      case "craft": {
        const shop = this.job.building;
        const lit2 = !night || isLit(buildings, shop.centerX, shop.centerY);
        if (shop.removed || !lit2) return false;
        if (this.job.product === "axe") {
          return shop.orders > 0 &&
            resources.wood >= AXE_WOOD_COST && resources.stone >= AXE_STONE_COST;
        }
        if (this.job.product === "spear") {
          return shop.spearOrders > 0 &&
            resources.wood >= SPEAR_WOOD_COST && resources.log >= SPEAR_LOG_COST &&
            resources.stone >= SPEAR_STONE_COST;
        }
        return shop.clothOrders > 0 && resources.leather >= CLOTH_LEATHER_COST;
      }
      case "split":
        return !this.job.building.removed && resources.log >= SPLIT_LOG_COST &&
          (!night || isLit(buildings, this.job.building.centerX, this.job.building.centerY));
      case "pickup":
        return !this.job.building.removed &&
          (this.job.product === "axe"
            ? this.job.building.toolStock > 0
            : this.job.product === "spear"
            ? this.job.building.spearStock > 0
            : this.job.building.clothStock > 0);
      case "spearhunt":
        return !this.job.animal.dead;
      case "sleep":
        return this.shouldGoSleep(buildings);
      case "eat":
        return foodTotal() > 0; // hayatta kalma: ışık aranmaz
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
    let speed = (this.starving ? WALK_SPEED * 0.5 : WALK_SPEED) * tuning.moveSpeed;
    if (this.baby) speed *= 0.55; // bebekler tıpış tıpış yürür
    else if (this.child) speed *= 0.75; // çocuklar da yetişkinden yavaş
    speed *= this.getWorkSpeedFactor(); // 100 moral -> 1.0, 0 moral -> 0.5 (yarı yarıya yavaş)
    if (world.get(this.tileX, this.tileY) === Tile.Road) speed *= 1.4; // taş yol
    const step = speed * dt;

    if (dx !== 0) this.facing = dx > 0 ? 1 : -1;
    this.walkPhase += dt * 9;
    this.stepSoundTimer -= dt;
    if (this.stepSoundTimer <= 0) {
      this.stepSoundTimer = 0.34 + Math.random() * 0.08;
      sfxStep(this.x, this.y);
    }

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
    const speedFactor = this.getWorkSpeedFactor();
    switch (this.job.kind) {
      case "chop":
        this.state = "chopping";
        this.timer = (this.hasAxe ? CHOP_TIME_AXE : chopTime()) / speedFactor;
        break;
      case "gather":
        this.state = "gathering";
        this.timer = gatherTime() / speedFactor;
        break;
      case "mine":
        this.state = "mining";
        this.timer = MINE_TIME / speedFactor;
        break;
      case "plant":
        this.state = "planting";
        this.timer = PLANT_TIME / speedFactor;
        break;
      case "fish": {
        this.state = "fishing";
        this.timer = FISH_TIME / speedFactor;
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
        this.timer = TEND_TIME / speedFactor;
        this.faceTowards(this.job.animal.x);
        break;
      case "tame": {
        const a2 = this.job.animal;
        const d2 = Math.hypot(a2.x - this.x, a2.y - this.y);
        if (d2 > 2.5 * TILE_SIZE) {
          // hayvan bu sırada uzaklaştı: peşinden git (sahiplik korunur)
          const chase = findPath(
            world, this.tileX, this.tileY,
            Math.floor(a2.x / TILE_SIZE), Math.floor(a2.y / TILE_SIZE)
          );
          if (chase) {
            this.startPath(chase);
          } else {
            a2.claimed = false;
            this.job = null;
            this.toIdle();
          }
          break;
        }
        this.state = "tending";
        this.timer = TAME_TIME / speedFactor;
        this.faceTowards(a2.x);
        break;
      }
      case "build":
        this.state = "building";
        this.faceTowards(this.job.building.centerX);
        break;
      case "worship":
        this.state = "worshipping";
        this.timer = WORSHIP_TIME / speedFactor;
        this.faceTowards(this.job.building.centerX);
        break;
      case "split":
        this.state = "crafting";
        this.timer = SPLIT_TIME / speedFactor;
        this.faceTowards(this.job.building.centerX);
        break;
      case "craft":
        this.state = "crafting";
        this.timer =
          (this.job.product === "axe"
            ? AXE_CRAFT_TIME
            : this.job.product === "spear"
            ? SPEAR_CRAFT_TIME
            : CLOTH_CRAFT_TIME) / speedFactor;
        this.faceTowards(this.job.building.centerX);
        break;
      case "pickup": {
        const shop = this.job.building;
        if (this.job.product === "axe") {
          shop.toolReserved = Math.max(0, shop.toolReserved - this.job.amount);
          if (shop.toolStock > 0 && !this.hasAxe) {
            shop.toolStock--;
            this.hasAxe = true;
            addFloater(this.x, this.y - 14, "Balta aldı", "#c9d4dc");
          }
        } else if (this.job.product === "spear") {
          shop.spearReserved = Math.max(0, shop.spearReserved - this.job.amount);
          const take = Math.min(this.job.amount, shop.spearStock, MAX_CARRIED_SPEARS - this.spears);
          if (take > 0) {
            shop.spearStock -= take;
            this.spears += take;
            addFloater(this.x, this.y - 14, `+${take} mızrak`, "#d4c49a");
          }
        } else {
          shop.clothReserved = Math.max(0, shop.clothReserved - this.job.amount);
          if (shop.clothStock > 0 && !this.hasClothes) {
            shop.clothStock--;
            this.hasClothes = true;
            addFloater(this.x, this.y - 14, "Giysi giydi", "#a87c4f");
          }
        }
        this.job = null;
        this.toIdle();
        break;
      }
      case "sleep": {
        const b = this.job.building;
        this.job = null;
        this.enterSleep(b);
        break;
      }
      case "eat":
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
      if (job?.kind === "worship") {
        job.building.worshipClaimed = false;
        job.building.worshipSpots.delete(job.tile);
      }
      this.job = null;
      this.toIdle();
      return;
    }
    this.walkPhase += dt * 3; // yavaş sallanarak dua
    this.timer -= dt;
    if (this.timer <= 0) {
      const gain = worshipState.yield;
      resources.knowledge += gain;
      resources.faith += 1; // her ayin biraz inanç da getirir
      addFloater(
        job.building.centerX, job.building.y * TILE_SIZE - 6,
        `+${gain} bilgi`, "#b08fe0"
      );
      job.building.worshipClaimed = false;
      job.building.worshipSpots.delete(job.tile);
      job.building.worshipTimer = 0;
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
    let foodKeep = 0;
    const foodKeepRef = { value: foodKeep };
    for (const item of ITEM_TYPES) {
      const depositAmount = this.getDepositableAmount(item, foodKeepRef);
      if (depositAmount <= 0) continue;
      const added = addItem(item, depositAmount);
      // sığmayanlar çantada kalır (depo boşalınca tekrar denenir)
      this.inventory[item] -= added;
      if (added > 0) {
        addFloater(
          job.building.centerX,
          job.building.centerY - 18 - line * 7,
          `+${added} ${ITEM_INFO[item].name}`,
          ITEM_INFO[item].color
        );
        line++;
      }
      if (added < depositAmount) anyFull = true;
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

  // Vuruş ritmiyle parçacık saç (balta/kazma/çekiç efekti) + ses
  private hitParticles(dt: number, x: number, y: number, color: string): void {
    this.hitTimer -= dt;
    if (this.hitTimer <= 0) {
      this.hitTimer = 0.45;
      burst(x, y, color, 4);
      sfxHit(
        x, y,
        color === "#aab0b8" || color === "#c9d4dc" ? "stone" : "wood"
      );
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
    const choppable =
      job?.kind === "chop" &&
      (job.auto
        ? world.get(job.tile % world.width, Math.floor(job.tile / world.width)) === Tile.Tree
        : world.markedTrees.has(job.tile));
    if (!job || job.kind !== "chop" || !choppable) {
      this.releaseJob(world);
      this.toIdle();
      return;
    }
    const c = this.jobTileCenter(world, job.tile);
    this.faceTowards(c.x);
    if (this.hasAxe) {
      // Baltayla kesim: hızlı vuruş, talaş saçılır
      this.walkPhase += dt * 10;
      this.hitParticles(dt, c.x, c.y - 4, "#7a5a36");
    } else {
      // Elle dal toplama: balta yok, yavaş öne eğilme hareketi
      this.walkPhase += dt * 4;
    }
    this.timer -= dt;
    if (this.timer <= 0) {
      const tx = job.tile % world.width;
      const ty = Math.floor(job.tile / world.width);
      if (this.hasAxe) {
        // ağaç tamamen devrilir (yeniden çıkmaz): kütük (odun) + biraz dal
        world.fellTree(tx, ty);
        this.gainItem("log", AXE_LOG_YIELD, c.x, c.y - 10);
        this.gainItem("wood", AXE_BRANCH_BONUS, c.x, c.y - 3);
      } else {
        world.pruneTree(tx, ty);
        this.gainItem("wood", 1, c.x, c.y - 10);
      }
      this.job = null;
      this.toIdle();
    }
  }

  // Atölyede balta yap: hammadde tamamlanınca düşülür, stok artar
  private craft(dt: number): void {
    const job = this.job;
    if (job?.kind === "split") {
      this.split(dt, job.building);
      return;
    }
    if (!job || job.kind !== "craft" || job.building.removed) {
      this.job = null;
      this.toIdle();
      return;
    }
    const shop = job.building;
    this.walkPhase += dt * 9; // çekiç ritmi
    this.hitParticles(dt, shop.centerX, shop.centerY - 6, "#c9d4dc");
    this.timer -= dt;
    if (this.timer <= 0) {
      let made = false;
      if (job.product === "cloth") {
        if (shop.clothOrders > 0 && resources.leather >= CLOTH_LEATHER_COST) {
          resources.leather -= CLOTH_LEATHER_COST;
          shop.clothOrders--;
          shop.clothStock++;
          addFloater(shop.centerX, shop.y * TILE_SIZE - 6, "+1 giysi", "#a87c4f");
          made = true;
        }
      } else {
        const isAxe = job.product === "axe";
        const woodCost = isAxe ? AXE_WOOD_COST : SPEAR_WOOD_COST;
        const logCost = isAxe ? 0 : SPEAR_LOG_COST;
        const stoneCost = isAxe ? AXE_STONE_COST : SPEAR_STONE_COST;
        const orders = isAxe ? shop.orders : shop.spearOrders;
        if (
          orders > 0 && resources.wood >= woodCost &&
          resources.log >= logCost && resources.stone >= stoneCost
        ) {
          resources.wood -= woodCost;
          resources.log -= logCost;
          resources.stone -= stoneCost;
          if (isAxe) {
            shop.orders--;
            shop.toolStock++;
            addFloater(shop.centerX, shop.y * TILE_SIZE - 6, "+1 balta", "#c9d4dc");
          } else {
            shop.spearOrders--;
            shop.spearStock++;
            addFloater(shop.centerX, shop.y * TILE_SIZE - 6, "+1 mızrak", "#d4c49a");
          }
          made = true;
        }
      }
      if (!made) {
        addFloater(shop.centerX, shop.y * TILE_SIZE - 6, "Hammadde yok!", "#ff6655");
      }
      this.job = null;
      this.toIdle();
    }
  }

  // Kırıcıda kütük yarma: 1 odun -> 4 dal
  private split(dt: number, shop: Building): void {
    if (shop.removed) {
      this.job = null;
      this.toIdle();
      return;
    }
    this.walkPhase += dt * 10; // balyoz ritmi
    this.hitParticles(dt, shop.centerX, shop.centerY - 6, "#8a6a43");
    this.timer -= dt;
    if (this.timer <= 0) {
      if (resources.log >= SPLIT_LOG_COST) {
        resources.log -= SPLIT_LOG_COST;
        const added = addItem("wood", SPLIT_BRANCH_YIELD);
        addFloater(
          shop.centerX, shop.y * TILE_SIZE - 6,
          `+${added} dal`, "#8a6a43"
        );
      }
      this.job = null;
      this.toIdle();
    }
  }

  // Av/dövüş: hayvana doğru koş, menzile girince mızrak fırlat
  // (baltalıysa yakın dövüş); ölen hayvan işlenir: et + deri + yün
  private huntTick(dt: number, world: World): void {
    const job = this.job;
    if (!job || job.kind !== "spearhunt") {
      this.toIdle();
      return;
    }
    const a = job.animal;
    if (a.dead) {
      // başkası indirdi: mızraklarını toplayıp dön
      this.spears += job.thrown;
      this.job = null;
      this.toIdle();
      return;
    }
    const dx = a.x - this.x;
    const dy = a.y - this.y;
    const dist = Math.hypot(dx, dy);
    const useSpear = this.spears > 0;
    const range = useSpear ? SPEAR_THROW_RANGE : MELEE_RANGE;

    // vazgeçme: cephane bitti, av menzilden tamamen çıktı veya
    // (mızrak atıldıktan sonra) av kaçmayı başardı
    const escaped = job.thrown > 0 && dist > HUNT_GIVEUP_RANGE;
    if (dist > HUNT_APPROACH_RANGE || escaped || (!useSpear && !this.hasAxe)) {
      this.spears += job.thrown;
      this.job = null;
      this.toIdle();
      return;
    }

    if (dist > range) {
      // kovala (düz koşu; adrenalin moral cezasını kısmen bastırır)
      const speed =
        WALK_SPEED * 1.45 * tuning.moveSpeed * Math.max(0.8, this.getWorkSpeedFactor());
      const step = speed * dt;
      const nx = this.x + (dx / dist) * step;
      const ny = this.y + (dy / dist) * step;
      if (world.walkableAt(Math.floor(nx / TILE_SIZE), Math.floor(ny / TILE_SIZE))) {
        this.x = nx;
        this.y = ny;
      } else if (world.walkableAt(Math.floor(nx / TILE_SIZE), Math.floor(this.y / TILE_SIZE))) {
        this.x = nx; // engel boyunca yatay kay
      } else if (world.walkableAt(Math.floor(this.x / TILE_SIZE), Math.floor(ny / TILE_SIZE))) {
        this.y = ny; // engel boyunca dikey kay
      } else {
        // sıkıştı: avı bırak (çakılı kalmasın)
        this.spears += job.thrown;
        this.job = null;
        this.toIdle();
        return;
      }
      this.facing = dx > 0 ? 1 : -1;
      this.walkPhase += dt * 10;
      return;
    }

    // menzilde: atış/vuruş ritmi
    this.faceTowards(a.x);
    this.walkPhase += dt * 6;
    this.throwTimer -= dt;
    if (this.throwTimer > 0) return;
    this.throwTimer = SPEAR_THROW_TIME / this.getWorkSpeedFactor();
    this.attackAnim = 0.3; // kol savurma pozu
    if (useSpear) {
      this.spears--;
      job.thrown++;
      // mızrak uçuşu: varış anında saplanma efekti (hasar hemen işlenir)
      const tx = a.x;
      const ty = a.y - 4;
      sfxWhoosh(this.x, this.y);
      throwSpearFx(this.x + this.facing * 3, this.y - 9, tx, ty, () => {
        burst(tx, ty, "#d4c49a", 4);
        burst(tx, ty, "#d44040", 3);
      });
    } else {
      burst(a.x, a.y - 4, "#c9d4dc", 4);
      burst(a.x, a.y - 3, "#d44040", 3);
    }
    a.takeHit(useSpear ? SPEAR_DAMAGE : MELEE_DAMAGE, this.x, this.y);
    if (a.hp <= 0) {
      // hayvan düştü: işle — boyutuna göre et, deri, yün
      a.dead = true;
      a.slaughtered = true;
      a.claimed = false;
      if (a.def.predator) {
        addJournal(`⚔ ${this.fullName} saldırgan ${a.def.name.toLowerCase()} hayvanını öldürdü!`);
      } else {
        addJournal(`🏹 ${this.fullName} bir ${a.def.name.toLowerCase()} avladı`);
      }
      this.gainItem("meat", a.def.huntYield, a.x, a.y - 10);
      if (a.def.leatherYield > 0) this.gainItem("leather", a.def.leatherYield, a.x, a.y - 4);
      if (a.def.woolYield > 0) this.gainItem("wool", a.def.woolYield, a.x, a.y + 2);
      this.spears += job.thrown; // saplanan mızraklar geri toplanır
      this.job = null;
      this.toIdle();
    }
  }

  // Akşam: en yakın ateşin (kamp ateşi veya meşaleli bina) başına git
  private gatherAtFire(world: World, buildings: Building[]): void {
    let fire: Building | null = null;
    let fireD = Infinity;
    for (const b of buildings) {
      if (!b.done) continue;
      if (!b.hasTorch && b.type !== BuildingType.Camp) continue;
      const d = Math.abs(b.centerX - this.x) + Math.abs(b.centerY - this.y);
      if (d < fireD) {
        fireD = d;
        fire = b;
      }
    }
    if (!fire) {
      this.timer = 1 + Math.random();
      return;
    }
    if (fireD <= TILE_SIZE * 3) {
      // ateşin başındayız: otur, ısın (moral etkisi update'te işler)
      this.faceTowards(fire.centerX);
      this.timer = 1 + Math.random() * 1.5;
      return;
    }
    const cx = Math.floor(fire.centerX / TILE_SIZE);
    const cy = Math.floor(fire.centerY / TILE_SIZE);
    for (let attempt = 0; attempt < 8; attempt++) {
      const tx = cx + Math.floor((Math.random() * 2 - 1) * 2.5);
      const ty = cy + Math.floor((Math.random() * 2 - 1) * 2.5);
      if (!world.walkableAt(tx, ty)) continue;
      const path = findPath(world, this.tileX, this.tileY, tx, ty);
      if (path) {
        this.startPath(path);
        return;
      }
    }
    this.timer = 1 + Math.random();
  }

  private gather(dt: number, world: World): void {
    const job = this.job;
    const gatherable =
      job?.kind === "gather" &&
      (job.auto
        ? foodItemOf(world.get(job.tile % world.width, Math.floor(job.tile / world.width))) === job.item
        : world.markedBushes.has(job.tile));
    if (!job || job.kind !== "gather" || !gatherable) {
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
    const txm = job && job.kind === "mine" ? job.tile % world.width : 0;
    const tym = job && job.kind === "mine" ? Math.floor(job.tile / world.width) : 0;
    const mineable =
      job?.kind === "mine" &&
      (job.auto
        ? world.get(txm, tym) === Tile.Pebbles
        : world.markedStones.has(job.tile));
    if (!job || job.kind !== "mine" || !mineable) {
      this.releaseJob(world);
      this.toIdle();
      return;
    }
    const tx = job.tile % world.width;
    const ty = Math.floor(job.tile / world.width);
    const isPebbles = world.get(tx, ty) === Tile.Pebbles;
    const c = this.jobTileCenter(world, job.tile);
    this.faceTowards(c.x);
    // çakıl elle toplanır (eğilme), kaya kazmayla kırılır
    this.walkPhase += dt * (isPebbles ? 7 : 11);
    if (!isPebbles) this.hitParticles(dt, c.x, c.y - 2, "#aab0b8");
    this.timer -= dt;
    if (this.timer <= 0) {
      if (isPebbles) {
        world.harvestPebbles(tx, ty);
        this.gainItem("stone", PEBBLE_YIELD, c.x, c.y - 10);
      } else {
        world.mineStone(tx, ty);
        this.gainItem("stone", STONE_PER_MINE, c.x, c.y - 10);
      }
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
    if (
      !job ||
      (job.kind !== "tend" && job.kind !== "hunt" && job.kind !== "tame") ||
      job.animal.dead
    ) {
      if (job?.kind === "tend" || job?.kind === "hunt" || job?.kind === "tame") {
        job.animal.claimed = false;
      }
      this.job = null;
      this.toIdle();
      return;
    }
    this.walkPhase += dt * 7;
    this.timer -= dt;
    if (this.timer <= 0) {
      const a = job.animal;
      if (job.kind === "tame") {
        // hayvan süreç içinde kaçtıysa yeniden yaklaş
        if (Math.hypot(a.x - this.x, a.y - this.y) > 3 * TILE_SIZE) {
          a.claimed = false;
          this.job = null;
          this.toIdle();
          return;
        }
        // evcilleştirme: yabani tür evcil karşılığına dönüşür
        const target = TAME_TARGET[a.type];
        if (target) {
          a.type = target;
          a.tameMark = false;
          a.hunted = false;
          a.claimed = false;
          a.hp = a.def.hp;
          a.fleeTimer = 0;
          if (target === "dog") {
            a.barn = null;
            a.owner = null; // main en uygun avcıya bağlar
            addJournal(`🐕 ${this.fullName} bir kurdu evcilleştirdi — artık köpek!`);
            addFloater(a.x, a.y - 10, "🐕 Evcilleşti!", "#8fd05e");
          } else {
            a.barn = job.barn;
            a.produceTimer = a.def.interval * (0.4 + Math.random() * 0.6);
            addJournal(`🐄 ${this.fullName} bir ${ANIMAL_DEFS[target].name.toLowerCase()} kazandırdı (evcilleştirme)`);
            addFloater(a.x, a.y - 10, "Evcilleşti!", "#8fd05e");
          }
        }
        this.job = null;
        this.toIdle();
        return;
      }
      if (job.kind === "hunt") {
        // av: hayvan gider, balık gelir
        this.gainItem("fish", a.def.huntYield, a.x, a.y - 10);
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

  private plant(dt: number, world: World): void {
    const job = this.job;
    if (!job || job.kind !== "plant") {
      this.toIdle();
      return;
    }
    this.walkPhase += dt * 7; // eğilip dikme
    this.timer -= dt;
    if (this.timer <= 0) {
      world.plantSapling(
        job.tile % world.width,
        Math.floor(job.tile / world.width),
        job.target
      );
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
    job.building.progress += dt * this.getWorkSpeedFactor();
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
