/* Portadores de um cartão (titular, adicional, virtual) e reembolso.

   Cada cartão de crédito pode ter uma lista `holders`: { ref: final de 4 dígitos, name, kind: 'titular'|'adicional'|'virtual',
   reimb: devolve o dinheiro?, since: primeira fatura a cobrar (AAAA-MM) }. A compra guarda o final em `cardRef` (lido do PDF
   da fatura, da coluna "Cartão"/"Final" do CSV ou escolhido à mão). O portador é uma marca a mais: a categoria da compra
   continua a mesma.

   Padrão: o portador não devolve (a compra é despesa de quem paga a fatura). Quando devolve, as compras dele saem das
   despesas do mês e, para cada fatura, o app mantém um "a receber" (`reimb` = cartão|final|mês) no valor do que ele gastou,
   com vencimento no dia da fatura. Ao chegar o Pix dele, o lançamento é vinculado a esse "a receber". */
import * as M from './model.js';
import * as C from './calc.js';

export const KIND = { titular: 'titular', adicional: 'adicional', virtual: 'virtual' };
export const holdersOf = card => (card && card.holders) || [];
export const refOf = C.cardRefOf;
export const holderOf = C.holderOf;
export const label = h => h ? `${h.name}${h.kind && h.kind !== 'titular' ? ' · ' + h.kind + ' ' + h.ref : ''}` : '';

/* finais que aparecem nas compras do cartão e ainda não estão cadastrados, com quantidade */
export function unknownRefs(S, cardId) {
  const card = S.accounts.find(a => a.id === cardId), known = new Set(holdersOf(card).map(h => h.ref)), n = {};
  S.tx.forEach(t => { if (t.type === 'cred' && t.accountId === cardId && t.cardRef) { const r = refOf(t.cardRef); if (r && !known.has(r)) n[r] = (n[r] || 0) + 1; } });
  return Object.entries(n).map(([ref, count]) => ({ ref, count })).sort((a, b) => b.count - a.count);
}

/* inclui ou altera um portador (pelo final); `old` = final anterior quando ele muda */
export function setHolder(S, cardId, h, old, today = M.todayISO()) {
  const card = S.accounts.find(a => a.id === cardId); if (!card) return null;
  const ref = refOf(h.ref); if (!ref) return null;
  const list = (card.holders || []).filter(x => x.ref !== (old || ref) && x.ref !== ref);
  const cur = (card.holders || []).find(x => x.ref === (old || ref)) || {};
  const nh = { ref, name: String(h.name || '').trim() || 'Cartão ' + ref, kind: h.kind || 'adicional', reimb: !!h.reimb };
  if (nh.reimb) nh.since = h.since || cur.since || M.skipComp(S, cardId, C.cardCycle(card, today).comp);
  card.holders = [...list, nh].sort((a, b) => (a.kind === 'titular' ? -1 : 0) - (b.kind === 'titular' ? -1 : 0) || a.name.localeCompare(b.name));
  if (old && old !== ref) S.tx.forEach(t => { if (t.type === 'cred' && t.accountId === cardId && refOf(t.cardRef) === old) { t.cardRef = ref; M.touch(t); } });
  M.touch(card);
  syncReimb(S, today);
  return nh;
}
export function removeHolder(S, cardId, ref, today = M.todayISO()) {
  const card = S.accounts.find(a => a.id === cardId); if (!card) return;
  card.holders = (card.holders || []).filter(h => h.ref !== ref); M.touch(card);
  syncReimb(S, today);
}

/* total de cada portador numa fatura (null = compras sem final cadastrado) */
export function byHolder(S, cardId, comp) {
  const card = S.accounts.find(a => a.id === cardId), out = new Map();
  S.tx.filter(t => t.type === 'cred' && t.accountId === cardId && C.txComp(S, t) === comp).forEach(t => {
    const h = holderOf(S, t), k = h ? h.ref : '';
    const o = out.get(k) || { h, ref: k, total: 0, n: 0 }; o.total = C.r2(o.total + t.amount); o.n++; out.set(k, o);
  });
  return [...out.values()].sort((a, b) => b.total - a.total).map(o => ({ ...o, card }));
}
/* gasto de cada portador no mês (pela fatura), em todos os cartões que têm portadores */
export function monthByHolder(S, m) {
  const out = [];
  S.accounts.filter(a => a.nature === 'credito' && holdersOf(a).length).forEach(card => byHolder(S, card.id, m).forEach(o => { if (o.h) out.push(o); }));
  return out.sort((a, b) => b.total - a.total);
}

/* ---------- reembolso ---------- */
export const reimbKey = (cardId, ref, comp) => `${cardId}|${ref}|${comp}`;
const reimbBase = key => 't_rb_' + M.hashStr(key);
/* mantém os "a receber" dos portadores que devolvem: um por fatura, no valor do que falta receber */
export function syncReimb(S, today = M.todayISO(), dry = false) {
  let c = 0;
  // parcela prevista sem final: herda o da parcela real da mesma compra
  const refByKey = new Map();
  S.tx.forEach(t => { if (t.type === 'cred' && t.parcKey && !t.prev && t.cardRef) refByKey.set(t.parcKey, t.cardRef); });
  S.tx.forEach(t => { if (t.type === 'cred' && t.parcKey && t.prev && !t.cardRef && refByKey.has(t.parcKey)) { c++; if (!dry) { t.cardRef = refByKey.get(t.parcKey); M.touch(t); } } });
  const want = new Map(); // key → { due, card, h, comp }
  S.accounts.filter(a => a.nature === 'credito').forEach(card => holdersOf(card).filter(h => h.reimb).forEach(h => {
    S.tx.forEach(t => {
      if (t.type !== 'cred' || t.accountId !== card.id || refOf(t.cardRef) !== h.ref) return;
      const comp = C.txComp(S, t); if (h.since && comp < h.since) return;
      const key = reimbKey(card.id, h.ref, comp), w = want.get(key) || { due: 0, card, h, comp };
      w.due = C.r2(w.due + t.amount); want.set(key, w);
    });
  }));
  const have = new Map();
  S.tx.forEach(t => { if (t.reimb) { if (!have.has(t.reimb)) have.set(t.reimb, []); have.get(t.reimb).push(t); } });
  // portador que deixou de devolver, ou fatura sem compras dele: tira os "a receber" ainda em aberto
  have.forEach((list, key) => { if (!want.has(key)) list.filter(t => t.status === 'pend').forEach(t => { c++; if (!dry) M.removeRecord(S, 'tx', t.id); }); });
  want.forEach((w, key) => {
    const list = have.get(key) || [], base = reimbBase(key);
    if (!list.length && S.deleted[base]) return; // a pessoa excluiu o "a receber" desta fatura: não volta
    const got = C.r2(list.filter(t => t.status === 'liq').reduce((s, t) => s + t.amount, 0)), rest = C.r2(w.due - got);
    const pend = list.find(t => t.status === 'pend');
    const f = C.faturaOf(S, w.card.id, w.comp), desc = `Reembolso · ${w.h.name} · ${w.card.name} ${w.comp.slice(5)}/${w.comp.slice(2, 4)}`;
    if (rest > 0.005) {
      if (pend) {
        if (Math.abs(pend.amount - rest) > 0.004 || pend.date !== f.date || pend.desc !== desc) { c++; if (!dry) { Object.assign(pend, { amount: rest, date: f.date, desc }); M.touch(pend); } }
      } else {
        c++; if (dry) return;
        let id = base, i = 2; while (S.tx.some(t => t.id === id) || S.deleted[id]) id = base + '_' + i++;
        const t = M.newTx({ type: 'rec', date: f.date, accountId: w.card.payAccount || '', itemId: '', amount: rest, desc, status: 'pend' });
        Object.assign(t, { id, reimb: key }); S.tx.push(t);
      }
    } else if (pend) { c++; if (!dry) M.removeRecord(S, 'tx', pend.id); }
  });
  return c;
}
/* "a receber" em aberto, para vincular o Pix que chegou */
export const reimbOptions = (S, t) => S.tx.filter(x => x.reimb && x.status === 'pend' && t.type === 'rec')
  .sort((a, b) => Math.abs(Date.parse(a.date) - Date.parse(t.date)) - Math.abs(Date.parse(b.date) - Date.parse(t.date))).slice(0, 12);
/* o crédito real quita o "a receber" (fica com data e valor reais; se veio menos, o resto continua a receber) */
export function linkReimb(S, txId, reimbId, today = M.todayISO()) {
  const t = S.tx.find(x => x.id === txId), r = S.tx.find(x => x.id === reimbId);
  if (!t || !r || !r.reimb || r.status !== 'pend' || t.type !== 'rec') return false;
  Object.assign(r, { amount: C.r2(t.amount), date: t.date, accountId: t.accountId, status: 'liq' });
  ['impKey', 'rawDesc', 'doc', 'origin'].forEach(k => { if (t[k]) r[k] = t[k]; });
  M.touch(r); M.removeRecord(S, 'tx', t.id);
  syncReimb(S, today);
  return true;
}
