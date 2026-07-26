# Fransızca Kartlar

Fransızca kelime öğrenmek için basit, tamamen statik (backend'siz) bir aralıklı
tekrar uygulaması. Anki mantığının sadeleştirilmiş hâli. iPhone Safari için
tasarlandı, GitHub Pages'te barındırılabilir.

- Sade HTML + CSS + vanilla JS — build adımı yok.
- Tüm ilerleme tarayıcının `localStorage`'ında tutulur (sunucu, hesap, senkron yok).
- Web Speech API ile Fransızca telaffuz (`fr-FR`). iOS kısıtlaması gereği
  seslendirme yalnızca "🔊 Dinle" butonuna basınca çalışır, otomatik başlamaz.

## Dosyalar

```
index.html                    uygulama iskeleti
style.css                     stiller (mobil öncelikli)
app.js                        kart akışı + SM-2 benzeri algoritma
vocab/decks.json              deste listesi (manifest)
vocab/temel-kelimeler.json    örnek deste (15 kelime)
vocab/fiiller.json            örnek deste (12 fiil)
```

## GitHub Pages'e deploy

1. Bu depoyu GitHub'a push et.
2. Depoda **Settings → Pages** bölümüne gir.
3. **Source** olarak `Deploy from a branch` seç; branch olarak `main` (veya
   kullandığın branch) ve klasör olarak `/ (root)` seç, kaydet.
4. Birkaç dakika içinde uygulama `https://<kullanıcı-adın>.github.io/<depo-adı>/`
   adresinde yayına girer. iPhone'da Safari ile aç, "Paylaş → Ana Ekrana Ekle"
   dersen tam ekran çalışır.

### Yerelde denemek

Dosyaları çift tıklayarak (`file://`) açmak işe yaramaz — tarayıcı JSON
dosyalarını okuyamaz. Küçük bir sunucu yeterli:

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

## Yeni deste (vocab dosyası) ekleme

1. `vocab/` klasörüne yeni bir JSON dosyası ekle, örn. `vocab/yemek.json`:

```json
[
  { "id": "1", "front": "le fromage", "back": "peynir", "example": "J'aime le fromage." },
  { "id": "2", "front": "la pomme",   "back": "elma",   "example": "Je mange une pomme." }
]
```

- `id` — deste içinde benzersiz olmalı (ilerleme bu id ile eşleşir; sonradan
  değiştirirsen o kartın geçmişi sıfırlanır).
- `front` — Fransızca kelime/cümle (sesli okunan kısım).
- `back` — Türkçe karşılığı.
- `example` — isteğe bağlı örnek cümle; boş bırakabilir ya da hiç yazmayabilirsin.

2. `vocab/decks.json` dosyasına desteyi kaydet:

```json
[
  {
    "id": "yemek",
    "name": "Yemek Kelimeleri",
    "description": "Mutfak ve yiyecekler",
    "file": "vocab/yemek.json"
  }
]
```

- `id` — desteye ait ilerlemenin anahtarı; sonradan değiştirme.
- `file` — depo kökünden itibaren yol.

3. Commit'leyip push et. GitHub Pages birkaç dakika içinde günceller.

Kart eklemek/çıkarmak mevcut ilerlemeyi bozmaz; sadece `id` değerlerini sabit tut.

## Aralıklı tekrar nasıl çalışıyor

Her kart için `sonraki tekrar tarihi`, `interval` (gün), `ease factor` ve
`tekrar sayısı` saklanır. Bir oturumda yalnızca tekrar tarihi bugün veya daha
önce olan kartlar (ve hiç çalışılmamış yeni kartlar) gösterilir.

| Buton | Etki |
|---|---|
| **Tekrar** | Ease −0.20, sayaç sıfırlanır, kart 10 dakika sonraya atılır ve aynı oturumda tekrar sorulur. |
| **Zor** | Ease −0.15, interval ×1.2. |
| **İyi** | İlk doğru: 1 gün → sonra 3 gün → sonrasında interval × ease. |
| **Kolay** | Ease +0.15, "İyi" aralığının ~1.3 katı (en az 4 gün ve her zaman "İyi"den uzun). |

Ease 1.3 ile 3.5 arasında sınırlanır, interval en fazla 365 gündür.
Butonların altında o cevabın kartı ne kadar sonraya atacağı yazar.

## Sıkça sorulanlar

**İlerlemem nerede duruyor?** Tarayıcının `localStorage`'ında,
`frcards.v1.progress` anahtarında. Cihazlar arasında senkron olmaz; Safari
verileri temizlenirse ilerleme kaybolur.

**Ses çıkmıyor.** iOS'ta sessiz mod/ses seviyesini kontrol et. Seslendirme
yalnızca butona dokununca başlar; sayfa açılır açılmaz otomatik okuma iOS'ta
zaten engellidir. Cihazda Fransızca ses yüklü değilse
(Ayarlar → Erişilebilirlik → Konuşulan İçerik → Sesler) telaffuz bozuk olabilir.

**İlerlemeyi sıfırlamak istiyorum.** Safari'de konsol yoksa en pratik yol
site verilerini temizlemek: Ayarlar → Safari → Gelişmiş → Web Sitesi Verileri.
