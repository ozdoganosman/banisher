import { BUILDING_DEFS, BuildingType } from "../sim/buildings";
import { resources } from "../sim/resources";

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
