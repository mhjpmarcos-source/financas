/* Cálculos: competência de cartão, faturas e saldos. Adaptados do sistema antigo. */
import * as M from './model.js';
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

/* reservas: quanto tem, quanto falta, quanto guardar por mês até o prazo, e quanto do saldo fica livre */
export function reserves(S, today) {
  const list = (S.res || []).map(r => {
    const saved = r2((r.movs || []).reduce((s, m) => s + m.v, 0));
    const rest = r2(Math.max(0, (r.target || 0) - saved));
    let months = null, perMonth = null;
    if (r.deadline && rest > 0) {
      months = Math.max(1, (+r.deadline.slice(0, 4) - +today.slice(0, 4)) * 12 + (+r.deadline.slice(5, 7) - +today.slice(5, 7)) + (r.deadline >= today ? 1 : 0));
      perMonth = r2(Math.ceil(rest / months * 100) / 100);
    }
    const thisMonth = r2((r.movs || []).filter(m => !m.ini && m.date.slice(0, 7) === today.slice(0, 7)).reduce((s, m) => s + m.v, 0));
    return { r, saved, rest, pct: r.target ? Math.min(100, saved / r.target * 100) : null, months, perMonth, thisMonth, late: !!(r.deadline && r.deadline < today && rest > 0) };
  });
  const active = list.filter(x => !x.r.done);
  return { list: active.concat(list.filter(x => x.r.done)), total: r2(active.reduce((s, x) => s + x.saved, 0)) };
}

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
  if (t.type === 'cred') { const c = S.accounts.find(a => a.id === t.accountId); return c ? M.skipComp(S, c.id, cardCycle(c, t.date).comp) : mOf(t.date); }
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
  // pagamentos de fatura (lançamentos "Pagar fatura") vinculados a cada fatura
  const pays = {};
  S.tx.forEach(t => { if (t.cardPay && t.faturaKey && t.status !== 'pend') (pays[t.faturaKey] = pays[t.faturaKey] || []).push(t); });
  Object.keys(pays).forEach(k => { if (!map[k]) { const [cid, comp] = k.split('|'); const c = S.accounts.find(a => a.id === cid); if (c) map[k] = { card: c, comp, total: 0, n: 0 }; } });
  return Object.values(map).map(f => {
    const key = f.card.id + '|' + f.comp, meta = S.faturaMeta[key] || {};
    const total = r2(f.total + (+meta.adjust || 0));
    const paid = r2((pays[key] || []).reduce((s, t) => s + t.amount, 0));
    // paga: marcada à mão ou pagamentos vinculados cobrem o total; parcial: pagou parte
    const status = meta.status === 'liq' || (total > 0 && paid >= total - 0.005) ? 'liq' : paid > 0 ? 'parc' : (meta.status || 'pend');
    return {
      key, cardId: f.card.id, comp: f.comp, n: f.n, total, paid, rest: r2(Math.max(0, total - paid)), payments: pays[key] || [],
      date: meta.date || clampDay(f.comp, +f.card.dueDay || +f.card.closeDay || 10),
      accountId: meta.accountId || f.card.payAccount || '', status, manual: meta.status === 'liq'
    };
  });
}

/* saldo de cada conta numa data; lq = só o que já foi pago/recebido */
export function balances(S, date, lq) {
  const out = {};
  const start = {};
  S.accounts.filter(a => a.nature === 'debito').forEach(a => { out[a.id] = +a.initial || 0; start[a.id] = a.initialDate || ''; });
  // o saldo inicial vale no fim do dia initialDate: só entram movimentos depois dele
  const add = (id, v, d) => { if (d <= date && id in out && d > start[id]) out[id] += v; };
  S.tx.forEach(t => {
    if (lq && t.status !== 'liq') return;
    if (t.folha) return; // desconto em folha: o salário já entrou líquido, não sai da conta de novo
    if (t.type === 'rec') add(t.accountId, t.amount, t.date);
    else if (t.type === 'deb') add(t.accountId, -t.amount, t.date);
    else if (t.type === 'trf') { add(t.accountId, -t.amount, t.date); add(t.toAccountId, t.amount, t.date); }
  });
  // o dinheiro só sai da conta por lançamentos (pagamentos de fatura). Fatura "marcada como paga" sem lançamento não tira nada:
  // foi paga antes de usar o app ou o pagamento já está na conta como outro lançamento. A previsão desconta o que falta das não pagas.
  if (!lq) faturas(S).forEach(f => { if (f.total > 0 && f.status !== 'liq' && f.rest > 0) add(f.accountId, -f.rest, f.date); });
  Object.keys(out).forEach(k => { out[k] = r2(out[k]); });
  return out;
}

/* resumo do mês: receitas, despesas (débito + compras no cartão da competência).
   Desconto em folha contado como despesa (consignado, plano de saúde): entra nas despesas e, no mesmo valor, nas receitas,
   porque o salário foi lançado pelo líquido; assim o resultado continua igual ao que passou pela conta.
   Ajuste de valor de investimento (adj) fica de fora. */
/* portador do cartão (ver holder.js): pelo final de 4 dígitos guardado na compra */
export const cardRefOf = s => { const m = String(s || '').match(/(\d{4})\D*$/); return m ? m[1] : ''; };
export function holderOf(S, t) {
  if (!t || t.type !== 'cred' || !t.cardRef) return null;
  const card = S.accounts.find(a => a.id === t.accountId), ref = cardRefOf(t.cardRef);
  return ((card && card.holders) || []).find(h => h.ref === ref) || null;
}
/* compra de portador que devolve o dinheiro: não é despesa de quem paga a fatura (o reembolso também não é receita) */
export const isThird = (S, t) => { const h = holderOf(S, t); return !!(h && h.reimb && !(h.since && txComp(S, t) < h.since)); };

export function monthSummary(S, m) {
  let rec = 0, desp = 0, folha = 0, terc = 0;
  S.tx.forEach(t => {
    if (t.adj || t.reimb) return;
    if (t.type === 'cred' && isThird(S, t)) { if (txComp(S, t) === m) terc += t.amount; return; }
    if (t.type === 'rec' && mOf(t.date) === m) rec += t.amount;
    else if (t.type === 'deb' && !t.cardPay && mOf(t.date) === m) { desp += t.amount; if (t.folha) { rec += t.amount; folha += t.amount; } }
    else if (t.type === 'cred' && txComp(S, t) === m) desp += t.amount;
  });
  return terc ? { rec: r2(rec), desp: r2(desp), saldo: r2(rec - desp), folha: r2(folha), terc: r2(terc) } : { rec: r2(rec), desp: r2(desp), saldo: r2(rec - desp), folha: r2(folha) };
}

/* dinheiro que foi para investimentos no mês: aportes − resgates (transferências entre conta comum e conta de investimento) */
export function invFlow(S, m) {
  const inv = new Set(S.accounts.filter(a => a.inv).map(a => a.id));
  let inn = 0, out = 0;
  if (inv.size) S.tx.forEach(t => {
    if (t.type !== 'trf' || mOf(t.date) !== m) return;
    const a = inv.has(t.accountId), b = inv.has(t.toAccountId);
    if (b && !a) inn += t.amount; else if (a && !b) out += t.amount;
  });
  return { aportes: r2(inn), resgates: r2(out), net: r2(inn - out) };
}
/* rendimento registrado (ajustes de valor) de uma conta de investimento, no mês e no ano de `date` */
export function invYield(S, accId, date) {
  let mes = 0, ano = 0;
  S.tx.forEach(t => {
    if (!t.adj || t.accountId !== accId || t.date > date) return;
    const v = t.type === 'rec' ? t.amount : -t.amount;
    if (t.date.slice(0, 4) === date.slice(0, 4)) ano += v;
    if (t.date.slice(0, 7) === date.slice(0, 7)) mes += v;
  });
  return { mes: r2(mes), ano: r2(ano) };
}

/* de onde vem o saldo de uma conta: saldo inicial + entradas − saídas, e o que ainda está pendente até o fim do mês */
export function balanceBreakdown(S, accId, today) {
  const a = S.accounts.find(x => x.id === accId); if (!a) return null;
  const start = a.initialDate || '', eom = today.slice(0, 7) + '-31';
  const parts = (limit, lq) => {
    const p = { rec: 0, deb: 0, cardPay: 0, trfIn: 0, trfOut: 0, adj: 0, fat: 0, n: 0 };
    const ok = (d, t) => d <= limit && d > start && !(lq && t && t.status !== 'liq');
    S.tx.forEach(t => {
      if (t.folha || !ok(t.date, t)) return;
      if (t.type === 'trf') { if (t.accountId === accId) { p.trfOut += t.amount; p.n++; } if (t.toAccountId === accId) { p.trfIn += t.amount; p.n++; } return; }
      if (t.accountId !== accId) return;
      if (t.adj) p.adj += t.type === 'rec' ? t.amount : -t.amount;
      else if (t.type === 'rec') p.rec += t.amount;
      else if (t.type === 'deb') { if (t.cardPay) p.cardPay += t.amount; else p.deb += t.amount; }
      else return;
      p.n++;
    });
    if (!lq) faturas(S).forEach(f => { if (f.total <= 0 || f.accountId !== accId || f.rest <= 0 || f.status === 'liq') return; if (f.date <= limit && f.date > start) p.fat += f.rest; });
    Object.keys(p).forEach(k => { p[k] = r2(p[k]); });
    p.total = r2((+a.initial || 0) + p.rec - p.deb - p.cardPay + p.trfIn - p.trfOut + p.adj - p.fat);
    return p;
  };
  const now = parts(today, true), end = parts(eom, false);
  const d = k => r2(end[k] - now[k]);
  return { initial: r2(+a.initial || 0), initialDate: start, now, end,
    pend: { rec: d('rec'), deb: d('deb'), cardPay: d('cardPay'), trfIn: d('trfIn'), trfOut: d('trfOut'), fat: d('fat') } };
}

/* compras de uma fatura (cartão + competência) */
export function faturaOf(S, cardId, comp) {
  const list = S.tx.filter(t => t.type === 'cred' && t.accountId === cardId && txComp(S, t) === comp).sort((a, b) => b.date.localeCompare(a.date));
  const f = faturas(S).find(x => x.cardId === cardId && x.comp === comp);
  const card = S.accounts.find(a => a.id === cardId);
  return {
    list, total: f ? f.total : 0, status: f ? f.status : 'pend', accountId: f ? f.accountId : (card && card.payAccount),
    date: f ? f.date : clampDay(comp, +(card && card.dueDay) || 10), key: cardId + '|' + comp,
    paid: f ? f.paid : 0, rest: f ? f.rest : 0, payments: f ? f.payments : [], manual: f ? f.manual : false
  };
}

/* despesas do mês por grupo e categoria (débito no mês + cartão pela competência) */
export function byCategory(S, m, kind = 'despesa') {
  const groups = {};
  S.tx.forEach(t => {
    if (t.adj || t.reimb || (t.type === 'cred' && isThird(S, t))) return;
    const isExp = (t.type === 'deb' && !t.cardPay && mOf(t.date) === m) || (t.type === 'cred' && txComp(S, t) === m);
    const isFolha = isExp && t.folha; // desconto em folha: também soma na receita do salário (ver monthSummary)
    const isRec = t.type === 'rec' && mOf(t.date) === m;
    if (!(kind === 'despesa' ? isExp : isRec || isFolha)) return;
    const it = S.items.find(i => i.id === (kind === 'receita' && isFolha ? t.folhaItem : t.itemId)), g = it && S.groups.find(x => x.id === it.groupId);
    const gk = g ? g.id : '_', ik = it ? it.id : '_';
    const G = groups[gk] = groups[gk] || { id: gk, name: g ? g.name : 'Sem categoria', color: g ? g.color : '#90a4ae', total: 0, items: {} };
    G.total += t.amount;
    const I = G.items[ik] = G.items[ik] || { id: ik, name: it ? it.name : 'Sem categoria', total: 0, n: 0 };
    I.total += t.amount; if (!(kind === 'receita' && isFolha)) I.n++;
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
    const hay = norm([t.desc, t.rawDesc, it && it.name, acc && acc.name, String(t.amount).replace('.', ',')].join(' '));
    return words.every(w => hay.includes(w)) || (num > 0 && Math.abs(t.amount - num) < 0.005);
  }).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 200);
}

/* pendências: receitas e despesas não confirmadas + faturas não pagas, por data */
export function pendings(S, until) {
  const out = [];
  S.tx.forEach(t => {
    if (t.status !== 'pend' || !['rec', 'deb'].includes(t.type) || t.folha) return; // desconto em folha agendado não é conta a pagar
    if (until && t.date > until) return;
    out.push({ kind: 'tx', date: t.date, amount: t.amount, dir: t.type === 'rec' ? 'in' : 'out', tx: t });
  });
  faturas(S).forEach(f => {
    if (f.status === 'liq' || f.rest <= 0 || (until && f.date > until)) return;
    out.push({ kind: 'fatura', date: f.date, amount: f.rest, dir: 'out', fatura: f });
  });
  return out.sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount);
}

/* faturas que um pagamento pode quitar: do cartão escolhido (ou dos cartões pagos por esta conta), com saldo em aberto.
   A primeira da lista é a sugestão: valor idêntico ao que falta e vencimento mais próximo. */
export function faturaCandidates(S, { accountId, cardId, date, amount }) {
  const cards = S.accounts.filter(a => a.nature === 'credito' && (cardId ? a.id === cardId : (!accountId || a.payAccount === accountId || !a.payAccount)));
  const days = (a, b) => Math.abs((Date.parse(a + 'T12:00') - Date.parse(b + 'T12:00')) / 864e5);
  return faturas(S).filter(f => cards.some(c => c.id === f.cardId) && (f.rest > 0.005 || f.status === 'parc'))
    .map(f => ({ ...f, exact: amount != null && Math.abs(f.rest - amount) < 0.01, dist: date ? days(f.date, date) : 0 }))
    .filter(f => !date || f.dist <= 75)
    .sort((a, b) => (b.exact - a.exact) || (a.dist - b.dist));
}

/* ---------- contas que se repetem ---------- */
/* estatística dos meses já confirmados (não previstos) de uma regra */
export function recStats(S, r) {
  const real = S.tx.filter(t => t.recId === r.id && !t.prev && (t.type === 'cred' || t.status === 'liq')).sort((a, b) => a.recM < b.recM ? -1 : 1).slice(-6);
  const v = real.map(t => Math.abs(t.amount));
  if (!v.length) return { n: 0 };
  const last3 = v.slice(-3);
  return { n: v.length, last: v[v.length - 1], avg3: r2(last3.reduce((s, x) => s + x, 0) / last3.length), min: Math.min(...v), max: Math.max(...v), lastM: real[real.length - 1].recM };
}
/* procura no histórico despesas (e receitas) que aparecem quase todo mês e ainda não estão cadastradas como fixas.
   Olha os 6 meses completos anteriores: precisa aparecer em pelo menos 3 deles (um dos 2 últimos), no máximo ~1 vez por mês.
   Valor igual todo mês → fixa; valor que varia (até ~60%) → variável. */
export function detectRecurring(S, today = M.todayISO()) {
  const cur = today.slice(0, 7), months = Array.from({ length: 6 }, (_, i) => mAdd(cur, -6 + i));
  const ign = new Set((S.config && S.config.recIgnore) || []);
  const groups = new Map();
  S.tx.forEach(t => {
    if (!['deb', 'cred', 'rec'].includes(t.type) || t.cardPay || t.recId || t.seriesId || t.parcKey || t.loanId || t.prev || t.folha || t.adj || t.slipId || t.reimb || t.amount <= 0) return;
    if (t.type !== 'cred' && t.status !== 'liq') return;
    const m = t.type === 'cred' ? txComp(S, t) : t.date.slice(0, 7);
    if (!months.includes(m)) return;
    const words = M.normDesc(t.desc.replace(/\(\d+\/\d+\)/, '')).split(' ').filter(w => w.length > 1 && !/^\d+$/.test(w)).slice(0, 3).join(' ');
    const key = (t.type === 'rec' ? 'in' : 'out') + '|' + (words || 'cat:' + t.itemId);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ t, m });
  });
  const out = [];
  groups.forEach((list, key) => {
    if (ign.has(key)) return;
    const per = {}; list.forEach(({ t, m }) => { per[m] = (per[m] || 0) + t.amount; });
    const ms = Object.keys(per).sort();
    if (ms.length < 3 || list.length > ms.length * 1.35 || !ms.some(m => m >= months[4])) return;
    const v = ms.map(m => r2(per[m])), avg = v.reduce((s, x) => s + x, 0) / v.length, mn = Math.min(...v), mx = Math.max(...v);
    const fixa = mx - mn <= Math.max(0.01, avg * 0.01);
    if (!fixa && (mx - mn) / avg > 0.6) return;
    const last = list.slice().sort((a, b) => a.t.date < b.t.date ? 1 : -1)[0].t;
    const cnt = {}; list.forEach(({ t }) => { if (t.itemId) cnt[t.itemId] = (cnt[t.itemId] || 0) + 1; });
    const itemId = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0] || last.itemId;
    const daysL = list.map(({ t }) => +t.date.slice(8, 10)).sort((a, b) => a - b);
    const last3 = v.slice(-3);
    out.push({ key, kind: fixa ? 'fixa' : 'var', type: last.type, desc: last.desc.replace(/\s*\(\d+\/\d+\)\s*$/, ''), itemId, accountId: last.accountId,
      amount: fixa ? v[v.length - 1] : r2(last3.reduce((s, x) => s + x, 0) / last3.length), min: mn, max: mx, n: ms.length, day: daysL[Math.floor(daysL.length / 2)],
      lastM: ms[ms.length - 1], txIds: list.map(({ t }) => t.id) });
  });
  return out.sort((a, b) => b.amount - a.amount);
}
/* compras parceladas: quanto falta e até quando (previstas + em aberto) */
export function parcelSummary(S, today = M.todayISO()) {
  return M.parcelPlans(S).map(list => {
    list.sort((a, b) => (a.parcI || a.seriesIdx) - (b.parcI || b.seriesIdx));
    const first = list[0], n = first.parcN || first.seriesN, acc = S.accounts.find(a => a.id === first.accountId);
    const isCard = first.type === 'cred';
    const card = isCard ? acc : null, curComp = card ? cardCycle(card, today).comp : null;
    const open = list.filter(t => isCard ? txComp(S, t) >= curComp : t.status === 'pend');
    const lastT = list[list.length - 1];
    return { desc: first.desc.replace(/\s*\(\d+\/\d+\)\s*$/, ''), accountId: first.accountId, isCard, n, have: list.length, open: open.length, rest: r2(open.reduce((s, t) => s + t.amount, 0)),
      parcel: open[0] ? open[0].amount : lastT.amount, until: isCard ? txComp(S, lastT) : lastT.date.slice(0, 7), prev: list.filter(t => t.prev).length, firstId: first.id };
  }).filter(p => p.open > 0).sort((a, b) => a.until < b.until ? -1 : 1);
}

/* ---------- orçamento ---------- */
export function budgetOf(S, itemId, m) {
  const o = S.orc && S.orc[itemId]; if (!o) return 0;
  return o.months && o.months[m] != null ? +o.months[m] : (+o.def || 0);
}
/* planejado × realizado do mês, por grupo e categoria (só categorias com orçamento ou gasto) */
export function budgetMonth(S, m, kind = 'despesa') {
  const real = {};
  byCategory(S, m, kind).forEach(g => g.items.forEach(i => { real[i.id] = i.total; }));
  const out = S.groups.filter(g => g.kind === kind).map(g => {
    const items = S.items.filter(i => i.groupId === g.id).map(i => ({ id: i.id, name: i.name, plan: r2(budgetOf(S, i.id, m)), real: r2(real[i.id] || 0) }))
      .filter(i => i.plan || i.real);
    return { id: g.id, name: g.name, color: g.color, items, plan: r2(items.reduce((s, i) => s + i.plan, 0)), real: r2(items.reduce((s, i) => s + i.real, 0)) };
  }).filter(g => g.items.length);
  const noCat = real._ || 0;
  return { groups: out, plan: r2(out.reduce((s, g) => s + g.plan, 0)), real: r2(out.reduce((s, g) => s + g.real, 0) + noCat), noCat: r2(noCat) };
}
/* média mensal dos últimos n meses fechados antes de m (para sugerir orçamento) */
export function avgLast(S, itemId, m, n = 3) {
  let s = 0;
  for (let i = 1; i <= n; i++) { const mm = mAdd(m, -i); byCategory(S, mm).forEach(g => g.items.forEach(x => { if (x.id === itemId) s += x.total; })); }
  return r2(s / n);
}

/* ---------- relatório anual ---------- */
export function yearTable(S, year) {
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${pad(i + 1)}`);
  const build = kind => {
    const per = months.map(m => byCategory(S, m, kind));
    const groups = {};
    per.forEach((list, mi) => list.forEach(g => {
      const G = groups[g.id] = groups[g.id] || { id: g.id, name: g.name, color: g.color, months: Array(12).fill(0), items: {} };
      G.months[mi] = r2(G.months[mi] + g.total);
      g.items.forEach(it => { const I = G.items[it.id] = G.items[it.id] || { id: it.id, name: it.name, months: Array(12).fill(0) }; I.months[mi] = r2(I.months[mi] + it.total); });
    }));
    return Object.values(groups).map(g => ({ ...g, total: r2(g.months.reduce((a, b) => a + b, 0)), items: Object.values(g.items).map(i => ({ ...i, total: r2(i.months.reduce((a, b) => a + b, 0)) })).sort((a, b) => b.total - a.total) }))
      .sort((a, b) => b.total - a.total);
  };
  const rec = build('receita'), desp = build('despesa');
  const sumM = list => months.map((_, i) => r2(list.reduce((s, g) => s + g.months[i], 0)));
  const recM = sumM(rec), despM = sumM(desp);
  return { months, rec, desp, recM, despM, resM: recM.map((v, i) => r2(v - despM[i])), recT: r2(recM.reduce((a, b) => a + b, 0)), despT: r2(despM.reduce((a, b) => a + b, 0)) };
}

/* ---------- exportação ---------- */
/* texto que começa com = + - @ viraria fórmula ao abrir no Excel (o nome vem do banco ou de quem digitou): ganha um apóstrofo na frente */
const csvCell = v => { let s = String(v ?? ''); if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s) && !/^-?\d[\d.,]*$/.test(s)) s = "'" + s; return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const csvNum = v => (Math.round(v * 100) / 100).toFixed(2).replace('.', ',');
export function toCsv(rows) { return '\uFEFF' + rows.map(r => r.map(csvCell).join(';')).join('\r\n') + '\r\n'; }

/* lançamentos de um período (por data; cartão também pela competência), valor com sinal: entrada +, saída − */
export function txCsv(S, from, to) {
  const TYPE = { rec: 'Receita', deb: 'Despesa', cred: 'Cartão', trf: 'Transferência' };
  const acc = id => (S.accounts.find(a => a.id === id) || {}).name || '';
  const rows = [['Data', 'Competência', 'Tipo', 'Descrição', 'Categoria', 'Grupo', 'Conta/Cartão', 'Conta destino', 'Valor', 'Situação', 'Parcela', 'Origem']];
  S.tx.filter(t => { const d = t.type === 'cred' ? txComp(S, t) + '-01' : t.date; return (!from || d >= from) && (!to || d <= to); })
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach(t => {
      const it = S.items.find(i => i.id === t.itemId), g = it && S.groups.find(x => x.id === it.groupId);
      const signed = t.type === 'rec' ? t.amount : -t.amount;
      rows.push([t.date.split('-').reverse().join('/'), txComp(S, t).split('-').reverse().join('/'), t.cardPay ? 'Pagamento de fatura' : t.folha ? 'Desconto em folha' : t.adj ? 'Ajuste de investimento' : TYPE[t.type] || t.type, t.desc || '',
        it ? it.name : '', g ? g.name : '', acc(t.accountId), t.type === 'trf' ? acc(t.toAccountId) : '', csvNum(signed),
        t.status === 'pend' ? 'Pendente' : 'Confirmado', t.seriesId ? `${t.seriesIdx}/${t.seriesN}` : '', t.origin === 'import' ? 'Importado' : 'Manual']);
    });
  return toCsv(rows);
}
export function yearCsv(S, year) {
  const Y = yearTable(S, year), head = ['Grupo', 'Categoria', ...Y.months.map(m => m.slice(5) + '/' + m.slice(0, 4)), 'Total'];
  const rows = [head];
  const add = (title, list, tot, totT) => {
    rows.push([title, '', ...tot.map(csvNum), csvNum(totT)]);
    list.forEach(g => { rows.push([g.name, '', ...g.months.map(csvNum), csvNum(g.total)]); g.items.forEach(i => rows.push(['', i.name, ...i.months.map(csvNum), csvNum(i.total)])); });
  };
  add('RECEITAS', Y.rec, Y.recM, Y.recT); add('DESPESAS', Y.desp, Y.despM, Y.despT);
  rows.push(['RESULTADO', '', ...Y.resM.map(csvNum), csvNum(Y.recT - Y.despT)]);
  return toCsv(rows);
}

/* ---------- lembretes: arquivo de calendário (.ics) com os vencimentos pendentes ---------- */
const icsEsc = s => String(s || '').replace(/[\\;,]/g, c => '\\' + c).replace(/\n/g, '\\n');
export function icsPendings(S, { until, hour = 9, appName = 'Níquel' } = {}) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//' + appName + '//PT-BR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:' + icsEsc(appName + ' · vencimentos')];
  pendings(S, until).forEach(p => {
    const d = p.date.replace(/-/g, ''), next = new Date(Date.parse(p.date + 'T12:00') + 864e5).toISOString().slice(0, 10).replace(/-/g, '');
    const card = p.kind === 'fatura' && S.accounts.find(a => a.id === p.fatura.cardId);
    const title = p.kind === 'fatura' ? `Pagar fatura ${card ? card.name : ''}: ${brl(p.amount)}` : `${p.dir === 'in' ? 'Receber' : 'Pagar'}: ${p.tx.desc || ((S.items.find(i => i.id === p.tx.itemId) || {}).name) || ''} ${brl(p.amount)}`;
    const uid = (p.kind === 'fatura' ? 'fat-' + p.fatura.key.replace('|', '-') : 'tx-' + p.tx.id) + '@financas';
    lines.push('BEGIN:VEVENT', 'UID:' + uid, 'DTSTAMP:' + stamp, 'DTSTART;VALUE=DATE:' + d, 'DTEND;VALUE=DATE:' + next, 'SUMMARY:' + icsEsc(title.replace(/\s+/g, ' ').trim()),
      'TRANSP:TRANSPARENT', 'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEsc(title), `TRIGGER:-PT${24 - hour}H`, 'END:VALARM', 'END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return lines.map(l => l.length > 74 ? l.match(/.{1,73}/g).join('\r\n ') : l).join('\r\n') + '\r\n';
}

/* ----- assinaturas no cartão -----
   Mais solta que detectRecurring (que pede 3 meses): compra no cartão do mesmo lugar em 2 faturas seguidas com valor parecido,
   ou uma compra só quando o nome é de serviço por assinatura. A pessoa confirma ("É assinatura") ou dispensa; nada é criado sozinho.
   Devolve o mesmo formato de detectRecurring, com sub: true. */
const SUB_NAMES = /NETFLIX|SPOTIFY|DISNEY|\bHBO\b|\bMAX\b|PRIME ?VIDEO|AMAZON ?PRIME|YOUTUBE|GLOBOPLAY|PARAMOUNT|APPLE ?\.? ?COM|ICLOUD|APPLE ?(TV|MUSIC|ONE)|GOOGLE ?(ONE|STORAGE|PLAY)|DEEZER|\bUOL\b|MICROSOFT|OFFICE ?365|ADOBE|OPENAI|CHATGPT|CLAUDE|CANVA|DROPBOX|CRUNCHYROLL|KINDLE|AUDIBLE|TELECINE|PREMIERE|ASSINATURA|MENSALIDADE|\bCLUBE\b|GYMPASS|WELLHUB|SMART ?FIT|ACADEMIA/;
export function detectSubs(S, today = M.todayISO()) {
  const cur = today.slice(0, 7), months = Array.from({ length: 5 }, (_, i) => mAdd(cur, -3 + i)); // cartão: a fatura aberta pode ser a do mês que vem
  const ign = new Set((S.config && S.config.recIgnore) || []);
  const known = new Set(detectRecurring(S, today).map(x => x.key));
  const groups = new Map();
  S.tx.forEach(t => {
    if (t.type !== 'cred' || t.recId || t.seriesId || t.parcKey || t.loanId || t.prev || t.reimb || t.amount <= 0 || !t.desc) return;
    const m = txComp(S, t); if (!months.includes(m)) return;
    const words = M.normDesc(t.desc.replace(/\(\d+\/\d+\)/, '')).split(' ').filter(w => w.length > 1 && !/^\d+$/.test(w)).slice(0, 3).join(' ');
    if (!words) return;
    const key = 'out|' + words;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ t, m });
  });
  const out = [];
  groups.forEach((list, key) => {
    if (ign.has(key) || known.has(key)) return;
    const per = {}; list.forEach(({ t, m }) => { per[m] = (per[m] || 0) + t.amount; });
    const ms = Object.keys(per).sort(), v = ms.map(m => r2(per[m])), avg = v.reduce((s, x) => s + x, 0) / v.length, mn = Math.min(...v), mx = Math.max(...v);
    const last = list.slice().sort((a, b) => a.t.date < b.t.date ? 1 : -1)[0].t;
    const named = SUB_NAMES.test(last.desc.toUpperCase());
    const recent = ms[ms.length - 1] >= mAdd(cur, -1);
    const twoInRow = ms.length >= 2 && ms.some((m, i) => i && mAdd(ms[i - 1], 1) === m) && list.length <= ms.length && (mx - mn) <= avg * 0.15;
    if (!recent || !(twoInRow || named)) return;
    const fixa = mx - mn <= Math.max(0.01, avg * 0.01);
    const daysL = list.map(({ t }) => +t.date.slice(8, 10)).sort((a, b) => a - b);
    out.push({ key, sub: true, named, kind: fixa ? 'fixa' : 'var', type: 'cred', desc: last.desc.replace(/\s*\(\d+\/\d+\)\s*$/, ''), itemId: last.itemId, accountId: last.accountId,
      amount: fixa ? v[v.length - 1] : r2(avg), min: mn, max: mx, n: ms.length, day: daysL[Math.floor(daysL.length / 2)], lastM: ms[ms.length - 1], txIds: list.map(({ t }) => t.id) });
  });
  return out.sort((a, b) => b.amount - a.amount);
}

/* ----- renda comprometida -----
   Para cada um dos n meses a partir de `from`: a renda prevista e quanto dela já tem destino, por tipo de compromisso.
   Usa a mesma regra do resumo do mês (cartão pela fatura; pagamento de fatura e transferência fora; o que a folha paga entra
   na renda e na despesa). `ends` lista o que termina naquele mês (última parcela), isto é, quanto fica livre no mês seguinte. */
export const COMMIT_KINDS = [['folha', 'Descontado na folha', '#7b55c7'], ['fixas', 'Contas fixas e assinaturas', '#1e88e5'], ['variaveis', 'Contas de valor variável', '#00897b'],
  ['parcelas', 'Parcelas', '#e98b3a'], ['dividas', 'Dívidas', '#d9534f'], ['outros', 'Outros lançamentos do mês', '#90a4ae']];
export function committed(S, from, n = 12) {
  const months = Array.from({ length: n }, (_, i) => mAdd(from, i)), idx = Object.fromEntries(months.map((m, i) => [m, i]));
  const rows = months.map(m => ({ m, renda: 0, parts: { folha: 0, fixas: 0, variaveis: 0, parcelas: 0, dividas: 0, outros: 0 }, ends: [] }));
  const recKind = Object.fromEntries((S.rec || []).map(r => [r.id, r.kind]));
  const lastOfLoan = {};
  S.tx.forEach(t => { if (t.loanId && t.type === 'deb') { const m = mOf(t.date); if (!lastOfLoan[t.loanId] || m > lastOfLoan[t.loanId]) lastOfLoan[t.loanId] = m; } });
  S.tx.forEach(t => {
    if (t.adj || t.reimb || t.cardPay || t.type === 'trf') return;
    if (t.type === 'cred' && isThird(S, t)) return;
    const m = t.type === 'cred' ? txComp(S, t) : mOf(t.date), R = rows[idx[m]]; if (!R) return;
    if (t.type === 'rec') { R.renda += t.amount; return; }
    const parc = t.parcKey ? [t.parcI, t.parcN] : t.seriesId && t.seriesKind !== 'rep' ? [t.seriesIdx, t.seriesN] : null;
    const k = t.folha ? 'folha' : t.loanId ? 'dividas' : parc ? 'parcelas' : t.recId ? (recKind[t.recId] === 'var' ? 'variaveis' : 'fixas') : 'outros';
    R.parts[k] += t.amount; if (t.folha) R.renda += t.amount;
    const name = (t.desc || '').replace(/\s*\(\d+\/\d+\)\s*$/, '');
    if (parc && parc[1] && parc[0] === parc[1]) R.ends.push({ desc: name, amount: t.amount, what: `última parcela (${parc[1]}/${parc[1]})` });
    else if (t.loanId && lastOfLoan[t.loanId] === m) {
      const loan = (S.loans || []).find(l => l.id === t.loanId);
      // consignado: a agenda vai só até o horizonte da previsão; a última linha só é o fim de verdade quando cai antes dele
      if (loan && !(loan.folha && m >= months[n - 1]) && !(loan.folha && m >= mAdd(M.todayISO().slice(0, 7), M.REC_AHEAD))) R.ends.push({ desc: [loan.person, loan.desc].filter(Boolean).join(' · ') || name, amount: t.amount, what: 'última parcela da dívida' });
    }
  });
  return rows.map(R => {
    const parts = Object.fromEntries(Object.entries(R.parts).map(([k, v]) => [k, r2(v)])), total = r2(Object.values(parts).reduce((s, x) => s + x, 0)), renda = r2(R.renda);
    return { m: R.m, renda, parts, total, sobra: r2(renda - total), pct: renda > 0 ? Math.round(total / renda * 100) : null, ends: R.ends.sort((a, b) => b.amount - a.amount) };
  });
}

/* ----- forma de pagamento -----
   Tipos de Pix e as outras formas. Fica em t.pay quando a pessoa escolhe; sem escolha, é deduzida da descrição que veio do banco
   (ou da conta que se repete). Como cada Pix se comporta no app:
   pix      sai da conta na hora (ou entra, no Pix recebido)
   pixag    agendado: fica pendente na conta até a data
   pixrec   agendado recorrente (você agenda no banco, valor fixo): conta que se repete, na conta
   pixauto  Pix Automático (a empresa cobra, você autorizou): conta que se repete, na conta, valor fixo ou variável
   pixparc  parcelado pelo banco: quem recebe ganha à vista; as parcelas (com juros) saem da conta mês a mês
   pixcred  Pix no crédito: entra na fatura do cartão, à vista ou parcelado; não sai da conta na hora */
export const PAY = [['pix', 'Pix'], ['pixag', 'Pix agendado'], ['pixrec', 'Pix agendado recorrente'], ['pixauto', 'Pix Automático'], ['pixparc', 'Pix parcelado'], ['pixcred', 'Pix no crédito'],
  ['boleto', 'Boleto'], ['debito', 'Cartão de débito'], ['debauto', 'Débito automático'], ['dinheiro', 'Dinheiro ou saque'], ['ted', 'TED ou DOC']];
export const payLabel = k => (PAY.find(p => p[0] === k) || [])[1] || '';
export function payOf(S, t) {
  if (t.pay) return t.pay;
  if (t.type === 'trf' || t.folha || t.adj || t.cardPay) return '';
  if (t.recId) { const r = (S.rec || []).find(x => x.id === t.recId); if (r && r.pay) return r.pay; }
  const d = String((t.desc || '') + ' ' + (t.rawDesc || '')).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  if (/\bPIX\b/.test(d)) return t.type === 'cred' ? 'pixcred' : /AUTOMATIC/.test(d) ? 'pixauto' : /PARCEL/.test(d) ? 'pixparc' : /RECORREN/.test(d) ? 'pixrec' : /AGEND/.test(d) ? 'pixag' : 'pix';
  if (t.type === 'cred') return '';
  if (/BOLETO|TITULO|CONVENIO/.test(d)) return 'boleto';
  if (/DEB(ITO)?\.? ?AUT/.test(d)) return 'debauto';
  if (/COMPRA (COM|NO) (CARTAO|DEBITO)|CARTAO DE DEBITO|ELO DEBITO|VISA ELECTRON|MAESTRO/.test(d)) return 'debito';
  if (/\bSAQUE\b/.test(d)) return 'dinheiro';
  if (/\bTED\b|\bDOC\b/.test(d)) return 'ted';
  return '';
}
/* despesas do mês por forma de pagamento (mesma regra do resumo; cartão sem Pix aparece como "Cartão de crédito") */
export function byPay(S, m) {
  const tot = {};
  S.tx.forEach(t => {
    if (t.adj || t.reimb || t.cardPay || t.type === 'trf' || t.type === 'rec' || (t.type === 'cred' && isThird(S, t))) return;
    if ((t.type === 'cred' ? txComp(S, t) : mOf(t.date)) !== m) return;
    const k = t.folha ? 'folha' : payOf(S, t) || (t.type === 'cred' ? 'cartao' : 'outros');
    tot[k] = tot[k] || { k, total: 0, n: 0 }; tot[k].total += t.amount; tot[k].n++;
  });
  return Object.values(tot).map(x => ({ ...x, total: r2(x.total), label: x.k === 'folha' ? 'Descontado na folha' : x.k === 'cartao' ? 'Cartão de crédito' : x.k === 'outros' ? 'Sem forma informada' : payLabel(x.k) })).sort((a, b) => b.total - a.total);
}
