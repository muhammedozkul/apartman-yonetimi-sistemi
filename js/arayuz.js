// Arayüz yardımcıları: kaçış, bildirim, form penceresi, onay.

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let bildirimZamanlayici;
function bildir(metin) {
  const el = document.getElementById('bildirim');
  el.textContent = metin;
  el.classList.add('goster');
  clearTimeout(bildirimZamanlayici);
  bildirimZamanlayici = setTimeout(() => el.classList.remove('goster'), 2400);
}

// alanlar: [{ad, etiket, tur:'text'|'number'|'date'|'select'|'textarea'|'checkbox'|'month', secenekler, deger, zorunlu, tam, ipucu, min, adim}]
function formAc({ baslik, alanlar, tamamMetni = 'Kaydet', tehlike = false, ekHtml = '', degisince }) {
  const dlg = document.getElementById('pencere');
  const govde = document.getElementById('pencereGovde');
  document.getElementById('pencereBaslik').textContent = baslik;
  const tamam = document.getElementById('pencereTamam');
  tamam.textContent = tamamMetni;
  tamam.className = 'dugme' + (tehlike ? ' tehlike' : '');

  govde.innerHTML = ekHtml + '<div class="alanlar">' + alanlar.map(a => {
    const id = 'f_' + a.ad;
    const zor = a.zorunlu ? 'required' : '';
    let girdi;
    if (a.tur === 'select') {
      girdi = `<select id="${id}" name="${a.ad}" ${zor}>${a.secenekler.map(s => {
        const [v, e] = Array.isArray(s) ? s : [s, s];
        return `<option value="${esc(v)}" ${String(v) === String(a.deger ?? '') ? 'selected' : ''}>${esc(e)}</option>`;
      }).join('')}</select>`;
    } else if (a.tur === 'textarea') {
      girdi = `<textarea id="${id}" name="${a.ad}" rows="4" ${zor}>${esc(a.deger)}</textarea>`;
    } else if (a.tur === 'checkbox') {
      return `<div class="alan ${a.tam ? 'tam' : ''}"><label class="onay"><input type="checkbox" id="${id}" name="${a.ad}" ${a.deger ? 'checked' : ''}> ${esc(a.etiket)}</label></div>`;
    } else {
      const ek = a.tur === 'number' ? `step="${a.adim ?? 'any'}" ${a.min != null ? `min="${a.min}"` : ''} inputmode="decimal"` : '';
      girdi = `<input type="${a.tur || 'text'}" id="${id}" name="${a.ad}" value="${esc(a.deger)}" ${zor} ${ek} ${a.yerTutucu ? `placeholder="${esc(a.yerTutucu)}"` : ''}>`;
    }
    return `<div class="alan ${a.tam ? 'tam' : ''}"><label for="${id}">${esc(a.etiket)}${a.zorunlu ? ' *' : ''}</label>${girdi}${a.ipucu ? `<div class="ipucu-metin">${esc(a.ipucu)}</div>` : ''}</div>`;
  }).join('') + '</div>';

  return new Promise(coz => {
    const form = document.getElementById('pencereForm');
    const oku = () => {
      const s = {};
      for (const a of alanlar) {
        const el = form.elements[a.ad];
        if (!el) continue;
        if (a.tur === 'checkbox') s[a.ad] = el.checked;
        else if (a.tur === 'number') s[a.ad] = el.value === '' ? '' : Number(el.value);
        else s[a.ad] = el.value.trim();
      }
      return s;
    };
    const gonder = e => {
      e.preventDefault();
      if (!form.reportValidity()) return;
      bitir(oku());
    };
    const iptal = () => bitir(null);
    const giris = () => degisince && degisince(oku(), form);
    const bitir = sonuc => {
      form.removeEventListener('submit', gonder);
      form.removeEventListener('input', giris);
      document.getElementById('pencereIptal').removeEventListener('click', iptal);
      dlg.removeEventListener('cancel', iptalOlay);
      dlg.close();
      coz(sonuc);
    };
    const iptalOlay = e => { e.preventDefault(); iptal(); };
    form.addEventListener('submit', gonder);
    form.addEventListener('input', giris);
    document.getElementById('pencereIptal').addEventListener('click', iptal);
    dlg.addEventListener('cancel', iptalOlay);
    dlg.showModal();
    if (degisince) degisince(oku(), form);
    const ilk = govde.querySelector('input:not([type=checkbox]),select,textarea');
    if (ilk) ilk.focus();
  });
}

async function onayla(baslik, metin, tamamMetni = 'Sil') {
  const s = await formAc({ baslik, alanlar: [], tamamMetni, tehlike: true, ekHtml: `<p>${esc(metin)}</p>` });
  return s !== null;
}

function dosyaIndir(ad, icerik, tur = 'application/json') {
  const blob = new Blob([icerik], { type: tur + ';charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = ad;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

function csvYap(satirlar) {
  return '﻿' + satirlar.map(r => r.map(h => {
    const s = String(h ?? '');
    return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(';')).join('\n');
}

function daireSecenekleri(bosEtiket) {
  const s = Veri.siraliDaireler().map(d => [d.id, `${Veri.daireAdi(d.id)} · ${d.kiraci || d.malik || ''}`]);
  return bosEtiket ? [['', bosEtiket], ...s] : s;
}
