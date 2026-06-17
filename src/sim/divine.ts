// İlahî güçler: oyuncu (dışarıdan yönlendiren tanrı) inanç harcayarak kolonyi
// yönlendirir. Buradaki bayraklar süreli etkileri tutar; etkiler ilgili
// sistemlerde okunur (kehanetler, mucizeler, peygamber aurası).

import { totalDays } from "./time";

export const divine = {
  wisdomUntilDay: -1, // Kehanet: Bilgelik — ayin verimi 2 katı
  bountyUntilDay: -1, // Kehanet: Bereket — toplama ve doğurganlık artar
  shieldUntilDay: -1, // Mucize: Koruma Kalkanı — yırtıcılar kaçar
};

export function wisdomActive(): boolean {
  return totalDays() < divine.wisdomUntilDay;
}
export function bountyActive(): boolean {
  return totalDays() < divine.bountyUntilDay;
}
export function shieldActive(): boolean {
  return totalDays() < divine.shieldUntilDay;
}

// İlahî güçlerin verisi (etki/uygulama main'de id'ye göre yapılır)
export type DivinePowerId = "prophet" | "wisdom" | "bounty" | "heal" | "shield";
export interface DivinePower {
  id: DivinePowerId;
  name: string;
  icon: string;
  cost: number; // inanç
  cooldown: number; // saniye
  desc: string;
}
export const DIVINE_POWERS: DivinePower[] = [
  { id: "prophet", name: "Peygamber Yolla", icon: "🙏", cost: 40, cooldown: 90,
    desc: "Bir köylü peygamber olur: çevresine ilham (moral) yayar, ilhamla hızlı çalışır" },
  { id: "wisdom", name: "Kehanet: Bilgelik", icon: "📜", cost: 25, cooldown: 120,
    desc: "2 gün boyunca tapınak bilgisi iki katına çıkar" },
  { id: "bounty", name: "Kehanet: Bereket", icon: "🌾", cost: 25, cooldown: 120,
    desc: "2 gün: toplama verimi ve doğurganlık artar; çevreye yemiş saçılır" },
  { id: "heal", name: "Mucize: Şifa", icon: "✨", cost: 20, cooldown: 60,
    desc: "Herkes anında iyileşir, hastalık geçer, moral yükselir" },
  { id: "shield", name: "Mucize: Koruma Kalkanı", icon: "🛡️", cost: 30, cooldown: 90,
    desc: "1 gün boyunca yırtıcılar saldıramaz, ürküp kaçar" },
];

// Güç bekleme süreleri (saniye); main her karede azaltır
export const divineCooldown: Record<string, number> = {};

