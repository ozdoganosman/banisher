// Savaş ve tehlike defteri: oyuncunun okuyabileceği olay kayıtları
// (yırtıcı saldırıları, çığlıklar, ölümler, kazanılan dövüşler)

import { dateString, timeString } from "./time";

export interface JournalEntry {
  stamp: string; // "İlkbahar/2 14:30"
  text: string;
}

export const journal: JournalEntry[] = [];

export function addJournal(text: string): void {
  journal.unshift({ stamp: `${dateString()} ${timeString()}`, text });
  if (journal.length > 60) journal.pop();
}
