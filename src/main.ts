import { Camera } from "./engine/camera";
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
  popScrollBy,
  profileHitTest,
  TOOLBAR_TYPES,
  toolbarHitTest,
  updateMessages,
} from "./render/hud";
import {
  Building,
  BUILDING_DEFS,
  BuildingType,
  canPlace,
  placeBuilding,
} from "./sim/buildings";
import { gameTime, updateTime } from "./sim/time";
import { isFull, ITEM_INFO, ITEM_TYPES, resources, type ItemType } from "./sim/resources";
import { Villager } from "./sim/villager";
import { updateEffects } from "./render/effects";
import { TILE_SIZE } from "./world/tiles";
import { World } from "./world/world";

const MAP_W = 128;
const MAP_H = 128;
const VILLAGER_COUNT = 6;
const FIXED_DT = 1 / 60;
const DEPOT_CAP_BONUS = 80;
const VILLAGERS_PER_HOUSE = 2;

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
let selected: BuildingType | null = null;
let selectedVillager: Villager | null = null;
let selectedBuilding: Building | null = null;
let showPopulation = false;
let paused = false;
let gameSpeed = 1;

// Tıklanan dünya noktasına en yakın köylüyü bul (vücut hizasında, ~9 piksel tolerans)
function villagerAt(wx: number, wy: number): Villager | null {
  let best: Villager | null = null;
  let bestDist = 9;
  for (const v of villagers) {
    const d = Math.hypot(wx - v.x, wy - (v.y - 6));
    if (d < bestDist) {
      bestDist = d;
      best = v;
    }
  }
  return best;
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

// ---- Girdi ----

input.onClick = (wx, wy, sx, sy) => {
  // önce araç çubuğu
  if (isOverToolbar(sy, canvas.height)) {
    const hit = toolbarHitTest(sx, sy, canvas.width, canvas.height);
    if (hit !== null) selected = selected === hit ? null : hit;
    return;
  }

  // üst bardaki nüfus düğmesi
  if (popButtonHitTest(sx, sy)) {
    showPopulation = !showPopulation;
    return;
  }

  // nüfus yönetim menüsü açıkken tıklamalar önce ona gider
  if (showPopulation) {
    const hit = popPanelHitTest(sx, sy, villagers.length);
    if (hit) {
      if (hit.kind === "close") {
        showPopulation = false;
      } else if (hit.kind === "profession") {
        villagers[hit.index].profession = hit.profession;
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
      if (hit.kind === "close") {
        selectedVillager = null;
      } else if (hit.kind === "profession") {
        selectedVillager.profession = hit.profession;
      }
      return;
    }
  }

  // bina paneli açıkken
  if (selectedBuilding) {
    const hit = buildingPanelHitTest(sx, sy);
    if (hit) {
      if (hit === "close") selectedBuilding = null;
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
    if (resources.wood < def.cost) {
      addMessage(`Yetersiz odun! (${def.name}: ${def.cost} odun)`);
      return;
    }
    resources.wood -= def.cost;
    const b = new Building(selected, tx, ty);
    placeBuilding(world, b);
    buildings.push(b);
    addMessage(`${def.name} şantiyesi kuruldu`);
  } else {
    // köylü > bina > blok işaretleme önceliğiyle tıklamayı yönlendir
    const v = villagerAt(wx, wy);
    if (v) {
      selectedVillager = v;
      selectedBuilding = null;
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
};

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
  } else if (e.code === "Space") {
    e.preventDefault();
    paused = !paused;
  } else if (e.code === "KeyX") {
    gameSpeed = gameSpeed === 1 ? 2 : gameSpeed === 2 ? 4 : 1;
  } else if (e.code === "KeyN") {
    showPopulation = !showPopulation;
  }
  else if (e.code.startsWith("Digit")) {
    const n = Number(e.code.slice(5));
    if (n >= 1 && n <= TOOLBAR_TYPES.length) {
      selected = selected === TOOLBAR_TYPES[n - 1] ? null : TOOLBAR_TYPES[n - 1];
    }
  }
});

// ---- Simülasyon adımı ----

// Depo dolduğunda bir kez bildirim göster (boşalınca sıfırlanır)
const wasFull: Record<ItemType, boolean> = {
  wood: false, stone: false, berry: false, mushroom: false,
};

function checkStorageFull() {
  for (const item of ITEM_TYPES) {
    const full = isFull(item);
    if (full && !wasFull[item]) {
      const name = ITEM_INFO[item].name;
      addMessage(`${name[0].toUpperCase()}${name.slice(1)} deposu doldu! İşçiler başka işlere yöneliyor.`);
    }
    wasFull[item] = full;
  }
}

function step(dt: number) {
  updateTime(dt);
  world.update(dt);
  updateEffects(dt);
  checkStorageFull();

  for (const v of villagers) v.update(dt, world, buildings);

  // açlıktan ölenleri çıkar
  for (let i = villagers.length - 1; i >= 0; i--) {
    if (villagers[i].dead) {
      addMessage(`${villagers[i].fullName} açlıktan öldü!`);
      if (selectedVillager === villagers[i]) selectedVillager = null;
      villagers.splice(i, 1);
    }
  }

  for (const b of buildings) {
    b.update(dt, world);
    // tamamlanma etkileri bir kez uygulanır
    if (b.done && !b.effectApplied) {
      b.effectApplied = true;
      const def = BUILDING_DEFS[b.type];
      if (b.type === BuildingType.House) {
        const n = spawnVillagersAround(b.x + 1, b.y + 1, VILLAGERS_PER_HOUSE);
        addMessage(`Ev tamamlandı: ${n} yeni köylü geldi!`);
      } else if (b.type === BuildingType.Depot) {
        resources.cap += DEPOT_CAP_BONUS;
        addMessage(`Depo tamamlandı: kapasite +${DEPOT_CAP_BONUS}`);
      } else {
        addMessage(`${def.name} tamamlandı`);
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
window.__game = { world, villagers, buildings, camera, resources, gameTime };

let last = performance.now();
let accumulator = 0;

function frame(now: number) {
  const elapsed = Math.min((now - last) / 1000, 0.25);
  last = now;

  // kamera ve mesaj zamanlayıcıları duraklatmadan etkilenmez
  input.update(elapsed);
  updateMessages(elapsed);

  accumulator += elapsed * (paused ? 0 : gameSpeed);
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
    const size = BUILDING_DEFS[selected].size;
    const gx = Math.min(Math.max(hoverTile.x, 0), MAP_W - size);
    const gy = Math.min(Math.max(hoverTile.y, 0), MAP_H - size);
    ghost = { type: selected, tileX: gx, tileY: gy, size, valid: canPlace(world, gx, gy, size) };
  }

  renderer.render(
    ctx,
    camera,
    villagers,
    buildings,
    hoverValid ? hoverTile : null,
    ghost,
    selectedVillager,
    selectedBuilding,
    now / 1000
  );
  drawHud(ctx, villagers.length, selected, paused, gameSpeed);
  if (selectedVillager) drawProfile(ctx, selectedVillager);
  if (selectedBuilding) drawBuildingPanel(ctx, selectedBuilding, world);
  if (showPopulation) drawPopulationPanel(ctx, villagers);

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
