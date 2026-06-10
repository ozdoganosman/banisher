export class Camera {
  x: number; // bakılan dünya noktası (merkez)
  y: number;
  zoom = 3;
  minZoom = 0.5; // iyice uzaklaşınca harita denizin ortasında bir ada gibi görünür
  maxZoom = 8;

  constructor(
    x: number,
    y: number,
    private worldW: number, // dünya-piksel cinsinden harita boyutu
    private worldH: number
  ) {
    this.x = x;
    this.y = y;
  }

  screenToWorld(sx: number, sy: number, viewW: number, viewH: number) {
    return {
      x: (sx - viewW / 2) / this.zoom + this.x,
      y: (sy - viewH / 2) / this.zoom + this.y,
    };
  }

  // İmleç altındaki dünya noktası sabit kalacak şekilde zoom yap
  zoomAt(sx: number, sy: number, factor: number, viewW: number, viewH: number) {
    const before = this.screenToWorld(sx, sy, viewW, viewH);
    this.zoom = Math.min(this.maxZoom, Math.max(this.minZoom, this.zoom * factor));
    const after = this.screenToWorld(sx, sy, viewW, viewH);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
  }

  pan(dx: number, dy: number) {
    this.x += dx;
    this.y += dy;
  }

  clamp(viewW: number, viewH: number) {
    const halfW = viewW / 2 / this.zoom;
    const halfH = viewH / 2 / this.zoom;
    if (halfW * 2 >= this.worldW) this.x = this.worldW / 2;
    else this.x = Math.min(this.worldW - halfW, Math.max(halfW, this.x));
    if (halfH * 2 >= this.worldH) this.y = this.worldH / 2;
    else this.y = Math.min(this.worldH - halfH, Math.max(halfH, this.y));
  }
}
