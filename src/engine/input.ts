import type { Camera } from "./camera";

const PAN_KEYS: Record<string, [number, number]> = {
  KeyW: [0, -1],
  KeyA: [-1, 0],
  KeyS: [0, 1],
  KeyD: [1, 0],
  ArrowUp: [0, -1],
  ArrowLeft: [-1, 0],
  ArrowDown: [0, 1],
  ArrowRight: [1, 0],
};

export class Input {
  mouseX = 0;
  mouseY = 0;
  onClick: ((worldX: number, worldY: number) => void) | null = null;

  private keys = new Set<string>();
  private dragging = false;
  private dragMoved = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private camera: Camera
  ) {
    window.addEventListener("keydown", (e) => {
      if (e.code in PAN_KEYS) {
        this.keys.add(e.code);
        e.preventDefault();
      }
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => this.keys.clear());

    canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      this.camera.zoomAt(e.offsetX, e.offsetY, factor, canvas.width, canvas.height);
    }, { passive: false });

    canvas.addEventListener("pointerdown", (e) => {
      this.dragMoved = 0;
      // sağ veya orta tuş ile sürükleyerek kaydırma
      if (e.button === 1 || e.button === 2) {
        this.dragging = true;
        canvas.setPointerCapture(e.pointerId);
      }
    });

    canvas.addEventListener("pointermove", (e) => {
      this.mouseX = e.offsetX;
      this.mouseY = e.offsetY;
      if (this.dragging) {
        this.camera.pan(-e.movementX / this.camera.zoom, -e.movementY / this.camera.zoom);
        this.dragMoved += Math.abs(e.movementX) + Math.abs(e.movementY);
      }
    });

    canvas.addEventListener("pointerup", (e) => {
      if (e.button === 1 || e.button === 2) {
        this.dragging = false;
        return;
      }
      if (e.button === 0 && this.dragMoved < 4) {
        const w = this.camera.screenToWorld(e.offsetX, e.offsetY, canvas.width, canvas.height);
        this.onClick?.(w.x, w.y);
      }
    });
  }

  // Her karede çağrılır: basılı tuşlara göre kamerayı kaydır
  update(dt: number) {
    const speed = 420 / this.camera.zoom;
    for (const code of this.keys) {
      const dir = PAN_KEYS[code];
      if (dir) this.camera.pan(dir[0] * speed * dt, dir[1] * speed * dt);
    }
    this.camera.clamp(this.canvas.width, this.canvas.height);
  }
}
