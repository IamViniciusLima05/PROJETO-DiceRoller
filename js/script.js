/* DiceRoller — aleatoriedade com crypto, fórmulas (NdX+M, kN/dN), dados presos e vantagem */

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const banco = {
  ler(k, padrao) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? padrao; } catch { return padrao; } },
  salvar(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem storage */ } }
};
const escapar = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// número inteiro de 1 a n sem viés (rejeição)
function sortear(n) {
  const max = Math.floor(0x100000000 / n) * n, buf = new Uint32Array(1);
  do crypto.getRandomValues(buf); while (buf[0] >= max);
  return (buf[0] % n) + 1;
}
const TIPOS = { 4: '#e5484d', 6: '#f08c2a', 8: '#e0b400', 10: '#30a46c', 12: '#0090ff', 20: '#8e4ec6', 100: '#d6409f' };
const FORMAS = { // polígonos simples que lembram cada dado
  4: '50,6 96,90 4,90', 6: '10,10 90,10 90,90 10,90', 8: '50,4 96,50 50,96 4,50', 10: '50,4 94,40 78,94 22,94 6,40',
  12: '50,4 92,30 92,72 50,96 8,72 8,30', 20: '50,3 93,27 93,73 50,97 7,73 7,27', 100: 'c'
};
const svgDado = (lados, cor) => FORMAS[lados] === 'c'
  ? `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" fill="${cor}" stroke="rgba(0,0,0,.25)" stroke-width="4"/><circle cx="50" cy="50" r="30" fill="none" stroke="rgba(255,255,255,.25)" stroke-width="3"/></svg>`
  : `<svg viewBox="0 0 100 100"><polygon points="${FORMAS[lados]}" fill="${cor}" stroke="rgba(0,0,0,.25)" stroke-width="4" stroke-linejoin="round"/><polygon points="${FORMAS[lados]}" fill="none" stroke="rgba(255,255,255,.25)" stroke-width="2" transform="translate(50 50) scale(.72) translate(-50 -50)"/></svg>`;

let mesa = [], mod = 0, manter = null, modo = 'normal', historico = banco.ler('dr_hist', []);
let som = banco.ler('dr_som', true);

/* ---------- Fórmula ---------- */
// aceita: 2d6+3, d20, 4d6k3 (mantém 3 maiores), 2d20kl1 (mantém menor), 3d8-1, 1d6+1d4+2
function interpretar(txt) {
  const t = txt.toLowerCase().replace(/\s+/g, ''); if (!t) return null;
  const partes = t.match(/[+-]?[^+-]+/g); if (!partes) return null;
  const dados = []; let m = 0, k = null;
  for (const p of partes) {
    const sinal = p.startsWith('-') ? -1 : 1, q = p.replace(/^[+-]/, '');
    const md = q.match(/^(\d*)d(\d+|%)(?:(kh?|kl|dl?|dh)(\d+))?$/);
    if (md) {
      const n = +(md[1] || 1), lados = md[2] === '%' ? 100 : +md[2];
      if (n < 1 || n > 30 || lados < 2 || lados > 1000 || sinal < 0) return null;
      for (let i = 0; i < n; i++) dados.push({ lados, v: null, preso: false });
      if (md[3]) { const x = +md[4], op = md[3]; k = op === 'kl' ? { tipo: 'menores', n: x } : op.startsWith('k') ? { tipo: 'maiores', n: x } : op === 'dh' ? { tipo: 'menores', n: n - x } : { tipo: 'maiores', n: n - x }; }
    } else if (/^\d+$/.test(q)) m += sinal * +q; else return null;
  }
  return dados.length ? { dados, m, k } : null;
}

/* ---------- Som (Web Audio, sem arquivos) ---------- */
let ctx;
function chocalhar(n) {
  if (!som) return;
  try {
    ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    for (let i = 0; i < Math.min(8, n * 3); i++) {
      const t = ctx.currentTime + i * 0.045 + Math.random() * 0.03, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square'; o.frequency.value = 600 + Math.random() * 900;
      g.gain.setValueAtTime(0.06, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.06);
    }
  } catch { /* sem áudio */ }
}

/* ---------- Rolagem ---------- */
function rolar() {
  if (!mesa.length) return;
  const soltos = mesa.filter((d) => !d.preso);
  if (!soltos.length) return;
  // vantagem/desvantagem: se a mesa for um único d20, rola dois e fica com o maior/menor
  if (modo !== 'normal' && mesa.length === 1 && mesa[0].lados === 20) { mesa.push({ lados: 20, v: null, preso: false, auto: true }); manter = { tipo: modo === 'vantagem' ? 'maiores' : 'menores', n: 1 }; }
  mesa.forEach((d) => { if (!d.preso) d.v = sortear(d.lados); });
  chocalhar(soltos.length); vibrar(30);
  render(true);
  const r = resultado();
  historico.unshift({ f: r.formula, t: r.total, d: r.det, em: Date.now() }); historico = historico.slice(0, 50); banco.salvar('dr_hist', historico);
  renderHist();
}
function resultado() {
  const usados = new Set(mesa.map((_, i) => i));
  if (manter && mesa.every((d) => d.v)) {
    const ord = mesa.map((d, i) => [d.v, i]).sort((a, b) => (manter.tipo === 'maiores' ? b[0] - a[0] : a[0] - b[0]));
    usados.clear(); ord.slice(0, manter.n).forEach(([, i]) => usados.add(i));
  }
  const soma = mesa.reduce((s, d, i) => s + (usados.has(i) && d.v ? d.v : 0), 0);
  const grupos = {}; mesa.forEach((d) => { if (!d.auto) grupos[d.lados] = (grupos[d.lados] || 0) + 1; });
  let formula = Object.entries(grupos).sort((a, b) => b[0] - a[0]).map(([l, n]) => `${n}d${l}`).join('+');
  if (manter) formula += mesa.some((d) => d.auto) ? (manter.tipo === 'maiores' ? ' (vantagem)' : ' (desvantagem)') : `${manter.tipo === 'maiores' ? 'k' : 'kl'}${manter.n}`;
  if (mod) formula += (mod > 0 ? '+' : '') + mod;
  const det = mesa.map((d, i) => (usados.has(i) ? d.v : `~${d.v}~`)).join(', ') + (mod ? ` ${mod > 0 ? '+' : '−'} ${Math.abs(mod)}` : '');
  return { total: soma + mod, formula, det, usados };
}

/* ---------- Render ---------- */
function render(animar = false) {
  const r = resultado();
  $('#dados').innerHTML = mesa.map((d, i) => {
    const desc = d.v && !r.usados.has(i), crit = d.lados === 20 && d.v === 20, falha = d.lados === 20 && d.v === 1;
    return `<button class="dado${animar && !d.preso ? ' rolando' : ''}${d.preso ? ' preso' : ''}${desc ? ' descartado' : ''}${crit ? ' critico' : ''}${falha ? ' falha' : ''}" data-i="${i}" style="--dx:${(Math.random() * 80 - 40).toFixed(0)}px;animation-delay:${i * 40}ms" aria-label="d${d.lados}${d.v ? ': ' + d.v : ''}${d.preso ? ', preso' : ''}">${svgDado(d.lados, TIPOS[d.lados] || '#555')}<b>${d.v ?? '?'}</b><small>d${d.lados}</small></button>`;
  }).join('');
  $('#vazio').hidden = mesa.length > 0;
  const rolou = mesa.some((d) => d.v);
  $('#total').hidden = !rolou;
  if (rolou) {
    $('#total-det').textContent = `${r.formula} → ${r.det.replace(/~(\d+)~/g, '($1)')}`;
    $('#total-v').textContent = r.total;
    $('#total').classList.remove('pop'); void $('#total').offsetWidth; if (animar) $('#total').classList.add('pop');
  }
  $('#rolar').disabled = !mesa.length || mesa.every((d) => d.preso); $('#limpar').disabled = !mesa.length;
  $$('[data-modo]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.modo === modo));
}
function renderHist() {
  const quando = (t) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  $('#historico').innerHTML = historico.map((h) => `<li><span>${quando(h.em)} · ${escapar(h.f)} → ${escapar(String(h.d).replace(/~(\d+)~/g, '($1)'))}</span><b>${h.t}</b></li>`).join('') || '<li><span>Nenhuma jogada ainda.</span></li>';
  if (historico.length >= 2) {
    const ts = historico.map((h) => h.t), media = ts.reduce((a, b) => a + b, 0) / ts.length;
    $('#stats').textContent = `${historico.length} jogadas · média ${media.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} · maior ${Math.max(...ts)} · menor ${Math.min(...ts)}`;
  } else $('#stats').textContent = '';
}
function limparAuto() { if (mesa.some((d) => d.auto)) { mesa = mesa.filter((d) => !d.auto); manter = null; } }

/* ---------- Eventos ---------- */
$('#tipos').innerHTML = Object.entries(TIPOS).map(([l, c]) => `<button class="tipo" data-lados="${l}" style="--c:${c}" aria-label="Adicionar d${l}">${svgDado(+l, 'rgba(255,255,255,.25)')}<small>d${l}</small></button>`).join('');
$('#tipos').addEventListener('click', (e) => {
  const b = e.target.closest('[data-lados]'); if (!b) return;
  limparAuto();
  if (mesa.length >= 30) return;
  mesa.forEach((d) => { if (!d.preso) d.v = null; });
  mesa.push({ lados: +b.dataset.lados, v: null, preso: false }); render();
});
$('#dados').addEventListener('click', (e) => {
  const b = e.target.closest('.dado'); if (!b) return;
  const d = mesa[+b.dataset.i];
  if (!d.v) { mesa.splice(+b.dataset.i, 1); render(); return; } // antes de rolar, tocar remove
  d.preso = !d.preso; render();
});
$('#rolar').addEventListener('click', rolar);
$('#limpar').addEventListener('click', () => { mesa = []; mod = 0; manter = null; $('#formula').value = ''; render(); });
$('#form-formula').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = interpretar($('#formula').value);
  if (!f) { $('#formula').setCustomValidity('Fórmula inválida. Exemplos: 2d6+3, d20, 4d6k3'); $('#formula').reportValidity(); return; }
  mesa = f.dados; mod = f.m; manter = f.k; rolar();
});
$('#formula').addEventListener('input', (e) => e.target.setCustomValidity(''));
$$('[data-modo]').forEach((b) => b.addEventListener('click', () => { modo = b.dataset.modo; limparAuto(); mesa.forEach((d) => { d.v = null; d.preso = false; }); render(); }));
$('#limpar-hist').addEventListener('click', () => { historico = []; banco.salvar('dr_hist', []); renderHist(); });
$('#som').addEventListener('change', (e) => { som = e.target.checked; banco.salvar('dr_som', som); });
document.addEventListener('keydown', (e) => { if (e.code === 'Space' && !e.target.closest('input, button')) { e.preventDefault(); rolar(); } });
const vibrar = (p) => { try { navigator.vibrate?.(p); } catch { /* sem vibração */ } };

$('#som').checked = som;
render(); renderHist();
