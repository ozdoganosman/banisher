// Hedef/görev zinciri: oyuncuya "şimdi ne için oynuyorum" hissi veren,
// mekanikleri sırayla öğreten tutorial hedefleri. Tek hedef aktiftir;
// tamamlanınca bilgi ödülü verilir ve sıradaki açılır (main tetikler, HUD çizer).

import type { World } from "../world/world";
import type { Villager } from "./villager";
import type { Animal } from "./animals";
import { BuildingType, type Building } from "./buildings";
import { foodTotal, resources } from "./resources";
import { purchasedList } from "./tech";
import { totalDays } from "./time";

export interface GoalCtx {
  world: World;
  villagers: Villager[];
  buildings: Building[];
  animals: Animal[];
}

export interface Goal {
  id: string;
  title: string;
  hint: string; // nerede/nasıl yapılacağını anlatan tutorial satırı
  reward: number; // bilgi
  check: (c: GoalCtx) => boolean;
  progress?: (c: GoalCtx) => { cur: number; max: number };
}

export const GOALS: Goal[] = [
  {
    id: "yemis_isaretle",
    title: "5 yemiş çalısı işaretle",
    hint: "Çalılara sol tıkla ya da sürükleyerek alan seç (J: Yiyecek filtresi); işçiler gidip toplar",
    reward: 1,
    check: (c) => c.world.markedBushes.size >= 5,
    progress: (c) => ({ cur: c.world.markedBushes.size, max: 5 }),
  },
  {
    id: "ev",
    title: "Bir Ev inşa et",
    hint: "Alttaki araç çubuğundan seç (1 tuşu, 8 dal) ve çimene yerleştir; boş ev = yeni bebek şansı",
    reward: 1,
    check: (c) => c.buildings.some((b) => b.type === BuildingType.House && b.done),
  },
  {
    id: "tapinak",
    title: "Tapınak inşa et",
    hint: "Araç çubuğundan seç (2 tuşu, 20 dal); işçiler orada ibadet ederek bilgi üretir",
    reward: 2,
    check: (c) => c.buildings.some((b) => b.type === BuildingType.Temple && b.done),
  },
  {
    id: "bilgi6",
    title: "6 bilgi biriktir",
    hint: "İbadet bilgiyi yavaşça doldurur — üst bardaki Teknoloji sayacından izle",
    reward: 2,
    check: () => resources.knowledge >= 6,
    progress: () => ({ cur: Math.floor(resources.knowledge), max: 6 }),
  },
  {
    id: "arastirma",
    title: "İlk araştırmanı yap",
    hint: "T ile teknoloji ağacını aç — Beşer (+10 moral) iyi bir başlangıçtır",
    reward: 3,
    check: () => purchasedList().length >= 1,
  },
  {
    id: "yemek100",
    title: "100 yemek depola",
    hint: "Yemiş ve mantar topla; kış (her yılın 4. günü) çetin geçer, çalılar boşalır",
    reward: 4,
    check: () => foodTotal() >= 100,
    progress: () => ({ cur: Math.floor(foodTotal()), max: 100 }),
  },
  {
    id: "kis",
    title: "İlk kışı atlat",
    hint: "Soğukta moral erir: ateş (Doğa araştırması) ve bol yemek stoğu hayat kurtarır",
    reward: 4,
    check: (c) => totalDays() >= 4 && c.villagers.length > 0,
  },
  {
    id: "nufus15",
    title: "Nüfusu 15'e çıkar",
    hint: "Boş yeri olan evlerde her gün dönümünde hamilelik şansı var — ev yapmaya devam",
    reward: 5,
    check: (c) => c.villagers.length >= 15,
    progress: (c) => ({ cur: c.villagers.length, max: 15 }),
  },
  {
    id: "balta",
    title: "İlk baltayı ürettir",
    hint: "Alet Atölyesi'ni araştırıp kur; binaya tıklayıp balta sipariş et (3 dal + 3 taş)",
    reward: 5,
    check: (c) =>
      c.villagers.some((v) => v.hasAxe) || c.buildings.some((b) => b.toolStock > 0),
  },
  {
    id: "mizrak",
    title: "İlk mızrağı ürettir",
    hint: "Kan araştırması Avcı Kulübesi'ni açar; mızrak atölyede üretilir (5 dal + 2 odun + 5 taş)",
    reward: 5,
    check: (c) =>
      c.villagers.some((v) => v.spears > 0) || c.buildings.some((b) => b.spearStock > 0),
  },
  {
    id: "kopek",
    title: "Bir kurdu evcilleştir",
    hint: "Aidiyet'i araştır; kurda tıklayıp 🤝 Evcilleştir de — köpek avcılara yardım eder",
    reward: 6,
    check: (c) => c.animals.some((a) => a.type === "dog"),
  },
  {
    id: "nufus20",
    title: "Nüfusu 20'ye çıkar",
    hint: "Gerçek bir köy! Yeni evler, bol yemek ve yırtıcılara karşı mızraklı avcılar",
    reward: 8,
    check: (c) => c.villagers.length >= 20,
    progress: (c) => ({ cur: c.villagers.length, max: 20 }),
  },
  {
    id: "suru",
    title: "Çiftlikte 5 hayvanlık sürü kur",
    hint: "Çiftlik kur, tür seç, yabanileri evcilleştir; dişi+erkek çift ağılda yavru yapar",
    reward: 8,
    check: (c) =>
      c.buildings.some(
        (b) =>
          b.type === BuildingType.Barn &&
          b.done &&
          c.animals.filter((a) => a.barn === b && !a.dead).length >= 5
      ),
  },
];

// Aktif hedefin sırası (kaydedilir/yüklenir)
export const goalState = { index: 0 };

export function currentGoal(): Goal | null {
  return goalState.index < GOALS.length ? GOALS[goalState.index] : null;
}

// Her adımda çağrılır; hedef tamamlandıysa ödülü verip hedefi döndürür
// (mesaj ve defter kaydı main'de yapılır)
export function tickGoals(c: GoalCtx): Goal | null {
  const g = currentGoal();
  if (!g || !g.check(c)) return null;
  resources.knowledge += g.reward;
  goalState.index++;
  return g;
}
