// Koloninin kaynak stoğu. Köylüler topladıklarını kişisel çantalarında taşır,
// kampa/depoya teslim edince buraya eklenir. Depo binaları kapasiteyi artırır.

export type ItemType = "wood" | "stone" | "berry" | "mushroom" | "fish";

export const ITEM_TYPES: ItemType[] = ["wood", "stone", "berry", "mushroom", "fish"];

export const ITEM_INFO: Record<ItemType, { name: string; color: string }> = {
  wood: { name: "odun", color: "#a06a35" },
  stone: { name: "taş", color: "#9aa0a8" },
  berry: { name: "meyve", color: "#d43f3f" },
  mushroom: { name: "mantar", color: "#d9b06b" },
  fish: { name: "balık", color: "#6fa8c9" },
};

export const resources: Record<ItemType, number> & { cap: number; knowledge: number } = {
  wood: 20,
  stone: 0,
  berry: 20,
  mushroom: 4,
  fish: 0,
  cap: 60,
  knowledge: 0, // tapınaklarda üretilir; depo kapasitesine tabi değildir
};

// Stoğa ekle (kapasiteyle sınırlı); gerçekten eklenen miktarı döndürür
export function addItem(item: ItemType, n: number): number {
  const space = resources.cap - resources[item];
  const added = Math.max(0, Math.min(space, n));
  resources[item] += added;
  return added;
}

// Bu ürünün deposu dolu mu? Doluysa köylüler onu toplamayı bırakır
export function isFull(item: ItemType): boolean {
  return resources[item] >= resources.cap;
}

// Yenebilir toplam: meyve + mantar + balık
export function foodTotal(): number {
  return resources.berry + resources.mushroom + resources.fish;
}

export function takeFood(n: number): boolean {
  if (foodTotal() < n) return false;
  let remaining = n;
  for (const item of ["berry", "mushroom", "fish"] as const) {
    const take = Math.min(resources[item], remaining);
    resources[item] -= take;
    remaining -= take;
    if (remaining <= 0) break;
  }
  return true;
}
