# Fransızca Kartlar

Fransızca kelime öğrenmek için basit, tamamen statik (backend'siz) bir aralıklı
tekrar uygulaması. Anki mantığının sadeleştirilmiş hâli. iPhone Safari için
tasarlandı, GitHub Pages'te barındırılabilir.

- Sade HTML + CSS + vanilla JS — build adımı yok.
- Tüm ilerleme tarayıcının `localStorage`'ında tutulur (sunucu, hesap, senkron yok).
- Web Speech API ile Fransızca telaffuz (`fr-FR`). iOS kısıtlaması gereği
  seslendirme yalnızca "🔊 Dinle" butonuna basınca çalışır, otomatik başlamaz.
- A / B / C seviye filtresi ve isteğe bağlı örnek cümle çevirisi.

## Dosyalar

```
index.html                    uygulama iskeleti
style.css                     stiller (mobil öncelikli)
app.js                        kart akışı + SM-2 benzeri algoritma
vocab/decks.json              deste listesi (manifest)
vocab/temel-kelimeler.json    A1 · 15 kelime
vocab/fiiller.json            A1 · 12 fiil
vocab/gunluk-hayat.json       A2 · 12 kelime
vocab/is-ve-egitim.json       B1 · 12 kelime
vocab/soyut-kavramlar.json    B2 · 12 kelime
vocab/ileri-ifadeler.json     C1 · 12 kelime
```

## Seviyeler

Deste ekranının üstündeki **Tümü / A / B / C** filtresi hangi kartların
çalışılacağını belirler. Seçim `localStorage`'a yazılır, uygulamayı tekrar
açtığında hatırlanır.

Seviye `decks.json` içinde deste bazında verilir (`"level": "A1"`). Filtre ilk
harfe bakar, yani `A1` ve `A2` desteleri **A** filtresinde birlikte çıkar; deste
kartındaki rozette tam seviye (`A1`, `B2` …) görünür. Seçili seviyede hiç kartı
olmayan desteler listelenmez.

İstersen tek tek kartlara da seviye verebilirsin; kartın `level` alanı destenin
seviyesini ezer, böylece karışık seviyeli bir deste tutabilirsin:

```json
{ "id": "7", "front": "l'écueil", "back": "engel, tuzak", "level": "C1" }
```

`level` yazmazsan kart, bağlı olduğu destenin seviyesini devralır. Hiçbirinde
seviye yoksa kart yalnızca "Tümü" filtresinde görünür.

## GitHub Pages'e deploy

Depoda hazır bir workflow var: `.github/workflows/pages.yml`. Yapılacak tek şey
**Settings → Pages → Source** ayarını `GitHub Actions` yapmak. Sonrasında
default branch'e her push'ta site otomatik yayınlanır; deploy'un durumunu
**Actions** sekmesinden izleyebilirsin.

Alternatif olarak workflow'a hiç dokunmadan **Source → `Deploy from a branch`**
seçip branch'i ve `/ (root)` klasörünü de gösterebilirsin — build adımı olmadığı
için sonuç aynı.

Her iki durumda da adres: `https://<kullanıcı-adın>.github.io/<depo-adı>/`
İlk yayın birkaç dakika sürebilir. iPhone'da Safari ile aç, "Paylaş → Ana Ekrana
Ekle" dersen tam ekran çalışır.

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
  {
    "id": "1",
    "front": "le fromage",
    "back": "peynir",
    "example": "J'aime le fromage de chèvre.",
    "exampleTr": "Keçi peynirini severim."
  },
  { "id": "2", "front": "la pomme", "back": "elma", "example": "Je mange une pomme." }
]
```

- `id` — deste içinde benzersiz olmalı (ilerleme bu id ile eşleşir; sonradan
  değiştirirsen o kartın geçmişi sıfırlanır).
- `front` — Fransızca kelime/cümle (sesli okunan kısım).
- `back` — Türkçe karşılığı.
- `example` — isteğe bağlı örnek cümle; boş bırakabilir ya da hiç yazmayabilirsin.
- `exampleTr` — isteğe bağlı; örnek cümlenin Türkçesi. Kartın arkasında varsayılan
  olarak gizli durur, "Çeviriyi göster" butonuyla açılır ve bu tercih sonraki
  kartlarda da korunur. Yazmadığın kartlarda buton hiç görünmez.
- `level` — isteğe bağlı; kart bazında seviye (yukarıdaki "Seviyeler" bölümü).

2. `vocab/decks.json` dosyasına desteyi kaydet:

```json
[
  {
    "id": "yemek",
    "name": "Yemek Kelimeleri",
    "description": "Mutfak ve yiyecekler",
    "level": "A2",
    "file": "vocab/yemek.json"
  }
]
```

- `id` — desteye ait ilerlemenin anahtarı; sonradan değiştirme.
- `level` — destenin varsayılan seviyesi (`A1`, `A2`, `B1`, `B2`, `C1`, `C2`).
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
