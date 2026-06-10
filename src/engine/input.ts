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
  onClick:
    | ((worldX: number, worldY: number, screenX: number, screenY: number) => void)
    | null = null;
  // sağ tık (sürüklemeden bırakılırsa): seçim iptali
  onCancel: (() => void) | null = null;
  // sol tuş sürükleme yaşam döngüsü (alan seçimi / mini harita gezdirme)
  onLeftDragStart: ((wx: number, wy: number, sx: number, sy: number) => void) | null = null;
  onLeftDragMove: ((wx: number, wy: number, sx: number, sy: number) => void) | null = null;
  onLeftDragEnd: (() => void) | null = null;
  // tekerleği yakala (örn. menü kaydırma); true dönerse zoom yapılmaz
  wheelInterceptor: ((sx: number, sy: number, deltaY: number) => boolean) | null = null;

  private keys = new Set<string>();
  private dragging = false;
  private dragMoved = 0;
  private leftDragging = false;
  private downWorld = { x: 0, y: 0 };
  private downScreen = { x: 0, y: 0 };

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
      if (this.wheelInterceptor?.(e.offsetX, e.offsetY, e.deltaY)) return;
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      this.camera.zoomAt(e.offsetX, e.offsetY, factor, canvas.width, canvas.height);
    }, { passive: false });

    canvas.addEventListener("pointerdown", (e) => {
      this.dragMoved = 0;
      if (e.button === 0) {
        const w = this.camera.screenToWorld(e.offsetX, e.offsetY, canvas.width, canvas.height);
        this.downWorld = w;
        this.downScreen = { x: e.offsetX, y: e.offsetY };
        this.leftDragging = false;
      }
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
      } else if (e.buttons & 1) {
        this.dragMoved += Math.abs(e.movementX) + Math.abs(e.movementY);
        if (!this.leftDragging && this.dragMoved >= 4) {
          this.leftDragging = true;
          this.onLeftDragStart?.(
            this.downWorld.x, this.downWorld.y,
            this.downScreen.x, this.downScreen.y
          );
        }
        if (this.leftDragging) {
          const w = this.camera.screenToWorld(e.offsetX, e.offsetY, canvas.width, canvas.height);
          this.onLeftDragMove?.(w.x, w.y, e.offsetX, e.offsetY);
        }
      }
    });

    canvas.addEventListener("pointerup", (e) => {
      if (e.button === 1 || e.button === 2) {
        this.dragging = false;
        if (e.button === 2 && this.dragMoved < 4) this.onCancel?.();
        return;
      }
      if (e.button === 0) {
        if (this.leftDragging) {
          this.leftDragging = false;
          this.onLeftDragEnd?.();
        } else if (this.dragMoved < 4) {
          const w = this.camera.screenToWorld(e.offsetX, e.offsetY, canvas.width, canvas.height);
          this.onClick?.(w.x, w.y, e.offsetX, e.offsetY);
        }
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
