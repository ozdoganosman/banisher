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
  popScrollBy,
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
} from "./render/hud";
import { buyTech } from "./sim/tech";
import { Animal, ANIMAL_DEFS, BARN_HERD, WILD_POOL, type AnimalType } from "./sim/animals";
import {
  Building,
  BUILDING_DEFS,
  BuildingType,
  canPlace,
  HOUSE_CAPACITY,
  isHousing,
  placeBuilding,
  ROLE_NAMES,
} from "./sim/buildings";
import { gameTime, season, totalDays, updateTime } from "./sim/time";
import { addFloater } from "./render/effects";
import {
  foodTotal,
  isFull,
  ITEM_INFO,
  ITEM_TYPES,
  resources,
  type ItemType,
} from "./sim/resources";
import { Villager } from "./sim/villager";
import { updateEffects } from "./render/effects";
import { TILE_SIZE } from "./world/tiles";
import { World } from "./world/world";

const MAP_W = 128;
const MAP_H = 128;
const VILLAGER_COUNT = 6;
const FIXED_DT = 1 / 60;
const DEPOT_CAP_BONUS = 80;

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
let showTech = false;
let markFilter: MarkFilter = "all";
// sol tuş sürükleme: alan seçimi veya mini harita gezdirme
let selecting:
  | { mode: "rect"; x0: number; y0: number; x1: number; y1: number }
  | { mode: "minimap" }
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
    if (v.baby || v.assignment.kind !== "laborer") continue;
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
  resources.wood = Math.min(resources.cap, resources.wood + refund);
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
        villagers.push(new Villager(x, y));
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
    if (hit !== null) selected = selected === hit ? null : hit;
    return;
  }

  // mini harita: tıklanan noktaya kamerayı götür
  const mm = renderer.minimapHit(sx, sy);
  if (mm) {
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

  // üst bardaki nüfus ve teknoloji düğmeleri
  if (popButtonHitTest(sx, sy)) {
    showPopulation = !showPopulation;
    showTech = false;
    return;
  }
  if (techButtonHitTest(sx, sy)) {
    showTech = !showTech;
    showPopulation = false;
    return;
  }
  if (pauseButtonHitTest(sx, sy)) {
    paused = !paused;
    return;
  }
  if (speedButtonHitTest(sx, sy)) {
    gameSpeed = gameSpeed === 1 ? 2 : gameSpeed === 2 ? 4 : 1;
    return;
  }

  // teknoloji paneli açıkken
  if (showTech) {
    const hit = techPanelHitTest(sx, sy);
    if (hit) {
      if (hit.kind === "close") showTech = false;
      else if (hit.kind === "buy") {
        if (!buyTech(hit.id)) addMessage("Yetersiz bilgi!");
      }
      return;
    }
    showTech = false;
    return;
  }

  // nüfus yönetim menüsü açıkken tıklamalar önce ona gider
  if (showPopulation) {
    const hit = popPanelHitTest(sx, sy, villagers, buildings);
    if (hit) {
      if (hit.kind === "close") {
        showPopulation = false;
      } else if (hit.kind === "hire") {
        hire(hit.building);
      } else if (hit.kind === "fire") {
        fire(hit.building);
      } else if (hit.kind === "select") {
        // isme tıkla: menüyü kapat, köylünün profilini aç ve kameraya al
        const v = villagers[hit.index];
        showPopulation = false;
        selectedVillager = v;
        selectedBuilding = null;
        camera.x = v.x;
        camera.y = v.y;
      }
      return;
    }
    // panel dışına tıklama menüyü kapatır
    showPopulation = false;
    return;
  }

  // profil paneli açıkken üzerine gelen tıklamalar dünyaya geçmesin
  if (selectedVillager) {
    const hit = profileHitTest(sx, sy);
    if (hit) {
      if (hit.kind === "close") selectedVillager = null;
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
      else if (hit === "demolish") demolishBuilding(selectedBuilding);
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
      selectedBuilding = null;
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
      selectedVillager = null;
      return;
    }
    world.toggleMark(tx, ty);
  }
};

input.onCancel = () => {
  selected = null;
  selectedVillager = null;
  selectedBuilding = null;
  showPopulation = false;
  showTech = false;
};

// Sol tuş sürükleme: mini haritada kamera gezdirme, dünyada alan seçimi
input.onLeftDragStart = (wx, wy, sx, sy) => {
  if (renderer.minimapHit(sx, sy)) {
    selecting = { mode: "minimap" };
    return;
  }
  if (selected !== null || showPopulation || showTech || selectedVillager || selectedBuilding) return;
  if (isOverToolbar(sy, canvas.height)) return;
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
  selecting.x1 = wx;
  selecting.y1 = wy;
};

input.onLeftDragEnd = () => {
  if (selecting?.mode === "rect") {
    const n = markSelection(selecting);
    if (n > 0) {
      const label = MARK_FILTERS.find((f) => f.id === markFilter)?.label ?? "";
      addMessage(`${n} blok işaretlendi (${label})`);
    }
  }
  selecting = null;
};

// Seçim karesindeki blokları say (canlı gösterge için)
function countSelection(sel: { x0: number; y0: number; x1: number; y1: number }) {
  const tx0 = Math.max(0, Math.floor(Math.min(sel.x0, sel.x1) / TILE_SIZE));
  const ty0 = Math.max(0, Math.floor(Math.min(sel.y0, sel.y1) / TILE_SIZE));
  const tx1 = Math.min(MAP_W - 1, Math.floor(Math.max(sel.x0, sel.x1) / TILE_SIZE));
  const ty1 = Math.min(MAP_H - 1, Math.floor(Math.max(sel.y0, sel.y1) / TILE_SIZE));
  let trees = 0, food = 0, stone = 0;
  for (let y = ty0; y <= ty1; y++) {
    for (let x = tx0; x <= tx1; x++) {
      const t = world.get(x, y);
      if (t === Tile.Tree) trees++;
      else if (foodItemOf(t)) food++;
      else if (t === Tile.Stone) stone++;
    }
  }
  return { trees, food, stone };
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
        if (!world.markedBushes.has(world.index(x, y))) n++;
        world.markFood(x, y);
      } else if ((markFilter === "all" || markFilter === "stone") && t === Tile.Stone) {
        if (!world.markedStones.has(world.index(x, y))) n++;
        world.markStone(x, y);
      }
    }
  }
  return n;
}

// Nüfus menüsü açıkken üzerindeyken tekerlek menüyü kaydırır
input.wheelInterceptor = (sx, sy, deltaY) => {
  if (showPopulation && isOverPopPanel(sx, sy)) {
    popScrollBy(deltaY > 0 ? 1 : -1, villagers.length);
    return true;
  }
  return false;
};

window.addEventListener("keydown", (e) => {
  if (e.code === "Escape") {
    selected = null;
    selectedVillager = null;
    selectedBuilding = null;
    showPopulation = false;
    showTech = false;
  } else if (e.code === "Space") {
    e.preventDefault();
    paused = !paused;
  } else if (e.code === "KeyX") {
    gameSpeed = gameSpeed === 1 ? 2 : gameSpeed === 2 ? 4 : 1;
  } else if (e.code === "KeyN") {
    showPopulation = !showPopulation;
    showTech = false;
  } else if (e.code === "KeyT") {
    showTech = !showTech;
    showPopulation = false;
  } else if (e.code === "KeyF") {
    const i = MARK_FILTERS.findIndex((f) => f.id === markFilter);
    markFilter = MARK_FILTERS[(i + 1) % MARK_FILTERS.length].id;
  }
  else if (e.code.startsWith("Digit")) {
    const n = Number(e.code.slice(5));
    const idx = n === 0 ? 9 : n - 1; // 0 tuşu = 10. bina
    if (idx >= 0 && idx < TOOLBAR_TYPES.length) {
      selected = selected === TOOLBAR_TYPES[idx] ? null : TOOLBAR_TYPES[idx];
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

// Gün dönümü: boş yeri olan her konutta bebek doğma şansı
function nightlyBirths(): void {
  const adults = villagers.filter((v) => !v.baby).length;
  if (adults < 2) return; // çoğalmak için en az 2 yetişkin
  for (const b of buildings) {
    if (!isHousing(b) || occupants(b) >= HOUSE_CAPACITY) continue;
    if (Math.random() > BIRTH_CHANCE) continue;
    // bebeği konutun yanındaki yürünebilir bloğa doğur
    let placed = false;
    for (let r = 1; r <= 3 && !placed; r++) {
      for (let dy = -r; dy <= r && !placed; dy++) {
        for (let dx = -r; dx <= r && !placed; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = b.x + 1 + dx;
          const y = b.y + 1 + dy;
          if (!world.walkableAt(x, y)) continue;
          const baby = new Villager(x, y, true);
          baby.home = b;
          villagers.push(baby);
          addMessage(`👶 ${baby.fullName} doğdu!`);
          addFloater(b.centerX, b.y * TILE_SIZE - 6, "+1 bebek", "#ffb0d0");
          placed = true;
        }
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

function step(dt: number) {
  updateTime(dt);
  world.update(dt);
  updateEffects(dt);
  checkStorageFull();
  checkMilestones();

  // gün dönümü: doğumlar
  const days = totalDays();
  if (days !== lastDayCount) {
    lastDayCount = days;
    nightlyBirths();
    // doğa kendini yeniler: yabani nüfus azaldıysa yenileri türer
    const wildCount = animals.filter((a) => a.wild).length;
    if (wildCount < WILD_CAP) {
      spawnWildAnimal();
      if (wildCount < WILD_CAP / 2) spawnWildAnimal();
    }
  }

  // konut atamalarını periyodik tazele
  homeTimer -= dt;
  if (homeTimer <= 0) {
    homeTimer = 1;
    assignHomes();
  }

  for (const v of villagers) v.update(dt, world, buildings, animals);

  // hayvanlar: dolanma, otlama, açlık
  for (const a of animals) a.update(dt, world);
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

  // açlıktan ölenleri çıkar
  for (let i = villagers.length - 1; i >= 0; i--) {
    if (villagers[i].dead) {
      addMessage(`${villagers[i].fullName} açlıktan öldü!`);
      if (selectedVillager === villagers[i]) selectedVillager = null;
      villagers.splice(i, 1);
    }
  }

  for (const b of buildings) {
    b.update(dt, world, workersOf(b));
    // kaynak bitti uyarısı (bir kez; kaynak dönerse sıfırlanır)
    if (b.outOfResources && !b.warnedOut && workersOf(b) > 0) {
      b.warnedOut = true;
      addMessage(`⚠ ${b.def.name} kulübesinin menzilinde kaynak kalmadı!`);
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
window.__game = { world, villagers, buildings, animals, camera, resources, gameTime };

let last = performance.now();
let accumulator = 0;

function frame(now: number) {
  const elapsed = Math.min((now - last) / 1000, 0.25);
  last = now;

  // kamera ve mesaj zamanlayıcıları duraklatmadan etkilenmez
  input.update(elapsed);
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
  renderer.drawMinimap(ctx, camera, villagers, buildings, TOOLBAR_HEIGHT);
  drawHud(ctx, villagers.length, selected, paused, gameSpeed);
  if (villagers.length > 0) drawMarkFilters(ctx, markFilter);

  // alan seçerken imlecin yanında canlı sayım
  if (selecting?.mode === "rect") {
    const c = countSelection(selecting);
    const parts: string[] = [];
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
    if (showTech) drawTechPanel(ctx);
  }

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
