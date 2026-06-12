import { Camera } from "./engine/camera";
import { foodItemOf, Tile } from "./world/tiles";
import { Input } from "./engine/input";
import { Renderer, type Ghost } from "./render/renderer";
import {
  addMessage,
  buildingPanelHitTest,
  drawBuildingPanel,
  drawHud,
  drawPopulationPanel,
  drawProfile,
  isOverPopPanel,
  isOverToolbar,
  popButtonHitTest,
  popPanelHitTest,
  drawMarkFilters,
  MARK_FILTERS,
  markFilterHitTest,
  pauseButtonHitTest,
  peopleScrollBy,
  peoplePanelHitTest,
  peopleButtonHitTest,
  drawPeoplePanel,
  isOverPeoplePanel,
  type MarkFilter,
  profileHitTest,
  speedButtonHitTest,
  drawTechPanel,
  techButtonHitTest,
  techPanelHitTest,
  TOOLBAR_HEIGHT,
  TOOLBAR_TYPES,
  toolbarHitTest,
  updateMessages,
  drawTaskList,
  type TaskCounts,
  dragPanelBy,
  panelRectOf,
  type PanelId,
} from "./render/hud";
import { buyTech, grantTech, hasTech, TECHS, type TechId } from "./sim/tech";
import { Animal, ANIMAL_DEFS, BARN_HERD, WILD_POOL, type AnimalType } from "./sim/animals";
import {
  AXE_STONE_COST,
  AXE_WOOD_COST,
  CLOTH_LEATHER_COST,
  SPEAR_LOG_COST,
  SPEAR_STONE_COST,
  SPEAR_WOOD_COST,
  TORCH_ATTACH_COST,
  Building,
  BUILDING_DEFS,
  BuildingType,
  canPlace,
  HOUSE_CAPACITY,
  isHousing,
  placeBuilding,
  ROLE_NAMES,
  isBuildingUnlocked,
} from "./sim/buildings";
import { gameTime, season, totalDays, tuning, updateTime } from "./sim/time";
import { addFloater, burst } from "./render/effects";
import {
  addItem,
  foodTotal,
  isFull,
  ITEM_INFO,
  ITEM_TYPES,
  resources,
  type ItemType,
} from "./sim/resources";
import { screams, updateScreams, Villager } from "./sim/villager";
import { updateEffects } from "./render/effects";
import { TILE_SIZE } from "./world/tiles";
import { World } from "./world/world";

const MAP_W = 128;
const MAP_H = 128;
const VILLAGER_COUNT = 6;
const FIXED_DT = 1 / 60;
const DEPOT_CAP_BONUS = 80;

// İşaretli görev sayaçlarını hesapla
function getTaskCounts(): TaskCounts {
  let berry = 0, mushroom = 0;
  for (const i of world.markedBushes) {
    const tx = i % MAP_W;
    const ty = Math.floor(i / MAP_W);
    const item = foodItemOf(world.get(tx, ty));
    if (item === "berry") berry++;
    else if (item === "mushroom") mushroom++;
  }
  return {
    wood: world.markedTrees.size,
    berry,
    mushroom,
    stone: world.markedStones.size,
  };
}

const canvas = document.getElementById("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", resize);
resize();

// ?seed=123 ile sabit harita (test ve paylaşım için), yoksa rastgele
const seedParam = Number(new URLSearchParams(location.search).get("seed"));
const seed = Number.isFinite(seedParam) && seedParam > 0
  ? seedParam
  : Math.floor(Math.random() * 2 ** 31);
document.title = `Banisher — tohum ${seed}`;
const world = new World(MAP_W, MAP_H, seed);
const renderer = new Renderer(world);

const spawn = world.findSpawn();
const camera = new Camera(
  (spawn.x + 0.5) * TILE_SIZE,
  (spawn.y + 0.5) * TILE_SIZE,
  MAP_W * TILE_SIZE,
  MAP_H * TILE_SIZE
);
const input = new Input(canvas, camera);

const villagers: Villager[] = [];
const buildings: Building[] = [];
const animals: Animal[] = [];
// kesilen domuzların yerine yenisi gelir
const animalRespawns: { barn: Building; type: AnimalType; t: number }[] = [];
let selected: BuildingType | null = null;
let selectedVillager: Villager | null = null;
let selectedBuilding: Building | null = null;
let showPopulation = false;
let showPeople = false;
let showTech = false;
let markFilter: MarkFilter = "all";
// sol tuş sürükleme: alan seçimi veya mini harita gezdirme
let selecting:
  | { mode: "rect"; x0: number; y0: number; x1: number; y1: number }
  | { mode: "minimap" }
  | { mode: "panel"; id: PanelId; lx: number; ly: number }
  | null = null;
let paused = false;
let gameSpeed = 1;

// Tıklanan dünya noktasına en yakın köylüyü bul (vücut hizasında, ~9 piksel tolerans)
function villagerAt(wx: number, wy: number): Villager | null {
  let best: Villager | null = null;
  let bestDist = 9;
  for (const v of villagers) {
    // evinde uyuyan içeridedir: tıklama binaya gitsin
    if (v.state === "sleeping" && !v.groundSleep && v.home) continue;
    const d = Math.hypot(wx - v.x, wy - (v.y - 6));
    if (d < bestDist) {
      bestDist = d;
      best = v;
    }
  }
  return best;
}

// ---- İş bazlı görev yönetimi (Banished tarzı) ----

function workersOf(b: Building): number {
  let n = 0;
  for (const v of villagers) {
    if (v.assignment.kind === "building" && v.assignment.building === b) n++;
  }
  return n;
}

// Havuzdan (ortalık işçileri) en yakın yetişkini al ve göreve ata
function hire(target: Building | null, near?: { x: number; y: number }): boolean {
  if (target && workersOf(target) >= target.def.maxWorkers) return false;
  let best: Villager | null = null;
  let bestDist = Infinity;
  const px = near?.x ?? (target ? target.centerX : camera.x);
  const py = near?.y ?? (target ? target.centerY : camera.y);
  for (const v of villagers) {
    if (!v.canWork || v.caringBaby || v.assignment.kind !== "laborer") continue;
    const d = Math.hypot(v.x - px, v.y - py);
    if (d < bestDist) {
      bestDist = d;
      best = v;
    }
  }
  if (!best) {
    addMessage("Ortalık işçisi kalmadı!");
    return false;
  }
  best.assignment = target ? { kind: "building", building: target } : { kind: "builder" };
  return true;
}

// Görevden çıkar: ortalık işleri havuzuna döner
function fire(target: Building | null): void {
  for (const v of villagers) {
    const a = v.assignment;
    const match = target
      ? a.kind === "building" && a.building === target
      : a.kind === "builder";
    if (match) {
      v.assignment = { kind: "laborer" };
      return;
    }
  }
}

// Binayı yık: blokları aç, çalışanları/sakinleri serbest bırak, yarı iade
// Yabani hayvan: haritada rastgele çimenlik bir noktaya doğar
const WILD_CAP = 20;
function spawnWildAnimal(): boolean {
  for (let attempt = 0; attempt < 60; attempt++) {
    const x = 4 + Math.floor(Math.random() * (MAP_W - 8));
    const y = 4 + Math.floor(Math.random() * (MAP_H - 8));
    if (!world.walkableAt(x, y)) continue;
    const type = WILD_POOL[Math.floor(Math.random() * WILD_POOL.length)];
    // yırtıcılar yerleşimden uzakta türer (sürpriz katliam olmasın)
    if (ANIMAL_DEFS[type].predator) {
      const d = Math.max(Math.abs(x - campCenter.x), Math.abs(y - campCenter.y));
      if (d < 30) continue;
    }
    animals.push(new Animal(type, null, x, y));
    return true;
  }
  return false;
}

// Tıklanan noktadaki yabani hayvan (av işareti için)
function wildAnimalAt(wx: number, wy: number): Animal | null {
  let best: Animal | null = null;
  let bestDist = 8;
  for (const a of animals) {
    if (!a.wild || a.dead) continue;
    const d = Math.hypot(wx - a.x, wy - (a.y - 3));
    if (d < bestDist) {
      bestDist = d;
      best = a;
    }
  }
  return best;
}

// Çiftlik çevresindeki yürünebilir bloğa hayvan bırak
function spawnAnimal(barn: Building, type: AnimalType): void {
  for (let r = 1; r <= 4; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = b2t(barn.centerX) + dx;
        const y = b2t(barn.centerY) + dy;
        if (!world.walkableAt(x, y)) continue;
        animals.push(new Animal(type, barn, x, y));
        return;
      }
    }
  }
}
const b2t = (px: number) => Math.floor(px / TILE_SIZE);

function demolishBuilding(b: Building): void {
  if (b.type === BuildingType.Camp) return;
  b.removed = true;
  if (b.type === BuildingType.Depot && b.done) {
    resources.cap = Math.max(100, resources.cap - DEPOT_CAP_BONUS);
  }
  // çiftlik yıkılırsa hayvanları da gider
  for (let i = animals.length - 1; i >= 0; i--) {
    if (animals[i].barn === b) animals.splice(i, 1);
  }
  for (let dy = 0; dy < b.size; dy++) {
    for (let dx = 0; dx < b.size; dx++) {
      world.blocked.delete(world.index(b.x + dx, b.y + dy));
    }
  }
  for (const v of villagers) {
    if (v.assignment.kind === "building" && v.assignment.building === b) {
      v.assignment = { kind: "laborer" };
    }
    if (v.home === b) v.home = null;
  }
  const idx = buildings.indexOf(b);
  if (idx !== -1) buildings.splice(idx, 1);
  const refund = Math.floor(b.def.cost / 2);
  addItem("wood", refund);
  addMessage(`${b.def.name} yıkıldı (+${refund} odun iade)`);
  if (selectedBuilding === b) selectedBuilding = null;
}

// Tıklanan blok bir binanın ayak izindeyse o binayı döndür
function buildingAt(tx: number, ty: number): Building | null {
  for (const b of buildings) {
    if (tx >= b.x && tx < b.x + b.size && ty >= b.y && ty < b.y + b.size) {
      return b;
    }
  }
  return null;
}

// Bir nokta etrafındaki yürünebilir bloklara köylü yerleştir (başlangıç ve yeni evler)
function spawnVillagersAround(cx: number, cy: number, count: number): number {
  let placed = 0;
  for (let r = 0; r <= 10 && placed < count; r++) {
    for (let dy = -r; dy <= r && placed < count; dy++) {
      for (let dx = -r; dx <= r && placed < count; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (!world.walkableAt(x, y)) continue;
        const v = new Villager(x, y);
        if (hasTech("humanity")) v.changeMorale(10, "Tanrı inancı");
        villagers.push(v);
        placed++;
      }
    }
  }
  return placed;
}

// Başlangıç kampı: koloninin hazır kurulu teslimat noktası
let campCenter = spawn;
outer: for (let r = 0; r < 20; r++) {
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = spawn.x + dx;
      const y = spawn.y + dy;
      if (!canPlace(world, x, y, BUILDING_DEFS[BuildingType.Camp].size)) continue;
      const camp = new Building(BuildingType.Camp, x, y);
      camp.effectApplied = true; // hazır kurulu: tamamlanma mesajı çıkmasın
      placeBuilding(world, camp);
      buildings.push(camp);
      campCenter = { x: x + 1, y: y + 1 };
      break outer;
    }
  }
}

spawnVillagersAround(campCenter.x, campCenter.y, VILLAGER_COUNT);
camera.x = (campCenter.x + 0.5) * TILE_SIZE;
camera.y = (campCenter.y + 0.5) * TILE_SIZE;

// doğada başlangıç faunası
for (let i = 0; i < 14; i++) spawnWildAnimal();

// ---- Girdi ----

input.onClick = (wx, wy, sx, sy) => {
  // önce araç çubuğu
  if (isOverToolbar(sy, canvas.height)) {
    const hit = toolbarHitTest(sx, sy, canvas.width, canvas.height);
    if (hit !== null) {
      if (isBuildingUnlocked(hit)) {
        selected = selected === hit ? null : hit;
      } else {
        addMessage(`${BUILDING_DEFS[hit].name} için gerekli teknoloji araştırılmadı!`);
      }
    }
    return;
  }

  // mini harita: tıklanan noktaya kamerayı götür
  const mm = renderer.minimapHit(sx, sy);
  if (mm) {
    dangerFollow = null;
    dangerCooldown = 10;
    camera.x = mm.x;
    camera.y = mm.y;
    return;
  }

  // işaretleme filtresi çipleri
  const mf = markFilterHitTest(sx, sy);
  if (mf) {
    markFilter = mf;
    return;
  }

  // üst bardaki işler, insanlar ve teknoloji düğmeleri
  if (popButtonHitTest(sx, sy)) {
    showPopulation = !showPopulation;
    return;
  }
  if (peopleButtonHitTest(sx, sy)) {
    showPeople = !showPeople;
    return;
  }
  if (techButtonHitTest(sx, sy)) {
    showTech = !showTech;
    return;
  }
  if (pauseButtonHitTest(sx, sy)) {
    paused = !paused;
    return;
  }
  if (speedButtonHitTest(sx, sy)) {
    gameSpeed = gameSpeed === 1 ? 2 : gameSpeed === 2 ? 4 : gameSpeed === 4 ? 8 : gameSpeed === 8 ? 16 : 1;
    return;
  }

  // teknoloji paneli: yalnızca üzerine gelen tıklamaları yutar
  // (dışarı tıklamak paneli kapatmaz; birden fazla panel açık kalabilir)
  if (showTech) {
    const hit = techPanelHitTest(sx, sy);
    if (hit) {
      if (hit.kind === "close") showTech = false;
      else if (hit.kind === "buy") {
        if (!buyTech(hit.id)) {
          addMessage("Yetersiz bilgi!");
        } else if (hit.id === "humanity") {
          // Tanrı inancı: yaşayan herkese kalıcı +10 moral
          for (const v of villagers) v.changeMorale(10, "Tanrı inancı");
          addMessage("Tanrı inancı doğdu: herkese +10 moral!");
        }
      }
      return;
    }
  }

  // iş yönetim menüsü: yalnızca üzerine gelen tıklamaları yutar
  if (showPopulation) {
    const hit = popPanelHitTest(sx, sy, buildings);
    if (hit) {
      if (hit.kind === "close") showPopulation = false;
      else if (hit.kind === "hire") hire(hit.building);
      else if (hit.kind === "fire") fire(hit.building);
      return;
    }
  }

  // insanlar paneli
  if (showPeople) {
    const hit = peoplePanelHitTest(sx, sy, villagers);
    if (hit) {
      if (hit.kind === "close") {
        showPeople = false;
      } else if (hit.kind === "select") {
        // isme tıkla: köylünün profilini de aç ve kameraya al (menü açık kalır)
        const v = villagers[hit.index];
        selectedVillager = v;
        camera.x = v.x;
        camera.y = v.y;
      }
      return;
    }
  }

  // profil paneli açıkken üzerine gelen tıklamalar dünyaya geçmesin
  if (selectedVillager) {
    const hit = profileHitTest(sx, sy);
    if (hit) {
      if (hit.kind === "close") selectedVillager = null;
      else if (hit.kind === "calm") void startCalming(selectedVillager);
      return;
    }
  }

  // bina paneli açıkken
  if (selectedBuilding) {
    const hit = buildingPanelHitTest(sx, sy);
    if (hit) {
      if (hit === "close") selectedBuilding = null;
      else if (hit === "hire") hire(selectedBuilding);
      else if (hit === "fire") fire(selectedBuilding);
      else if (hit === "orderPlus") {
        // hammadde yeterliyse sipariş ver (alete bastığımızda hammadde varsa üretsin)
        const queuedWood = (selectedBuilding.orders + 1) * AXE_WOOD_COST;
        const queuedStone = (selectedBuilding.orders + 1) * AXE_STONE_COST;
        if (resources.wood >= queuedWood && resources.stone >= queuedStone) {
          selectedBuilding.orders++;
        } else {
          addMessage(`Yetersiz hammadde! (balta: ${AXE_WOOD_COST} dal + ${AXE_STONE_COST} taş)`);
        }
      } else if (hit === "orderMinus") {
        selectedBuilding.orders = Math.max(0, selectedBuilding.orders - 1);
      } else if (hit === "spearPlus") {
        const n = selectedBuilding.spearOrders + 1;
        if (
          resources.wood >= n * SPEAR_WOOD_COST &&
          resources.log >= n * SPEAR_LOG_COST &&
          resources.stone >= n * SPEAR_STONE_COST
        ) {
          selectedBuilding.spearOrders++;
        } else {
          addMessage(
            `Yetersiz hammadde! (mızrak: ${SPEAR_WOOD_COST} dal + ${SPEAR_LOG_COST} odun + ${SPEAR_STONE_COST} taş)`
          );
        }
      } else if (hit === "spearMinus") {
        selectedBuilding.spearOrders = Math.max(0, selectedBuilding.spearOrders - 1);
      } else if (hit === "clothPlus") {
        const ql = (selectedBuilding.clothOrders + 1) * CLOTH_LEATHER_COST;
        if (resources.leather >= ql) {
          selectedBuilding.clothOrders++;
        } else {
          addMessage(`Yetersiz deri! (giysi: ${CLOTH_LEATHER_COST} deri)`);
        }
      } else if (hit === "clothMinus") {
        selectedBuilding.clothOrders = Math.max(0, selectedBuilding.clothOrders - 1);
      } else if (hit === "torch") {
        if (resources.wood >= TORCH_ATTACH_COST) {
          resources.wood -= TORCH_ATTACH_COST;
          selectedBuilding.hasTorch = true;
          addMessage(`${selectedBuilding.def.name} binasına meşale takıldı`);
        } else {
          addMessage(`Yetersiz dal! (meşale: ${TORCH_ATTACH_COST} dal)`);
        }
      } else if (hit === "demolish") demolishBuilding(selectedBuilding);
      return;
    }
  }

  // bina yerleştirirken hayalet önizlemeyle aynı hizalama (harita kenarına sıkıştır)
  const selSize = selected !== null ? BUILDING_DEFS[selected].size : 1;
  const tx = selected !== null
    ? Math.min(Math.max(Math.floor(wx / TILE_SIZE), 0), MAP_W - selSize)
    : Math.floor(wx / TILE_SIZE);
  const ty = selected !== null
    ? Math.min(Math.max(Math.floor(wy / TILE_SIZE), 0), MAP_H - selSize)
    : Math.floor(wy / TILE_SIZE);

  if (selected !== null) {
    // bina yerleştirme
    const def = BUILDING_DEFS[selected];
    if (!canPlace(world, tx, ty, def.size)) {
      addMessage("Buraya inşa edilemez!");
      return;
    }
    if (def.needsWater && !world.hasAdjacentWater(tx, ty, def.size)) {
      addMessage(`${def.name} su kenarına kurulmalı!`);
      return;
    }
    if (resources.wood < def.cost) {
      addMessage(`Yetersiz odun! (${def.name}: ${def.cost} odun)`);
      return;
    }
    resources.wood -= def.cost;
    const b = new Building(selected, tx, ty);
    placeBuilding(world, b);
    buildings.push(b);
    addMessage(`${def.name} şantiyesi kuruldu`);
    // hiç inşaatçı yoksa havuzdan bir kişiyi otomatik ata
    const hasBuilder = villagers.some((v) => !v.baby && v.assignment.kind === "builder");
    if (!hasBuilder && hire(null, { x: b.centerX, y: b.centerY })) {
      addMessage("Bir ortalık işçisi inşaatçı oldu");
    }
  } else {
    // köylü > yabani hayvan (av) > bina > blok işaretleme önceliği
    const v = villagerAt(wx, wy);
    if (v) {
      selectedVillager = v;
      return;
    }
    const wa = wildAnimalAt(wx, wy);
    if (wa) {
      wa.hunted = !wa.hunted;
      if (!wa.hunted) wa.claimed = false;
      return;
    }
    const b = buildingAt(tx, ty);
    if (b) {
      selectedBuilding = b;
      return;
    }
    // iptal modunda tek tıklama yalnızca işaret kaldırır
    if (markFilter === "cancel") {
      world.unmark(tx, ty);
      return;
    }
    const t = world.get(tx, ty);
    if (t === Tile.Mushroom && !hasTech("mushroomology")) {
      addMessage("Mantar toplamak için Mantaroloji araştırılmalı!");
      return;
    }
    if (t === Tile.Stone && !hasTech("humanity")) {
      addMessage("Taş kazmak için önce Beşer araştırılmalı!");
      return;
    }
    if (t === Tile.Pebbles && !hasTech("hardobjects")) {
      addMessage("Çakıl toplamak için önce Sert Cisimler araştırılmalı!");
      return;
    }
    world.toggleMark(tx, ty);
  }
};

// Açık olan en üstteki şeyi kapat; her çağrıda yalnızca bir tane
function closeTopmost(): boolean {
  if (selected !== null) { selected = null; return true; }
  if (showTech) { showTech = false; return true; }
  if (showPeople) { showPeople = false; return true; }
  if (showPopulation) { showPopulation = false; return true; }
  if (selectedVillager) { selectedVillager = null; return true; }
  if (selectedBuilding) { selectedBuilding = null; return true; }
  return false;
}

input.onCancel = () => {
  closeTopmost();
};

// Sol tuş sürükleme: mini haritada kamera gezdirme, dünyada alan seçimi
input.onLeftDragStart = (wx, wy, sx, sy) => {
  if (renderer.minimapHit(sx, sy)) {
    selecting = { mode: "minimap" };
    return;
  }
  if (isOverToolbar(sy, canvas.height)) return;
  // panel üzerinden sürükleme: paneli taşı (üstteki panel önceliklidir)
  const inRect = (r: { x: number; y: number; w: number; h: number }) =>
    sx >= r.x && sx <= r.x + r.w && sy >= r.y && sy <= r.y + r.h;
  const panelOrder: [boolean, PanelId][] = [
    [showTech, "tech"],
    [showPeople, "people"],
    [showPopulation, "pop"],
    [!!selectedVillager, "profile"],
    [!!selectedBuilding, "building"],
  ];
  for (const [open, id] of panelOrder) {
    if (open && inRect(panelRectOf(id))) {
      selecting = { mode: "panel", id, lx: sx, ly: sy };
      return;
    }
  }
  if (selected !== null) return;
  selecting = { mode: "rect", x0: wx, y0: wy, x1: wx, y1: wy };
};

input.onLeftDragMove = (wx, wy, sx, sy) => {
  if (!selecting) return;
  if (selecting.mode === "minimap") {
    const mm = renderer.minimapHit(sx, sy);
    if (mm) {
      camera.x = mm.x;
      camera.y = mm.y;
    }
    return;
  }
  if (selecting.mode === "panel") {
    dragPanelBy(selecting.id, sx - selecting.lx, sy - selecting.ly, canvas.width, canvas.height);
    selecting.lx = sx;
    selecting.ly = sy;
    return;
  }
  selecting.x1 = wx;
  selecting.y1 = wy;
};

input.onLeftDragEnd = () => {
  if (selecting?.mode === "rect") {
    if (markFilter === "cancel") {
      const n = cancelSelection(selecting);
      if (n > 0) addMessage(`${n} iş iptal edildi`);
    } else {
      const n = markSelection(selecting);
      if (n > 0) {
        const label = MARK_FILTERS.find((f) => f.id === markFilter)?.label ?? "";
        addMessage(`${n} blok işaretlendi (${label})`);
      }
    }
  }
  selecting = null;
};

// Seçim karesindeki tüm iş işaretlerini (ve av işaretlerini) kaldır
function cancelSelection(sel: { x0: number; y0: number; x1: number; y1: number }): number {
  const tx0 = Math.max(0, Math.floor(Math.min(sel.x0, sel.x1) / TILE_SIZE));
  const ty0 = Math.max(0, Math.floor(Math.min(sel.y0, sel.y1) / TILE_SIZE));
  const tx1 = Math.min(MAP_W - 1, Math.floor(Math.max(sel.x0, sel.x1) / TILE_SIZE));
  const ty1 = Math.min(MAP_H - 1, Math.floor(Math.max(sel.y0, sel.y1) / TILE_SIZE));
  let n = 0;
  for (let y = ty0; y <= ty1; y++) {
    for (let x = tx0; x <= tx1; x++) {
      if (world.unmark(x, y)) n++;
    }
  }
  const wx0 = Math.min(sel.x0, sel.x1), wx1 = Math.max(sel.x0, sel.x1);
  const wy0 = Math.min(sel.y0, sel.y1), wy1 = Math.max(sel.y0, sel.y1);
  for (const a of animals) {
    if (a.wild && a.hunted && a.x >= wx0 && a.x <= wx1 && a.y >= wy0 && a.y <= wy1) {
      a.hunted = false;
      a.claimed = false;
      n++;
    }
  }
  return n;
}

// Seçim karesindeki blokları say (canlı gösterge için)
function countSelection(sel: { x0: number; y0: number; x1: number; y1: number }) {
  const tx0 = Math.max(0, Math.floor(Math.min(sel.x0, sel.x1) / TILE_SIZE));
  const ty0 = Math.max(0, Math.floor(Math.min(sel.y0, sel.y1) / TILE_SIZE));
  const tx1 = Math.min(MAP_W - 1, Math.floor(Math.max(sel.x0, sel.x1) / TILE_SIZE));
  const ty1 = Math.min(MAP_H - 1, Math.floor(Math.max(sel.y0, sel.y1) / TILE_SIZE));
  let trees = 0, food = 0, stone = 0, marked = 0;
  for (let y = ty0; y <= ty1; y++) {
    for (let x = tx0; x <= tx1; x++) {
      const t = world.get(x, y);
      if (t === Tile.Tree) trees++;
      else if (foodItemOf(t)) food++;
      else if (t === Tile.Stone || t === Tile.Pebbles) stone++;
      const i = world.index(x, y);
      if (world.markedTrees.has(i) || world.markedBushes.has(i) || world.markedStones.has(i)) {
        marked++;
      }
    }
  }
  return { trees, food, stone, marked };
}

// Seçimi filtreye göre işaretle; işaretlenen blok sayısını döndürür
function markSelection(sel: { x0: number; y0: number; x1: number; y1: number }): number {
  const tx0 = Math.max(0, Math.floor(Math.min(sel.x0, sel.x1) / TILE_SIZE));
  const ty0 = Math.max(0, Math.floor(Math.min(sel.y0, sel.y1) / TILE_SIZE));
  const tx1 = Math.min(MAP_W - 1, Math.floor(Math.max(sel.x0, sel.x1) / TILE_SIZE));
  const ty1 = Math.min(MAP_H - 1, Math.floor(Math.max(sel.y0, sel.y1) / TILE_SIZE));
  let n = 0;
  for (let y = ty0; y <= ty1; y++) {
    for (let x = tx0; x <= tx1; x++) {
      const t = world.get(x, y);
      if ((markFilter === "all" || markFilter === "wood") && t === Tile.Tree) {
        if (!world.markedTrees.has(world.index(x, y))) n++;
        world.markTree(x, y);
      } else if ((markFilter === "all" || markFilter === "food") && foodItemOf(t)) {
        if (t === Tile.Mushroom && !hasTech("mushroomology")) continue;
        if (!world.markedBushes.has(world.index(x, y))) n++;
        world.markFood(x, y);
      } else if (
        (markFilter === "all" || markFilter === "stone") &&
        (t === Tile.Stone || t === Tile.Pebbles)
      ) {
        if (t === Tile.Stone && !hasTech("humanity")) continue;
        if (t === Tile.Pebbles && !hasTech("hardobjects")) continue;
        if (!world.markedStones.has(world.index(x, y))) n++;
        world.markStone(x, y);
      }
    }
  }
  return n;
}

// Nüfus menüsü açıkken üzerindeyken tekerlek menüyü kaydırır
input.wheelInterceptor = (sx, sy, deltaY) => {
  if (showPeople && isOverPeoplePanel(sx, sy)) {
    peopleScrollBy(deltaY > 0 ? 1 : -1, villagers.length);
    return true;
  }
  if (showPopulation && isOverPopPanel(sx, sy)) {
    return true; // iş paneli kaydırılmaz ama tekerlek zoom'a düşmesin
  }
  return false;
};

window.addEventListener("keydown", (e) => {
  if (e.code === "Escape") {
    closeTopmost(); // her basışta üstteki bir panel kapanır
  } else if (e.code === "Space") {
    e.preventDefault();
    paused = !paused;
  } else if (e.code === "KeyX") {
    gameSpeed = gameSpeed === 1 ? 2 : gameSpeed === 2 ? 4 : gameSpeed === 4 ? 8 : gameSpeed === 8 ? 16 : 1;
  } else if (e.code === "KeyN") {
    showPopulation = !showPopulation;
  } else if (e.code === "KeyM") {
    showPeople = !showPeople;
  } else if (e.code === "KeyT") {
    showTech = !showTech;
  } else if (e.code === "KeyF") {
    const visibleFilters = MARK_FILTERS.filter(
      (f) => f.id !== "stone" || hasTech("humanity") || hasTech("hardobjects")
    );
    const i = visibleFilters.findIndex((f) => f.id === markFilter);
    markFilter = visibleFilters[(i + 1) % visibleFilters.length].id;
  } else if (
    e.code === "KeyG" || e.code === "KeyH" || e.code === "KeyJ" ||
    e.code === "KeyK" || e.code === "KeyL"
  ) {
    // işaret filtreleri: yan yana tuşlar (G H J K L)
    const f = MARK_FILTERS.find((f) => f.key === e.code.slice(3));
    if (f && (f.id !== "stone" || hasTech("humanity") || hasTech("hardobjects"))) {
      markFilter = f.id;
    }
  }
  else if (e.code.startsWith("Digit")) {
    const n = Number(e.code.slice(5));
    const idx = n === 0 ? 9 : n - 1; // 0 tuşu = 10. bina
    const unlockedTypes = TOOLBAR_TYPES.filter(isBuildingUnlocked);
    if (idx >= 0 && idx < unlockedTypes.length) {
      const type = unlockedTypes[idx];
      selected = selected === type ? null : type;
    }
  }
});

// ---- Simülasyon adımı ----

// ---- Konutlar ve doğumlar ----

const BIRTH_CHANCE = 0.35; // her gün dönümünde, boş yeri olan ev başına
let lastDayCount = 0;
let homeTimer = 0;

function occupants(b: Building): number {
  let n = 0;
  for (const v of villagers) if (v.home === b) n++;
  return n;
}

// Evsiz köylüleri boş konutlara yerleştir
function assignHomes(): void {
  for (const v of villagers) {
    if (v.home && (!buildings.includes(v.home) || !isHousing(v.home))) v.home = null;
    if (v.home) continue;
    for (const b of buildings) {
      if (!isHousing(b) || occupants(b) >= HOUSE_CAPACITY) continue;
      v.home = b;
      break;
    }
  }
}

// Gün dönümü: boş yeri olan her konutta orada yaşayan bir kadının hamile
// kalma şansı; bebek 4 günlük hamileliğin ardından 4. günün sabahı doğar
function nightlyConceptions(): void {
  const adults = villagers.filter((v) => v.canWork).length;
  if (adults < 2) return; // çoğalmak için en az 2 yetişkin
  for (const b of buildings) {
    if (!isHousing(b) || occupants(b) >= HOUSE_CAPACITY) continue;
    if (Math.random() > BIRTH_CHANCE) continue;
    const candidate = villagers.find(
      (v) => v.home === b && v.canWork && v.identity.female && !v.pregnant
    );
    if (!candidate) continue;
    candidate.pregnantSince = totalDays();
    addMessage(`🤰 ${candidate.fullName} hamile kaldı`);
  }
}

// Hamileliği dolan kadınlar sabah doğurur; bebek annenin yanına doğar
function checkBirths(): void {
  for (const mom of villagers) {
    if (!mom.readyToGiveBirth) continue;
    let placed = false;
    for (let r = 1; r <= 3 && !placed; r++) {
      for (let dy = -r; dy <= r && !placed; dy++) {
        for (let dx = -r; dx <= r && !placed; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = mom.tileX + dx;
          const y = mom.tileY + dy;
          if (!world.walkableAt(x, y)) continue;
          const baby = new Villager(x, y, true);
          baby.home = mom.home;
          baby.mother = mom;
          if (hasTech("humanity")) baby.changeMorale(10, "Tanrı inancı");
          villagers.push(baby);
          mom.giveBirth();
          addMessage(`👶 ${baby.fullName} doğdu! (annesi ${mom.fullName})`);
          addFloater(mom.x, mom.y - 18, "+1 bebek", "#ffb0d0");
          placed = true;
        }
      }
    }
    if (!placed) mom.giveBirth(); // sıkışık durumda bebek annenin olduğu yerde sayılır
  }
}

// Bakımevi kapasitesi (bakıcı başına 4 bebek) bebeklere dağıtılır;
// kapasite dışında kalan bebeğin annesi bakıma ayrılır (çalışamaz)
function assignChildcare(): void {
  let capacity = 0;
  for (const b of buildings) {
    if (b.type === BuildingType.Nursery && b.done) {
      capacity += workersOf(b) * 4;
    }
  }
  const babies = villagers
    .filter((v) => v.baby)
    .sort((a, b) => a.birthDay - b.birthDay);
  for (const v of villagers) v.caringBaby = null;
  for (const baby of babies) {
    if (capacity > 0) {
      capacity--;
      baby.nurseryCovered = true;
    } else {
      baby.nurseryCovered = false;
      const mom = baby.mother;
      if (mom && !mom.dead && !mom.caringBaby) {
        mom.caringBaby = baby;
      }
    }
  }
}

// Depo dolduğunda bir kez bildirim göster (boşalınca sıfırlanır)
const wasFull: Record<ItemType, boolean> = Object.fromEntries(
  ITEM_TYPES.map((t) => [t, false])
) as Record<ItemType, boolean>;

let wasFamine = false;

// Kilometre taşları: bir kez kutlanır
const milestones = {
  pop10: false, pop20: false, year1: false, firstWinter: false, knowledge50: false,
};
let prevSeason = 0;

function checkMilestones() {
  if (!milestones.pop10 && villagers.length >= 10) {
    milestones.pop10 = true;
    addMessage("🎉 Nüfus 10'a ulaştı!");
  }
  if (!milestones.pop20 && villagers.length >= 20) {
    milestones.pop20 = true;
    addMessage("🎉 Nüfus 20'ye ulaştı — gerçek bir köy!");
  }
  if (!milestones.year1 && gameTime.year >= 1) {
    milestones.year1 = true;
    addMessage("🎉 Koloni 1 yaşında!");
  }
  if (!milestones.knowledge50 && resources.knowledge >= 50) {
    milestones.knowledge50 = true;
    addMessage("🎉 50 bilgi birikti — bilgelik çağı!");
  }
  const s = season();
  if (!milestones.firstWinter && prevSeason === 3 && s === 0 && villagers.length > 0) {
    milestones.firstWinter = true;
    addMessage("❄ İlk kışı atlattınız!");
  }
  prevSeason = s;
}

function checkStorageFull() {
  for (const item of ITEM_TYPES) {
    const full = isFull(item);
    if (full && !wasFull[item]) {
      const name = ITEM_INFO[item].name;
      addMessage(`${name[0].toUpperCase()}${name.slice(1)} deposu doldu! İşçiler başka işlere yöneliyor.`);
    }
    wasFull[item] = full;
  }
  // kıtlık uyarısı: yemek tamamen bitti
  const famine = foodTotal() <= 0;
  if (famine && !wasFamine) {
    addMessage("⚠ Yemek stoğu tükendi! Köylüler açlıktan ölebilir.");
  }
  wasFamine = famine;
}

// ---- Tehlike kamerası: yırtıcıyla karşılaşan köylü takip edilir ----

let dangerFollow: Villager | null = null;
let dangerCooldown = 0; // takip bittikten/iptalden sonra yeniden kilitlenme bekleme süresi

function villagerInDanger(v: Villager): boolean {
  for (const a of animals) {
    if (!a.def.predator || a.dead) continue;
    if (Math.hypot(a.x - v.x, a.y - v.y) < 8 * TILE_SIZE) return true;
  }
  return false;
}

function updateDangerCamera(dt: number): void {
  dangerCooldown -= dt;
  if (dangerFollow) {
    if (dangerFollow.dead || !villagerInDanger(dangerFollow)) {
      // tehlike geçti: takibi bırak, hemen yeni kilitlenme olmasın
      dangerFollow = null;
      dangerCooldown = 6;
      return;
    }
    // kamerayı yumuşakça tehlikedekine çek
    const k = Math.min(1, dt * 4);
    camera.x += (dangerFollow.x - camera.x) * k;
    camera.y += (dangerFollow.y - camera.y) * k;
    return;
  }
  if (dangerCooldown > 0) return;
  for (const v of villagers) {
    if (v.dead || v.state === "sleeping") continue;
    if (villagerInDanger(v)) {
      dangerFollow = v;
      addMessage(`⚠ ${v.fullName} tehlikede — kamera takipte!`);
      break;
    }
  }
}

// ---- Merak: yakarma ve mikrofonla teskin ----

let pleadTimer = 50;
let calmingActive = false;

function schedulePleading(dt: number): void {
  if (!hasTech("merak")) return;
  pleadTimer -= dt;
  if (pleadTimer > 0) return;
  pleadTimer = 40 + Math.random() * 50;
  const candidates = villagers.filter(
    (v) => v.canWork && v.pleadingTtl <= 0 && v.shockTtl <= 0 && v.state !== "sleeping"
  );
  if (candidates.length === 0) return;
  const v = candidates[Math.floor(Math.random() * candidates.length)];
  v.pleadingTtl = 25;
  addMessage(`✋ ${v.fullName} sana yakarıyor — üzerine tıklayıp konuş!`);
}

// Mikrofonu aç, ses etkinliği yeterliyse köylüyü teskin et.
// Dili anlaması gerekmez: yalnızca SESİN varlığı (hacim ve süre) sayılır.
async function startCalming(v: Villager): Promise<void> {
  if (calmingActive || v.pleadingTtl <= 0) return;
  calmingActive = true;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    addMessage("🎤 Mikrofon açık — ona seslen...");
    const actx = new AudioContext();
    const src = actx.createMediaStreamSource(stream);
    const an = actx.createAnalyser();
    an.fftSize = 512;
    src.connect(an);
    const data = new Uint8Array(an.fftSize);
    let voiced = 0;
    let elapsed = 0;
    await new Promise<void>((resolve) => {
      const iv = window.setInterval(() => {
        an.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const d = (data[i] - 128) / 128;
          sum += d * d;
        }
        const rms = Math.sqrt(sum / data.length);
        if (rms > 0.035) voiced += 0.1;
        elapsed += 0.1;
        const done = voiced >= 1.2;
        const giveUp = elapsed >= 7 || v.pleadingTtl <= 0;
        if (done || giveUp) {
          window.clearInterval(iv);
          stream.getTracks().forEach((t) => t.stop());
          void actx.close();
          if (done) v.calm();
          else addMessage("Sesini duyamadı...");
          resolve();
        }
      }, 100);
    });
  } catch {
    // mikrofon yok/izin verilmedi: tanrının sessiz dokunuşu yine de işler
    addMessage("(Mikrofon yok — sessiz bir dokunuş da yetti)");
    v.calm();
  }
  calmingActive = false;
}

// Mantarlar yalnızca binalardan uzak, el değmemiş yerlerde kendiliğinden biter
const MUSHROOM_MIN_BUILDING_DIST = 12; // blok
const MUSHROOM_WILD_CAP = 60;
let mushroomTimer = 20;

function trySpawnWildMushroom(): void {
  // üst sınır: harita mantar kaplamasın
  let count = 0;
  for (let i = 0; i < world.tiles.length; i++) {
    if (world.tiles[i] === Tile.Mushroom) count++;
  }
  if (count >= MUSHROOM_WILD_CAP) return;
  // 1) budanmış ağaçların dibi: çürüyen dallar mantar bitirir ("pıt")
  for (let attempt = 0; attempt < 6; attempt++) {
    const pt = world.randomPrunedTree();
    if (!pt) break;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
    const [dx, dy] = dirs[Math.floor(Math.random() * 4)];
    const x = pt.x + dx;
    const y = pt.y + dy;
    if (!world.inBounds(x, y) || world.get(x, y) !== Tile.Grass || !world.walkableAt(x, y)) continue;
    world.set(x, y, Tile.Mushroom);
    burst((x + 0.5) * TILE_SIZE, (y + 0.5) * TILE_SIZE, "#c43030", 7);
    return;
  }
  // 2) binalardan uzak yabani türeme
  for (let attempt = 0; attempt < 12; attempt++) {
    const x = 1 + Math.floor(Math.random() * (MAP_W - 2));
    const y = 1 + Math.floor(Math.random() * (MAP_H - 2));
    if (world.get(x, y) !== Tile.Grass || !world.walkableAt(x, y)) continue;
    let nearBuilding = false;
    for (const b of buildings) {
      const d = Math.max(Math.abs(x - (b.x + 1)), Math.abs(y - (b.y + 1)));
      if (d < MUSHROOM_MIN_BUILDING_DIST) {
        nearBuilding = true;
        break;
      }
    }
    if (nearBuilding) continue;
    world.set(x, y, Tile.Mushroom);
    return;
  }
}

function step(dt: number) {
  updateTime(dt);
  world.update(dt);
  updateEffects(dt);
  checkStorageFull();
  checkMilestones();

  schedulePleading(dt);
  updateScreams(dt);

  // yabani mantar türemesi
  mushroomTimer -= dt;
  if (mushroomTimer <= 0) {
    mushroomTimer = 18 + Math.random() * 12;
    trySpawnWildMushroom();
  }

  // gün dönümü: hamile kalma şansı
  const days = totalDays();
  if (days !== lastDayCount) {
    lastDayCount = days;
    nightlyConceptions();
    // doğa kendini yeniler: yabani nüfus azaldıysa yenileri türer
    const wildCount = animals.filter((a) => a.wild).length;
    if (wildCount < WILD_CAP) {
      spawnWildAnimal();
      if (wildCount < WILD_CAP / 2) spawnWildAnimal();
    }
  }

  // hamileliği dolanlar sabah doğurur
  checkBirths();

  // konut atamalarını ve bebek bakımını periyodik tazele
  homeTimer -= dt;
  if (homeTimer <= 0) {
    homeTimer = 1;
    assignHomes();
    assignChildcare();
  }

  for (const v of villagers) v.update(dt, world, buildings, animals);
  updateDangerCamera(dt);

  // hayvanlar: dolanma, otlama, açlık; yırtıcılar insan kovalar
  for (const a of animals) a.update(dt, world, villagers);
  for (let i = animals.length - 1; i >= 0; i--) {
    const a = animals[i];
    if (!a.dead) continue;
    if (a.slaughtered) {
      // kesilen çiftlik hayvanının yerine zamanla yenisi gelir (av hariç)
      if (a.barn) animalRespawns.push({ barn: a.barn, type: a.type, t: 90 });
    } else {
      addMessage(`🐄 Bir ${ANIMAL_DEFS[a.type].name.toLowerCase()} açlıktan telef oldu!`);
    }
    animals.splice(i, 1);
  }
  for (let i = animalRespawns.length - 1; i >= 0; i--) {
    const r = animalRespawns[i];
    r.t -= dt;
    if (r.t <= 0) {
      animalRespawns.splice(i, 1);
      if (buildings.includes(r.barn)) {
        spawnAnimal(r.barn, r.type);
        addMessage(`Çiftliğe yeni bir ${ANIMAL_DEFS[r.type].name.toLowerCase()} geldi`);
      }
    }
  }

  // büyüyen bebekler işçi olur
  for (const v of villagers) {
    if (v.grewUp) {
      v.grewUp = false;
      addMessage(`${v.fullName} büyüdü, artık çalışabilir!`);
    }
  }

  // ölenleri çıkar (açlık veya yırtıcı saldırısı)
  for (let i = villagers.length - 1; i >= 0; i--) {
    if (villagers[i].dead) {
      const v = villagers[i];
      addMessage(
        v.deathCause === "predator"
          ? `🐺 ${v.fullName} yırtıcı saldırısında can verdi!`
          : `${v.fullName} açlıktan öldü!`
      );
      if (selectedVillager === v) selectedVillager = null;
      villagers.splice(i, 1);
    }
  }

  for (const b of buildings) {
    b.update(dt, world, workersOf(b));
    // kaynak bitti uyarısı (bir kez; kaynak dönerse sıfırlanır)
    if (b.outOfResources && !b.warnedOut && workersOf(b) > 0) {
      b.warnedOut = true;
      if (b.type === BuildingType.ToolWorkshop) {
        addMessage(`⚠ ${b.def.name} sipariş bekliyor! (binaya tıklayıp sipariş ver)`);
      } else {
        addMessage(`⚠ ${b.def.name} kulübesinin menzilinde kaynak kalmadı!`);
      }
    } else if (!b.outOfResources) {
      b.warnedOut = false;
    }
    // tamamlanma etkileri bir kez uygulanır
    if (b.done && !b.effectApplied) {
      b.effectApplied = true;
      const def = BUILDING_DEFS[b.type];
      if (b.type === BuildingType.House) {
        addMessage(`Ev tamamlandı: ${HOUSE_CAPACITY} kişilik konut`);
      } else if (b.type === BuildingType.Depot) {
        resources.cap += DEPOT_CAP_BONUS;
        addMessage(`Depo tamamlandı: kapasite +${DEPOT_CAP_BONUS}`);
      } else {
        addMessage(`${def.name} tamamlandı`);
      }
      // çiftlik tamamlanınca sürü gelir
      if (b.type === BuildingType.Barn) {
        for (const type of BARN_HERD) spawnAnimal(b, type);
        addMessage("Çiftlik hayvanları geldi: tavuk, inek, domuz, koyun, keçi!");
      }
      // üretim binası tamamlanınca havuzdan 1 işçi otomatik istihdam edilir
      if (b.def.maxWorkers > 0 && hire(b)) {
        addMessage(`${b.def.name} 1 ${(ROLE_NAMES[b.type] ?? "çalışan").toLowerCase()} istihdam etti`);
      }
    }
  }
}

// ---- Oyun döngüsü ----

// Konsoldan/testlerden oyun durumuna erişim
declare global {
  interface Window {
    __game: unknown;
  }
}
// ---- Konsol hileleri (debug): F12 konsolunda hile.yardim() yaz ----

const hile = {
  yardim(): void {
    console.log(
      `Banisher hileleri:
  hile.bilgi(50)          bilgi ekle
  hile.ver("wood", 50)    kaynak ekle: wood log stone berry mushroom fish meat leather wool
  hile.doldur()           temel kaynaklardan bolca ver
  hile.arastir("kan")     tek araştırmayı bedava aç (id listesi: hile.arastirmalar())
  hile.hepsiniArastir()   tüm araştırmaları aç
  hile.moral(80)          herkesin moralini ayarla (0-100)
  hile.doyur()            herkesi doyur
  hile.balta()            herkese balta
  hile.mizrak(5)          yetişkinlere mızrak
  hile.giysi()            herkese deri giysi
  hile.insa()             tüm şantiyeleri anında bitir
  hile.koylu(3)           kampa N yetişkin köylü ekle
  hile.bebek()            bir bebek doğur
  hile.kurt() / hile.ayi()  kamp yakınına yırtıcı sal
  hile.gun(2)             takvimi N gün ileri sar
  hile.hiz(8)             oyun hızı (1/2/4/8/16)
  __game.tuning           dayLength / timeScale / moveSpeed canlı ayar
Not: hile.ver() depo kapasitesini aşabilir; doluluk işçileri durdurur.`
    );
  },
  arastirmalar(): string[] {
    return TECHS.map((t) => `${t.id} (${t.name})`);
  },
  bilgi(n = 50): void {
    resources.knowledge += n;
  },
  ver(item: ItemType, n = 50): void {
    resources[item] += n;
  },
  doldur(): void {
    for (const it of ["wood", "log", "stone", "berry", "meat", "leather"] as ItemType[]) {
      resources[it] += 30;
    }
  },
  arastir(id: TechId): void {
    const had = hasTech("humanity");
    grantTech(id);
    if (id === "humanity" && !had) {
      for (const v of villagers) v.changeMorale(10, "Tanrı inancı");
    }
  },
  hepsiniArastir(): void {
    for (const t of TECHS) this.arastir(t.id);
  },
  moral(n = 80): void {
    for (const v of villagers) v.changeMorale(n - v.morale, "Hile");
  },
  doyur(): void {
    for (const v of villagers) v.hunger = 0;
  },
  balta(): void {
    for (const v of villagers) if (v.canWork) v.hasAxe = true;
  },
  mizrak(n = 5): void {
    for (const v of villagers) if (v.canWork) v.spears = Math.min(5, n);
  },
  giysi(): void {
    for (const v of villagers) v.hasClothes = true;
  },
  insa(): void {
    for (const b of buildings) if (!b.done) b.progress = b.def.buildTime;
  },
  koylu(n = 1): void {
    const placed = spawnVillagersAround(campCenter.x, campCenter.y, n);
    addMessage(`Hile: ${placed} köylü geldi`);
  },
  bebek(): void {
    const mom = villagers.find((v) => v.identity.female && v.canWork);
    const baby = new Villager(campCenter.x, campCenter.y + 1, true);
    if (mom) baby.mother = mom;
    villagers.push(baby);
    addMessage(`Hile: 👶 ${baby.fullName} doğdu`);
  },
  kurt(): void {
    animals.push(new Animal("wolf", null, campCenter.x + 5, campCenter.y + 5));
  },
  ayi(): void {
    animals.push(new Animal("bear", null, campCenter.x - 5, campCenter.y - 5));
  },
  gun(n = 1): void {
    gameTime.total += n * tuning.dayLength;
  },
  hiz(n = 1): void {
    if ([1, 2, 4, 8, 16].includes(n)) gameSpeed = n;
  },
};

// tuning: konsoldan canlı ayar (__game.tuning.dayLength / timeScale / moveSpeed)
window.__game = { world, villagers, buildings, animals, camera, resources, gameTime, tuning, screams, hile };
(window as unknown as { hile: typeof hile }).hile = hile;
console.info(
  "%cBanisher debug: konsola hile.yardim() yaz",
  "color:#8fd05e;font-weight:bold"
);

let last = performance.now();
let accumulator = 0;

function frame(now: number) {
  const elapsed = Math.min((now - last) / 1000, 0.25);
  last = now;

  // kamera ve mesaj zamanlayıcıları duraklatmadan etkilenmez
  const camX0 = camera.x;
  const camY0 = camera.y;
  input.update(elapsed);
  if (dangerFollow && (camera.x !== camX0 || camera.y !== camY0)) {
    // oyuncu kamerayı eline aldı: takibi bırak
    dangerFollow = null;
    dangerCooldown = 10;
  }
  updateMessages(elapsed);

  // koloni yok olduysa simülasyon durur (oyun sonu perdesi gösterilir)
  accumulator += elapsed * (paused || villagers.length === 0 ? 0 : gameSpeed);
  // yüksek hızda kare başına daha fazla adım gerekir
  let steps = 0;
  while (accumulator >= FIXED_DT && steps < 16) {
    step(FIXED_DT);
    accumulator -= FIXED_DT;
    steps++;
  }

  const hover = camera.screenToWorld(input.mouseX, input.mouseY, canvas.width, canvas.height);
  const hoverTile = { x: Math.floor(hover.x / TILE_SIZE), y: Math.floor(hover.y / TILE_SIZE) };
  const hoverValid = world.inBounds(hoverTile.x, hoverTile.y);
  const overToolbar = isOverToolbar(input.mouseY, canvas.height);

  let ghost: Ghost | null = null;
  if (selected !== null && hoverValid && !overToolbar) {
    const def = BUILDING_DEFS[selected];
    const size = def.size;
    const gx = Math.min(Math.max(hoverTile.x, 0), MAP_W - size);
    const gy = Math.min(Math.max(hoverTile.y, 0), MAP_H - size);
    const valid =
      canPlace(world, gx, gy, size) &&
      (!def.needsWater || world.hasAdjacentWater(gx, gy, size));
    ghost = { type: selected, tileX: gx, tileY: gy, size, valid };
  }

  renderer.render(
    ctx,
    camera,
    villagers,
    buildings,
    animals,
    hoverValid ? hoverTile : null,
    ghost,
    selectedVillager,
    selectedBuilding,
    selecting?.mode === "rect" ? selecting : null,
    now / 1000
  );
  // tehlikedeki köylünün üstünde kırmızı ikaz halkası
  if (dangerFollow && !dangerFollow.dead) {
    const sx = (dangerFollow.x - camera.x) * camera.zoom + canvas.width / 2;
    const sy = (dangerFollow.y - camera.y) * camera.zoom + canvas.height / 2;
    const pulse = 1 + Math.sin(now / 120) * 0.25;
    ctx.strokeStyle = "rgba(230, 60, 60, 0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(sx, sy + 1 * camera.zoom, 7 * camera.zoom * pulse, 3.2 * camera.zoom * pulse, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "rgba(230, 60, 60, 0.95)";
    ctx.font = `bold ${Math.max(12, 5 * camera.zoom)}px monospace`;
    ctx.textAlign = "center";
    ctx.fillText("⚠", sx, sy - 17 * camera.zoom);
    ctx.textAlign = "left";
  }

  renderer.drawMinimap(ctx, camera, villagers, buildings, TOOLBAR_HEIGHT);
  drawHud(ctx, villagers.length, selected, paused, gameSpeed);
  if (villagers.length > 0) drawMarkFilters(ctx, markFilter);
  if (villagers.length > 0) drawTaskList(ctx, getTaskCounts());

  // alan seçerken imlecin yanında canlı sayım
  if (selecting?.mode === "rect") {
    const c = countSelection(selecting);
    const parts: string[] = [];
    if (markFilter === "cancel") parts.push(`İptal ${c.marked}`);
    if (markFilter === "all" || markFilter === "wood") parts.push(`Ağaç ${c.trees}`);
    if (markFilter === "all" || markFilter === "food") parts.push(`Yiyecek ${c.food}`);
    if (markFilter === "all" || markFilter === "stone") parts.push(`Taş ${c.stone}`);
    const text = parts.join("  •  ");
    ctx.font = "bold 12px monospace";
    ctx.textBaseline = "middle";
    const tw = ctx.measureText(text).width + 16;
    const lx = Math.min(input.mouseX + 16, canvas.width - tw - 4);
    const lyy = Math.max(40, input.mouseY - 18);
    ctx.fillStyle = "rgba(10, 12, 16, 0.85)";
    ctx.fillRect(lx, lyy - 10, tw, 20);
    ctx.strokeStyle = "rgba(160, 240, 180, 0.7)";
    ctx.strokeRect(lx + 0.5, lyy - 9.5, tw - 1, 19);
    ctx.fillStyle = "#d8f0c0";
    ctx.fillText(text, lx + 8, lyy);
  }
  if (villagers.length > 0) {
    if (selectedVillager) drawProfile(ctx, selectedVillager);
    if (selectedBuilding) drawBuildingPanel(ctx, selectedBuilding, world, villagers);
    if (showPopulation) drawPopulationPanel(ctx, villagers, buildings);
    if (showPeople) drawPeoplePanel(ctx, villagers);
    if (showTech) drawTechPanel(ctx);
  }

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
