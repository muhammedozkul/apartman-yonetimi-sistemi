// Sayfalar: her biri #icerik'i çizer ve üst sağ düğmeleri ayarlar.

const S = { // sayfa durumları (filtreler vb.)
  yil: new Date().getFullYear(),
  daireAra: '',
  kasaTur: '', kasaAy: '', kasaKategori: '',
  arizaDurum: 'acik',
  raporYil: new Date().getFullYear(),
  ekstreDaire: null
};

const icerik = () => document.getElementById('icerik');
function ustDugmeler(html) { document.getElementById('ustSag').innerHTML = html; }

// Bir değişikliği veritabanına yazar, hata olursa söyler, sonra ekranı yeniden çizer.
async function yap(is, basariMetni) {
  try {
    await is();
    if (basariMetni) bildir(basariMetni);
  } catch (e) {
    console.error(e);
    bildir('Kaydedilemedi: ' + e.message);
    try { await Veri.yukle(); } catch { /* sunucu kapalı */ }
  }
  ciz();
}

function yillar() {
  const s = new Set([new Date().getFullYear()]);
  Veri.durum.hareketler.forEach(h => s.add(Number(h.tarih.slice(0, 4))));
  return [...s].sort((a, b) => b - a);
}

function bakiyeHtml(b) {
  if (b > 0.004) return `<span class="borc">${para(b)} borç</span>`;
  if (b < -0.004) return `<span class="alacak">${para(-b)} fazla</span>`;
  return '<span class="soluk">0 ₺</span>';
}

// ---------------- ÖZET ----------------
function sayfaPanel() {
  ustDugmeler(`<button class="dugme ikincil" onclick="odemeAl()">+ Ödeme al</button><button class="dugme" onclick="giderEkle()">+ Gider ekle</button>`);
  const v = Veri.durum;
  if (!v.daireler.length) {
    icerik().innerHTML = `<div class="kart bos">
      <h2 style="margin-top:0">Hoş geldin 👋</h2>
      <p>Başlamak için apartmanın dairelerini ekle ya da sistemi tanımak için örnek verilerle dene.</p>
      <p><button class="dugme" onclick="topluDaireEkle()">Daireleri oluştur</button>
      <button class="dugme ikincil" onclick="ornekYukle()">Örnek verilerle dene</button></p>
    </div>`;
    return;
  }
  const donem = buDonem();
  const yil = new Date().getFullYear();
  const kasa = Veri.kasaBakiyesi();
  const buAyTahakkuk = v.hareketler.filter(h => h.tur === 'tahakkuk' && h.donem === donem);
  let buAyToplam = 0, buAyOdenen = 0;
  const dagitimlar = new Map(v.daireler.map(d => [d.id, Veri.dagitim(d.id)]));
  buAyTahakkuk.forEach(h => { buAyToplam += h.tutar; buAyOdenen += dagitimlar.get(h.daireId)?.get(h.id) || 0; });
  const oran = buAyToplam ? Math.round(buAyOdenen / buAyToplam * 100) : 0;
  const bakiyeler = v.daireler.map(d => ({ d, b: Veri.daireBakiye(d.id), g: Veri.gecikmisBorc(d.id) }));
  const toplamAlacak = bakiyeler.reduce((t, x) => t + Math.max(x.b, 0), 0);
  const borclular = bakiyeler.filter(x => x.g > 0.004).sort((a, b) => b.g - a.g);
  const acikAriza = v.arizalar.filter(a => a.durum !== 'Çözüldü');
  const ozet = Veri.aylikOzet(yil);
  const yilGelir = ozet.reduce((t, a) => t + a.gelir, 0), yilGider = ozet.reduce((t, a) => t + a.gider, 0);

  const kategoriler = {};
  v.hareketler.filter(h => h.tur === 'gider' && h.tarih.startsWith(String(yil))).forEach(h => { kategoriler[h.kategori || 'Diğer'] = (kategoriler[h.kategori || 'Diğer'] || 0) + h.tutar; });
  const katListe = Object.entries(kategoriler).sort((a, b) => b[1] - a[1]);
  const katMax = katListe[0]?.[1] || 1;

  const duyurular = [...v.duyurular].sort((a, b) => (b.sabit - a.sabit) || b.tarih.localeCompare(a.tarih)).slice(0, 3);

  icerik().innerHTML = `
  <div class="izgara d4">
    <div class="kart sayi-kart"><div class="etiket">Kasa bakiyesi</div><div class="deger">${para(kasa)}</div><div class="alt">${yil}: ${para(yilGelir)} giriş · ${para(yilGider)} çıkış</div></div>
    <div class="kart sayi-kart"><div class="etiket">${AYLAR[new Date().getMonth()]} tahsilatı</div><div class="deger">%${oran}</div><div class="alt">${para(buAyOdenen)} / ${para(buAyToplam)}</div><div class="ilerleme"><i style="width:${oran}%"></i></div></div>
    <div class="kart sayi-kart"><div class="etiket">Gecikmiş alacak</div><div class="deger">${para(borclular.reduce((t, x) => t + x.g, 0))}</div><div class="alt">${borclular.length} daire geride · toplam açık ${para(toplamAlacak)}</div></div>
    <div class="kart sayi-kart"><div class="etiket">Açık arıza / talep</div><div class="deger">${acikAriza.length}</div><div class="alt">${acikAriza.filter(a => a.oncelik === 'Yüksek').length} yüksek öncelikli</div></div>
  </div>
  <div class="bosluk"></div>
  <div class="izgara d3-1">
    <div class="kart"><h3>${yil} aylık gelir ve gider <small>Tahsilat + diğer gelir / giderler</small></h3>${gelirGiderGrafigi(ozet)}</div>
    <div class="kart"><h3>Ödemesi geciken <a class="dugme ikincil kucuk" href="#raporlar">Tümü</a></h3>
      ${borclular.length ? borclular.slice(0, 6).map(x => `
        <div class="liste-oge"><div class="govde"><strong>${esc(Veri.daireAdi(x.d.id))} · ${esc(x.d.kiraci || x.d.malik)}</strong><span class="meta">${esc(x.d.telefon || 'telefon yok')}</span></div>
        <div><span class="borc">${para(x.g)}</span><br><button class="dugme kucuk" onclick="odemeAl('${x.d.id}')">Ödeme al</button></div></div>`).join('') : '<div class="bos">Geciken ödeme yok 🎉</div>'}
    </div>
  </div>
  <div class="bosluk"></div>
  <div class="izgara d2">
    <div class="kart"><h3>${yil} gider dağılımı <small>${para(yilGider)}</small></h3>
      ${katListe.length ? katListe.map(([k, t]) => `<div class="yatay-cubuk" title="${esc(k)}: ${para(t)}"><span>${esc(k)}</span><div class="iz"><i style="width:${Math.max(t / katMax * 100, 1)}%"></i></div><span class="sag" style="text-align:right">${para(t)}</span></div>`).join('') : '<div class="bos">Bu yıl gider yok</div>'}
    </div>
    <div class="kart"><h3>Duyurular ve arızalar <a class="dugme ikincil kucuk" href="#duyurular">Duyurular</a></h3>
      ${duyurular.map(d => `<div class="liste-oge"><span>${d.sabit ? '📌' : '📢'}</span><div class="govde"><strong>${esc(d.baslik)}</strong><span class="meta">${tarihStr(d.tarih)}</span></div></div>`).join('')}
      ${acikAriza.slice(0, 4).map(a => `<div class="liste-oge"><span>🔧</span><div class="govde"><strong>${esc(a.konu)}</strong><span class="meta">${a.daireId ? esc(Veri.daireAdi(a.daireId)) + ' · ' : ''}${tarihStr(a.tarih)}</span></div>${oncelikRozet(a.oncelik)}</div>`).join('')}
      ${!duyurular.length && !acikAriza.length ? '<div class="bos">Kayıt yok</div>' : ''}
    </div>
  </div>`;
  grafikEtkilesim();
}

// Üstü yuvarlak, tabana oturan çubuk
function cubukYolu(x, y, g, h, r = 4) {
  if (h <= 0) return '';
  r = Math.min(r, g / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + g - r}Q${x + g},${y} ${x + g},${y + r}V${y + h}Z`;
}

function gelirGiderGrafigi(ozet) {
  const G = 640, Y = 230, sol = 54, alt = 26, ust = 10;
  const enBuyuk = Math.max(1, ...ozet.map(a => Math.max(a.gelir, a.gider)));
  const adim = guzelAdim(enBuyuk / 4);
  const tepe = Math.ceil(enBuyuk / adim) * adim;
  const yy = n => ust + (Y - ust - alt) * (1 - n / tepe);
  const genislik = (G - sol) / 12;
  const cg = Math.min(16, genislik / 3);
  let svg = '';
  for (let t = 0; t <= tepe + 0.1; t += adim) {
    svg += `<line x1="${sol}" x2="${G}" y1="${yy(t)}" y2="${yy(t)}" style="stroke:var(--cizgi)" stroke-width="1"/>`;
    svg += `<text x="${sol - 8}" y="${yy(t) + 4}" text-anchor="end" font-size="11" style="fill:var(--soluk)">${kisaPara(t)}</text>`;
  }
  ozet.forEach((a, i) => {
    const mx = sol + genislik * i + genislik / 2;
    svg += `<path d="${cubukYolu(mx - cg - 1, yy(a.gelir), cg, yy(0) - yy(a.gelir))}" style="fill:var(--gelir)"/>`;
    svg += `<path d="${cubukYolu(mx + 1, yy(a.gider), cg, yy(0) - yy(a.gider))}" style="fill:var(--gider)"/>`;
    svg += `<text x="${mx}" y="${Y - 8}" text-anchor="middle" font-size="11" style="fill:var(--soluk)">${AYLAR[i].slice(0, 3)}</text>`;
    svg += `<rect class="vurgu-alan" data-i="${i}" x="${sol + genislik * i}" y="${ust}" width="${genislik}" height="${Y - ust - alt}" fill="transparent"/>`;
  });
  svg += `<line x1="${sol}" x2="${G}" y1="${yy(0)}" y2="${yy(0)}" style="stroke:var(--soluk)" stroke-width="1"/>`;
  window._grafikVeri = ozet;
  return `<div class="grafik"><svg viewBox="0 0 ${G} ${Y}" role="img" aria-label="Aylık gelir ve gider grafiği">${svg}</svg><div class="ipucu"></div></div>
    <div class="lejant"><span><i style="background:var(--gelir)"></i>Gelir</span><span><i style="background:var(--gider)"></i>Gider</span></div>`;
}
function grafikEtkilesim() {
  document.querySelectorAll('.grafik').forEach(kap => {
    const ip = kap.querySelector('.ipucu');
    const svg = kap.querySelector('svg');
    kap.querySelectorAll('.vurgu-alan').forEach(r => {
      r.addEventListener('mouseenter', () => {
        const a = window._grafikVeri[r.dataset.i];
        r.setAttribute('fill', 'color-mix(in srgb, var(--soluk) 10%, transparent)');
        r.style.fill = 'color-mix(in srgb, var(--soluk) 10%, transparent)';
        ip.innerHTML = `<b>${AYLAR[r.dataset.i]}</b><br>Gelir: ${para(a.gelir)}<br>Gider: ${para(a.gider)}<br>Fark: ${para(a.gelir - a.gider)}`;
        const k = svg.getBoundingClientRect(), b = r.getBoundingClientRect();
        ip.style.left = Math.min(Math.max(b.left - k.left + b.width / 2, 70), k.width - 70) + 'px';
        ip.style.top = '40px';
        ip.style.opacity = 1;
      });
      r.addEventListener('mouseleave', () => { r.style.fill = 'transparent'; ip.style.opacity = 0; });
    });
  });
}
function guzelAdim(n) {
  const us = Math.pow(10, Math.floor(Math.log10(n || 1)));
  const k = n / us;
  return (k <= 1 ? 1 : k <= 2 ? 2 : k <= 5 ? 5 : 10) * us;
}
function kisaPara(n) { return n >= 1000 ? (n / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 1 }) + ' B' : String(n); }

// ---------------- DAİRELER ----------------
function sayfaDaireler() {
  if (S.ekstreDaire && Veri.daire(S.ekstreDaire)) return sayfaEkstre(S.ekstreDaire);
  ustDugmeler(`<button class="dugme ikincil" onclick="topluDaireEkle()">Toplu oluştur</button><button class="dugme" onclick="daireFormu()">+ Daire ekle</button>`);
  const ara = S.daireAra.toLocaleLowerCase('tr');
  const liste = Veri.siraliDaireler().filter(d => !ara || [d.no, d.blok, d.malik, d.kiraci, d.telefon].join(' ').toLocaleLowerCase('tr').includes(ara));
  const toplamBorc = Veri.durum.daireler.reduce((t, d) => t + Math.max(Veri.daireBakiye(d.id), 0), 0);
  icerik().innerHTML = `
  <div class="arac-cubugu">
    <input class="ara" type="search" placeholder="Daire, isim ya da telefon ara…" value="${esc(S.daireAra)}" oninput="S.daireAra=this.value; aramaCiz()">
    <span class="soluk">${Veri.durum.daireler.length} daire · açık bakiye ${para(toplamBorc)}</span>
  </div>
  <div class="kart tablo-kap"><table>
    <thead><tr><th>Daire</th><th>Kat</th><th>Kat maliki</th><th>Oturan (kiracı)</th><th>Telefon</th><th class="sag">Aidat</th><th class="sag">Bakiye</th><th></th></tr></thead>
    <tbody>${liste.map(d => `<tr>
      <td><a href="#" onclick="S.ekstreDaire='${d.id}'; ciz(); return false"><strong>${esc(Veri.daireAdi(d.id))}</strong></a></td>
      <td>${d.kat === '' || d.kat == null ? '' : esc(d.kat)}</td>
      <td>${esc(d.malik)}</td>
      <td>${d.kiraci ? esc(d.kiraci) : '<span class="soluk">Malik oturuyor</span>'}</td>
      <td>${esc(d.telefon)}</td>
      <td class="sag">${para(Veri.daireAidati(d))}${d.aidat !== '' && d.aidat != null ? ' <span class="rozet notr" title="Bu daireye özel aidat">özel</span>' : ''}</td>
      <td class="sag">${bakiyeHtml(Veri.daireBakiye(d.id))}</td>
      <td class="sag" style="white-space:nowrap">
        <button class="ikon-dugme" title="Ödeme al" onclick="odemeAl('${d.id}')">💳</button>
        <button class="ikon-dugme" title="Hesap ekstresi" onclick="S.ekstreDaire='${d.id}'; ciz()">📄</button>
        <button class="ikon-dugme" title="Düzenle" onclick="daireFormu('${d.id}')">✏️</button>
        <button class="ikon-dugme" title="Sil" onclick="daireSil('${d.id}')">🗑️</button>
      </td></tr>`).join('') || `<tr><td colspan="8" class="bos">${Veri.durum.daireler.length ? 'Aramaya uyan daire yok' : 'Henüz daire yok. “Toplu oluştur” ile hepsini bir kerede ekleyebilirsin.'}</td></tr>`}
    </tbody></table></div>`;
}
let aramaZamanlayici;
function aramaCiz() {
  clearTimeout(aramaZamanlayici);
  aramaZamanlayici = setTimeout(() => {
    const el = document.activeElement, pos = el && el.selectionStart;
    ciz();
    const yeni = document.querySelector('.arac-cubugu .ara');
    if (yeni) { yeni.focus(); try { yeni.setSelectionRange(pos, pos); } catch { } }
  }, 150);
}

async function daireFormu(id) {
  const d = id ? Veri.daire(id) : {};
  const s = await formAc({
    baslik: id ? `${Veri.daireAdi(id)} düzenle` : 'Yeni daire',
    alanlar: [
      { ad: 'blok', etiket: 'Blok', deger: d.blok, yerTutucu: 'Tek bloksa boş bırak' },
      { ad: 'no', etiket: 'Daire no', deger: d.no, zorunlu: true },
      { ad: 'kat', etiket: 'Kat', tur: 'number', adim: 1, deger: d.kat },
      { ad: 'm2', etiket: 'Brüt m²', tur: 'number', deger: d.m2 },
      { ad: 'malik', etiket: 'Kat maliki', deger: d.malik, zorunlu: true },
      { ad: 'kiraci', etiket: 'Kiracı', deger: d.kiraci, yerTutucu: 'Malik oturuyorsa boş' },
      { ad: 'telefon', etiket: 'Telefon (oturan)', tur: 'tel', deger: d.telefon },
      { ad: 'kisi', etiket: 'Kişi sayısı', tur: 'number', adim: 1, min: 0, deger: d.kisi },
      { ad: 'aidat', etiket: 'Özel aidat (₺)', tur: 'number', min: 0, deger: d.aidat, ipucu: `Boşsa varsayılan: ${para(Veri.durum.ayarlar.varsayilanAidat)}` },
      { ad: 'notlar', etiket: 'Not', deger: d.notlar }
    ]
  });
  if (!s) return;
  yap(() => id ? Veri.guncelle('daireler', id, s) : Veri.ekle('daireler', s), id ? 'Daire güncellendi' : 'Daire eklendi');
}

async function daireSil(id) {
  const sayi = Veri.durum.hareketler.filter(h => h.daireId === id).length;
  if (!await onayla('Daire silinsin mi?', `${Veri.daireAdi(id)} ve ona ait ${sayi} borç/ödeme kaydı kalıcı olarak silinecek. Bu geri alınamaz (günlük yedekler hariç).`)) return;
  if (S.ekstreDaire === id) S.ekstreDaire = null;
  yap(() => Veri.sil('daireler', id), 'Daire silindi');
}

async function topluDaireEkle() {
  const s = await formAc({
    baslik: 'Daireleri toplu oluştur',
    ekHtml: '<p class="soluk" style="margin-top:0">Daireler 1’den başlayarak numaralanır. İsimleri sonra tek tek düzenlersin.</p>',
    alanlar: [
      { ad: 'blok', etiket: 'Blok adı', yerTutucu: 'Örn. A (boş olabilir)' },
      { ad: 'katSayisi', etiket: 'Kat sayısı (zemin dahil)', tur: 'number', adim: 1, min: 1, deger: 5, zorunlu: true },
      { ad: 'katBasi', etiket: 'Kat başına daire', tur: 'number', adim: 1, min: 1, deger: 2, zorunlu: true },
      { ad: 'baslangic', etiket: 'İlk daire no', tur: 'number', adim: 1, min: 0, deger: 1, zorunlu: true }
    ]
  });
  if (!s) return;
  const yeni = [];
  let no = s.baslangic;
  for (let k = 0; k < s.katSayisi; k++) for (let j = 0; j < s.katBasi; j++) {
    yeni.push({ blok: s.blok, no: String(no++), kat: k, malik: '', kiraci: '', telefon: '', m2: '', kisi: '', aidat: '', notlar: '' });
  }
  yap(() => Veri.topluEkle('daireler', yeni), `${yeni.length} daire oluşturuldu`);
}

function sayfaEkstre(id) {
  const d = Veri.daire(id);
  ustDugmeler(`<button class="dugme ikincil" onclick="S.ekstreDaire=null; ciz()">← Daireler</button>
    <button class="dugme ikincil" onclick="window.print()">Yazdır</button>
    <button class="dugme ikincil" onclick="borcEkle('${id}')">+ Borç ekle</button>
    <button class="dugme" onclick="odemeAl('${id}')">+ Ödeme al</button>`);
  let bakiye = 0;
  const satirlar = Veri.daireHareketleri(id).map(h => {
    bakiye += h.tur === 'tahakkuk' ? h.tutar : -h.tutar;
    return `<tr><td>${tarihStr(h.tarih)}</td><td>${esc(h.aciklama || (h.tur === 'tahsilat' ? 'Ödeme' : 'Borç'))}${h.yontem ? ` <span class="soluk">· ${esc(h.yontem)}</span>` : ''}</td>
      <td class="sag">${h.tur === 'tahakkuk' ? para(h.tutar) : ''}</td><td class="sag">${h.tur === 'tahsilat' ? para(h.tutar) : ''}</td>
      <td class="sag">${bakiyeHtml(bakiye)}</td>
      <td class="sag yazdirma-gizle"><button class="ikon-dugme" title="Kaydı sil" onclick="hareketSil('${h.id}')">🗑️</button></td></tr>`;
  });
  const a = Veri.durum.ayarlar;
  icerik().innerHTML = `<div class="kart">
    <div class="yazdir-baslik"><h2 style="margin:0">${esc(a.ad)}</h2><div>${esc(a.adres)}</div><hr></div>
    <div class="ekstre-baslik"><div><h2 style="margin:0">${esc(Veri.daireAdi(id))} hesap ekstresi</h2>
      <div class="soluk">Malik: ${esc(d.malik || '—')}${d.kiraci ? ' · Kiracı: ' + esc(d.kiraci) : ''}${d.telefon ? ' · ' + esc(d.telefon) : ''}</div></div>
      <div style="text-align:right"><div class="soluk">Güncel bakiye</div><div style="font-size:22px">${bakiyeHtml(Veri.daireBakiye(id))}</div><div class="soluk">${tarihStr(bugunStr())}</div></div></div>
    <div class="tablo-kap"><table><thead><tr><th>Tarih</th><th>Açıklama</th><th class="sag">Borç</th><th class="sag">Ödeme</th><th class="sag">Bakiye</th><th class="yazdirma-gizle"></th></tr></thead>
    <tbody>${satirlar.join('') || '<tr><td colspan="6" class="bos">Bu dairenin hareketi yok</td></tr>'}</tbody></table></div>
    ${a.iban ? `<p class="soluk">Ödeme için IBAN: <strong>${esc(a.iban)}</strong>${a.yonetici ? ' · Yönetici: ' + esc(a.yonetici) : ''}</p>` : ''}
  </div>`;
}

async function hareketSil(id) {
  const h = Veri.durum.hareketler.find(x => x.id === id);
  if (!h) return;
  if (!await onayla('Kayıt silinsin mi?', `${tarihStr(h.tarih)} · ${h.aciklama || h.kategori || h.tur} · ${para(h.tutar)}`)) return;
  yap(() => Veri.sil('hareketler', id), 'Kayıt silindi');
}

// ---------------- AİDAT ----------------
function sayfaAidat() {
  ustDugmeler(`<button class="dugme ikincil" onclick="ekOdenek()">+ Ek ödenek</button><button class="dugme ikincil" onclick="aidatBorclandir()">Aidat borçlandır</button><button class="dugme" onclick="odemeAl()">+ Ödeme al</button>`);
  const daireler = Veri.siraliDaireler();
  const yil = S.yil;
  const donemler = AYLAR.map((_, i) => `${yil}-${String(i + 1).padStart(2, '0')}`);
  const aylikTop = donemler.map(() => ({ t: 0, o: 0 }));
  const satirlar = daireler.map(d => {
    const dg = Veri.dagitim(d.id);
    const hucreler = donemler.map((dn, i) => {
      const a = Veri.aidatDurumu(d.id, dn, dg);
      aylikTop[i].t += a.tutar; aylikTop[i].o += a.odenen;
      const isaret = { odendi: '✓', kismi: '½', borc: '!', yok: '·' }[a.durum];
      const baslik = a.durum === 'yok' ? 'Borç yok' : `${donemStr(dn)}: ${para(a.odenen)} / ${para(a.tutar)} ödendi`;
      const tik = a.durum === 'borc' || a.durum === 'kismi' ? `onclick="odemeAl('${d.id}', ${yuvarla(a.tutar - a.odenen)})"` : '';
      return `<td><button class="hucre ${a.durum}" title="${esc(baslik)}" aria-label="${esc(Veri.daireAdi(d.id) + ' ' + baslik)}" ${tik}>${isaret}</button></td>`;
    }).join('');
    return `<tr><td><strong>${esc(Veri.daireAdi(d.id))}</strong> <span class="soluk">${esc(d.kiraci || d.malik)}</span></td>${hucreler}<td class="sag">${bakiyeHtml(Veri.daireBakiye(d.id))}</td></tr>`;
  }).join('');
  icerik().innerHTML = `
  <div class="arac-cubugu">
    <select onchange="S.yil=Number(this.value); ciz()">${yillar().map(y => `<option ${y === yil ? 'selected' : ''}>${y}</option>`).join('')}</select>
    <span class="soluk">Hücreye tıklayınca kalan tutar için ödeme alırsın. Ödemeler en eski borçtan başlayarak kapanır. Ek ödenekler tabloda değil, bakiyede görünür.</span>
  </div>
  <div class="kart tablo-kap"><table class="matris">
    <thead><tr><th>Daire</th>${AYLAR.map(a => `<th>${a.slice(0, 3)}</th>`).join('')}<th class="sag">Bakiye</th></tr></thead>
    <tbody>${satirlar || '<tr><td colspan="14" class="bos">Önce daire ekle</td></tr>'}</tbody>
    <tfoot><tr><td class="soluk">Tahsil oranı</td>${aylikTop.map(x => `<td class="soluk" style="font-size:12px">${x.t ? '%' + Math.round(x.o / x.t * 100) : ''}</td>`).join('')}<td></td></tr></tfoot>
  </table>
  <div class="lejant"><span><i style="background:var(--iyi-zemin);outline:1px solid var(--iyi)"></i>✓ Ödendi</span><span><i style="background:var(--uyari-zemin);outline:1px solid var(--uyari)"></i>½ Kısmi</span><span><i style="background:var(--kotu-zemin);outline:1px solid var(--kotu)"></i>! Ödenmedi</span><span>· Borçlandırılmadı</span></div>
  </div>`;
}

async function aidatBorclandir() {
  if (!Veri.durum.daireler.length) return bildir('Önce daire ekle');
  const a = Veri.durum.ayarlar;
  const s = await formAc({
    baslik: 'Aidat borçlandır',
    ekHtml: '<p class="soluk" style="margin-top:0">Seçilen ay için her daireye aidat borcu yazılır. O ay zaten aidatı olan daire atlanır.</p>',
    alanlar: [
      { ad: 'donem', etiket: 'Ay', tur: 'month', deger: buDonem(), zorunlu: true },
      { ad: 'aySayisi', etiket: 'Kaç ay', tur: 'number', adim: 1, min: 1, deger: 1, ipucu: 'Örn. 12 yazarsan seçilen aydan itibaren bir yıllık' },
      { ad: 'yontem', etiket: 'Tutar', tur: 'select', tam: true, deger: 'daire', secenekler: [['daire', `Daireye göre (özel aidat, yoksa ${para(a.varsayilanAidat)})`], ['sabit', 'Herkese aynı tutar'], ['m2', 'm² başına tutar'], ['kisi', 'Kişi başına tutar']] },
      { ad: 'tutar', etiket: 'Birim tutar (₺)', tur: 'number', min: 0, deger: a.varsayilanAidat, ipucu: '“Daireye göre” seçiliyse kullanılmaz' }
    ]
  });
  if (!s) return;
  const tutarlar = {};
  for (const d of Veri.durum.daireler) {
    tutarlar[d.id] = s.yontem === 'daire' ? Veri.daireAidati(d)
      : s.yontem === 'sabit' ? s.tutar
      : s.yontem === 'm2' ? (Number(d.m2) || 0) * s.tutar
      : (Number(d.kisi) || 0) * s.tutar;
  }
  yap(async () => {
    let toplam = 0;
    let [y, m] = s.donem.split('-').map(Number);
    for (let i = 0; i < Math.max(1, s.aySayisi || 1); i++) {
      toplam += await Veri.tahakkukOlustur(`${y}-${String(m).padStart(2, '0')}`, tutarlar);
      m++; if (m > 12) { m = 1; y++; }
    }
    bildir(toplam ? `${toplam} aidat borcu yazıldı` : 'Yeni borç yazılmadı (zaten borçlandırılmış)');
  });
}

async function ekOdenek() {
  if (!Veri.durum.daireler.length) return bildir('Önce daire ekle');
  const s = await formAc({
    baslik: 'Ek ödenek / özel toplama',
    ekHtml: '<p class="soluk" style="margin-top:0">Boya, tadilat, yakıt farkı gibi aidat dışı toplamalar için her daireye borç yazar.</p>',
    alanlar: [
      { ad: 'aciklama', etiket: 'Açıklama', zorunlu: true, tam: true, yerTutucu: 'Örn. Dış cephe boyası 1. taksit' },
      { ad: 'donem', etiket: 'Ay', tur: 'month', deger: buDonem(), zorunlu: true },
      { ad: 'yontem', etiket: 'Dağıtım', tur: 'select', deger: 'sabit', secenekler: [['sabit', 'Daire başı eşit'], ['toplam-esit', 'Toplamı eşit böl'], ['toplam-m2', 'Toplamı m²’ye göre böl']] },
      { ad: 'tutar', etiket: 'Tutar (₺)', tur: 'number', min: 0, zorunlu: true, tam: true, ipucu: 'Daire başı ya da toplam, seçime göre' }
    ]
  });
  if (!s) return;
  const dl = Veri.durum.daireler;
  const toplamM2 = dl.reduce((t, d) => t + (Number(d.m2) || 0), 0);
  if (s.yontem === 'toplam-m2' && !toplamM2) return bildir('Dairelerin m² bilgisi girilmemiş');
  const tutarlar = {};
  dl.forEach(d => {
    tutarlar[d.id] = s.yontem === 'sabit' ? s.tutar : s.yontem === 'toplam-esit' ? s.tutar / dl.length : s.tutar * (Number(d.m2) || 0) / toplamM2;
  });
  yap(async () => { const n = await Veri.tahakkukOlustur(s.donem, tutarlar, s.aciklama, 'ek'); bildir(`${n} daireye borç yazıldı`); });
}

async function borcEkle(daireId) {
  const s = await formAc({
    baslik: `${Veri.daireAdi(daireId)} · borç ekle`,
    alanlar: [
      { ad: 'aciklama', etiket: 'Açıklama', zorunlu: true, tam: true, yerTutucu: 'Örn. Gecikme tazminatı, devir borcu' },
      { ad: 'tarih', etiket: 'Tarih', tur: 'date', deger: bugunStr(), zorunlu: true },
      { ad: 'tutar', etiket: 'Tutar (₺)', tur: 'number', min: 0.01, zorunlu: true }
    ]
  });
  if (!s) return;
  yap(() => Veri.ekle('hareketler', { tur: 'tahakkuk', altTur: 'ek', daireId, donem: s.tarih.slice(0, 7), tarih: s.tarih, tutar: s.tutar, aciklama: s.aciklama, kategori: '', yontem: '' }), 'Borç eklendi');
}

async function odemeAl(daireId = '', tutar) {
  if (!Veri.durum.daireler.length) return bildir('Önce daire ekle');
  const ilk = daireId || Veri.siraliDaireler()[0].id;
  const s = await formAc({
    baslik: 'Ödeme al',
    alanlar: [
      { ad: 'daireId', etiket: 'Daire', tur: 'select', tam: true, secenekler: daireSecenekleri(), deger: ilk, zorunlu: true },
      { ad: 'tutar', etiket: 'Tutar (₺)', tur: 'number', min: 0.01, deger: tutar ?? (Math.max(Veri.daireBakiye(ilk), 0) || ''), zorunlu: true },
      { ad: 'tarih', etiket: 'Tarih', tur: 'date', deger: bugunStr(), zorunlu: true },
      { ad: 'yontem', etiket: 'Ödeme yolu', tur: 'select', secenekler: ODEME_YONTEMLERI, deger: 'Havale / EFT' },
      { ad: 'aciklama', etiket: 'Açıklama', deger: 'Aidat ödemesi' }
    ],
    ekHtml: '<p class="soluk" id="odemeBakiye" style="margin-top:0"></p>',
    degisince: (v, form) => {
      const b = Veri.daireBakiye(v.daireId);
      document.getElementById('odemeBakiye').innerHTML = `Seçili dairenin bakiyesi: ${bakiyeHtml(b)}`;
      if (form.dataset.sonDaire && form.dataset.sonDaire !== v.daireId) form.elements.tutar.value = Math.max(b, 0) || '';
      form.dataset.sonDaire = v.daireId;
    }
  });
  document.getElementById('pencereForm').dataset.sonDaire = '';
  if (!s) return;
  yap(() => Veri.ekle('hareketler', { tur: 'tahsilat', altTur: '', daireId: s.daireId, donem: '', tarih: s.tarih, tutar: s.tutar, yontem: s.yontem, kategori: '', aciklama: s.aciklama }), `${para(s.tutar)} ödeme kaydedildi`);
}

// ---------------- KASA ----------------
function sayfaKasa() {
  ustDugmeler(`<button class="dugme ikincil" onclick="kasaCsv()">CSV indir</button><button class="dugme ikincil" onclick="gelirEkle()">+ Gelir</button><button class="dugme" onclick="giderEkle()">+ Gider</button>`);
  const tum = Veri.durum.hareketler.filter(h => h.tur !== 'tahakkuk');
  const aylar = [...new Set(tum.map(h => h.tarih.slice(0, 7)))].sort().reverse();
  const kategoriler = [...new Set(tum.map(h => h.kategori).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'));
  const liste = kasaListesi();
  const giris = liste.filter(h => h.tur !== 'gider').reduce((t, h) => t + h.tutar, 0);
  const cikis = liste.filter(h => h.tur === 'gider').reduce((t, h) => t + h.tutar, 0);
  icerik().innerHTML = `
  <div class="izgara d4">
    <div class="kart sayi-kart"><div class="etiket">Kasa bakiyesi</div><div class="deger">${para(Veri.kasaBakiyesi())}</div><div class="alt">Açılış: ${para(Veri.durum.ayarlar.acilisBakiyesi)}</div></div>
    <div class="kart sayi-kart"><div class="etiket">Giriş (filtre)</div><div class="deger" style="color:var(--iyi)">${para(giris)}</div></div>
    <div class="kart sayi-kart"><div class="etiket">Çıkış (filtre)</div><div class="deger" style="color:var(--kotu)">${para(cikis)}</div></div>
    <div class="kart sayi-kart"><div class="etiket">Fark (filtre)</div><div class="deger">${para(giris - cikis)}</div><div class="alt">${liste.length} kayıt</div></div>
  </div><div class="bosluk"></div>
  <div class="arac-cubugu">
    <select onchange="S.kasaTur=this.value; ciz()"><option value="">Tüm hareketler</option>${[['tahsilat', 'Aidat tahsilatları'], ['gelir', 'Diğer gelirler'], ['gider', 'Giderler']].map(([v, e]) => `<option value="${v}" ${S.kasaTur === v ? 'selected' : ''}>${e}</option>`).join('')}</select>
    <select onchange="S.kasaAy=this.value; ciz()"><option value="">Tüm aylar</option>${aylar.map(a => `<option value="${a}" ${S.kasaAy === a ? 'selected' : ''}>${donemStr(a)}</option>`).join('')}</select>
    <select onchange="S.kasaKategori=this.value; ciz()"><option value="">Tüm kategoriler</option>${kategoriler.map(k => `<option ${S.kasaKategori === k ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select>
  </div>
  <div class="kart tablo-kap"><table>
    <thead><tr><th>Tarih</th><th>Tür</th><th>Kategori / Daire</th><th>Açıklama</th><th class="sag">Tutar</th><th></th></tr></thead>
    <tbody>${liste.slice(0, 500).map(h => `<tr>
      <td>${tarihStr(h.tarih)}</td>
      <td>${h.tur === 'gider' ? '<span class="rozet kotu">Gider</span>' : h.tur === 'gelir' ? '<span class="rozet iyi">Gelir</span>' : '<span class="rozet notr">Aidat</span>'}</td>
      <td>${h.tur === 'tahsilat' ? esc(Veri.daireAdi(h.daireId)) : esc(h.kategori)}</td>
      <td>${esc(h.aciklama)}${h.yontem ? ` <span class="soluk">· ${esc(h.yontem)}</span>` : ''}</td>
      <td class="sag ${h.tur === 'gider' ? 'borc' : 'alacak'}">${h.tur === 'gider' ? '−' : '+'}${para(h.tutar)}</td>
      <td class="sag" style="white-space:nowrap">${h.tur !== 'tahsilat' ? `<button class="ikon-dugme" title="Düzenle" onclick="${h.tur === 'gider' ? 'giderEkle' : 'gelirEkle'}('${h.id}')">✏️</button>` : ''}<button class="ikon-dugme" title="Sil" onclick="hareketSil('${h.id}')">🗑️</button></td>
    </tr>`).join('') || '<tr><td colspan="6" class="bos">Kayıt yok</td></tr>'}</tbody>
  </table>${liste.length > 500 ? '<p class="soluk">İlk 500 kayıt gösteriliyor; filtreyi daralt.</p>' : ''}</div>`;
}
function kasaListesi() {
  return Veri.durum.hareketler.filter(h => h.tur !== 'tahakkuk'
    && (!S.kasaTur || h.tur === S.kasaTur)
    && (!S.kasaAy || h.tarih.startsWith(S.kasaAy))
    && (!S.kasaKategori || h.kategori === S.kasaKategori))
    .sort((a, b) => b.tarih.localeCompare(a.tarih));
}
function kasaCsv() {
  const s = [['Tarih', 'Tür', 'Kategori/Daire', 'Açıklama', 'Ödeme yolu', 'Tutar']];
  kasaListesi().forEach(h => s.push([tarihStr(h.tarih), h.tur, h.tur === 'tahsilat' ? Veri.daireAdi(h.daireId) : h.kategori, h.aciklama, h.yontem, (h.tur === 'gider' ? -h.tutar : h.tutar).toString().replace('.', ',')]));
  dosyaIndir(`kasa-${bugunStr()}.csv`, csvYap(s), 'text/csv');
}
async function giderEkle(id) { return gelirGiderFormu('gider', id); }
async function gelirEkle(id) { return gelirGiderFormu('gelir', id); }
async function gelirGiderFormu(tur, id) {
  const h = id ? Veri.durum.hareketler.find(x => x.id === id) : {};
  const kat = tur === 'gider' ? GIDER_KATEGORILERI : GELIR_KATEGORILERI;
  const s = await formAc({
    baslik: (id ? 'Düzenle: ' : 'Yeni ') + (tur === 'gider' ? 'gider' : 'gelir'),
    alanlar: [
      { ad: 'kategori', etiket: 'Kategori', tur: 'select', secenekler: kat.includes(h.kategori) || !h.kategori ? kat : [h.kategori, ...kat], deger: h.kategori || kat[0] },
      { ad: 'tarih', etiket: 'Tarih', tur: 'date', deger: h.tarih || bugunStr(), zorunlu: true },
      { ad: 'tutar', etiket: 'Tutar (₺)', tur: 'number', min: 0.01, deger: h.tutar, zorunlu: true },
      { ad: 'yontem', etiket: 'Ödeme yolu', tur: 'select', secenekler: ODEME_YONTEMLERI, deger: h.yontem || 'Havale / EFT' },
      { ad: 'aciklama', etiket: 'Açıklama', tam: true, deger: h.aciklama, yerTutucu: 'Örn. Ekim elektrik faturası' }
    ]
  });
  if (!s) return;
  yap(() => id ? Veri.guncelle('hareketler', id, s) : Veri.ekle('hareketler', { tur, altTur: '', daireId: '', donem: '', ...s }), tur === 'gider' ? 'Gider kaydedildi' : 'Gelir kaydedildi');
}

// ---------------- DUYURULAR ----------------
function sayfaDuyurular() {
  ustDugmeler(`<button class="dugme" onclick="duyuruFormu()">+ Duyuru</button>`);
  const liste = [...Veri.durum.duyurular].sort((a, b) => (b.sabit - a.sabit) || b.tarih.localeCompare(a.tarih));
  icerik().innerHTML = liste.length ? `<div class="izgara">${liste.map(d => `
    <div class="kart duyuru ${d.sabit ? 'sabit' : ''}">
      <h3><span>${d.sabit ? '📌 ' : ''}${esc(d.baslik)}</span><small>${tarihStr(d.tarih)}</small></h3>
      <p style="white-space:pre-wrap;margin:0 0 12px">${esc(d.metin)}</p>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <a class="dugme ikincil kucuk" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(duyuruMetni(d))}">WhatsApp’ta paylaş</a>
        <button class="dugme ikincil kucuk" onclick="duyuruKopyala('${d.id}')">Kopyala</button>
        <button class="dugme ikincil kucuk" onclick="yap(() => Veri.guncelle('duyurular','${d.id}',{sabit:${!d.sabit}}))">${d.sabit ? 'Sabitlemeyi kaldır' : 'Sabitle'}</button>
        <button class="dugme ikincil kucuk" onclick="duyuruFormu('${d.id}')">Düzenle</button>
        <button class="dugme ikincil kucuk" onclick="duyuruSil('${d.id}')">Sil</button>
      </div></div>`).join('')}</div>` : '<div class="kart bos">Henüz duyuru yok</div>';
}
function duyuruMetni(d) { return `📢 ${Veri.durum.ayarlar.ad}\n*${d.baslik}*\n\n${d.metin}\n\n${Veri.durum.ayarlar.yonetici ? '— ' + Veri.durum.ayarlar.yonetici + ', Yönetim' : 'Yönetim'}`; }
function duyuruKopyala(id) {
  const d = Veri.durum.duyurular.find(x => x.id === id);
  navigator.clipboard.writeText(duyuruMetni(d)).then(() => bildir('Duyuru kopyalandı'), () => bildir('Kopyalanamadı'));
}
async function duyuruFormu(id) {
  const d = id ? Veri.durum.duyurular.find(x => x.id === id) : {};
  const s = await formAc({
    baslik: id ? 'Duyuruyu düzenle' : 'Yeni duyuru',
    alanlar: [
      { ad: 'baslik', etiket: 'Başlık', zorunlu: true, tam: true, deger: d.baslik },
      { ad: 'metin', etiket: 'Metin', tur: 'textarea', tam: true, deger: d.metin },
      { ad: 'tarih', etiket: 'Tarih', tur: 'date', deger: d.tarih || bugunStr(), zorunlu: true },
      { ad: 'sabit', etiket: 'En üstte sabitle', tur: 'checkbox', deger: d.sabit }
    ]
  });
  if (!s) return;
  yap(() => id ? Veri.guncelle('duyurular', id, s) : Veri.ekle('duyurular', s), 'Duyuru kaydedildi');
}
async function duyuruSil(id) {
  if (!await onayla('Duyuru silinsin mi?', Veri.durum.duyurular.find(x => x.id === id)?.baslik)) return;
  yap(() => Veri.sil('duyurular', id), 'Duyuru silindi');
}

// ---------------- ARIZALAR ----------------
const ARIZA_DURUMLARI = ['Açık', 'İşlemde', 'Çözüldü'];
function oncelikRozet(o) { return `<span class="rozet ${o === 'Yüksek' ? 'kotu' : o === 'Orta' ? 'uyari' : 'notr'}">${esc(o)}</span>`; }
function sayfaArizalar() {
  ustDugmeler(`<button class="dugme" onclick="arizaFormu()">+ Arıza / talep</button>`);
  const tum = Veri.durum.arizalar;
  const liste = tum.filter(a => S.arizaDurum === 'hepsi' || (S.arizaDurum === 'acik' ? a.durum !== 'Çözüldü' : a.durum === 'Çözüldü'))
    .sort((a, b) => b.tarih.localeCompare(a.tarih));
  const sekme = (v, e) => `<button class="dugme ${S.arizaDurum === v ? '' : 'ikincil'} kucuk" onclick="S.arizaDurum='${v}'; ciz()">${e}</button>`;
  icerik().innerHTML = `
  <div class="arac-cubugu">${sekme('acik', `Açık (${tum.filter(a => a.durum !== 'Çözüldü').length})`)}${sekme('cozuldu', 'Çözülen')}${sekme('hepsi', 'Hepsi')}</div>
  <div class="kart tablo-kap"><table>
    <thead><tr><th>Tarih</th><th>Konu</th><th>Daire</th><th>Öncelik</th><th>Durum</th><th class="sag">Maliyet</th><th></th></tr></thead>
    <tbody>${liste.map(a => `<tr>
      <td>${tarihStr(a.tarih)}</td>
      <td><strong>${esc(a.konu)}</strong>${a.aciklama ? `<br><span class="soluk">${esc(a.aciklama)}</span>` : ''}</td>
      <td>${a.daireId ? esc(Veri.daireAdi(a.daireId)) : '<span class="soluk">Ortak alan</span>'}</td>
      <td>${oncelikRozet(a.oncelik)}</td>
      <td><select style="width:auto" onchange="yap(() => Veri.guncelle('arizalar','${a.id}',{durum:this.value}), 'Durum güncellendi')">${ARIZA_DURUMLARI.map(d => `<option ${d === a.durum ? 'selected' : ''}>${d}</option>`).join('')}</select></td>
      <td class="sag">${a.maliyet !== '' && a.maliyet != null ? para(a.maliyet) : ''}</td>
      <td class="sag" style="white-space:nowrap"><button class="ikon-dugme" title="Düzenle" onclick="arizaFormu('${a.id}')">✏️</button><button class="ikon-dugme" title="Sil" onclick="arizaSil('${a.id}')">🗑️</button></td>
    </tr>`).join('') || '<tr><td colspan="7" class="bos">Kayıt yok</td></tr>'}</tbody></table></div>`;
}
async function arizaFormu(id) {
  const a = id ? Veri.durum.arizalar.find(x => x.id === id) : {};
  const s = await formAc({
    baslik: id ? 'Arıza / talep düzenle' : 'Yeni arıza / talep',
    alanlar: [
      { ad: 'konu', etiket: 'Konu', zorunlu: true, tam: true, deger: a.konu, yerTutucu: 'Örn. Asansör kapısı geç açılıyor' },
      { ad: 'aciklama', etiket: 'Açıklama', tur: 'textarea', tam: true, deger: a.aciklama },
      { ad: 'daireId', etiket: 'Bildiren daire', tur: 'select', secenekler: daireSecenekleri('Ortak alan / yönetim'), deger: a.daireId || '' },
      { ad: 'tarih', etiket: 'Tarih', tur: 'date', deger: a.tarih || bugunStr(), zorunlu: true },
      { ad: 'oncelik', etiket: 'Öncelik', tur: 'select', secenekler: ['Düşük', 'Orta', 'Yüksek'], deger: a.oncelik || 'Orta' },
      { ad: 'durum', etiket: 'Durum', tur: 'select', secenekler: ARIZA_DURUMLARI, deger: a.durum || 'Açık' },
      { ad: 'maliyet', etiket: 'Maliyet (₺)', tur: 'number', min: 0, deger: a.maliyet },
      { ad: 'giderIsle', etiket: 'Maliyeti kasaya gider olarak işle', tur: 'checkbox', deger: false }
    ]
  });
  if (!s) return;
  const { giderIsle, ...kayit } = s;
  yap(async () => {
    if (id) await Veri.guncelle('arizalar', id, kayit); else await Veri.ekle('arizalar', kayit);
    if (giderIsle && Number(kayit.maliyet) > 0) {
      await Veri.ekle('hareketler', { tur: 'gider', altTur: '', daireId: '', donem: '', kategori: 'Onarım / Tadilat', tarih: bugunStr(), tutar: Number(kayit.maliyet), yontem: 'Nakit', aciklama: kayit.konu });
    }
  }, giderIsle && Number(kayit.maliyet) > 0 ? 'Kaydedildi, gider kasaya işlendi' : 'Kaydedildi');
}
async function arizaSil(id) {
  if (!await onayla('Kayıt silinsin mi?', Veri.durum.arizalar.find(x => x.id === id)?.konu)) return;
  yap(() => Veri.sil('arizalar', id), 'Silindi');
}

// ---------------- RAPORLAR ----------------
function telefonWa(t) {
  let n = String(t || '').replace(/\D/g, '');
  if (!n) return '';
  if (n.startsWith('0')) n = '90' + n.slice(1);
  else if (n.length === 10) n = '90' + n;
  return n;
}
function sayfaRaporlar() {
  ustDugmeler(`<button class="dugme ikincil" onclick="window.print()">Yazdır</button>`);
  const a = Veri.durum.ayarlar;
  const borclular = Veri.siraliDaireler().map(d => ({ d, b: Veri.daireBakiye(d.id), g: Veri.gecikmisBorc(d.id) })).filter(x => x.b > 0.004);
  const yil = S.raporYil;
  const ozet = Veri.aylikOzet(yil);
  const kat = {};
  Veri.durum.hareketler.filter(h => h.tarih.startsWith(String(yil)) && (h.tur === 'gider' || h.tur === 'gelir'))
    .forEach(h => { const k = (h.tur === 'gider' ? 'gider|' : 'gelir|') + (h.kategori || 'Diğer'); kat[k] = (kat[k] || 0) + h.tutar; });
  const tahsilatYil = Veri.durum.hareketler.filter(h => h.tur === 'tahsilat' && h.tarih.startsWith(String(yil))).reduce((t, h) => t + h.tutar, 0);
  const top = ozet.reduce((t, x) => ({ g: t.g + x.gelir, c: t.c + x.gider, tk: t.tk + x.tahakkuk }), { g: 0, c: 0, tk: 0 });
  icerik().innerHTML = `
  <div class="kart">
    <div class="yazdir-baslik"><h2 style="margin:0">${esc(a.ad)}</h2><div>${esc(a.adres)} · ${tarihStr(bugunStr())}</div><hr></div>
    <h3>Borçlu daireler <small>${borclular.length} daire · ${para(borclular.reduce((t, x) => t + x.b, 0))}</small></h3>
    <div class="tablo-kap"><table><thead><tr><th>Daire</th><th>Oturan</th><th>Telefon</th><th class="sag">Vadesi geçmiş</th><th class="sag">Toplam borç</th><th class="yazdirma-gizle"></th></tr></thead>
    <tbody>${borclular.map(x => {
      const tel = telefonWa(x.d.telefon);
      const mesaj = `Merhaba ${x.d.kiraci || x.d.malik}, ${a.ad} ${Veri.daireAdi(x.d.id)} için ${para(x.b)} aidat borcunuz bulunmaktadır.${a.iban ? ' Ödeme için IBAN: ' + a.iban + '.' : ''} Bilginize. — Yönetim`;
      return `<tr><td><strong>${esc(Veri.daireAdi(x.d.id))}</strong></td><td>${esc(x.d.kiraci || x.d.malik)}</td><td>${esc(x.d.telefon)}</td>
      <td class="sag">${x.g > 0.004 ? `<span class="borc">${para(x.g)}</span>` : '<span class="soluk">—</span>'}</td><td class="sag"><span class="borc">${para(x.b)}</span></td>
      <td class="sag yazdirma-gizle" style="white-space:nowrap">${tel ? `<a class="dugme ikincil kucuk" target="_blank" rel="noopener" href="https://wa.me/${tel}?text=${encodeURIComponent(mesaj)}">WhatsApp hatırlat</a>` : ''}
      <button class="dugme ikincil kucuk" onclick="S.ekstreDaire='${x.d.id}'; location.hash='daireler'">Ekstre</button></td></tr>`;
    }).join('') || '<tr><td colspan="6" class="bos">Borçlu daire yok 🎉</td></tr>'}</tbody></table></div>
  </div>
  <div class="bosluk"></div>
  <div class="kart">
    <h3><span>Gelir-gider raporu</span>
      <select class="yazdirma-gizle" style="width:auto" onchange="S.raporYil=Number(this.value); ciz()">${yillar().map(y => `<option ${y === yil ? 'selected' : ''}>${y}</option>`).join('')}</select></h3>
    <div class="izgara d2">
      <div class="tablo-kap"><table><thead><tr><th>Ay</th><th class="sag">Borçlandırılan</th><th class="sag">Gelir</th><th class="sag">Gider</th><th class="sag">Fark</th></tr></thead>
        <tbody>${ozet.map((x, i) => `<tr><td>${AYLAR[i]}</td><td class="sag">${para(x.tahakkuk)}</td><td class="sag">${para(x.gelir)}</td><td class="sag">${para(x.gider)}</td><td class="sag ${x.gelir - x.gider < 0 ? 'borc' : ''}">${para(x.gelir - x.gider)}</td></tr>`).join('')}
        <tr><td><strong>Toplam</strong></td><td class="sag"><strong>${para(top.tk)}</strong></td><td class="sag"><strong>${para(top.g)}</strong></td><td class="sag"><strong>${para(top.c)}</strong></td><td class="sag"><strong>${para(top.g - top.c)}</strong></td></tr></tbody></table></div>
      <div class="tablo-kap"><table><thead><tr><th>Kalem</th><th class="sag">Tutar</th></tr></thead><tbody>
        <tr><td>Aidat ve ödenek tahsilatı</td><td class="sag alacak">${para(tahsilatYil)}</td></tr>
        ${Object.entries(kat).filter(([k]) => k.startsWith('gelir|')).map(([k, t]) => `<tr><td>${esc(k.slice(6))}</td><td class="sag alacak">${para(t)}</td></tr>`).join('')}
        ${Object.entries(kat).filter(([k]) => k.startsWith('gider|')).sort((x, y) => y[1] - x[1]).map(([k, t]) => `<tr><td>${esc(k.slice(6))}</td><td class="sag borc">−${para(t)}</td></tr>`).join('')}
        <tr><td><strong>Tahsil oranı</strong></td><td class="sag"><strong>${top.tk ? '%' + Math.round(tahsilatYil / top.tk * 100) : '—'}</strong></td></tr>
      </tbody></table></div>
    </div>
  </div>`;
}

// ---------------- AYARLAR ----------------
function sayfaAyarlar() {
  ustDugmeler('');
  const a = Veri.durum.ayarlar;
  const alan = (ad, etiket, tur = 'text', ek = '') => `<div class="alan"><label for="a_${ad}">${etiket}</label><input id="a_${ad}" name="${ad}" type="${tur}" value="${esc(a[ad])}" ${ek}></div>`;
  icerik().innerHTML = `
  <div class="izgara d2">
    <form class="kart" id="ayarForm">
      <h3>Apartman bilgileri</h3>
      <div class="alanlar">
        <div class="alan tam"><label for="a_ad">Apartman adı</label><input id="a_ad" name="ad" value="${esc(a.ad)}" required></div>
        <div class="alan tam"><label for="a_adres">Adres</label><input id="a_adres" name="adres" value="${esc(a.adres)}"></div>
        ${alan('yonetici', 'Yönetici')}${alan('telefon', 'Yönetici telefonu', 'tel')}
        <div class="alan tam"><label for="a_iban">IBAN (ekstre ve hatırlatmalarda görünür)</label><input id="a_iban" name="iban" value="${esc(a.iban)}"></div>
        ${alan('varsayilanAidat', 'Varsayılan aidat (₺)', 'number', 'min="0" step="any"')}
        ${alan('aidatGunu', 'Son ödeme günü (ayın)', 'number', 'min="1" max="28" step="1"')}
        ${alan('acilisBakiyesi', 'Kasa açılış bakiyesi (₺)', 'number', 'step="any"')}
        <div class="alan"><label for="a_tema">Görünüm</label><select id="a_tema" name="tema">${[['oto', 'Sistemle aynı'], ['light', 'Açık'], ['dark', 'Koyu']].map(([v, e]) => `<option value="${v}" ${a.tema === v ? 'selected' : ''}>${e}</option>`).join('')}</select></div>
      </div>
      <button class="dugme" type="submit">Kaydet</button>
    </form>
    <div class="kart">
      <h3>Veritabanı ve yedek</h3>
      <p class="soluk" id="dbYolu">Veriler bu bilgisayardaki SQLite veritabanında tutulur.</p>
      <p>Sunucu her açılışta veritabanının günlük kopyasını <code>veri/yedekler/</code> klasörüne alır (son 14 gün). İstersen elle de yedek alabilirsin:</p>
      <p style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="dugme" onclick="yedekIndir()">Yedeği indir (.json)</button>
        <label class="dugme ikincil" style="display:inline-block">Yedekten geri yükle<input type="file" accept=".json,application/json" hidden onchange="yedekYukle(this.files[0]); this.value=''"></label>
      </p>
      <hr style="border:0;border-top:1px solid var(--cizgi);margin:18px 0">
      <h3>Deneme ve sıfırlama</h3>
      <p style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="dugme ikincil" onclick="ornekYukle()">Örnek verileri yükle</button>
        <button class="dugme tehlike" onclick="hepsiniSil()">Tüm verileri sil</button>
      </p>
    </div>
  </div>`;
  api('saglik').then(r => { const el = document.getElementById('dbYolu'); if (el) el.innerHTML = `Veritabanı dosyası: <code>${esc(r.db)}</code>`; }).catch(() => { });
  document.getElementById('ayarForm').addEventListener('submit', e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const s = {};
    for (const [k, v] of f) s[k] = ['varsayilanAidat', 'aidatGunu', 'acilisBakiyesi'].includes(k) ? Number(v) || 0 : String(v).trim();
    yap(async () => { await Veri.ayarlariKaydet(s); temaUygula(); markaGuncelle(); }, 'Ayarlar kaydedildi');
  });
}
async function yedekIndir() {
  try {
    const v = await api('veri');
    dosyaIndir(`apartmanim-yedek-${bugunStr()}.json`, JSON.stringify(v, null, 2));
  } catch (e) { bildir('Yedek alınamadı: ' + e.message); }
}
async function yedekYukle(dosya) {
  if (!dosya) return;
  const metin = await dosya.text();
  if (!await onayla('Yedek geri yüklensin mi?', 'Şu anki tüm veriler silinip yedekteki verilerle değiştirilecek. (Bugünün otomatik yedeği veri/yedekler klasöründe durur.)', 'Geri yükle')) return;
  yap(() => Veri.icerikAl(metin), 'Yedek geri yüklendi');
}
async function ornekYukle() {
  if (Veri.durum.daireler.length && !await onayla('Örnek veriler yüklensin mi?', 'Şu anki tüm verilerin silinip yerine örnek bir apartman yüklenecek.', 'Yükle')) return;
  yap(async () => { await Veri.ornekVeriYukle(); markaGuncelle(); }, 'Örnek veriler yüklendi');
}
async function hepsiniSil() {
  if (!await onayla('Tüm veriler silinsin mi?', 'Daireler, ödemeler, giderler, duyurular ve arızaların hepsi silinecek. Gerekirse veri/yedekler klasöründeki günlük yedekten dönülebilir.', 'Hepsini sil')) return;
  yap(async () => { await Veri.sifirla(); markaGuncelle(); }, 'Tüm veriler silindi');
}
