// Rastgele olay bayrakları: olayların kendisi main.ts'te tetiklenir,
// köylü simülasyonunun okuması gereken etkiler buradan paylaşılır.

import { totalDays } from "./time";

export const eventFlags = {
  coldSnapUntilDay: -1, // ayaz: bu güne dek üşüme çok daha keskin
};

export function coldSnapActive(): boolean {
  return totalDays() < eventFlags.coldSnapUntilDay;
}
