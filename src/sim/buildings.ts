import { TILE_SIZE } from "../world/tiles";
import { Tile } from "../world/tiles";
import type { World } from "../world/world";
import { isFull } from "./resources";

export const enum BuildingType {
  House = 0,
  Depot = 1,
  Woodcutter = 2,
  Gatherer = 3,
  Camp = 4, // başlangıç kampı: hazır kurulu küçük depo (inşa edilemez)
  Torch = 5, // 1x1: geceyi aydınlatır
  Temple = 6, // köylüler tapınarak bilgi üretir
  Cafeteria = 7, // köylüler burada yemek yer: tokluk tamamen dolar
  Nursery = 8, // bebekler burada bakılır: hızlı büyür, acıkmaz
  Fisher = 9, // su kenarına kurulur; balıkçılar kıyıdan balık tutar
}

export interface BuildingDef {
  name: string;
  cost: number; // odun
  buildTime: number; // saniye (tek inşaatçı ile)
  size: number; // kapladığı kare kenarı (blok)
  maxWorkers: number; // bu binada istihdam edilebilecek işçi sayısı
  needsWater?: boolean; // su kenarına kurulmak zorunda
  desc: string;
}

export const BUILDING_SIZE = 2; // standart bina boyutu

export const BUILDING_DEFS: Record<BuildingType, BuildingDef> = {
  [BuildingType.House]: {
    name: "Ev",
    cost: 8,
    buildTime: 8,
    size: 2,
    maxWorkers: 0,
    desc: "4 kişilik konut; boş yer varsa bebek doğabilir",
  },
  [BuildingType.Depot]: {
    name: "Depo",
    cost: 12,
    buildTime: 10,
    size: 2,
    maxWorkers: 0,
    desc: "Odun ve yemek kapasitesi +80",
  },
  [BuildingType.Woodcutter]: {
    name: "Oduncu",
    cost: 10,
    buildTime: 8,
    size: 2,
    maxWorkers: 3,
    desc: "3 oduncu istihdam eder; çevresindeki ağaçları keserler",
  },
  [BuildingType.Gatherer]: {
    name: "Toplayıcı",
    cost: 10,
    buildTime: 8,
    size: 2,
    maxWorkers: 3,
    desc: "3 toplayıcı istihdam eder; çevredeki çalı ve mantarları toplarlar",
  },
  [BuildingType.Camp]: {
    name: "Kamp",
    cost: 0,
    buildTime: 0,
    size: 2,
    maxWorkers: 0,
    desc: "Koloninin başlangıç noktası; eşyalar buraya teslim edilir",
  },
  [BuildingType.Torch]: {
    name: "Meşale",
    cost: 2,
    buildTime: 2,
    size: 1,
    maxWorkers: 0,
    desc: "Geceyi aydınlatır; köylüler ışıksız çalışamaz",
  },
  [BuildingType.Temple]: {
    name: "Tapınak",
    cost: 20,
    buildTime: 12,
    size: 2,
    maxWorkers: 2,
    desc: "2 rahip istihdam eder; tapınarak bilgi üretirler",
  },
  [BuildingType.Cafeteria]: {
    name: "Yemekhane",
    cost: 14,
    buildTime: 9,
    size: 2,
    maxWorkers: 0,
    desc: "Burada yenen yemek tokluğu tamamen doldurur",
  },
  [BuildingType.Nursery]: {
    name: "Bakımevi",
    cost: 12,
    buildTime: 8,
    size: 2,
    maxWorkers: 0,
    desc: "Bebekler acıkmaz ve iki kat hızlı büyür",
  },
  [BuildingType.Fisher]: {
    name: "Balıkçı",
    cost: 12,
    buildTime: 9,
    size: 2,
    maxWorkers: 2,
    needsWater: true,
    desc: "2 balıkçı istihdam eder; su kenarına kurulur, kışın da çalışır",
  },
};

// ---- Konut sistemi ----

export const HOUSE_CAPACITY = 4;

export function isHousing(b: Building): boolean {
  return b.done && (b.type === BuildingType.House || b.type === BuildingType.Camp);
}

// Bina bazlı istihdamda çalışanların unvanı
export const ROLE_NAMES: Partial<Record<BuildingType, string>> = {
  [BuildingType.Woodcutter]: "Oduncu",
  [BuildingType.Gatherer]: "Toplayıcı",
  [BuildingType.Temple]: "Rahip",
  [BuildingType.Fisher]: "Balıkçı",
};

// Işık kaynakları ve dünya-piksel cinsinden yarıçapları
export const LIGHT_RADIUS: Partial<Record<BuildingType, number>> = {
  [BuildingType.Torch]: 88,
  [BuildingType.Camp]: 72,
};

// Bu nokta gece çalışılabilecek kadar aydınlık mı?
export function isLit(buildings: Building[], wx: number, wy: number): boolean {
  for (const b of buildings) {
    if (!b.done) continue;
    const r = LIGHT_RADIUS[b.type];
    if (!r) continue;
    const dx = wx - b.centerX;
    const dy = wy - b.centerY;
    if (dx * dx + dy * dy <= r * r) return true;
  }
  return false;
}

export const WORSHIP_INTERVAL = 20; // saniye: tapınak yeni ayine bu arayla izin verir
export const WORSHIP_TIME = 6;
export const KNOWLEDGE_PER_WORSHIP = 1;

// Köylülerin topladıklarını teslim edebileceği bina mı?
export function isDepositPoint(b: Building): boolean {
  return b.done && (b.type === BuildingType.Depot || b.type === BuildingType.Camp);
}

export const AUTO_MARK_RADIUS = 9; // blok: kulübenin çalışma alanı
const SCAN_INTERVAL = 2.5; // saniye

export class Building {
  progress = 0;
  claimed = false; // bir inşaatçı bu şantiyeyi sahiplendi mi
  effectApplied = false; // tamamlanma etkisi (köylü gelmesi vb.) bir kez uygulanır
  worshipTimer = 8; // tapınak: bu sayaç bitince yeni ayin yapılabilir
  worshipClaimed = false;
  private scanTimer = Math.random() * SCAN_INTERVAL;

  constructor(
    readonly type: BuildingType,
    readonly x: number, // sol üst blok
    readonly y: number
  ) {}

  get def(): BuildingDef {
    return BUILDING_DEFS[this.type];
  }

  get size(): number {
    return this.def.size;
  }

  get done(): boolean {
    return this.progress >= this.def.buildTime;
  }

  get centerX(): number {
    return (this.x + this.size / 2) * TILE_SIZE;
  }

  get centerY(): number {
    return (this.y + this.size / 2) * TILE_SIZE;
  }

  get worshipReady(): boolean {
    return this.type === BuildingType.Temple && this.done &&
      this.worshipTimer <= 0 && !this.worshipClaimed;
  }

  // Üretim binaları çalışan sayısına göre çevrelerindeki kaynakları işaretler
  // (çalışanı yoksa işaretlemez; her çalışan 2 işaretlik kapasite ekler)
  update(dt: number, world: World, workers: number): void {
    if (!this.done) return;
    if (this.type === BuildingType.Temple && this.worshipTimer > 0) {
      this.worshipTimer -= dt;
    }
    if (this.type !== BuildingType.Woodcutter && this.type !== BuildingType.Gatherer) return;
    this.scanTimer -= dt;
    if (this.scanTimer > 0) return;
    this.scanTimer = SCAN_INTERVAL;
    if (workers <= 0) return;
    const maxMarks = workers * 2;

    const cx = this.x + 1;
    const cy = this.y + 1;
    if (this.type === BuildingType.Woodcutter) {
      if (isFull("wood")) return; // depo dolu: işaretlemeyi durdur
      if (world.countMarkedNear(world.markedTrees, cx, cy, AUTO_MARK_RADIUS) >= maxMarks) return;
      const t = world.findNearestTileOfType(Tile.Tree, cx, cy, AUTO_MARK_RADIUS, world.markedTrees);
      if (t) world.markTree(t.x, t.y);
    } else {
      if (world.countMarkedNear(world.markedBushes, cx, cy, AUTO_MARK_RADIUS) >= maxMarks) return;
      const b =
        (isFull("berry") ? null
          : world.findNearestTileOfType(Tile.Bush, cx, cy, AUTO_MARK_RADIUS, world.markedBushes)) ??
        (isFull("mushroom") ? null
          : world.findNearestTileOfType(Tile.Mushroom, cx, cy, AUTO_MARK_RADIUS, world.markedBushes));
      if (b) world.markFood(b.x, b.y);
    }
  }
}

// Yerleştirme kontrolü: ayak izinin tamamı boş ve yürünebilir zemin olmalı
export function canPlace(world: World, tx: number, ty: number, size: number): boolean {
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      if (!world.walkableAt(tx + dx, ty + dy)) return false;
    }
  }
  return true;
}

export function placeBuilding(world: World, b: Building): void {
  for (let dy = 0; dy < b.size; dy++) {
    for (let dx = 0; dx < b.size; dx++) {
      world.blocked.add(world.index(b.x + dx, b.y + dy));
    }
  }
}
