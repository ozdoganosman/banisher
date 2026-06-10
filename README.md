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
| Sol tık | Ağaç/çalı işaretle veya seçili binayı yerleştir |
| 1-4 | Bina seç (Ev, Depo, Oduncu, Toplayıcı) |
| Esc / sağ tık | Bina seçimini iptal et |
| WASD / Ok tuşları | Kamerayı kaydır |
| Fare tekerleği | Yakınlaş / uzaklaş (imlece doğru) |
| Sağ/orta tık sürükle | Kamerayı sürükleyerek kaydır |

İpucu: `?seed=12345` URL parametresi ile sabit harita üretebilirsin.

## Şu anki özellikler (v0.2)

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
