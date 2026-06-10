// Blok (tile) tanımları. Dünya bu bloklardan oluşan bir ızgaradır.

export const TILE_SIZE = 16; // bir bloğun dünya-piksel boyutu

export const enum Tile {
  Water = 0,
  Sand = 1,
  Grass = 2,
  Dirt = 3,
  Stone = 4,
  Tree = 5,
}

export function isWalkable(t: Tile): boolean {
  return t === Tile.Sand || t === Tile.Grass || t === Tile.Dirt;
}

// Her blok tipi için temel renk ve hafif ton varyasyonları (pixel-art dokusu için)
export const TILE_COLORS: Record<Tile, string[]> = {
  [Tile.Water]: ["#2a5d9c", "#2c62a5", "#27588f"],
  [Tile.Sand]: ["#d8c27a", "#d1bb74", "#dfc983"],
  [Tile.Grass]: ["#5a8f3c", "#558838", "#609541"],
  [Tile.Dirt]: ["#8a6a43", "#84653f", "#907048"],
  [Tile.Stone]: ["#7c7f86", "#75787f", "#84878e"],
  [Tile.Tree]: ["#5a8f3c", "#558838", "#609541"], // zemin çimen, ağaç üstüne çizilir
};
