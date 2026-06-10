// Köylü kimlikleri: rastgele Türkçe ad, soyad, yaş ve cinsiyet

const MALE_NAMES = [
  "Ali", "Mehmet", "Ahmet", "Mustafa", "Hasan", "Hüseyin", "İbrahim",
  "Osman", "Yusuf", "Ömer", "Murat", "Emre", "Burak", "Kemal", "Orhan",
  "Cem", "Serkan", "Tolga", "Selim", "Kaan", "Yiğit", "Mert", "Deniz",
  "Arda", "Barış", "Berk", "Can", "Çağrı", "Doruk", "Efe", "Emir",
  "Eren", "Furkan", "Gökhan", "Halil", "İsmail", "Kerem", "Levent",
  "Mahmut", "Onur", "Ozan", "Polat", "Rıza", "Sinan", "Şahin", "Taner",
  "Uğur", "Umut", "Volkan", "Yavuz", "Zafer", "Adem", "Bekir", "Cahit",
  "Davut", "Erdem", "Ferhat", "Harun", "İlker", "Koray", "Necati",
];

const FEMALE_NAMES = [
  "Ayşe", "Fatma", "Emine", "Hatice", "Zeynep", "Elif", "Meryem", "Selin",
  "Derya", "Esra", "Gül", "Leyla", "Melis", "Nazlı", "Pınar", "Seda",
  "Tülay", "Yasemin", "Aslı", "Ceren", "Banu", "Begüm", "Beste", "Burcu",
  "Büşra", "Cansu", "Defne", "Dilek", "Ebru", "Ece", "Eda", "Feride",
  "Gamze", "Gizem", "Gönül", "Hande", "Hülya", "İrem", "Kübra", "Lale",
  "Melek", "Merve", "Mine", "Nehir", "Nilüfer", "Nur", "Özge", "Reyhan",
  "Sevgi", "Sıla", "Şule", "Tuba", "Yağmur", "Zehra", "Aysel", "Belgin",
  "Çiğdem", "Dilara", "Emel", "Figen",
];

const SURNAMES = [
  "Yılmaz", "Kaya", "Demir", "Çelik", "Şahin", "Yıldız", "Yıldırım",
  "Öztürk", "Aydın", "Özdemir", "Arslan", "Doğan", "Kılıç", "Çetin",
  "Kara", "Koç", "Kurt", "Özkan", "Şimşek", "Erdoğan", "Acar", "Akbaş",
  "Akgül", "Aksoy", "Aktaş", "Alkan", "Ateş", "Avcı", "Aygün", "Bal",
  "Balcı", "Başaran", "Bayrak", "Bilgin", "Bozkurt", "Bulut", "Candan",
  "Coşkun", "Çakır", "Çoban", "Dağ", "Duman", "Durmaz", "Ekinci", "Erbil",
  "Ergin", "Genç", "Güler", "Güneş", "Işık", "İnan", "Kaplan", "Karaca",
  "Keskin", "Korkmaz", "Mutlu", "Ocak", "Özer", "Polat", "Sarı", "Sezer",
  "Soylu", "Tekin", "Toprak", "Tunç", "Türk", "Uçar", "Uysal", "Ünal",
  "Vural", "Yalçın", "Yavuz", "Yüce", "Zengin",
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

// Yeni doğan bebek kimliği (yaş 0)
export function babyIdentity(): Identity {
  const female = Math.random() < 0.5;
  return {
    firstName: female ? pick(FEMALE_NAMES) : pick(MALE_NAMES),
    lastName: pick(SURNAMES),
    age: 0,
    female,
  };
}
