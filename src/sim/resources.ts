// Koloninin kaynak stoğu. Köylüler topladıklarını kişisel çantalarında taşır,
// kampa/depoya teslim edince buraya eklenir. Depo binaları kapasiteyi artırır.

export type ItemType = "wood" | "stone" | "berry" | "mushroom";

export const ITEM_TYPES: ItemType[] = ["wood", "stone", "berry", "mushroom"];

export const ITEM_INFO: Record<ItemType, { name: string; color: string }> = {
  wood: { name: "odun", color: "#a06a35" },
  stone: { name: "taş", color: "#9aa0a8" },
  berry: { name: "meyve", color: "#d43f3f" },
  mushroom: { name: "mantar", color: "#d9b06b" },
};

export const resources: Record<ItemType, number> & { cap: number } = {
  wood: 20,
  stone: 0,
  berry: 20,
  mushroom: 4,
  cap: 60,
};

// Stoğa ekle (kapasiteyle sınırlı); gerçekten eklenen miktarı döndürür
export function addItem(item: ItemType, n: number): number {
  const space = resources.cap - resources[item];
  const added = Math.max(0, Math.min(space, n));
  resources[item] += added;
  return added;
}

// Yenebilir toplam: meyve + mantar
export function foodTotal(): number {
  return resources.berry + resources.mushroom;
}

export function takeFood(n: number): boolean {
  if (foodTotal() < n) return false;
  const fromBerry = Math.min(resources.berry, n);
  resources.berry -= fromBerry;
  resources.mushroom -= n - fromBerry;
  return true;
}
