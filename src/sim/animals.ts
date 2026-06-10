// Çiftlik hayvanları: çiftliğin etrafında dolanır, acıkınca çimende otlar,
// ürünleri çiftçiler toplar. Aç hayvan üretmez; uzun süre aç kalan telef olur.

import { Tile, TILE_SIZE } from "../world/tiles";
import type { World } from "../world/world";
import type { Building } from "./buildings";
import type { ItemType } from "./resources";

export type AnimalType =
  | "chicken" | "cow" | "pig" | "sheep" | "goat" // çiftlik
  | "rabbit" | "deer" | "boar"; // yabani (avlanabilir)

export interface AnimalDef {
  name: string;
  product: ItemType;
  yieldAmount: number;
  interval: number; // saniye: ürün hazırlanma süresi
  speed: number;
  huntYield: number; // avlanınca verilen et
  slaughter?: boolean; // ürün almak hayvanı götürür (yenisi sonra gelir)
}

const NEVER = 1e9; // yabaniler "ürün" hazırlamaz (sahipsizler tüketilemez)

export const ANIMAL_DEFS: Record<AnimalType, AnimalDef> = {
  chicken: { name: "Tavuk", product: "egg", yieldAmount: 2, interval: 30, speed: 14, huntYield: 1 },
  cow: { name: "İnek", product: "milk", yieldAmount: 2, interval: 45, speed: 9, huntYield: 4 },
  pig: { name: "Domuz", product: "meat", yieldAmount: 4, interval: 70, speed: 11, slaughter: true, huntYield: 4 },
  sheep: { name: "Koyun", product: "wool", yieldAmount: 2, interval: 50, speed: 10, huntYield: 2 },
  goat: { name: "Keçi", product: "milk", yieldAmount: 2, interval: 40, speed: 12, huntYield: 2 },
  rabbit: { name: "Tavşan", product: "meat", yieldAmount: 1, interval: NEVER, speed: 24, huntYield: 1 },
  deer: { name: "Geyik", product: "meat", yieldAmount: 4, interval: NEVER, speed: 18, huntYield: 4 },
  boar: { name: "Yaban Domuzu", product: "meat", yieldAmount: 3, interval: NEVER, speed: 13, huntYield: 3 },
};

// Çiftlik tamamlanınca gelen sürü
export const BARN_HERD: AnimalType[] = ["chicken", "chicken", "cow", "pig", "sheep", "goat"];

// Yabani doğum havuzu (ağırlıklı): normal hayvanlar da doğada rastgele türer
export const WILD_POOL: AnimalType[] = [
  "rabbit", "rabbit", "rabbit", "deer", "deer", "boar",
  "chicken", "chicken", "cow", "pig", "sheep", "sheep", "goat",
];

const WANDER_RADIUS = 4; // çiftlik merkezinden blok
const HUNGER_RATE = 100 / 120; // 2 dakikada acıkır
const GRAZE_THRESHOLD = 70; // bunun üstünde otlamaya gider, üretim durur
const STARVE_TIME = 60; // 100 açlıkta bu kadar kalan telef olur

export class Animal {
  x: number;
  y: number;
  facing: 1 | -1 = 1;
  walkPhase = 0;
  hunger: number;
  grazing = false;
  dead = false;
  slaughtered = false; // çiftçi kesti / avlandı (telef değil)
  hunted = false; // oyuncu av için işaretledi (yalnızca yabaniler)
  claimed = false; // bir köylü bu hayvana yöneldi
  produceTimer: number;
  // yabaniler doğdukları noktanın çevresinde dolanır
  private anchorX: number;
  private anchorY: number;
  private starveTimer = 0;
  private targetX: number;
  private targetY: number;
  private idleTimer = Math.random() * 2;

  constructor(
    readonly type: AnimalType,
    readonly barn: Building | null,
    tileX: number,
    tileY: number
  ) {
    this.x = (tileX + 0.5) * TILE_SIZE;
    this.y = (tileY + 0.5) * TILE_SIZE;
    this.anchorX = this.x;
    this.anchorY = this.y;
    this.targetX = this.x;
    this.targetY = this.y;
    this.hunger = Math.random() * 40;
    // yabaniler (sahipsizler) ürün hazırlamaz, yalnızca avlanır
    this.produceTimer = barn
      ? ANIMAL_DEFS[type].interval * (0.4 + Math.random() * 0.6)
      : 1e9;
  }

  get wild(): boolean {
    return this.barn === null;
  }

  get def(): AnimalDef {
    return ANIMAL_DEFS[this.type];
  }

  get ready(): boolean {
    return !this.dead && this.produceTimer <= 0 && !this.claimed;
  }

  update(dt: number, world: World): void {
    // açlık ve telef
    this.hunger = Math.min(100, this.hunger + HUNGER_RATE * dt);
    if (this.hunger >= 100) {
      this.starveTimer += dt;
      if (this.starveTimer >= STARVE_TIME) {
        this.dead = true;
        return;
      }
    } else {
      this.starveTimer = 0;
    }

    // tok hayvan üretir; aç hayvan üretmez
    if (this.hunger < GRAZE_THRESHOLD && this.produceTimer > 0) {
      this.produceTimer -= dt;
    }

    if (this.claimed) {
      this.grazing = false;
      return; // çiftçi gelirken bekle
    }

    // otlama: çimenin üstündeyse karnını doyurur
    const onGrass =
      world.inBounds(this.tileX, this.tileY) &&
      world.get(this.tileX, this.tileY) === Tile.Grass;
    if (this.hunger > GRAZE_THRESHOLD && onGrass) {
      this.grazing = true;
      this.walkPhase += dt * 4;
      this.hunger = Math.max(0, this.hunger - 35 * dt);
      if (this.hunger < 10) this.grazing = false;
      return;
    }
    this.grazing = false;

    const dx = this.targetX - this.x;
    const dy = this.targetY - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 1.5) {
      const step = this.def.speed * dt;
      const nx = this.x + (dx / dist) * step;
      const ny = this.y + (dy / dist) * step;
      // yürünemeyen bloğa girme: hedefi iptal et
      if (world.walkableAt(Math.floor(nx / TILE_SIZE), Math.floor(ny / TILE_SIZE))) {
        this.x = nx;
        this.y = ny;
        if (dx !== 0) this.facing = dx > 0 ? 1 : -1;
        this.walkPhase += dt * 7;
      } else {
        this.targetX = this.x;
        this.targetY = this.y;
      }
      return;
    }
    this.walkPhase = 0;
    this.idleTimer -= dt;
    if (this.idleTimer <= 0) {
      this.idleTimer = 1.5 + Math.random() * 3;
      this.pickTarget(world);
    }
  }

  private get tileX(): number {
    return Math.floor(this.x / TILE_SIZE);
  }
  private get tileY(): number {
    return Math.floor(this.y / TILE_SIZE);
  }

  // Açken çimen arar, değilse çiftliğin/yuvasının çevresinde dolanır
  private pickTarget(world: World): void {
    const ax = this.barn ? this.barn.centerX : this.anchorX;
    const ay = this.barn ? this.barn.centerY : this.anchorY;
    const cx = Math.floor(ax / TILE_SIZE);
    const cy = Math.floor(ay / TILE_SIZE);
    const radius = this.wild ? 8 : WANDER_RADIUS;
    const wantGrass = this.hunger > GRAZE_THRESHOLD;
    for (let attempt = 0; attempt < 10; attempt++) {
      const tx = cx + Math.floor((Math.random() * 2 - 1) * radius);
      const ty = cy + Math.floor((Math.random() * 2 - 1) * radius);
      if (!world.walkableAt(tx, ty)) continue;
      if (wantGrass && world.get(tx, ty) !== Tile.Grass) continue;
      this.targetX = (tx + 0.5) * TILE_SIZE;
      this.targetY = (ty + 0.5) * TILE_SIZE;
      return;
    }
  }
}
