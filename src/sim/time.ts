// Oyun takvimi ve gün/gece döngüsü.
// Tarih 0.0.0'dan başlar (gün.ay.yıl); 30 gün = 1 ay, 12 ay = 1 yıl.

export const DAY_LENGTH = 150; // bir oyun günü kaç gerçek saniye

export const gameTime = {
  total: 0, // toplam geçen saniye
  day: 0,
  month: 0,
  year: 0,
};

export function updateTime(dt: number): void {
  gameTime.total += dt;
  const days = Math.floor(gameTime.total / DAY_LENGTH);
  gameTime.day = days % 30;
  gameTime.month = Math.floor(days / 30) % 12;
  gameTime.year = Math.floor(days / 360);
}

export function dateString(): string {
  return `${gameTime.day}.${gameTime.month}.${gameTime.year}`;
}

// Başlangıçtan beri geçen toplam gün (bebek yaşı vb. için)
export function totalDays(): number {
  return Math.floor(gameTime.total / DAY_LENGTH);
}

// Gün içindeki konum: 0 = sabah, 1 = ertesi sabah
export function dayFrac(): number {
  return (gameTime.total % DAY_LENGTH) / DAY_LENGTH;
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
