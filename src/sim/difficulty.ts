// Zorluk seviyesi: oyun başında seçilir, temel hayatta kalma değerlerini ayarlar

export type DifficultyLevel = "easy" | "normal" | "hard";

export const difficulty = {
  level: "normal" as DifficultyLevel,
  hungerPerDay: 44, // günlük açlık artışı
  wolfDay: 7, // kurtların türemeye başladığı gün
  bearDay: 11, // ayıların türemeye başladığı gün
  startBerry: 40,
  startVillagers: 10,
  startMoraleBonus: 0, // başlangıç moraline eklenir
};

export const DIFFICULTY_PRESETS: Record<
  DifficultyLevel,
  { name: string; desc: string; apply: () => void }
> = {
  // Her ön ayar TÜM alanları yazar (idempotent): difficulty paylaşılan tekil
  // nesnedir; eksik alan bırakan bir ön ayar, daha önce seçilen başka ön
  // ayardan değer sızdırırdı (ör. Zor→Normal eski hungerPerDay/wolfDay'i
  // taşırdı). Her seçim baştan tam bir profil kurar.
  easy: {
    name: "🌿 Kolay",
    desc: "Bol erzak, tok karın, yırtıcılar bir yıl geç gelir",
    apply: () =>
      Object.assign(difficulty, {
        level: "easy",
        hungerPerDay: 30,
        wolfDay: 11, // Kış/2
        bearDay: 15, // Kış/3
        startBerry: 70,
        startVillagers: 10,
        startMoraleBonus: 15,
      }),
  },
  normal: {
    name: "⚖ Normal",
    desc: "Dengeli açlık ve tehlike: kurt Kış/1, ayı Kış/2",
    apply: () =>
      Object.assign(difficulty, {
        level: "normal",
        hungerPerDay: 44,
        wolfDay: 7, // Kış/1
        bearDay: 11, // Kış/2
        startBerry: 40,
        startVillagers: 10,
        startMoraleBonus: 0,
      }),
  },
  hard: {
    name: "💀 Zor",
    desc: "Az erzak, hızlı açlık, yırtıcılar ilk kıştan saldırır",
    apply: () =>
      Object.assign(difficulty, {
        level: "hard",
        hungerPerDay: 56,
        wolfDay: 3, // Kış/0!
        bearDay: 7, // Kış/1
        startBerry: 22,
        startVillagers: 8,
        startMoraleBonus: -5,
      }),
  },
};
