// Teknoloji ağacı: tapınaklarda üretilen bilgiyle araştırılır.
// Etkiler ilgili sistemlerde hasTech() ile okunur.

import { resources } from "./resources";

export type TechId =
  | "humanity"
  | "nature"
  | "capital"
  | "collective"
  | "mushroomology"
  | "fishing";

export interface Tech {
  id: TechId;
  name: string;
  cost: number; // bilgi
  desc: string;
  prereq?: TechId;
  gridX: number;
  gridY: number;
}

export const TECHS: Tech[] = [
  {
    id: "humanity",
    name: "Beşer",
    cost: 6,
    desc: "Oduncu, çiftlik, yemekhane, bakımevi ve meşaleyi açar",
    gridX: 0,
    gridY: 1,
  },
  {
    id: "nature",
    name: "Doğa",
    cost: 6,
    desc: "Toplayıcıyı açar",
    gridX: 0,
    gridY: 3,
  },
  {
    id: "capital",
    name: "Sermaye",
    cost: 12,
    desc: "Depo binasını açar",
    prereq: "humanity",
    gridX: 1,
    gridY: 0,
  },
  {
    id: "collective",
    name: "Kollektif",
    cost: 12,
    desc: "Kollektif binasını açar (sadece gıda depolar)",
    prereq: "nature",
    gridX: 1,
    gridY: 2,
  },
  {
    id: "fishing",
    name: "Balıkçılık",
    cost: 12,
    desc: "Balıkçı kulübesini açar",
    prereq: "nature",
    gridX: 1,
    gridY: 3,
  },
  {
    id: "mushroomology",
    name: "Mantaroloji",
    cost: 15,
    desc: "Mantarcı binasını açar (mantar ekilip toplanır)",
    prereq: "collective",
    gridX: 2,
    gridY: 2,
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
  if (tech.prereq && !purchased.has(tech.prereq)) return false;
  resources.knowledge -= tech.cost;
  purchased.add(id);
  return true;
}
