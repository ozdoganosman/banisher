// Köylü kimlikleri: rastgele Türkçe ad, soyad, yaş ve cinsiyet

const MALE_NAMES = [
  "Ali", "Mehmet", "Ahmet", "Mustafa", "Hasan", "Hüseyin", "İbrahim",
  "Osman", "Yusuf", "Ömer", "Murat", "Emre", "Burak", "Kemal", "Orhan",
  "Cem", "Serkan", "Tolga", "Selim", "Kaan",
];

const FEMALE_NAMES = [
  "Ayşe", "Fatma", "Emine", "Hatice", "Zeynep", "Elif", "Meryem", "Selin",
  "Derya", "Esra", "Gül", "Leyla", "Melis", "Nazlı", "Pınar", "Seda",
  "Tülay", "Yasemin", "Aslı", "Ceren",
];

const SURNAMES = [
  "Yılmaz", "Kaya", "Demir", "Çelik", "Şahin", "Yıldız", "Yıldırım",
  "Öztürk", "Aydın", "Özdemir", "Arslan", "Doğan", "Kılıç", "Çetin",
  "Kara", "Koç", "Kurt", "Özkan", "Şimşek", "Erdoğan",
];

export interface Identity {
  firstName: string;
  lastName: string;
  age: number;
  female: boolean;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

let firstIdentity = true;

export function randomIdentity(): Identity {
  // İlk köylü her zaman Cin Ali'dir :)
  if (firstIdentity) {
    firstIdentity = false;
    return { firstName: "Cin Ali", lastName: "", age: 9, female: false };
  }
  const female = Math.random() < 0.5;
  return {
    firstName: female ? pick(FEMALE_NAMES) : pick(MALE_NAMES),
    lastName: pick(SURNAMES),
    age: 16 + Math.floor(Math.random() * 45),
    female,
  };
}
