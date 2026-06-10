// Koloninin kaynak stoğu. Köylüler topladıklarını kişisel çantalarında taşır,
// kampa/depoya teslim edince buraya eklenir. Depo binaları kapasiteyi artırır.

export type ItemType =
  | "wood" | "stone"
  | "berry" | "mushroom" | "fish"
  | "apple" | "orange" | "tangerine" | "nut"
  | "egg" | "milk" | "meat" | "wool";

export const ITEM_TYPES: ItemType[] = [
  "wood", "stone",
  "berry", "mushroom", "fish",
  "apple", "orange", "tangerine", "nut",
  "egg", "milk", "meat", "wool",
];

export const ITEM_INFO: Record<ItemType, { name: string; color: string }> = {
  wood: { name: "odun", color: "#a06a35" },
  stone: { name: "taş", color: "#9aa0a8" },
  berry: { name: "meyve", color: "#d43f3f" },
  mushroom: { name: "mantar", color: "#d9b06b" },
  fish: { name: "balık", color: "#6fa8c9" },
  apple: { name: "elma", color: "#d43030" },
  orange: { name: "portakal", color: "#f08a24" },
  tangerine: { name: "mandalina", color: "#ffaa3c" },
  nut: { name: "yemiş", color: "#9a6c40" },
  egg: { name: "yumurta", color: "#f0ead8" },
  milk: { name: "süt", color: "#eef2f5" },
  meat: { name: "et", color: "#c05a50" },
  wool: { name: "yün", color: "#e8e4d4" },
};

// Yenebilirler (tüketim önceliği sırasıyla)
export const FOOD_TYPES: ItemType[] = [
  "berry", "mushroom", "apple", "orange", "tangerine", "nut", "egg", "fish", "milk", "meat",
];

export const resources: Record<ItemType, number> & { cap: number; knowledge: number } = {
  ...(Object.fromEntries(ITEM_TYPES.map((t) => [t, 0])) as Record<ItemType, number>),
  wood: 20,
  berry: 20,
  mushroom: 4,
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
