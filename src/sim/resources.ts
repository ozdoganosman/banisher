// Koloninin kaynak stoğu. Köylüler topladıklarını kişisel çantalarında taşır,
// kampa/depoya teslim edince buraya eklenir. Depo binaları kapasiteyi artırır.

export type ItemType =
  | "wood" | "log" | "stone"
  | "berry" | "mushroom" | "fish"
  | "meat" | "leather" | "wool"
  | "milk" | "egg";

export const ITEM_TYPES: ItemType[] = [
  "wood", "log", "stone",
  "berry", "mushroom", "fish",
  "meat", "leather", "wool",
  "milk", "egg",
];

export const ITEM_INFO: Record<ItemType, { name: string; color: string }> = {
  wood: { name: "dal", color: "#8a6a43" },
  log: { name: "odun", color: "#6b4a2b" },
  stone: { name: "taş", color: "#9aa0a8" },
  berry: { name: "yemiş", color: "#d43f3f" },
  mushroom: { name: "mantar", color: "#d9b06b" },
  fish: { name: "balık", color: "#6fa8c9" },
  meat: { name: "et", color: "#c0564a" },
  leather: { name: "deri", color: "#a87c4f" },
  wool: { name: "yün", color: "#e8e4da" },
  milk: { name: "süt", color: "#eef0f0" },
  egg: { name: "yumurta", color: "#f0e0b0" },
};

// Yenebilirler (tüketim önceliği sırasıyla)
export const FOOD_TYPES: ItemType[] = [
  "berry", "mushroom", "fish", "meat", "milk", "egg",
];

export const FOOD_NUTRITION: Record<ItemType, number> = {
  berry: 8, // yemiş: bol bulunur ama az doyurur (+%20)
  mushroom: 12, // mantar yemişten daha besleyicidir (+%20)
  fish: 15,
  meat: 14, // av eti doyurucudur
  milk: 9, // çiftlikten yenilenebilir besin
  egg: 8, // çiftlikten yenilenebilir besin
  wood: 0,
  log: 0,
  stone: 0,
  leather: 0,
  wool: 0,
};

export const resources: Record<ItemType, number> & { cap: number; knowledge: number; faith: number } = {
  ...(Object.fromEntries(ITEM_TYPES.map((t) => [t, 0])) as Record<ItemType, number>),
  wood: 20,
  berry: 45, // 10 kişilik kabilenin ilk gün erzağı
  cap: 200, // ÜRÜN BAŞINA depo sınırı (her eşya tipi ayrı ayrı bu kadar tutar; depolar artırır)
  knowledge: 0, // tapınaklarda üretilir; depo kapasitesine tabi değildir
  faith: 0, // inanç: tapınak ve ileti yanıtlarından birikir; ilahî güçleri besler
};

// Toplam depolanmış kaynak miktarı (bilgi hariç)
export function totalStored(): number {
  let total = 0;
  for (const item of ITEM_TYPES) {
    total += resources[item];
  }
  return total;
}

// Stoğa ekle (ürün başına sınırla); gerçekten eklenen miktarı döndürür
export function addItem(item: ItemType, n: number): number {
  const space = resources.cap - resources[item];
  const added = Math.max(0, Math.min(space, n));
  resources[item] += added;
  return added;
}

// Bu ürünün deposu dolu mu? Her ürün kendi sınırına ayrı ulaşır
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
