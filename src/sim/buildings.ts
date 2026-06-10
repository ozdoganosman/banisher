import { TILE_SIZE } from "../world/tiles";
import { Tile } from "../world/tiles";
import type { World } from "../world/world";

export const enum BuildingType {
  House = 0,
  Depot = 1,
  Woodcutter = 2,
  Gatherer = 3,
}

export interface BuildingDef {
  name: string;
  cost: number; // odun
  buildTime: number; // saniye (tek inşaatçı ile)
  desc: string;
}

export const BUILDING_SIZE = 2; // tüm binalar 2x2 blok kaplar

export const BUILDING_DEFS: Record<BuildingType, BuildingDef> = {
  [BuildingType.House]: {
    name: "Ev",
    cost: 8,
    buildTime: 8,
    desc: "Tamamlanınca 2 yeni köylü gelir",
  },
  [BuildingType.Depot]: {
    name: "Depo",
    cost: 12,
    buildTime: 10,
    desc: "Odun ve yemek kapasitesi +80",
  },
  [BuildingType.Woodcutter]: {
    name: "Oduncu",
    cost: 10,
    buildTime: 8,
    desc: "Çevredeki ağaçları otomatik işaretler",
  },
  [BuildingType.Gatherer]: {
    name: "Toplayıcı",
    cost: 10,
    buildTime: 8,
    desc: "Çevredeki çalıları otomatik işaretler",
  },
};

const AUTO_MARK_RADIUS = 9; // blok
const AUTO_MARK_MAX = 4; // aynı anda en fazla bu kadar işaret tut
const SCAN_INTERVAL = 2.5; // saniye

export class Building {
  progress = 0;
  claimed = false; // bir inşaatçı bu şantiyeyi sahiplendi mi
  effectApplied = false; // tamamlanma etkisi (köylü gelmesi vb.) bir kez uygulanır
  private scanTimer = Math.random() * SCAN_INTERVAL;

  constructor(
    readonly type: BuildingType,
    readonly x: number, // sol üst blok
    readonly y: number
  ) {}

  get def(): BuildingDef {
    return BUILDING_DEFS[this.type];
  }

  get done(): boolean {
    return this.progress >= this.def.buildTime;
  }

  get centerX(): number {
    return (this.x + BUILDING_SIZE / 2) * TILE_SIZE;
  }

  get centerY(): number {
    return (this.y + BUILDING_SIZE / 2) * TILE_SIZE;
  }

  // Tamamlanmış üretim binaları çevrelerindeki kaynakları işaretler
  update(dt: number, world: World): void {
    if (!this.done) return;
    if (this.type !== BuildingType.Woodcutter && this.type !== BuildingType.Gatherer) return;
    this.scanTimer -= dt;
    if (this.scanTimer > 0) return;
    this.scanTimer = SCAN_INTERVAL;

    const cx = this.x + 1;
    const cy = this.y + 1;
    if (this.type === BuildingType.Woodcutter) {
      if (world.countMarkedNear(world.markedTrees, cx, cy, AUTO_MARK_RADIUS) >= AUTO_MARK_MAX) return;
      const t = world.findNearestTileOfType(Tile.Tree, cx, cy, AUTO_MARK_RADIUS, world.markedTrees);
      if (t) world.markTree(t.x, t.y);
    } else {
      if (world.countMarkedNear(world.markedBushes, cx, cy, AUTO_MARK_RADIUS) >= AUTO_MARK_MAX) return;
      const b = world.findNearestTileOfType(Tile.Bush, cx, cy, AUTO_MARK_RADIUS, world.markedBushes);
      if (b) world.markBush(b.x, b.y);
    }
  }
}

// Yerleştirme kontrolü: 2x2 alanın tamamı boş ve yürünebilir zemin olmalı
export function canPlace(world: World, tx: number, ty: number): boolean {
  for (let dy = 0; dy < BUILDING_SIZE; dy++) {
    for (let dx = 0; dx < BUILDING_SIZE; dx++) {
      if (!world.walkableAt(tx + dx, ty + dy)) return false;
    }
  }
  return true;
}

export function placeBuilding(world: World, b: Building): void {
  for (let dy = 0; dy < BUILDING_SIZE; dy++) {
    for (let dx = 0; dx < BUILDING_SIZE; dx++) {
      world.blocked.add(world.index(b.x + dx, b.y + dy));
    }
  }
}
