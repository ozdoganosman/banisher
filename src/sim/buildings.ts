import { TILE_SIZE } from "../world/tiles";
import { Tile } from "../world/tiles";
import type { World } from "../world/world";
import { isFull, resources as resourceStore } from "./resources";
import { hasTech } from "./tech";

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
  Barn = 10, // çiftlik: tavuk/inek/domuz besler, çiftçiler ürün toplar
  ToolWorkshop = 12, // Alet atölyesi: sipariş üzerine balta/mızrak üretir
  HunterLodge = 13, // Avcı kulübesi: mızraklı avcılar en yakın hayvanları avlar
  Splitter = 14, // Kırıcı: odunu dala böler (1 odun -> 4 dal)
  Road = 15, // taş yol: yerleştirilince bina değil karo olur (1 taş)
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
    cost: 6,
    buildTime: 8,
    size: 2,
    maxWorkers: 3,
    desc: "3 oduncu: açlaçları buda, dal toplar; ağaçlar kend. büyür",
  },
  [BuildingType.Gatherer]: {
    name: "Toplayıcı",
    cost: 8,
    buildTime: 8,
    size: 2,
    maxWorkers: 3,
    desc: "3 toplayıcı: alanına yemiş eker ve toplar",
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
    maxWorkers: 3,
    desc: "Bakıcı başına 4 bebeğe bakılır (en çok 3 bakıcı); bakılan bebek acıkmaz, annesi çalışabilir ve çocuk eğitim alır",
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
  [BuildingType.Barn]: {
    name: "Çiftlik",
    cost: 18,
    buildTime: 11,
    size: 2,
    maxWorkers: 2,
    desc: "Çitle çevrili ağıl: bir tür seçilir; evcilleşenler buraya gelir. Yetişkin dişiler süt/yumurta verir, dişi+erkek çift yavru yapar; ağıl dolunca en yaşlısı kesilir (et)",
  },
  [BuildingType.ToolWorkshop]: {
    name: "Alet Atölyesi",
    cost: 16,
    buildTime: 10,
    size: 2,
    maxWorkers: 1,
    desc: "Sipariş üzerine balta, mızrak ve giysi üretir (alet/giyim tezgâhı)",
  },
  [BuildingType.HunterLodge]: {
    name: "Avcı Kulübesi",
    cost: 14,
    buildTime: 9,
    size: 2,
    maxWorkers: 3,
    desc: "3 avcı: mızrakla en yakın hayvanları avlar; et, deri ve yün kazanılır",
  },
  [BuildingType.Road]: {
    name: "Taş Yol",
    cost: 0, // dal yerine 1 taş harcar (yerleştirmede özel işlenir)
    buildTime: 0,
    size: 1,
    maxWorkers: 0,
    desc: "Karo başına 1 taş; üstünde %40 hızlı yürünür, köylüler yolu tercih eder",
  },
  [BuildingType.Splitter]: {
    name: "Kırıcı",
    cost: 10,
    buildTime: 8,
    size: 2,
    maxWorkers: 1,
    desc: "Kırıcı odunu dala böler: 1 odun -> 4 dal (stokta odun oldukça çalışır)",
  },
};

// Kırıcı dönüşümü
export const SPLIT_LOG_COST = 1;
export const SPLIT_BRANCH_YIELD = 4;
export const SPLIT_TIME = 5;

// Balta üretim reçetesi
export const AXE_WOOD_COST = 3;
export const AXE_STONE_COST = 3;
export const AXE_CRAFT_TIME = 10; // saniye

// Mızrak üretim reçetesi (Kan araştırması gerekir)
export const SPEAR_WOOD_COST = 5; // dal
export const SPEAR_LOG_COST = 2; // odun (baltayla kesilen ağaçtan)
export const SPEAR_STONE_COST = 5;
export const SPEAR_CRAFT_TIME = 8;
export const MAX_CARRIED_SPEARS = 5; // avcı yanına en çok bu kadar alır

// Giysi reçetesi (Deri İşleme araştırması gerekir)
export const CLOTH_LEATHER_COST = 3; // post/deri
export const CLOTH_CRAFT_TIME = 8;

// Binaya meşale takma bedeli (Doğa araştırması gerekir)
export const TORCH_ATTACH_COST = 5; // dal
export const TORCH_LIGHT_RADIUS = 88;
export const HOUSE_FIRE_RADIUS = 70; // kışın dal yakan evin ısı/ışık yarıçapı
export const HOUSE_FUEL_PER_DAY = 3; // yanan ev günde bu kadar dal tüketir

// ---- Konut sistemi ----

export const HOUSE_CAPACITY = 4;

// Yalnızca evler konuttur; kampta konaklanmaz (evsizler dışarıda yatar)
export function isHousing(b: Building): boolean {
  return b.done && b.type === BuildingType.House;
}

// Bina bazlı istihdamda çalışanların unvanı
export const ROLE_NAMES: Partial<Record<BuildingType, string>> = {
  [BuildingType.Woodcutter]: "Oduncu",
  [BuildingType.Gatherer]: "Toplayıcı",
  [BuildingType.Temple]: "Rahip",
  [BuildingType.Fisher]: "Balıkçı",
  [BuildingType.Barn]: "Çiftçi",
  [BuildingType.ToolWorkshop]: "Alet Ustası",
  [BuildingType.Nursery]: "Bakıcı",
  [BuildingType.HunterLodge]: "Avcı",
  [BuildingType.Splitter]: "Kırıcı",
};

// Işık kaynakları ve dünya-piksel cinsinden yarıçapları
export const LIGHT_RADIUS: Partial<Record<BuildingType, number>> = {
  [BuildingType.Torch]: 88,
  [BuildingType.Camp]: 72,
};

// Bir binanın o anki ışık/ısı yarıçapı (0 = ışıksız)
export function lightRadiusOf(b: Building): number {
  if (!b.done) return 0;
  if (b.burning) return HOUSE_FIRE_RADIUS; // kışın dal yakan ev
  if (b.hasTorch) return TORCH_LIGHT_RADIUS;
  return LIGHT_RADIUS[b.type] ?? 0;
}

// Bu nokta gece çalışılabilecek kadar aydınlık mı?
export function isLit(buildings: Building[], wx: number, wy: number): boolean {
  for (const b of buildings) {
    const r = lightRadiusOf(b);
    if (!r) continue;
    const dx = wx - b.centerX;
    const dy = wy - b.centerY;
    if (dx * dx + dy * dy <= r * r) return true;
  }
  return false;
}

export const WORSHIP_INTERVAL = 20; // saniye: tapınak yeni ayine bu arayla izin verir
export const WORSHIP_TIME = 15;
export const KNOWLEDGE_PER_WORSHIP = 1;

// Köylülerin topladıklarını teslim edebileceği bina mı?
export function isDepositPoint(b: Building): boolean {
  return b.done && (b.type === BuildingType.Depot || b.type === BuildingType.Camp);
}

export const AUTO_MARK_RADIUS = 6; // blok: kulübenin çalışma alanı
const SCAN_INTERVAL = 1.5; // saniye

export class Building {
  progress = 0;
  removed = false; // yıkıldı: köylüler işlerini bırakır
  claimed = false; // bir inşaatçı bu şantiyeyi sahiplendi mi
  effectApplied = false; // tamamlanma etkisi (köylü gelmesi vb.) bir kez uygulanır
  outOfResources = false; // çalışma alanında işlenecek kaynak kalmadı
  warnedOut = false; // kaynak bitti bildirimi bir kez gösterilir
  worshipTimer = 8; // tapınak: bu sayaç bitince yeni ayin yapılabilir
  worshipClaimed = false;
  // Alet atölyesi: bekleyen balta siparişi, hazır stok ve yolda olan rezervasyonlar
  orders = 0;
  toolStock = 0;
  toolReserved = 0;
  // Mızrak siparişi/stoğu (Kan araştırması)
  spearOrders = 0;
  spearStock = 0;
  spearReserved = 0;
  // Giysi siparişi/stoğu (Deri İşleme araştırması)
  clothOrders = 0;
  clothStock = 0;
  clothReserved = 0;
  // Binaya meşale takıldı: geceyi aydınlatır (5 dal, Doğa gerekir)
  hasTorch = false;
  // Ev: kışın dal yakmak açık mı (panelden); burning = o an gerçekten yanıyor mu
  fueled = false;
  burning = false;
  // Çiftlik: beslediği tür (kurulduktan sonra panelden seçilir)
  farmType: import("./animals").AnimalType | null = null;
  // Çiftlik: yeni yavru için üreme sayacı (saniye)
  breedTimer = 0;
  // Tapınak: rahiplerin tuttuğu dua yerleri (üst üste durmasınlar)
  readonly worshipSpots = new Set<number>();
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
    return this.type === BuildingType.Temple && this.done;
  }

  // Üretim binaları çalışan sayısına göre çevrelerindeki kaynakları işaretler
  // (çalışanı yoksa işaretlemez; her çalışan 2 işaretlik kapasite ekler)
  update(dt: number, world: World, workers: number): void {
    if (!this.done) return;
    if (this.type === BuildingType.Temple && this.worshipTimer > 0) {
      this.worshipTimer -= dt;
    }
    if (this.type === BuildingType.ToolWorkshop) {
      // sipariş yokken bina üzerinde uyarı çıksın
      this.outOfResources =
        this.orders <= 0 && this.spearOrders <= 0 && this.clothOrders <= 0;
      return;
    }
    if (this.type === BuildingType.Splitter) {
      // işlenecek odun yoksa uyar
      this.outOfResources = resourceStore.log < SPLIT_LOG_COST;
      return;
    }
    if (this.type !== BuildingType.Woodcutter && this.type !== BuildingType.Gatherer) return;
    this.scanTimer -= dt;
    if (this.scanTimer > 0) return;
    this.scanTimer = SCAN_INTERVAL;
    if (workers <= 0) return;
    const maxMarks = workers * 3;

    const cx = this.x + 1;
    const cy = this.y + 1;
    if (this.type === BuildingType.Woodcutter) {
      // Sadece budanmamış (hazır) ağaçları işaretle
      const t = world.findNearestTileOfType(Tile.Tree, cx, cy, AUTO_MARK_RADIUS, world.markedTrees);
      const markedNear = world.countMarkedNear(world.markedTrees, cx, cy, AUTO_MARK_RADIUS);
      const anyTree = world.countTilesNear([Tile.Tree, Tile.PrunedTree], cx, cy, AUTO_MARK_RADIUS) > 0;
      this.outOfResources = !t && markedNear === 0 && !anyTree;
      if (isFull("wood")) return;
      if (markedNear >= maxMarks) return;
      if (t) world.markTree(t.x, t.y);
    } else if (this.type === BuildingType.Gatherer) {
      const t = world.findNearestTileOfType(Tile.Bush, cx, cy, AUTO_MARK_RADIUS, world.markedBushes);
      const markedNear = world.countMarkedNear(world.markedBushes, cx, cy, AUTO_MARK_RADIUS);
      this.outOfResources =
        !t && markedNear === 0 && !world.findPlantSpot(cx, cy, AUTO_MARK_RADIUS, cx, cy);
      if (isFull("berry")) return;
      if (markedNear >= maxMarks) return;
      if (t) world.markFood(t.x, t.y);
    }
  }
}

// Yerleştirme kontrolü: ayak izinin tamamı boş ve yürünebilir zemin olmalı
export function canPlace(world: World, tx: number, ty: number, size: number): boolean {
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      if (!world.walkableAt(tx + dx, ty + dy)) return false;
      const t = world.get(tx + dx, ty + dy);
      if (
        t === Tile.Tree ||
        t === Tile.Bush ||
        t === Tile.Mushroom ||
        t === Tile.NutBush ||
        t === Tile.Sapling ||
        t === Tile.AppleTree ||
        t === Tile.OrangeTree ||
        t === Tile.TangerineTree
      ) {
        return false;
      }
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

export function isBuildingUnlocked(type: BuildingType): boolean {
  // Başlangıçta yalnız ev ve tapınak kurulabilir; diğer üretim binaları
  // ileride çağlara uygun araştırmalara bağlanacak
  if (type === BuildingType.House || type === BuildingType.Temple || type === BuildingType.Camp) return true;
  if (type === BuildingType.Depot) return hasTech("capital");
  if (type === BuildingType.Nursery) return hasTech("cognitive");
  if (type === BuildingType.Gatherer) return hasTech("gathering"); // toplayıcılık
  if (type === BuildingType.ToolWorkshop) return hasTech("toolworkshop");
  if (type === BuildingType.HunterLodge) return hasTech("kan");
  if (type === BuildingType.Splitter) return hasTech("toolworkshop"); // odun keşfi
  if (type === BuildingType.Barn) return hasTech("ciftlik");
  if (type === BuildingType.Road) return hasTech("hirs");
  // Meşale artık ayrı bina değil: Doğa ile binalara takılır
  return false;
}
