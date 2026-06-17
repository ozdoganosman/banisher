# Banisher

2D blok bazlı, insanlığın gelişim yolculuğunu konu alan kabile/koloni
simülasyonu. Karakterler tombul piksel insanlardır (saçları, kıyafetleri
ve aletleriyle); dünya pixel-art bloklardan oluşur ve prosedürel üretilir.

## Oyunun Ana Fikri

**Banisher bir medeniyet yolculuğudur.** Prosedürel bir adada, elleriyle
dal toplayan ilkel bir kabileyle (mağara insanı seviyesinde) başlarsın.
Amacın iki katmanlıdır:

1. **Hayatta tut**: açlık, gece, kış, moral — doğa acımasızdır ve hiçbir
   kaynak bedavaya yenilenmez.
2. **İleri taşı**: kavmini insanoğlunun gerçek gelişim basamaklarından
   geçir — ateşin keşfi, taş aletler, inanç, beceriler, tarım, zanaat,
   kültür, sanat ve bilim... mağara adamından günümüze, adım adım.

Gelişimin para birimi **bilgi**dir: rahipler tapınakta üretir, sen bunu
teknoloji ağacında (T) insanlık tarihine uygun araştırmalara harcarsın.
Her araştırma kabilenin **yapabildiklerini** genişletir: ateş olmadan gece
çalışılmaz, balta olmadan ağaç devrilemez, bakımevi olmadan anne bebeğinden
ayrılamaz. Teknoloji "sayı arttıran bonus" değil, **yeni davranış** açar —
kabile her araştırmayla biraz daha "insan" olur.

## Oyunun Mantığı (Mekanik Özet)

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
bilgiyle teknoloji ağacı (T) açılır. Mevcut araştırmalar insanlığın en
erken (Paleolitik) basamaklarıdır: Beşer (tanrı inancı, +10 moral),
Doğa (ateşin keşfi → binalara meşale takılır, gece ışıkta çalışılır),
Korku (çığlıkla yardım çağırma), Merak (oyuncuya yakaran köylü
mikrofonla teskin edilir), Sermaye → Depo, Sert Cisimler → çakıl,
Mantaroloji → mantar tanıma, Toplayıcılık → toplayıcı kulübesi,
Motor Beceriler (+%20 hız), Bilişsel Beceriler → bakımevi ve eğitim,
Alet Atölyesi → balta, Kan → mızrak ve avcı kulübesi, Deri İşleme →
giysi (kış koruması), Aidiyet → köpek, Çiftlik → evcilleştirme çiftliği,
Hırs → taş yol. Sonraki çağlar: dil, pişirme, tarım, çömlek, maden ve
yazıya doğru ilerlenecek.

**Zaman ve yaşam döngüsü.** Takvimde **1 gün = 1 mevsim, 4 gün = 1 yıl**;
tarih "İlkbahar/3" gibi mevsim/yıl olarak akar ve yıl her ilkbaharda artar.
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
paylaşımlıdır (kamp 500, depo binalarıyla artar); dolu ürün toplanmaz.
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
| G H J K L | İşaret filtresini doğrudan seç (çiplerde yazılı, yan yana tuşlar) |
| ✕ İptal modu | Tıklama veya alan seçimiyle iş ve av işaretlerini topluca kaldır |
| Mini haritaya tık/sürükle | Kamerayı o noktaya götür / gezdir |
| Köylüye sol tık | Profilini aç (kimlik, durum, tokluk, moral dökümü, çanta) |
| Binaya sol tık | Detay paneli (depo içeriği, inşaat ilerlemesi, işçi al/çıkar) |
| Hayvana sol tık | Hayvan paneli: ad, can, verim + Saldır / Evcilleştir |
| N / "İşler" düğmesi | İş yönetim menüsü (istihdam satırları) |
| M / "İnsanlar" düğmesi | Detaylı köylü listesi (özellikler + ekipman) |
| B / "Defter" düğmesi | Savaş ve Tehlike Defteri |
| T / "Teknoloji" düğmesi | Tam ekran teknoloji ağacı (sürükleyerek kaydır) |
| 1-9, 0 | Araç çubuğundaki kilidi açık binalardan seç |
| Esc / sağ tık | Üstteki paneli kapat; panel yoksa Esc duraklatma menüsünü açar (Kaydet/Ses/Ana Menü) |
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

## Şu anki özellikler (v3.5)

### v3.5: Sıkışma düzeltmesi + teknoloji temposu

- **"Yapıya sıkışma" hatası giderildi**: otomatik inşaat artık binaların
  çevresinde 1 karo yürüme koridoru bırakır (birbirine yapışmaz) ve köylünün
  üstüne bina kurmaz; binadan çıkış en yakın yürünebilir kareye düşer
- **Teknoloji oldukça yavaşlatıldı**: ayin verimi düşürüldü, ayin döngüsü
  uzadı ve araştırma maliyeti daha dik katlanır (×1.22) — bilgi akar ama
  ilerleme artık aceleci değil

### v3.4: İlahî Güçler — dışarıdan yönlendiren tanrı

### v3.4: İlahî Güçler — dışarıdan yönlendiren tanrı

- **İnanç (faith)** kaynağı: tapınak ayinlerinden ve ileti yanıtlarından
  birikir; üst bardaki ✨ sayaçta görünür
- **İlahî Güçler paneli** (✨ düğmesi / Y tuşu): inanç harcayarak kolonyi
  yönlendirirsin (her gücün maliyeti + bekleme süresi var):
  - 🙏 **Peygamber Yolla**: bir köylü peygamber olur — çevresine moral
    (ilham) yayar, hızlı çalışır, başında altın hale
  - 📜 **Kehanet: Bilgelik**: 2 gün tapınak bilgisi iki katı
  - 🌾 **Kehanet: Bereket**: 2 gün toplama + doğurganlık artar, çevreye
    yemiş saçılır
  - ✨ **Mucize: Şifa**: herkes anında iyileşir, hastalık geçer, moral artar
  - 🛡️ **Mucize: Koruma Kalkanı**: 1 gün yırtıcılar saldıramaz
- Vizyon: koloni kendi ihtiyaçlarını anlayıp kendini yönetir; sen
  dışarıdan müdahale eder, kaderlerini şekillendirirsin

### v3.3: Bilgi seli + "ileti"

### v3.3: Bilgi seli + "ileti"

- **Araştırma puanı seli**: ayin verimi rahip başına çok daha yüksek
  (≈ rahip×2/ayin) ve ayin döngüsü hızlandı (8sn ara / 7sn ayin); tapınak
  3 rahibe çıktı ve koloni büyüdükçe 3 tapınağa dek otomatik kurulur —
  3 rahiple ~1.5 bilgi/sn (öncekinin ~16 katı)
- **"Yakarış" yerine "İleti"**: köylüler artık tanrıya **ileti gönderir**;
  tıklayıp mikrofonla **yanıtlarsın** (Merak araştırması). Sen dışarıdan
  yönlendiren tanrısın

### v3.2: Kendi kendini kuran koloni

### v3.2: Kendi kendini kuran koloni

- **Otomatik inşaat** (⚙ Otomasyon → Otomatik inşaat): koloni ihtiyaç
  duydukça kampın yakınına uygun binayı (önce konut, sonra tapınak,
  toplayıcı, balıkçı, atölye, avcı, bakımevi, depo, çiftlik) kendiliğinden
  diker; aynı anda en çok 2 şantiye, dalı tamamen tüketmez
- **İşçiler şantiyeleri kendiliğinden kurar**: ayrı "inşaatçı" atamaya
  gerek yok — boştaki işçiler en yakın şantiyeyi inşa eder
- **Katlamalı araştırma maliyeti**: her araştırma sonrakileri ~%16
  pahalılaştırır (kabile geliştikçe ilerleme daha büyük yatırım ister)
- **Sıradaki araştırma göstergesi**: oto-araştırma açıkken Teknoloji
  düğmesi altında sıradaki araştırma, bilgi/ihtiyaç ve tahmini süre
- **Çiftlik oto-evcilleştirme**: çiftçiler ağıl türüne dönüşecek yabanileri
  görünce kendiliğinden evcilleştirir (ağıl dolu değilse)
- Artık koloni büyük ölçüde kendini yönetiyor; sen yön verir, müdahale edersin

### v3.0: Taş yalnız çakıldan + daha güçlü otomasyon

### v3.0: Taş yalnız çakıldan + daha güçlü otomasyon

- **Büyük taş blokları artık kırılamaz** (ileride maden çağında gelecek);
  taş yalnızca yerdeki **çakıl** kümelerinden toplanır
- **Çakıl bollaştı**: kayalık (toprak) kuşağında ve çimende çok daha sık
  bulunur — taşın sürdürülebilir kaynağı çakıl madenleridir
- **Daha güçlü otomatik işçi dağıtımı**: kadrosu eksik tüm binalar
  (yiyecek → av → bakım → bilgi önceliğiyle) azami kadroya kadar
  boştaki işçilerle doldurulur; nüfusa göre birkaç işçi toplama için
  boşta kalır (elle yönetmek için ⚙ Otomasyon'dan kapat)

### v2.9: Otomasyon (Politika) paneli

### v2.9: Otomasyon (Politika) paneli

- **⚙ Otomasyon paneli** (P tuşu ya da üst bardaki dişli): tek yerden tüm
  otomasyonları aç/kapa
- **Otomatik alet siparişi**: oduncu/avcı varken balta ve mızrak stoğu
  düşükse atölyeye kendiliğinden sipariş açılır
- **Otomatik işçi dağıtımı**: kadrosuz (yeni kurulan) binalar boştaki
  işçilerle otomatik doldurulur (en az bir işçi esneklik için boşta kalır)
- **Otomatik toplama** ve **otomatik araştırma** anahtarları da bu panelde
  toplandı; hepsi kaydedilir
- Felsefe sürüyor: angarya otomatik, sen sadece müdahale et

### v2.8: Kendi kendini yöneten koloni — sen sadece müdahale et

### v2.8: Kendi kendini yöneten koloni — sen sadece müdahale et

- **Ürün başına depo sınırı**: her eşya tipi kendi sınırına ayrı ulaşır
  (odun dolunca yemiş yeri kapanmaz); depo binası sınırı +120 artırır
- **Boştaki işçiler kendiliğinden toplar**: işaretli iş yoksa ortalık
  işçileri en yakın işaretsiz ağaç/çalı/mantar/taşı bulup eksik kalan
  kaynağı toplar (deponun o ürün sınırına ulaşınca durur) — sürekli
  işaretlemeye gerek yok
- **Oto-araştırma**: bilgi yettikçe kabile en ucuz uygun araştırmayı
  kendi yapar (Teknoloji panelindeki anahtarla kapatıp bilgi biriktirip
  dilediğini elle araştırabilirsin)
- Felsefe: en çok tıkladığın angarya işler otomatik; sen yalnızca
  yön verir, kritik kararları alırsın

### v2.7: Çiftlik ağılı gerçek bir engel oldu

### v2.7: Çiftlik ağılı gerçek bir engel oldu

- **Çiftliğe yalnız çiftçiler girer**: çitle çevrili padok artık çiftçi
  olmayan köylüler için yol bulmada engeldir — başkaları ağılın etrafından
  dolaşır (içeride kalan biri çıkabilir, ama dışarıdan giremez)
- **Çiftlik suya kurulamaz**: ağıl alanı su veya harita kenarı içeriyorsa
  yerleştirme reddedilir; yerleştirme önizlemesi (hayalet) kırmızı yanar
  ("çiftlik denizin üstünde" sorunu giderildi)

### v2.6: Arayüz tasarım sistemi — baştan cila

### v2.6: Arayüz tasarım sistemi — baştan cila

- **Tutarlı tasarım dili**: tüm paneller artık yuvarlatılmış köşeli,
  dikey degradeli, gölgeli ve sol kenarında **kategori renkli vurgu
  şeridi** olan ortak bir "kabuk" kullanır (profil=mavi, çiftlik/hayvan=
  yeşil, defter=kahve, teknoloji=mor, hedef=altın)
- **Üst bar**: yumuşak degrade + altın alt çizgi; düğmeler yuvarlatılmış
  çiplere dönüştü, her biri kendi vurgu renginde; evsiz uyarısı kırmızı
- **Yuvarlak kapatma düğmesi** (kırmızımsı) tüm panellerde
- **Hap şeklinde bildirimler**: önemli = altın çerçeveli büyük, sıradan =
  küçük; hepsi yuvarlatılmış
- **İşaret filtresi çipleri**, envanter çubuğu ve duraklatma göstergesi
  de aynı yuvarlak/gölgeli dile çekildi
- Tüm bunlar düzeni/tıklama alanlarını bozmadan yapıldı (mevcut
  etkileşimler korundu)

### v2.5: Ses motoru elden geçti

### v2.5: Ses motoru elden geçti

- **"Helikopter" sesi giderildi**: ateş çıtırtısını biçen 13 Hz kare-dalga
  LFO kaldırıldı (sürekli rotor uğultusunun sebebi buydu)
- **Gerçekçi ateş**: sıcak kahverengi-gürültü yatağı + iki yavaş sinüs
  titremesi (0.5/1.7 Hz) + seyrek rastgele çıtırtı patlamaları
- **Master zinciri**: limiter (çatırtı/taşma önler) + sentetik reverb ile
  tüm sesler daha dolu ve mekânlı
- **Sesler yeniden sentezlendi**: katmanlı balta/taş/inşaat vuruşları,
  yumuşak ve kalabalıkta uğuldamayan adımlar (küresel bütçeyle kısıtlı),
  süzülmüş mızrak vınlaması, zengin/yankılı kurt-ayı uluması, çan benzeri
  araştırma arpeji; yanan ev ocağı da çıtırtı verir

### v2.4: Kutsal metin, masterpiece inşaat menüsü ve cila

### v2.4: Kutsal metin, masterpiece inşaat menüsü ve cila

- **Açılış kutsal metni**: yeni oyun başlarken "İLK SÖZ" — kabileyi
  mağaradan medeniyete taşıma amacını ve yolun çetinliğini anlatan
  tanrısal bir hitap
- **İnşaat menüsü yeniden tasarlandı**: yuvarlatılmış kartlar, bina
  amblemleri (🏠🛕🪓🐄…), kategori renkli sol şerit, kısayol rozeti,
  `🪵 maliyet ✓/✗` uygunluk işareti, seçilince kategori renginde ışıltı
- **Daha hızlı araştırma**: ayin verimi rahip sayısıyla üstel artar
  (toplam birikim ≈ rahip²/3) — tapınağa rahip yığmak hızla ödüllendirir;
  tapınak panelinde güncel verim görünür
- **Net önkoşullar**: kilitli araştırma kartı, gereken her araştırmayı
  amblemi + adı + yeşil ✓ / kırmızı ✗ ile listeler
- **Kamera takibi**: İnsanlar panelinde bir köylüye tıklayınca kamera
  onu kilitleyip izler; kamerayı elle oynatınca takip biter

### v2.3: Arayüz cilası — bildirimler, araştırma hissi, ev ocağı

### v2.3: Arayüz cilası — bildirimler, araştırma hissi, ev ocağı

- **Ev ocağı**: ev panelinden açılan yakıt; kışın evdekiler dal yakar
  (günde ~3 dal), ev ısı/ışık yayar — soğuk moral kaybını önler
- **Evsiz uyarısı**: üst bardaki İnsanlar düğmesinde kırmızı ⚠ rozeti,
  İş Yönetimi panelinde `🏠 Evler: X/Y dolu` ve evsiz sayısı, ara ara
  belirgin hatırlatma
- **Araştırma kutlaması**: araştırma bitince ekranın ortasında dönen
  amblem-halkalı görkemli bant ("ARAŞTIRMA TAMAMLANDI" + ne açıldığı),
  yükselen ışıltılı ses ve deftere kayıt
- **Teknoloji ağacı amblemleri**: her araştırma kartında ikon rozeti
  (🙏🔥📦🪓🐄…) — ne olduğu bir bakışta anlaşılır
- **Daha akıllı bildirimler**: önemliler büyük ve altın çerçeveli;
  sık tekrarlanan tip tek satırda `×N` ile birikip küçülür (ekran
  dağılmaz)
- **İnşaat bandı**: bina seçilince envanterin üstünde "📐 {bina} —
  {maliyet} ✓/✗ • Sol tık: yerleştir • Sağ tık/Esc: iptal"; seçili
  düğme yeşil ışıltıyla belirir, maliyet uygunluk işaretli
- **Erken nüfus patlaması**: ilk kabilede gebe kalma şansı yüksek,
  nüfus büyüdükçe yavaşlar; ev veya doğurgan kadın yetmezse durur

### v2.2: Hayvancılık — çitli ağıl, üreme ve süt/yumurta

- **Çitle çevrili ağıl**: çiftlik artık ahşap kazık-korkuluk çitle
  çevrili geniş bir padok; hayvanlar çitin dışına çıkamaz, içeride
  otlar ve dolanır
- **Cinsiyet ve üreme**: hayvanların dişi/erkeği var; ağılda en az bir
  yetişkin dişi + bir yetişkin erkek olunca düzenli aralıkla **yavru**
  doğar (yavrular küçük çizilir, ~2 günde yetişkin olur)
- **Süt ve yumurta**: yeni yenilenebilir besinler — yalnız **yetişkin
  dişi** inek süt, tavuk yumurta verir; koyun yün (yetişkin), domuz et
  sürüsüdür
- **Kapasite ve kesim**: her ağılın sınırı **6**; sürü taşınca **en
  yaşlı yetişkin** otomatik kesilir ve ete (+ deri) dönüşür
- **Çiftlik paneli**: tür, ürün, sürü sayısı `N/6` ve `♀/♂/🍼` dökümü;
  hayvan panelinde cinsiyet (♀/♂) ve yavru/yetişkin rozeti
- Yeni hedef: "Çiftlikte 5 hayvanlık sürü kur"; `hile.ciftlik("cow", 4)`
  ile hızlı test

### v2.1: Hedef zinciri — oyun içi tutorial

- **Sol üstte hedef kartı**: sırayla 12 hedef — 5 çalı işaretle → Ev →
  Tapınak → 6 bilgi → ilk araştırma → 100 yemek → ilk kışı atlat →
  nüfus 15 → balta → mızrak → köpek → nüfus 20
- Her hedefin altında **nasıl/nerede yapılacağını anlatan ipucu satırı**
  (tuş, maliyet, mekanik açıklaması) — oyunu oynarken öğreten tutorial
- Ölçülebilir hedeflerde **ilerleme çubuğu** (örn. 64/100 yemek)
- Tamamlanınca **bilgi ödülü** (+1'den +8'e), kutlama mesajı ve Defter
  kaydı; sıradaki hedef otomatik duyurulur
- Hedef sırası kayıtla birlikte saklanır; eski kayıtlarda karşılanmış
  hedefler peş peşe tamamlanıp ödüllerini verir

### v2.0: Rastgele olaylar ve yaşayan denge

- **Rastgele olaylar** (kabaca her 1-1.5 günde bir, gündüz düşer): 🐺
  kurt sürüsü baskını (2-3 kurt kampa sokulur), 🐻 aç ayı, 🌳 bereket
  (yeni yemiş çalıları + mantar patlaması), 🥶 ayaz (kışın üşüme 2.5
  kat keskinleşir), 🤒 hastalık (bir köylü 1 gün halsiz: %45 yavaş),
  🌠 yıldız yağmuru (+8 moral, +3 bilgi), 🧍 göçmen (kabileye yeni
  yetişkin katılır); hepsi Deftere (B) işlenir
- **Hızlı büyüme**: büyüme çağındakiler günde 2 yaş alır — yeni doğan
  4 günde çocuk, 9 günde işçi olur; 18'den sonra normal takvim işler
  (1 yıl = 4 gün)
- **Daha sık hamilelik**: gün dönümünde gebe kalma şansı %35 → %55
- **Yemek daha kıymetli**: günlük açlık 40→44 (zorda 52→56), yemiş
  toplama verimi 6→5, başlangıç yemişi 45→40
- Hastalar profilde ve İnsanlar panelinde 🤒 rozetiyle görünür;
  `hile.olay()` rastgele, `hile.olay("kurt_baskini")` belirli olayı
  tetikler

### v1.9: Ses, kayıt ve ana menü

- **Prosedürel ses**: adımlar, balta/taş vuruşları, mızrak vınlaması,
  kurt uluması ve mesafeyle sönümlenen ateş çıtırtısı; menüden açılıp
  kapatılır
- **Kaydet/Yükle**: dünya, kaynaklar, araştırmalar, binalar, köylüler,
  hayvanlar ve defter localStorage'a yazılır; "Devam Et" ile kaldığın
  yerden sürer
- **Ana menü ve duraklatma menüsü**: BANISHER giriş ekranı (Yeni Oyun →
  zorluk seçimi, Devam Et, Ses); oyun içinde Esc → Devam / Kaydet /
  Ses / Ana Menü
- **3 zorluk seviyesi**: Kolay / Normal / Zor — açlık hızı, yırtıcı
  takvimi, başlangıç erzakı ve moral farklılaşır

### v1.8: Taş yol, tam ekran araştırma ve arayüz

- **Hırs** (Aidiyet + Sert Cisimler): **taş yol** döşenir (karo başına
  1 taş); yol üstünde %40 hızlı yürünür ve köylüler güzergâhlarında yolu
  kendiliğinden tercih eder (A* yol karolarını ucuz sayar)
- **Tam ekran teknoloji ağacı**: bilgi soldan sağa çağ sütunlarıyla akar
  (Sezgiler → Temeller → Beceriler → Zanaat → Ustalık → Gelenek);
  sürükleme/tekerlekle yatay kaydırma, ışıltılı kartlar, akış okları;
  çoklu ön koşullar madde madde listelenir; bilgi puanı üst bardaki
  düğmede (Teknoloji: N) ve panel başlığında görünür
- **Hayvan paneli**: hayvana tıklayınca adı, canı, av verimi ve
  evcilleşince dönüşeceği tür; 🏹 Saldır ve 🤝 Evcilleştir düğmeleri
  (toplu seçim hayvanlara işaret koymaz)
- **İnsanlar paneli (M)** iş panelinden ayrıldı: yaş, cinsiyet, görev,
  ekipman (🪓/🗡/🧥), moral-tokluk barları, 🤰/🎓 rozetleri
- **İşaret filtresi kısayolları**: G H J K L (çiplerde tuş kapağı)
- **Konsol hileleri**: F12 → `hile.yardim()` (kaynak, araştırma, nüfus,
  yırtıcı, takvim, hız...)
- Denge: 10 köylüyle başlangıç, kamp stoğu 500, yemiş 8 / mantar 12
  besin, Mantaroloji 9 bilgi

### v1.7: Evcilleştirme çağı — köpekler ve çiftlik

- **Yeni doğa faunası**: geyik, kuş, yaban domuzu, keçi + yırtıcılar
  (kurt, ayı); çiftlik hayvanları artık yalnız evcilleştirmeyle gelir
- **Evcilleştirme**: geyik→inek, kuş→tavuk, keçi→koyun, yaban domuzu→
  domuz, kurt→köpek; işçi gidip evcilleştirir, hayvan eşleşen çiftliğe
  yürür; işaretli kurt yemle sakinleşir
- **Köpek**: avcısıyla gezer, sahibi avlanırken hedefe saldırır, av
  sahasını 30→45 bloğa genişletir; sahipsizler avcılara otomatik dağılır
- **Aidiyet** (Merak'tan sonra): kurt evcilleştirmeyi açar;
  **Çiftlik** (Aidiyet + Toplayıcılık): tür seçilen çiftlik binası
- **Yırtıcı takvimi**: kurt Kış/1'den, ayı Kış/2'den önce türemez;
  yabaniler 25-55 sn arayla da haritaya türer

### v1.6: Zanaat, kış tehdidi ve görsel yenileme

- **Odun (kütük)** ayrı eşya: baltayla devrilen ağaç 3 odun + 1 dal
  verir; **Kırıcı** binası 1 odunu 4 dala böler
- **Deri İşleme** (Kan'dan sonra): atölyede deriden giysi (3 deri);
  kışın giysisiz köylü moral kaybeder ve %25 yavaşlar — giysili korunur
- **Binalar ilkel çağ diline yeniden çizildi**: saz damlar, kütük
  duvarlar, deri çadırlar, tipi, kazıklı ambar, ateş çukurlu yemekhane
- **Köylüler tombul piksel insan oldu**: saç rengi, kıyafet, etek,
  hamile karnı, elde balta/mızrak; profil portresi de yenilendi

### v1.5: Av, yırtıcılar ve tanrı-oyuncu etkileşimi

- **Kan** araştırması: atölyede mızrak (5 dal + 2 odun + 5 taş, sipariş
  usulü); **Avcı Kulübesi** (3 avcı, 5'er mızrak) en yakın avı kovalar;
  mızrak yiyen hayvan kaçar, ölen hayvan boyuta göre et/deri/yün verir
- **Yırtıcılar**: kurt ve ayı insana saldırır; silahlı karşı koyar,
  silahsız kaçar; köylülerde can/yaralanma; **tehlike kamerası** olaya
  kilitlenir; **çığlık** (Korku) silahlıları yardıma çağırır
- **Gerçekçi dövüş**: uçan mızrak projektilleri, saplama/savurma pozları,
  isabet parlamaları, yırtıcı hamleleri; **📖 Savaş ve Tehlike Defteri**
  (B) tüm olayları zaman damgasıyla kaydeder
- **Merak**: köylü oyuncuya yakarır; tıklayıp **mikrofonla konuşunca**
  şok olur, 2 günlüğüne +40 moral (ses yorumlanmaz, varlığı yeter)
- **Meşale binalara takılır** (5 dal, Doğa); ışıklı yerde 23:00'e kadar
  çalışılır, sonra herkes **ateş başında toplanır** (moral)

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

## Yol haritası: Çağlar boyunca gelişim

Oyun, insanlığın gerçek gelişim sırasını izleyen çağlara bölünerek
genişleyecek. Her çağ yeni araştırmalar, binalar ve davranışlar getirir.

### 🪨 Paleolitik — Mağara Çağı (mevcut durum, büyük ölçüde tamam)

- [x] Elle toplayıcılık: dal budama, yemiş/mantar/çakıl toplama
- [x] Ateşin keşfi (Doğa): meşale, gece çalışması, ateş başında moral
- [x] İnanç (Beşer): tapınak, bilgi üretimi, moral
- [x] Taş aletler (Sert Cisimler → Alet Atölyesi): balta ile ağaç devirme
- [x] Beceriler (Motor + Bilişsel): hız, bakımevi, çocuk eğitimi
- [x] Avcılık (temel): yabani hayvan işaretleyip avlama
- [ ] **Dil**: işbirliği — yakın çalışan köylüler birbirini hızlandırır
- [ ] **Mızrak** (Alet Atölyesi'nde üretilir): büyük av güvenli ve verimli
- [ ] **Ateşte pişirme**: ocak binası — pişmiş yemek daha doyurucu
- [x] **Deri işleme**: avdan düşen deri atölyede giysiye işlenir — giysili
      köylü kışın üşümez (moral) ve yavaşlamaz
- [ ] **Mağara resmi**: ilk sanat — kalıcı moral kaynağı binası

### 🌾 Neolitik — Tarım Devrimi

- [ ] **Tarım**: tarla, tohum ekme, mevsimlik hasat (kışın tarla durur)
- [ ] **Hayvan evcilleştirme**: yabani hayvan yakalayıp çiftliğe katma
- [ ] **Çanak çömlek**: yiyecek saklama — gıda bozulması mekaniğiyle birlikte
- [ ] **Dokumacılık**: yünden kıyafet (deri işlemenin gelişmişi)
- [ ] **Kerpiç evler**: daha büyük konut, daha iyi uyku morali
- [ ] **Takas**: gezgin tüccar — fazla ürünü olmayanla değiş tokuş

### ⚒️ Kalkolitik / Tunç Çağı

- [ ] **Bakır madenciliği**: yeni cevher blokları, eritme ocağı
- [ ] **Tunç aletler**: balta/kazma/orak verimi artar, aletler eskir
- [ ] **Tekerlek**: el arabası — taşıma kapasitesi artar
- [ ] **Müzik**: çalgılar ve meydan — şenlik günleri (toplu moral)
- [ ] **Yazı**: tablet evi/okul — bilgi üretimi rahip dışına çıkar

### 🗡️ Demir Çağı ve sonrası (uzak ufuk)

- [ ] Demir madenciliği ve demircilik
- [ ] Para ve pazar yeri
- [ ] Tıp/şifacı (hastalık sistemiyle birlikte)
- [ ] Yollar (hızlı yürüme), köprüler
- [ ] ... günümüze doğru

### Teknik

- [ ] Kaydet/yükle
- [ ] Ses efektleri ve müzik

## Mimari

```
src/
  main.ts            oyun döngüsü (sabit zaman adımı) ve kurulum
  engine/            kamera ve girdi (klavye, fare, zoom)
  world/             blok tanımları, noise, harita üretimi
  sim/               köylü davranışları, A* yol bulma, kaynaklar
  render/            pixel-art renderer ve HUD
```
