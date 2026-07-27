# Fransızca Kartlar

Fransızca kelime öğrenmek için basit, tamamen statik (backend'siz) bir aralıklı
tekrar uygulaması. Anki mantığının sadeleştirilmiş hâli. iPhone Safari için
tasarlandı, GitHub Pages'te barındırılıyor.

- Sade HTML + CSS + vanilla JS — build adımı yok.
- Bütün kelimeler tek bir `vocab.json` dosyasında; her kartın kendi seviyesi var.
- Tüm ilerleme tarayıcının `localStorage`'ında tutulur (sunucu, hesap, senkron yok).
- Web Speech API ile Fransızca telaffuz (`fr-FR`). iOS kısıtlaması gereği
  seslendirme yalnızca "🔊 Dinle" butonuna basınca çalışır, otomatik başlamaz.

## Dosyalar

```
index.html    uygulama iskeleti
style.css     stiller (mobil öncelikli)
app.js        kart akışı + SM-2 benzeri algoritma
vocab.json    bütün kelimeler
```

## Kelime formatı

`vocab.json` düz bir JSON dizisi. Her kart bir nesne:

```json
[
  {
    "level": "A2",
    "front": "la gare",
    "back": "tren istasyonu",
    "example": "Le train part de la gare à midi.",
    "exampleTr": "Tren istasyondan öğlen kalkıyor."
  }
]
```

- `level` — kartın seviyesi: `A1`, `A2`, `B1`, `B2`, `C1`, `C2`.
- `front` — Fransızca kelime/ifade. Sesli okunan kısım burası, o yüzden
  parantez ya da kısaltma (m.), (f.) yazma — hepsi telaffuz edilir.
- `back` — Türkçe karşılığı.
- `example` — isteğe bağlı örnek cümle (o da sesli okunabiliyor).
- `exampleTr` — isteğe bağlı; örnek cümlenin Türkçesi. Kartın arkasında
  varsayılan olarak gizli, "Çeviriyi göster" butonuyla açılıyor ve bu tercih
  sonraki kartlarda da korunuyor. Yazmadığın kartlarda buton hiç görünmez.

Kelime eklemek için dosyanın uygun yerine bir nesne ekleyip push etmen yeterli;
başka hiçbir yeri güncellemene gerek yok.

### Kartların kimliği

İlerleme kaydı `front` alanına bağlanır, yani ayrıca `id` yazmana gerek yok.
Bir kelimenin `front`'unu sonradan değiştirirsen o kartın geçmişi sıfırlanır
(uygulama onu yeni kelime sayar). Yazımı değiştirmen gerekiyorsa ve geçmişi
korumak istiyorsan karta sabit bir `"id"` verebilirsin — id varsa kimlik olarak
o kullanılır.

## Seviyeler

Açılış ekranı **Tümü / A / B / C** satırlarını gösterir; her satırda o seviyedeki
kelime sayısı ve bugün tekrar edilecek kart sayısı yazar. Bir satıra dokununca
sadece o seviyenin kartlarıyla oturum başlar.

Gruplama seviyenin ilk harfine bakar: `A1` ve `A2` kartları **A**'nın altında
birlikte çıkar, alt seviyeler satırın açıklamasında görünür ("A1, A2 · 39
kelime"). Hiç kartı olmayan bir harf listede gösterilmez — örneğin C2 kelimesi
eklediğinde ayrıca bir şey yapman gerekmez, C satırının içeriği kendiliğinden
büyür.

`level` yazılmamış kartlar yalnızca "Tümü" içinde çıkar.

## Aralıklı tekrar nasıl çalışıyor

Her kart için `sonraki tekrar tarihi`, `interval` (gün), `ease factor` ve
`tekrar sayısı` saklanır. Bir oturumda yalnızca tekrar tarihi bugün veya daha
önce olan kartlar (ve hiç çalışılmamış yeni kartlar) gösterilir.

| Buton | Etki |
|---|---|
| **Tekrar** | Ease −0.20, sayaç sıfırlanır, kart 10 dakika sonraya atılır. Aynı oturumda tekrar sorulur, ama gerçekten 10 dakika dolduktan sonra — araya başka kartlar girer. Kuyruk bu süre dolmadan biterse oturum kapanır ve özet kaç kartın ne kadar sonra hazır olacağını söyler. |
| **Zor** | Ease −0.15, interval ×1.2. |
| **İyi** | İlk doğru: 1 gün → sonra 3 gün → sonrasında interval × ease. |
| **Kolay** | Ease +0.15, "İyi" aralığının ~1.3 katı (en az 4 gün ve her zaman "İyi"den uzun). |

Ease 1.3 ile 3.5 arasında sınırlanır, interval en fazla 365 gündür.
Butonların altında o cevabın kartı ne kadar sonraya atacağı yazar.

**Gün sınırı 04:00.** Gün cinsinden aralıklar gece yarısına değil sabah 04:00'e
hizalanır (Anki de böyle yapar). Yoksa 23:50'de "1 gün" sonraya atılan kart on
dakika sonra, gece yarısı geçer geçmez geri gelirdi. Bunun sonucu olarak gece
geç saatte çalışırken "1 gün" pratikte "yarın sabah 04:00'ten sonra" demektir,
ve gece yarısından sonraki çalışma önceki güne sayılır.

## GitHub Pages'e deploy

Depoda hazır bir workflow var: `.github/workflows/pages.yml`. **Settings → Pages
→ Source** ayarı `GitHub Actions` olduğu sürece, default branch'e her push'ta
site otomatik yayınlanır; deploy'un durumunu **Actions** sekmesinden izleyebilirsin.

Adres: `https://<kullanıcı-adın>.github.io/<depo-adı>/`
iPhone'da Safari ile aç, "Paylaş → Ana Ekrana Ekle" dersen tam ekran çalışır.

### Yerelde denemek

Dosyaları çift tıklayarak (`file://`) açmak işe yaramaz — tarayıcı JSON
dosyasını okuyamaz. Küçük bir sunucu yeterli:

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

Push etmeden önce JSON'un sağlam olduğunu doğrulamak istersen:

```bash
python3 -c "import json; print(len(json.load(open('vocab.json'))), 'kart')"
```

## Sıkça sorulanlar

**İlerlemem nerede duruyor?** Tarayıcının `localStorage`'ında,
`frcards.v2.progress` anahtarında. Cihazlar arasında senkron olmaz; Safari
verileri temizlenirse ilerleme kaybolur.

**Ses çıkmıyor.** iOS'ta sessiz mod/ses seviyesini kontrol et. Seslendirme
yalnızca butona dokununca başlar; sayfa açılır açılmaz otomatik okuma iOS'ta
zaten engellidir. Cihazda Fransızca ses yüklü değilse
(Ayarlar → Erişilebilirlik → Konuşulan İçerik → Sesler) telaffuz bozuk olabilir.

**İlerlemeyi sıfırlamak istiyorum.** Safari'de en pratik yol site verilerini
temizlemek: Ayarlar → Safari → Gelişmiş → Web Sitesi Verileri.
