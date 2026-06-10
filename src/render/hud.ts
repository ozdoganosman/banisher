import {
  BUILDING_DEFS,
  BuildingType,
  HOUSE_CAPACITY,
  isDepositPoint,
  isHousing,
  type Building,
} from "../sim/buildings";
import { ROLE_NAMES } from "../sim/buildings";
import {
  isFull,
  ITEM_INFO,
  ITEM_TYPES,
  resources,
  type ItemType,
} from "../sim/resources";
import { darkness, dateString, timeString } from "../sim/time";
import { assignmentLabel, type Villager } from "../sim/villager";
import type { World } from "../world/world";

export const TOOLBAR_HEIGHT = 64;

// ---- Minecraft tarzı eşya slotları ----

type IconItem = ItemType | "knowledge";

// Pikselli eşya ikonu (24x24 tasarım alanında, s boyutuna ölçeklenir)
function drawItemIcon(ctx: CanvasRenderingContext2D, item: IconItem, x: number, y: number, s: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s / 24, s / 24);
  switch (item) {
    case "wood":
      // kütük: gövde + halkalar
      ctx.fillStyle = "#8a5a2b";
      ctx.fillRect(3, 8, 18, 9);
      ctx.fillStyle = "#6b4422";
      ctx.fillRect(3, 11, 18, 2);
      ctx.fillStyle = "#c9a35a";
      ctx.fillRect(17, 9, 3, 7);
      ctx.fillStyle = "#8a5a2b";
      ctx.fillRect(18, 11, 1, 3);
      break;
    case "stone":
      ctx.fillStyle = "#9aa0a8";
      ctx.fillRect(5, 9, 14, 10);
      ctx.fillRect(8, 6, 9, 4);
      ctx.fillStyle = "#7c7f86";
      ctx.fillRect(8, 12, 5, 4);
      ctx.fillStyle = "#b8bdc4";
      ctx.fillRect(9, 7, 4, 2);
      break;
    case "berry":
      ctx.fillStyle = "#4a7a3a";
      ctx.fillRect(11, 3, 2, 5);
      ctx.fillRect(13, 5, 4, 2);
      ctx.fillStyle = "#d43f3f";
      ctx.beginPath();
      ctx.arc(12, 14, 6.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#f08080";
      ctx.fillRect(9, 11, 3, 2);
      break;
    case "mushroom":
      ctx.fillStyle = "#e8e0cc";
      ctx.fillRect(10, 13, 5, 8);
      ctx.fillStyle = "#c43030";
      ctx.fillRect(5, 8, 15, 6);
      ctx.fillRect(7, 5, 11, 3);
      ctx.fillStyle = "#f0e8e0";
      ctx.fillRect(9, 7, 3, 3);
      ctx.fillRect(15, 9, 2, 2);
      break;
    case "knowledge":
      ctx.fillStyle = "#b08fe0";
      ctx.fillRect(4, 5, 16, 15);
      ctx.fillStyle = "#8a6cc0";
      ctx.fillRect(11.3, 5, 1.4, 15);
      ctx.fillStyle = "#f0eaff";
      ctx.fillRect(6, 9, 4, 1.4);
      ctx.fillRect(14, 9, 4, 1.4);
      ctx.fillRect(6, 13, 4, 1.4);
      ctx.fillRect(14, 13, 4, 1.4);
      break;
  }
  ctx.restore();
}

// Minecraft hissi veren slot: koyu zemin + eğimli kenarlık
function drawSlot(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, s: number,
  accent?: string
): void {
  ctx.fillStyle = "rgba(18, 20, 26, 0.92)";
  ctx.fillRect(x, y, s, s);
  // bevel: üst/sol koyu, alt/sağ açık
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(x, y, s, 2);
  ctx.fillRect(x, y, 2, s);
  ctx.fillStyle = "rgba(255,255,255,0.14)";
  ctx.fillRect(x, y + s - 2, s, 2);
  ctx.fillRect(x + s - 2, y, 2, s);
  if (accent) {
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
  }
}

// Slot içinde sayı (Minecraft tarzı: sağ altta, gölgeli)
function drawSlotCount(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, n: number): void {
  ctx.font = "bold 12px monospace";
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  const tx = x + s - 4;
  const ty = y + s - 4;
  ctx.fillStyle = "rgba(0,0,0,0.8)";
  ctx.fillText(`${n}`, tx + 1, ty + 1);
  ctx.fillStyle = n > 0 ? "#ffffff" : "#6a6f78";
  ctx.fillText(`${n}`, tx, ty);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
}

// Koloni envanteri: araç çubuğunun üstünde slot çubuğu
function drawInventoryBar(ctx: CanvasRenderingContext2D): void {
  const slotS = 44;
  const gap = 5;
  const items: IconItem[] = [...ITEM_TYPES, "knowledge"];
  const total = items.length * slotS + (items.length - 1) * gap;
  const x0 = (ctx.canvas.width - total) / 2;
  const y0 = ctx.canvas.height - TOOLBAR_HEIGHT - slotS - 10;

  ctx.fillStyle = "rgba(10, 12, 16, 0.6)";
  ctx.fillRect(x0 - 6, y0 - 6, total + 12, slotS + 12);

  items.forEach((item, i) => {
    const x = x0 + i * (slotS + gap);
    const isKnowledge = item === "knowledge";
    const full = !isKnowledge && isFull(item as ItemType);
    drawSlot(ctx, x, y0, slotS, full ? "#d4453f" : isKnowledge ? "#8a6cc0" : undefined);
    drawItemIcon(ctx, item, x + 7, y0 + 5, 30);
    const count = isKnowledge ? resources.knowledge : resources[item as ItemType];
    drawSlotCount(ctx, x, y0, slotS, count);
    // depolanabilirlerde kapasite çizgisi
    if (!isKnowledge) {
      const ratio = Math.min(1, resources[item as ItemType] / resources.cap);
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.fillRect(x + 4, y0 + slotS - 5, slotS - 8, 2);
      ctx.fillStyle = full ? "#d4453f" : "#8fd05e";
      ctx.fillRect(x + 4, y0 + slotS - 5, (slotS - 8) * ratio, 2);
    }
  });
}

export const TOOLBAR_TYPES: BuildingType[] = [
  BuildingType.House,
  BuildingType.Depot,
  BuildingType.Woodcutter,
  BuildingType.Gatherer,
  BuildingType.Torch,
  BuildingType.Temple,
  BuildingType.Cafeteria,
  BuildingType.Nursery,
];

const BTN_W = 112;
const BTN_H = 48;
const BTN_GAP = 6;

// Geçici bildirimler ("Yetersiz odun!", "Yeni köylüler geldi" vb.)
const messages: { text: string; ttl: number }[] = [];

export function addMessage(text: string): void {
  messages.push({ text, ttl: 4 });
  if (messages.length > 4) messages.shift();
}

export function updateMessages(dt: number): void {
  for (let i = messages.length - 1; i >= 0; i--) {
    messages[i].ttl -= dt;
    if (messages[i].ttl <= 0) messages.splice(i, 1);
  }
}

function buttonRect(slot: number, canvasW: number, canvasH: number) {
  const total = TOOLBAR_TYPES.length * BTN_W + (TOOLBAR_TYPES.length - 1) * BTN_GAP;
  const x0 = (canvasW - total) / 2;
  return {
    x: x0 + slot * (BTN_W + BTN_GAP),
    y: canvasH - TOOLBAR_HEIGHT + (TOOLBAR_HEIGHT - BTN_H) / 2,
    w: BTN_W,
    h: BTN_H,
  };
}

// Araç çubuğuna tıklandıysa hangi binaya denk geldiğini döndür
export function toolbarHitTest(
  sx: number,
  sy: number,
  canvasW: number,
  canvasH: number
): BuildingType | null {
  if (sy < canvasH - TOOLBAR_HEIGHT) return null;
  for (let i = 0; i < TOOLBAR_TYPES.length; i++) {
    const r = buttonRect(i, canvasW, canvasH);
    if (sx >= r.x && sx <= r.x + r.w && sy >= r.y && sy <= r.y + r.h) {
      return TOOLBAR_TYPES[i];
    }
  }
  return null;
}

export function isOverToolbar(sy: number, canvasH: number): boolean {
  return sy >= canvasH - TOOLBAR_HEIGHT;
}

// ---- Köylü profil paneli ----

const PROFILE = { x: 12, y: 44, w: 252, h: 184 };
const CLOSE = { x: PROFILE.x + PROFILE.w - 24, y: PROFILE.y + 6, w: 18, h: 18 };

export type ProfileHit = { kind: "close" } | { kind: "panel" } | null;

// Panel açıkken tıklama paneli mi hedefliyor?
export function profileHitTest(sx: number, sy: number): ProfileHit {
  if (sx >= CLOSE.x && sx <= CLOSE.x + CLOSE.w && sy >= CLOSE.y && sy <= CLOSE.y + CLOSE.h) {
    return { kind: "close" };
  }
  if (sx >= PROFILE.x && sx <= PROFILE.x + PROFILE.w && sy >= PROFILE.y && sy <= PROFILE.y + PROFILE.h) {
    return { kind: "panel" };
  }
  return null;
}

function drawPortrait(ctx: CanvasRenderingContext2D, v: Villager, cx: number, cy: number): void {
  // büyütülmüş çöp adam portresi (ayaklar cy'de)
  const s = 3; // ölçek
  ctx.lineCap = "round";
  // bacaklar
  ctx.strokeStyle = "#26221e";
  ctx.lineWidth = 1.1 * s;
  ctx.beginPath();
  ctx.moveTo(cx, cy - 5 * s);
  ctx.lineTo(cx - 1.5 * s, cy);
  ctx.moveTo(cx, cy - 5 * s);
  ctx.lineTo(cx + 1.5 * s, cy);
  ctx.stroke();
  // gövde
  ctx.strokeStyle = v.shirt;
  ctx.lineWidth = 1.8 * s;
  ctx.beginPath();
  ctx.moveTo(cx, cy - 5 * s);
  ctx.lineTo(cx, cy - 9 * s);
  ctx.stroke();
  if (v.identity.female) {
    ctx.fillStyle = v.shirt;
    ctx.beginPath();
    ctx.moveTo(cx - 2.5 * s, cy - 3.5 * s);
    ctx.lineTo(cx + 2.5 * s, cy - 3.5 * s);
    ctx.lineTo(cx, cy - 6 * s);
    ctx.closePath();
    ctx.fill();
  }
  // kollar
  ctx.strokeStyle = "#26221e";
  ctx.lineWidth = 1.1 * s;
  ctx.beginPath();
  ctx.moveTo(cx, cy - 8.5 * s);
  ctx.lineTo(cx - 2 * s, cy - 5.5 * s);
  ctx.moveTo(cx, cy - 8.5 * s);
  ctx.lineTo(cx + 2 * s, cy - 5.5 * s);
  ctx.stroke();
  // kafa
  ctx.fillStyle = "#e8b88a";
  ctx.lineWidth = 0.7 * s;
  ctx.beginPath();
  ctx.arc(cx, cy - 11 * s, 2 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

export function drawProfile(ctx: CanvasRenderingContext2D, v: Villager): void {
  const { x, y, w, h } = PROFILE;
  ctx.fillStyle = "rgba(10, 12, 16, 0.85)";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "#5a5f68";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

  // portre kutusu
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.fillRect(x + 10, y + 12, 60, 86);
  ctx.strokeStyle = "#3a3f48";
  ctx.strokeRect(x + 10.5, y + 12.5, 59, 85);
  drawPortrait(ctx, v, x + 40, y + 90);

  // kapatma düğmesi
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(CLOSE.x, CLOSE.y, CLOSE.w, CLOSE.h);
  ctx.strokeStyle = "#9a9488";
  ctx.beginPath();
  ctx.moveTo(CLOSE.x + 5, CLOSE.y + 5);
  ctx.lineTo(CLOSE.x + CLOSE.w - 5, CLOSE.y + CLOSE.h - 5);
  ctx.moveTo(CLOSE.x + CLOSE.w - 5, CLOSE.y + 5);
  ctx.lineTo(CLOSE.x + 5, CLOSE.y + CLOSE.h - 5);
  ctx.stroke();

  // bilgiler
  const tx = x + 82;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffe296";
  ctx.font = "bold 14px monospace";
  ctx.fillText(v.fullName, tx, y + 24, w - 82 - 34);
  ctx.font = "13px monospace";
  ctx.fillStyle = "#e8e2d0";
  const ageText = v.baby ? `${v.ageDays} günlük` : `Yaş: ${v.identity.age}`;
  ctx.fillText(`${ageText} • ${v.identity.female ? "Kadın" : "Erkek"}`, tx, y + 46);
  ctx.fillStyle = "#c9a35a";
  ctx.fillText(`Görev: ${v.baby ? "Bebek" : assignmentLabel(v.assignment)}`, tx, y + 64, w - 82 - 12);
  ctx.fillStyle = "#9ad0ff";
  ctx.fillText(v.statusText, tx, y + 82, w - 82 - 12);

  // tokluk barı
  ctx.fillStyle = "#e8e2d0";
  ctx.font = "12px monospace";
  ctx.fillText("Tokluk", x + 10, y + 116);
  const barX = x + 72;
  const barW = w - 72 - 14;
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillRect(barX, y + 110, barW, 12);
  const fullness = 1 - v.hunger / 100;
  ctx.fillStyle = fullness > 0.5 ? "#6fbf4a" : fullness > 0.2 ? "#e0a83c" : "#d4453f";
  ctx.fillRect(barX + 1, y + 111, (barW - 2) * fullness, 10);
  ctx.strokeStyle = "#3a3f48";
  ctx.strokeRect(barX + 0.5, y + 110.5, barW - 1, 11);

  // çanta: Minecraft tarzı slot ızgarası (boş slotlar soluk)
  ctx.fillStyle = "#e8e2d0";
  ctx.fillText("Çanta", x + 10, y + 145);
  const slotS = 28;
  ITEM_TYPES.forEach((item, i) => {
    const sx = x + 66 + i * (slotS + 4);
    drawSlot(ctx, sx, y + 130, slotS);
    const n = v.inventory[item];
    ctx.globalAlpha = n > 0 ? 1 : 0.25;
    drawItemIcon(ctx, item, sx + 4, y + 134, 20);
    ctx.globalAlpha = 1;
    if (n > 0) drawSlotCount(ctx, sx, y + 130, slotS, n);
  });

  // görev ataması iş panelinden (N) ve bina panellerinden yapılır
  ctx.fillStyle = "#9a9488";
  ctx.font = "11px monospace";
  ctx.fillText(
    v.baby ? "Bebekler büyüyünce çalışmaya başlar." : "Görevler binalardan ve N menüsünden atanır.",
    x + 10, y + 172, w - 20
  );
}

// ---- Bina detay paneli ----

// Son çizilen panelin konumu (hit-test ile aynı kalması için)
let bpanel = { x: 12, y: 44, w: 252, h: 120 };
// İşçi al/çıkar düğmeleri (istihdam eden binalarda çizilir)
let bpanelHire: { x: number; y: number; w: number; h: number } | null = null;
let bpanelFire: { x: number; y: number; w: number; h: number } | null = null;

export function buildingPanelHitTest(
  sx: number,
  sy: number
): "close" | "hire" | "fire" | "panel" | null {
  const cx = bpanel.x + bpanel.w - 24;
  const cy = bpanel.y + 6;
  if (sx >= cx && sx <= cx + 18 && sy >= cy && sy <= cy + 18) return "close";
  const inRect = (r: { x: number; y: number; w: number; h: number } | null) =>
    r && sx >= r.x && sx <= r.x + r.w && sy >= r.y && sy <= r.y + r.h;
  if (inRect(bpanelHire)) return "hire";
  if (inRect(bpanelFire)) return "fire";
  if (sx >= bpanel.x && sx <= bpanel.x + bpanel.w && sy >= bpanel.y && sy <= bpanel.y + bpanel.h) {
    return "panel";
  }
  return null;
}

function drawCloseButton(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(x, y, 18, 18);
  ctx.strokeStyle = "#9a9488";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 5, y + 5);
  ctx.lineTo(x + 13, y + 13);
  ctx.moveTo(x + 13, y + 5);
  ctx.lineTo(x + 5, y + 13);
  ctx.stroke();
}

// Uzun açıklamayı panel genişliğine göre satırlara böl
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const tryLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(tryLine).width > maxW && line) {
      lines.push(line);
      line = word;
    } else {
      line = tryLine;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function drawBuildingPanel(
  ctx: CanvasRenderingContext2D,
  b: Building,
  world: World,
  villagers: Villager[]
): void {
  const def = b.def;
  const w = 252;
  const x = 12;
  const y = 44;
  ctx.font = "11px monospace";
  const descLines = wrapText(ctx, def.desc, w - 24);

  // içerik yüksekliğini hesapla
  let h = 40 + descLines.length * 14 + 10;
  if (!b.done) h += 34;
  else {
    if (isHousing(b)) h += 20;
    if (b.def.maxWorkers > 0) h += 26;
    if (isDepositPoint(b)) h += 14 + ITEM_TYPES.length * 17 + 6;
    else if (
      b.type === BuildingType.Woodcutter ||
      b.type === BuildingType.Gatherer ||
      b.type === BuildingType.Temple
    ) h += 22;
  }
  bpanel = { x, y, w, h };
  bpanelHire = null;
  bpanelFire = null;

  ctx.fillStyle = "rgba(10, 12, 16, 0.85)";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "#5a5f68";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  drawCloseButton(ctx, x + w - 24, y + 6);

  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffe296";
  ctx.font = "bold 14px monospace";
  ctx.fillText(b.done ? def.name : `${def.name} (şantiye)`, x + 12, y + 18);

  ctx.font = "11px monospace";
  ctx.fillStyle = "#9a9488";
  let ly = y + 40;
  for (const line of descLines) {
    ctx.fillText(line, x + 12, ly);
    ly += 14;
  }
  ly += 4;

  if (!b.done) {
    // inşaat ilerlemesi
    const pct = Math.floor((b.progress / def.buildTime) * 100);
    ctx.fillStyle = "#e8e2d0";
    ctx.font = "12px monospace";
    ctx.fillText(`İnşa ediliyor: %${pct}`, x + 12, ly + 4);
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(x + 12, ly + 14, w - 24, 8);
    ctx.fillStyle = "#ffd23c";
    ctx.fillRect(x + 13, ly + 15, (w - 26) * (b.progress / def.buildTime), 6);
    return;
  }

  // konutlarda sakin sayısı
  if (isHousing(b)) {
    let n = 0;
    for (const v of villagers) if (v.home === b) n++;
    ctx.font = "12px monospace";
    ctx.fillStyle = n >= HOUSE_CAPACITY ? "#e0a83c" : "#8fd05e";
    ctx.fillText(`Sakinler: ${n}/${HOUSE_CAPACITY}`, x + 12, ly);
    ly += 20;
  }

  // istihdam: çalışan sayısı ve işçi al/çıkar düğmeleri
  if (b.def.maxWorkers > 0) {
    const workers = villagers.filter(
      (v) => v.assignment.kind === "building" && v.assignment.building === b
    ).length;
    ctx.font = "12px monospace";
    ctx.fillStyle = "#e8e2d0";
    ctx.fillText(`${ROLE_NAMES[b.type] ?? "Çalışan"}: `, x + 12, ly);
    ctx.fillStyle = workers >= b.def.maxWorkers ? "#e0a83c" : "#8fd05e";
    ctx.fillText(`${workers}/${b.def.maxWorkers}`, x + 90, ly);

    bpanelFire = { x: x + 140, y: ly - 9, w: 22, h: 18 };
    bpanelHire = { x: x + 204, y: ly - 9, w: 22, h: 18 };
    for (const [r, sym] of [[bpanelFire, "−"], [bpanelHire, "+"]] as const) {
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = "#5a5f68";
      ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      ctx.fillStyle = "#e8e2d0";
      ctx.font = "bold 13px monospace";
      ctx.textAlign = "center";
      ctx.fillText(sym, r.x + r.w / 2, r.y + r.h / 2 + 1);
      ctx.textAlign = "left";
    }
    ly += 26;
  }

  if (isDepositPoint(b)) {
    // depo içeriği: her ürün ayrı satır, dolanlar kırmızı "DOLU" etiketli
    ctx.font = "12px monospace";
    for (const item of ITEM_TYPES) {
      ctx.fillStyle = ITEM_INFO[item].color;
      ctx.fillRect(x + 12, ly - 5, 10, 10);
      ctx.strokeStyle = "#3a3f48";
      ctx.strokeRect(x + 12.5, ly - 4.5, 9, 9);
      const name = ITEM_INFO[item].name;
      ctx.fillStyle = "#e8e2d0";
      ctx.fillText(
        `${name[0].toUpperCase()}${name.slice(1)}: ${resources[item]}/${resources.cap}`,
        x + 30, ly
      );
      if (isFull(item)) {
        ctx.fillStyle = "#ff6655";
        ctx.font = "bold 11px monospace";
        ctx.fillText("DOLU!", x + 170, ly);
        ctx.font = "12px monospace";
      }
      ly += 17;
    }
  } else if (b.type === BuildingType.Woodcutter || b.type === BuildingType.Gatherer) {
    const marked = b.type === BuildingType.Woodcutter
      ? world.countMarkedNear(world.markedTrees, b.x + 1, b.y + 1, 9)
      : world.countMarkedNear(world.markedBushes, b.x + 1, b.y + 1, 9);
    ctx.fillStyle = "#e8e2d0";
    ctx.font = "12px monospace";
    ctx.fillText(`Çevrede işaretli: ${marked}`, x + 12, ly + 2);
  } else if (b.type === BuildingType.Temple) {
    ctx.font = "12px monospace";
    if (b.worshipClaimed) {
      ctx.fillStyle = "#b08fe0";
      ctx.fillText("Ayin sürüyor...", x + 12, ly + 2);
    } else if (b.worshipTimer <= 0) {
      ctx.fillStyle = "#8fd05e";
      ctx.fillText("Ayine hazır", x + 12, ly + 2);
    } else {
      ctx.fillStyle = "#e8e2d0";
      ctx.fillText(`Sonraki ayin: ${Math.ceil(b.worshipTimer)} sn`, x + 12, ly + 2);
    }
  }
}

// ---- Nüfus ve iş yönetim paneli (Banished tarzı: iş bazlı sayılar) ----

const POP_JOB_ROW_H = 24;
const POP_LIST_ROW_H = 22;
const POP_MAX_ROWS = 10; // köylü listesinde aynı anda görünen satır
const POP_W = 640;
let popScroll = 0;
let popRect = { x: 0, y: 0, w: POP_W, h: 0 };
let popJobsY = 0;
let popListY = 0;

export function popScrollBy(n: number, count: number): void {
  popScroll = Math.max(0, Math.min(Math.max(0, count - POP_MAX_ROWS), popScroll + n));
}

export function isOverPopPanel(sx: number, sy: number): boolean {
  return sx >= popRect.x && sx <= popRect.x + popRect.w &&
    sy >= popRect.y && sy <= popRect.y + popRect.h;
}

// İş satırları: önce İnşaatçı (null), sonra istihdam eden binalar
export function employmentRows(buildings: Building[]): (Building | null)[] {
  const rows: (Building | null)[] = [null];
  for (const b of buildings) {
    if (b.done && b.def.maxWorkers > 0) rows.push(b);
  }
  return rows;
}

function jobRowButtons(rowY: number) {
  return {
    minus: { x: popRect.x + POP_W - 116, y: rowY + 3, w: 22, h: POP_JOB_ROW_H - 6 },
    plus: { x: popRect.x + POP_W - 42, y: rowY + 3, w: 22, h: POP_JOB_ROW_H - 6 },
  };
}

export type PopHit =
  | { kind: "close" }
  | { kind: "hire"; building: Building | null } // null = inşaatçı
  | { kind: "fire"; building: Building | null }
  | { kind: "select"; index: number }
  | { kind: "panel" }
  | null;

export function popPanelHitTest(
  sx: number,
  sy: number,
  villagers: Villager[],
  buildings: Building[]
): PopHit {
  const cx = popRect.x + popRect.w - 26;
  const cy = popRect.y + 8;
  if (sx >= cx && sx <= cx + 18 && sy >= cy && sy <= cy + 18) return { kind: "close" };

  // iş satırları (+/-)
  const rows = employmentRows(buildings);
  for (let i = 0; i < rows.length; i++) {
    const ry = popJobsY + i * POP_JOB_ROW_H;
    if (sy < ry || sy >= ry + POP_JOB_ROW_H) continue;
    const btn = jobRowButtons(ry);
    if (sx >= btn.minus.x && sx <= btn.minus.x + btn.minus.w) {
      return { kind: "fire", building: rows[i] };
    }
    if (sx >= btn.plus.x && sx <= btn.plus.x + btn.plus.w) {
      return { kind: "hire", building: rows[i] };
    }
  }

  // köylü listesi: isme tıkla -> seç
  const count = villagers.length;
  const visible = Math.min(count, POP_MAX_ROWS);
  if (sy >= popListY && sy < popListY + visible * POP_LIST_ROW_H) {
    const row = Math.floor((sy - popListY) / POP_LIST_ROW_H);
    const index = popScroll + row;
    if (index < count && sx >= popRect.x + 10 && sx <= popRect.x + 190) {
      return { kind: "select", index };
    }
  }
  if (isOverPopPanel(sx, sy)) return { kind: "panel" };
  return null;
}

export function drawPopulationPanel(
  ctx: CanvasRenderingContext2D,
  villagers: Villager[],
  buildings: Building[]
): void {
  const count = villagers.length;
  popScroll = Math.max(0, Math.min(Math.max(0, count - POP_MAX_ROWS), popScroll));
  const visible = Math.min(count, POP_MAX_ROWS);
  const rows = employmentRows(buildings);

  const w = POP_W;
  const x = (ctx.canvas.width - w) / 2;
  const y = 54;
  popJobsY = y + 64;
  popListY = popJobsY + rows.length * POP_JOB_ROW_H + 26;
  const h = popListY - y + visible * POP_LIST_ROW_H + 12;
  popRect = { x, y, w, h };

  ctx.fillStyle = "rgba(10, 12, 16, 0.92)";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "#5a5f68";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  drawCloseButton(ctx, x + w - 26, y + 8);

  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffe296";
  ctx.font = "bold 15px monospace";
  ctx.fillText("İş ve Nüfus Yönetimi", x + 12, y + 18);

  // özet: ortalık işçisi havuzu kalan herkes
  const babies = villagers.filter((v) => v.baby).length;
  const laborers = villagers.filter((v) => !v.baby && v.assignment.kind === "laborer").length;
  ctx.font = "12px monospace";
  ctx.fillStyle = "#8fd05e";
  ctx.fillText(`Ortalık işleri: ${laborers}`, x + 12, y + 44);
  ctx.fillStyle = "#9a9488";
  ctx.font = "11px monospace";
  ctx.fillText(`•  Nüfus: ${count}  •  Bebek: ${babies}`, x + 160, y + 44);

  // iş satırları
  for (let i = 0; i < rows.length; i++) {
    const b = rows[i];
    const ry = popJobsY + i * POP_JOB_ROW_H;
    if (i % 2 === 0) {
      ctx.fillStyle = "rgba(255,255,255,0.04)";
      ctx.fillRect(x + 4, ry, w - 8, POP_JOB_ROW_H);
    }
    const assigned = b === null
      ? villagers.filter((v) => !v.baby && v.assignment.kind === "builder").length
      : villagers.filter(
          (v) => v.assignment.kind === "building" && v.assignment.building === b
        ).length;
    const label = b === null
      ? "İnşaatçı"
      : `${ROLE_NAMES[b.type] ?? "Çalışan"} • ${b.def.name} (${b.x},${b.y})`;
    const countText = b === null ? `${assigned}` : `${assigned}/${b.def.maxWorkers}`;

    ctx.fillStyle = "#e8e2d0";
    ctx.font = "12px monospace";
    ctx.fillText(label, x + 12, ry + POP_JOB_ROW_H / 2, w - 200);

    const btn = jobRowButtons(ry);
    for (const [r, sym] of [[btn.minus, "−"], [btn.plus, "+"]] as const) {
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = "#5a5f68";
      ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      ctx.fillStyle = "#e8e2d0";
      ctx.font = "bold 13px monospace";
      ctx.textAlign = "center";
      ctx.fillText(sym, r.x + r.w / 2, r.y + r.h / 2 + 1);
      ctx.textAlign = "left";
    }
    ctx.fillStyle = b !== null && assigned >= b.def.maxWorkers ? "#e0a83c" : "#8fd05e";
    ctx.font = "bold 12px monospace";
    ctx.textAlign = "center";
    ctx.fillText(countText, x + POP_W - 68, ry + POP_JOB_ROW_H / 2);
    ctx.textAlign = "left";
  }

  // köylü listesi başlığı
  ctx.fillStyle = "#9a9488";
  ctx.font = "11px monospace";
  ctx.fillText("Köylüler (isme tıkla: profil)", x + 12, popListY - 12);
  if (count > POP_MAX_ROWS) {
    ctx.textAlign = "right";
    ctx.fillText(`▲▼ kaydır (${popScroll + 1}-${popScroll + visible}/${count})`, x + w - 36, popListY - 12);
    ctx.textAlign = "left";
  }

  for (let row = 0; row < visible; row++) {
    const v = villagers[popScroll + row];
    const ry = popListY + row * POP_LIST_ROW_H;
    if (row % 2 === 0) {
      ctx.fillStyle = "rgba(255,255,255,0.04)";
      ctx.fillRect(x + 4, ry, w - 8, POP_LIST_ROW_H);
    }
    ctx.fillStyle = "#9ad0ff";
    ctx.font = "bold 12px monospace";
    ctx.fillText(v.fullName, x + 12, ry + POP_LIST_ROW_H / 2, 170);
    ctx.fillStyle = "#8a8478";
    ctx.font = "11px monospace";
    ctx.fillText(v.baby ? "👶" : `${v.identity.age}`, x + 192, ry + POP_LIST_ROW_H / 2);
    ctx.fillStyle = "#c9a35a";
    ctx.fillText(v.baby ? "Bebek" : assignmentLabel(v.assignment), x + 222, ry + POP_LIST_ROW_H / 2, 180);
    ctx.fillStyle = "#c8c2b0";
    ctx.fillText(v.statusText, x + 410, ry + POP_LIST_ROW_H / 2, 150);
    // tokluk mini bar
    const fullness = 1 - v.hunger / 100;
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(x + w - 66, ry + 7, 50, 8);
    ctx.fillStyle = fullness > 0.5 ? "#6fbf4a" : fullness > 0.2 ? "#e0a83c" : "#d4453f";
    ctx.fillRect(x + w - 65, ry + 8, 48 * fullness, 6);
  }
}

// ---- Üst bar, bildirimler, araç çubuğu ----

let popButtonRect = { x: 0, y: 0, w: 0, h: 0 };

export function popButtonHitTest(sx: number, sy: number): boolean {
  return sx >= popButtonRect.x && sx <= popButtonRect.x + popButtonRect.w &&
    sy >= popButtonRect.y && sy <= popButtonRect.y + popButtonRect.h;
}

export function drawHud(
  ctx: CanvasRenderingContext2D,
  population: number,
  selected: BuildingType | null,
  paused: boolean,
  speed: number
): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;

  ctx.fillStyle = "rgba(10, 12, 16, 0.7)";
  ctx.fillRect(0, 0, w, 34);
  ctx.font = "15px monospace";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";

  let cx = 14;
  const entry = (drawIcon: (ix: number) => void, text: string) => {
    drawIcon(cx);
    ctx.fillStyle = "#e8e2d0";
    ctx.font = "15px monospace";
    ctx.fillText(text, cx + 20, 18);
    cx += 20 + ctx.measureText(text).width + 22;
  };

  // (kaynak stoğu artık alttaki envanter çubuğunda gösterilir)

  // nüfus: tıklanabilir düğme (nüfus yönetim menüsünü açar)
  {
    const label = `Nüfus: ${population} ▾`;
    ctx.font = "15px monospace";
    const bw = 20 + ctx.measureText(label).width + 10;
    popButtonRect = { x: cx - 6, y: 4, w: bw, h: 26 };
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(popButtonRect.x, popButtonRect.y, popButtonRect.w, popButtonRect.h);
    ctx.strokeStyle = "#4a4f58";
    ctx.lineWidth = 1;
    ctx.strokeRect(popButtonRect.x + 0.5, popButtonRect.y + 0.5, popButtonRect.w - 1, popButtonRect.h - 1);
    ctx.strokeStyle = "#e8e2d0";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx + 6, 12, 3, 0, Math.PI * 2);
    ctx.moveTo(cx + 6, 15);
    ctx.lineTo(cx + 6, 22);
    ctx.moveTo(cx + 2, 26);
    ctx.lineTo(cx + 6, 22);
    ctx.lineTo(cx + 10, 26);
    ctx.stroke();
    ctx.fillStyle = "#e8e2d0";
    ctx.fillText(label, cx + 20, 18);
    cx += bw + 16;
  }

  // grup ayracı
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx + 0.5, 7);
  ctx.lineTo(cx + 0.5, 27);
  ctx.stroke();
  cx += 14;

  // tarih (takvim ikonu)
  entry((ix) => {
    ctx.fillStyle = "#e8e2d0";
    ctx.fillRect(ix + 1, 12, 12, 11);
    ctx.fillStyle = "#c0473f";
    ctx.fillRect(ix + 1, 12, 12, 4);
    ctx.fillStyle = "#3a3f48";
    ctx.fillRect(ix + 3, 18, 2, 2);
    ctx.fillRect(ix + 7, 18, 2, 2);
    ctx.fillRect(ix + 3, 21, 2, 1);
    ctx.fillRect(ix + 11, 18, 1, 2);
  }, `Tarih: ${dateString()}`);

  // saat (gündüz güneş / gece hilal ikonu)
  {
    const dark = darkness();
    if (dark < 0.5) {
      // güneş
      ctx.fillStyle = "#ffd23c";
      ctx.beginPath();
      ctx.arc(cx + 7, 17, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#ffd23c";
      ctx.lineWidth = 1;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx + 7 + Math.cos(a) * 6.5, 17 + Math.sin(a) * 6.5);
        ctx.lineTo(cx + 7 + Math.cos(a) * 8.5, 17 + Math.sin(a) * 8.5);
        ctx.stroke();
      }
    } else {
      // hilal
      ctx.fillStyle = "#d8e0f0";
      ctx.beginPath();
      ctx.arc(cx + 7, 17, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(10, 12, 16, 1)";
      ctx.beginPath();
      ctx.arc(cx + 10, 15, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#e8e2d0";
    ctx.font = "15px monospace";
    const saat = `Saat: ${timeString()}`;
    ctx.fillText(saat, cx + 20, 18);
    cx += 20 + ctx.measureText(saat).width;
  }

  // sağda hız; yardım metni yalnızca sığıyorsa
  ctx.textAlign = "right";
  ctx.fillStyle = speed > 1 ? "#ffd23c" : "#9a9488";
  ctx.font = "12px monospace";
  ctx.fillText(`Hız: ${speed}x`, w - 12, 10);
  const help = "N: nüfus • Space: durdur • X: hız";
  if (w - 12 - ctx.measureText(help).width > cx + 16) {
    ctx.fillStyle = "#9a9488";
    ctx.fillText(help, w - 12, 25);
  }
  ctx.textAlign = "left";

  // oyun sonu perdesi
  if (population === 0) {
    ctx.fillStyle = "rgba(5, 6, 10, 0.75)";
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = "center";
    ctx.fillStyle = "#d4453f";
    ctx.font = "bold 36px monospace";
    ctx.fillText("KOLONİ YOK OLDU", w / 2, h / 2 - 30);
    ctx.fillStyle = "#e8e2d0";
    ctx.font = "16px monospace";
    ctx.fillText(`Son tarih: ${dateString()}`, w / 2, h / 2 + 8);
    ctx.fillStyle = "#9a9488";
    ctx.font = "13px monospace";
    ctx.fillText("Yeniden başlamak için sayfayı yenile (F5)", w / 2, h / 2 + 36);
    ctx.textAlign = "left";
    return;
  }

  // duraklatma göstergesi
  if (paused) {
    ctx.textAlign = "center";
    ctx.font = "bold 16px monospace";
    const text = "❚❚ DURAKLATILDI (Space)";
    const tw = ctx.measureText(text).width + 30;
    ctx.fillStyle = "rgba(10, 12, 16, 0.8)";
    ctx.fillRect(w / 2 - tw / 2, 90, tw, 30);
    ctx.fillStyle = "#ffd23c";
    ctx.fillText(text, w / 2, 105);
    ctx.textAlign = "left";
  }

  // bildirimler
  ctx.textAlign = "center";
  ctx.font = "14px monospace";
  messages.forEach((m, i) => {
    const alpha = Math.min(1, m.ttl);
    ctx.fillStyle = `rgba(10, 12, 16, ${0.7 * alpha})`;
    const tw = ctx.measureText(m.text).width + 24;
    ctx.fillRect(w / 2 - tw / 2, 44 + i * 26, tw, 22);
    ctx.fillStyle = `rgba(255, 226, 150, ${alpha})`;
    ctx.fillText(m.text, w / 2, 55 + i * 26);
  });
  ctx.textAlign = "left";

  // alt araç çubuğu
  ctx.fillStyle = "rgba(10, 12, 16, 0.8)";
  ctx.fillRect(0, h - TOOLBAR_HEIGHT, w, TOOLBAR_HEIGHT);

  TOOLBAR_TYPES.forEach((type, i) => {
    const r = buttonRect(i, w, h);
    const def = BUILDING_DEFS[type];
    const isSelected = selected === type;
    const affordable = resources.wood >= def.cost;

    ctx.fillStyle = isSelected ? "rgba(90, 143, 60, 0.45)" : "rgba(255,255,255,0.06)";
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = isSelected ? "#8fd05e" : affordable ? "#5a5f68" : "#7a3b2e";
    ctx.lineWidth = isSelected ? 2 : 1;
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);

    ctx.fillStyle = affordable ? "#e8e2d0" : "#8a8478";
    ctx.font = "bold 13px monospace";
    ctx.fillText(`${i + 1}. ${def.name}`, r.x + 10, r.y + 14);
    ctx.font = "12px monospace";
    ctx.fillStyle = affordable ? "#c9a35a" : "#9a6055";
    ctx.fillText(`${def.cost} odun`, r.x + 10, r.y + 30);
    ctx.fillStyle = "#9a9488";
    ctx.font = "10px monospace";
    ctx.fillText(def.desc, r.x + 10, r.y + 43, r.w - 20);
  });

  // koloni envanteri (Minecraft tarzı slot çubuğu)
  drawInventoryBar(ctx);
}
