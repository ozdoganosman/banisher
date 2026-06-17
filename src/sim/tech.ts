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
  | "gathering"
  | "leatherworking"
  | "aidiyet"
  | "ciftlik"
  | "tarim"
  | "hirs";

export interface Tech {
  id: TechId;
  name: string;
  cost: number; // bilgi
  desc: string;
  icon: string; // kartta ve düğümde gösterilen amblem
  unlocks?: string; // araştırılınca açılan şeyin kısa adı (kutlama bandında)
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
    icon: "🙏",
    unlocks: "Tanrı inancı: herkese +10 moral",
    gridX: 0,
    gridY: 0,
  },
  {
    id: "motorskills",
    name: "Motor Beceriler",
    cost: 10,
    desc: "Herkes %20 daha hızlı yürür ve çalışır",
    icon: "🏃",
    unlocks: "Herkes %20 daha hızlı",
    gridX: 0,
    gridY: 2,
  },
  {
    id: "nature",
    name: "Doğa",
    cost: 6,
    desc: "Ateş keşfedilir: binalara meşale takılır, gece ateş başında moral artar",
    icon: "🔥",
    unlocks: "Ateş: binalara meşale, gece ısınma",
    gridX: 0,
    gridY: 4,
  },
  {
    id: "capital",
    name: "Sermaye",
    cost: 12,
    desc: "Depo binasını açar",
    icon: "📦",
    unlocks: "Depo binası",
    prereq: ["humanity"],
    gridX: 1,
    gridY: 0,
  },
  {
    id: "korku",
    name: "Korku",
    cost: 12,
    desc: "Tehlikede çığlık atılır: sesi duyan silahlı köylüler yardıma koşar",
    icon: "😱",
    unlocks: "Çığlık: silahlılar yardıma koşar",
    prereq: ["nature"],
    gridX: 1,
    gridY: 4,
  },
  {
    id: "merak",
    name: "Merak",
    cost: 16,
    desc: "İnsanlar ara ara sana ileti gönderir; tıklayıp mikrofonla yanıtla: şok olur, 2 gün boyunca morali çok yükselir",
    icon: "💡",
    unlocks: "İleti: mikrofonla yanıt",
    prereq: ["korku"],
    gridX: 2,
    gridY: 4,
  },
  {
    id: "cognitive",
    name: "Bilişsel ve Problem Çözme Becerileri",
    cost: 14,
    desc: "Bakımevini açar; orada eğitilen çocuklar %20 daha hızlı çalışır ve yürür",
    icon: "🧠",
    unlocks: "Bakımevi binası",
    prereq: ["motorskills"],
    gridX: 1,
    gridY: 2,
  },
  {
    id: "hardobjects",
    name: "Sert Cisimler",
    cost: 12,
    desc: "Yerden çakıl toplanabilir (taş verir)",
    icon: "🪨",
    unlocks: "Çakıl toplama (taş)",
    prereq: ["capital"],
    gridX: 2,
    gridY: 0,
  },
  {
    id: "mushroomology",
    name: "Mantaroloji",
    cost: 9,
    desc: "Yabani mantarlar tanınır ve toplanabilir",
    icon: "🍄",
    unlocks: "Mantar toplama",
    prereq: ["nature"],
    gridX: 1,
    gridY: 6,
  },
  {
    id: "gathering",
    name: "Toplayıcılık",
    cost: 16,
    desc: "Toplayıcı kulübesini açar: doğaya yemiş eker ve toplar",
    icon: "🧺",
    unlocks: "Toplayıcı kulübesi",
    prereq: ["mushroomology"],
    gridX: 2,
    gridY: 6,
  },
  {
    id: "aidiyet",
    name: "Aidiyet",
    cost: 18,
    desc: "Kurtlar evcilleştirilip köpek olur; köpek avcısıyla gezer, ava saldırır ve av menzilini genişletir",
    icon: "🐕",
    unlocks: "Köpek evcilleştirme",
    prereq: ["merak"],
    gridX: 3,
    gridY: 4,
  },
  {
    id: "ciftlik",
    name: "Çiftlik",
    cost: 22,
    desc: "Çiftlik kurulur: tür seçilir; o türe evrilen yabaniler evcilleştirilince çiftliğe gelir",
    icon: "🐄",
    unlocks: "Çiftlik binası",
    prereq: ["aidiyet", "gathering"],
    gridX: 4,
    gridY: 6,
  },
  {
    id: "tarim",
    name: "Tarım",
    cost: 24,
    desc: "Tarla kurulur: ekinciler tohum eker, ekin mevsiminde olgunlaşır, hasatta tahıl verir (kışın tarla durur)",
    icon: "🌾",
    unlocks: "Tarla + tahıl hasadı",
    prereq: ["gathering"],
    gridX: 3,
    gridY: 6,
  },
  {
    id: "hirs",
    name: "Hırs",
    cost: 16,
    desc: "Taş yol döşenir (karo başına 1 taş); yol üstünde %40 hızlı yürünür",
    icon: "🛣️",
    unlocks: "Taş yol",
    prereq: ["aidiyet", "hardobjects"],
    gridX: 4,
    gridY: 4,
  },
  {
    id: "kan",
    name: "Kan",
    cost: 20,
    desc: "Avcı kulübesini açar; atölyede mızrak üretilir (5 dal + 2 odun + 5 taş)",
    icon: "🩸",
    unlocks: "Avcı kulübesi + mızrak",
    prereq: ["toolworkshop"],
    gridX: 4,
    gridY: 2,
  },
  {
    id: "leatherworking",
    name: "Deri İşleme",
    cost: 18,
    desc: "Av postları (deri) atölyede giysiye işlenir; giysili köylü kışın üşümez ve yavaşlamaz",
    icon: "🧥",
    unlocks: "Deri giysi üretimi",
    prereq: ["kan"],
    gridX: 5,
    gridY: 2,
  },
  {
    id: "toolworkshop",
    name: "Alet Atölyesi",
    cost: 18,
    desc: "Alet atölyesini açar: baltayla ağaç kesilip odun alınır",
    icon: "🪓",
    unlocks: "Alet Atölyesi + balta",
    prereq: ["cognitive", "hardobjects"],
    gridX: 3,
    gridY: 1,
  },
];

const purchased = new Set<TechId>();

export function hasTech(id: TechId): boolean {
  return purchased.has(id);
}

export function prereqsMet(tech: Tech): boolean {
  return !tech.prereq || tech.prereq.every((p) => purchased.has(p));
}

// Maliyet katlamalı artar: her araştırılan, sonrakileri pahalılaştırır.
// Böylece kabile geliştikçe ilerleme giderek daha büyük bir yatırım ister.
const COST_ESCALATION = 1.27;
export function currentCost(tech: Tech): number {
  return Math.round(tech.cost * Math.pow(COST_ESCALATION, purchased.size));
}

// Oto-araştırmanın sıradaki hedefi: ön koşulu sağlanmış, en ucuz alınmamış araştırma
export function cheapestAvailable(): Tech | null {
  let pick: Tech | null = null;
  for (const t of TECHS) {
    if (purchased.has(t.id) || !prereqsMet(t)) continue;
    if (!pick || currentCost(t) < currentCost(pick)) pick = t;
  }
  return pick;
}

// Debug/hile: araştırmayı koşulsuz ve bedava aç
export function grantTech(id: TechId): void {
  purchased.add(id);
}

// Kaydet/Yükle
export function purchasedList(): TechId[] {
  return [...purchased];
}

export function restorePurchased(ids: TechId[]): void {
  purchased.clear();
  for (const id of ids) purchased.add(id);
}

// Araştırmayı satın al; başarılıysa true döner
export function buyTech(id: TechId): boolean {
  const tech = TECHS.find((t) => t.id === id);
  if (!tech || purchased.has(id)) return false;
  if (!prereqsMet(tech)) return false;
  const cost = currentCost(tech);
  if (resources.knowledge < cost) return false;
  resources.knowledge -= cost;
  purchased.add(id);
  return true;
}
