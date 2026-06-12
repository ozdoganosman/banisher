// Teknoloji ağacı: tapınaklarda üretilen bilgiyle araştırılır.
// Etkiler ilgili sistemlerde hasTech() ile okunur.

import { resources } from "./resources";

export type TechId =
  | "humanity"
  | "nature"
  | "capital"
  | "korku"
  | "merak"
  | "mushroomology"
  | "hardobjects"
  | "motorskills"
  | "cognitive"
  | "toolworkshop"
  | "kan"
  | "gathering";

export interface Tech {
  id: TechId;
  name: string;
  cost: number; // bilgi
  desc: string;
  prereq?: TechId[]; // tümü araştırılmadan açılmaz
  gridX: number;
  gridY: number;
}

export const TECHS: Tech[] = [
  {
    id: "humanity",
    name: "Beşer",
    cost: 6,
    desc: "Tanrı inancı doğar: herkese kalıcı +10 moral",
    gridX: 0,
    gridY: 0,
  },
  {
    id: "motorskills",
    name: "Motor Beceriler",
    cost: 10,
    desc: "Herkes %20 daha hızlı yürür ve çalışır",
    gridX: 0,
    gridY: 2,
  },
  {
    id: "nature",
    name: "Doğa",
    cost: 6,
    desc: "Ateş keşfedilir: binalara meşale takılır, gece ateş başında moral artar",
    gridX: 0,
    gridY: 4,
  },
  {
    id: "capital",
    name: "Sermaye",
    cost: 12,
    desc: "Depo binasını açar",
    prereq: ["humanity"],
    gridX: 1,
    gridY: 0,
  },
  {
    id: "korku",
    name: "Korku",
    cost: 12,
    desc: "Tehlikede çığlık atılır: sesi duyan silahlı köylüler yardıma koşar",
    prereq: ["nature"],
    gridX: 1,
    gridY: 4,
  },
  {
    id: "merak",
    name: "Merak",
    cost: 16,
    desc: "İnsanlar ara ara sana yakarır; tıklayıp mikrofonla konuş: şok olur, 2 gün boyunca morali çok yükselir",
    prereq: ["korku"],
    gridX: 2,
    gridY: 4,
  },
  {
    id: "cognitive",
    name: "Bilişsel ve Problem Çözme Becerileri",
    cost: 14,
    desc: "Bakımevini açar; orada eğitilen çocuklar %20 daha hızlı çalışır ve yürür",
    prereq: ["motorskills"],
    gridX: 1,
    gridY: 2,
  },
  {
    id: "hardobjects",
    name: "Sert Cisimler",
    cost: 12,
    desc: "Yerden çakıl toplanabilir (taş verir)",
    prereq: ["capital"],
    gridX: 2,
    gridY: 0,
  },
  {
    id: "mushroomology",
    name: "Mantaroloji",
    cost: 15,
    desc: "Yabani mantarlar tanınır ve toplanabilir",
    prereq: ["nature"],
    gridX: 1,
    gridY: 6,
  },
  {
    id: "gathering",
    name: "Toplayıcılık",
    cost: 16,
    desc: "Toplayıcı kulübesini açar: doğaya yemiş eker ve toplar",
    prereq: ["mushroomology"],
    gridX: 2,
    gridY: 6,
  },
  {
    id: "kan",
    name: "Kan",
    cost: 20,
    desc: "Avcı kulübesini açar; atölyede mızrak üretilir (5 taş + 7 dal)",
    prereq: ["toolworkshop"],
    gridX: 4,
    gridY: 2,
  },
  {
    id: "toolworkshop",
    name: "Alet Atölyesi",
    cost: 18,
    desc: "Alet atölyesini açar: baltayla ağaç kesilip odun alınır",
    prereq: ["cognitive", "hardobjects"],
    gridX: 3,
    gridY: 2,
  },
];

const purchased = new Set<TechId>();

export function hasTech(id: TechId): boolean {
  return purchased.has(id);
}

export function prereqsMet(tech: Tech): boolean {
  return !tech.prereq || tech.prereq.every((p) => purchased.has(p));
}

// Araştırmayı satın al; başarılıysa true döner
export function buyTech(id: TechId): boolean {
  const tech = TECHS.find((t) => t.id === id);
  if (!tech || purchased.has(id) || resources.knowledge < tech.cost) return false;
  if (!prereqsMet(tech)) return false;
  resources.knowledge -= tech.cost;
  purchased.add(id);
  return true;
}
