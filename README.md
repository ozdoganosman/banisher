# Banisher

2D blok bazlı, Banished benzeri koloni simülasyonu. Köylüler Cin Ali tarzı
çöp adamlardır; dünya pixel-art bloklardan oluşur ve prosedürel üretilir.

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
| Sol tık sürükle | Üzerinden geçilen kaynakları topluca işaretle |
| Mini haritaya tık | Kamerayı o noktaya götür |
| Köylüye sol tık | Profilini aç (kimlik, durum, çanta, meslek atama) |
| Binaya sol tık | Detay paneli (depo içeriği, inşaat ilerlemesi vb.) |
| N / "Nüfus" düğmesi | Nüfus yönetim menüsü: tüm köylüler tek listede |
| 1-8 | Bina seç (Ev, Depo, Oduncu, Toplayıcı, Meşale, Tapınak, Yemekhane, Bakımevi) |
| Esc / sağ tık | Seçimi iptal et |
| Space | Duraklat / devam et |
| X | Oyun hızı (1x / 2x / 4x) |
| WASD / Ok tuşları | Kamerayı kaydır |
| Fare tekerleği | Yakınlaş / uzaklaş (imlece doğru) |
| Sağ/orta tık sürükle | Kamerayı sürükleyerek kaydır |

İpucu: `?seed=12345` URL parametresi ile sabit harita üretebilirsin.

## Şu anki özellikler (v0.9)

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

### v0.8: Saat, mini harita ve yaşam kalitesi

- **Saat**: tarih yanında 24 saatlik saat (gün 06:00'da başlar, gece ~22:45)
- **Mini harita**: sağ altta ada görünümü — binalar turuncu, köylüler beyaz
  (bebekler pembe), görüş alanı çerçevesi; tıklayınca kamera oraya gider
- **Sürükleyerek işaretleme**: sol tuş basılı gezdir, yol üstündeki tüm
  ağaç/çalı/mantar/taşlar işaretlenir
- **Ağaçlar yeniden büyür** (~3.5 dk): orman kalıcı tükenmez
- **Kıtlık uyarısı**: yemek stoğu sıfırlanınca bildirim
- **Oyun sonu**: tüm köylüler ölürse "KOLONİ YOK OLDU" perdesi, simülasyon durur

### v0.7: Banished tarzı iş sistemi ve ada haritası

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
  açlıktan ölebilir; çalılar toplandıktan bir süre sonra yeniden büyür
- **Köylü kimlikleri**: her köylünün adı, soyadı, yaşı ve cinsiyeti var
  (ilk köylü her zaman Cin Ali'dir); köylüye tıklayınca portreli profil paneli
  açılır — anlık durum ("Ağaç kesiyor" vb.) ve tokluk barı canlı güncellenir
- HUD: odun/yemek (kapasiteli), nüfus, bildirimler, açlık barları

## Yol haritası

- [x] Bina inşaatı (depo, ev, oduncu kulübesi) — odun harcayarak
- [x] Yemek ve açlık: toplayıcı kulübesi, köylü ihtiyaçları ve ölüm
- [ ] Mevsimler ve gün/gece döngüsü
- [ ] Köylülerin eve/depoya taşıma yapması (kaynaklar yerde birikir)
- [ ] Tarlalar ve ekin yetiştirme
- [ ] Taş/demir madenciliği
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
