// Koloni otomasyon politikaları: oyuncu "Otomasyon" panelinden (P) açıp kapatır.
// Angarya işler otomatik yapılır; oyuncu yalnızca yön verir/müdahale eder.

export const policy = {
  gather: true, // boştaki işçiler eksik kaynağı kendiliğinden toplar
  research: true, // bilgi yettikçe en ucuz uygun araştırma yapılır
  tools: true, // alet atölyesi balta/mızrak stoğunu düşükse kendiliğinden sipariş eder
  staff: true, // yeni/eksik kadrolu binalar boştaki işçilerle otomatik doldurulur
};

export type PolicyKey = keyof typeof policy;

export const POLICY_INFO: { key: PolicyKey; name: string; desc: string }[] = [
  { key: "gather", name: "Otomatik toplama", desc: "Boştaki işçiler eksik dal/odun/yemiş/mantar/taşı toplar" },
  { key: "research", name: "Otomatik araştırma", desc: "Bilgi yettikçe en ucuz uygun araştırma yapılır" },
  { key: "tools", name: "Otomatik alet siparişi", desc: "Balta/mızrak azaldığında atölyeye sipariş açılır" },
  { key: "staff", name: "Otomatik işçi dağıtımı", desc: "Kadrosu eksik binalar boştaki işçilerle doldurulur" },
];
