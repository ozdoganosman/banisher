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
  drawJournalPanel,
  journalPanelHitTest,
  drawPolicyPanel,
  policyPanelHitTest,
  policyButtonHitTest,
  drawDivinePanel,
  divinePanelHitTest,
  divineButtonHitTest,
  drawAnimalPanel,
  animalPanelHitTest,
  journalButtonHitTest,
  journalScrollBy,
  isOverJournalPanel,
  type MarkFilter,
  profileHitTest,
  speedButtonHitTest,
  drawTechPanel,
  techButtonHitTest,
  techPanelHitTest,
  techScrollBy,
  TOOLBAR_HEIGHT,
  TOOLBAR_TYPES,
  toolbarHitTest,
  drawToolbarTooltip,
  updateMessages,
  drawTaskList,
  drawGoalCard,
  type TaskCounts,
  dragPanelBy,
  panelRectOf,
  type PanelId,
} from "./render/hud";
import { buyTech, grantTech, hasTech, cheapestAvailable, currentCost, purchasedList, restorePurchased, TECHS, type Tech, type TechId } from "./sim/tech";
import { Animal, ANIMAL_DEFS, TAME_TARGET, WILD_POOL, BARN_CAPACITY, BREED_INTERVAL, PASTURE_RADIUS, pastureBounds, type AnimalType } from "./sim/animals";
import {
  AXE_STONE_COST,
  AXE_WOOD_COST,
  CLOTH_LEATHER_COST,
  SPEAR_LOG_COST,
  SPEAR_STONE_COST,
  SPEAR_WOOD_COST,
  TORCH_ATTACH_COST,
  HOUSE_FUEL_PER_DAY,
  Building,
  BUILDING_DEFS,
  BuildingType,
  canPlace,
  HOUSE_CAPACITY,
  isHousing,
  worshipState,
  worshipYieldFor,
  placeBuilding,
  ROLE_NAMES,
  isBuildingUnlocked,
} from "./sim/buildings";
import { dateString, dayFrac, gameTime, season, totalDays, tuning, updateTime } from "./sim/time";
import { initAudio, isMuted, setFireProximity, setListener, setMuted, sfxResearch } from "./engine/sound";
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
import { DIFFICULTY_PRESETS, difficulty, type DifficultyLevel } from "./sim/difficulty";
import { eventFlags } from "./sim/events";
import { divine, divineCooldown, DIVINE_POWERS, wisdomActive, bountyActive, type DivinePowerId } from "./sim/divine";
import { policy, POLICY_INFO } from "./sim/policy";
import { currentGoal, goalState, tickGoals } from "./sim/goals";
import { addJournal, journal } from "./sim/journal";
import { screams, updateScreams, Villager } from "./sim/villager";
import { updateEffects } from "./render/effects";
import { TILE_SIZE } from "./world/tiles";
import { World } from "./world/world";

const MAP_W = 128;
const MAP_H = 128;
const VILLAGER_COUNT = 10;
const FIXED_DT = 1 / 60;
const DEPOT_CAP_BONUS = 120; // depo: ürün başına sınırı bu kadar artırır

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
let selected: BuildingType | null = null;
let selectedVillager: Villager | null = null;
let selectedBuilding: Building | null = null;
let selectedAnimal: Animal | null = null;
let showPopulation = false;
let showPeople = false;
let showJournal = false;
let showTech = false;
let showPolicy = false;
let showDivine = false;
let markFilter: MarkFilter = "all";
// sol tuş sürükleme: alan seçimi veya mini harita gezdirme
let selecting:
  | { mode: "rect"; x0: number; y0: number; x1: number; y1: number }
  | { mode: "minimap" }
  | { mode: "panel"; id: PanelId; lx: number; ly: number }
  | null = null;
let paused = true; // zorluk seçilene kadar bekle
let gameSpeed = 1;

// ---- Kaydet / Yükle (localStorage) ----

const SAVE_KEY = "banisher_save";

function saveGame(auto = false): void {
  const bIndex = (b: Building | null) => (b ? buildings.indexOf(b) : -1);
  const vIndex = (v: Villager | null) => (v ? villagers.indexOf(v) : -1);
  const data = {
    version: 1,
    seed,
    time: gameTime.total,
    tuning: { ...tuning },
    difficulty: { ...difficulty },
    resources: { ...resources },
    tech: purchasedList(),
    policy: { ...policy },
    divine: { ...divine },
    divineCooldown: { ...divineCooldown }, // güç bekleme süreleri (reload ile sıfırlanmasın = save-scum yok)
    events: { ...eventFlags },
    goal: goalState.index,
    gameSpeed, // oyun hızı: yüklemede seçilen hızı koru
    world: world.serialize(),
    journal: journal.map((e) => ({ ...e })),
    camera: { x: camera.x, y: camera.y, zoom: camera.zoom },
    buildings: buildings.map((b) => ({
      type: b.type, x: b.x, y: b.y, progress: b.progress,
      orders: b.orders, toolStock: b.toolStock,
      spearOrders: b.spearOrders, spearStock: b.spearStock,
      clothOrders: b.clothOrders, clothStock: b.clothStock,
      hasTorch: b.hasTorch, farmType: b.farmType, fueled: b.fueled,
      worshipTimer: b.worshipTimer,
    })),
    villagers: villagers.map((v) => ({
      x: v.x, y: v.y, identity: { ...v.identity },
      hunger: v.hunger, morale: v.morale, hp: v.hp,
      moraleLog: [...v.moraleLog],
      inventory: { ...v.inventory }, // taşınan kargo (yoksa kayıt/yüklemede kaybolur)
      birthDay: v.birthDay, pregnantSince: v.pregnantSince,
      educated: v.educated, hasAxe: v.hasAxe, hasClothes: v.hasClothes,
      spears: v.spears, sick: v.sickUntilDay, prophet: v.prophetUntilDay,
      home: bIndex(v.home), mother: vIndex(v.mother),
      assignment:
        v.assignment.kind === "building"
          ? { kind: "building" as const, index: bIndex(v.assignment.building) }
          : { kind: v.assignment.kind },
    })),
    animals: animals.map((a) => ({
      type: a.type, x: a.x, y: a.y, hunger: a.hunger, hp: a.hp,
      hunted: a.hunted, tameMark: a.tameMark, produceTimer: a.produceTimer,
      female: a.female, bornDay: a.bornDay,
      barn: bIndex(a.barn), owner: vIndex(a.owner),
    })),
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    addMessage(auto ? "💾 Otomatik kayıt alındı" : "💾 Oyun kaydedildi");
  } catch {
    // Otomatik kayıtta sessiz kal (her döngüde uyarı yağmuru olmasın);
    // elle kayıtta kullanıcıyı bilgilendir.
    if (!auto) addMessage("Kayıt başarısız (depolama dolu olabilir)");
  }
}

// Aktif oyun var mı? (ana menü/oyun sonu sırasında kayıt almayız)
function gameActive(): boolean {
  return villagers.length > 0 && !menuOverlay;
}

function hasSave(): boolean {
  return localStorage.getItem(SAVE_KEY) !== null;
}

function loadGame(): boolean {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return false;
  try {
    const d = JSON.parse(raw);
    // Bozuk/eksik kaydı GLOBAL durumu bozmadan önce reddet: aksi halde NaN/
    // undefined alanlar oyunu yarı-yüklenmiş kırık bir hale sokardı (otomatik
    // kayıt sıklaştığı için kısmi yazım riski daha da önemli).
    if (
      !d || typeof d !== "object" ||
      typeof d.time !== "number" || !Number.isFinite(d.time) ||
      !Array.isArray(d.villagers) || !Array.isArray(d.buildings) ||
      !d.world || typeof d.world !== "object"
    ) {
      addMessage("Kayıt bozuk — yüklenemedi (mevcut oyun korunuyor)");
      return false;
    }
    // zaman ve ayarlar önce (köylü kurulumu totalDays okur)
    gameTime.total = d.time;
    Object.assign(tuning, d.tuning);
    Object.assign(difficulty, d.difficulty);
    Object.assign(resources, d.resources);
    restorePurchased(d.tech);
    Object.assign(policy, d.policy ?? (d.autoResearch !== undefined ? { research: d.autoResearch } : {}));
    if (d.divine) Object.assign(divine, d.divine);
    for (const k of Object.keys(divineCooldown)) delete divineCooldown[k];
    if (d.divineCooldown) Object.assign(divineCooldown, d.divineCooldown);
    if ([1, 2, 4, 8, 16].includes(d.gameSpeed)) gameSpeed = d.gameSpeed; // geçerliyse hızı geri yükle
    eventFlags.coldSnapUntilDay = d.events?.coldSnapUntilDay ?? -1;
    goalState.index = d.goal ?? 0; // eski kayıtlar: karşılanan hedefler peş peşe tamamlanır
    eventTimer = 0.5 * tuning.dayLength; // eski kayıtlarda olay sayacı tazelenir
    world.restore(d.world);
    journal.splice(0, journal.length, ...d.journal);
    screams.splice(0, screams.length);

    buildings.length = 0;
    for (const bd of d.buildings) {
      const b = new Building(bd.type, bd.x, bd.y);
      b.progress = bd.progress;
      b.orders = bd.orders;
      b.toolStock = bd.toolStock;
      b.spearOrders = bd.spearOrders;
      b.spearStock = bd.spearStock;
      b.clothOrders = bd.clothOrders;
      b.clothStock = bd.clothStock;
      b.hasTorch = bd.hasTorch;
      b.farmType = bd.farmType;
      b.fueled = bd.fueled ?? false;
      b.worshipTimer = bd.worshipTimer;
      b.effectApplied = true; // tamamlanma etkileri tekrar oynamasın
      buildings.push(b);
    }

    villagers.length = 0;
    for (const vd of d.villagers) {
      const v = new Villager(0, 0);
      v.x = vd.x;
      v.y = vd.y;
      Object.assign(v.identity, vd.identity);
      v.hunger = vd.hunger;
      v.morale = vd.morale;
      v.hp = vd.hp;
      v.moraleLog.clear();
      for (const [k, val] of vd.moraleLog) v.moraleLog.set(k, val);
      if (vd.inventory) Object.assign(v.inventory, vd.inventory); // taşınan kargoyu geri yükle
      v.birthDay = vd.birthDay;
      v.pregnantSince = vd.pregnantSince;
      v.sickUntilDay = vd.sick ?? -1;
      v.prophetUntilDay = vd.prophet ?? -1;
      v.educated = vd.educated;
      v.hasAxe = vd.hasAxe;
      v.hasClothes = vd.hasClothes;
      v.spears = vd.spears;
      v.home = vd.home >= 0 ? buildings[vd.home] : null;
      v.assignment =
        vd.assignment.kind === "building" && vd.assignment.index >= 0
          ? { kind: "building", building: buildings[vd.assignment.index] }
          : vd.assignment.kind === "builder"
          ? { kind: "builder" }
          : { kind: "laborer" };
      villagers.push(v);
    }
    // anneler (köylüler kurulduktan sonra çözülür)
    d.villagers.forEach((vd: { mother: number }, i: number) => {
      if (vd.mother >= 0) villagers[i].mother = villagers[vd.mother];
    });

    animals.length = 0;
    for (const ad of d.animals) {
      const a = new Animal(ad.type, ad.barn >= 0 ? buildings[ad.barn] : null,
        Math.floor(ad.x / TILE_SIZE), Math.floor(ad.y / TILE_SIZE));
      a.x = ad.x;
      a.y = ad.y;
      a.hunger = ad.hunger;
      a.hp = ad.hp;
      a.hunted = ad.hunted;
      a.tameMark = ad.tameMark;
      a.produceTimer = ad.produceTimer;
      if (typeof ad.female === "boolean") a.female = ad.female;
      a.bornDay = ad.bornDay ?? null;
      a.owner = ad.owner >= 0 ? villagers[ad.owner] : null;
      animals.push(a);
    }

    camera.x = d.camera.x;
    camera.y = d.camera.y;
    camera.zoom = d.camera.zoom;
    selected = null;
    selectedVillager = null;
    selectedBuilding = null;
    selectedAnimal = null;
    dangerFollow = null;
    followVillager = null;
    lastDayCount = totalDays();
    rebuildPastures();
    renderer.repaintAll();
    addMessage("💾 Kayıt yüklendi — hoş geldin!");
    return true;
  } catch (err) {
    console.error("Yükleme hatası:", err);
    addMessage("Kayıt yüklenemedi!");
    return false;
  }
}

// ---- Menü sistemi: giriş ekranı, zorluk seçimi, duraklatma menüsü ----

let menuOverlay: HTMLDivElement | null = null;

function closeMenu(): void {
  menuOverlay?.remove();
  menuOverlay = null;
}

function buildMenu(
  title: string,
  subtitle: string,
  items: { label: string; desc?: string; onClick: () => void; disabled?: boolean }[]
): void {
  closeMenu();
  const overlay = document.createElement("div");
  overlay.style.cssText =
    "position:fixed;inset:0;background:rgba(8,10,14,0.92);display:flex;" +
    "flex-direction:column;align-items:center;justify-content:center;" +
    "font-family:monospace;color:#e8e2d0;z-index:10;gap:12px";
  const t = document.createElement("div");
  t.textContent = title;
  t.style.cssText = "font-size:34px;font-weight:bold;color:#ffe296;letter-spacing:6px";
  const st = document.createElement("div");
  st.textContent = subtitle;
  st.style.cssText = "font-size:13px;color:#9a9488;margin-bottom:10px";
  overlay.append(t, st);
  for (const item of items) {
    const btn = document.createElement("button");
    btn.innerHTML =
      `<div style="font-size:16px;font-weight:bold">${item.label}</div>` +
      (item.desc
        ? `<div style="font-size:11px;color:#b8b2a4;margin-top:4px">${item.desc}</div>`
        : "");
    btn.style.cssText =
      "width:380px;padding:11px 16px;background:rgba(255,255,255,0.06);" +
      "border:1px solid #5a5f68;color:#e8e2d0;font-family:monospace;" +
      "cursor:pointer;text-align:left;border-radius:6px" +
      (item.disabled ? ";opacity:0.4;cursor:default" : "");
    if (!item.disabled) {
      btn.onmouseenter = () => (btn.style.borderColor = "#8fd05e");
      btn.onmouseleave = () => (btn.style.borderColor = "#5a5f68");
      btn.onclick = () => {
        initAudio(); // ilk kullanıcı etkileşimi: sesi başlat
        item.onClick();
      };
    }
    overlay.append(btn);
  }
  document.body.append(overlay);
  menuOverlay = overlay;
}

function sesLabel(): string {
  return isMuted() ? "🔇 Ses: Kapalı" : "🔊 Ses: Açık";
}

// Tercih: tehlike kamerası. Açıkken, bir köylü yırtıcıyla karşılaşınca kamera
// ona doğru otomatik kayar. Hareket hassasiyeti olan ya da kontrolü elinde
// tutmak isteyen oyuncular için kapatılabilir — uyarı mesajı ve kırmızı ikaz
// halkası yine gösterilir, yalnız görüş zorla kaymaz. Tarayıcıda saklanır.
const DANGERCAM_KEY = "banisher_dangercam";
let dangerCamEnabled = (() => {
  try {
    return localStorage.getItem(DANGERCAM_KEY) !== "0";
  } catch {
    return true;
  }
})();
function setDangerCam(on: boolean): void {
  dangerCamEnabled = on;
  try {
    localStorage.setItem(DANGERCAM_KEY, on ? "1" : "0");
  } catch {
    /* depolama yoksa sessizce geç */
  }
}
function kameraLabel(): string {
  return dangerCamEnabled ? "🎥 Tehlike kamerası: Açık" : "🎥 Tehlike kamerası: Kapalı";
}

// Giriş ekranı (oyun açılışı)
function showMainMenu(): void {
  paused = true;
  buildMenu("BANISHER", "İnsanlığın yolculuğu seninle başlıyor", [
    {
      label: "▶ Yeni Oyun",
      desc: "Yeni bir adada, yeni bir kabileyle başla",
      onClick: showDifficultySelect,
    },
    {
      label: "💾 Devam Et",
      desc: hasSave() ? "Son kayıttan devam et" : "Kayıt bulunamadı",
      disabled: !hasSave(),
      onClick: () => {
        if (loadGame()) {
          closeMenu();
          paused = false;
        }
      },
    },
    {
      label: sesLabel(),
      desc: "Adımlar, balta, kurt uluması, ateş çıtırtısı",
      onClick: () => {
        setMuted(!isMuted());
        showMainMenu();
      },
    },
  ]);
}

// Zorluk seçimi (Yeni Oyun akışı)
function showDifficultySelect(): void {
  const items = (Object.keys(DIFFICULTY_PRESETS) as DifficultyLevel[]).map((level) => {
    const pr = DIFFICULTY_PRESETS[level];
    return {
      label: pr.name,
      desc: pr.desc,
      onClick: () => {
        pr.apply();
        applyDifficultyToColony();
        showScripture(); // kutsal metin: amaç ve zorlu yol
      },
    };
  });
  items.push({ label: "← Geri", desc: "", onClick: showMainMenu });
  buildMenu("BANISHER", "Kabilen için bir kader seç:", items);
}

// Açılış kutsal metni: oyunun amacını ve yolun zorluğunu anlatır
function showScripture(): void {
  closeMenu();
  const overlay = document.createElement("div");
  overlay.style.cssText =
    "position:fixed;inset:0;background:radial-gradient(ellipse at center, #1a1410 0%, #08090c 100%);" +
    "display:flex;flex-direction:column;align-items:center;justify-content:center;" +
    "font-family:monospace;color:#e8e2d0;z-index:10;gap:18px;padding:24px";

  const title = document.createElement("div");
  title.textContent = "☉ İLK SÖZ ☉";
  title.style.cssText =
    "font-size:22px;font-weight:bold;color:#ffd23c;letter-spacing:8px;" +
    "text-shadow:0 0 18px rgba(255,210,60,0.5)";

  const scripture = document.createElement("div");
  scripture.style.cssText =
    "max-width:600px;font-size:15px;line-height:1.9;color:#d8cdb4;text-align:center;" +
    "font-style:italic;border-top:1px solid rgba(255,210,60,0.3);" +
    "border-bottom:1px solid rgba(255,210,60,0.3);padding:22px 8px";
  scripture.innerHTML =
    "“Ey gök kubbenin altındaki avuç dolusu can,<br>" +
    "sizi karanlık bir mağaranın ağzında bıraktım.<br><br>" +
    "Önünüzde uzun ve <b style='color:#e8b86a'>çetin bir yol</b> var:<br>" +
    "açlık, soğuk ve gecenin dişli gölgeleri.<br>" +
    "Ateşi bulun, taşı yontun, toprağı evcilleştirin;<br>" +
    "yıkılan her nesilden bilgi devşirin.<br><br>" +
    "Ben yalnızca sizi <b style='color:#e8b86a'>izleyen göz</b>üm —<br>" +
    "kaderinizi kendi elleriniz örecek.<br>" +
    "Bu kabileyi mağaradan medeniyete taşıyın.”";

  const sub = document.createElement("div");
  sub.textContent = "— Banisher";
  sub.style.cssText = "font-size:12px;color:#8a7a5c;letter-spacing:3px";

  const btn = document.createElement("button");
  btn.textContent = "▶ Yolculuğa Başla";
  btn.style.cssText =
    "margin-top:10px;width:300px;padding:13px 16px;background:rgba(255,210,60,0.1);" +
    "border:1px solid #ffd23c;color:#ffe296;font-family:monospace;font-size:15px;" +
    "font-weight:bold;cursor:pointer;border-radius:6px";
  btn.onmouseenter = () => (btn.style.background = "rgba(255,210,60,0.22)");
  btn.onmouseleave = () => (btn.style.background = "rgba(255,210,60,0.1)");
  btn.onclick = () => {
    initAudio();
    closeMenu();
    paused = false;
  };

  overlay.append(title, scripture, sub, btn);
  document.body.append(overlay);
  menuOverlay = overlay;
}

// Oyun sonu: son köylü de göçtüğünde (koloni yok olunca) gösterilir.
// Daha önce yalnız sim donuyordu, oyuncuya hiçbir şey bildirilmiyordu.
function showGameOver(): void {
  const fate =
    lastDeathCause === "predator"
      ? "Kabilen yırtıcıların pençesinde tükendi"
      : lastDeathCause === "hunger"
      ? "Kabilen açlığa yenik düştü"
      : "Son köylün de göçtü";
  buildMenu(
    "☠ KABİLEN YOK OLDU",
    `${fate} — kabilen ${gameTime.year} yıl dayandı (${dateString()})`,
    [
      {
        label: "🔄 Yeniden Dene",
        desc: "Ana menüye dön, yeni bir kabileyle yeniden başla",
        onClick: () => location.reload(),
      },
    ]
  );
}

// Oyun içi duraklatma menüsü (Esc — açık panel yokken)
function showPauseMenu(): void {
  paused = true;
  // duraklatma menüsü başlığı: hızlı koloni durumu (tarih · zorluk · nüfus)
  const pop = villagers.length;
  const subtitle = `${dateString()} · ${DIFFICULTY_PRESETS[difficulty.level].name} · ${pop} köylü`;
  buildMenu("BANISHER", subtitle, [
    {
      label: "▶ Devam",
      desc: "",
      onClick: () => {
        closeMenu();
        paused = false;
      },
    },
    {
      label: "💾 Kaydet",
      desc: "Ctrl+S ile de kaydedebilirsin · oyun otomatik de kaydeder",
      onClick: () => {
        saveGame();
        closeMenu();
        paused = false;
      },
    },
    {
      label: sesLabel(),
      desc: "",
      onClick: () => {
        setMuted(!isMuted());
        showPauseMenu();
      },
    },
    {
      label: kameraLabel(),
      desc: "Tehlikede kameranın otomatik kaymasını aç/kapat",
      onClick: () => {
        setDangerCam(!dangerCamEnabled);
        showPauseMenu();
      },
    },
    {
      label: "❔ Kısayollar & Yardım",
      desc: "Tuşlar, fare ve kısa bir başlangıç rehberi (? tuşu)",
      onClick: showHelp,
    },
    {
      label: "🏠 Ana Menü",
      desc: "Kaydedilmemiş ilerleme kaybolur!",
      onClick: () => location.reload(),
    },
  ]);
}

// ❔ Kısayol & yardım ekranı (? tuşu ya da duraklatma menüsünden)
function helpSection(heading: string, rows: [string, string][]): HTMLElement {
  const wrap = document.createElement("div");
  wrap.style.cssText =
    "display:flex;flex-direction:column;gap:5px;width:min(540px,92vw)";
  const h = document.createElement("div");
  h.textContent = heading;
  h.style.cssText =
    "font-size:12px;color:#8fd05e;letter-spacing:2px;margin:6px 0 2px";
  wrap.appendChild(h);
  for (const [k, d] of rows) {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:12px";
    const key = document.createElement("span");
    key.textContent = k;
    key.style.cssText =
      "flex:0 0 138px;text-align:right;color:#ffd27a;font-weight:bold;font-size:12px";
    const desc = document.createElement("span");
    desc.textContent = d;
    desc.style.cssText = "color:#cdd4c0;font-size:12px";
    row.append(key, desc);
    wrap.appendChild(row);
  }
  return wrap;
}

function showHelp(): void {
  closeMenu();
  paused = true;
  const overlay = document.createElement("div");
  overlay.style.cssText =
    "position:fixed;inset:0;background:rgba(8,10,14,0.94);display:flex;" +
    "flex-direction:column;align-items:center;justify-content:center;" +
    "font-family:monospace;color:#e8e2d0;z-index:10;gap:10px;padding:24px;overflow:auto";

  const title = document.createElement("div");
  title.textContent = "❔ KISAYOLLAR & YARDIM";
  title.style.cssText =
    "font-size:24px;font-weight:bold;color:#ffe296;letter-spacing:4px";

  const keyboard = helpSection("⌨ KLAVYE", [
    ["Boşluk", "Duraklat / Devam"],
    ["X", "Oyun hızı (1→2→4→8→16)"],
    ["Ctrl/⌘ + S", "Oyunu kaydet"],
    ["Esc", "Menü · açık paneli kapat"],
    ["1 … 0", "Araç çubuğundan bina seç"],
    ["N", "Nüfus paneli"],
    ["M", "Köylüler (kişiler)"],
    ["B", "Günce"],
    ["T", "Teknoloji ağacı"],
    ["P", "Politika (otomasyon)"],
    ["Y", "İlahî güçler"],
    ["F", "İşaret filtresini değiştir"],
    ["G H J K L", "İşaret filtreleri (doğrudan)"],
    ["W A S D / Oklar", "Kamerayı kaydır"],
    ["?", "Bu yardım ekranı"],
  ]);

  const mouse = helpSection("🖱 FARE", [
    ["Sol tık", "Seç · sürükle: kaynak işaretle"],
    ["Sağ / Orta tuş sürükle", "Kamerayı kaydır"],
    ["Sağ tık", "Seçimi / işareti iptal et"],
    ["Tekerlek", "Yakınlaştır / uzaklaştır"],
  ]);

  const primer = document.createElement("div");
  primer.innerHTML =
    "Rahipler tapınakta <b style='color:#e8b86a'>bilgi</b> üretir; bilgiyle " +
    "<b style='color:#e8b86a'>T</b> ağacından araştırma açarsın. Kaynakları " +
    "<b style='color:#e8b86a'>sol tuşla sürükleyerek işaretle</b> — işçiler toplar. " +
    "Üretim binalarına işçi <b style='color:#e8b86a'>panelden</b> atanır.";
  primer.style.cssText =
    "max-width:560px;font-size:12px;line-height:1.7;color:#b8c4a8;text-align:center;" +
    "border-top:1px solid rgba(255,210,60,0.25);padding-top:12px;margin-top:6px";

  const btn = document.createElement("button");
  btn.innerHTML = "<div style='font-size:15px;font-weight:bold'>▶ Devam</div>";
  btn.style.cssText =
    "margin-top:8px;width:240px;padding:11px 16px;background:rgba(255,255,255,0.06);" +
    "border:1px solid #5a5f68;color:#e8e2d0;font-family:monospace;cursor:pointer;" +
    "text-align:center;border-radius:6px";
  btn.onmouseenter = () => (btn.style.borderColor = "#8fd05e");
  btn.onmouseleave = () => (btn.style.borderColor = "#5a5f68");
  btn.onclick = () => {
    closeMenu();
    paused = false;
  };

  overlay.append(title, keyboard, mouse, primer, btn);
  document.body.appendChild(overlay);
  menuOverlay = overlay;
}

// Seçilen zorluğu canlı koloniye uygula (köylü sayısı, erzak, moral)
function applyDifficultyToColony(): void {
  resources.berry = difficulty.startBerry;
  while (villagers.length > difficulty.startVillagers) villagers.pop();
  if (difficulty.startMoraleBonus !== 0) {
    for (const v of villagers) {
      v.changeMorale(
        difficulty.startMoraleBonus,
        difficulty.startMoraleBonus > 0 ? "Bereketli topraklar" : "Çetin topraklar"
      );
    }
  }
  addMessage(`Zorluk: ${DIFFICULTY_PRESETS[difficulty.level].name}`);
}

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
    // yırtıcılar takvime bağlı gelir: kurt Kış/1'den, ayı Kış/2'den itibaren
    // (kış = yılın 4. günü; Kış/1 = 7. gün, Kış/2 = 11. gün)
    if (type === "wolf" && totalDays() < difficulty.wolfDay) continue;
    if (type === "bear" && totalDays() < difficulty.bearDay) continue;
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

// Bu hayvan şu an evcilleştirilebilir mi? (araştırma + uygun çiftlik)
function canTameAnimal(a: Animal): boolean {
  const target = TAME_TARGET[a.type];
  if (!target || !a.wild || a.type === "dog") return false;
  if (a.type === "wolf") return hasTech("aidiyet");
  return (
    hasTech("ciftlik") &&
    buildings.some(
      (b) => b.type === BuildingType.Barn && b.done && b.farmType === target
    )
  );
}

// Tıklanan noktadaki hayvan (panel açmak için; her tür seçilebilir)
function animalAt(wx: number, wy: number): Animal | null {
  let best: Animal | null = null;
  let bestDist = 8;
  for (const a of animals) {
    if (a.dead) continue;
    const d = Math.hypot(wx - a.x, wy - (a.y - 3));
    if (d < bestDist) {
      bestDist = d;
      best = a;
    }
  }
  return best;
}

// Çiftlik çevresindeki yürünebilir bloğa hayvan bırak (baby=true: yavru doğar)
function spawnAnimal(barn: Building, type: AnimalType, baby = false): void {
  for (let r = 1; r <= 4; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = b2t(barn.centerX) + dx;
        const y = b2t(barn.centerY) + dy;
        if (!world.walkableAt(x, y)) continue;
        const a = new Animal(type, barn, x, y);
        if (baby) a.bornDay = totalDays();
        animals.push(a);
        return;
      }
    }
  }
}
const b2t = (px: number) => Math.floor(px / TILE_SIZE);

// Çiftlik padoğu (çit) açık karada mı? Size-2 ahır için merkez (tx+1, ty+1).
// Su veya harita kenarı varsa kurulamaz (çiftlik denizin üstünde kalmasın).
function pastureClearOfWater(tx: number, ty: number): boolean {
  const cx = tx + 1, cy = ty + 1;
  for (let yy = cy - PASTURE_RADIUS; yy <= cy + PASTURE_RADIUS; yy++) {
    for (let xx = cx - PASTURE_RADIUS; xx <= cx + PASTURE_RADIUS; xx++) {
      if (!world.inBounds(xx, yy)) return false;
      if (world.get(xx, yy) === Tile.Water) return false;
    }
  }
  return true;
}

// Çitli ağıl karolarını binalardan yeniden hesapla (yalnız çiftçiler girebilir)
function rebuildPastures(): void {
  world.pastureTiles.clear();
  for (const b of buildings) {
    if (b.type !== BuildingType.Barn || !b.done) continue;
    const pen = pastureBounds(b);
    for (let yy = pen.y0; yy <= pen.y1; yy++) {
      for (let xx = pen.x0; xx <= pen.x1; xx++) {
        if (world.inBounds(xx, yy)) world.pastureTiles.add(world.index(xx, yy));
      }
    }
  }
}

// Ocak: kışın yakıtı açık evler dal yakar (ısı/ışık verir), stoktan dal tüketir
let fuelDebt = 0; // kesirli tüketim biriktirici
function tickHouseFuel(dt: number): void {
  const winter = season() === 3;
  let burningCount = 0;
  for (const b of buildings) {
    if (b.type !== BuildingType.House || !b.done) continue;
    b.burning = winter && b.fueled && resources.wood > 0;
    if (b.burning) burningCount++;
  }
  if (burningCount > 0) {
    fuelDebt += burningCount * (HOUSE_FUEL_PER_DAY / tuning.dayLength) * dt;
    while (fuelDebt >= 1 && resources.wood > 0) {
      fuelDebt -= 1;
      resources.wood -= 1;
    }
  }
}

// Çiftlik döngüsü: yetişkin dişi+erkek çift yavru yapar; ağıl dolunca en yaşlı kesilir
function tickBarns(dt: number): void {
  for (const barn of buildings) {
    if (barn.type !== BuildingType.Barn || !barn.done || !barn.farmType) continue;
    const herd = animals.filter((a) => a.barn === barn && !a.dead);
    if (herd.length === 0) {
      barn.breedTimer = BREED_INTERVAL;
      continue;
    }
    // kapasite aşıldı: en yaşlı yetişkini kes (et kazanılır)
    if (herd.length > BARN_CAPACITY) {
      const adults = herd.filter((a) => a.adult);
      if (adults.length > 0) {
        // en yaşlı = en küçük bornDay; doğuştan yetişkin (null) en yaşlı sayılır
        adults.sort((a, b) => (a.bornDay ?? -1) - (b.bornDay ?? -1));
        const victim = adults[0];
        victim.dead = true;
        victim.slaughtered = true;
        const meat = victim.def.huntYield;
        const hide = victim.def.leatherYield;
        addItem("meat", meat);
        if (hide > 0) addItem("leather", hide);
        addMessage(`🔪 Çiftlik doldu: bir ${ANIMAL_DEFS[victim.type].name.toLowerCase()} kesildi (+${meat} et)`);
        addJournal(`🔪 Ağıl kapasitesi doldu, bir ${ANIMAL_DEFS[victim.type].name.toLowerCase()} kesildi (+${meat} et)`);
        addFloater(victim.x, victim.y - 12, `+${meat} et`, "#c0564a");
      }
      continue;
    }
    // üreme: en az bir yetişkin dişi + bir yetişkin erkek gerek, ağıl dolmamış olmalı
    const adultF = herd.some((a) => a.adult && a.female);
    const adultM = herd.some((a) => a.adult && !a.female);
    if (adultF && adultM && herd.length < BARN_CAPACITY) {
      barn.breedTimer -= dt;
      if (barn.breedTimer <= 0) {
        barn.breedTimer = BREED_INTERVAL;
        spawnAnimal(barn, barn.farmType, true);
        addMessage(`🐣 Çiftlikte bir ${ANIMAL_DEFS[barn.farmType].name.toLowerCase()} yavrusu doğdu`);
      }
    } else {
      barn.breedTimer = BREED_INTERVAL;
    }
  }
}

function demolishBuilding(b: Building): void {
  if (b.type === BuildingType.Camp) return;
  b.removed = true;
  if (b.type === BuildingType.Depot && b.done) {
    resources.cap = Math.max(200, resources.cap - DEPOT_CAP_BONUS);
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
    // o binaya bağlı güncel işi (inşa/depo/ibadet/zanaat/uyku...) bırak
    v.forgetBuilding(b, world);
  }
  const idx = buildings.indexOf(b);
  if (idx !== -1) buildings.splice(idx, 1);
  // ağıl yıkıldıysa otlak karoları güncel kalsın (hayalet otlak olmasın)
  if (b.type === BuildingType.Barn) rebuildPastures();
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
    followVillager = null;
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
  if (journalButtonHitTest(sx, sy)) {
    showJournal = !showJournal;
    return;
  }
  if (techButtonHitTest(sx, sy)) {
    showTech = !showTech;
    return;
  }
  if (policyButtonHitTest(sx, sy)) {
    showPolicy = !showPolicy;
    return;
  }
  if (divineButtonHitTest(sx, sy)) {
    showDivine = !showDivine;
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
      else if (hit.kind === "autoToggle") {
        policy.research = !policy.research;
        addMessage(policy.research
          ? "🔄 Oto-araştırma açıldı: bilgi yettikçe kabile kendi ilerler"
          : "Oto-araştırma kapatıldı: bilgi birikecek, dilediğini elle araştır");
      }
      else if (hit.kind === "buy") {
        if (!buyTech(hit.id)) {
          addMessage("Yetersiz bilgi!");
        } else {
          if (hit.id === "humanity") {
            // Tanrı inancı: yaşayan herkese kalıcı +10 moral
            for (const v of villagers) v.changeMorale(10, "Tanrı inancı");
          }
          celebrateTech(hit.id);
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

  // defter paneli
  if (showJournal) {
    const hit = journalPanelHitTest(sx, sy);
    if (hit) {
      if (hit === "close") showJournal = false;
      return;
    }
  }

  // ilahî güçler paneli
  if (showDivine) {
    const hit = divinePanelHitTest(sx, sy);
    if (hit) {
      if (hit.kind === "close") showDivine = false;
      else if (hit.kind === "cast") castDivinePower(hit.id);
      return;
    }
  }

  // otomasyon (politika) paneli
  if (showPolicy) {
    const hit = policyPanelHitTest(sx, sy);
    if (hit) {
      if (hit.kind === "close") showPolicy = false;
      else if (hit.kind === "toggle") {
        policy[hit.key] = !policy[hit.key];
        const info = POLICY_INFO.find((p) => p.key === hit.key);
        addMessage(`${info?.name}: ${policy[hit.key] ? "AÇIK" : "KAPALI"}`);
      }
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
        // isme tıkla: profili aç ve kamerayı köylüye kilitle (manuel pan'a dek izler)
        const v = villagers[hit.index];
        selectedVillager = v;
        followVillager = v;
        dangerFollow = null;
        addMessage(`🎥 ${v.fullName} takip ediliyor (kamerayı oynatınca biter)`);
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

  // hayvan paneli açıkken
  if (selectedAnimal) {
    const hit = animalPanelHitTest(sx, sy);
    if (hit) {
      const a = selectedAnimal;
      if (hit === "close") selectedAnimal = null;
      else if (hit === "attack") {
        a.hunted = !a.hunted;
        if (a.hunted) a.tameMark = false;
        else a.claimed = false;
      } else if (hit === "tame") {
        a.tameMark = !a.tameMark;
        if (a.tameMark) {
          a.hunted = false;
          addMessage(`${a.def.name} evcilleştirme için işaretlendi`);
        } else {
          a.claimed = false;
        }
      }
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
      } else if (hit === "farmCow" || hit === "farmChicken" || hit === "farmSheep" || hit === "farmPig") {
        const map = { farmCow: "cow", farmChicken: "chicken", farmSheep: "sheep", farmPig: "pig" } as const;
        selectedBuilding.farmType = map[hit];
        addMessage(`Çiftlik türü seçildi: ${ANIMAL_DEFS[map[hit]].name}`);
      } else if (hit === "torch") {
        if (resources.wood >= TORCH_ATTACH_COST) {
          resources.wood -= TORCH_ATTACH_COST;
          selectedBuilding.hasTorch = true;
          addMessage(`${selectedBuilding.def.name} binasına meşale takıldı`);
        } else {
          addMessage(`Yetersiz dal! (meşale: ${TORCH_ATTACH_COST} dal)`);
        }
      } else if (hit === "fuel") {
        selectedBuilding.fueled = !selectedBuilding.fueled;
        addMessage(
          selectedBuilding.fueled
            ? "🔥 Ocak açıldı: kışın evde dal yakılacak"
            : "Ocak kapatıldı"
        );
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

  if (selected === BuildingType.Road) {
    // taş yol: bina değil karo döşenir (1 taş)
    const t = world.get(tx, ty);
    const paveable = t === Tile.Grass || t === Tile.Dirt || t === Tile.Sand;
    if (!paveable || world.blocked.has(world.index(tx, ty))) {
      addMessage("Yol buraya döşenemez!");
      return;
    }
    if (resources.stone < 1) {
      addMessage("Yetersiz taş! (yol: 1 taş/karo)");
      return;
    }
    resources.stone -= 1;
    world.set(tx, ty, Tile.Road);
    return;
  }

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
    if (selected === BuildingType.Barn && !pastureClearOfWater(tx, ty)) {
      addMessage("Çiftlik ağılı açık kara ister — su/harita kenarına kurulamaz!");
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
    const wa = animalAt(wx, wy);
    if (wa) {
      // hayvan paneli açılır: ad + saldır/evcilleştir düğmeleri
      selectedAnimal = wa;
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
  if (showDivine) { showDivine = false; return true; }
  if (showPolicy) { showPolicy = false; return true; }
  if (showTech) { showTech = false; return true; }
  if (showJournal) { showJournal = false; return true; }
  if (showPeople) { showPeople = false; return true; }
  if (showPopulation) { showPopulation = false; return true; }
  if (selectedAnimal) { selectedAnimal = null; return true; }
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
    [showJournal, "journal"],
    [showPeople, "people"],
    [showPopulation, "pop"],
    [!!selectedAnimal, "animal"],
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
    if (selecting.id === "tech") {
      // tam ekran teknoloji ağacı: sürüklemek yatay kaydırır
      techScrollBy(-(sx - selecting.lx));
    } else {
      dragPanelBy(selecting.id, sx - selecting.lx, sy - selecting.ly, canvas.width, canvas.height);
    }
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
  if (showTech) {
    techScrollBy(deltaY * 0.9);
    return true;
  }
  if (showJournal && isOverJournalPanel(sx, sy)) {
    journalScrollBy(deltaY > 0 ? 1 : -1);
    return true;
  }
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
  if (e.code === "KeyS" && (e.ctrlKey || e.metaKey)) {
    // Ctrl/Cmd+S: hızlı kayıt (tarayıcının "sayfayı kaydet" iletişimini bastır)
    e.preventDefault();
    if (gameActive()) saveGame();
    return;
  }
  if (e.code === "Escape") {
    if (menuOverlay) {
      // menü açıkken Esc: kapat ve devam et
      closeMenu();
      paused = false;
    } else if (!closeTopmost()) {
      showPauseMenu(); // kapatacak panel kalmadı: menü
    }
  } else if (e.code === "Space") {
    e.preventDefault();
    paused = !paused;
  } else if (e.code === "Slash") {
    // ? : kısayol & yardım ekranı (başka bir menü açık değilken)
    if (!menuOverlay) showHelp();
  } else if (e.code === "KeyX") {
    gameSpeed = gameSpeed === 1 ? 2 : gameSpeed === 2 ? 4 : gameSpeed === 4 ? 8 : gameSpeed === 8 ? 16 : 1;
  } else if (e.code === "KeyN") {
    showPopulation = !showPopulation;
  } else if (e.code === "KeyM") {
    showPeople = !showPeople;
  } else if (e.code === "KeyB") {
    showJournal = !showJournal;
  } else if (e.code === "KeyT") {
    showTech = !showTech;
  } else if (e.code === "KeyP") {
    showPolicy = !showPolicy;
  } else if (e.code === "KeyY") {
    showDivine = !showDivine;
  } else if (e.code === "KeyF") {
    const visibleFilters = MARK_FILTERS.filter(
      (f) => f.id !== "stone" || hasTech("hardobjects")
    );
    const i = visibleFilters.findIndex((f) => f.id === markFilter);
    markFilter = visibleFilters[(i + 1) % visibleFilters.length].id;
  } else if (
    e.code === "KeyG" || e.code === "KeyH" || e.code === "KeyJ" ||
    e.code === "KeyK" || e.code === "KeyL"
  ) {
    // işaret filtreleri: yan yana tuşlar (G H J K L)
    const f = MARK_FILTERS.find((f) => f.key === e.code.slice(3));
    if (f && (f.id !== "stone" || hasTech("hardobjects"))) {
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

// Sekme kapanırken / arka plana atılırken son durumu sessizce kaydet —
// kazara ilerleme kaybını önler. (visibilitychange mobil/sekme-değişiminde,
// pagehide kapanış/yenilemede en güvenilir tetikleyicidir.)
function saveOnExit(): void {
  if (gameActive()) saveGame(true);
}
window.addEventListener("pagehide", saveOnExit);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") saveOnExit();
});

// ---- Simülasyon adımı ----

// ---- Konutlar ve doğumlar ----

const BIRTH_CHANCE = 0.55; // her gün dönümünde, boş yeri olan ev başına
let lastDayCount = 0;
let homeTimer = 0;
let homelessCount = 0;
let homelessWarnTimer = 0;
let knowledgeRate = 0; // tahmini bilgi/sn (oto-araştırma ETA için)
let kPrevKnowledge = 0;

// Oto-araştırma: açıkken bilgi yettikçe en ucuz uygun araştırmayı kendi yapar
// (oyuncu kapatıp bilgi biriktirebilir ya da dilediğini elle araştırabilir)
// Otomatik alet siparişi: balta (oduncular) ve mızrak (avcılar) stoğu düşükse
// atölyeye kendiliğinden sipariş açılır
function autoToolsTick(): void {
  if (!policy.tools) return;
  const shop = buildings.find((b) => b.type === BuildingType.ToolWorkshop && b.done);
  if (!shop) return;
  const woodcutters = villagers.filter(
    (v) => v.assignment.kind === "building" && v.assignment.building.type === BuildingType.Woodcutter
  ).length;
  if (woodcutters > 0) {
    const axesOut = villagers.filter((v) => v.hasAxe).length + shop.toolStock;
    const deficit = woodcutters - axesOut;
    if (deficit > 0) shop.orders = Math.max(shop.orders, deficit);
  }
  if (hasTech("kan")) {
    const hunters = villagers.filter(
      (v) => v.assignment.kind === "building" && v.assignment.building.type === BuildingType.HunterLodge
    );
    if (hunters.length > 0) {
      const carried = hunters.reduce((s, h) => s + h.spears, 0);
      const desired = hunters.length * 5;
      const have = carried + shop.spearStock;
      if (have < desired) shop.spearOrders = Math.max(shop.spearOrders, Math.min(desired - have, 10));
    }
  }
}

// Otomatik işçi dağıtımı: kadrosu eksik binalar boştaki işçilerle azami kadroya
// dek doldurulur (yiyecek/bilgi öncelikli). Esneklik için birkaç işçi boşta kalır.
// (Elle yönetmek istersen ⚙ Otomasyon panelinden kapat.)
function staffPriority(b: Building): number {
  switch (b.type) {
    case BuildingType.Gatherer:
    case BuildingType.Fisher: return 0; // yiyecek üreten binalar önce
    case BuildingType.HunterLodge: return 1;
    case BuildingType.Nursery: return 2;
    case BuildingType.Temple: return 3; // bilgi
    default: return 4;
  }
}
function autoStaffTick(): void {
  if (!policy.staff) return;
  const idle = villagers.filter(
    (v) => v.canWork && !v.caringBaby && !v.dead && v.assignment.kind === "laborer"
  );
  // nüfusa göre esnek rezerv: küçük kolonide 1, büyükte 2-3 boşta (toplama için)
  const reserve = Math.min(3, Math.max(1, Math.floor(villagers.length / 8)));
  let free = idle.length;
  if (free <= reserve) return;
  const targets = buildings
    .filter((b) => b.done && b.def.maxWorkers > 0 && b.type !== BuildingType.Camp && workersOf(b) < b.def.maxWorkers)
    .sort((a, b) => staffPriority(a) - staffPriority(b));
  for (const b of targets) {
    while (workersOf(b) < b.def.maxWorkers && free > reserve) {
      const v = idle.pop();
      if (!v) return;
      v.assignment = { kind: "building", building: b };
      free--;
    }
  }
}

// Otomatik inşaat: koloni ihtiyaç duydukça uygun bir binayı kampın yakınına diker.
// Aynı anda en çok 2 şantiye; bittikçe yenisi planlanır. Dalı tamamen tüketmez.
function bCount(t: BuildingType): number {
  return buildings.filter((b) => b.type === t && !b.removed).length;
}
// Otomatik yerleştirme alanı: ayak izi + 1 karo kenar boşluğu tamamen açık
// olmalı (binalar birbirine yapışmasın, köylüler kapana kısılmasın) ve
// üstünde köylü durmamalı.
function autoPlaceClear(tx: number, ty: number, size: number): boolean {
  for (let dy = -1; dy <= size; dy++) {
    for (let dx = -1; dx <= size; dx++) {
      const x = tx + dx, y = ty + dy;
      if (!world.inBounds(x, y)) return false;
      const border = dx < 0 || dy < 0 || dx >= size || dy >= size;
      if (border) {
        // kenar: yürünebilir bir koridor kalsın (su/ağaç/bina olmaz)
        if (!world.walkableAt(x, y)) return false;
      }
    }
  }
  // ayak izinde köylü var mı?
  for (const v of villagers) {
    if (v.tileX >= tx && v.tileX < tx + size && v.tileY >= ty && v.tileY < ty + size) return false;
  }
  return true;
}
function tryAutoPlace(type: BuildingType): boolean {
  const def = BUILDING_DEFS[type];
  const size = def.size;
  for (let r = 3; r <= 22; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = campCenter.x + dx, y = campCenter.y + dy;
        if (!canPlace(world, x, y, size)) continue;
        if (!autoPlaceClear(x, y, size)) continue;
        if (def.needsWater && !world.hasAdjacentWater(x, y, size)) continue;
        if (type === BuildingType.Barn && !pastureClearOfWater(x, y)) continue;
        const b = new Building(type, x, y);
        placeBuilding(world, b);
        buildings.push(b);
        return true;
      }
    }
  }
  return false;
}
const AUTO_BUILD_BUFFER = 6; // bu kadar dal her zaman elde kalsın
function autoBuildTick(): void {
  if (!policy.build) return;
  const pending = buildings.filter((b) => !b.done && !b.removed).length;
  if (pending >= 2) return; // şantiyeler bitsin, sonra yenisi
  const pop = villagers.length;
  const wishlist: BuildingType[] = [];
  // 1) konut: nüfus için yeterli yatak yoksa
  if (pop > bCount(BuildingType.House) * HOUSE_CAPACITY) wishlist.push(BuildingType.House);
  // 2) tapınak: bilgi/araştırma motoru — koloni büyüdükçe daha çok tapınak
  if (bCount(BuildingType.Temple) < Math.min(2, 1 + Math.floor(pop / 20))) wishlist.push(BuildingType.Temple);
  // 3) yemek: toplayıcı (kilidi açıksa), nüfusa göre 1-2 tane
  if (isBuildingUnlocked(BuildingType.Gatherer) && bCount(BuildingType.Gatherer) < Math.min(2, Math.ceil(pop / 8))) wishlist.push(BuildingType.Gatherer);
  // 4) balıkçı (su kenarı)
  if (isBuildingUnlocked(BuildingType.Fisher) && bCount(BuildingType.Fisher) < 1) wishlist.push(BuildingType.Fisher);
  // 5) atölye
  if (isBuildingUnlocked(BuildingType.ToolWorkshop) && bCount(BuildingType.ToolWorkshop) < 1) wishlist.push(BuildingType.ToolWorkshop);
  // 6) avcı kulübesi
  if (isBuildingUnlocked(BuildingType.HunterLodge) && bCount(BuildingType.HunterLodge) < 1) wishlist.push(BuildingType.HunterLodge);
  // 7) bakımevi (bebek varsa)
  if (isBuildingUnlocked(BuildingType.Nursery) && bCount(BuildingType.Nursery) < 1 && villagers.some((v) => v.baby)) wishlist.push(BuildingType.Nursery);
  // 8) depo (nüfus arttıkça)
  if (isBuildingUnlocked(BuildingType.Depot) && bCount(BuildingType.Depot) < Math.floor(pop / 12)) wishlist.push(BuildingType.Depot);
  // 9) çiftlik
  if (isBuildingUnlocked(BuildingType.Barn) && bCount(BuildingType.Barn) < 1) wishlist.push(BuildingType.Barn);

  for (const type of wishlist) {
    const def = BUILDING_DEFS[type];
    if (resources.wood < def.cost + AUTO_BUILD_BUFFER) continue;
    if (tryAutoPlace(type)) {
      resources.wood -= def.cost;
      addMessage(`🏗 ${def.name} şantiyesi kuruldu (otomatik)`);
      return; // bir tur bir bina yeter
    }
  }
}

// ---- İlahî güçler: inanç harcayarak kolonyi yönlendir ----
function castDivinePower(id: DivinePowerId): boolean {
  const power = DIVINE_POWERS.find((p) => p.id === id);
  if (!power) return false;
  if ((divineCooldown[id] ?? 0) > 0) {
    addMessage(`${power.icon} ${power.name} henüz hazır değil (${Math.ceil(divineCooldown[id])} sn)`);
    return false;
  }
  if (resources.faith < power.cost) {
    addMessage(`İnanç yetersiz! (${power.name}: ${power.cost} inanç)`);
    return false;
  }
  const now = totalDays();
  let ok = true;
  switch (id) {
    case "prophet": {
      // en yüksek moralli yetişkin peygamber olur (halk ona kulak verir)
      const adults = villagers.filter((v) => v.canWork && !v.dead && !v.isProphet);
      if (adults.length === 0) { ok = false; break; }
      const p = adults.sort((a, b) => b.morale - a.morale)[0];
      p.prophetUntilDay = now + 2;
      p.changeMorale(30, "Peygamberlik");
      addMessage(`🙏 ${p.fullName} peygamber seçildi — halka ilham veriyor!`, "important");
      addJournal(`🙏 ${p.fullName} peygamber oldu`);
      addFloater(p.x, p.y - 20, "🙏 Peygamber!", "#ffe296");
      break;
    }
    case "wisdom":
      divine.wisdomUntilDay = now + 2;
      addMessage("📜 Kehanet: Bilgelik — 2 gün bilgi iki katı!", "important");
      break;
    case "bounty": {
      divine.bountyUntilDay = now + 2;
      // çevreye yemiş saç
      for (let i = 0; i < 14; i++) {
        const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 16;
        const x = Math.round(campCenter.x + Math.cos(a) * r);
        const y = Math.round(campCenter.y + Math.sin(a) * r);
        if (world.inBounds(x, y) && world.get(x, y) === Tile.Grass) world.set(x, y, Tile.Bush);
      }
      renderer.repaintAll();
      addMessage("🌾 Kehanet: Bereket — bolluk çağı, toprak cömert!", "important");
      break;
    }
    case "heal":
      for (const v of villagers) {
        if (v.dead) continue;
        v.hp = 100;
        v.sickUntilDay = -1;
        v.changeMorale(20, "İlahî şifa");
      }
      addMessage("✨ Mucize: Şifa — herkes iyileşti!", "important");
      addFloater(camera.x, camera.y, "✨ Şifa", "#8fd05e");
      break;
    case "shield":
      divine.shieldUntilDay = now + 1;
      addMessage("🛡️ Mucize: Koruma Kalkanı — yırtıcılar kaçıyor!", "important");
      break;
  }
  if (!ok) return false;
  resources.faith -= power.cost;
  divineCooldown[id] = power.cooldown;
  return true;
}

// Peygamber aurası: çevredeki köylülere moral yayar (main her adımda uygular)
function applyProphetAura(dt: number): void {
  const prophets = villagers.filter((v) => v.isProphet && !v.dead);
  if (prophets.length === 0) return;
  const R2 = (7 * TILE_SIZE) ** 2;
  for (const p of prophets) {
    for (const v of villagers) {
      if (v === p || v.dead) continue;
      const dx = v.x - p.x, dy = v.y - p.y;
      if (dx * dx + dy * dy <= R2) v.changeMorale(0.6 * dt, "Peygamber ilhamı");
    }
  }
}

function autoResearchTick(): void {
  if (!policy.research) return;
  const pick = cheapestAvailable();
  if (!pick || resources.knowledge < currentCost(pick)) return;
  if (buyTech(pick.id)) {
    if (pick.id === "humanity") for (const v of villagers) v.changeMorale(10, "Tanrı inancı");
    celebrateTech(pick.id);
  }
}

// Araştırma kutlaması: ekranın ortasında kısa süreli görkemli bant
let techCelebration: { tech: Tech; ttl: number; total: number } | null = null;
function celebrateTech(id: TechId): void {
  const tech = TECHS.find((t) => t.id === id);
  if (!tech) return;
  techCelebration = { tech, ttl: 3.4, total: 3.4 };
  sfxResearch(); // tech kendi çan arpejini çalar → mesajlar sessiz (çift ses olmasın)
  addMessage(`🔬 Araştırıldı: ${tech.name}!`, "important", { silent: true });
  if (tech.unlocks) addMessage(`✨ Açıldı: ${tech.unlocks}`, "important", { silent: true });
  addJournal(`🔬 Yeni araştırma: ${tech.name}${tech.unlocks ? ` — ${tech.unlocks}` : ""}`);
}

// Kutlama bandını çiz (ölçek-giriş, bekle, sön)
function drawTechCelebration(dt: number): void {
  if (!techCelebration) return;
  techCelebration.ttl -= dt;
  if (techCelebration.ttl <= 0) {
    techCelebration = null;
    return;
  }
  const { tech, ttl, total } = techCelebration;
  const w = canvas.width;
  const cxc = w / 2;
  const cyc = canvas.height * 0.26;
  const age = total - ttl;
  const inT = Math.min(1, age / 0.3); // giriş
  const outT = Math.min(1, ttl / 0.6); // çıkış
  const appear = Math.min(inT, outT);
  const scale = 0.7 + 0.3 * inT;
  ctx.save();
  ctx.globalAlpha = appear;
  ctx.translate(cxc, cyc);
  ctx.scale(scale, scale);

  // ışıltılı kart
  const bw = 420, bh = 96;
  ctx.fillStyle = "rgba(18, 14, 28, 0.95)";
  ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
  ctx.shadowColor = "rgba(176, 143, 224, 0.9)";
  ctx.shadowBlur = 24;
  ctx.strokeStyle = "#b08fe0";
  ctx.lineWidth = 2.5;
  ctx.strokeRect(-bw / 2 + 1, -bh / 2 + 1, bw - 2, bh - 2);
  ctx.shadowBlur = 0;

  // dönen ışık halkalı amblem
  const icx = -bw / 2 + 50;
  ctx.save();
  ctx.translate(icx, 0);
  ctx.rotate(age * 1.5);
  ctx.strokeStyle = "rgba(216, 192, 255, 0.7)";
  ctx.lineWidth = 2;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 26, Math.sin(a) * 26);
    ctx.lineTo(Math.cos(a) * 34, Math.sin(a) * 34);
    ctx.stroke();
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(icx, 0, 24, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(138, 108, 192, 0.5)";
  ctx.fill();
  ctx.font = "30px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(tech.icon, icx, 1);

  // metinler
  ctx.textAlign = "left";
  ctx.fillStyle = "#d8c0ff";
  ctx.font = "bold 13px monospace";
  ctx.fillText("🔬 ARAŞTIRMA TAMAMLANDI", icx + 40, -28);
  ctx.fillStyle = "#ffe296";
  ctx.font = "bold 20px monospace";
  ctx.fillText(tech.name, icx + 40, -4);
  if (tech.unlocks) {
    ctx.fillStyle = "#8fd05e";
    ctx.font = "13px monospace";
    ctx.fillText(`✨ ${tech.unlocks}`, icx + 40, 22);
  }
  ctx.restore();
}

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
// kalma şansı; bebek 4 günlük hamileliğin ardından 4. günün sabahı doğar.
// Büyüme erken hızlıdır; ev veya doğurgan kadın yetmezse kendiliğinden durur.
function nightlyConceptions(): void {
  const adults = villagers.filter((v) => v.canWork).length;
  if (adults < 2) return; // çoğalmak için en az 2 yetişkin
  // erken kabilede daha yüksek şans, nüfus büyüdükçe yavaşlar
  const pop = villagers.length;
  const boost = pop < 12 ? 1.6 : pop < 20 ? 1.15 : 0.7;
  const chance = Math.min(0.96, BIRTH_CHANCE * boost * (bountyActive() ? 1.8 : 1));
  for (const b of buildings) {
    if (!isHousing(b) || occupants(b) >= HOUSE_CAPACITY) continue;
    if (Math.random() > chance) continue;
    // bu evde doğurgan (gebe olmayan yetişkin kadın) yoksa atla:
    // kadın/ev sayısı yetersizse büyüme kendiliğinden durur
    const candidate = villagers.find(
      (v) => v.home === b && v.canWork && v.identity.female && !v.pregnant
    );
    if (!candidate) continue;
    candidate.pregnantSince = totalDays();
    addMessage(`🤰 ${candidate.fullName} hamile kaldı`, "important");
  }
}

// Hamileliği dolan kadınlar sabah doğurur; bebek annenin yanına doğar
function checkBirths(): void {
  for (const mom of villagers) {
    if (!mom.readyToGiveBirth) continue;
    // bebeğin doğacağı kare: çevrede yürünebilir en yakın yer; sıkışıksa
    // annenin bulunduğu kare (bebek hiçbir durumda kaybolmaz)
    let bx = mom.tileX;
    let by = mom.tileY;
    search: for (let r = 1; r <= 3; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = mom.tileX + dx;
          const y = mom.tileY + dy;
          if (world.walkableAt(x, y)) {
            bx = x;
            by = y;
            break search;
          }
        }
      }
    }
    const baby = new Villager(bx, by, true);
    baby.home = mom.home;
    baby.mother = mom;
    if (hasTech("humanity")) baby.changeMorale(10, "Tanrı inancı");
    villagers.push(baby);
    mom.giveBirth();
    addMessage(`👶 ${baby.fullName} doğdu! (annesi ${mom.fullName})`, "important");
    addFloater(mom.x, mom.y - 18, "+1 bebek", "#ffb0d0");
  }
}

// Sahipsiz köpekler bir avcıya bağlanır (avcı başına dengeli dağıtım)
function assignDogs(): void {
  const hunters = villagers.filter(
    (v) =>
      v.canWork &&
      v.assignment.kind === "building" &&
      v.assignment.building.type === BuildingType.HunterLodge
  );
  for (const a of animals) {
    if (a.type !== "dog" || a.dead) continue;
    const ownerValid =
      a.owner && !a.owner.dead &&
      a.owner.assignment.kind === "building" &&
      a.owner.assignment.building.type === BuildingType.HunterLodge;
    if (ownerValid) continue;
    a.owner = null;
    if (hunters.length === 0) continue;
    // en az köpeği olan avcıya ver
    let best: Villager | null = null;
    let bestCount = Infinity;
    for (const h of hunters) {
      const c = animals.filter((d) => d.type === "dog" && !d.dead && d.owner === h).length;
      if (c < bestCount) {
        bestCount = c;
        best = h;
      }
    }
    if (best) {
      a.owner = best;
      addMessage(`🐕 Köpek ${best.fullName} ile geziyor`);
    }
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
let followVillager: Villager | null = null; // İnsanlar panelinden tıklanan köylüyü kamera izler (manuel pan'a dek)

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
    // kamerayı yumuşakça tehlikedekine çek (tercih kapalıysa görüş kaymaz;
    // uyarı mesajı ve kırmızı ikaz halkası yine gösterilir)
    if (dangerCamEnabled) {
      const k = Math.min(1, dt * 4);
      camera.x += (dangerFollow.x - camera.x) * k;
      camera.y += (dangerFollow.y - camera.y) * k;
    }
    return;
  }
  if (dangerCooldown <= 0) {
    for (const v of villagers) {
      if (v.dead || v.state === "sleeping") continue;
      if (villagerInDanger(v)) {
        dangerFollow = v;
        followVillager = null; // tehlike manuel takibi devralır
        addMessage(`⚠ ${v.fullName} tehlikede — kamera takipte!`, "important");
        addJournal(`⚠ ${v.fullName} bir yırtıcıyla karşı karşıya!`);
        return;
      }
    }
  }
  // manuel takip: İnsanlar panelinden seçilen köylüyü yumuşakça izle
  if (followVillager) {
    if (followVillager.dead) {
      followVillager = null;
      return;
    }
    const k = Math.min(1, dt * 5);
    camera.x += (followVillager.x - camera.x) * k;
    camera.y += (followVillager.y - camera.y) * k;
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
  addMessage(`📨 ${v.fullName} sana bir ileti gönderiyor — üzerine tıklayıp yanıtla!`, "important");
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

// Yabaniler yalnız gün dönümünde değil, ara ara da türer
let wildSpawnTimer = 30;

function tickWildSpawns(dt: number): void {
  wildSpawnTimer -= dt;
  if (wildSpawnTimer > 0) return;
  wildSpawnTimer = 25 + Math.random() * 30;
  const wildCount = animals.filter((a) => a.wild && a.type !== "dog").length;
  if (wildCount < WILD_CAP) spawnWildAnimal();
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

// ---- Rastgele olaylar: oyunun ritmini kıran iyi/kötü sürprizler ----

let eventTimer = 0.9 * tuning.dayLength; // ilk olay 1. günün sonlarına doğru

// Kamp etrafında, verilen halka aralığında yürünebilir bir nokta bul
function spawnPointNear(minR: number, maxR: number): { x: number; y: number } | null {
  for (let attempt = 0; attempt < 80; attempt++) {
    const ang = Math.random() * Math.PI * 2;
    const r = minR + Math.random() * (maxR - minR);
    const x = Math.round(campCenter.x + Math.cos(ang) * r);
    const y = Math.round(campCenter.y + Math.sin(ang) * r);
    if (world.inBounds(x, y) && world.walkableAt(x, y)) return { x, y };
  }
  return null;
}

interface RandomEvent {
  id: string;
  weight: number;
  ok: () => boolean;
  run: () => boolean; // false dönerse (yer bulunamadı vb.) başka olay denenir
}

const RANDOM_EVENTS: RandomEvent[] = [
  {
    // Kurt sürüsü baskını: normal türemeden farklı olarak kampa yakın gelirler
    id: "kurt_baskini",
    weight: 3,
    ok: () => totalDays() >= difficulty.wolfDay,
    run: () => {
      const p = spawnPointNear(16, 24);
      if (!p) return false;
      const n = 2 + Math.floor(Math.random() * 2);
      for (let i = 0; i < n; i++) {
        // sürü bir arada doğar: küçük kaymalarla yan yana
        const ox = p.x + (i % 2);
        const oy = p.y + Math.floor(i / 2);
        const walkable = world.walkableAt(ox, oy);
        animals.push(new Animal("wolf", null, walkable ? ox : p.x, walkable ? oy : p.y));
      }
      addMessage(`🐺 Kurt sürüsü kampın kokusunu aldı! (${n} kurt yaklaşıyor)`);
      addJournal(`🐺 ${n} kurtluk bir sürü yerleşkeye sokuldu`);
      return true;
    },
  },
  {
    id: "ayi",
    weight: 1,
    ok: () => totalDays() >= difficulty.bearDay,
    run: () => {
      const p = spawnPointNear(18, 26);
      if (!p) return false;
      animals.push(new Animal("bear", null, p.x, p.y));
      addMessage("🐻 Aç bir ayı yerleşkenin çevresinde dolanıyor!");
      addJournal("🐻 Aç bir ayı yerleşke çevresinde görüldü");
      return true;
    },
  },
  {
    // Bereket: ilkbahar/yaz aylarında orman cömertleşir
    id: "bereket",
    weight: 2,
    ok: () => season() <= 1,
    run: () => {
      let bushes = 0;
      for (let attempt = 0; attempt < 60 && bushes < 4; attempt++) {
        const p = spawnPointNear(8, 22);
        if (!p || world.get(p.x, p.y) !== Tile.Grass) continue;
        world.set(p.x, p.y, Tile.Bush);
        bushes++;
      }
      for (let i = 0; i < 6; i++) trySpawnWildMushroom();
      if (bushes === 0) return false;
      addMessage("🌳 Orman cömert davrandı: yeni yemiş çalıları ve mantarlar bitti!");
      addJournal("🌳 Bereketli günler: orman yemiş ve mantar verdi");
      renderer.repaintAll();
      return true;
    },
  },
  {
    // Ayaz: kışın bir gün boyunca üşüme 2.5 kat keskin
    id: "ayaz",
    weight: 2.5,
    ok: () => season() === 3,
    run: () => {
      eventFlags.coldSnapUntilDay = totalDays() + 1;
      addMessage("🥶 Buz gibi bir ayaz çöktü — herkes ateşin başına, giysisi olan giyinsin!");
      addJournal("🥶 Ayaz bastırdı: gün boyu soğuk iki buçuk kat keskin");
      return true;
    },
  },
  {
    id: "hastalik",
    weight: 2,
    ok: () => villagers.filter((v) => v.canWork && !v.sick).length >= 5,
    run: () => {
      const adults = villagers.filter((v) => v.canWork && !v.sick);
      const v = adults[Math.floor(Math.random() * adults.length)];
      v.sickUntilDay = totalDays() + 1;
      v.changeMorale(-8, "Hastalık");
      addMessage(`🤒 ${v.fullName} hastalandı — bir gün boyunca halsiz çalışacak`);
      addJournal(`🤒 ${v.fullName} hastalandı`);
      return true;
    },
  },
  {
    id: "yildiz_yagmuru",
    weight: 1.5,
    ok: () => true,
    run: () => {
      for (const v of villagers) v.changeMorale(8, "Yıldız yağmuru");
      resources.knowledge += 3;
      addMessage("🌠 Gökten yıldızlar kaydı — kabile büyülendi! (+8 moral, +3 bilgi)");
      addJournal("🌠 Yıldız yağmuru kabileyi mest etti");
      return true;
    },
  },
  {
    // Göçmen: kalabalık hem güç hem boğaz demektir
    id: "gocmen",
    weight: 1.5,
    ok: () => villagers.length > 0 && villagers.length < 40,
    run: () => {
      const p = spawnPointNear(10, 16);
      if (!p) return false;
      const v = new Villager(p.x, p.y);
      if (hasTech("humanity")) v.changeMorale(10, "Tanrı inancı");
      villagers.push(v);
      addMessage(`🧍 Gezgin ${v.fullName} kampa sığındı — kabileye katıldı!`, "important");
      addJournal(`🧍 Gezgin ${v.fullName} kabileye katıldı`);
      return true;
    },
  },
];

// Uygun olaylardan ağırlıklı seçim yap; seçilen olay başarısız olursa diğerlerini dene
function rollRandomEvent(): void {
  const pool = RANDOM_EVENTS.filter((e) => e.ok());
  while (pool.length > 0) {
    let total = 0;
    for (const e of pool) total += e.weight;
    let r = Math.random() * total;
    let pick = pool[0];
    for (const e of pool) {
      r -= e.weight;
      if (r <= 0) {
        pick = e;
        break;
      }
    }
    if (pick.run()) return;
    pool.splice(pool.indexOf(pick), 1);
  }
}

function tickRandomEvents(dt: number): void {
  eventTimer -= dt;
  if (eventTimer > 0) return;
  // gece olay patlatma: sabaha ertele
  const f = dayFrac();
  if (f < 0.12 || f > 0.85) {
    eventTimer = 0.05 * tuning.dayLength;
    return;
  }
  eventTimer = (0.8 + Math.random() * 0.9) * tuning.dayLength; // kabaca her 1-1.5 günde bir
  rollRandomEvent();
}

function step(dt: number) {
  updateTime(dt);
  world.update(dt);
  updateEffects(dt);
  checkStorageFull();
  checkMilestones();

  // hedef zinciri: tamamlananı kutla, sıradakini duyur
  const doneGoal = tickGoals({ world, villagers, buildings, animals });
  if (doneGoal) {
    addMessage(`🎯 Hedef tamamlandı: ${doneGoal.title} (+${doneGoal.reward} bilgi)`);
    addJournal(`🎯 Hedef tamamlandı: ${doneGoal.title} (+${doneGoal.reward} bilgi)`);
    const next = currentGoal();
    if (next) addMessage(`🎯 Yeni hedef: ${next.title}`);
    else addMessage("🏆 Tüm hedefler tamamlandı — kabilenin kaderi artık senin ellerinde!");
  }

  schedulePleading(dt);
  updateScreams(dt);

  tickWildSpawns(dt);
  tickRandomEvents(dt);

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
    const wildCount = animals.filter((a) => a.wild && a.type !== "dog").length;
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
    // bilgi kazanç hızını (bilgi/sn) tahmin et: yalnız artış olan saniyeleri say
    const dk = resources.knowledge - kPrevKnowledge;
    if (dk > 0) knowledgeRate = knowledgeRate * 0.6 + dk * 0.4;
    kPrevKnowledge = resources.knowledge;
    assignHomes();
    assignChildcare();
    assignDogs();
    rebuildPastures();
    // ayin verimi rahip sayısıyla üstel artar (toplam birikim ~ rahip²/3)
    const priests = villagers.filter(
      (v) => v.assignment.kind === "building" && v.assignment.building.type === BuildingType.Temple
    ).length;
    worshipState.yield = worshipYieldFor(priests) * (wisdomActive() ? 2 : 1);
    autoResearchTick();
    autoBuildTick();
    autoToolsTick();
    autoStaffTick();
  }

  // evsiz uyarısı: ara ara hatırlat (ev yapımına teşvik)
  homelessCount = villagers.filter((v) => !v.home && !v.baby).length;
  homelessWarnTimer -= dt;
  if (homelessCount > 0 && homelessWarnTimer <= 0) {
    homelessWarnTimer = 12;
    addMessage(`⚠ ${homelessCount} köylü evsiz — yeni ev yapın!`, "important");
  }

  tickHouseFuel(dt);
  for (const v of villagers) v.update(dt, world, buildings, animals);
  applyProphetAura(dt);
  for (const id in divineCooldown) if (divineCooldown[id] > 0) divineCooldown[id] -= dt;
  updateDangerCamera(dt);

  // hayvanlar: dolanma, otlama, açlık; yırtıcılar insan kovalar
  for (const a of animals) a.update(dt, world, villagers);
  for (let i = animals.length - 1; i >= 0; i--) {
    const a = animals[i];
    if (!a.dead) continue;
    if (!a.slaughtered && !a.eatenByPredator && a.barn) {
      addMessage(`🐄 Bir ${ANIMAL_DEFS[a.type].name.toLowerCase()} açlıktan telef oldu!`);
    }
    animals.splice(i, 1);
  }

  // çiftliklerde üreme ve kapasite kesimi
  tickBarns(dt);

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
      const deathText =
        v.deathCause === "predator"
          ? `💀 ${v.fullName} yırtıcı saldırısında can verdi!`
          : `💀 ${v.fullName} açlıktan öldü!`;
      addMessage(deathText, "important");
      addJournal(deathText);
      lastDeathCause = v.deathCause; // oyun sonu perdesi için sebebi anımsa
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
      } else if (b.type === BuildingType.Splitter) {
        addMessage("⚠ Kırıcıda işlenecek odun yok! (baltayla ağaç kestirin)");
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
        addMessage(`Depo tamamlandı: ürün başına sınır +${DEPOT_CAP_BONUS}`);
      } else {
        addMessage(`${def.name} tamamlandı`);
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
  hile.olay()             rastgele olay tetikle; hile.olay("kurt_baskini") belirli olay
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
    celebrateTech(id);
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
  // Test/hızlı kurulum: kamp yanına hazır çiftlik kur ve N hayvan koy
  ciftlik(type: AnimalType = "cow", n = 2): void {
    let barn = buildings.find((b) => b.type === BuildingType.Barn && b.farmType === type);
    if (!barn) {
      for (let r = 3; r <= 8 && !barn; r++) {
        for (let dy = -r; dy <= r && !barn; dy++) {
          for (let dx = -r; dx <= r && !barn; dx++) {
            const x = campCenter.x + dx, y = campCenter.y + dy;
            if (canPlace(world, x, y, 2)) {
              const b = new Building(BuildingType.Barn, x, y);
              b.progress = b.def.buildTime;
              b.effectApplied = true;
              b.farmType = type;
              b.breedTimer = BREED_INTERVAL;
              placeBuilding(world, b);
              buildings.push(b);
              barn = b;
            }
          }
        }
      }
    }
    if (!barn) { addMessage("Hile: çiftliğe yer bulunamadı"); return; }
    for (let i = 0; i < n; i++) {
      const a = new Animal(type, barn, b2t(barn.centerX), b2t(barn.centerY));
      a.female = i % 2 === 0; // dişi/erkek dönüşümlü
      animals.push(a);
    }
    addMessage(`Hile: ${ANIMAL_DEFS[type].name} çiftliği + ${n} hayvan`);
  },
  gun(n = 1): void {
    gameTime.total += n * tuning.dayLength;
  },
  hiz(n = 1): void {
    if ([1, 2, 4, 8, 16].includes(n)) gameSpeed = n;
  },
  olay(id?: string): void {
    if (id) {
      const e = RANDOM_EVENTS.find((e) => e.id === id);
      if (!e) {
        addMessage(`Hile: olay yok. Olaylar: ${RANDOM_EVENTS.map((e) => e.id).join(", ")}`);
        return;
      }
      if (!e.run()) addMessage("Hile: olay tetiklenemedi (koşul/yer bulunamadı)");
      return;
    }
    rollRandomEvent();
  },
};

// tuning: konsoldan canlı ayar (__game.tuning.dayLength / timeScale / moveSpeed)
window.__game = { world, villagers, buildings, animals, camera, resources, gameTime, tuning, screams, hile, worship: worshipState, goals: { state: goalState, current: currentGoal }, get follow() { return followVillager ? followVillager.fullName : null; }, policy, divine, divineCooldown };
(window as unknown as { hile: typeof hile }).hile = hile;
console.info(
  "%cBanisher debug: konsola hile.yardim() yaz",
  "color:#8fd05e;font-weight:bold"
);

showMainMenu();

// ---- Kıtlık (erzak) erken uyarısı ----
// Hayatta kalma oyununda erzağın bittiğini ancak köylüler ölmeye başlayınca
// fark etmek geç oluyor. Bu uyarı, kişi başına yiyecek kritiğe inince oyuncuyu
// önceden uyarır; kötüleşen geçişte anında, sürerse ~20 sn'de bir hatırlatır.
const FOOD_LOW_PER_CAP = 3; // kişi başı bu kadar yiyecekten az kalınca "azalıyor"
let famineLevel = 0; // 0 yeterli · 1 azalıyor · 2 tükendi
let famineWarnCooldown = 0; // gerçek-saniye hatırlatma sayacı
function tickFamineWarning(dt: number): void {
  const pop = villagers.length;
  if (pop === 0) {
    famineLevel = 0;
    return;
  }
  famineWarnCooldown -= dt;
  const food = foodTotal();
  const level = food === 0 ? 2 : food < pop * FOOD_LOW_PER_CAP ? 1 : 0;
  if (level > famineLevel || (level >= 1 && famineWarnCooldown <= 0)) {
    addMessage(
      level === 2
        ? "💀 Erzak tükendi! Köy açlıkla yüz yüze"
        : "⚠ Erzak azalıyor — yeni yiyecek kaynağı bul!",
      "important"
    );
    famineWarnCooldown = 20;
  }
  if (level === 0) famineWarnCooldown = 0; // toparlanınca sonraki düşüş anında uyarsın
  famineLevel = level;
}

// ---- Düşük moral uyarısı ----
// Moral iş hızını belirler (0 moral = yarı hız). Ortalama moral kritiğe inince
// koloni yavaşlar ve kısır döngüye girer; oyuncu çoğu zaman bunu fark etmez.
// Histerezis (LOW/OK) ile titremeyi önler; sürerse ~25 sn'de bir hatırlatır.
const MORALE_LOW = 12; // çalışan ortalaması bunun altına inince uyar
const MORALE_OK = 16; // bunun üstüne çıkınca uyarı durumu temizlenir
let moraleWarned = false;
let moraleWarnCooldown = 0;
function tickMoraleWarning(dt: number): void {
  const workers = villagers.filter((v) => v.canWork && !v.dead);
  if (workers.length === 0) {
    moraleWarned = false;
    return;
  }
  const avg = workers.reduce((s, v) => s + v.morale, 0) / workers.length;
  moraleWarnCooldown -= dt;
  if (avg < MORALE_LOW && (!moraleWarned || moraleWarnCooldown <= 0)) {
    moraleWarned = true;
    moraleWarnCooldown = 25;
    addMessage(
      "😟 Moral düşük — köylüler yavaş çalışıyor (ev, ateş başı ve tanrı inancı moral yükseltir)",
      "important"
    );
  } else if (avg >= MORALE_OK) {
    moraleWarned = false;
  }
}

let last = performance.now();
let accumulator = 0;
let autosaveTimer = 0; // gerçek-zaman sayacı (otomatik kayıt için)
let gameOverShown = false; // oyun sonu perdesi bir kez gösterilsin
let lastDeathCause: "hunger" | "predator" | null = null; // kolonyi bitiren son ölümün sebebi

function frame(now: number) {
  const elapsed = Math.min((now - last) / 1000, 0.25);
  last = now;

  // kamera ve mesaj zamanlayıcıları duraklatmadan etkilenmez
  const camX0 = camera.x;
  const camY0 = camera.y;
  input.update(elapsed);
  if ((dangerFollow || followVillager) && (camera.x !== camX0 || camera.y !== camY0)) {
    // oyuncu kamerayı eline aldı: her türlü takibi bırak
    dangerFollow = null;
    followVillager = null;
    dangerCooldown = 10;
  }
  updateMessages(elapsed);

  // Otomatik kayıt: gerçek-zamanda işler (duraklatılsa bile), yalnız aktif
  // oyunda. tuning.autosaveSeconds = 0 ise devre dışı.
  if (gameActive() && tuning.autosaveSeconds > 0) {
    autosaveTimer += elapsed;
    if (autosaveTimer >= tuning.autosaveSeconds) {
      autosaveTimer = 0;
      saveGame(true);
    }
  } else {
    autosaveTimer = 0;
  }

  // kıtlık ve düşük moral uyarıları: yalnız oyun ilerlerken
  if (gameActive() && !paused) {
    tickFamineWarning(elapsed);
    tickMoraleWarning(elapsed);
  }

  // oyun sonu: son köylü de göçtüyse perdeyi bir kez göster (menü açık değilken)
  if (villagers.length === 0 && !gameOverShown && !menuOverlay) {
    gameOverShown = true;
    showGameOver();
  }

  // koloni yok olduysa simülasyon durur (oyun sonu perdesi gösterilir)
  accumulator += elapsed * (paused || villagers.length === 0 ? 0 : gameSpeed);
  // yüksek hızda kare başına daha fazla adım gerekir
  let steps = 0;
  while (accumulator >= FIXED_DT && steps < 16) {
    step(FIXED_DT);
    accumulator -= FIXED_DT;
    steps++;
  }

  // ses: dinleyici kamerada; ateş çıtırtısı en yakın ateşe göre
  setListener(camera.x, camera.y);
  let fireDist = Infinity;
  for (const b of buildings) {
    if (!b.done) continue;
    if (!b.hasTorch && !b.burning && b.type !== BuildingType.Camp) continue;
    const d = Math.hypot(b.centerX - camera.x, b.centerY - camera.y);
    if (d < fireDist) fireDist = d;
  }
  setFireProximity(fireDist);

  const hover = camera.screenToWorld(input.mouseX, input.mouseY, canvas.width, canvas.height);
  const hoverTile = { x: Math.floor(hover.x / TILE_SIZE), y: Math.floor(hover.y / TILE_SIZE) };
  const hoverValid = world.inBounds(hoverTile.x, hoverTile.y);
  const overToolbar = isOverToolbar(input.mouseY, canvas.height);

  let ghost: Ghost | null = null;
  let ghostCost = 0;
  let ghostAffordable = true;
  if (selected !== null && hoverValid && !overToolbar) {
    const def = BUILDING_DEFS[selected];
    const size = def.size;
    const gx = Math.min(Math.max(hoverTile.x, 0), MAP_W - size);
    const gy = Math.min(Math.max(hoverTile.y, 0), MAP_H - size);
    const valid =
      canPlace(world, gx, gy, size) &&
      (!def.needsWater || world.hasAdjacentWater(gx, gy, size)) &&
      (selected !== BuildingType.Barn || pastureClearOfWater(gx, gy));
    ghost = { type: selected, tileX: gx, tileY: gy, size, valid };
    ghostCost = def.cost;
    ghostAffordable = resources.wood >= def.cost;
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
  // seçili hayvan: beyaz halka (ölürse panel kapanır)
  // bina hayaletinin üstünde odun maliyeti — yetersizse kırmızı (tıklamadan
  // önce görünür; "Yetersiz odun!" sürprizini önler)
  if (ghost && ghostCost > 0) {
    const cx = (ghost.tileX + ghost.size / 2) * TILE_SIZE;
    const topY = ghost.tileY * TILE_SIZE;
    const sx = (cx - camera.x) * camera.zoom + canvas.width / 2;
    const sy = (topY - camera.y) * camera.zoom + canvas.height / 2;
    const label = `🪵 ${ghostCost}${ghostAffordable ? "" : "  yetersiz"}`;
    ctx.font = "bold 12px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    const tw = ctx.measureText(label).width + 12;
    const ly = Math.max(28, sy - 8);
    ctx.fillStyle = "rgba(10, 12, 16, 0.85)";
    ctx.fillRect(sx - tw / 2, ly - 14, tw, 18);
    ctx.strokeStyle = ghostAffordable ? "rgba(160, 240, 180, 0.7)" : "rgba(240, 110, 110, 0.85)";
    ctx.strokeRect(sx - tw / 2 + 0.5, ly - 13.5, tw - 1, 17);
    ctx.fillStyle = ghostAffordable ? "#d8f0c0" : "#ff9a9a";
    ctx.fillText(label, sx, ly - 1);
    ctx.textAlign = "left";
  }

  if (selectedAnimal) {
    if (selectedAnimal.dead) selectedAnimal = null;
    else {
      const sx2 = (selectedAnimal.x - camera.x) * camera.zoom + canvas.width / 2;
      const sy2 = (selectedAnimal.y - camera.y) * camera.zoom + canvas.height / 2;
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(sx2, sy2 + 1 * camera.zoom, 5.5 * camera.zoom, 2.6 * camera.zoom, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

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
  drawHud(ctx, villagers.length, selected, paused, gameSpeed, homelessCount, knowledgeRate);
  if (villagers.length > 0) drawMarkFilters(ctx, markFilter);
  let taskListY = 42;
  if (villagers.length > 0) {
    taskListY += drawGoalCard(ctx, { world, villagers, buildings, animals });
    drawTaskList(ctx, getTaskCounts(), taskListY);
  }

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
    if (selectedBuilding) drawBuildingPanel(ctx, selectedBuilding, world, villagers, animals);
    if (showPopulation) drawPopulationPanel(ctx, villagers, buildings);
    if (showPeople) drawPeoplePanel(ctx, villagers);
    if (showJournal) drawJournalPanel(ctx);
    if (showPolicy) drawPolicyPanel(ctx);
    if (showDivine) drawDivinePanel(ctx);
    if (selectedAnimal) drawAnimalPanel(ctx, selectedAnimal, canTameAnimal(selectedAnimal));
    if (showTech) drawTechPanel(ctx, policy.research);
  }

  // araç çubuğunda fareyle gelinen binanın ipucu (tam ekran tech açıkken değil)
  if (villagers.length > 0 && !showTech) {
    const hoverType = toolbarHitTest(input.mouseX, input.mouseY, canvas.width, canvas.height);
    if (hoverType !== null) drawToolbarTooltip(ctx, hoverType);
  }

  // araştırma kutlaması her şeyin üstünde
  drawTechCelebration(elapsed);

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
