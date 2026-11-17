/* Interpreta faturas de cartão e extratos de conta, vindos de PDF (linhas com posição), CSV ou OFX.
   Resultado comum: { kind:'fatura'|'extrato', bank, due, comp, lines:[...], printed:[valores impressos], saldoIni, saldoFim, check }
   Cada linha: { date:'AAAA-MM-DD', desc, title, detail, amount (>0), dir:'out'|'in', doc, parc:{i,n}|null, cardRef, role, reason }
   role: 'normal' (vira lançamento) · 'ignore' (aplicação automática, saldo…) · 'cardpay' (pagamento de fatura) */

const pad = n => String(n).padStart(2, '0');
export const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

const RX_MONEY = /^(?:R\$\s*)?([-−+])?\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})\s*(\(\s*[-+]\s*\)|-|\+|D|C)?$/i;
const RX_DATE = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))?\b/;
const RX_PARC = [/\bPARC(?:ELA)?\.?\s*(\d{1,2})\s*(?:\/|DE)\s*(\d{1,2})\b/i, /(?:\s-\s?|-|\s)(\d{1,2})\/(\d{1,2})\s*$/];

export function parseMoneyCell(s) {
  const m = String(s).trim().match(RX_MONEY);
  if (!m) return null;
  const v = parseFloat(m[2].replace(/\./g, '').replace(',', '.'));
  const pre = m[1] || '', post = (m[3] || '').replace(/\s/g, '').toUpperCase();
  const sign = pre === '-' || pre === '−' || post === '-' || post === '(-)' || post === 'D' ? '-' : (pre === '+' || post === '+' || post === '(+)' || post === 'C' ? '+' : '');
  return { v, sign };
}

/* ---------- regras de interpretação dos históricos (valem para PDF, CSV e OFX) ---------- */
const IGNORE = [
  [/RENDE FACIL|APLICACAO AUTOMATICA|RESGATE AUTOMATICO|APLIC\.? AUTOM|RESG\.? AUTOM|INVEST(IMENTO)? FACIL|POUPANCA AUTOMATICA|CDB AUTOMATICO/, 'Aplicação ou resgate automático']
];
const CARDPAY = /PAGTO CARTAO|PAGAMENTO (DE )?FATURA|PGTO FATURA|PAGTO FATURA|PAGAMENTO CARTAO( DE)? CREDITO|PAGAMENTO DE CARTAO|DEBITO AUTOMATICO FATURA/;
const UTILITY = /AGUA|ESGOTO|ENERGIA|LUZ|ELETRIC|GAS\b|TELEFON|INTERNET|CELULAR|CONDOMINIO|ALUGUEL|ESCOLA|MENSALIDADE/;
const FATURA_SKIP = /SALDO (DA )?FATURA ANTERIOR|SALDO ANTERIOR|PAGAMENTO (DE |DA )?FATURA|PAGAMENTO RECEBIDO|PAGAMENTO EFETUADO|PAGAMENTOS? (VIA|POR) |PAGTO\.? (FATURA|RECEBIDO)|^PAGAMENTO$|^PAGAMENTO [-–] /;

function classifyRole(text) {
  const t = norm(text);
  for (const [rx, why] of IGNORE) if (rx.test(t)) return { role: 'ignore', reason: why };
  if (CARDPAY.test(t) && !UTILITY.test(t)) return { role: 'cardpay', reason: 'Pagamento de fatura de cartão' };
  return { role: 'normal' };
}

/* "02/11 18:49 CINESYSTEM" → data real 02/11 e nome; "31/10 13:44 66645653000136 NOME" → nome sem documento */
function splitDetail(detail) {
  const m = String(detail || '').match(/^(\d{2})\/(\d{2})(?:\/\d{2,4})?\s+(?:\d{1,2}:\d{2}(?::\d{2})?\s+)?(.*)$/);
  const clean = s => s.replace(/^[\d./-]{11,}\s+/, '').replace(/^\d{3}\.\*{3}\.\*{3}-\d{2}\s+/, '').trim();
  if (m) return { d: +m[1], m: +m[2], name: clean(m[3]) };
  return { name: clean(String(detail || '').trim()) };
}

/* monta descrição legível e data real a partir de título (ex.: "Pix - Enviado") e detalhe */
function describe(title, detail, baseDate) {
  const T = norm(title), det = splitDetail(detail);
  let date = baseDate;
  if (det.d && det.m && baseDate) {
    let y = +baseDate.slice(0, 4);
    if (det.m > +baseDate.slice(5, 7) + 1) y--;
    const cand = `${y}-${pad(det.m)}-${pad(det.d)}`;
    if (cand <= baseDate && daysBetween(cand, baseDate) <= 40) date = cand;
  }
  let desc;
  if (/COMPRA COM CARTAO|COMPRA (NO )?DEBITO|COMPRA CARTAO|COMPRA ELO|COMPRA VISA|COMPRA MASTER/.test(T) && det.name) desc = det.name;
  else if (/^PIX/.test(T) && det.name) desc = `${title.replace(/\s*-\s*/, ' ').trim()} · ${det.name}`;
  else desc = [title, det.name].filter(Boolean).join(' · ');
  return { desc: desc.replace(/\s+/g, ' ').trim(), date };
}

function daysBetween(a, b) { return Math.round((Date.parse(b + 'T12:00') - Date.parse(a + 'T12:00')) / 864e5); }

/* ---------- PDF ---------- */
const flat = pages => pages.flatMap((rows, p) => rows.map(r => ({ ...r, page: p })));

function anchorOf(row) {
  const cells = row.cells.map(c => ({ ...c }));
  if (!cells.length) return null;
  // data no começo da linha (pode vir colada à descrição)
  const dm = cells[0].s.match(RX_DATE);
  if (!dm || cells[0].x > 120) return null;
  const rest0 = cells[0].s.slice(dm[0].length).trim();
  const parts = rest0 ? [{ ...cells[0], s: rest0 }, ...cells.slice(1)] : cells.slice(1);
  // primeiro valor monetário depois da data (o que vem depois é de outra coluna)
  let mi = -1, money = null;
  for (let i = 0; i < parts.length; i++) {
    const mm = parseMoneyCell(parts[i].s);
    if (mm) { mi = i; money = mm; break; }
    const tail = parts[i].s.match(/^(.*?)\s+((?:R\$\s*)?[-−]?\s*\d{1,3}(?:\.\d{3})*,\d{2}\s*(?:\(\s*[-+]\s*\)|-|D|C)?)$/);
    if (tail && parseMoneyCell(tail[2])) { parts.splice(i, 1, { ...parts[i], s: tail[1] }, { ...parts[i], s: tail[2] }); mi = i + 1; money = parseMoneyCell(tail[2]); break; }
  }
  if (mi < 0) return null;
  const mid = parts.slice(0, mi);
  const docs = mid.filter(c => /^\d{4,}$/.test(c.s)).map(c => c.s);
  const textCells = mid.filter(c => !/^\d{4,}$/.test(c.s) && !/^[A-Z]{2}$/.test(c.s));
  if (!textCells.length && !docs.length) return null; // só data e valor (ex.: vencimento e total no cabeçalho)
  return { d: +dm[1], m: +dm[2], y: dm[3] ? (dm[3].length === 2 ? 2000 + +dm[3] : +dm[3]) : null, text: textCells.map(c => c.s).join(' '), textX: textCells.length ? textCells[0].x : null, doc: docs[docs.length - 1] || '', money };
}

function findDue(rows) {
  for (let i = 0; i < rows.length; i++) {
    const c = rows[i].cells.find(c => /VENCIMENTO|VENCE EM|DATA DE VENCIMENTO/.test(norm(c.s)));
    if (!c) continue;
    const inline = norm(c.s).match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (inline) return `${inline[3]}-${inline[2]}-${inline[1]}`;
    for (let j = i; j < Math.min(rows.length, i + 4); j++) {
      for (const d of rows[j].cells) {
        if (j === i && d.x <= c.x) continue;
        if (j > i && Math.abs(d.x - c.x) > 90) continue;
        const m = d.s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (m) return `${m[3]}-${m[2]}-${m[1]}`;
      }
    }
  }
  return null;
}

function detectKind(text) {
  const t = norm(text);
  let f = 0, e = 0;
  if (/FATURA/.test(t)) f += 2;
  if (/VENCIMENTO/.test(t)) f += 1;
  if (/LIMITE (DE CREDITO|UNICO|DISPONIVEL)|PAGAMENTO MINIMO/.test(t)) f += 2;
  if (/EXTRATO/.test(t)) e += 2;
  if (/AGENCIA|CONTA CORRENTE|SALDO DO DIA|SALDO ANTERIOR\b/.test(t)) e += 2;
  if (/EXTRATO DE CONTA/.test(t)) e += 3;
  return f > e ? 'fatura' : 'extrato';
}

export function guessBank(text) {
  const t = norm(text);
  const banks = [['Nubank', /NUBANK|NU PAGAMENTOS/], ['Itaú', /ITAU|ITAUCARD/], ['Bradesco', /BRADESCO/], ['Santander', /SANTANDER/], ['Mercado Pago', /MERCADO PAGO/], ['Caixa', /CAIXA ECONOMICA|\bCAIXA\b(?! ELETRONICO)/],
    ['Banco Inter', /BANCO INTER\b/], ['C6 Bank', /\bC6\b/], ['XP', /\bXP\b/], ['Sam\'s Club', /SAM'?S CLUB/], ['Banco do Brasil', /BANCO DO BRASIL|OUROCARD|\bBB\b|RENDE FACIL/], ['PicPay', /PICPAY/], ['BTG', /BTG/], ['Sicoob', /SICOOB/], ['Sicredi', /SICREDI/]];
  // ignora linhas de Pix, TED e boletos (citam outros bancos como favorecidos)
  const own = t.split('\n').filter(l => !/PIX|TED\b|DOC\b|TRANSF|BOLETO|PAGTO|PAGAMENTO|NU PAGAMENTOS/.test(l)).join('\n');
  for (const [n, rx] of banks) if (rx.test(own)) return n;
  return '';
}

function inferYear(d, m, due, parcI) {
  // fatura: data <= vencimento; compras parceladas voltam (parcela-1) meses
  const [dy, dmo] = [+due.slice(0, 4), +due.slice(5, 7)];
  const back = Math.max(0, (parcI || 1) - 1);
  let hy = dy, hm = dmo - 1 - back; // mês provável da compra
  while (hm < 1) { hm += 12; hy--; }
  let best = null;
  for (const y of [hy - 1, hy, hy + 1]) {
    const iso = `${y}-${pad(m)}-${pad(d)}`;
    if (iso > due) continue;
    const dist = Math.abs((y * 12 + m) - (hy * 12 + hm));
    if (!best || dist < best.dist) best = { iso, dist };
  }
  return best ? best.iso : `${dy}-${pad(m)}-${pad(d)}`;
}

function extractParc(desc) {
  for (const rx of RX_PARC) {
    const m = desc.match(rx);
    if (m && +m[1] >= 1 && +m[2] >= 2 && +m[1] <= +m[2] && +m[2] <= 99) return { i: +m[1], n: +m[2], clean: (desc.slice(0, m.index) + ' ' + desc.slice(m.index + m[0].length)).replace(/\s+/g, ' ').replace(/[\s,–-]+$/, '').replace(/[-–]\s+/, s => s).trim() };
  }
  return null;
}

export function parsePdfPages(pages) {
  const rows = flat(pages);
  const all = rows.map(r => r.text).join('\n');
  const kind = detectKind(all);
  const anchors = [];
  rows.forEach((r, i) => { const a = anchorOf(r); if (a) anchors.push({ ...a, row: r, i }); });
  // banco: pelo texto fora dos lançamentos (cabeçalho, rodapé, informações)
  const near = r => anchors.some(a => a.row.page === r.page && Math.abs(a.row.y - r.y) < 15);
  const bank = guessBank(rows.filter(r => !near(r)).map(r => r.text).join('\n')) || guessBank(all);
  const printed = [];
  rows.forEach(r => { if (anchors.some(a => a.row === r)) return; r.cells.forEach(c => { const m = parseMoneyCell(c.s); if (m) printed.push(m.v); else { const mm = c.s.match(/R\$\s*([\d.]+,\d{2})/g); if (mm) mm.forEach(x => printed.push(parseMoneyCell(x).v)); } }); });
  return kind === 'fatura' ? buildFatura(rows, anchors, printed, bank) : buildExtrato(rows, anchors, printed, bank);
}

function buildFatura(rows, anchors, printed, bank) {
  const due = findDue(rows) || null;
  const out = { kind: 'fatura', bank, due, comp: due ? due.slice(0, 7) : null, lines: [], printed, saldoIni: 0, pagamentos: 0 };
  let holder = '', ai = 0;
  rows.forEach(r => {
    const a = anchors[ai] && anchors[ai].row === r ? anchors[ai++] : null;
    if (!a) {
      const h = r.text.match(/(?:\*{2,}|X{4,}|FINAL\s*|CART[AÃ]O\s*(?:FINAL\s*)?)(\d{4})\b/i);
      if (h) holder = h[1];
      const t = norm(r.text);
      if (/SALDO (DA )?FATURA ANTERIOR/.test(t)) { const m = r.cells.map(c => parseMoneyCell(c.s)).filter(Boolean).pop(); if (m) out.saldoIni = m.v; }
      return;
    }
    const T = norm(a.text);
    if (FATURA_SKIP.test(T)) {
      if (/SALDO/.test(T)) out.saldoIni = a.money.v;
      else out.pagamentos += a.money.v;
      return;
    }
    const parc = extractParc(a.text);
    const desc = (parc ? parc.clean : a.text).replace(/\s+-\s+BR$/, '').replace(/\s+/g, ' ').trim();
    const date = a.y ? `${a.y}-${pad(a.m)}-${pad(a.d)}` : (due ? inferYear(a.d, a.m, due, parc && parc.i) : null);
    out.lines.push({ date, desc, title: a.text, detail: '', amount: a.money.v, dir: a.money.sign === '-' ? 'in' : 'out', doc: a.doc, parc: parc ? { i: parc.i, n: parc.n } : null, cardRef: holder, ...classifyFaturaRole(T) });
  });
  out.check = checkFatura(out);
  return out;
}

function classifyFaturaRole(T) {
  if (/^IOF\b|ENCARGO|JUROS|MULTA|ANUIDADE|TARIFA/.test(T)) return { role: 'normal', hint: 'encargo' };
  return { role: 'normal' };
}

function checkFatura(f) {
  const r2 = v => Math.round(v * 100) / 100;
  const D = r2(f.lines.filter(l => l.dir === 'out').reduce((s, l) => s + l.amount, 0));
  const Cr = r2(f.lines.filter(l => l.dir === 'in').reduce((s, l) => s + l.amount, 0));
  const cands = [[D, 'compras e encargos'], [r2(D - Cr), 'lançamentos do período'], [r2(f.saldoIni + D - Cr - f.pagamentos), 'total da fatura'], [r2(f.saldoIni + D - Cr), 'total da fatura']];
  const hit = cands.find(([v]) => v > 0 && f.printed.some(p => Math.abs(p - v) < 0.011));
  return hit ? { ok: true, sum: r2(D - Cr), msg: `A soma lida confere com o ${hit[1]} impresso (${fmt(hit[0])}).` }
    : { ok: false, sum: r2(D - Cr), msg: `A soma lida (${fmt(r2(D - Cr))}) não bate com nenhum total impresso. Confira se faltou alguma linha.` };
}
const fmt = v => 'R$ ' + v.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');

function buildExtrato(rows, anchors, printed, bank) {
  const out = { kind: 'extrato', bank, lines: [], printed, saldoIni: null, saldoFim: null };
  if (!anchors.length) { out.check = { ok: false, msg: 'Nenhum lançamento encontrado no PDF.' }; return out; }
  // linhas de texto sem data/valor pertencem ao lançamento mais próximo (título acima, detalhe abaixo)
  const sameCol = (r, a) => a.textX == null || Math.abs(r.cells[0].x - a.textX) < 40 || Math.abs(r.cells[0].x - (anchors.find(x => x.textX != null) || {}).textX) < 40;
  const gaps = anchors.slice(1).map((a, i) => a.row.page === anchors[i].row.page ? Math.abs(anchors[i].row.y - a.row.y) : null).filter(Boolean).sort((x, y) => x - y);
  const lim = gaps.length ? gaps[Math.floor(gaps.length / 2)] * 0.62 : 14;
  const above = new Map(), below = new Map();
  rows.forEach(r => {
    if (anchors.some(a => a.row === r) || !r.cells.length) return;
    let best = null;
    for (const a of anchors) { if (a.row.page !== r.page) continue; const d = Math.abs(a.row.y - r.y); if (d <= lim && (!best || d < best.d)) best = { a, d }; }
    if (!best || !sameCol(r, best.a)) return;
    const map = r.y > best.a.row.y ? above : below;
    if (!map.has(best.a)) map.set(best.a, []);
    map.get(best.a).push(r.text);
  });
  // seções: o que vem depois de "Lançamentos futuros" é agendamento; "Informações adicionais" encerra a tabela
  let section = 'main';
  const sectionOf = new Map();
  rows.forEach(r => {
    const t = norm(r.text);
    if (/^LANCAMENTOS FUTUROS|^AGENDAMENTOS|^LANCAMENTOS PROGRAMADOS|^PREVISAO DE LANCAMENTOS/.test(t)) section = 'future';
    else if (/^INFORMACOES ADICIONAIS|^APLICACOES FINANCEIRAS|^INFORMACOES COMPLEMENTARES|^RESUMO DE/.test(t)) section = 'end';
    sectionOf.set(r, section);
  });
  anchors.forEach(a => {
    const sec = sectionOf.get(a.row);
    if (sec === 'end') return;
    const title = (above.get(a) || []).join(' ').trim() || a.text;
    const detail = [above.get(a) ? a.text : '', ...(below.get(a) || [])].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    const baseDate = a.y ? `${a.y}-${pad(a.m)}-${pad(a.d)}` : null;
    const T = norm(title + ' ' + detail);
    if (/SALDO ANTERIOR/.test(norm(title))) { out.saldoIni = a.money.sign === '-' ? -a.money.v : a.money.v; out.saldoIniDate = baseDate; return; }
    if (/^S\s?A\s?L\s?D\s?O$|SALDO FINAL|SALDO DO DIA|SALDO EM /.test(norm(title))) { out.saldoFim = a.money.sign === '-' ? -a.money.v : a.money.v; return; }
    const d = describe(title, detail, baseDate);
    out.lines.push({ date: d.date, bookDate: baseDate, desc: d.desc, title, detail, amount: a.money.v, dir: a.money.sign === '-' ? 'out' : 'in', doc: a.doc, parc: null,
      ...(sec === 'future' ? { role: 'ignore', reason: 'Lançamento futuro (agendado)', future: true } : classifyRole(T)) });
  });
  out.check = checkExtrato(out);
  return out;
}

function checkExtrato(x) {
  const r2 = v => Math.round(v * 100) / 100;
  const net = r2(x.lines.filter(l => !l.future).reduce((s, l) => s + (l.dir === 'in' ? l.amount : -l.amount), 0));
  if (x.saldoIni == null || x.saldoFim == null) return { ok: null, sum: net, msg: 'O documento não traz saldo inicial e final para conferir.' };
  const ok = Math.abs(r2(x.saldoIni + net) - x.saldoFim) < 0.011;
  return ok ? { ok: true, sum: net, msg: `Saldo inicial (${fmt(x.saldoIni)}) + movimentação (${fmt(net)}) = saldo final (${fmt(x.saldoFim)}). Confere.` }
    : { ok: false, sum: net, msg: `Saldo inicial + movimentação dá ${fmt(r2(x.saldoIni + net))}, mas o saldo final impresso é ${fmt(x.saldoFim)}. Pode ter faltado alguma linha.` };
}

/* ---------- CSV ---------- */
export function decodeText(bytes) {
  let s;
  try { s = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { s = new TextDecoder('windows-1252').decode(bytes); }
  return s.replace(/^﻿/, '');
}

export function parseCsvText(text) {
  const first = text.split(/\r?\n/).find(l => l.trim()) || '';
  const count = ch => (first.match(new RegExp('\\' + ch, 'g')) || []).length;
  const delim = [';', ',', '\t'].sort((a, b) => count(b) - count(a))[0];
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim()));
}

function toISO(s) {
  s = String(s || '').trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${pad(m[2])}-${pad(m[1])}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}
function num(s) {
  s = String(s || '').trim().replace(/R\$\s?/, '');
  if (!s) return null;
  const neg = /^-|^\(|-$/.test(s);
  s = s.replace(/[()\s+-]/g, '');
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  const v = parseFloat(s);
  return isNaN(v) ? null : (neg ? -v : v);
}

export function parseCsv(bytes) {
  const rows = parseCsvText(decodeText(bytes));
  const hi = rows.findIndex(r => r.some(c => /^(data|date|dt\.?)\b/i.test(norm(c).trim())));
  if (hi < 0) throw new Error('Não encontrei a coluna de data no CSV.');
  const H = rows[hi].map(c => norm(c).trim());
  const col = (rx, not) => H.findIndex(h => rx.test(h) && !(not && not.test(h)));
  const c = {
    date: col(/^(DATA|DATE|DT)\b/, /COMPENSA|PROCESS/),
    title: col(/LANCAMENTO|HISTORICO|DESCRICAO|TITLE|TITULO|ESTABELECIMENTO|^DESCRIPTION/, /TIPO/),
    detail: col(/DETALHE|COMPLEMENTO|MEMO|OBSERVA/),
    doc: col(/DOCUMENTO|^DOC\b|IDENTIFICADOR|^ID$|^N. ?DOC/),
    amount: col(/^VALOR\b|^AMOUNT|^QUANTIA|^VALOR \(R\$\)|^VALOR EM R\$/, /DOLAR|US\$|USD/),
    debit: col(/DEBITO|SAIDA/), credit: col(/CREDITO|ENTRADA/),
    type: col(/^TIPO/)
  };
  if (c.title < 0) c.title = H.findIndex((h, i) => i !== c.date && i !== c.amount && i !== c.doc && h);
  const all = rows.map(r => r.join(' ')).join('\n');
  const out = { kind: 'extrato', bank: guessBank(all), lines: [], printed: [], saldoIni: null, saldoFim: null, csv: true };
  rows.slice(hi + 1).forEach(r => {
    const date = toISO(r[c.date]); if (!date) return;
    let v = c.amount >= 0 ? num(r[c.amount]) : null;
    if (v == null && (c.debit >= 0 || c.credit >= 0)) { const d = num(r[c.debit]), cr = num(r[c.credit]); v = cr ? Math.abs(cr) : d ? -Math.abs(d) : null; }
    if (v == null) return;
    const tp = c.type >= 0 ? norm(r[c.type]) : '';
    if (/SAIDA|DEBITO|^D$/.test(tp) && v > 0) v = -v;
    if (/ENTRADA|CREDITO|^C$/.test(tp) && v < 0) v = -v;
    const title = (r[c.title] || '').trim(), detail = c.detail >= 0 ? (r[c.detail] || '').trim() : '';
    const T = norm(title);
    if (/SALDO ANTERIOR/.test(T)) { out.saldoIni = v; out.saldoIniDate = date; return; }
    if (/^S\s?A\s?L\s?D\s?O$|SALDO FINAL|SALDO DO DIA|SALDO EM /.test(T)) { out.saldoFim = v; return; }
    const d = describe(title, detail, date);
    out.lines.push({ date: d.date, bookDate: date, desc: d.desc, title, detail, amount: Math.abs(v), sign: v < 0 ? -1 : 1, dir: v < 0 ? 'out' : 'in', doc: c.doc >= 0 ? (r[c.doc] || '').trim() : '', parc: null, ...classifyRole(T + ' ' + norm(detail)) });
  });
  out.check = checkExtrato(out);
  return out;
}

/* CSV de cartão (ex.: data, título, valor positivo = compra): converte quando o destino é um cartão */
export function asFatura(st) {
  if (st.kind === 'fatura') return st;
  const pos = st.lines.filter(l => l.sign > 0).length, neg = st.lines.length - pos;
  const purchasesPositive = pos >= neg;
  return {
    ...st, kind: 'fatura', converted: true,
    lines: st.lines.map(l => {
      const T = norm(l.title + ' ' + l.desc);
      const isPurchase = purchasesPositive ? l.sign > 0 : l.sign < 0;
      const role = FATURA_SKIP.test(T) ? { role: 'ignore', reason: 'Pagamento ou saldo da fatura' } : { role: 'normal' };
      const parc = extractParc(l.desc);
      return { ...l, desc: parc ? parc.clean : l.desc, parc: parc ? { i: parc.i, n: parc.n } : null, date: l.bookDate || l.date, dir: isPurchase ? 'out' : 'in', ...role };
    }),
    check: { ok: null, msg: 'Arquivo CSV sem total impresso para conferir.' }
  };
}

/* ---------- OFX ---------- */
export function parseOfx(bytes) {
  const text = decodeText(bytes);
  const tag = (blk, t) => { const m = blk.match(new RegExp('<' + t + '>([^<\\r\\n]*)', 'i')); return m ? m[1].trim() : ''; };
  const isCard = /<CCSTMTRS>/i.test(text);
  const out = { kind: isCard ? 'fatura' : 'extrato', bank: guessBank(tag(text, 'ORG') + ' ' + text.slice(0, 2000)), lines: [], printed: [], saldoIni: null, saldoFim: null, ofx: true };
  const blocks = text.split(/<STMTTRN>/i).slice(1).map(b => b.split(/<\/STMTTRN>/i)[0]);
  blocks.forEach(b => {
    const dt = tag(b, 'DTPOSTED'); const date = dt ? `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}` : null;
    const v = parseFloat(tag(b, 'TRNAMT').replace(',', '.')); if (!date || isNaN(v)) return;
    const title = tag(b, 'MEMO') || tag(b, 'NAME'), detail = tag(b, 'NAME') && tag(b, 'MEMO') ? tag(b, 'NAME') : '';
    const T = norm(title + ' ' + detail);
    const d = describe(title, detail, date);
    const line = { date: d.date, bookDate: date, desc: d.desc, title, detail, amount: Math.abs(v), dir: v < 0 ? 'out' : 'in', doc: tag(b, 'FITID'), parc: null };
    if (isCard) { const parc = extractParc(line.desc); Object.assign(line, parc ? { desc: parc.clean, parc: { i: parc.i, n: parc.n } } : {}, FATURA_SKIP.test(T) ? { role: 'ignore', reason: 'Pagamento ou saldo da fatura' } : { role: 'normal' }); }
    else Object.assign(line, classifyRole(T));
    out.lines.push(line);
  });
  const bal = text.match(/<LEDGERBAL>[\s\S]*?<BALAMT>([-\d.,]+)/i); if (bal) out.saldoFim = parseFloat(bal[1].replace(',', '.'));
  out.check = isCard ? { ok: null, msg: 'OFX de cartão: confira o total com a fatura.' } : { ok: null, msg: 'OFX sem saldo inicial para conferir.' };
  return out;
}
