import { resources } from "../sim/resources";

export function drawHud(ctx: CanvasRenderingContext2D, population: number): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;

  // üst kaynak çubuğu
  ctx.fillStyle = "rgba(10, 12, 16, 0.7)";
  ctx.fillRect(0, 0, w, 34);
  ctx.fillStyle = "#e8e2d0";
  ctx.font = "15px monospace";
  ctx.textBaseline = "middle";

  // odun ikonu
  ctx.fillStyle = "#8a5a2b";
  ctx.fillRect(14, 11, 12, 12);
  ctx.fillStyle = "#6b4422";
  ctx.fillRect(14, 15, 12, 2);
  ctx.fillStyle = "#e8e2d0";
  ctx.fillText(`Odun: ${resources.wood}`, 34, 18);

  // nüfus ikonu (mini çöp adam)
  ctx.strokeStyle = "#e8e2d0";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(146, 12, 3, 0, Math.PI * 2);
  ctx.moveTo(146, 15);
  ctx.lineTo(146, 22);
  ctx.moveTo(142, 26);
  ctx.lineTo(146, 22);
  ctx.lineTo(150, 26);
  ctx.stroke();
  ctx.fillText(`Nüfus: ${population}`, 158, 18);

  // alt yardım satırı
  ctx.fillStyle = "rgba(10, 12, 16, 0.7)";
  ctx.fillRect(0, h - 28, w, 28);
  ctx.fillStyle = "#b8b2a0";
  ctx.font = "13px monospace";
  ctx.fillText(
    "Sol tık: ağaç işaretle/kaldır  •  WASD/Ok tuşları: kaydır  •  Tekerlek: zoom  •  Sağ tık sürükle: kaydır",
    14,
    h - 14
  );
}
