// Veri katmanı: SQLite veritabanıyla konuşur (sunucu.py üzerinden).
// Bellekteki kopya ekranı hızlı çizmek için; her değişiklik önce veritabanına yazılır.

const GIDER_KATEGORILERI = ['Elektrik', 'Su', 'Doğalgaz / Yakıt', 'Temizlik', 'Asansör bakım', 'Görevli maaşı', 'Onarım / Tadilat', 'Sigorta', 'Kırtasiye / Banka', 'Diğer'];
const GELIR_KATEGORILERI = ['Faiz / Getiri', 'Kira geliri', 'Bağış', 'Diğer gelir'];
const ODEME_YONTEMLERI = ['Nakit', 'Havale / EFT', 'Kredi kartı'];

function varsayilanAyarlar() {
  return {
    ad: 'Apartmanım', adres: '', yonetici: '', telefon: '', iban: '',
    varsayilanAidat: 750, aidatGunu: 10, acilisBakiyesi: 0, tema: 'oto'
  };
}
function bosVeri() {
  return { ayarlar: varsayilanAyarlar(), daireler: [], hareketler: [], duyurular: [], arizalar: [] };
}

async function api(yol, yontem = 'GET', govde) {
  const yanit = await fetch('/api/' + yol, {
    method: yontem,
    headers: govde !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: govde !== undefined ? JSON.stringify(govde) : undefined
  });
  let veri = null;
  try { veri = await yanit.json(); } catch { /* boş yanıt */ }
  if (!yanit.ok) throw new Error((veri && veri.hata) || ('Sunucu hatası ' + yanit.status));
  return veri;
}

const Veri = {
  durum: bosVeri(),
  baglanti: true,

  async yukle() {
    const v = await api('veri');
    this.durum = { ...bosVeri(), ...v, ayarlar: { ...varsayilanAyarlar(), ...(v.ayarlar || {}) } };
    this.baglanti = true;
  },

  async ayarlariKaydet(alanlar) {
    await api('ayarlar', 'PUT', alanlar);
    Object.assign(this.durum.ayarlar, alanlar);
  },

  async icerikAl(json) {
    const v = typeof json === 'string' ? JSON.parse(json) : json;
    if (!v || !Array.isArray(v.daireler) || !Array.isArray(v.hareketler)) throw new Error('Bu dosya Apartmanım yedeği değil.');
    const tam = { ...bosVeri(), ...v, ayarlar: { ...varsayilanAyarlar(), ...(v.ayarlar || {}) } };
    await api('ice-aktar', 'POST', tam);
    await this.yukle();
  },

  async sifirla() { await api('sifirla', 'POST'); await this.yukle(); },

  // --- Kayıt işlemleri (önce veritabanı, sonra bellek) ---
  async ekle(liste, oge) {
    oge.id = oge.id || kimlik();
    await api(liste, 'POST', oge);
    this.durum[liste].push(oge);
    return oge;
  },
  async topluEkle(liste, ogeler) {
    if (!ogeler.length) return;
    ogeler.forEach(o => { o.id = o.id || kimlik(); });
    await api(liste, 'POST', ogeler);
    this.durum[liste].push(...ogeler);
  },
  async guncelle(liste, id, alanlar) {
    await api(`${liste}/${encodeURIComponent(id)}`, 'PUT', alanlar);
    const o = this.durum[liste].find(x => x.id === id);
    if (o) Object.assign(o, alanlar);
    return o;
  },
  async sil(liste, id) {
    await api(`${liste}/${encodeURIComponent(id)}`, 'DELETE');
    this.durum[liste] = this.durum[liste].filter(x => x.id !== id);
    if (liste === 'daireler') { // veritabanı da aynısını yapıyor (CASCADE / SET NULL)
      this.durum.hareketler = this.durum.hareketler.filter(h => h.daireId !== id);
      this.durum.arizalar.forEach(a => { if (a.daireId === id) a.daireId = ''; });
    }
  },

  daire(id) { return this.durum.daireler.find(d => d.id === id); },
  daireAdi(id) {
    const d = this.daire(id);
    if (!d) return '—';
    return (d.blok ? d.blok + ' ' : '') + 'No ' + d.no;
  },
  siraliDaireler() {
    return [...this.durum.daireler].sort((a, b) =>
      String(a.blok || '').localeCompare(String(b.blok || ''), 'tr') || sayisal(a.no) - sayisal(b.no) || String(a.no).localeCompare(String(b.no), 'tr'));
  },
  daireAidati(d) {
    return d.aidat != null && d.aidat !== '' ? Number(d.aidat) : Number(this.durum.ayarlar.varsayilanAidat) || 0;
  },

  // --- Aidat tahakkuku ---
  // Bir dönem (YYYY-AA) için borç kayıtlarını hazırlar; aidatta zaten borcu olan daire atlanır.
  tahakkukHazirla(donem, tutarlar, aciklama = 'Aidat', tur = 'aidat', hareketler = this.durum.hareketler, daireler = this.durum.daireler) {
    const ay = Number(donem.slice(5, 7));
    const gun = Math.min(Number(this.durum.ayarlar.aidatGunu) || 10, 28);
    const vade = `${donem}-${String(gun).padStart(2, '0')}`;
    const yeni = [];
    for (const d of daireler) {
      const tutar = Number(tutarlar[d.id]);
      if (!tutar || tutar <= 0) continue;
      if (tur === 'aidat' && hareketler.some(h => h.tur === 'tahakkuk' && h.altTur === 'aidat' && h.daireId === d.id && h.donem === donem)) continue;
      yeni.push({
        id: kimlik(), tur: 'tahakkuk', altTur: tur, daireId: d.id, donem, tarih: vade,
        tutar: yuvarla(tutar), kategori: '', yontem: '',
        aciklama: tur === 'aidat' ? `${AYLAR[ay - 1]} ${donem.slice(0, 4)} aidatı` : aciklama
      });
    }
    return yeni;
  },
  async tahakkukOlustur(donem, tutarlar, aciklama, tur) {
    const yeni = this.tahakkukHazirla(donem, tutarlar, aciklama, tur);
    await this.topluEkle('hareketler', yeni);
    return yeni.length;
  },

  // --- Hesaplar ---
  daireHareketleri(daireId) {
    return this.durum.hareketler
      .filter(h => h.daireId === daireId && (h.tur === 'tahakkuk' || h.tur === 'tahsilat'))
      .sort((a, b) => a.tarih.localeCompare(b.tarih) || (a.tur === 'tahakkuk' ? -1 : 1));
  },
  daireBakiye(daireId) {
    let b = 0;
    for (const h of this.durum.hareketler) {
      if (h.daireId !== daireId) continue;
      if (h.tur === 'tahakkuk') b += h.tutar;
      else if (h.tur === 'tahsilat') b -= h.tutar;
    }
    return yuvarla(b); // pozitif = borç, negatif = alacak (fazla ödeme)
  },
  // Ödemeleri en eski borçtan başlayarak kapatır; her tahakkukun ne kadarının ödendiğini döndürür.
  dagitim(daireId) {
    const borclar = this.durum.hareketler.filter(h => h.daireId === daireId && h.tur === 'tahakkuk')
      .sort((a, b) => a.tarih.localeCompare(b.tarih) || (a.altTur === 'aidat' ? 0 : 1) - (b.altTur === 'aidat' ? 0 : 1));
    let odenen = this.durum.hareketler.filter(h => h.daireId === daireId && h.tur === 'tahsilat')
      .reduce((t, h) => t + h.tutar, 0);
    const sonuc = new Map();
    for (const b of borclar) {
      const kapanan = Math.min(b.tutar, Math.max(odenen, 0));
      odenen -= kapanan;
      sonuc.set(b.id, yuvarla(kapanan));
    }
    return sonuc;
  },
  // Bir daire ve dönem için aidat durumu: yok | odendi | kismi | borc
  aidatDurumu(daireId, donem, dagitim) {
    const t = this.durum.hareketler.filter(h => h.daireId === daireId && h.tur === 'tahakkuk' && h.altTur === 'aidat' && h.donem === donem);
    if (!t.length) return { durum: 'yok', tutar: 0, odenen: 0 };
    const tutar = t.reduce((s, h) => s + h.tutar, 0);
    const odenen = t.reduce((s, h) => s + (dagitim.get(h.id) || 0), 0);
    const durum = odenen >= tutar - 0.005 ? 'odendi' : odenen > 0 ? 'kismi' : 'borc';
    return { durum, tutar, odenen };
  },
  gecikmisBorc(daireId, bugun = bugunStr()) {
    const dg = this.dagitim(daireId);
    return yuvarla(this.durum.hareketler
      .filter(h => h.daireId === daireId && h.tur === 'tahakkuk' && h.tarih < bugun)
      .reduce((s, h) => s + h.tutar - (dg.get(h.id) || 0), 0));
  },
  kasaBakiyesi() {
    let b = Number(this.durum.ayarlar.acilisBakiyesi) || 0;
    for (const h of this.durum.hareketler) {
      if (h.tur === 'tahsilat' || h.tur === 'gelir') b += h.tutar;
      else if (h.tur === 'gider') b -= h.tutar;
    }
    return yuvarla(b);
  },
  aylikOzet(yil) {
    const aylar = Array.from({ length: 12 }, (_, i) => ({ ay: i + 1, gelir: 0, gider: 0, tahakkuk: 0 }));
    for (const h of this.durum.hareketler) {
      if (!h.tarih.startsWith(String(yil))) continue;
      const a = aylar[Number(h.tarih.slice(5, 7)) - 1];
      if (h.tur === 'tahsilat' || h.tur === 'gelir') a.gelir += h.tutar;
      else if (h.tur === 'gider') a.gider += h.tutar;
      else if (h.tur === 'tahakkuk') a.tahakkuk += h.tutar;
    }
    return aylar;
  },

  // --- Örnek veri ---
  async ornekVeriYukle() {
    const v = bosVeri();
    v.ayarlar = { ...v.ayarlar, ad: 'Lale Apartmanı', adres: 'Çiçek Sk. No 12, Bornova / İzmir', yonetici: 'Ahmet Yılmaz', telefon: '0532 000 00 00', iban: 'TR00 0000 0000 0000 0000 0000 00', varsayilanAidat: 750, acilisBakiyesi: 12500 };
    const isimler = [
      ['Ayşe Demir', ''], ['Mehmet Kaya', 'Selin Aksoy'], ['Fatma Şahin', ''], ['Ali Çelik', ''],
      ['Zeynep Arslan', 'Burak Koç'], ['Mustafa Öztürk', ''], ['Elif Aydın', ''], ['Hasan Yıldız', 'Deniz Kurt'],
      ['Emine Polat', ''], ['Hüseyin Erdoğan', ''], ['Hatice Güneş', ''], ['İbrahim Doğan', 'Ece Tekin']
    ];
    isimler.forEach(([malik, kiraci], i) => {
      v.daireler.push({
        id: kimlik(), blok: '', no: String(i + 1), kat: Math.floor(i / 3) + (i < 3 ? 0 : 0), malik, kiraci,
        telefon: '05' + (30 + i) + ' 000 00 ' + String(10 + i), m2: [95, 110, 95, 120][i % 4], kisi: (i % 4) + 1,
        aidat: i === 0 ? 600 : '', notlar: i === 0 ? 'Zemin kat, bahçe kullanımı' : ''
      });
    });
    v.daireler.forEach((d, i) => { d.kat = Math.floor(i / 3); });
    const eskiAyarlar = this.durum.ayarlar;
    this.durum.ayarlar = v.ayarlar; // aidat günü hesaplamada kullanılıyor
    const simdi = new Date();
    const buYil = simdi.getFullYear();
    const buAy = simdi.getMonth() + 1;
    for (let ay = 1; ay <= buAy; ay++) {
      const donem = `${buYil}-${String(ay).padStart(2, '0')}`;
      const tutarlar = {};
      v.daireler.forEach(d => { tutarlar[d.id] = this.daireAidati(d); });
      v.hareketler.push(...this.tahakkukHazirla(donem, tutarlar, 'Aidat', 'aidat', v.hareketler, v.daireler));
      v.daireler.forEach((d, i) => {
        const gec = (i === 3 && ay > buAy - 3) || (i === 7 && ay > buAy - 1) || (i === 10 && ay > buAy - 5);
        if (gec) return;
        const tutar = i === 5 && ay === buAy ? this.daireAidati(d) / 2 : this.daireAidati(d);
        v.hareketler.push({ id: kimlik(), tur: 'tahsilat', daireId: d.id, tarih: `${donem}-${String(3 + (i % 9)).padStart(2, '0')}`, tutar, yontem: ODEME_YONTEMLERI[i % 2], aciklama: 'Aidat ödemesi' });
      });
      const gider = (kat, tutar, gun, ac) => v.hareketler.push({ id: kimlik(), tur: 'gider', kategori: kat, tarih: `${donem}-${gun}`, tutar, aciklama: ac });
      gider('Elektrik', 900 + ((ay * 137) % 400), '05', 'Ortak alan elektriği');
      gider('Su', 350 + ((ay * 53) % 150), '07', 'Ortak su');
      gider('Temizlik', 2500, '15', 'Merdiven temizliği');
      gider('Asansör bakım', 1200, '20', 'Aylık asansör bakımı');
      if (ay <= 3 || ay >= 11) gider('Doğalgaz / Yakıt', 2200 + ay * 40, '12', 'Kalorifer');
      if (ay === 4) gider('Onarım / Tadilat', 4800, '18', 'Çatı oluk onarımı');
      if (ay === 1) gider('Sigorta', 3600, '09', 'Bina sigortası yıllık');
    }
    if (buAy >= 2) {
      const donem = `${buYil}-${String(buAy).padStart(2, '0')}`;
      const tutarlar = {}; v.daireler.forEach(d => { tutarlar[d.id] = 500; });
      v.hareketler.push(...this.tahakkukHazirla(donem, tutarlar, 'Dış cephe boya ek ödeneği (1/2)', 'ek', v.hareketler, v.daireler));
    }
    v.hareketler.push({ id: kimlik(), tur: 'gelir', kategori: 'Faiz / Getiri', tarih: `${buYil}-${String(buAy).padStart(2, '0')}-01`, tutar: 320, aciklama: 'Vadeli hesap getirisi' });
    const d = v.daireler;
    v.duyurular.push(
      { id: kimlik(), tarih: bugunStr(), baslik: 'Dış cephe boyası', metin: 'Genel kurulda alınan karar gereği dış cephe boyası için daire başı 1.000 ₺ ek ödenek iki taksitte toplanacaktır.', sabit: true },
      { id: kimlik(), tarih: gunEkle(bugunStr(), -6), baslik: 'Su kesintisi', metin: 'Perşembe 10:00-14:00 arası depo temizliği nedeniyle su kesilecektir.', sabit: false }
    );
    v.arizalar.push(
      { id: kimlik(), tarih: gunEkle(bugunStr(), -2), daireId: d[4].id, konu: 'Asansör 3. katta takılıyor', aciklama: 'Kapı bazen geç açılıyor.', oncelik: 'Yüksek', durum: 'Açık', maliyet: '' },
      { id: kimlik(), tarih: gunEkle(bugunStr(), -9), daireId: '', konu: 'Giriş kapısı otomatiği', aciklama: 'Kapı yavaş kapanıyor.', oncelik: 'Orta', durum: 'İşlemde', maliyet: '' },
      { id: kimlik(), tarih: gunEkle(bugunStr(), -20), daireId: d[1].id, konu: 'Merdiven lambası yanmıyor', aciklama: '2. kat sahanlık.', oncelik: 'Düşük', durum: 'Çözüldü', maliyet: 150 }
    );
    this.durum.ayarlar = eskiAyarlar;
    await this.icerikAl(v);
  }
};

// --- Yardımcılar ---
const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
function kimlik() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function yuvarla(n) { return Math.round(n * 100) / 100; }
function sayisal(s) { const n = parseFloat(s); return isNaN(n) ? Infinity : n; }
function bugunStr() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function buDonem() { return bugunStr().slice(0, 7); }
function gunEkle(s, n) { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
const paraBicim = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 2, minimumFractionDigits: 0 });
function para(n) { return paraBicim.format(n || 0); }
function tarihStr(s) { if (!s) return ''; const [y, a, g] = s.split('-'); return `${g}.${a}.${y}`; }
function donemStr(d) { return `${AYLAR[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`; }
