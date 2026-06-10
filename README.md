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
| Sol tık | Ağacı kesim için işaretle / işareti kaldır |
| WASD / Ok tuşları | Kamerayı kaydır |
| Fare tekerleği | Yakınlaş / uzaklaş (imlece doğru) |
| Sağ/orta tık sürükle | Kamerayı sürükleyerek kaydır |

## Şu anki özellikler (v0.1)

- Value-noise ile prosedürel harita: su, kum, çimen, toprak, taş ve ormanlar
- Offscreen canvas'a önbelleklenmiş pixel-art zemin (hızlı render)
- A* yol bulma (4 yönlü grid)
- Köylüler: boşken dolanır, işaretlenen ağaca gidip keser, odun stoğa eklenir
- Yürüme ve balta sallama animasyonlu çöp adam karakterler
- Kaynak HUD'u (odun, nüfus)

## Yol haritası

- [ ] Bina inşaatı (depo, ev, oduncu kulübesi) — odun harcayarak
- [ ] Yemek ve açlık: toplayıcı kulübesi, tarlalar
- [ ] Mevsimler ve gün/gece döngüsü
- [ ] Köylü ihtiyaçları (yorgunluk, ısınma) ve ölüm
- [ ] Taş/demir madenciliği
- [ ] Nüfus artışı (yeni köylüler)
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
