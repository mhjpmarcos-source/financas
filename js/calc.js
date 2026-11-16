/* Cálculos: competência de cartão, faturas e saldos. Adaptados do sistema antigo. */
const pad = n => String(n).padStart(2, '0');
export const mOf = d => d.slice(0, 7);
export function mAdd(m, n) { let [y, mo] = m.split('-').map(Number); mo += n; y += Math.floor((mo - 1) / 12); mo = ((mo - 1) % 12 + 12) % 12 + 1; return y + '-' + pad(mo); }
export const daysIn = m => { const [y, mo] = m.split('-').map(Number); return new Date(y, mo, 0).getDate(); };
export const clampDay = (m, d) => m + '-' + pad(Math.min(Math.max(1, d), daysIn(m)));
export const r2 = v => Math.round((+v || 0) * 100) / 100;

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const monthLabel = m => { const s = MONTHS[+m.slice(5) - 1]; return s[0].toUpperCase() + s.slice(1) + ' de ' + m.slice(0, 4); };
const NF = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const brl = v => NF.format(r2(v));
export const fmtD = d => d ? d.slice(8, 10) + '/' + d.slice(5, 7) : '';

/* converte "1.234,56", "1234,56", "R$ 12" ou "-3,5" em número */
export function parseMoney(s) {
  if (typeof s === 'number') return s;
  s = String(s || '').trim().replace(/R\$\s?/, '');
  if (!s) return 0;
  const neg = s.startsWith('-') || /-$/.test(s);
  s = s.replace(/[\s-]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const v = parseFloat(s);
  return isNaN(v) ? 0 : r2(neg ? -v : v);
}

/* em que fatura (competência = mês do vencimento) cai uma compra no cartão */
export function cardCycle(card, date) {
  const C = +card.closeDay || 0, V = +card.dueDay || 0, m = mOf(date), d = +date.slice(8, 10);
  if (!C) return { comp: m, due: clampDay(m, V || 10) };
  const closeM = d < C ? m : mAdd(m, 1);
  const dueM = V > C ? closeM : mAdd(closeM, 1);
  return { comp: dueM, due: clampDay(dueM, V || C) };
}

export function txComp(S, t) {
  if (t.comp) return t.comp;
  if (t.type === 'cred') { const c = S.accounts.find(a => a.id === t.accountId); return c ? cardCycle(c, t.date).comp : mOf(t.date); }
  return mOf(t.date);
}

/* faturas: soma das compras de cada cartão por competência; o pagamento sai da conta de pagamento no vencimento */
export function faturas(S) {
  const map = {};
  S.tx.forEach(t => {
    if (t.type !== 'cred') return;
    const c = S.accounts.find(a => a.id === t.accountId); if (!c) return;
    const comp = txComp(S, t), k = c.id + '|' + comp;
    (map[k] = map[k] || { card: c, comp, total: 0, n: 0 }).total += t.amount; map[k].n++;
  });
  return Object.values(map).map(f => {
    const key = f.card.id + '|' + f.comp, meta = S.faturaMeta[key] || {};
    return {
      key, cardId: f.card.id, comp: f.comp, n: f.n, total: r2(f.total + (+meta.adjust || 0)),
      date: meta.date || clampDay(f.comp, +f.card.dueDay || +f.card.closeDay || 10),
      accountId: meta.accountId || f.card.payAccount || '', status: meta.status || 'pend'
    };
  });
}

/* saldo de cada conta numa data; lq = só o que já foi pago/recebido */
export function balances(S, date, lq) {
  const out = {};
  S.accounts.filter(a => a.nature === 'debito').forEach(a => { out[a.id] = +a.initial || 0; });
  const add = (id, v, d) => { if (d <= date && id in out) out[id] += v; };
  S.tx.forEach(t => {
    if (lq && t.status !== 'liq') return;
    if (t.type === 'rec') add(t.accountId, t.amount, t.date);
    else if (t.type === 'deb') add(t.accountId, -t.amount, t.date);
    else if (t.type === 'trf') { add(t.accountId, -t.amount, t.date); add(t.toAccountId, t.amount, t.date); }
  });
  faturas(S).forEach(f => { if (lq && f.status !== 'liq') return; add(f.accountId, -f.total, f.date); });
  Object.keys(out).forEach(k => { out[k] = r2(out[k]); });
  return out;
}

/* resumo do mês: receitas, despesas (débito + compras no cartão da competência) */
export function monthSummary(S, m) {
  let rec = 0, desp = 0;
  S.tx.forEach(t => {
    if (t.type === 'rec' && mOf(t.date) === m) rec += t.amount;
    else if (t.type === 'deb' && mOf(t.date) === m) desp += t.amount;
    else if (t.type === 'cred' && txComp(S, t) === m) desp += t.amount;
  });
  return { rec: r2(rec), desp: r2(desp), saldo: r2(rec - desp) };
}

/* compras de uma fatura (cartão + competência) */
export function faturaOf(S, cardId, comp) {
  const list = S.tx.filter(t => t.type === 'cred' && t.accountId === cardId && txComp(S, t) === comp).sort((a, b) => b.date.localeCompare(a.date));
  const f = faturas(S).find(x => x.cardId === cardId && x.comp === comp);
  const card = S.accounts.find(a => a.id === cardId);
  return {
    list, total: f ? f.total : 0, status: f ? f.status : 'pend', accountId: f ? f.accountId : (card && card.payAccount),
    date: f ? f.date : clampDay(comp, +(card && card.dueDay) || 10), key: cardId + '|' + comp
  };
}

/* despesas do mês por grupo e categoria (débito no mês + cartão pela competência) */
export function byCategory(S, m, kind = 'despesa') {
  const groups = {};
  S.tx.forEach(t => {
    const isExp = (t.type === 'deb' && mOf(t.date) === m) || (t.type === 'cred' && txComp(S, t) === m);
    const isRec = t.type === 'rec' && mOf(t.date) === m;
    if (!(kind === 'despesa' ? isExp : isRec)) return;
    const it = S.items.find(i => i.id === t.itemId), g = it && S.groups.find(x => x.id === it.groupId);
    const gk = g ? g.id : '_', ik = it ? it.id : '_';
    const G = groups[gk] = groups[gk] || { id: gk, name: g ? g.name : 'Sem categoria', color: g ? g.color : '#90a4ae', total: 0, items: {} };
    G.total += t.amount;
    const I = G.items[ik] = G.items[ik] || { id: ik, name: it ? it.name : 'Sem categoria', total: 0, n: 0 };
    I.total += t.amount; I.n++;
  });
  return Object.values(groups).map(g => ({ ...g, total: r2(g.total), items: Object.values(g.items).map(i => ({ ...i, total: r2(i.total) })).sort((a, b) => b.total - a.total) }))
    .sort((a, b) => b.total - a.total);
}

/* receitas e despesas dos n meses que terminam em `end` */
export function monthSeries(S, end, n) {
  return Array.from({ length: n }, (_, i) => { const m = mAdd(end, i - n + 1); return { m, ...monthSummary(S, m) }; });
}

/* busca: descrição, categoria, conta ou valor */
export function search(S, q) {
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const words = norm(q).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const num = parseMoney(q);
  return S.tx.filter(t => {
    const it = S.items.find(i => i.id === t.itemId), acc = S.accounts.find(a => a.id === t.accountId);
    const hay = norm([t.desc, it && it.name, acc && acc.name, String(t.amount).replace('.', ',')].join(' '));
    return words.every(w => hay.includes(w)) || (num > 0 && Math.abs(t.amount - num) < 0.005);
  }).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 200);
}
