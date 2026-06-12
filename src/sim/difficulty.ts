// Zorluk seviyesi: oyun başında seçilir, temel hayatta kalma değerlerini ayarlar

export type DifficultyLevel = "easy" | "normal" | "hard";

export const difficulty = {
  level: "normal" as DifficultyLevel,
  hungerPerDay: 40, // günlük açlık artışı
  wolfDay: 7, // kurtların türemeye başladığı gün
  bearDay: 11, // ayıların türemeye başladığı gün
  startBerry: 45,
  startVillagers: 10,
  startMoraleBonus: 0, // başlangıç moraline eklenir
};

export const DIFFICULTY_PRESETS: Record<
  DifficultyLevel,
  { name: string; desc: string; apply: () => void }
> = {
  easy: {
    name: "🌿 Kolay",
    desc: "Bol erzak, tok karın, yırtıcılar bir yıl geç gelir",
    apply: () => {
      difficulty.level = "easy";
      difficulty.hungerPerDay = 30;
      difficulty.wolfDay = 11; // Kış/2
      difficulty.bearDay = 15; // Kış/3
      difficulty.startBerry = 70;
      difficulty.startMoraleBonus = 15;
    },
  },
  normal: {
    name: "⚖ Normal",
    desc: "Dengeli açlık ve tehlike: kurt Kış/1, ayı Kış/2",
    apply: () => {
      difficulty.level = "normal";
    },
  },
  hard: {
    name: "💀 Zor",
    desc: "Az erzak, hızlı açlık, yırtıcılar ilk kıştan saldırır",
    apply: () => {
      difficulty.level = "hard";
      difficulty.hungerPerDay = 52;
      difficulty.wolfDay = 3; // Kış/0!
      difficulty.bearDay = 7; // Kış/1
      difficulty.startBerry = 25;
      difficulty.startVillagers = 8;
      difficulty.startMoraleBonus = -5;
    },
  },
};
