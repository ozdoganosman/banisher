import {
  AXE_STONE_COST,
  AXE_WOOD_COST,
  TORCH_ATTACH_COST,
  BUILDING_DEFS,
  BuildingType,
  HOUSE_CAPACITY,
  isDepositPoint,
  isHousing,
  worshipState,
  type Building,
  isBuildingUnlocked,
} from "../sim/buildings";
import { ROLE_NAMES } from "../sim/buildings";
import {
  isFull,
  ITEM_INFO,
  ITEM_TYPES,
  resources,
  type ItemType,
} from "../sim/resources";
import { ANIMAL_DEFS, BARN_CAPACITY, TAME_TARGET, type Animal } from "../sim/animals";
import { journal } from "../sim/journal";
import { policy, POLICY_INFO, type PolicyKey } from "../sim/policy";
import { currentGoal, type GoalCtx } from "../sim/goals";
import { hasTech, prereqsMet, TECHS, type TechId, type Tech } from "../sim/tech";
import {
  darkness,
  dateString,
  season,
  SEASON_COLORS,
  SEASON_NAMES,
  timeString,
} from "../sim/time";
import { assignmentLabel, type Villager } from "../sim/villager";
import type { World } from "../world/world";
import { drawVillagerJobAccessories } from "./renderer";

export const TOOLBAR_HEIGHT = 76;

// ============================================================
//  Arayüz tasarım sistemi: tutarlı palet + yeniden kullanılan
//  panel/çip/düğme çizimleri (yuvarlak köşe, degrade, gölge, vurgu)
// ============================================================
const UI = {
  gold: "#ffe296",
  goldDim: "#c9a35a",
  text: "#e8e2d0",
  muted: "#9a9488",
  green: "#8fd05e",
  purple: "#b08fe0",
  brown: "#c79a5a",
  blue: "#6fb0e0",
  danger: "#e07a68",
};

// Yuvarlatılmış dikdörtgen yolu
function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

// Cilalı panel gövdesi: düşük gölge + dikey degrade + ince çerçeve + sol vurgu şeridi.
// Düzeni bozmamak için panellerin x/y/w/h değerleri korunur; yalnızca "kabuk" değişir.
function panelChrome(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  accent: string = UI.gold,
  radius = 9
): void {
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 22;
  ctx.shadowOffsetY = 7;
  rrect(ctx, x, y, w, h, radius);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, "rgba(31, 35, 47, 0.97)");
  g.addColorStop(1, "rgba(13, 15, 21, 0.98)");
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
  // ince üst parlama
  rrect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, radius);
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.stroke();
  // sol vurgu şeridi (panel ailesini renkle ayırır)
  ctx.save();
  rrect(ctx, x + 2, y + 7, 3, h - 14, 1.5);
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.9;
  ctx.fill();
  ctx.restore();
}

// Yuvarlatılmış küçük düğme/çip arka planı (üst bar, filtreler)
function chipBg(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  active: boolean, accent: string = UI.gold
): void {
  rrect(ctx, x, y, w, h, 6);
  if (active) {
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, accent + "44");
    g.addColorStop(1, accent + "22");
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = "rgba(255,255,255,0.06)";
  }
  ctx.fill();
  rrect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 6);
  ctx.lineWidth = 1;
  ctx.strokeStyle = active ? accent : "rgba(255,255,255,0.14)";
  ctx.stroke();
}

// ---- Sol üst hedef kartı (tutorial görev zinciri) ----

// Aktif hedefi çizer; kapladığı yüksekliği döndürür (görev listesi altına kayar)
export function drawGoalCard(ctx: CanvasRenderingContext2D, gctx: GoalCtx): number {
  const goal = currentGoal();
  if (!goal) return 0;

  const x = 12;
  const y = 42;
  const W = 252;
  const PAD = 8;

  ctx.font = "11px monospace";
  const hintLines = wrapText(ctx, goal.hint, W - PAD * 2);
  const prog = goal.progress?.(gctx) ?? null;
  const H = 22 + 18 + hintLines.length * 14 + (prog ? 16 : 0) + PAD;

  // cilalı panel + altın vurgu
  panelChrome(ctx, x, y, W, H, UI.gold);

  ctx.textBaseline = "middle";
  ctx.textAlign = "left";

  // başlık satırı: HEDEF + ödül
  ctx.font = "bold 11px monospace";
  ctx.fillStyle = "#c9a35a";
  ctx.fillText("🎯 HEDEF", x + PAD, y + 13);
  ctx.textAlign = "right";
  ctx.fillStyle = "#b9a6ff";
  ctx.fillText(`Ödül: +${goal.reward} bilgi`, x + W - PAD, y + 13);
  ctx.textAlign = "left";

  // hedef adı
  ctx.font = "bold 13px monospace";
  ctx.fillStyle = "#ffe296";
  ctx.fillText(goal.title, x + PAD, y + 32, W - PAD * 2);

  // ipucu (nerede/nasıl)
  ctx.font = "11px monospace";
  ctx.fillStyle = "#b8b2a2";
  hintLines.forEach((l, i) => ctx.fillText(l, x + PAD, y + 48 + i * 14));

  // ilerleme çubuğu
  if (prog) {
    const py = y + 48 + hintLines.length * 14 + 2;
    const barW = W - PAD * 2 - 56;
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(x + PAD, py - 4, barW, 8);
    ctx.fillStyle = "#8fd05e";
    ctx.fillRect(x + PAD, py - 4, barW * Math.min(1, prog.cur / prog.max), 8);
    ctx.fillStyle = "#d8d2c0";
    ctx.font = "bold 11px monospace";
    ctx.textAlign = "right";
    ctx.fillText(`${prog.cur}/${prog.max}`, x + W - PAD, py);
    ctx.textAlign = "left";
  }

  return H + 8;
}

// ---- Sol üst görev listesi (işaretli iş sayaçları) ----

export interface TaskCounts {
  wood: number;
  berry: number;
  mushroom: number;
  stone: number;
}

export function drawTaskList(ctx: CanvasRenderingContext2D, tasks: TaskCounts, yTop = 42): void {
  const entries: { label: string; color: string; count: number }[] = [];
  if (tasks.wood     > 0) entries.push({ label: "Dal",    color: "#8a6a43", count: tasks.wood });
  if (tasks.berry    > 0) entries.push({ label: "Yemiş",  color: "#d43f3f", count: tasks.berry });
  if (tasks.mushroom > 0) entries.push({ label: "Mantar", color: "#d9b06b", count: tasks.mushroom });
  if (tasks.stone    > 0) entries.push({ label: "Taş",    color: "#9aa0a8", count: tasks.stone });

  if (entries.length === 0) return;

  const x = 12;
  const y = yTop;
  const W = 128;
  const ROW_H = 22;
  const PAD  = 8;
  const H = entries.length * ROW_H + PAD;

  // arka plan
  panelChrome(ctx, x, y, W, H, UI.goldDim);

  ctx.font = "bold 12px monospace";
  ctx.textBaseline = "middle";

  entries.forEach((e, i) => {
    const ry = y + PAD / 2 + i * ROW_H + ROW_H / 2;

    // renk şeridi
    ctx.fillStyle = e.color;
    ctx.fillRect(x + 4, ry - 5, 3, 10);

    // etiket
    ctx.fillStyle = "#d8d2c0";
    ctx.textAlign = "left";
    ctx.fillText(e.label, x + 12, ry);

    // sayaç (sağa hizalı)
    ctx.fillStyle = "#ffe296";
    ctx.textAlign = "right";
    ctx.fillText(`x${e.count}`, x + W - 6, ry);
  });

  ctx.textAlign = "left";
}

// ---- Minecraft tarzı eşya slotları ----

type IconItem = ItemType | "knowledge";

// Pikselli eşya ikonu (24x24 tasarım alanında, s boyutuna ölçeklenir)
function drawItemIcon(ctx: CanvasRenderingContext2D, item: IconItem, x: number, y: number, s: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s / 24, s / 24);
  switch (item) {
    case "wood":
      // dal: iki çapraz ince dal + tomurcuk noktaları
      ctx.strokeStyle = "#7a5230";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      // sol alt → sağ üst çapraz
      ctx.beginPath();
      ctx.moveTo(5, 18); ctx.lineTo(19, 6);
      ctx.stroke();
      // sağ alt → sol üst çapraz
      ctx.beginPath();
      ctx.moveTo(19, 18); ctx.lineTo(7, 8);
      ctx.stroke();
      // küçük yan dallar
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(9, 9); ctx.lineTo(6, 6);   // sol tepe
      ctx.moveTo(15, 9); ctx.lineTo(19, 7);  // sağ tepe
      ctx.moveTo(12, 14); ctx.lineTo(9, 17); // sol alt
      ctx.stroke();
      // tomurcuk uçları
      ctx.fillStyle = "#a07848";
      ctx.fillRect(5, 5, 2, 2);
      ctx.fillRect(19, 5, 2, 2);
      ctx.fillRect(8, 17, 2, 2);
      break;
    case "log":
      // üst üste iki kütük: uçlarında halkalı kesitler
      ctx.fillStyle = "#6b4a2b";
      ctx.fillRect(4, 8, 14, 5);
      ctx.fillRect(7, 13.5, 14, 5);
      ctx.fillStyle = "#8a6a43";
      ctx.beginPath();
      ctx.ellipse(18, 10.5, 2.2, 2.5, 0, 0, Math.PI * 2);
      ctx.ellipse(21, 16, 2.2, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#c9a35a";
      ctx.beginPath();
      ctx.ellipse(18, 10.5, 1, 1.2, 0, 0, Math.PI * 2);
      ctx.ellipse(21, 16, 1, 1.2, 0, 0, Math.PI * 2);
      ctx.fill();
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
      // leaf/stem
      ctx.fillStyle = "#4a8a2c";
      ctx.fillRect(11, 3, 2, 4);
      ctx.fillRect(13, 4, 3, 2);
      // three circles clustered together
      ctx.fillStyle = "#d43f3f"; // primary red
      // left berry
      ctx.beginPath();
      ctx.arc(9, 11, 4, 0, Math.PI * 2);
      ctx.fill();
      // right berry
      ctx.beginPath();
      ctx.arc(15, 11, 4, 0, Math.PI * 2);
      ctx.fill();
      // bottom berry
      ctx.beginPath();
      ctx.arc(12, 16, 4.5, 0, Math.PI * 2);
      ctx.fill();
      // highlights
      ctx.fillStyle = "#f08080";
      ctx.fillRect(7, 9, 2, 2);
      ctx.fillRect(13, 9, 2, 2);
      ctx.fillRect(10, 14, 2, 2);
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
    case "fish":
      // yana dönük balık: gövde + kuyruk + göz
      ctx.fillStyle = "#6fa8c9";
      ctx.beginPath();
      ctx.ellipse(11, 12, 7, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(17, 12);
      ctx.lineTo(21, 8);
      ctx.lineTo(21, 16);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#8fc4e0";
      ctx.fillRect(7, 9, 5, 2);
      ctx.fillStyle = "#1a2a36";
      ctx.fillRect(6, 11, 1.6, 1.6);
      break;
    case "meat":
      // but eti: kemikli pirzola
      ctx.fillStyle = "#c0564a";
      ctx.beginPath();
      ctx.ellipse(10, 11, 6.5, 5, -0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#e08878";
      ctx.beginPath();
      ctx.ellipse(9, 10, 3, 2.2, -0.5, 0, Math.PI * 2);
      ctx.fill();
      // kemik
      ctx.strokeStyle = "#ece4d4";
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(14, 14); ctx.lineTo(19, 19);
      ctx.stroke();
      ctx.fillStyle = "#ece4d4";
      ctx.beginPath();
      ctx.arc(19.5, 17.8, 1.6, 0, Math.PI * 2);
      ctx.arc(17.8, 19.5, 1.6, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "leather":
      // gerilmiş post
      ctx.fillStyle = "#a87c4f";
      ctx.beginPath();
      ctx.moveTo(6, 6); ctx.lineTo(18, 6); ctx.lineTo(20, 12);
      ctx.lineTo(17, 19); ctx.lineTo(7, 19); ctx.lineTo(4, 12);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#8a6238";
      ctx.fillRect(8, 9, 8, 1.4);
      ctx.fillRect(7, 13, 10, 1.4);
      ctx.fillStyle = "#c49a6a";
      ctx.fillRect(6.5, 6.5, 3, 2);
      break;
    case "wool":
      // yün yumağı
      ctx.fillStyle = "#e8e4da";
      ctx.beginPath();
      ctx.arc(12, 12, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#c8c2b4";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(12, 12, 4.5, 0.4, 2.6);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(12, 12, 2.4, 3.4, 5.8);
      ctx.stroke();
      ctx.fillStyle = "#f6f3ec";
      ctx.fillRect(8, 8, 3, 2);
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

// Koloni envanteri: araç çubuğunun üstünde tüm kaynakların gösterildiği slot çubuğu.
const hotbarAssign: IconItem[] = [...ITEM_TYPES, "knowledge"];

function isItemVisible(item: IconItem): boolean {
  if (item === "wood" || item === "berry" || item === "knowledge") {
    return true;
  }
  if (item === "stone") {
    return hasTech("humanity") || hasTech("hardobjects") || resources.stone > 0;
  }
  if (item === "log") {
    // odun ancak baltayla kesimden gelir
    return hasTech("toolworkshop") || resources.log > 0;
  }
  if (item === "mushroom") {
    return hasTech("mushroomology") || resources.mushroom > 0;
  }
  if (item === "fish") {
    // balıkçı kulübesi henüz hiçbir araştırmaya bağlı değil (kilitli);
    // balık ancak gerçekten stokta varsa gösterilir
    return resources.fish > 0;
  }
  if (item === "meat" || item === "leather" || item === "wool") {
    return hasTech("kan") || resources[item] > 0;
  }
  return false;
}

function itemCount(item: IconItem): number {
  return item === "knowledge" ? resources.knowledge : resources[item];
}

function drawInventoryBar(ctx: CanvasRenderingContext2D): void {
  const visibleItems = hotbarAssign.filter(isItemVisible);
  const numSlots = visibleItems.length;
  const gap = 5;
  // dar pencerede slotlar küçülür
  const slotS = Math.min(
    44,
    Math.floor((ctx.canvas.width - 24 - (numSlots - 1) * gap) / numSlots)
  );
  const total = numSlots * slotS + (numSlots - 1) * gap;
  const x0 = (ctx.canvas.width - total) / 2;
  const y0 = ctx.canvas.height - TOOLBAR_HEIGHT - slotS - 10;

  rrect(ctx, x0 - 8, y0 - 15, total + 16, slotS + 22, 8);
  ctx.fillStyle = "rgba(12, 14, 20, 0.72)";
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.stroke();

  for (let i = 0; i < numSlots; i++) {
    const x = x0 + i * (slotS + gap);
    const item = visibleItems[i];
    const isKnowledge = item === "knowledge";
    const full = !isKnowledge && isFull(item as ItemType);
    
    // Draw name above slot
    ctx.fillStyle = "#9a9488";
    ctx.font = "8px monospace";
    ctx.textAlign = "center";
    const name = isKnowledge ? "bilgi" : ITEM_INFO[item as ItemType].name;
    ctx.fillText(name, x + slotS / 2, y0 - 4);
    ctx.textAlign = "left";
    
    drawSlot(ctx, x, y0, slotS, full ? "#d4453f" : isKnowledge ? "#8a6cc0" : undefined);
    
    const count = itemCount(item);
    if (count <= 0) {
      ctx.globalAlpha = 0.25; // Stokta yoksa ikonu yarı saydam yap
    }
    drawItemIcon(ctx, item, x + slotS * 0.16, y0 + slotS * 0.11, slotS * 0.68);
    if (count <= 0) {
      ctx.globalAlpha = 1.0;
    }
    
    drawSlotCount(ctx, x, y0, slotS, count);
    
    // depolanabilirlerde kapasite çizgisi
    if (!isKnowledge) {
      const ratio = Math.min(1, resources[item as ItemType] / resources.cap);
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.fillRect(x + 4, y0 + slotS - 5, slotS - 8, 2);
      ctx.fillStyle = full ? "#d4453f" : "#8fd05e";
      ctx.fillRect(x + 4, y0 + slotS - 5, (slotS - 8) * ratio, 2);
    }
  }
}

export const TOOLBAR_TYPES: BuildingType[] = [
  BuildingType.House,
  BuildingType.Depot,
  BuildingType.Woodcutter,
  BuildingType.Gatherer,
  BuildingType.ToolWorkshop,
  BuildingType.Splitter,
  BuildingType.Road,
  BuildingType.Fisher,
  BuildingType.Barn,
  BuildingType.HunterLodge,
  BuildingType.Temple,
  BuildingType.Cafeteria,
  BuildingType.Nursery,
];

const BTN_W = 108;
const BTN_H = 60;
const BTN_GAP = 5;

// İnşaat menüsü görselleri: her bina için amblem ve kategori rengi
const BUILDING_ICON: Partial<Record<BuildingType, string>> = {
  [BuildingType.House]: "🏠",
  [BuildingType.Depot]: "📦",
  [BuildingType.Woodcutter]: "🌲",
  [BuildingType.Gatherer]: "🧺",
  [BuildingType.ToolWorkshop]: "🪓",
  [BuildingType.Splitter]: "🪚",
  [BuildingType.Road]: "🧱",
  [BuildingType.Fisher]: "🎣",
  [BuildingType.Barn]: "🐄",
  [BuildingType.HunterLodge]: "🏹",
  [BuildingType.Temple]: "🛕",
  [BuildingType.Cafeteria]: "🍲",
  [BuildingType.Nursery]: "👶",
};
const BUILDING_TINT: Partial<Record<BuildingType, string>> = {
  [BuildingType.House]: "#c89a5a",
  [BuildingType.Depot]: "#c89a5a",
  [BuildingType.Woodcutter]: "#6a9a4a",
  [BuildingType.Gatherer]: "#6a9a4a",
  [BuildingType.Splitter]: "#6a9a4a",
  [BuildingType.Fisher]: "#4a90b0",
  [BuildingType.ToolWorkshop]: "#9a8a6a",
  [BuildingType.HunterLodge]: "#b0563f",
  [BuildingType.Temple]: "#9a6cc0",
  [BuildingType.Nursery]: "#c07ab0",
  [BuildingType.Cafeteria]: "#c0843f",
  [BuildingType.Road]: "#8a8e96",
};

// Geçici bildirimler ("Yetersiz odun!", "Yeni köylüler geldi" vb.)
// level: önemli olanlar büyük/parlak; sık tekrarlananlar tek satırda "×N" ile birikir
export type MsgLevel = "low" | "info" | "important";
interface Msg { text: string; ttl: number; level: MsgLevel; count: number; pop: number }
const messages: Msg[] = [];

const MSG_TTL: Record<MsgLevel, number> = { low: 2.6, info: 4, important: 6.5 };

export function addMessage(text: string, level: MsgLevel = "info"): void {
  // aynı metin hâlâ ekrandaysa yeni satır açma: say ve süreyi tazele (spam önlenir)
  const existing = messages.find((m) => m.text === text);
  if (existing) {
    existing.count++;
    if (level === "important") existing.level = "important";
    existing.ttl = Math.max(existing.ttl, MSG_TTL[level]);
    existing.pop = 0.25;
    return;
  }
  messages.push({ text, ttl: MSG_TTL[level], level, count: 1, pop: 0.25 });
  // önemli bildirimleri koru, en eski sıradanı at
  if (messages.length > 6) {
    const idx = messages.findIndex((m) => m.level !== "important");
    messages.splice(idx >= 0 ? idx : 0, 1);
  }
}

export function updateMessages(dt: number): void {
  for (let i = messages.length - 1; i >= 0; i--) {
    messages[i].ttl -= dt;
    if (messages[i].pop > 0) messages[i].pop = Math.max(0, messages[i].pop - dt);
    if (messages[i].ttl <= 0) messages.splice(i, 1);
  }
}

function buttonRect(slot: number, canvasW: number, canvasH: number, n: number) {
  // dar pencerede düğmeler ekrana sığacak şekilde daralır
  const bw = Math.min(BTN_W, Math.floor((canvasW - 16 - (n - 1) * BTN_GAP) / n));
  const total = n * bw + (n - 1) * BTN_GAP;
  const x0 = (canvasW - total) / 2;
  return {
    x: x0 + slot * (bw + BTN_GAP),
    y: canvasH - TOOLBAR_HEIGHT + (TOOLBAR_HEIGHT - BTN_H) / 2,
    w: bw,
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
  const unlockedTypes = TOOLBAR_TYPES.filter(isBuildingUnlocked);
  const n = unlockedTypes.length;
  for (let i = 0; i < n; i++) {
    const r = buttonRect(i, canvasW, canvasH, n);
    if (sx >= r.x && sx <= r.x + r.w && sy >= r.y && sy <= r.y + r.h) {
      return unlockedTypes[i];
    }
  }
  return null;
}

export function isOverToolbar(sy: number, canvasH: number): boolean {
  return sy >= canvasH - TOOLBAR_HEIGHT;
}

// ---- İşaretleme filtresi (alan seçimi neyi işaretlesin?) ----

export type MarkFilter = "all" | "wood" | "food" | "stone" | "cancel";

// Kısayollar yan yana ev sırası tuşlarıdır: G H J K L
export const MARK_FILTERS: { id: MarkFilter; label: string; color: string; key: string }[] = [
  { id: "all", label: "Tümü", color: "#e8e2d0", key: "G" },
  { id: "wood", label: "Odun", color: "#c9a35a", key: "H" },
  { id: "food", label: "Yiyecek", color: "#8fd05e", key: "J" },
  { id: "stone", label: "Taş", color: "#9ad0ff", key: "K" },
  { id: "cancel", label: "✕ İptal", color: "#e88a7a", key: "L" },
];

let filterRects: { id: MarkFilter; x: number; y: number; w: number; h: number }[] = [];

export function markFilterHitTest(sx: number, sy: number): MarkFilter | null {
  for (const r of filterRects) {
    if (sx >= r.x && sx <= r.x + r.w && sy >= r.y && sy <= r.y + r.h) return r.id;
  }
  return null;
}

export function drawMarkFilters(ctx: CanvasRenderingContext2D, current: MarkFilter): void {
  const h = ctx.canvas.height;
  let x = 12;
  const y = h - TOOLBAR_HEIGHT - 34;
  ctx.font = "11px monospace";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  const visibleFilters = MARK_FILTERS.filter(
    (f) => f.id !== "stone" || hasTech("hardobjects")
  );
  const totalW = 64 + visibleFilters.reduce(
    (s, f) => s + ctx.measureText(f.label).width + 22 + 14, 0
  );
  panelChrome(ctx, x - 8, y - 6, totalW, 32, UI.green);
  ctx.fillStyle = "#b8b2a2";
  ctx.fillText("İşaretle:", x + 4, y + 10);
  x += 60;
  filterRects = [];
  for (const f of visibleFilters) {
    const w = ctx.measureText(f.label).width + 16 + 14;
    const active = current === f.id;
    chipBg(ctx, x, y, w, 20, active, f.id === "cancel" ? UI.danger : UI.green);
    // tuş kapağı: çipin başında küçük harf kutusu
    ctx.fillStyle = active ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.12)";
    ctx.fillRect(x + 3, y + 4, 12, 12);
    ctx.strokeStyle = "#6a6f78";
    ctx.strokeRect(x + 3.5, y + 4.5, 11, 11);
    ctx.fillStyle = active ? "#ffffff" : "#c8c2b0";
    ctx.font = "bold 9px monospace";
    ctx.textAlign = "center";
    ctx.fillText(f.key, x + 9, y + 10.5);
    ctx.textAlign = "left";
    ctx.font = "11px monospace";
    ctx.fillStyle = active ? "#d8f0c0" : f.color;
    ctx.fillText(f.label, x + 19, y + 10);
    filterRects.push({ id: f.id, x, y, w, h: 20 });
    x += w + 6;
  }
}

// ---- Sürüklenebilir paneller ----
// Her panel başlangıç konumuna göre bir ofset taşır; sürükleyince değişir.

export type PanelId = "profile" | "building" | "tech" | "pop" | "people" | "journal" | "animal";

const panelOffsets: Record<PanelId, { x: number; y: number }> = {
  profile: { x: 0, y: 0 },
  building: { x: 0, y: 0 },
  tech: { x: 0, y: 0 },
  pop: { x: 0, y: 0 },
  people: { x: 0, y: 0 },
  journal: { x: 0, y: 0 },
  animal: { x: 0, y: 0 },
};

// Panelin son çizilen (ofset dahil) dikdörtgeni
export function panelRectOf(id: PanelId): { x: number; y: number; w: number; h: number } {
  switch (id) {
    case "profile":
      return {
        x: PROFILE.x + panelOffsets.profile.x,
        y: PROFILE.y + panelOffsets.profile.y,
        w: PROFILE.w,
        h: profileDrawnH,
      };
    case "building": return bpanel;
    case "tech": return techRect;
    case "pop": return popRect;
    case "people": return peopleRect;
    case "journal": return journalRect;
    case "animal": return apanelRect;
  }
}

// Paneli sürükle (ekran içinde kalacak şekilde sınırlanır)
export function dragPanelBy(id: PanelId, dx: number, dy: number, vw: number, vh: number): void {
  const r = panelRectOf(id);
  const nx = Math.max(4, Math.min(vw - r.w - 4, r.x + dx));
  const ny = Math.max(36, Math.min(vh - 80, r.y + dy));
  panelOffsets[id].x += nx - r.x;
  panelOffsets[id].y += ny - r.y;
}

// ---- Köylü profil paneli ----

const PROFILE = { x: 12, y: 44, w: 262, h: 224 };
function profilePos() {
  return { x: PROFILE.x + panelOffsets.profile.x, y: PROFILE.y + panelOffsets.profile.y };
}
function profileCloseRect() {
  const p = profilePos();
  return { x: p.x + PROFILE.w - 24, y: p.y + 6, w: 18, h: 18 };
}
// Moral dökümü satırlarına göre panel uzar; hit-test son çizilen yüksekliği kullanır
let profileDrawnH = PROFILE.h;
// "Konuş ve teskin et" düğmesi (yalnız yakaran köylüde çizilir)
let profileCalmRect: { x: number; y: number; w: number; h: number } | null = null;

export type ProfileHit = { kind: "close" } | { kind: "calm" } | { kind: "panel" } | null;

// Panel açıkken tıklama paneli mi hedefliyor?
export function profileHitTest(sx: number, sy: number): ProfileHit {
  const c = profileCloseRect();
  if (sx >= c.x && sx <= c.x + c.w && sy >= c.y && sy <= c.y + c.h) {
    return { kind: "close" };
  }
  if (
    profileCalmRect &&
    sx >= profileCalmRect.x && sx <= profileCalmRect.x + profileCalmRect.w &&
    sy >= profileCalmRect.y && sy <= profileCalmRect.y + profileCalmRect.h
  ) {
    return { kind: "calm" };
  }
  const p = profilePos();
  if (sx >= p.x && sx <= p.x + PROFILE.w && sy >= p.y && sy <= p.y + profileDrawnH) {
    return { kind: "panel" };
  }
  return null;
}

function drawPortrait(ctx: CanvasRenderingContext2D, v: Villager, cx: number, cy: number): void {
  // büyütülmüş tombul piksel portre (ayaklar cy'de)
  const s = 3; // ölçek
  const LINE = "#26221e";
  const SKIN = "#e8b88a";
  // saç rengi: dünya çizimiyle aynı kural (isim hash'i)
  const name = v.identity.firstName + v.identity.lastName;
  let hh = 0;
  for (let i = 0; i < name.length; i++) hh = (hh * 31 + name.charCodeAt(i)) | 0;
  const HAIR = ["#2e2620", "#4a3322", "#6e4a28", "#8a6034", "#c2913c", "#55504a"];
  const hair = HAIR[Math.abs(hh) % HAIR.length];

  // bacaklar
  ctx.fillStyle = "#3a342c";
  ctx.fillRect(cx - 1.9 * s, cy - 4.6 * s, 1.7 * s, 4.6 * s);
  ctx.fillRect(cx + 0.2 * s, cy - 4.6 * s, 1.7 * s, 4.6 * s);
  // gövde
  ctx.fillStyle = v.shirtColor;
  ctx.fillRect(cx - 2.4 * s, cy - 9.6 * s, 4.8 * s, 5.4 * s);
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.fillRect(cx - 2.4 * s, cy - 9.6 * s, 1.1 * s, 5.4 * s);
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 0.55 * s;
  ctx.strokeRect(cx - 2.4 * s, cy - 9.6 * s, 4.8 * s, 5.4 * s);
  if (v.identity.female) {
    ctx.fillStyle = v.shirtColor;
    ctx.beginPath();
    ctx.moveTo(cx - 2.4 * s, cy - 4.2 * s);
    ctx.lineTo(cx + 2.4 * s, cy - 4.2 * s);
    ctx.lineTo(cx + 3.1 * s, cy - 2.2 * s);
    ctx.lineTo(cx - 3.1 * s, cy - 2.2 * s);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  // kollar (yanlarda)
  ctx.strokeStyle = v.shirtColor;
  ctx.lineWidth = 1.3 * s;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx - 2.7 * s, cy - 8.8 * s);
  ctx.lineTo(cx - 2.7 * s, cy - 5.6 * s);
  ctx.moveTo(cx + 2.7 * s, cy - 8.8 * s);
  ctx.lineTo(cx + 2.7 * s, cy - 5.6 * s);
  ctx.stroke();
  ctx.fillStyle = SKIN;
  ctx.fillRect(cx - 3.3 * s, cy - 6 * s, 1.2 * s, 1.2 * s);
  ctx.fillRect(cx + 2.1 * s, cy - 6 * s, 1.2 * s, 1.2 * s);
  // kafa + saç + gözler (portrede önden bakış: iki göz)
  ctx.fillStyle = SKIN;
  ctx.fillRect(cx - 2.1 * s, cy - 14 * s, 4.2 * s, 4.2 * s);
  ctx.fillStyle = hair;
  ctx.fillRect(cx - 2.3 * s, cy - 14.4 * s, 4.6 * s, 1.5 * s);
  if (v.identity.female) {
    ctx.fillRect(cx - 2.6 * s, cy - 13.6 * s, 1 * s, 4.4 * s);
    ctx.fillRect(cx + 1.6 * s, cy - 13.6 * s, 1 * s, 4.4 * s);
  }
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 0.55 * s;
  ctx.strokeRect(cx - 2.1 * s, cy - 14 * s, 4.2 * s, 4.2 * s);
  ctx.fillStyle = LINE;
  ctx.fillRect(cx - 1.3 * s, cy - 12.4 * s, 0.9 * s, 0.9 * s);
  ctx.fillRect(cx + 0.4 * s, cy - 12.4 * s, 0.9 * s, 0.9 * s);

  drawVillagerJobAccessories(ctx, cx, cy, 1, v.assignment, s);
}

export function drawProfile(ctx: CanvasRenderingContext2D, v: Villager): void {
  const { x, y } = profilePos();
  const w = PROFILE.w;
  const CLOSE = profileCloseRect();
  // moral dökümü satırları (en çok etkiden aza sıralı); panel buna göre uzar
  const moraleEntries = [...v.moraleLog]
    .filter(([, d]) => Math.abs(d) >= 0.05)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  const breakdownH = moraleEntries.length > 0 ? moraleEntries.length * 14 + 6 : 0;
  const calmH = v.pleadingTtl > 0 ? 34 : 0;
  const h = PROFILE.h + breakdownH + calmH;
  profileDrawnH = h;
  profileCalmRect = null;
  panelChrome(ctx, x, y, w, h, UI.blue);

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
  const ageText = `Yaş: ${v.age}`;
  const eduText = v.educated ? " • Eğitimli" : "";
  const pregText = v.pregnant
    ? ` • Hamile (${Math.min(4, Math.floor(v.pregnancyProgress * 4) + 1)}/4 gün)`
    : "";
  const sickText = v.sick ? " • 🤒 Hasta" : "";
  ctx.fillText(
    `${ageText} • ${v.identity.female ? "Kadın" : "Erkek"}${eduText}${pregText}${sickText}`,
    tx, y + 46, w - 82 - 12
  );
  ctx.fillStyle = "#c9a35a";
  const jobLabel = v.baby ? "Bebek" : v.child ? "Çocuk" : assignmentLabel(v.assignment);
  ctx.fillText(`Görev: ${jobLabel}`, tx, y + 64, w - 82 - 12);
  ctx.fillStyle = "#9ad0ff";
  ctx.fillText(v.statusText, tx, y + 82, w - 82 - 12);

  // ekipman satırı: balta / mızrak / giysi
  ctx.fillStyle = "#c9d4dc";
  ctx.font = "12px monospace";
  const gear: string[] = [];
  if (v.hasAxe) gear.push("🪓 balta");
  if (v.spears > 0) gear.push(`🗡 ${v.spears} mızrak`);
  if (v.hasClothes) gear.push("🧥 giysi");
  ctx.fillText(
    `Ekipman: ${gear.length > 0 ? gear.join(" • ") : "—"}`,
    tx, y + 100, w - 82 - 12
  );

  // tokluk barı
  ctx.fillStyle = "#e8e2d0";
  ctx.font = "12px monospace";
  ctx.fillText("Tokluk", x + 10, y + 134);
  const barX = x + 72;
  const barW = w - 72 - 14;
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillRect(barX, y + 128, barW, 12);
  const fullness = 1 - v.hunger / 100;
  ctx.fillStyle = fullness > 0.5 ? "#6fbf4a" : fullness > 0.2 ? "#e0a83c" : "#d4453f";
  ctx.fillRect(barX + 1, y + 129, (barW - 2) * fullness, 10);
  ctx.strokeStyle = "#3a3f48";
  ctx.strokeRect(barX + 0.5, y + 128.5, barW - 1, 11);

  // moral barı: evde uyumak yükseltir, yerde yatmak düşürür
  ctx.fillStyle = "#e8e2d0";
  ctx.font = "12px monospace";
  ctx.fillText("Moral", x + 10, y + 154);
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillRect(barX, y + 148, barW, 12);
  const m = v.morale / 100;
  ctx.fillStyle = m > 0.5 ? "#7aa8e0" : m > 0.25 ? "#e0a83c" : "#d4453f";
  ctx.fillRect(barX + 1, y + 149, (barW - 2) * m, 10);
  ctx.strokeStyle = "#3a3f48";
  ctx.strokeRect(barX + 0.5, y + 148.5, barW - 1, 11);

  // moral dökümü: neden bazında birikimli artış/azalışlar
  ctx.font = "11px monospace";
  for (let i = 0; i < moraleEntries.length; i++) {
    const [reason, delta] = moraleEntries[i];
    const ly = y + 168 + i * 14;
    ctx.fillStyle = "#9a9488";
    ctx.fillText(reason, x + 24, ly);
    ctx.fillStyle = delta > 0 ? "#8fd05e" : "#e07a6a";
    const text = `${delta > 0 ? "+" : "−"}${Math.abs(delta).toFixed(1)}`;
    ctx.textAlign = "right";
    ctx.fillText(text, x + w - 14, ly);
    ctx.textAlign = "left";
  }

  // çanta: Minecraft tarzı — taşınan eşyalar sırayla slotlara dolar,
  // gerisi boş kalır
  ctx.font = "12px monospace";
  ctx.fillStyle = "#e8e2d0";
  ctx.fillText("Çanta", x + 10, y + breakdownH + 183);
  const slotS = 26;
  const held = ITEM_TYPES.filter((it) => v.inventory[it] > 0);
  for (let i = 0; i < 6; i++) {
    const sx = x + 64 + i * (slotS + 4);
    drawSlot(ctx, sx, y + breakdownH + 168, slotS);
    const item = held[i];
    if (!item) continue;
    drawItemIcon(ctx, item, sx + 3, y + breakdownH + 171, 20);
    drawSlotCount(ctx, sx, y + breakdownH + 168, slotS, v.inventory[item]);
  }

  // görev ataması iş panelinden (N) ve bina panellerinden yapılır
  ctx.fillStyle = "#9a9488";
  ctx.font = "11px monospace";
  ctx.fillText(
    v.baby
      ? "Bebekler 7 yaşında çocuk olur."
      : v.child
      ? "Çocuklar 18 yaşında işe başlar."
      : "Görevler binalardan ve N menüsünden atanır.",
    x + 10, y + breakdownH + 210, w - 20
  );

  // Merak: yakaran köylüyü mikrofonla teskin etme düğmesi
  if (v.pleadingTtl > 0) {
    profileCalmRect = { x: x + 10, y: y + h - 30, w: w - 20, h: 24 };
    const r = profileCalmRect;
    ctx.fillStyle = "rgba(255, 210, 60, 0.18)";
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = "#ffd23c";
    ctx.lineWidth = 1;
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    ctx.fillStyle = "#ffe296";
    ctx.font = "bold 12px monospace";
    ctx.textAlign = "center";
    ctx.fillText("🎤 Konuş ve teskin et", x + w / 2, r.y + 12);
    ctx.textAlign = "left";
  }
}

// ---- Hayvan paneli: ad, durum ve saldır/evcilleştir düğmeleri ----

let apanelRect = { x: 284, y: 44, w: 230, h: 150 };
let apanelAttack: { x: number; y: number; w: number; h: number } | null = null;
let apanelTame: { x: number; y: number; w: number; h: number } | null = null;

export type AnimalHit = "close" | "attack" | "tame" | "panel" | null;

export function animalPanelHitTest(sx: number, sy: number): AnimalHit {
  const cx = apanelRect.x + apanelRect.w - 24;
  const cy = apanelRect.y + 6;
  if (sx >= cx && sx <= cx + 18 && sy >= cy && sy <= cy + 18) return "close";
  const inRect = (r: { x: number; y: number; w: number; h: number } | null) =>
    r && sx >= r.x && sx <= r.x + r.w && sy >= r.y && sy <= r.y + r.h;
  if (inRect(apanelAttack)) return "attack";
  if (inRect(apanelTame)) return "tame";
  if (
    sx >= apanelRect.x && sx <= apanelRect.x + apanelRect.w &&
    sy >= apanelRect.y && sy <= apanelRect.y + apanelRect.h
  ) {
    return "panel";
  }
  return null;
}

export function drawAnimalPanel(
  ctx: CanvasRenderingContext2D,
  a: Animal,
  canTame: boolean
): void {
  const w = 230;
  const x = 284 + panelOffsets.animal.x;
  const y = 44 + panelOffsets.animal.y;
  const def = a.def;
  const isDog = a.type === "dog";
  const showAttack = a.wild && !isDog;
  let h = 96;
  if (showAttack) h += 28;
  if (canTame) h += 28;
  if (isDog || a.barn) h += 18;
  apanelRect = { x, y, w, h };
  apanelAttack = null;
  apanelTame = null;

  panelChrome(ctx, x, y, w, h, UI.green);
  drawCloseButton(ctx, x + w - 24, y + 6);

  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffe296";
  ctx.font = "bold 14px monospace";
  const sex = !isDog && a.barn ? (a.female ? " ♀" : " ♂") : "";
  const tag = isDog ? " (evcil)" : a.barn ? (a.adult ? " (çiftlik)" : " (yavru)") : def.predator ? " (yırtıcı!)" : " (yabani)";
  ctx.fillText(`${def.name}${sex}${tag}`, x + 12, y + 18);

  // can barı
  ctx.font = "11px monospace";
  ctx.fillStyle = "#9a9488";
  ctx.fillText("Can", x + 12, y + 40);
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillRect(x + 50, y + 34, w - 64, 10);
  ctx.fillStyle = "#e04040";
  ctx.fillRect(x + 51, y + 35, (w - 66) * Math.max(0, a.hp / def.hp), 8);

  // verim bilgisi
  ctx.fillStyle = "#b8b2a4";
  const yieldParts = [`${def.huntYield} et`];
  if (def.leatherYield > 0) yieldParts.push(`${def.leatherYield} deri`);
  if (def.woolYield > 0) yieldParts.push(`${def.woolYield} yün`);
  ctx.fillText(`Av verimi: ${yieldParts.join(", ")}`, x + 12, y + 56);
  const target = TAME_TARGET[a.type];
  if (target) {
    ctx.fillStyle = "#8fd05e";
    ctx.fillText(`Evcilleşince: ${ANIMAL_DEFS[target].name}`, x + 12, y + 72);
  } else {
    ctx.fillStyle = "#6a6458";
    ctx.fillText(isDog ? "Sahibiyle gezer, ava yardım eder" : "Evcilleştirilemez", x + 12, y + 72);
  }

  let by = y + 88;
  if (isDog && a.owner) {
    ctx.fillStyle = "#c9d4dc";
    ctx.fillText(`Sahibi: ${a.owner.fullName}`, x + 12, by - 4);
    by += 18;
  } else if (a.barn) {
    ctx.fillStyle = "#c9d4dc";
    ctx.fillText("Bir çiftliğe bağlı", x + 12, by - 4);
    by += 18;
  }

  const button = (label: string, color: string, border: string) => {
    const r = { x: x + 12, y: by, w: w - 24, h: 22 };
    ctx.fillStyle = color;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    ctx.fillStyle = "#e8e2d0";
    ctx.font = "bold 12px monospace";
    ctx.textAlign = "center";
    ctx.fillText(label, x + w / 2, by + 11);
    ctx.textAlign = "left";
    by += 28;
    return r;
  };

  if (showAttack) {
    apanelAttack = button(
      a.hunted ? "✕ Av işaretini kaldır" : "🏹 Saldır (avla)",
      a.hunted ? "rgba(255,255,255,0.08)" : "rgba(212, 69, 63, 0.2)",
      a.hunted ? "#5a5f68" : "#d4453f"
    );
  }
  if (canTame) {
    apanelTame = button(
      a.tameMark ? "✕ Evcilleştirmeyi bırak" : "🤝 Evcilleştir",
      a.tameMark ? "rgba(255,255,255,0.08)" : "rgba(143, 208, 94, 0.18)",
      a.tameMark ? "#5a5f68" : "#8fd05e"
    );
  }
}

// ---- Bina detay paneli ----

// Son çizilen panelin konumu (hit-test ile aynı kalması için)
let bpanel = { x: 12, y: 44, w: 252, h: 120 };
// İşçi al/çıkar düğmeleri (istihdam eden binalarda çizilir)
let bpanelHire: { x: number; y: number; w: number; h: number } | null = null;
let bpanelFire: { x: number; y: number; w: number; h: number } | null = null;
let bpanelDemolish: { x: number; y: number; w: number; h: number } | null = null;
// Alet atölyesi: balta/mızrak siparişi artır/azalt düğmeleri
let bpanelOrderPlus: { x: number; y: number; w: number; h: number } | null = null;
let bpanelOrderMinus: { x: number; y: number; w: number; h: number } | null = null;
let bpanelSpearPlus: { x: number; y: number; w: number; h: number } | null = null;
let bpanelSpearMinus: { x: number; y: number; w: number; h: number } | null = null;
let bpanelClothPlus: { x: number; y: number; w: number; h: number } | null = null;
let bpanelClothMinus: { x: number; y: number; w: number; h: number } | null = null;
// Çiftlik tür seçimi düğmeleri
let bpanelFarmBtns: { kind: "farmCow" | "farmChicken" | "farmSheep" | "farmPig"; x: number; y: number; w: number; h: number }[] = [];
// Meşale takma düğmesi (Doğa araştırıldıysa, meşalesiz binalarda)
let bpanelTorch: { x: number; y: number; w: number; h: number } | null = null;
// Ev ocağı (yakıt) aç/kapa düğmesi
let bpanelFuel: { x: number; y: number; w: number; h: number } | null = null;

export function buildingPanelHitTest(
  sx: number,
  sy: number
):
  | "close" | "hire" | "fire" | "demolish" | "orderPlus" | "orderMinus"
  | "spearPlus" | "spearMinus" | "clothPlus" | "clothMinus" | "torch" | "fuel"
  | "farmCow" | "farmChicken" | "farmSheep" | "farmPig" | "panel" | null {
  const cx = bpanel.x + bpanel.w - 24;
  const cy = bpanel.y + 6;
  if (sx >= cx && sx <= cx + 18 && sy >= cy && sy <= cy + 18) return "close";
  const inRect = (r: { x: number; y: number; w: number; h: number } | null) =>
    r && sx >= r.x && sx <= r.x + r.w && sy >= r.y && sy <= r.y + r.h;
  if (inRect(bpanelHire)) return "hire";
  if (inRect(bpanelFire)) return "fire";
  if (inRect(bpanelOrderPlus)) return "orderPlus";
  if (inRect(bpanelOrderMinus)) return "orderMinus";
  if (inRect(bpanelSpearPlus)) return "spearPlus";
  if (inRect(bpanelSpearMinus)) return "spearMinus";
  if (inRect(bpanelClothPlus)) return "clothPlus";
  if (inRect(bpanelClothMinus)) return "clothMinus";
  for (const fb of bpanelFarmBtns) {
    if (inRect(fb)) return fb.kind;
  }
  if (inRect(bpanelTorch)) return "torch";
  if (inRect(bpanelFuel)) return "fuel";
  if (inRect(bpanelDemolish)) return "demolish";
  if (sx >= bpanel.x && sx <= bpanel.x + bpanel.w && sy >= bpanel.y && sy <= bpanel.y + bpanel.h) {
    return "panel";
  }
  return null;
}

function drawCloseButton(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  // yuvarlak kapatma düğmesi (kırmızımsı vurgu)
  ctx.beginPath();
  ctx.arc(x + 9, y + 9, 9, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(200, 80, 60, 0.22)";
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(224, 122, 104, 0.7)";
  ctx.stroke();
  ctx.strokeStyle = "#f0b0a4";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(x + 6, y + 6);
  ctx.lineTo(x + 12, y + 12);
  ctx.moveTo(x + 12, y + 6);
  ctx.lineTo(x + 6, y + 12);
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
  villagers: Villager[],
  animals: Animal[] = []
): void {
  const def = b.def;
  const w = 252;
  // varsayılan konum profil panelinin sağı: ikisi aynı anda açılabilir
  const x = 284 + panelOffsets.building.x;
  const y = 44 + panelOffsets.building.y;
  ctx.font = "11px monospace";
  const descLines = wrapText(ctx, def.desc, w - 24);

  // içerik yüksekliğini hesapla
  let h = 40 + descLines.length * 14 + 10;
  if (!b.done) h += 34;
  else {
    if (isHousing(b)) h += 20 + (hasTech("nature") ? 28 : 18);
    if (b.def.maxWorkers > 0) h += 26;
    if (isDepositPoint(b)) {
      const itemCount = ITEM_TYPES.filter(isItemVisible).length;
      h += 34 + itemCount * 17 + 6;
    }
    else if (b.type === BuildingType.Temple) h += 40;
    else if (
      b.type === BuildingType.Woodcutter ||
      b.type === BuildingType.Gatherer ||
      b.type === BuildingType.HunterLodge
    ) h += 22;
    else if (b.type === BuildingType.Barn) h += b.farmType ? 42 : 52;
    else if (b.type === BuildingType.ToolWorkshop) {
      h += 64;
      if (hasTech("kan")) h += 40;
      if (hasTech("leatherworking")) h += 40;
    }
  }
  // meşale takma düğmesi (Doğa araştırıldıysa, meşalesiz tamamlanmış binalarda)
  const torchable = b.done && !b.hasTorch && b.type !== BuildingType.Camp;
  const canTorch = torchable && hasTech("nature");
  const torchLocked = torchable && !hasTech("nature");
  if (canTorch) h += 30;
  else if (torchLocked || (b.done && b.hasTorch)) h += 18;
  if (b.type !== BuildingType.Camp) h += 32; // yık düğmesi satırı
  bpanel = { x, y, w, h };
  bpanelHire = null;
  bpanelFire = null;
  bpanelDemolish = null;
  bpanelOrderPlus = null;
  bpanelOrderMinus = null;
  bpanelSpearPlus = null;
  bpanelSpearMinus = null;
  bpanelClothPlus = null;
  bpanelClothMinus = null;
  bpanelFarmBtns = [];
  bpanelTorch = null;
  bpanelFuel = null;

  panelChrome(ctx, x, y, w, h, UI.goldDim);
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

  // meşale tak: bina geceyi aydınlatır
  if (canTorch) {
    bpanelTorch = { x: x + 12, y: y + h - 58, w: w - 24, h: 22 };
    ctx.fillStyle = "rgba(240, 170, 60, 0.15)";
    ctx.fillRect(bpanelTorch.x, bpanelTorch.y, bpanelTorch.w, bpanelTorch.h);
    ctx.strokeStyle = "#e0a83c";
    ctx.lineWidth = 1;
    ctx.strokeRect(bpanelTorch.x + 0.5, bpanelTorch.y + 0.5, bpanelTorch.w - 1, bpanelTorch.h - 1);
    ctx.fillStyle = "#ffd23c";
    ctx.font = "bold 12px monospace";
    ctx.textAlign = "center";
    ctx.fillText(`🔥 Meşale tak (${TORCH_ATTACH_COST} dal)`, x + w / 2, y + h - 47);
    ctx.textAlign = "left";
    ctx.font = "11px monospace";
  } else if (b.hasTorch) {
    ctx.fillStyle = "#ffd23c";
    ctx.font = "11px monospace";
    ctx.fillText("🔥 Meşaleli: geceyi aydınlatır", x + 12, y + h - 44);
  } else if (torchLocked) {
    ctx.fillStyle = "#8a8478";
    ctx.font = "11px monospace";
    ctx.fillText("🔥 Meşale takmak için önce Doğa araştırılmalı", x + 12, y + h - 44, w - 24);
  }

  // yık düğmesi (kamp hariç; yarı odun iadesi)
  if (b.type !== BuildingType.Camp) {
    const refund = Math.floor(b.def.cost / 2);
    bpanelDemolish = { x: x + 12, y: y + h - 30, w: w - 24, h: 22 };
    ctx.fillStyle = "rgba(212, 69, 63, 0.18)";
    ctx.fillRect(bpanelDemolish.x, bpanelDemolish.y, bpanelDemolish.w, bpanelDemolish.h);
    ctx.strokeStyle = "#d4453f";
    ctx.lineWidth = 1;
    ctx.strokeRect(bpanelDemolish.x + 0.5, bpanelDemolish.y + 0.5, bpanelDemolish.w - 1, bpanelDemolish.h - 1);
    ctx.fillStyle = "#f0a09a";
    ctx.font = "bold 12px monospace";
    ctx.textAlign = "center";
    ctx.fillText(`✕ Yık (+${refund} dal iade)`, x + w / 2, y + h - 19);
    ctx.textAlign = "left";
    ctx.font = "11px monospace";
  }

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

    // yakıt: kışın evde dal yakma açık/kapalı (Doğa gerekir)
    if (hasTech("nature")) {
      bpanelFuel = { x: x + 12, y: ly - 2, w: w - 24, h: 22 };
      const on = b.fueled;
      ctx.fillStyle = on ? "rgba(240, 140, 50, 0.22)" : "rgba(255,255,255,0.06)";
      ctx.fillRect(bpanelFuel.x, bpanelFuel.y, bpanelFuel.w, bpanelFuel.h);
      ctx.strokeStyle = on ? "#e88030" : "#5a5f68";
      ctx.lineWidth = 1;
      ctx.strokeRect(bpanelFuel.x + 0.5, bpanelFuel.y + 0.5, bpanelFuel.w - 1, 21);
      ctx.fillStyle = on ? "#ffb060" : "#c9c4b6";
      ctx.font = "bold 12px monospace";
      ctx.textAlign = "center";
      const lit = b.burning ? " 🔥" : "";
      ctx.fillText(`Ocak: ${on ? "Açık" : "Kapalı"}${lit}  (kışın dal yakar)`, x + w / 2, ly + 9);
      ctx.textAlign = "left";
      ly += 28;
    } else {
      ctx.fillStyle = "#8a8478";
      ctx.font = "11px monospace";
      ctx.fillText("🔥 Ocak için önce Doğa araştırılmalı", x + 12, ly + 6, w - 24);
      ly += 18;
    }
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
    // depo içeriği: her ürün ayrı satır + kendi sınırı; dolu olan kırmızı "DOLU"
    ctx.font = "bold 12px monospace";
    ctx.fillStyle = "#b8b2a2";
    ctx.fillText(`Ürün başına sınır: ${resources.cap}`, x + 12, ly);
    ly += 20;

    const visibleItems = ITEM_TYPES.filter(isItemVisible);
    ctx.font = "12px monospace";
    for (const item of visibleItems) {
      ctx.fillStyle = ITEM_INFO[item].color;
      ctx.fillRect(x + 12, ly - 5, 10, 10);
      ctx.strokeStyle = "#3a3f48";
      ctx.strokeRect(x + 12.5, ly - 4.5, 9, 9);
      const name = ITEM_INFO[item].name;
      const full = resources[item] >= resources.cap;
      ctx.fillStyle = full ? "#ff8a6a" : "#e8e2d0";
      ctx.fillText(
        `${name[0].toUpperCase()}${name.slice(1)}: ${resources[item]}/${resources.cap}`,
        x + 30, ly
      );
      if (full) {
        ctx.fillStyle = "#ff6655";
        ctx.font = "bold 11px monospace";
        ctx.fillText("DOLU", x + w - 52, ly);
        ctx.font = "12px monospace";
      }
      ly += 17;
    }
  } else if (
    b.type === BuildingType.Woodcutter ||
    b.type === BuildingType.Gatherer
  ) {
    const marked = b.type === BuildingType.Woodcutter
      ? world.countMarkedNear(world.markedTrees, b.x + 1, b.y + 1, 9)
      : world.countMarkedNear(world.markedBushes, b.x + 1, b.y + 1, 9);
    ctx.fillStyle = "#e8e2d0";
    ctx.font = "12px monospace";
    ctx.fillText(`Çevrede işaretli: ${marked}`, x + 12, ly + 2);
  } else if (b.type === BuildingType.ToolWorkshop) {
    // Balta üretim sırası: stok, sipariş ve +/− düğmeleri
    ctx.font = "12px monospace";
    ctx.fillStyle = "#c9d4dc";
    ctx.fillText(`🪓 Balta stoğu: ${b.toolStock}`, x + 12, ly);
    if (b.toolReserved > 0) {
      ctx.fillStyle = "#9a9488";
      ctx.fillText(`(${b.toolReserved} alınıyor)`, x + 150, ly);
    }
    ly += 20;
    ctx.fillStyle = b.orders > 0 ? "#e8e2d0" : "#e0a83c";
    ctx.fillText(`Sipariş: ${b.orders}`, x + 12, ly);
    bpanelOrderMinus = { x: x + 140, y: ly - 9, w: 22, h: 18 };
    bpanelOrderPlus = { x: x + 204, y: ly - 9, w: 22, h: 18 };
    for (const [r, sym] of [[bpanelOrderMinus, "−"], [bpanelOrderPlus, "+"]] as const) {
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
    ly += 20;
    if (hasTech("kan")) {
      ctx.fillStyle = "#d4c49a";
      ctx.font = "12px monospace";
      ctx.fillText(`🗡 Mızrak stoğu: ${b.spearStock}`, x + 12, ly);
      if (b.spearReserved > 0) {
        ctx.fillStyle = "#9a9488";
        ctx.fillText(`(${b.spearReserved} alınıyor)`, x + 150, ly);
      }
      ly += 20;
      ctx.fillStyle = b.spearOrders > 0 ? "#e8e2d0" : "#e0a83c";
      ctx.fillText(`Sipariş: ${b.spearOrders}`, x + 12, ly);
      bpanelSpearMinus = { x: x + 140, y: ly - 9, w: 22, h: 18 };
      bpanelSpearPlus = { x: x + 204, y: ly - 9, w: 22, h: 18 };
      for (const [r, sym] of [[bpanelSpearMinus, "−"], [bpanelSpearPlus, "+"]] as const) {
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
      ly += 20;
    }
    if (hasTech("leatherworking")) {
      ctx.fillStyle = "#a87c4f";
      ctx.font = "12px monospace";
      ctx.fillText(`🧥 Giysi stoğu: ${b.clothStock}`, x + 12, ly);
      if (b.clothReserved > 0) {
        ctx.fillStyle = "#9a9488";
        ctx.fillText(`(${b.clothReserved} alınıyor)`, x + 150, ly);
      }
      ly += 20;
      ctx.fillStyle = b.clothOrders > 0 ? "#e8e2d0" : "#e0a83c";
      ctx.fillText(`Sipariş: ${b.clothOrders}`, x + 12, ly);
      bpanelClothMinus = { x: x + 140, y: ly - 9, w: 22, h: 18 };
      bpanelClothPlus = { x: x + 204, y: ly - 9, w: 22, h: 18 };
      for (const [r, sym] of [[bpanelClothMinus, "−"], [bpanelClothPlus, "+"]] as const) {
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
      ly += 20;
    }
    ctx.font = "11px monospace";
    ctx.fillStyle = "#9a9488";
    let recipe = `Balta: ${AXE_WOOD_COST} dal+${AXE_STONE_COST} taş`;
    if (hasTech("kan")) recipe += " • Mızrak: 5 dal+2 odun+5 taş";
    if (hasTech("leatherworking")) recipe += " • Giysi: 3 deri";
    ctx.fillText(recipe, x + 12, ly, w - 24);
  } else if (b.type === BuildingType.HunterLodge) {
    ctx.font = "12px monospace";
    ctx.fillStyle = "#e8e2d0";
    ctx.fillText("Avcılar mızrakla en yakın avı vurur", x + 12, ly + 2);
  } else if (b.type === BuildingType.Barn) {
    ctx.font = "12px monospace";
    if (b.farmType) {
      const herd = animals.filter((a) => a.barn === b && !a.dead);
      const adultF = herd.filter((a) => a.adult && a.female).length;
      const adultM = herd.filter((a) => a.adult && !a.female).length;
      const babies = herd.filter((a) => !a.adult).length;
      const prod = ANIMAL_DEFS[b.farmType].product;
      const prodName = prod === "milk" ? "süt" : prod === "egg" ? "yumurta" : prod === "wool" ? "yün" : "et";
      ctx.fillStyle = "#8fd05e";
      ctx.fillText(`${ANIMAL_DEFS[b.farmType].name} ağılı — ürün: ${prodName}`, x + 12, ly);
      ctx.fillStyle = herd.length >= BARN_CAPACITY ? "#e0a83c" : "#c9d4dc";
      ctx.fillText(
        `Sürü: ${herd.length}/${BARN_CAPACITY}  (♀${adultF} ♂${adultM} 🍼${babies})`,
        x + 12, ly + 16
      );
    } else {
      ctx.fillStyle = "#e0a83c";
      ctx.fillText("Tür seç (evcilleşenler buraya gelir):", x + 12, ly);
      const opts = [
        { kind: "farmCow", label: "İnek" },
        { kind: "farmChicken", label: "Tavuk" },
        { kind: "farmSheep", label: "Koyun" },
        { kind: "farmPig", label: "Domuz" },
      ] as const;
      let bx = x + 12;
      const byy = ly + 14;
      ctx.font = "11px monospace";
      for (const o of opts) {
        const bw = ctx.measureText(o.label).width + 14;
        bpanelFarmBtns.push({ kind: o.kind, x: bx, y: byy, w: bw, h: 18 });
        ctx.fillStyle = "rgba(143, 208, 94, 0.15)";
        ctx.fillRect(bx, byy, bw, 18);
        ctx.strokeStyle = "#8fd05e";
        ctx.lineWidth = 1;
        ctx.strokeRect(bx + 0.5, byy + 0.5, bw - 1, 17);
        ctx.fillStyle = "#c8e8b0";
        ctx.fillText(o.label, bx + 7, byy + 9);
        bx += bw + 6;
      }
    }
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
    // ayin verimi: rahip sayısıyla üstel artar
    ctx.fillStyle = "#b08fe0";
    ctx.font = "11px monospace";
    ctx.fillText(`📖 Ayin verimi: +${worshipState.yield} bilgi (rahip arttıkça hızlanır)`, x + 12, ly + 18, w - 24);
  }
}

// ---- Nüfus ve iş yönetim paneli (Banished tarzı: iş bazlı sayılar) ----

const POP_JOB_ROW_H = 24;
const POP_W = 640;
let popRect = { x: 0, y: 0, w: POP_W, h: 0 };
let popJobsY = 0;

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
  | { kind: "panel" }
  | null;

export function popPanelHitTest(
  sx: number,
  sy: number,
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

  if (isOverPopPanel(sx, sy)) return { kind: "panel" };
  return null;
}

export function drawPopulationPanel(
  ctx: CanvasRenderingContext2D,
  villagers: Villager[],
  buildings: Building[]
): void {
  const count = villagers.length;
  const rows = employmentRows(buildings);

  const w = POP_W;
  const x = (ctx.canvas.width - w) / 2 + panelOffsets.pop.x;
  const y = 54 + panelOffsets.pop.y;
  popJobsY = y + 82;
  const h = popJobsY - y + rows.length * POP_JOB_ROW_H + 14;
  popRect = { x, y, w, h };

  panelChrome(ctx, x, y, w, h, UI.green);
  drawCloseButton(ctx, x + w - 26, y + 8);

  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffe296";
  ctx.font = "bold 15px monospace";
  ctx.fillText("İş Yönetimi", x + 12, y + 18);

  // özet: ortalık işçisi havuzu kalan herkes
  const babies = villagers.filter((v) => v.baby).length;
  const children = villagers.filter((v) => v.child).length;
  const caring = villagers.filter((v) => v.caringBaby && !v.caringBaby.dead).length;
  const laborers = villagers.filter(
    (v) => v.canWork && !v.caringBaby && v.assignment.kind === "laborer"
  ).length;
  ctx.font = "12px monospace";
  ctx.fillStyle = "#8fd05e";
  ctx.fillText(`Ortalık işleri: ${laborers}`, x + 12, y + 44);
  ctx.fillStyle = "#9a9488";
  ctx.font = "11px monospace";
  // ev doluluğu ve evsiz sayısı
  const houses = buildings.filter((b) => b.type === BuildingType.House && b.done);
  const occupiedHouses = houses.filter((hb) => villagers.some((v) => v.home === hb)).length;
  const homeless = villagers.filter((v) => !v.home).length;
  ctx.fillText(
    `•  Nüfus: ${count}  •  Bebek: ${babies}  •  Çocuk: ${children}` +
      (caring > 0 ? `  •  Bebeğe bakan anne: ${caring}` : ""),
    x + 160, y + 44
  );
  ctx.fillStyle = "#c9a35a";
  ctx.fillText(`🏠 Evler: ${occupiedHouses}/${houses.length} dolu`, x + 12, y + 60);
  if (homeless > 0) {
    ctx.fillStyle = "#ff8a6a";
    ctx.fillText(`⚠ Evsiz: ${homeless} — yeni ev yapın!`, x + 200, y + 60);
  } else {
    ctx.fillStyle = "#6a9a5a";
    ctx.fillText("✓ Herkesin bir evi var", x + 200, y + 60);
  }

  // iş satırları
  for (let i = 0; i < rows.length; i++) {
    const b = rows[i];
    const ry = popJobsY + i * POP_JOB_ROW_H;
    if (i % 2 === 0) {
      ctx.fillStyle = "rgba(255,255,255,0.04)";
      ctx.fillRect(x + 4, ry, w - 8, POP_JOB_ROW_H);
    }
    const assigned = b === null
      ? villagers.filter((v) => v.canWork && v.assignment.kind === "builder").length
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

}

// ---- İnsanlar paneli: tüm köylüler özellik ve ekipmanlarıyla ----

const PEOPLE_ROW_H = 24;
const PEOPLE_MAX_ROWS = 12;
const PEOPLE_W = 880;
let peopleScroll = 0;
let peopleRect = { x: 0, y: 0, w: PEOPLE_W, h: 0 };
let peopleListY = 0;

export function peopleScrollBy(n: number, count: number): void {
  peopleScroll = Math.max(0, Math.min(Math.max(0, count - PEOPLE_MAX_ROWS), peopleScroll + n));
}

export function isOverPeoplePanel(sx: number, sy: number): boolean {
  return sx >= peopleRect.x && sx <= peopleRect.x + peopleRect.w &&
    sy >= peopleRect.y && sy <= peopleRect.y + peopleRect.h;
}

export type PeopleHit =
  | { kind: "close" }
  | { kind: "select"; index: number }
  | { kind: "panel" }
  | null;

export function peoplePanelHitTest(sx: number, sy: number, villagers: Villager[]): PeopleHit {
  const cx = peopleRect.x + peopleRect.w - 26;
  const cy = peopleRect.y + 8;
  if (sx >= cx && sx <= cx + 18 && sy >= cy && sy <= cy + 18) return { kind: "close" };
  const count = villagers.length;
  const visible = Math.min(count, PEOPLE_MAX_ROWS);
  if (sy >= peopleListY && sy < peopleListY + visible * PEOPLE_ROW_H) {
    const row = Math.floor((sy - peopleListY) / PEOPLE_ROW_H);
    const index = peopleScroll + row;
    if (index < count && sx >= peopleRect.x + 10 && sx <= peopleRect.x + 190) {
      return { kind: "select", index };
    }
  }
  if (isOverPeoplePanel(sx, sy)) return { kind: "panel" };
  return null;
}

export function drawPeoplePanel(ctx: CanvasRenderingContext2D, villagers: Villager[]): void {
  const count = villagers.length;
  peopleScroll = Math.max(0, Math.min(Math.max(0, count - PEOPLE_MAX_ROWS), peopleScroll));
  const visible = Math.min(count, PEOPLE_MAX_ROWS);

  const w = Math.min(PEOPLE_W, ctx.canvas.width - 16);
  const x = (ctx.canvas.width - w) / 2 + panelOffsets.people.x;
  const y = 54 + panelOffsets.people.y;
  peopleListY = y + 66;
  const h = peopleListY - y + visible * PEOPLE_ROW_H + 12;
  peopleRect = { x, y, w, h };

  panelChrome(ctx, x, y, w, h, UI.blue);
  drawCloseButton(ctx, x + w - 26, y + 8);

  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffe296";
  ctx.font = "bold 15px monospace";
  ctx.fillText("İnsanlar", x + 12, y + 18);
  ctx.fillStyle = "#9a9488";
  ctx.font = "11px monospace";
  ctx.fillText(`Nüfus: ${count} (isme tıkla: profil)`, x + 110, y + 18);
  if (count > PEOPLE_MAX_ROWS) {
    ctx.textAlign = "right";
    ctx.fillText(
      `▲▼ kaydır (${peopleScroll + 1}-${peopleScroll + visible}/${count})`,
      x + w - 36, y + 18
    );
    ctx.textAlign = "left";
  }

  // sütun başlıkları
  const cols = {
    name: x + 12, age: x + 180, sex: x + 214, job: x + 244,
    gear: x + 430, morale: x + 590, hunger: x + 660, status: x + 726,
  };
  ctx.fillStyle = "#8a8478";
  ctx.font = "bold 11px monospace";
  const hy = y + 48;
  ctx.fillText("Ad", cols.name, hy);
  ctx.fillText("Yaş", cols.age, hy);
  ctx.fillText("C", cols.sex, hy);
  ctx.fillText("Görev", cols.job, hy);
  ctx.fillText("Ekipman", cols.gear, hy);
  ctx.fillText("Moral", cols.morale, hy);
  ctx.fillText("Tokluk", cols.hunger, hy);
  ctx.fillText("Durum", cols.status, hy);

  for (let row = 0; row < visible; row++) {
    const v = villagers[peopleScroll + row];
    const ry = peopleListY + row * PEOPLE_ROW_H;
    if (row % 2 === 0) {
      ctx.fillStyle = "rgba(255,255,255,0.04)";
      ctx.fillRect(x + 4, ry, w - 8, PEOPLE_ROW_H);
    }
    // ad + rozetler (hamile/eğitimli)
    ctx.fillStyle = "#9ad0ff";
    ctx.font = "bold 12px monospace";
    let name = v.fullName;
    if (v.pregnant) name = `🤰 ${name}`;
    if (v.educated) name = `🎓 ${name}`;
    if (v.sick) name = `🤒 ${name}`;
    ctx.fillText(name, cols.name, ry + PEOPLE_ROW_H / 2, 162);
    // yaş + cinsiyet
    ctx.fillStyle = "#8a8478";
    ctx.font = "11px monospace";
    ctx.fillText(v.baby ? "👶" : `${v.age}`, cols.age, ry + PEOPLE_ROW_H / 2);
    ctx.fillText(v.identity.female ? "♀" : "♂", cols.sex, ry + PEOPLE_ROW_H / 2);
    // görev
    ctx.fillStyle = "#c9a35a";
    const jobLabel = v.baby ? "Bebek" : v.child ? "Çocuk" : assignmentLabel(v.assignment);
    ctx.fillText(jobLabel, cols.job, ry + PEOPLE_ROW_H / 2, 178);
    // ekipman
    ctx.fillStyle = "#c9d4dc";
    const gear: string[] = [];
    if (v.hasAxe) gear.push("🪓");
    if (v.spears > 0) gear.push(`🗡×${v.spears}`);
    if (v.hasClothes) gear.push("🧥");
    ctx.fillText(gear.length > 0 ? gear.join(" ") : "—", cols.gear, ry + PEOPLE_ROW_H / 2, 150);
    // moral mini bar
    const m = v.morale / 100;
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(cols.morale, ry + 8, 50, 8);
    ctx.fillStyle = m > 0.5 ? "#7aa8e0" : m > 0.25 ? "#e0a83c" : "#d4453f";
    ctx.fillRect(cols.morale + 1, ry + 9, 48 * m, 6);
    // tokluk mini bar
    const fullness = 1 - v.hunger / 100;
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(cols.hunger, ry + 8, 50, 8);
    ctx.fillStyle = fullness > 0.5 ? "#6fbf4a" : fullness > 0.2 ? "#e0a83c" : "#d4453f";
    ctx.fillRect(cols.hunger + 1, ry + 9, 48 * fullness, 6);
    // durum
    ctx.fillStyle = "#c8c2b0";
    ctx.fillText(v.statusText, cols.status, ry + PEOPLE_ROW_H / 2, w - (cols.status - x) - 12);
  }
}

// ---- Savaş ve Tehlike Defteri ----

const JOURNAL_W = 470;
const JOURNAL_ROW_H = 30;
const JOURNAL_MAX_ROWS = 12;
let journalScroll = 0;
let journalRect = { x: 0, y: 0, w: JOURNAL_W, h: 0 };

export function journalScrollBy(n: number): void {
  journalScroll = Math.max(0, Math.min(Math.max(0, journal.length - JOURNAL_MAX_ROWS), journalScroll + n));
}

export function isOverJournalPanel(sx: number, sy: number): boolean {
  return sx >= journalRect.x && sx <= journalRect.x + journalRect.w &&
    sy >= journalRect.y && sy <= journalRect.y + journalRect.h;
}

export function journalPanelHitTest(sx: number, sy: number): "close" | "panel" | null {
  const cx = journalRect.x + journalRect.w - 26;
  const cy = journalRect.y + 8;
  if (sx >= cx && sx <= cx + 18 && sy >= cy && sy <= cy + 18) return "close";
  if (isOverJournalPanel(sx, sy)) return "panel";
  return null;
}

export function drawJournalPanel(ctx: CanvasRenderingContext2D): void {
  const count = journal.length;
  journalScroll = Math.max(0, Math.min(Math.max(0, count - JOURNAL_MAX_ROWS), journalScroll));
  const visible = Math.min(count, JOURNAL_MAX_ROWS);

  const w = JOURNAL_W;
  const x = ctx.canvas.width - w - 12 + panelOffsets.journal.x;
  const y = 54 + panelOffsets.journal.y;
  const listY = y + 40;
  const h = 40 + Math.max(1, visible) * JOURNAL_ROW_H + 12;
  journalRect = { x, y, w, h };

  // deri kaplı defter görünümü
  panelChrome(ctx, x, y, w, h, UI.brown);
  ctx.strokeStyle = "rgba(180, 140, 90, 0.25)";
  ctx.lineWidth = 1;
  rrect(ctx, x + 5.5, y + 5.5, w - 11, h - 11, 6);
  ctx.stroke();
  drawCloseButton(ctx, x + w - 26, y + 8);

  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillStyle = "#e8c87a";
  ctx.font = "bold 15px monospace";
  ctx.fillText("📖 Savaş ve Tehlike Defteri", x + 12, y + 20);
  if (count > JOURNAL_MAX_ROWS) {
    ctx.fillStyle = "#9a9488";
    ctx.font = "11px monospace";
    ctx.textAlign = "right";
    ctx.fillText(`▲▼ (${journalScroll + 1}-${journalScroll + visible}/${count})`, x + w - 36, y + 20);
    ctx.textAlign = "left";
  }

  if (count === 0) {
    ctx.fillStyle = "#9a9488";
    ctx.font = "12px monospace";
    ctx.fillText("Henüz kayda değer bir olay yaşanmadı.", x + 14, listY + 14);
    return;
  }

  for (let row = 0; row < visible; row++) {
    const e = journal[journalScroll + row];
    const ry = listY + row * JOURNAL_ROW_H;
    if (row % 2 === 0) {
      ctx.fillStyle = "rgba(255,255,255,0.04)";
      ctx.fillRect(x + 6, ry, w - 12, JOURNAL_ROW_H);
    }
    ctx.fillStyle = "#8a8478";
    ctx.font = "10px monospace";
    ctx.fillText(e.stamp, x + 14, ry + 9);
    ctx.fillStyle = "#e0d8c4";
    ctx.font = "12px monospace";
    ctx.fillText(e.text, x + 14, ry + 21, w - 28);
  }
}

const TECH_CARD_W = 210;
const TECH_CARD_H = 130;
const TECH_COL_W = 260;
const TECH_ROW_H = 86;
const TECH_TOP = 34; // üst barın altından başlar (tam ekran)
const TECH_MAX_COL = 5; // en sağdaki sütun (gridX)
// Sütun başlıkları: bilgi soldan sağa çağ çağ akar
const TECH_COL_NAMES = ["Sezgiler", "Temeller", "Beceriler", "Zanaat", "Ustalık", "Gelenek"];
let techRect = { x: 0, y: 0, w: 0, h: 0 };
let techScrollX = 0; // yatay kaydırma (sürükle / tekerlek)
let techViewW = 1280;

export function techScrollBy(dx: number): void {
  const contentW = 80 + (TECH_MAX_COL + 1) * TECH_COL_W;
  const max = Math.max(0, contentW - techViewW);
  techScrollX = Math.max(0, Math.min(max, techScrollX + dx));
}

export type TechHit =
  | { kind: "close" }
  | { kind: "buy"; id: TechId }
  | { kind: "autoToggle" }
  | { kind: "panel" }
  | null;

let techAutoRect = { x: 0, y: 0, w: 0, h: 0 };

function getTechPos(tech: Tech, panelX: number, panelY: number) {
  const startX = panelX + 60 - techScrollX;
  const startY = panelY + 88;
  return {
    x: startX + tech.gridX * TECH_COL_W,
    y: startY + tech.gridY * TECH_ROW_H,
  };
}

export function techPanelHitTest(sx: number, sy: number): TechHit {
  const cx = techRect.x + techRect.w - 26;
  const cy = techRect.y + 8;
  if (sx >= cx && sx <= cx + 18 && sy >= cy && sy <= cy + 18) return { kind: "close" };
  if (sx >= techAutoRect.x && sx <= techAutoRect.x + techAutoRect.w &&
      sy >= techAutoRect.y && sy <= techAutoRect.y + techAutoRect.h) return { kind: "autoToggle" };

  const cardW = TECH_CARD_W;
  const cardH = TECH_CARD_H;
  for (let i = 0; i < TECHS.length; i++) {
    const tech = TECHS[i];
    const pos = getTechPos(tech, techRect.x, techRect.y);
    if (sx >= pos.x && sx <= pos.x + cardW && sy >= pos.y && sy <= pos.y + cardH) {
      const owned = hasTech(tech.id);
      const locked = !prereqsMet(tech);
      if (!owned && !locked) {
        return { kind: "buy", id: tech.id };
      }
    }
  }

  if (sx >= techRect.x && sx <= techRect.x + techRect.w &&
      sy >= techRect.y && sy <= techRect.y + techRect.h) {
    return { kind: "panel" };
  }
  return null;
}

// ---- Otomasyon (Politika) paneli ----

let policyRect = { x: 0, y: 0, w: 0, h: 0 };
let policyRows: { key: PolicyKey; x: number; y: number; w: number; h: number }[] = [];

export type PolicyHit = { kind: "close" } | { kind: "toggle"; key: PolicyKey } | { kind: "panel" } | null;

export function policyPanelHitTest(sx: number, sy: number): PolicyHit {
  const cx = policyRect.x + policyRect.w - 26;
  const cy = policyRect.y + 8;
  if (sx >= cx && sx <= cx + 18 && sy >= cy && sy <= cy + 18) return { kind: "close" };
  for (const r of policyRows) {
    if (sx >= r.x && sx <= r.x + r.w && sy >= r.y && sy <= r.y + r.h) return { kind: "toggle", key: r.key };
  }
  if (sx >= policyRect.x && sx <= policyRect.x + policyRect.w &&
      sy >= policyRect.y && sy <= policyRect.y + policyRect.h) return { kind: "panel" };
  return null;
}

export function isOverPolicyPanel(sx: number, sy: number): boolean {
  return sx >= policyRect.x && sx <= policyRect.x + policyRect.w &&
    sy >= policyRect.y && sy <= policyRect.y + policyRect.h;
}

export function drawPolicyPanel(ctx: CanvasRenderingContext2D): void {
  const w = 420;
  const rowH = 46;
  const h = 52 + POLICY_INFO.length * rowH + 12;
  const x = (ctx.canvas.width - w) / 2;
  const y = 80;
  policyRect = { x, y, w, h };
  policyRows = [];

  panelChrome(ctx, x, y, w, h, UI.gold);
  drawCloseButton(ctx, x + w - 26, y + 8);
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffe296";
  ctx.font = "bold 15px monospace";
  ctx.fillText("⚙ Otomasyon", x + 14, y + 20);
  ctx.fillStyle = "#9a9488";
  ctx.font = "11px monospace";
  ctx.fillText("Angarya işler otomatik — sen yalnızca yön ver", x + 150, y + 20);

  let ry = y + 44;
  for (const info of POLICY_INFO) {
    const on = policy[info.key];
    // satır arka planı
    rrect(ctx, x + 10, ry, w - 20, rowH - 6, 6);
    ctx.fillStyle = "rgba(255,255,255,0.03)";
    ctx.fill();
    // metin
    ctx.fillStyle = on ? "#e8e2d0" : "#8a8478";
    ctx.font = "bold 13px monospace";
    ctx.fillText(info.name, x + 22, ry + 14);
    ctx.fillStyle = "#9a9488";
    ctx.font = "10px monospace";
    ctx.fillText(info.desc, x + 22, ry + 30, w - 140);
    // aç/kapa anahtarı (sağda)
    const tw = 78, th = 24;
    const tx = x + w - tw - 16, ty = ry + (rowH - 6 - th) / 2;
    chipBg(ctx, tx, ty, tw, th, on, on ? UI.green : UI.muted);
    ctx.fillStyle = on ? "#bfe89a" : "#9a9488";
    ctx.font = "bold 12px monospace";
    ctx.textAlign = "center";
    ctx.fillText(on ? "AÇIK" : "KAPALI", tx + tw / 2, ry + (rowH - 6) / 2);
    ctx.textAlign = "left";
    policyRows.push({ key: info.key, x: tx, y: ty, w: tw, h: th });
    ry += rowH;
  }
}

export function drawTechPanel(ctx: CanvasRenderingContext2D, autoResearch = false): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height - TECH_TOP;
  const x = 0;
  const y = TECH_TOP;
  techRect = { x, y, w, h };
  techViewW = w;
  techScrollBy(0); // pencere küçüldüyse kaydırmayı sınırla

  // tam ekran zemin: koyu taş dokusu hissi + kenar vinyeti
  ctx.fillStyle = "rgba(12, 11, 16, 0.97)";
  ctx.fillRect(x, y, w, h);
  const vg = ctx.createRadialGradient(w / 2, y + h / 2, h * 0.3, w / 2, y + h / 2, h);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.5)");
  ctx.fillStyle = vg;
  ctx.fillRect(x, y, w, h);

  // sütun kılavuzları ve çağ başlıkları
  for (let c = 0; c <= TECH_MAX_COL; c++) {
    const cx = 60 - techScrollX + c * TECH_COL_W;
    if (cx + TECH_CARD_W < 0 || cx > w) continue;
    ctx.fillStyle = "rgba(255,255,255,0.025)";
    ctx.fillRect(cx - 14, y + 70, TECH_CARD_W + 28, h - 90);
    ctx.fillStyle = "#8a7a5c";
    ctx.font = "bold 13px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(TECH_COL_NAMES[c] ?? "", cx + TECH_CARD_W / 2, y + 56);
    ctx.textAlign = "left";
  }

  // başlık şeridi
  ctx.fillStyle = "rgba(20, 16, 28, 0.9)";
  ctx.fillRect(x, y, w, 36);
  ctx.strokeStyle = "#8a6cc0";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y + 36.5);
  ctx.lineTo(x + w, y + 36.5);
  ctx.stroke();
  drawCloseButton(ctx, x + w - 30, y + 9);

  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillStyle = "#d8c8f0";
  ctx.font = "bold 17px monospace";
  ctx.fillText("Teknoloji Ağacı", x + 16, y + 18);
  ctx.font = "bold 15px monospace";
  ctx.fillStyle = "#d8c0ff";
  ctx.fillText(`📖 Bilgi: ${resources.knowledge}`, x + 200, y + 18);
  ctx.fillStyle = "#9a9488";
  ctx.font = "11px monospace";
  ctx.fillText("(rahipler tapınakta üretir)  •  ◀ ▶ sürükleyerek/tekerlekle kaydır", x + 300, y + 18);

  // Oto-araştırma anahtarı (kapatınca bilgi birikir, dilediğini elle araştırırsın)
  const tw = 220, th = 22;
  techAutoRect = { x: x + w - 30 - tw - 6, y: y + 7, w: tw, h: th };
  chipBg(ctx, techAutoRect.x, techAutoRect.y, tw, th, autoResearch, UI.purple);
  ctx.fillStyle = autoResearch ? "#d8c0ff" : "#9a9488";
  ctx.font = "bold 11px monospace";
  ctx.textAlign = "left";
  ctx.fillText(`🔄 Oto-araştırma: ${autoResearch ? "AÇIK" : "Kapalı"}`, techAutoRect.x + 10, y + 18);

  const cardW = TECH_CARD_W;
  const cardH = TECH_CARD_H;

  // 1. Bağlantı çizgilerini çiz (kartların arkasında kalması için)
  TECHS.forEach((tech) => {
    for (const pid of tech.prereq ?? []) {
      const parent = TECHS.find((t) => t.id === pid);
      if (!parent) continue;
      const pPos = getTechPos(parent, x, y);
      const curPos = getTechPos(tech, x, y);
      const pRightX = pPos.x + cardW;
      const pRightY = pPos.y + cardH / 2;
      const curLeftX = curPos.x;
      const curLeftY = curPos.y + cardH / 2;

      const isOwned = hasTech(tech.id);
      const isParentOwned = hasTech(parent.id);

      ctx.strokeStyle = isOwned
        ? "rgba(143, 208, 94, 0.65)"
        : isParentOwned
        ? "rgba(176, 143, 224, 0.5)"
        : "rgba(255, 255, 255, 0.1)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(pRightX, pRightY);
      ctx.bezierCurveTo(
        pRightX + 36, pRightY,
        curLeftX - 36, curLeftY,
        curLeftX, curLeftY
      );
      ctx.stroke();
      // akış yönü oku
      ctx.fillStyle = isParentOwned ? "rgba(176,143,224,0.7)" : "rgba(255,255,255,0.18)";
      ctx.beginPath();
      ctx.moveTo(curLeftX - 1, curLeftY);
      ctx.lineTo(curLeftX - 7, curLeftY - 3.5);
      ctx.lineTo(curLeftX - 7, curLeftY + 3.5);
      ctx.closePath();
      ctx.fill();
    }
  });

  // 2. Kartları çiz
  TECHS.forEach((tech) => {
    const pos = getTechPos(tech, x, y);
    if (pos.x + cardW < 0 || pos.x > w) return; // görünüm dışı
    const owned = hasTech(tech.id);
    const locked = !prereqsMet(tech);
    const affordable = resources.knowledge >= tech.cost;

    // Kart arka planı (yuvarlatılmış, satın alınabilirse ışıltılı)
    ctx.beginPath();
    ctx.roundRect(pos.x, pos.y, cardW, cardH, 7);
    if (owned) {
      ctx.fillStyle = "rgba(90, 143, 60, 0.28)";
      ctx.strokeStyle = "#8fd05e";
    } else if (locked) {
      ctx.fillStyle = "rgba(22, 22, 26, 0.7)";
      ctx.strokeStyle = "#3a3d42";
    } else {
      ctx.fillStyle = affordable ? "rgba(138, 108, 192, 0.3)" : "rgba(255, 255, 255, 0.05)";
      ctx.strokeStyle = affordable ? "#b08fe0" : "#5a5f68";
    }
    if (!owned && !locked && affordable) {
      ctx.save();
      ctx.shadowColor = "rgba(176, 143, 224, 0.8)";
      ctx.shadowBlur = 14;
      ctx.fill();
      ctx.restore();
    } else {
      ctx.fill();
    }
    ctx.lineWidth = owned || (!locked && affordable) ? 1.6 : 1;
    ctx.stroke();

    // Amblem rozeti (sol üst köşe): araştırmayı bir bakışta tanıt
    const badgeR = 15;
    const bcx = pos.x + 10 + badgeR;
    const bcy = pos.y + 12 + badgeR;
    ctx.beginPath();
    ctx.arc(bcx, bcy, badgeR, 0, Math.PI * 2);
    ctx.fillStyle = owned
      ? "rgba(90, 143, 60, 0.5)"
      : locked
      ? "rgba(40, 40, 46, 0.8)"
      : "rgba(138, 108, 192, 0.45)";
    ctx.fill();
    ctx.strokeStyle = owned ? "#8fd05e" : locked ? "#4a4d52" : "#b08fe0";
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.globalAlpha = locked ? 0.5 : 1;
    ctx.font = "18px monospace";
    ctx.textAlign = "center";
    ctx.fillText(tech.icon, bcx, bcy + 1);
    ctx.globalAlpha = 1;
    ctx.textAlign = "left";

    // İsim (uzun adlar iki satıra sarılır) — rozetin sağında
    const nameX = pos.x + 10 + badgeR * 2 + 8;
    const nameW = cardW - (badgeR * 2 + 8) - 18;
    ctx.font = "bold 13px monospace";
    if (owned) ctx.fillStyle = "#8fd05e";
    else if (locked) ctx.fillStyle = "#6a6458";
    else ctx.fillStyle = "#e8e2d0";
    const nameLines = wrapText(ctx, tech.name, nameW).slice(0, 2);
    let cy2 = pos.y + (nameLines.length === 1 ? 22 : 15);
    for (const line of nameLines) {
      ctx.fillText(line, nameX, cy2, nameW);
      cy2 += 15;
    }
    // amblem alt sınırının altına in (metin gövdesi rozetle çakışmasın)
    cy2 = Math.max(cy2, pos.y + 12 + badgeR * 2 + 4);

    // Maliyet / Durum (çoklu ön koşullar madde madde listelenir)
    ctx.font = "12px monospace";
    cy2 += 4;
    if (owned) {
      ctx.fillStyle = "#8fd05e";
      ctx.fillText("✓ Araştırıldı", pos.x + 10, cy2);
      cy2 += 11;
    } else if (locked) {
      // Önce gerekenler: her biri amblem + ad + ✓/✗ ile (yeşil=tamam, kırmızı=eksik)
      ctx.fillStyle = "#d08a5c";
      ctx.font = "bold 11px monospace";
      ctx.fillText("🔒 Önce şunlar:", pos.x + 10, cy2);
      cy2 += 14;
      ctx.font = "11px monospace";
      for (const pid of tech.prereq ?? []) {
        const pt = TECHS.find((t) => t.id === pid);
        const met = hasTech(pid);
        ctx.fillStyle = met ? "#8fd05e" : "#e07a68";
        const mark = met ? "✓" : "✗";
        ctx.fillText(`${pt?.icon ?? ""} ${pt?.name ?? pid}`, pos.x + 14, cy2, cardW - 40);
        ctx.textAlign = "right";
        ctx.fillText(mark, pos.x + cardW - 12, cy2);
        ctx.textAlign = "left";
        cy2 += 13;
      }
      ctx.font = "12px monospace";
      cy2 += 1;
    } else {
      ctx.fillStyle = affordable ? "#e0b864" : "#b06a5c";
      ctx.fillText(`Maliyet: ${tech.cost} bilgi`, pos.x + 10, cy2);
      cy2 += 11;
    }

    // Ayraç çizgisi
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pos.x + 10, cy2 + 0.5);
    ctx.lineTo(pos.x + cardW - 10, cy2 + 0.5);
    ctx.stroke();
    cy2 += 13;

    // Açıklama (satırlara bölünmüş, kart sınırına sığdığı kadar)
    ctx.font = "11px monospace";
    ctx.fillStyle = locked ? "#6a6458" : "#b8b2a4";
    const descLines = wrapText(ctx, tech.desc, cardW - 20);
    const buyHint = !owned && !locked && affordable;
    const bottomLimit = pos.y + cardH - (buyHint ? 20 : 8);
    for (const line of descLines) {
      if (cy2 > bottomLimit) break;
      ctx.fillText(line, pos.x + 10, cy2, cardW - 20);
      cy2 += 14;
    }

    // Satın alınabilir kartlarda tıklama ipucu
    if (buyHint) {
      ctx.font = "bold 11px monospace";
      ctx.fillStyle = "#d8c0ff";
      ctx.fillText("▶ Araştırmak için tıkla", pos.x + 10, pos.y + cardH - 11);
    }
  });

  // kaydırma çubuğu (altta ince şerit)
  const contentW = 80 + (TECH_MAX_COL + 1) * TECH_COL_W;
  if (contentW > w) {
    const trackW = w - 24;
    const thumbW = Math.max(60, (w / contentW) * trackW);
    const tx2 = 12 + (techScrollX / (contentW - w)) * (trackW - thumbW);
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(12, y + h - 10, trackW, 4);
    ctx.fillStyle = "#8a6cc0";
    ctx.fillRect(tx2, y + h - 10, thumbW, 4);
  }
}

// ---- Üst bar, bildirimler, araç çubuğu ----

let popButtonRect = { x: 0, y: 0, w: 0, h: 0 };
let peopleButtonRect = { x: 0, y: 0, w: 0, h: 0 };
let journalButtonRect = { x: 0, y: 0, w: 0, h: 0 };

export function journalButtonHitTest(sx: number, sy: number): boolean {
  return sx >= journalButtonRect.x && sx <= journalButtonRect.x + journalButtonRect.w &&
    sy >= journalButtonRect.y && sy <= journalButtonRect.y + journalButtonRect.h;
}
let techButtonRect = { x: 0, y: 0, w: 0, h: 0 };
let policyButtonRect = { x: 0, y: 0, w: 0, h: 0 };

export function policyButtonHitTest(sx: number, sy: number): boolean {
  return sx >= policyButtonRect.x && sx <= policyButtonRect.x + policyButtonRect.w &&
    sy >= policyButtonRect.y && sy <= policyButtonRect.y + policyButtonRect.h;
}

export function peopleButtonHitTest(sx: number, sy: number): boolean {
  return sx >= peopleButtonRect.x && sx <= peopleButtonRect.x + peopleButtonRect.w &&
    sy >= peopleButtonRect.y && sy <= peopleButtonRect.y + peopleButtonRect.h;
}

export function popButtonHitTest(sx: number, sy: number): boolean {
  return sx >= popButtonRect.x && sx <= popButtonRect.x + popButtonRect.w &&
    sy >= popButtonRect.y && sy <= popButtonRect.y + popButtonRect.h;
}

export function techButtonHitTest(sx: number, sy: number): boolean {
  return sx >= techButtonRect.x && sx <= techButtonRect.x + techButtonRect.w &&
    sy >= techButtonRect.y && sy <= techButtonRect.y + techButtonRect.h;
}

let pauseButtonRect = { x: 0, y: 0, w: 0, h: 0 };
let speedButtonRect = { x: 0, y: 0, w: 0, h: 0 };

export function pauseButtonHitTest(sx: number, sy: number): boolean {
  return sx >= pauseButtonRect.x && sx <= pauseButtonRect.x + pauseButtonRect.w &&
    sy >= pauseButtonRect.y && sy <= pauseButtonRect.y + pauseButtonRect.h;
}

export function speedButtonHitTest(sx: number, sy: number): boolean {
  return sx >= speedButtonRect.x && sx <= speedButtonRect.x + speedButtonRect.w &&
    sy >= speedButtonRect.y && sy <= speedButtonRect.y + speedButtonRect.h;
}

export function drawHud(
  ctx: CanvasRenderingContext2D,
  population: number,
  selected: BuildingType | null,
  paused: boolean,
  speed: number,
  homeless = 0
): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;

  // üst bar: yumuşak degrade + ince altın alt çizgi
  const topGrad = ctx.createLinearGradient(0, 0, 0, 36);
  topGrad.addColorStop(0, "rgba(22, 25, 33, 0.95)");
  topGrad.addColorStop(1, "rgba(10, 12, 17, 0.88)");
  ctx.fillStyle = topGrad;
  ctx.fillRect(0, 0, w, 34);
  ctx.fillStyle = "rgba(255, 210, 110, 0.22)";
  ctx.fillRect(0, 34, w, 1.5);
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

  // işler: tıklanabilir düğme (iş yönetim menüsünü açar)
  {
    const label = `İşler ▾`;
    ctx.font = "15px monospace";
    const bw = 20 + ctx.measureText(label).width + 10;
    popButtonRect = { x: cx - 6, y: 4, w: bw, h: 26 };
    chipBg(ctx, popButtonRect.x, popButtonRect.y, popButtonRect.w, popButtonRect.h, false, UI.green);
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
    cx += bw + 10;
  }

  // insanlar: nüfus listesi düğmesi (evsiz varsa kırmızı uyarı rozeti)
  {
    const label = `İnsanlar: ${population} ▾`;
    ctx.font = "15px monospace";
    const warn = homeless > 0 ? `  ⚠${homeless}` : "";
    let bw = ctx.measureText(label).width + 16;
    if (warn) { ctx.font = "bold 13px monospace"; bw += ctx.measureText(warn).width; ctx.font = "15px monospace"; }
    peopleButtonRect = { x: cx - 2, y: 4, w: bw, h: 26 };
    chipBg(ctx, peopleButtonRect.x, peopleButtonRect.y, peopleButtonRect.w, peopleButtonRect.h, homeless > 0, homeless > 0 ? UI.danger : UI.blue);
    ctx.fillStyle = "#e8e2d0";
    ctx.fillText(label, cx + 6, 18);
    if (warn) {
      ctx.fillStyle = "#ff8a6a";
      ctx.font = "bold 13px monospace";
      ctx.fillText(warn, cx + 6 + ctx.measureText(label).width, 18);
      ctx.font = "15px monospace";
    }
    cx += bw + 10;
  }

  // defter düğmesi (savaş/tehlike kayıtları)
  {
    const label = `Defter ▾`;
    ctx.font = "15px monospace";
    const bw = ctx.measureText(label).width + 16;
    journalButtonRect = { x: cx - 2, y: 4, w: bw, h: 26 };
    chipBg(ctx, journalButtonRect.x, journalButtonRect.y, journalButtonRect.w, journalButtonRect.h, false, UI.brown);
    ctx.fillStyle = "#e8c87a";
    ctx.fillText(label, cx + 6, 18);
    cx += bw + 10;
  }

  // teknoloji düğmesi (mor kitap): mevcut bilgi puanını da gösterir
  {
    const label = `Teknoloji: ${resources.knowledge} ▾`;
    ctx.font = "15px monospace";
    const bw = 20 + ctx.measureText(label).width + 10;
    techButtonRect = { x: cx - 2, y: 4, w: bw, h: 26 };
    chipBg(ctx, techButtonRect.x, techButtonRect.y, techButtonRect.w, techButtonRect.h, true, UI.purple);
    drawItemIcon(ctx, "knowledge", cx + 2, 7, 18);
    ctx.fillStyle = "#d8c8f0";
    ctx.fillText(label, cx + 22, 18);
    cx += bw + 12;
  }

  // otomasyon (politika) düğmesi — dişli
  {
    const bw = 30;
    policyButtonRect = { x: cx - 2, y: 4, w: bw, h: 26 };
    chipBg(ctx, policyButtonRect.x, policyButtonRect.y, bw, 26, false, UI.gold);
    ctx.fillStyle = "#ffe296";
    ctx.font = "15px monospace";
    ctx.textAlign = "center";
    ctx.fillText("⚙", cx + bw / 2 - 2, 18);
    ctx.textAlign = "left";
    cx += bw + 10;
  }

  // tarih (takvim ikonu) — sağdaki düğmelere sığıyorsa
  if (cx + 175 < w - 100) {
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx + 0.5, 7);
    ctx.lineTo(cx + 0.5, 27);
    ctx.stroke();
    cx += 14;

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
  }

  // saat (gündüz güneş / gece hilal ikonu)
  if (cx + 150 < w - 100) {
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
    cx += 20 + ctx.measureText(saat).width + 14;
  }

  // mevsim rozeti
  if (cx + 100 < w - 100) {
    const sIdx = season();
    const label = SEASON_NAMES[sIdx];
    ctx.font = "bold 12px monospace";
    const bw = ctx.measureText(label).width + 16;
    ctx.fillStyle = "rgba(10, 12, 16, 0.5)";
    ctx.fillRect(cx, 7, bw, 20);
    ctx.strokeStyle = SEASON_COLORS[sIdx];
    ctx.lineWidth = 1;
    ctx.strokeRect(cx + 0.5, 7.5, bw - 1, 19);
    ctx.fillStyle = SEASON_COLORS[sIdx];
    ctx.fillText(label, cx + 8, 17.5);
    ctx.font = "15px monospace";
    cx += bw;
  }

  // sağda duraklat ve hız düğmeleri
  pauseButtonRect = { x: w - 92, y: 4, w: 26, h: 26 };
  speedButtonRect = { x: w - 60, y: 4, w: 48, h: 26 };
  // duraklat / devam
  chipBg(ctx, pauseButtonRect.x, pauseButtonRect.y, pauseButtonRect.w, pauseButtonRect.h, paused, UI.gold);
  ctx.fillStyle = paused ? "#ffd23c" : "#e8e2d0";
  if (paused) {
    // oynat üçgeni
    ctx.beginPath();
    ctx.moveTo(pauseButtonRect.x + 9, pauseButtonRect.y + 7);
    ctx.lineTo(pauseButtonRect.x + 19, pauseButtonRect.y + 13);
    ctx.lineTo(pauseButtonRect.x + 9, pauseButtonRect.y + 19);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.fillRect(pauseButtonRect.x + 8, pauseButtonRect.y + 7, 3.5, 12);
    ctx.fillRect(pauseButtonRect.x + 14.5, pauseButtonRect.y + 7, 3.5, 12);
  }
  // hız
  chipBg(ctx, speedButtonRect.x, speedButtonRect.y, speedButtonRect.w, speedButtonRect.h, speed > 1, UI.gold);
  ctx.fillStyle = speed > 1 ? "#ffd23c" : "#e8e2d0";
  ctx.font = "bold 13px monospace";
  ctx.textAlign = "center";
  ctx.fillText(`${speed}x ▸`, speedButtonRect.x + speedButtonRect.w / 2, 18);
  ctx.textAlign = "left";

  // yardım metni yalnızca sığıyorsa
  ctx.textAlign = "right";
  ctx.font = "12px monospace";
  const help = "N: işler • M: insanlar • B: defter • T: teknoloji • Space: durdur • X: hız";
  if (w - 100 - ctx.measureText(help).width > cx + 16) {
    ctx.fillStyle = "#9a9488";
    ctx.fillText(help, w - 100, 18);
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
    const tw = ctx.measureText(text).width + 36;
    rrect(ctx, w / 2 - tw / 2, 90, tw, 30, 8);
    ctx.fillStyle = "rgba(12, 14, 20, 0.85)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 210, 60, 0.5)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "#ffd23c";
    ctx.fillText(text, w / 2, 105);
    ctx.textAlign = "left";
  }

  // bildirimler: önem düzeyine göre boy/renk; sık tekrarlanan küçülüp "×N" alır
  ctx.textAlign = "center";
  let my = 44;
  for (const m of messages) {
    const alpha = Math.min(1, m.ttl);
    const repeated = m.count > 1;
    // sık tekrarlanan sıradan bildirimler küçülür; önemliler büyür
    let size: number, rowH: number, bg: number, fg: string;
    if (m.level === "important") {
      size = 18; rowH = 30; bg = 0.82; fg = "255, 232, 150";
    } else if (m.level === "low" || (repeated && m.count >= 3)) {
      size = 11; rowH = 18; bg = 0.5; fg = "180, 200, 180";
    } else {
      size = 14; rowH = 24; bg = 0.7; fg = "230, 224, 200";
    }
    const pop = 1 + m.pop * 1.6; // yeni gelince hafif büyüyüp oturur
    ctx.font = `${m.level === "important" ? "bold " : ""}${Math.round(size * pop)}px monospace`;
    const label = repeated ? `${m.text}  ×${m.count}` : m.text;
    const tw = ctx.measureText(label).width + (m.level === "important" ? 40 : 24);
    const bx = w / 2 - tw / 2;
    const rh = rowH - 2;
    rrect(ctx, bx, my, tw, rh, rh / 2); // hap şeklinde
    ctx.fillStyle = `rgba(12, 14, 20, ${bg * alpha})`;
    ctx.fill();
    if (m.level === "important") {
      rrect(ctx, bx + 0.5, my + 0.5, tw - 1, rh - 1, rh / 2);
      ctx.strokeStyle = `rgba(255, 210, 60, ${alpha})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.fillStyle = `rgba(${fg}, ${alpha})`;
    ctx.fillText(label, w / 2, my + (rowH - 2) / 2);
    my += rowH;
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";

  // seçili bina varken belirgin yerleştirme bandı: ne kurulduğunu ve nasıl yapılacağını söyler
  if (selected !== null) {
    const def = BUILDING_DEFS[selected];
    const affordable = resources.wood >= def.cost;
    ctx.font = "bold 14px monospace";
    const main = `📐 ${def.name} — ${def.cost} dal ${affordable ? "✓" : "✗ yetersiz!"}`;
    const sub = "Sol tık: yerleştir   •   Sağ tık / Esc: iptal";
    ctx.font = "12px monospace";
    const subW = ctx.measureText(sub).width;
    ctx.font = "bold 14px monospace";
    const mainW = ctx.measureText(main).width;
    const bw = Math.max(mainW, subW) + 28;
    const bx = (w - bw) / 2;
    const by = h - TOOLBAR_HEIGHT - 132; // envanter çubuğunun üstünde kalsın
    ctx.fillStyle = "rgba(10, 14, 10, 0.9)";
    ctx.fillRect(bx, by, bw, 44);
    ctx.strokeStyle = affordable ? "#8fd05e" : "#c0563f";
    ctx.lineWidth = 2;
    ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, 43);
    ctx.textAlign = "center";
    ctx.fillStyle = affordable ? "#bfe89a" : "#f0a090";
    ctx.font = "bold 14px monospace";
    ctx.fillText(main, w / 2, by + 15);
    ctx.fillStyle = "#9a9488";
    ctx.font = "12px monospace";
    ctx.fillText(sub, w / 2, by + 32);
    ctx.textAlign = "left";
  }

  // alt araç çubuğu — zarif inşaat menüsü
  const tbY = h - TOOLBAR_HEIGHT;
  const tbGrad = ctx.createLinearGradient(0, tbY, 0, h);
  tbGrad.addColorStop(0, "rgba(18, 20, 27, 0.97)");
  tbGrad.addColorStop(1, "rgba(8, 9, 13, 0.99)");
  ctx.fillStyle = tbGrad;
  ctx.fillRect(0, tbY, w, TOOLBAR_HEIGHT);
  ctx.strokeStyle = "rgba(255, 210, 120, 0.18)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, tbY + 0.5);
  ctx.lineTo(w, tbY + 0.5);
  ctx.stroke();

  const unlockedTypes = TOOLBAR_TYPES.filter(isBuildingUnlocked);
  const n = unlockedTypes.length;
  unlockedTypes.forEach((type, i) => {
    const r = buttonRect(i, w, h, n);
    const def = BUILDING_DEFS[type];
    const isSelected = selected === type;
    const affordable = resources.wood >= def.cost;
    const tint = BUILDING_TINT[type] ?? "#5a5f68";

    // kart gövdesi (yuvarlatılmış); seçiliyse kategori renginde ışıltı
    ctx.beginPath();
    ctx.roundRect(r.x, r.y, r.w, r.h, 7);
    if (isSelected) {
      ctx.save();
      ctx.shadowColor = tint;
      ctx.shadowBlur = 16;
    }
    const cardGrad = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
    if (isSelected) {
      cardGrad.addColorStop(0, "rgba(120, 170, 80, 0.4)");
      cardGrad.addColorStop(1, "rgba(70, 110, 45, 0.25)");
    } else {
      cardGrad.addColorStop(0, "rgba(255,255,255,0.07)");
      cardGrad.addColorStop(1, "rgba(255,255,255,0.02)");
    }
    ctx.fillStyle = cardGrad;
    ctx.fill();
    if (isSelected) ctx.restore();
    ctx.lineWidth = isSelected ? 2 : 1;
    ctx.strokeStyle = isSelected
      ? "#9fe06a"
      : affordable
      ? "rgba(255,255,255,0.16)"
      : "rgba(176, 86, 63, 0.55)";
    ctx.stroke();

    // sol kategori şeridi
    ctx.fillStyle = tint;
    ctx.beginPath();
    ctx.roundRect(r.x + 1, r.y + 1, 3.5, r.h - 2, [6, 0, 0, 6]);
    ctx.fill();

    // hotkey rozeti (sol üst)
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.beginPath();
    ctx.arc(r.x + 15, r.y + 14, 8.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = tint;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "#e8e2d0";
    ctx.font = "bold 10px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${(i + 1) % 10}`, r.x + 15, r.y + 14);

    // amblem
    ctx.font = "19px monospace";
    ctx.textAlign = "left";
    ctx.globalAlpha = affordable ? 1 : 0.45;
    ctx.fillText(BUILDING_ICON[type] ?? "🏗", r.x + 28, r.y + 14);
    ctx.globalAlpha = 1;

    // isim
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = affordable ? "#ece6d4" : "#8a8478";
    ctx.font = "bold 11px monospace";
    ctx.fillText(def.name, r.x + 9, r.y + 38, r.w - 14);

    // maliyet + uygunluk
    ctx.font = "11px monospace";
    ctx.fillStyle = affordable ? "#d8b96a" : "#e0796a";
    ctx.fillText(`🪵 ${def.cost}`, r.x + 9, r.y + 52);
    ctx.fillStyle = affordable ? "#7fc05a" : "#e0796a";
    ctx.textAlign = "right";
    ctx.font = "bold 12px monospace";
    ctx.fillText(affordable ? "✓" : "✗", r.x + r.w - 9, r.y + 52);
    ctx.textAlign = "left";
  });
  ctx.textBaseline = "middle";

  // koloni envanteri (Minecraft tarzı slot çubuğu)
  drawInventoryBar(ctx);
}
