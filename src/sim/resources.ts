// Koloninin kaynak stoğu. Köylüler topladıklarını kişisel çantalarında taşır,
// kampa/depoya teslim edince buraya eklenir. Depo binaları kapasiteyi artırır.

export type ItemType =
  | "wood" | "stone"
  | "berry" | "mushroom" | "fish";

export const ITEM_TYPES: ItemType[] = [
  "wood", "stone",
  "berry", "mushroom", "fish",
];

export const ITEM_INFO: Record<ItemType, { name: string; color: string }> = {
  wood: { name: "dal", color: "#8a6a43" },
  stone: { name: "taş", color: "#9aa0a8" },
  berry: { name: "yemiş", color: "#d43f3f" },
  mushroom: { name: "mantar", color: "#d9b06b" },
  fish: { name: "balık", color: "#6fa8c9" },
};

// Yenebilirler (tüketim önceliği sırasıyla)
export const FOOD_TYPES: ItemType[] = [
  "berry", "mushroom", "fish",
];

export const FOOD_NUTRITION: Record<ItemType, number> = {
  berry: 7, // yemiş: bol bulunur ama az doyurur
  mushroom: 5,
  fish: 15,
  wood: 0,
  stone: 0,
};

export const resources: Record<ItemType, number> & { cap: number; knowledge: number } = {
  ...(Object.fromEntries(ITEM_TYPES.map((t) => [t, 0])) as Record<ItemType, number>),
  wood: 20,
  berry: 20,
  cap: 100,
  knowledge: 0, // tapınaklarda üretilir; depo kapasitesine tabi değildir
};

// Toplam depolanmış kaynak miktarı
export function totalStored(): number {
  let total = 0;
  for (const item of ITEM_TYPES) {
    total += resources[item];
  }
  return total;
}

// Stoğa ekle (kapasiteyle sınırlı); gerçekten eklenen miktarı döndürür
export function addItem(item: ItemType, n: number): number {
  const space = resources.cap - totalStored();
  const added = Math.max(0, Math.min(space, n));
  resources[item] += added;
  return added;
}

// Bu ürünün deposu dolu mu? Doluysa köylüler onu toplamayı bırakır
export function isFull(item: ItemType): boolean {
  void item;
  return totalStored() >= resources.cap;
}

// Yenebilir toplam
export function foodTotal(): number {
  let total = 0;
  for (const item of FOOD_TYPES) total += resources[item];
  return total;
}

export function takeFood(n: number): boolean {
  if (foodTotal() < n) return false;
  let remaining = n;
  for (const item of FOOD_TYPES) {
    const take = Math.min(resources[item], remaining);
    resources[item] -= take;
    remaining -= take;
    if (remaining <= 0) break;
  }
  return true;
}
