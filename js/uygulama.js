// Uygulama başlangıcı ve sayfa yönlendirme.

const SAYFALAR = {
  panel: ['Özet', sayfaPanel],
  daireler: ['Daireler', sayfaDaireler],
  aidat: ['Aidat takibi', sayfaAidat],
  kasa: ['Kasa', sayfaKasa],
  duyurular: ['Duyurular', sayfaDuyurular],
  arizalar: ['Arıza / Talep', sayfaArizalar],
  raporlar: ['Raporlar', sayfaRaporlar],
  ayarlar: ['Ayarlar', sayfaAyarlar]
};

function aktifSayfa() {
  const s = location.hash.slice(1);
  return SAYFALAR[s] ? s : 'panel';
}

function ciz() {
  const s = aktifSayfa();
  if (s !== 'daireler') S.ekstreDaire = null;
  const [baslik, fn] = SAYFALAR[s];
  document.getElementById('baslik').textContent = s === 'daireler' && S.ekstreDaire ? 'Hesap ekstresi' : baslik;
  document.querySelectorAll('#menu a').forEach(a => a.classList.toggle('aktif', a.dataset.sayfa === s));
  document.title = `${baslik} · ${Veri.durum.ayarlar.ad}`;
  fn();
}

function temaUygula() {
  const t = Veri.durum.ayarlar.tema;
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}
function markaGuncelle() {
  document.getElementById('markaAd').textContent = Veri.durum.ayarlar.ad || 'Apartmanım';
  document.getElementById('markaAdres').textContent = Veri.durum.ayarlar.adres || 'Yönetim paneli';
}

async function basla() {
  try {
    await Veri.yukle();
  } catch (e) {
    document.getElementById('icerik').innerHTML = `<div class="kart bos">
      <h2 style="margin-top:0">Veritabanına bağlanılamadı</h2>
      <p>Uygulamayı <strong>Apartmanım.command</strong> dosyasına çift tıklayarak aç (ya da terminalde <code>python3 sunucu.py</code>).<br>
      Sayfayı doğrudan dosyadan açarsan veritabanına ulaşamaz.</p>
      <p class="soluk">${esc(e.message)}</p>
      <button class="dugme" onclick="location.reload()">Tekrar dene</button></div>`;
    return;
  }
  temaUygula();
  markaGuncelle();
  ciz();
}

window.addEventListener('hashchange', () => { document.getElementById('yan').classList.remove('acik'); ciz(); window.scrollTo(0, 0); });
document.getElementById('menuDugme').addEventListener('click', () => document.getElementById('yan').classList.toggle('acik'));
basla();
