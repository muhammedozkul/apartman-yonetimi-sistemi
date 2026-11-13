# Apartmanım — apartman yönetim sistemi

Aidat, kasa, duyuru ve arıza takibi için kendi bilgisayarında çalışan yönetim paneli.
Veriler kendi **SQLite veritabanında** (`veri/apartman.db`) durur; her açılışta kaldığın yerden devam eder.

## Çalıştırma
- **Çift tıkla:** `Apartmanım.command` → sunucu başlar, tarayıcı açılır (http://127.0.0.1:8771).
- Ya da terminalde: `python3 sunucu.py`
- Kapatmak: açılan Terminal penceresini kapat (ya da Ctrl+C).

Ek kurulum yok; yalnız Python 3 (Mac'te hazır gelir).

## Neler var
- **Özet:** kasa bakiyesi, bu ayın tahsil oranı, geciken alacak, açık arızalar, aylık gelir-gider grafiği, gider dağılımı.
- **Daireler:** blok/no/kat, malik, kiracı, telefon, m², kişi sayısı, daireye özel aidat; toplu daire oluşturma; daire hesap ekstresi (yazdırılabilir).
- **Aidat:** 12 aylık tablo (ödendi / kısmi / ödenmedi), tek tıkla ödeme alma, toplu aidat borçlandırma (daireye göre, sabit, m² ya da kişi başı; birden çok ay), ek ödenek (eşit, toplamı eşit böl, m²'ye göre böl). Ödemeler en eski borçtan başlayarak kapanır.
- **Kasa:** gelir ve gider kayıtları, kategori/ay filtresi, CSV indirme.
- **Duyurular:** sabitleme, WhatsApp'ta paylaşma, kopyalama.
- **Arıza / Talep:** öncelik, durum, maliyet; maliyeti tek işaretle kasaya gider olarak işleme.
- **Raporlar:** borçlu daireler (WhatsApp ile hatırlatma bağlantısı), yıllık gelir-gider raporu, yazdırma.
- **Ayarlar:** apartman bilgileri, IBAN, varsayılan aidat, son ödeme günü, kasa açılış bakiyesi, açık/koyu tema; yedek indir/geri yükle; örnek veri; tümünü sil.

## Veritabanı
- Dosya: `veri/apartman.db` (git'e girmez).
- Tablolar: `daireler`, `hareketler` (tahakkuk / tahsilat / gider / gelir), `duyurular`, `arizalar`, `ayarlar`.
- Daire silinirse borç ve ödeme kayıtları da silinir (`ON DELETE CASCADE`); arızalar "ortak alan"a düşer.
- **Otomatik yedek:** sunucu her açılışta günün kopyasını `veri/yedekler/apartman-YYYY-AA-GG.db` olarak alır, son 14 günü saklar.
- Sunucu yalnız bu bilgisayardan (127.0.0.1) erişilebilir; veritabanı dosyası tarayıcıya verilmez.

## Dosyalar
- `sunucu.py` — HTTP sunucusu + JSON API + SQLite şeması
- `index.html`, `style.css`
- `js/veri.js` — API istemcisi ve hesaplar (bakiye, dağıtım, kasa)
- `js/arayuz.js` — form penceresi, bildirim, CSV
- `js/sayfalar.js` — sayfalar
- `js/uygulama.js` — başlangıç ve yönlendirme
