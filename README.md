# Banisher

2D blok bazlı, Banished benzeri koloni simülasyonu. Köylüler Cin Ali tarzı
çöp adamlardır; dünya pixel-art bloklardan oluşur ve prosedürel üretilir.

## Oyunun Mantığı (Özet)

Banisher'da prosedürel bir adada 6 köylüyle ve hazır kurulu bir kampla
başlarsın. Amaç koloniyi hayatta tutup büyütmektir; oyunun çekirdeği şu
döngülere dayanır:

**Emek ve iş sistemi (Banished tarzı).** "Boşta" sınıfı yoktur: herkes
varsayılan **ortalık işçisidir** — elle işaretlediğin ağaç, çalı, mantar,
çakıl ve taşları toplar, depoya taşır. **İnşaatçı** sayısını panelden
ayarlarsın; üretim işleri ise **bina bazlı istihdamdır** (oduncu kulübesi
3 oduncu, tapınak 2 rahip, bakımevi 3 bakıcı...). Üretim kulübeleri
çalışan sayısı kadar çevrelerindeki kaynağı otomatik işaretler.

**El emeği ekonomisi.** Başlangıçta balta yoktur: ağaçlar kesilmez,
elle **budanır** (ağaç başına 1 dal, budanan ağaç zamanla kendine gelir).
Alet Atölyesi araştırılıp kurulunca sipariş usulü **balta** üretilir
(3 dal + 3 taş); baltalı işçi ağacı tamamen devirip 4 dal alır — ama
devrilen ağaç bir daha çıkmaz. Doğal kaynaklar genel olarak **kalıcıdır**:
kazılan taş, toplanan çalı geri gelmez. Sürdürülebilir kaynaklar emekle
yenilenir (oduncunun diktiği fidanlar, toplayıcının ektiği çalılar,
çiftlik, balıkçılık, avcılık) — tek istisna yabani mantarlardır:
binalardan uzak, el değmemiş yerlerde kendiliğinden biter.

**Bilgi ve teknoloji.** Rahipler tapınakta tapınarak **bilgi** üretir;
bilgiyle teknoloji ağacı (T) açılır: Beşer (tanrı inancı, +10 moral),
Doğa (ateşin keşfi → meşale ve gece çalışması), Sermaye → Depo,
Sert Cisimler → çakıl toplama, Kollektif → gıda ambarı, Mantaroloji →
mantar tanıma, Motor Beceriler (+%20 hız), Bilişsel Beceriler →
bakımevi ve eğitim, Alet Atölyesi → balta üretimi.

**Zaman ve yaşam döngüsü.** Takvimde **1 gün = 1 mevsim, 4 gün = 1 yıl**.
Gece 00:00-06:00 arası uyku vaktidir: evi olan evinde uyur (moral kazanır),
evsizler kamp çevresinde yerde yatar (moral kaybeder); gece ancak meşale
ışığında çalışılır. Boş evi olan hanelerde kadınlar hamile kalır: karın
4 gün boyunca adım adım büyür, moral gittikçe düşer ve 4. günün sabahı
doğumla geri gelir. Bebekler (0-7 yaş) bakıma muhtaçtır: bakımevi
kapasitesi (bakıcı başına 4 bebek) yetmezse **annesi işi bırakıp bebeğe
bakar**. 7 yaşında çocuk olurlar (bakımevinde büyüyen **eğitimli** olur:
kalıcı +%20 hız), 18 yaşında işe başlarlar.

**Hayatta kalma.** Açlık sürekli işler; köylüler stoktan yer (yemekhanede
yemek tokluğu tamamen doldurur), yemek biterse açlıktan ölürler. Moral
20'den başlar ve iş hızını belirler (0 moral = yarı hız); ev uykusu,
tanrı inancı ve gece meşale başında ısınmak yükseltir. Depo kapasitesi
paylaşımlıdır (100, depo binalarıyla artar); dolu ürünü kimse toplamaz.
Kış haritayı bembeyaz örter ve bitki büyümesini durdurur — balıkçılık
kışın da çalışan tek üretimdir.

**Debug/denge ayarları:** tarayıcı konsolunda `__game.tuning` ile
`dayLength` (gün süresi), `timeScale` (takvim akış hızı) ve `moveSpeed`
(temel hareket hızı) canlı değiştirilebilir; `?seed=12345` ile sabit
harita üretilir.

## Çalıştırma

```bash
npm install
npm run dev
```

Tarayıcıda `http://localhost:5173` adresini aç.

## Kontroller

| Girdi | İşlev |
|---|---|
| Sol tık | Ağaç/çalı/mantar/taş işaretle veya seçili binayı yerleştir |
| Sol tık sürükle | Alan seçimi: filtreye göre kaynakları topluca işaretle |
| İşaret filtresi çipleri / F | Tümü / Odun / Yiyecek / Taş / ✕ İptal modu arasında geçiş |
| ✕ İptal modu | Tıklama veya alan seçimiyle iş ve av işaretlerini topluca kaldır |
| Mini haritaya tık/sürükle | Kamerayı o noktaya götür / gezdir |
| Köylüye sol tık | Profilini aç (kimlik, durum, tokluk, moral dökümü, çanta) |
| Binaya sol tık | Detay paneli (depo içeriği, inşaat ilerlemesi, işçi al/çıkar) |
| Yabani hayvana sol tık | Av işareti koy / kaldır |
| N / "Nüfus" düğmesi | Nüfus yönetim menüsü: tüm köylüler tek listede |
| T / "Teknoloji" düğmesi | Teknoloji ağacı paneli |
| 1-9, 0 | Araç çubuğundaki kilidi açık binalardan seç |
| Esc / sağ tık | Seçimi iptal et |
| Space | Duraklat / devam et |
| X | Oyun hızı (1x / 2x / 4x / 8x / 16x) |
| WASD / Ok tuşları | Kamerayı kaydır |
| Fare tekerleği | Yakınlaş / uzaklaş (imlece doğru) |
| Sağ/orta tık sürükle | Kamerayı sürükleyerek kaydır |

İpucu: `?seed=12345` URL parametresi ile sabit harita üretebilirsin.

> **Denge notu**: Doğal kaynaklar kalıcıdır — kesilen ağaç, kazılan taş ve
> toplanan çalı/yemiş **yeniden çıkmaz**. Sürdürülebilir kaynaklar: emekle
> dikilen fidan/çalılar, çiftlik ürünleri, balıkçılık ve avcılıktır.
> Tek doğal istisna: yabani mantarlar binalardan uzakta kendiliğinden biter.

## Şu anki özellikler (v1.4)

### v1.4: Takvim, hamilelik ve yaş evreleri

- **Yeni takvim**: 1 gün = 1 mevsim, 4 gün = 1 yıl; gün süresi uzadı
  (150 sn → 300 sn) — oynanış hızı aynı kalırken zaman daha yavaş akar
- **Debug ayarları**: `__game.tuning` üzerinden `dayLength`, `timeScale`
  (yalnız takvim hızı) ve `moveSpeed` (temel hareket hızı) konsoldan
  canlı değiştirilebilir
- **Hamilelik**: boş yeri olan evlerde kadınlar hamile kalır; karın 4 gün
  adım adım büyür (görsel), moral süreç boyunca gittikçe düşer ve 4. günün
  sabahı doğumla geri gelir; profilde "Hamile (N/4 gün)" rozeti
- **Yaş evreleri**: bebek (0-7 yaş) → çocuk (7-18, küçük çizilir,
  çalışamaz) → 18 yaşında işe başlar; yaş her 4 günde 1 artar
- **Anne bakımı**: bakımevi kapasitesi yetmeyen bebeğin annesi işi
  bırakıp bebeğinin yanında kalır ("Çocuğuna bakıyor")
- **Bakımevi yenilendi**: bakıcı başına 4 bebek, en çok 3 bakıcı;
  bakılan bebek acıkmaz, annesi çalışabilir, çocuk **eğitimli** büyür
  (kalıcı +%20 hız)

### v1.3: Yeni teknoloji ağacı, Alet Atölyesi ve balta

- **Beşer**: artık bina açmıyor — tanrı inancı doğar, herkese kalıcı
  +10 moral (yeni doğanlar dahil)
- **Doğa**: ateşi keşfettirir — meşale ancak bundan sonra yapılır;
  geceyi meşale başında geçirmek moral kazandırır
- **Motor Beceriler** (yeni): herkese +%20 çalışma ve yürüme hızı
- **Bilişsel ve Problem Çözme Becerileri** (yeni): bakımevini açar
- **Alet Atölyesi** (yeni; Bilişsel + Sert Cisimler gerekir): sipariş
  usulü balta üretimi — bina paneline adet yazılır ([+]/[−]), usta her
  balta için 3 dal + 3 taş harcar, fazlası stoklanır; sipariş yokken
  bina "!" ile uyarır; baltayı stok-rezervasyon sistemiyle yalnızca
  alet sayısı kadar işçi gelip alır (boşa gidip dönen olmaz)
- **Baltalı kesim**: baltalı işçi ağacı tamamen devirir (4 dal, daha
  hızlı); devrilen ağaç yeniden çıkmaz — budama ekonomisinin üstüne
  bilinçli bir "tüket ya da sürdür" kararı ekler
- **Mantarcı binası kaldırıldı**: mantar yalnızca elle toplanır
  (Mantaroloji gerekir); haritada seyrekleştirildi (135 → ~55) ve
  binalardan uzak yerlerde kendiliğinden biter
- **Teknoloji paneli**: 4 sütunlu yeni yerleşim, çoklu ön koşul
  bağlantıları, büyük okunur kartlar (isim sarma, durum renkleri,
  "▶ Araştırmak için tıkla" ipucu)
- **Çoklu panel**: birden fazla menü aynı anda açık kalabilir; paneller
  sürüklenebilir, ✕ veya Esc ile sırayla kapanır

### v1.2: Elle toplama, yeni teknoloji ağacı, toplu iptal ve moral dökümü

- **Elle dal toplama**: ağaçlar kesilmez, budanır — köylü baltasız, eğilerek
  dal toplar (ağaç başına 1 odun, 8 sn); budanmış ağaç zamanla kendine gelir
- **Toplama dengesi**: yemiş çalısı 4 yemiş, mantar 1 mantar verir; tüm elle
  toplama işleri aynı yavaş tempodadır (8 sn)
- **Teknoloji ağacı yenilendi**: bina kilitleri araştırmalara bağlandı —
  Beşer (oduncu, çiftlik, yemekhane, bakımevi, meşale), Doğa (toplayıcı),
  Balıkçılık (balıkçı kulübesi), Sermaye (depo), Kollektif (gıda deposu),
  Mantaroloji (mantarcı)
- **✕ İptal modu**: işaret filtrelerine eklendi; tek tıkla veya alan
  seçimiyle iş ve av işaretleri topluca kaldırılır (canlı "İptal N" sayacı)
- **Moral sistemi**: evde uyumak morali yükseltir, yerde yatmak ve uykusuz
  kalmak düşürür; düşük moral iş hızını yarıya kadar yavaşlatır; köylü
  profilinde neden bazında birikimli **moral dökümü** listelenir
- **Konaklama**: kampta uyuma kaldırıldı, konut yalnızca evlerdir; evi
  olanlar evin içinde uyur
- **Ormancılık/ekim**: oduncu fidan diker, fidanlar zamanla ağaca dönüşür
- **Denge**: meyve ağaçları kaldırıldı; doğal kaynaklar kalıcıdır
  (yeniden büyüme yok), yabani hayvanlar açlıktan telef olmaz

### v1.1: Hayvancılık, yeni yiyecekler ve UI iyileştirmeleri

- **Çiftlik (18 odun, 2 çiftçi)**: tamamlanınca tavuk×2, inek, domuz,
  koyun ve keçi gelir; hayvanlar çiftlik çevresinde dolanır
- **Hayvan açlığı**: hayvanlar acıkınca çimende otlar; aç hayvan üretmez,
  uzun süre aç kalan telef olur (baş üstü açlık barı)
- **Hayvan ürünleri**: tavuk→yumurta, inek/keçi→süt, koyun→yün,
  domuz→et (kesilir, 90 sn sonra yenisi gelir); hazır hayvanın üstünde
  yeşil nokta belirir, çiftçi gidip toplar
- **Yemiş çalıları** fındık verir
- **Yeni eşyalar**: elma, portakal, mandalina, yemiş, yumurta, süt, et
  (hepsi yenir) ve yün (malzeme)
- **UI**: mini haritada sürükleyerek gezinme, tıklanabilir duraklat/hız
  düğmeleri, bina paneline Yık düğmesi (yarı iade), kilometre taşı
  kutlamaları, eşya taşıyan köylülerde sırt çantası

### v1.0: Mevsimler, balıkçılık ve teknoloji ağacı

- **Mevsimler**: takvim hızlandı (5 gün = 1 ay); 3'er aylık İlkbahar/Yaz/
  Sonbahar/Kış üst barda renkli rozetle gösterilir; kışın kar yağar ve
  harita soğuk tona bürünür, sonbahar turuncu, baharda çiçekler açar
- **Balıkçı kulübesi (12 odun, 2 balıkçı)**: yalnızca su kenarına kurulur
  (hayalette ve yerleştirmede doğrulanır); balıkçılar kıyıya gidip olta
  sallar, **balık** yeni yemek türüdür ve kışın da tutulabilir — kış
  kıtlığının cevabı
- **Teknoloji ağacı (T)**: rahiplerin ürettiği bilgi harcanır —
  Keskin Baltalar (hızlı kesim, +1 odun), Usta Toplayıcılık (+1 verim),
  Hızlı İnşaat (%30), Büyük Çantalar (8→12), Geniş Ambarlar (+40 depo)

### v0.9: Minecraft tarzı envanter ve mantık düzeltmeleri

- **Koloni envanteri**: üst bardaki kaynak yazıları kaldırıldı; araç
  çubuğunun üstünde Minecraft tarzı slot çubuğu (pikselli eşya ikonları,
  sağ altta adet, altta kapasite çizgisi, dolu slotta kırmızı çerçeve)
- **Köylü çantası**: profilde slot ızgarası olarak görüntülenir
  (boş slotlar soluk, doludakiler adetli)
- **Mantık düzeltmeleri**:
  - Depo doluyken teslim edilemeyen eşyalar artık kaybolmuyor (çantada
    kalıyor, depo boşalınca teslim ediliyor)
  - Deposu dolu eşya için boşuna depo yolculuğu yapılmıyor
  - Çantası tamamen dolu köylü yeni hasat işi almıyor (hasat kaybı yok);
    kısmi sığmada "Çanta dolu!" uyarısı
  - Bakımevindeki bebeklerin açlığı artık iyileşiyor (donmuyordu;
    bakımevi geç kurulunca bebek yine ölebiliyordu)

### v0.8: Saat, mini harita ve yaşam kalitesi

- **Saat**: tarih yanında 24 saatlik saat (gün 06:00'da başlar, gece ~22:45)
- **Mini harita**: sağ altta ada görünümü — binalar turuncu, köylüler beyaz
  (bebekler pembe), görüş alanı çerçevesi; tıklayınca kamera oraya gider
- **Sürükleyerek işaretleme**: sol tuş basılı gezdir, yol üstündeki tüm
  ağaç/çalı/mantar/taşlar işaretlenir
- **Kıtlık uyarısı**: yemek stoğu sıfırlanınca bildirim
- **Oyun sonu**: tüm köylüler ölürse "KOLONİ YOK OLDU" perdesi, simülasyon durur

### v0.7: Banished tarzı iş sistemi ve ada haritası

- **İş bazlı yönetim**: kişi bazlı meslek yerine Banished tarzı sayılar —
  herkes varsayılan **ortalık işçisidir** (elle işaretlenen ağaç/çalı/taş +
  depoya taşıma), **İnşaatçı** sayısı panelden ayarlanır, üretim işleri
  **bina bazlı istihdamdır**: oduncu kulübesi 3 oduncu, toplayıcı kulübesi
  3 toplayıcı, tapınak 2 rahip çalıştırır
- **İş paneli (N)**: iş satırlarında [−]/[+] ile topluca işçi al/çıkar;
  çıkarılanlar ortalık işleri havuzuna döner; bina paneline de aynı
  düğmeler eklendi
- Kulübeler çalışanı kadar işaretler (çalışan başına 2), çalışanı yoksa
  durur; bina çalışanları yalnızca kendi çalışma alanında iş yapar
- Şantiye kurulunca inşaatçı yoksa havuzdan biri otomatik atanır;
  üretim binası tamamlanınca 1 işçi otomatik istihdam edilir
- **Ada haritası**: kenarlar düzensiz bir kıyı şeridiyle denize gömülür,
  harita dışı uçsuz bucaksız açık denizle kaplıdır (keskin sınır yok);
  zoom-out sınırı 0.5x'e indirildi

### v0.6: Konutlar, doğumlar, bebekler ve yeni binalar

- **Konut sistemi**: ev ve kamp 4'er kişilik konuttur; köylüler otomatik
  yerleştirilir (bina panelinde "Sakinler: 3/4")
- **Doğumlar**: her gün dönümünde, boş yeri olan konut başına %35 bebek
  doğma şansı (en az 2 yetişkin gerekir)
- **Bebekler**: çalışamaz, evin (varsa bakımevinin) etrafında dolanır,
  küçük çizilir; 4 günde büyüyüp işçi olur
- **Otomatik meslek atama**: oduncu/toplayıcı kulübesi tamamlanınca en
  yakın boştaki işçi otomatik o mesleğe atanır (menüden değiştirilebilir)
- **Yemekhane (14 odun)**: köylüler acıkınca buraya gelir; yemekhanede
  yenen yemek tokluğu tamamen doldurur (yerinde yemek %55 doldurur)
- **Bakımevi (12 odun)**: bebekler acıkmaz ve iki kat hızlı büyür (2 gün)

### v0.5: Gün/gece, takvim, meşale ve tapınak

- **Gün/gece döngüsü**: bir oyun günü 150 saniye; akşam karanlık çöker
  (alacakaranlık geçişli), gece haritayı mavi karanlık kaplar
- **Takvim**: tarih 0.0.0'dan başlar (gün.ay.yıl, 30 gün = ay, 12 ay = yıl);
  üst barda güneş/hilal ikonuyla gösterilir
- **Meşale (2 odun, 1x1)**: çevresini aydınlatır; köylüler gece yalnızca
  ışıklı alanlarda (meşale veya kamp ateşi yakını) çalışabilir, karanlıkta
  kalan işler bırakılır; yerleştirirken ışık yarıçapı önizlemesi gösterilir
- **Tapınak (20 odun)**: sütunlu tapınak; köylüler sırayla gelip tapınır
  (eller havada dua animasyonu) ve **bilgi** üretir (+1 bilgi / ayin,
  20 sn arayla); bilgi üst barda mor kitap ikonuyla görünür

### v0.4: Yönetim panelleri ve depo dolu davranışı

- **Tıklanabilir binalar**: her binaya tıklayınca detay paneli açılır —
  şantiyelerde inşaat ilerlemesi, depolarda stok listesi (dolu ürünler
  kırmızı "DOLU!" etiketiyle), üretim kulübelerinde çevredeki işaret sayısı
- **Nüfus yönetim menüsü** (N): tüm köylüler tek listede — yaş, anlık durum,
  tokluk ve tek tıkla meslek atama; isme tıklayınca köylünün profili açılır
  ve kamera ona gider; uzun listede tekerlekle kaydırma
- **Depo dolu uyarısı**: bir ürün kapasiteye ulaşınca teslimat binalarının
  üstünde sallanan "!" işareti çıkar, bildirim düşer ve işçiler o hammaddeyi
  toplamayı bırakıp diğer işlere yönelir (depo boşalınca otomatik dönerler)

### v0.3: Envanter, meslekler, madencilik, yemek çeşitliliği

- **Kişisel envanter (çanta)**: köylüler topladıklarını çantalarında taşır
  (kapasite 8) ve dolunca kampa/depoya teslim eder; profilde görünür
- **Meslekler**: profil panelinden atanır — İşçi (her işi yapar), Oduncu,
  Toplayıcı, Madenci, İnşaatçı (sadece kendi işini yapar)
- **Taş madenciliği**: taş bloklara tıklayıp işaretle; madenci kazmayla kazar,
  blok toprağa dönüşür (taş ocağı), 3 taş verir
- **Mantarlar**: orman içlerinde yetişir, toplanınca 3 mantar verir, yeniden
  büyür; meyveyle birlikte yemek sayılır
- **Kamp**: oyun hazır kurulu bir kampla başlar (çadır + kamp ateşi);
  teslimat noktasıdır
- **Detaylar**: uçan kazanç yazıları (+4 odun), balta/kazma parçacık efektleri,
  duraklatma (Space) ve oyun hızı (X ile 1x/2x/4x)

- Value-noise ile prosedürel harita: su, kum, çimen, toprak, taş, ormanlar ve meyve çalıları
- Offscreen canvas'a önbelleklenmiş pixel-art zemin (hızlı render)
- A* yol bulma (4 yönlü grid)
- Köylüler: boşken dolanır, en yakın işi seçer (inşaat / ağaç kesme / meyve toplama)
- Yürüme, balta/çekiç sallama ve toplama animasyonlu çöp adam karakterler
- **Bina inşaatı**: araç çubuğundan seç, hayalet önizleme ile yerleştir, odun harcanır,
  köylü gelip inşa eder (şantiye + ilerleme çubuğu)
  - **Ev**: tamamlanınca 2 yeni köylü gelir
  - **Depo**: odun ve yemek kapasitesi +80
  - **Oduncu kulübesi**: çevresindeki ağaçları otomatik işaretler
  - **Toplayıcı kulübesi**: çevresindeki çalıları otomatik işaretler
- **Yemek ve açlık**: köylüler acıkınca stoktan yer; yemek biterse yavaşlar ve
  açlıktan ölebilir
- **Köylü kimlikleri**: her köylünün adı, soyadı, yaşı ve cinsiyeti var
  (ilk köylü her zaman Cin Ali'dir); köylüye tıklayınca portreli profil paneli
  açılır — anlık durum ("Ağaç kesiyor" vb.) ve tokluk barı canlı güncellenir
- HUD: odun/yemek (kapasiteli), nüfus, bildirimler, açlık barları

## Yol haritası

- [x] Bina inşaatı (depo, ev, oduncu kulübesi) — odun harcayarak
- [x] Yemek ve açlık: toplayıcı kulübesi, köylü ihtiyaçları ve ölüm
- [x] Mevsimler ve gün/gece döngüsü
- [x] Köylülerin eve/depoya taşıma yapması
- [x] Taş madenciliği
- [ ] Tarlalar ve ekin yetiştirme
- [ ] Demir madenciliği
- [ ] Kaydet/yükle

## Mimari

```
src/
  main.ts            oyun döngüsü (sabit zaman adımı) ve kurulum
  engine/            kamera ve girdi (klavye, fare, zoom)
  world/             blok tanımları, noise, harita üretimi
  sim/               köylü davranışları, A* yol bulma, kaynaklar
  render/            pixel-art renderer ve HUD
```
