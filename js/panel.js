/* Painel (Agenda › Painel): somas por mês e por grupo, com filtros.
   Responde a perguntas como "quanto tenho de parcelas nos próximos meses?", "quanto cada pessoa gastou no cartão?",
   "quanto vai em contas fixas?". Só faz contas; quem desenha é o app.js.
   Mês de cada lançamento: o do resumo (compra no cartão conta no mês da fatura). */
import * as M from './model.js';
import * as C from './calc.js';

export const SETS = [['parc', 'Parcelas'], ['card', 'Compras no cartão'], ['fix', 'Fixas e assinaturas'], ['debt', 'Dívidas'], ['folha', 'Descontado na folha'], ['out', 'Todas as despesas'], ['in', 'Receitas']];
export const PERIODS = [['n12', 'Próximos 12 meses'], ['n6', 'Próximos 6 meses'], ['n3', 'Próximos 3 meses'], ['cur', 'Este mês'], ['p3', 'Últimos 3 meses'], ['p6', 'Últimos 6 meses'], ['p12', 'Últimos 12 meses'], ['y', 'Este ano']];
export const GROUPS = [['desc', 'Compra ou conta'], ['acc', 'Conta ou cartão'], ['cat', 'Categoria'], ['who', 'Quem usou o cartão'], ['pay', 'Forma de pagamento']];
/* atalhos: as perguntas mais comuns já montadas */
export const PRESETS = [
  { k: 'parc', label: 'Parcelas a pagar', set: 'parc', per: 'n12', group: 'desc' },
  { k: 'who', label: 'Quem usou o cartão', set: 'card', per: 'p3', group: 'who' },
  { k: 'fat', label: 'Faturas por cartão', set: 'card', per: 'n6', group: 'acc' },
  { k: 'fix', label: 'Fixas e assinaturas', set: 'fix', per: 'n12', group: 'desc' },
  { k: 'debt', label: 'Dívidas', set: 'debt', per: 'n12', group: 'desc' },
  { k: 'cat', label: 'Despesas por categoria', set: 'out', per: 'p6', group: 'cat' },
  { k: 'pay', label: 'Por forma de pagamento', set: 'out', per: 'p3', group: 'pay' },
  { k: 'in', label: 'Receitas', set: 'in', per: 'p6', group: 'desc' }
];
export const defaults = () => ({ preset: 'parc', set: 'parc', per: 'n12', group: 'desc', acc: '', who: '', cat: '' });

export function monthsOf(per, cur) {
  if (per === 'cur') return [cur];
  if (per === 'y') return Array.from({ length: 12 }, (_, i) => cur.slice(0, 4) + '-' + String(i + 1).padStart(2, '0'));
  const n = +per.slice(1), next = per[0] === 'n';
  return Array.from({ length: n }, (_, i) => C.mAdd(cur, next ? i : i - n + 1));
}
const isParc = t => !!t.parcKey || (!!t.seriesId && t.seriesKind !== 'rep');
const inSet = (set, t) => set === 'in' ? t.type === 'rec'
  : t.type === 'rec' ? false
  : set === 'parc' ? isParc(t) && !t.loanId : set === 'card' ? t.type === 'cred' : set === 'fix' ? !!t.recId && !t.folha && !t.loanId : set === 'debt' ? !!t.loanId : set === 'folha' ? !!t.folha && !t.loanId : true;

export function build(S, o, today = M.todayISO()) {
  const cur = today.slice(0, 7), months = monthsOf(o.per, cur), mi = new Set(months);
  const item = id => S.items.find(i => i.id === id), group = it => it && S.groups.find(g => g.id === it.groupId), acc = id => S.accounts.find(a => a.id === id);
  const byMonth = Object.fromEntries(months.map(m => [m, 0])), monthIds = Object.fromEntries(months.map(m => [m, []])), groups = new Map();
  let total = 0, n = 0, prev = 0;
  for (const t of S.tx) {
    if (t.adj || t.reimb || t.cardPay || t.type === 'trf' || !inSet(o.set, t)) continue;
    // nas despesas em geral, compras de quem devolve o dinheiro ficam fora (como no resumo); em "Compras no cartão" entram, para ver quanto a pessoa gastou
    if (o.set !== 'card' && t.type === 'cred' && C.holderOf(S, t) && C.holderOf(S, t).reimb) continue;
    const m = t.type === 'cred' ? C.txComp(S, t) : C.mOf(t.date); if (!mi.has(m)) continue;
    const h = t.type === 'cred' ? C.holderOf(S, t) : null;
    if (o.acc && t.accountId !== o.acc) continue;
    if (o.who && !(h && t.accountId + '|' + h.ref === o.who)) continue;
    const it = item(t.itemId), g = group(it);
    if (o.cat && !(o.cat.startsWith('g:') ? g && g.id === o.cat.slice(2) : t.itemId === o.cat)) continue;
    let key, label, color = g ? g.color : '#90a4ae';
    if (o.group === 'acc') { const a = acc(t.accountId); key = t.accountId || '_'; label = a ? a.name : t.folha ? 'Descontado na folha' : 'Sem conta'; color = t.type === 'cred' ? '#607d8b' : '#1e88e5'; }
    else if (o.group === 'cat') { key = t.itemId || '_'; label = it ? it.name : 'Sem categoria'; }
    else if (o.group === 'who') { key = h ? t.accountId + '|' + h.ref : t.type === 'cred' ? t.accountId + '|_' : '_'; const a = acc(t.accountId);
      label = h ? h.name + (h.reimb ? ' (devolve)' : '') : t.type === 'cred' ? `${a ? a.name : 'Cartão'}: sem nome cadastrado` : 'Fora do cartão'; color = h ? (h.reimb ? '#00897b' : '#7b55c7') : '#90a4ae'; }
    else if (o.group === 'pay') { const k = C.payOf(S, t); key = t.folha ? 'folha' : k || (t.type === 'cred' ? 'cartao' : '_'); label = t.folha ? 'Descontado na folha' : k ? C.payLabel(k) : t.type === 'cred' ? 'Cartão de crédito' : 'Sem forma informada'; color = /^pix/.test(k) ? '#00897b' : t.type === 'cred' ? '#607d8b' : '#5c6bc0'; }
    else { const d = (t.desc || (it ? it.name : '') || 'Sem descrição').replace(/\s*\(\d+\/\d+\)\s*$/, ''); key = (t.recId || t.parcKey || t.seriesId || t.loanId || '') + '|' + M.normDesc(d); label = d; }
    let G = groups.get(key); if (!G) { G = { key, label, color, total: 0, n: 0, per: {}, lastM: m, parcN: 0, parcLeft: 0, ids: [] }; groups.set(key, G); }
    G.total += t.amount; G.n++; G.ids.push(t.id); monthIds[m].push(t.id); G.per[m] = (G.per[m] || 0) + t.amount; if (m > G.lastM) G.lastM = m;
    if (isParc(t)) { G.parcN = Math.max(G.parcN, t.parcN || t.seriesN || 0); G.parcLeft++; }
    byMonth[m] += t.amount; total += t.amount; n++; if (t.prev || (t.status === 'pend' && t.type !== 'cred')) prev += t.amount;
  }
  const r2 = C.r2;
  return { months, cur, total: r2(total), n, prev: r2(prev), byMonth: months.map(m => ({ m, total: r2(byMonth[m]), ids: monthIds[m] })),
    groups: [...groups.values()].map(G => ({ ...G, total: r2(G.total), per: Object.fromEntries(Object.entries(G.per).map(([k, v]) => [k, r2(v)])) })).sort((a, b) => Math.abs(b.total) - Math.abs(a.total)) };
}
