import { Camera } from "./engine/camera";
import { Input } from "./engine/input";
import { Renderer, type Ghost } from "./render/renderer";
import {
  addMessage,
  drawHud,
  isOverToolbar,
  toolbarHitTest,
  updateMessages,
} from "./render/hud";
import {
  Building,
  BUILDING_DEFS,
  BUILDING_SIZE,
  BuildingType,
  canPlace,
  placeBuilding,
} from "./sim/buildings";
import { resources } from "./sim/resources";
import { Villager } from "./sim/villager";
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

spawnVillagersAround(spawn.x, spawn.y, VILLAGER_COUNT);

// ---- Girdi ----

input.onClick = (wx, wy, sx, sy) => {
  // önce araç çubuğu
  if (isOverToolbar(sy, canvas.height)) {
    const hit = toolbarHitTest(sx, sy, canvas.width, canvas.height);
    if (hit !== null) selected = selected === hit ? null : hit;
    return;
  }

  // bina yerleştirirken hayalet önizlemeyle aynı hizalama (harita kenarına sıkıştır)
  const tx = selected !== null
    ? Math.min(Math.max(Math.floor(wx / TILE_SIZE), 0), MAP_W - BUILDING_SIZE)
    : Math.floor(wx / TILE_SIZE);
  const ty = selected !== null
    ? Math.min(Math.max(Math.floor(wy / TILE_SIZE), 0), MAP_H - BUILDING_SIZE)
    : Math.floor(wy / TILE_SIZE);

  if (selected !== null) {
    // bina yerleştirme
    const def = BUILDING_DEFS[selected];
    if (!canPlace(world, tx, ty)) {
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
    // ağaç/çalı işaretleme
    world.toggleMark(tx, ty);
  }
};

input.onCancel = () => {
  selected = null;
};

window.addEventListener("keydown", (e) => {
  if (e.code === "Escape") selected = null;
  else if (e.code.startsWith("Digit")) {
    const n = Number(e.code.slice(5));
    const types = [
      BuildingType.House,
      BuildingType.Depot,
      BuildingType.Woodcutter,
      BuildingType.Gatherer,
    ];
    if (n >= 1 && n <= types.length) {
      selected = selected === types[n - 1] ? null : types[n - 1];
    }
  }
});

// ---- Simülasyon adımı ----

function step(dt: number) {
  input.update(dt);
  world.update(dt);
  updateMessages(dt);

  for (const v of villagers) v.update(dt, world, buildings);

  // açlıktan ölenleri çıkar
  for (let i = villagers.length - 1; i >= 0; i--) {
    if (villagers[i].dead) {
      villagers.splice(i, 1);
      addMessage("Bir köylü açlıktan öldü!");
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
        resources.woodCap += DEPOT_CAP_BONUS;
        resources.foodCap += DEPOT_CAP_BONUS;
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
window.__game = { world, villagers, buildings, camera, resources };

let last = performance.now();
let accumulator = 0;

function frame(now: number) {
  const elapsed = Math.min((now - last) / 1000, 0.25);
  last = now;
  accumulator += elapsed;

  while (accumulator >= FIXED_DT) {
    step(FIXED_DT);
    accumulator -= FIXED_DT;
  }

  const hover = camera.screenToWorld(input.mouseX, input.mouseY, canvas.width, canvas.height);
  const hoverTile = { x: Math.floor(hover.x / TILE_SIZE), y: Math.floor(hover.y / TILE_SIZE) };
  const hoverValid = world.inBounds(hoverTile.x, hoverTile.y);
  const overToolbar = isOverToolbar(input.mouseY, canvas.height);

  let ghost: Ghost | null = null;
  if (selected !== null && hoverValid && !overToolbar) {
    const gx = Math.min(Math.max(hoverTile.x, 0), MAP_W - BUILDING_SIZE);
    const gy = Math.min(Math.max(hoverTile.y, 0), MAP_H - BUILDING_SIZE);
    ghost = { type: selected, tileX: gx, tileY: gy, valid: canPlace(world, gx, gy) };
  }

  renderer.render(
    ctx,
    camera,
    villagers,
    buildings,
    hoverValid ? hoverTile : null,
    ghost,
    now / 1000
  );
  drawHud(ctx, villagers.length, selected);

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
