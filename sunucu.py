#!/usr/bin/env python3
"""Apartmanım sunucusu: SQLite veritabanı + JSON API + sayfa dosyaları.

Çalıştır:  python3 sunucu.py          (http://127.0.0.1:8771)
Ek paket gerekmez; yalnız Python 3 standart kütüphanesi.
"""
import json
import os
import shutil
import sqlite3
import sys
import threading
import webbrowser
from datetime import date
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

KOK = Path(__file__).resolve().parent
VERI_KLASORU = KOK / "veri"
DB_YOLU = VERI_KLASORU / "apartman.db"
YEDEK_KLASORU = VERI_KLASORU / "yedekler"
PORT = int(os.environ.get("APARTMAN_PORT", "8771"))
SAKLANACAK_YEDEK = 14

# Tablo -> sütunlar (id dışında). API yalnız bu sütunlara yazabilir.
TABLOLAR = {
    "daireler": ["blok", "no", "kat", "malik", "kiraci", "telefon", "m2", "kisi", "aidat", "notlar"],
    "hareketler": ["tur", "altTur", "daireId", "donem", "tarih", "tutar", "kategori", "yontem", "aciklama"],
    "duyurular": ["tarih", "baslik", "metin", "sabit"],
    "arizalar": ["tarih", "daireId", "konu", "aciklama", "oncelik", "durum", "maliyet"],
}
BOS_OLABILIR = {"daireId", "aidat", "maliyet", "m2", "kisi", "kat"}
MANTIKSAL = {"sabit"}

SEMA = """
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS ayarlar (
    anahtar TEXT PRIMARY KEY,
    deger   TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS daireler (
    id      TEXT PRIMARY KEY,
    blok    TEXT DEFAULT '',
    no      TEXT NOT NULL,
    kat     INTEGER,
    malik   TEXT DEFAULT '',
    kiraci  TEXT DEFAULT '',
    telefon TEXT DEFAULT '',
    m2      REAL,
    kisi    INTEGER,
    aidat   REAL,               -- boşsa varsayılan aidat uygulanır
    notlar  TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS hareketler (
    id       TEXT PRIMARY KEY,
    tur      TEXT NOT NULL CHECK (tur IN ('tahakkuk', 'tahsilat', 'gider', 'gelir')),
    altTur   TEXT DEFAULT '',     -- tahakkuk için: aidat | ek
    daireId  TEXT REFERENCES daireler(id) ON DELETE CASCADE,
    donem    TEXT DEFAULT '',     -- YYYY-AA
    tarih    TEXT NOT NULL,       -- YYYY-AA-GG
    tutar    REAL NOT NULL CHECK (tutar >= 0),
    kategori TEXT DEFAULT '',
    yontem   TEXT DEFAULT '',
    aciklama TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_hareket_daire ON hareketler(daireId);
CREATE INDEX IF NOT EXISTS ix_hareket_tarih ON hareketler(tarih);
CREATE TABLE IF NOT EXISTS duyurular (
    id     TEXT PRIMARY KEY,
    tarih  TEXT NOT NULL,
    baslik TEXT NOT NULL,
    metin  TEXT DEFAULT '',
    sabit  INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS arizalar (
    id       TEXT PRIMARY KEY,
    tarih    TEXT NOT NULL,
    daireId  TEXT REFERENCES daireler(id) ON DELETE SET NULL,
    konu     TEXT NOT NULL,
    aciklama TEXT DEFAULT '',
    oncelik  TEXT DEFAULT 'Orta',
    durum    TEXT DEFAULT 'Açık',
    maliyet  REAL
);
"""

YAZMA_KILIDI = threading.Lock()


def baglan():
    db = sqlite3.connect(DB_YOLU, timeout=10)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    return db


def hazirla():
    VERI_KLASORU.mkdir(exist_ok=True)
    YEDEK_KLASORU.mkdir(exist_ok=True)
    # Günlük yedek: bugünün kopyası yoksa al, eski yedekleri sınırla.
    if DB_YOLU.exists():
        hedef = YEDEK_KLASORU / f"apartman-{date.today().isoformat()}.db"
        if not hedef.exists():
            kaynak = sqlite3.connect(DB_YOLU)
            yedek = sqlite3.connect(hedef)
            with yedek:
                kaynak.backup(yedek)
            kaynak.close()
            yedek.close()
        yedekler = sorted(YEDEK_KLASORU.glob("apartman-*.db"))
        for eski in yedekler[:-SAKLANACAK_YEDEK]:
            eski.unlink()
    with baglan() as db:
        db.executescript(SEMA)


def satir_sozluk(tablo, satir):
    s = dict(satir)
    for k in MANTIKSAL:
        if k in s:
            s[k] = bool(s[k])
    for k in BOS_OLABILIR:
        if k in s and s[k] is None:
            s[k] = ""
    return s


def tum_veri(db):
    sonuc = {"ayarlar": {}}
    for r in db.execute("SELECT anahtar, deger FROM ayarlar"):
        sonuc["ayarlar"][r["anahtar"]] = json.loads(r["deger"])
    for tablo in TABLOLAR:
        sonuc[tablo] = [satir_sozluk(tablo, r) for r in db.execute(f"SELECT * FROM {tablo} ORDER BY rowid")]
    return sonuc


def temizle(tablo, kayit, kismi=False):
    sutunlar = TABLOLAR[tablo]
    temiz = {}
    for k in sutunlar:
        if k not in kayit:
            if kismi:
                continue
            temiz[k] = None if k in BOS_OLABILIR else ("" if k not in MANTIKSAL else 0)
            continue
        v = kayit[k]
        if k in MANTIKSAL:
            v = 1 if v else 0
        elif k in BOS_OLABILIR and (v == "" or v is None):
            v = None
        temiz[k] = v
    return temiz


def ekle(db, tablo, kayit):
    if not kayit.get("id"):
        raise ValueError("id eksik")
    temiz = temizle(tablo, kayit)
    alanlar = ["id", *temiz.keys()]
    db.execute(
        f"INSERT INTO {tablo} ({', '.join(alanlar)}) VALUES ({', '.join('?' * len(alanlar))})",
        [kayit["id"], *temiz.values()],
    )


def ayarlari_yaz(db, ayarlar):
    for k, v in ayarlar.items():
        db.execute(
            "INSERT INTO ayarlar (anahtar, deger) VALUES (?, ?) ON CONFLICT(anahtar) DO UPDATE SET deger = excluded.deger",
            [str(k), json.dumps(v, ensure_ascii=False)],
        )


def hepsini_sil(db):
    for tablo in ["hareketler", "arizalar", "duyurular", "daireler", "ayarlar"]:
        db.execute(f"DELETE FROM {tablo}")


STATIK = {"/": "index.html", "/index.html": "index.html", "/style.css": "style.css"}


class Isleyici(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=str(KOK), **k)

    def log_message(self, fmt, *args):
        if args and "/api/" in str(args[0]):
            sys.stderr.write("%s\n" % (fmt % args))

    # --- yanıt yardımcıları ---
    def json_gonder(self, veri, kod=200):
        govde = json.dumps(veri, ensure_ascii=False).encode("utf-8")
        self.send_response(kod)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(govde)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(govde)

    def govde_oku(self):
        uzunluk = int(self.headers.get("Content-Length") or 0)
        if uzunluk > 50 * 1024 * 1024:
            raise ValueError("İstek çok büyük")
        return json.loads(self.rfile.read(uzunluk) or b"null")

    def yol_parcalari(self):
        return [p for p in urlparse(self.path).path.split("/") if p]

    def end_headers(self):
        if not self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    # --- statik dosyalar: yalnız sayfa dosyaları, veritabanı asla ---
    def do_GET(self):
        yol = urlparse(self.path).path
        if yol.startswith("/api/"):
            return self.api("GET")
        if yol in STATIK or (yol.startswith("/js/") and yol.endswith(".js") and ".." not in yol):
            self.path = "/" + STATIK.get(yol, yol.lstrip("/"))
            return super().do_GET()
        self.send_error(404)

    def do_POST(self):
        self.api("POST")

    def do_PUT(self):
        self.api("PUT")

    def do_DELETE(self):
        self.api("DELETE")

    def api(self, yontem):
        # Yalnız bu bilgisayardan gelen isteklere izin ver (başka siteler yazamasın).
        origin = self.headers.get("Origin")
        if yontem != "GET" and origin and urlparse(origin).hostname not in ("127.0.0.1", "localhost"):
            return self.json_gonder({"hata": "İzin verilmeyen kaynak"}, 403)
        p = self.yol_parcalari()[1:]  # 'api' sonrası
        try:
            if yontem == "GET" and p == ["veri"]:
                with baglan() as db:
                    return self.json_gonder(tum_veri(db))
            if yontem == "GET" and p == ["saglik"]:
                return self.json_gonder({"ok": True, "db": str(DB_YOLU)})

            govde = self.govde_oku() if yontem in ("POST", "PUT") else None
            with YAZMA_KILIDI, baglan() as db:
                if yontem == "PUT" and p == ["ayarlar"]:
                    ayarlari_yaz(db, govde or {})
                elif yontem == "POST" and p == ["ice-aktar"]:
                    hepsini_sil(db)
                    ayarlari_yaz(db, govde.get("ayarlar") or {})
                    for tablo in ["daireler", "hareketler", "duyurular", "arizalar"]:
                        for kayit in govde.get(tablo) or []:
                            ekle(db, tablo, kayit)
                elif yontem == "POST" and p == ["sifirla"]:
                    hepsini_sil(db)
                elif len(p) >= 1 and p[0] in TABLOLAR:
                    tablo = p[0]
                    if yontem == "POST" and len(p) == 1:
                        for kayit in govde if isinstance(govde, list) else [govde]:
                            ekle(db, tablo, kayit)
                    elif yontem == "PUT" and len(p) == 2:
                        temiz = temizle(tablo, govde or {}, kismi=True)
                        if temiz:
                            db.execute(
                                f"UPDATE {tablo} SET {', '.join(k + ' = ?' for k in temiz)} WHERE id = ?",
                                [*temiz.values(), p[1]],
                            )
                    elif yontem == "DELETE" and len(p) == 2:
                        db.execute(f"DELETE FROM {tablo} WHERE id = ?", [p[1]])
                    else:
                        return self.json_gonder({"hata": "Bilinmeyen istek"}, 404)
                else:
                    return self.json_gonder({"hata": "Bilinmeyen istek"}, 404)
            return self.json_gonder({"ok": True})
        except (ValueError, KeyError, TypeError, AttributeError, sqlite3.Error, json.JSONDecodeError) as e:
            return self.json_gonder({"hata": str(e)}, 400)


def main():
    hazirla()
    sunucu = ThreadingHTTPServer(("127.0.0.1", PORT), Isleyici)
    adres = f"http://127.0.0.1:{PORT}/"
    print(f"Apartmanım çalışıyor: {adres}")
    print(f"Veritabanı: {DB_YOLU}")
    print("Kapatmak için bu pencerede Ctrl+C.")
    if "--tarayici" in sys.argv:
        threading.Timer(0.6, lambda: webbrowser.open(adres)).start()
    try:
        sunucu.serve_forever()
    except KeyboardInterrupt:
        print("\nKapatıldı.")


if __name__ == "__main__":
    main()
