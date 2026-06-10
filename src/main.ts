import { Camera } from "./engine/camera";
import { Input } from "./engine/input";
import { Renderer } from "./render/renderer";
import { drawHud } from "./render/hud";
import { Villager } from "./sim/villager";
import { TILE_SIZE } from "./world/tiles";
import { World } from "./world/world";

const MAP_W = 128;
const MAP_H = 128;
const VILLAGER_COUNT = 6;
const FIXED_DT = 1 / 60;

const canvas = document.getElementById("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", resize);
resize();

const seed = Math.floor(Math.random() * 2 ** 31);
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

// Köylüleri doğma noktasının etrafındaki yürünebilir bloklara yerleştir
const villagers: Villager[] = [];
outer: for (let r = 0; r < 10 && villagers.length < VILLAGER_COUNT; r++) {
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = spawn.x + dx;
      const y = spawn.y + dy;
      if (!world.walkableAt(x, y)) continue;
      villagers.push(new Villager(x, y));
      if (villagers.length >= VILLAGER_COUNT) break outer;
    }
  }
}

input.onClick = (wx, wy) => {
  world.toggleMark(Math.floor(wx / TILE_SIZE), Math.floor(wy / TILE_SIZE));
};

let last = performance.now();
let accumulator = 0;

function frame(now: number) {
  const elapsed = Math.min((now - last) / 1000, 0.25);
  last = now;
  accumulator += elapsed;

  while (accumulator >= FIXED_DT) {
    input.update(FIXED_DT);
    for (const v of villagers) v.update(FIXED_DT, world);
    accumulator -= FIXED_DT;
  }

  const hover = camera.screenToWorld(input.mouseX, input.mouseY, canvas.width, canvas.height);
  const hoverTile = { x: Math.floor(hover.x / TILE_SIZE), y: Math.floor(hover.y / TILE_SIZE) };

  renderer.render(
    ctx,
    camera,
    villagers,
    world.inBounds(hoverTile.x, hoverTile.y) ? hoverTile : null,
    now / 1000
  );
  drawHud(ctx, villagers.length);

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
