// Oyun takvimi, mevsimler ve gün/gece döngüsü.
// Takvim: 1 gün = 1 mevsim, 4 mevsim (4 gün) = 1 yıl.
// Tarih 0.0.0'dan başlar (gün.mevsim.yıl).

// Debug/denge ayarları: window.__game.tuning üzerinden canlı değiştirilebilir.
// - dayLength: bir oyun gününün gerçek saniye süresi (1x hızda)
// - timeScale: yalnız takvimi/saati hızlandırır-yavaşlatır (sim hızı sabit kalır)
// - moveSpeed: köylülerin temel hareket hızı çarpanı
export const tuning = {
  dayLength: 300,
  timeScale: 1,
  moveSpeed: 1,
};

export const DAYS_PER_YEAR = 4; // her gün bir mevsimdir
export const MONTH_DAYS = 1; // geriye uyumluluk (1 ay = 1 gün = 1 mevsim)

export const gameTime = {
  total: 0, // toplam geçen takvim-saniyesi
  day: 0, // yıl içindeki gün (0-3)
  month: 0, // mevsim indeksi (0-3)
  year: 0,
};

export function updateTime(dt: number): void {
  gameTime.total += dt * tuning.timeScale;
  const days = Math.floor(gameTime.total / tuning.dayLength);
  gameTime.day = days % DAYS_PER_YEAR;
  gameTime.month = gameTime.day; // 1 gün = 1 mevsim
  gameTime.year = Math.floor(days / DAYS_PER_YEAR);
}

export type Season = 0 | 1 | 2 | 3;

export const SEASON_NAMES = ["İlkbahar", "Yaz", "Sonbahar", "Kış"] as const;
export const SEASON_COLORS = ["#8fd05e", "#ffd23c", "#e8842c", "#bcd9f0"] as const;

export function season(): Season {
  return (totalDays() % DAYS_PER_YEAR) as Season;
}

// Bitki yeniden büyüme çarpanı: baharda hızlı, kışın durur
export function regrowFactor(): number {
  return [1.2, 1.3, 1, 0][season()];
}

export function dateString(): string {
  // mevsim/yıl: her ilkbaharda yıl bir artar (yıl = 4 gün)
  return `${SEASON_NAMES[season()]}/${gameTime.year}`;
}

// Başlangıçtan beri geçen toplam gün (yaş hesabı vb. için)
export function totalDays(): number {
  return Math.floor(gameTime.total / tuning.dayLength);
}

// Gün içindeki konum: 0 = sabah, 1 = ertesi sabah
export function dayFrac(): number {
  return (gameTime.total % tuning.dayLength) / tuning.dayLength;
}

// Saat: gün 06:00'da başlar (frac 0), gece ~22:45-04:00 arasıdır
export function timeString(): string {
  const h24 = (6 + dayFrac() * 24) % 24;
  const hh = Math.floor(h24);
  const mm = Math.floor((h24 - hh) * 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

// 0 = gündüz, 1 = zifiri gece (alacakaranlıkta yumuşak geçiş)
export function darkness(): number {
  const f = dayFrac();
  if (f < 0.7) return 0;
  if (f < 0.78) return (f - 0.7) / 0.08; // akşam çöküyor
  if (f < 0.92) return 1; // gece
  return 1 - (f - 0.92) / 0.08; // şafak
}

// Çalışmayı engelleyecek kadar karanlık mı? (meşale ışığı gerekir)
export function isNight(): boolean {
  return darkness() > 0.5;
}

// 00:00 - 06:00 arası uyku vaktidir (köylüler eve/kampa döner)
export function isSleepTime(): boolean {
  return dayFrac() >= 0.75;
}
