import { BUILDING_DEFS, BuildingType } from "../sim/buildings";
import { resources } from "../sim/resources";
import type { Villager } from "../sim/villager";

export const TOOLBAR_HEIGHT = 64;

const TOOLBAR_TYPES: BuildingType[] = [
  BuildingType.House,
  BuildingType.Depot,
  BuildingType.Woodcutter,
  BuildingType.Gatherer,
];

const BTN_W = 150;
const BTN_H = 48;
const BTN_GAP = 10;

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

const PROFILE = { x: 12, y: 44, w: 248, h: 148 };
const CLOSE = { x: PROFILE.x + PROFILE.w - 24, y: PROFILE.y + 6, w: 18, h: 18 };

// Panel açıkken tıklama paneli mi hedefliyor? ("close" = X düğmesi)
export function profileHitTest(sx: number, sy: number): "close" | "panel" | null {
  if (sx >= CLOSE.x && sx <= CLOSE.x + CLOSE.w && sy >= CLOSE.y && sy <= CLOSE.y + CLOSE.h) {
    return "close";
  }
  if (sx >= PROFILE.x && sx <= PROFILE.x + PROFILE.w && sy >= PROFILE.y && sy <= PROFILE.y + PROFILE.h) {
    return "panel";
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
  ctx.fillText(`Yaş: ${v.identity.age}`, tx, y + 46);
  ctx.fillText(v.identity.female ? "Kadın" : "Erkek", tx, y + 64);
  ctx.fillText("Meslek: İşçi", tx, y + 82);
  ctx.fillStyle = "#9ad0ff";
  ctx.fillText(v.statusText, tx, y + 100, w - 82 - 12);

  // açlık barı
  ctx.fillStyle = "#e8e2d0";
  ctx.font = "12px monospace";
  ctx.fillText("Tokluk", x + 10, y + 122);
  const barX = x + 72;
  const barW = w - 72 - 14;
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillRect(barX, y + 116, barW, 12);
  const fullness = 1 - v.hunger / 100;
  ctx.fillStyle = fullness > 0.5 ? "#6fbf4a" : fullness > 0.2 ? "#e0a83c" : "#d4453f";
  ctx.fillRect(barX + 1, y + 117, (barW - 2) * fullness, 10);
  ctx.strokeStyle = "#3a3f48";
  ctx.strokeRect(barX + 0.5, y + 116.5, barW - 1, 11);
}

export function drawHud(
  ctx: CanvasRenderingContext2D,
  population: number,
  selected: BuildingType | null
): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;

  // ---- üst kaynak çubuğu ----
  ctx.fillStyle = "rgba(10, 12, 16, 0.7)";
  ctx.fillRect(0, 0, w, 34);
  ctx.font = "15px monospace";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";

  // odun ikonu
  ctx.fillStyle = "#8a5a2b";
  ctx.fillRect(14, 11, 12, 12);
  ctx.fillStyle = "#6b4422";
  ctx.fillRect(14, 15, 12, 2);
  ctx.fillStyle = "#e8e2d0";
  ctx.fillText(`Odun: ${resources.wood}/${resources.woodCap}`, 34, 18);

  // yemek ikonu (meyve)
  ctx.fillStyle = "#d43f3f";
  ctx.beginPath();
  ctx.arc(186, 18, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#4a7a3a";
  ctx.fillRect(185, 9, 2, 4);
  ctx.fillStyle = "#e8e2d0";
  ctx.fillText(`Yemek: ${resources.food}/${resources.foodCap}`, 200, 18);

  // nüfus ikonu (mini çöp adam)
  ctx.strokeStyle = "#e8e2d0";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(366, 12, 3, 0, Math.PI * 2);
  ctx.moveTo(366, 15);
  ctx.lineTo(366, 22);
  ctx.moveTo(362, 26);
  ctx.lineTo(366, 22);
  ctx.lineTo(370, 26);
  ctx.stroke();
  ctx.fillText(`Nüfus: ${population}`, 378, 18);

  // sağda kısa yardım
  ctx.textAlign = "right";
  ctx.fillStyle = "#9a9488";
  ctx.font = "12px monospace";
  ctx.fillText("1-4: bina seç • Esc/sağ tık: iptal • Sol tık: işaretle/yerleştir", w - 12, 18);
  ctx.textAlign = "left";

  // ---- bildirimler ----
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

  // ---- alt araç çubuğu ----
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
}
