// Teknoloji ağacı: tapınaklarda üretilen bilgiyle araştırılır.
// Etkiler ilgili sistemlerde hasTech() ile okunur.

import { resources } from "./resources";

export type TechId = "axes" | "forage" | "bags" | "construction" | "storage";

export interface Tech {
  id: TechId;
  name: string;
  cost: number; // bilgi
  desc: string;
}

export const TECHS: Tech[] = [
  {
    id: "axes",
    name: "Keskin Baltalar",
    cost: 10,
    desc: "Ağaç kesimi %25 daha hızlı; ağaç başına +1 odun",
  },
  {
    id: "forage",
    name: "Usta Toplayıcılık",
    cost: 12,
    desc: "Meyve, mantar ve balık verimi +1",
  },
  {
    id: "construction",
    name: "Hızlı İnşaat",
    cost: 12,
    desc: "İnşaatlar %30 daha hızlı tamamlanır",
  },
  {
    id: "bags",
    name: "Büyük Çantalar",
    cost: 15,
    desc: "Köylü çantası 8 → 12 eşya taşır",
  },
  {
    id: "storage",
    name: "Geniş Ambarlar",
    cost: 20,
    desc: "Depo kapasitesi anında +40",
  },
];

const purchased = new Set<TechId>();

export function hasTech(id: TechId): boolean {
  return purchased.has(id);
}

// Araştırmayı satın al; başarılıysa true döner
export function buyTech(id: TechId): boolean {
  const tech = TECHS.find((t) => t.id === id);
  if (!tech || purchased.has(id) || resources.knowledge < tech.cost) return false;
  resources.knowledge -= tech.cost;
  purchased.add(id);
  if (id === "storage") resources.cap += 40;
  return true;
}
