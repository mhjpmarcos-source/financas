/* Transforma o documento lido num plano de importação: o que é novo, o que já foi importado,
   o que provavelmente já foi lançado à mão (duplicata) e o que é ignorado. Depois aplica o plano. */
import { norm } from './parse.js';
import { makeClassifier, merchantKey } from './classify.js';
import * as M from '../model.js';
import * as C from '../calc.js';

const days = (a, b) => Math.abs(Math.round((Date.parse(a + 'T12:00') - Date.parse(b + 'T12:00')) / 864e5));
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }

/* st: documento lido; accountId: conta (extrato) ou cartão (fatura); comp: mês da fatura */
export function buildPlan(S, st, { accountId, comp }) {
  const acc = S.accounts.find(a => a.id === accountId);
  const isCard = acc && acc.nature === 'credito';
  const classify = makeClassifier(S);
  const used = new Set();
  const seen = {};
  const existingKeys = new Set(S.tx.filter(t => t.impKey).map(t => t.impKey));
  const rows = st.lines.map((l, idx) => {
    const row = { idx, line: l, include: false, status: '', itemId: '', how: '', match: null, tx: null };
    if (!l.date) { row.status = 'ignored'; row.reason = 'Data não reconhecida'; return row; }
    if (l.role === 'ignore') { row.status = 'ignored'; row.reason = l.reason; return row; }
    const type = isCard ? 'cred' : l.dir === 'in' ? 'rec' : 'deb';
    const signed = isCard && l.dir === 'in' ? -l.amount : l.amount;
    // chave estável para não importar duas vezes a mesma linha (inclui ordem entre linhas idênticas)
    const base = [accountId, l.date, signed.toFixed(2), l.doc || merchantKey(l.desc) || norm(l.desc).slice(0, 30), isCard ? comp : ''].join('|');
    seen[base] = (seen[base] || 0) + 1;
    const impKey = hash(base + '#' + seen[base]);
    row.tx = { type, date: l.date, accountId, amount: signed, desc: l.desc + (l.parc ? ` (${l.parc.i}/${l.parc.n})` : ''), rawDesc: l.title && l.title !== l.desc ? (l.title + ' ' + (l.detail || '')).trim() : '', impKey, comp: isCard ? comp : undefined, doc: l.doc || undefined, cardRef: l.cardRef || undefined };
    if (existingKeys.has(impKey)) { row.status = 'already'; row.reason = 'Já importado antes'; return row; }
    if (l.role === 'cardpay') {
      // o dinheiro saiu da conta, mas não é despesa nova (as compras estão no cartão): vira "pagamento de fatura"
      row.status = 'cardpay'; row.reason = 'Pagamento de fatura: tira o dinheiro da conta, mas não conta como despesa (as compras já estão no cartão).';
      row.options = C.faturaCandidates(S, { accountId, date: l.date, amount: l.amount });
      const best = row.options[0];
      row.fatura = best && (best.exact || best.dist <= 15) ? best : null; // idêntico: vincula; senão, a mais próxima (o usuário pode trocar)
      row.include = true;
      row.tx.cardPay = true; row.tx.faturaKey = row.fatura ? row.fatura.key : '';
      row.tx.desc = 'Pagamento de fatura · ' + (l.detail || l.desc).replace(/^Pagto cart[aã]o cr[eé]dito\s*·?\s*/i, '');
      return row;
    }
    const dup = findManual(S, row.tx, used, isCard);
    if (dup) { used.add(dup.id); row.status = 'dup'; row.match = dup; row.reason = 'Parece já lançado'; return row; }
    const c = classify({ ...l, kindHint: isCard && l.dir === 'in' ? 'estorno' : '' });
    row.itemId = c.itemId; row.how = c.how; row.key = c.key;
    row.status = 'new'; row.include = true;
    return row;
  });
  return { rows, isCard, accountId, comp };
}

/* lançamento existente (feito à mão ou de outra importação) com mesmo valor e data próxima */
function findManual(S, t, used, isCard) {
  const cands = S.tx.filter(x => !used.has(x.id) && x.accountId === t.accountId && x.type === t.type && Math.abs(x.amount - t.amount) < 0.005 && !(x.impKey && x.impKey === t.impKey));
  let best = null;
  for (const x of cands) {
    let score;
    if (isCard) {
      const sameComp = C.txComp(S, x) === t.comp;
      const dd = days(x.date, t.date);
      if (!(sameComp && dd <= 5) && !(dd <= 2)) continue;
      score = dd + (sameComp ? 0 : 3);
    } else {
      const dd = days(x.date, t.date);
      if (dd > 4) continue;
      score = dd;
    }
    if (x.impKey) score += 2; // preferir os feitos à mão
    if (!best || score < best.score) best = { x, score };
  }
  return best ? best.x : null;
}

/* aplica no estado: cria lançamentos, aprende categorias, marca faturas pagas. Devolve contagem. */
export function applyPlan(S, plan, { markPaid = true } = {}) {
  let created = 0, learned = 0, paid = 0;
  if (!S.rules) S.rules = {};
  plan.rows.forEach(r => {
    if (r.status === 'cardpay' && r.include) { r.tx.faturaKey = r.fatura ? r.fatura.key : ''; if (r.fatura) paid++; }
    if (!r.include || !r.tx) return;
    const t = M.newTx({ ...r.tx, itemId: r.itemId, status: r.tx.type === 'cred' ? 'pend' : 'liq', origin: 'import', signed: true });
    ['impKey', 'rawDesc', 'doc', 'cardRef', 'cardPay', 'faturaKey'].forEach(k => { if (r.tx[k]) t[k] = r.tx[k]; });
    if (t.cardPay) t.itemId = '';
    S.tx.push(t); created++;
    if (r.itemId && r.key && r.how !== 'regra' && r.how !== 'histórico') {
      const dir = r.tx.type === 'rec' ? 'in' : 'out';
      S.rules[dir + ':' + r.key] = { itemId: r.itemId, upd: Date.now() }; learned++;
    }
  });
  // fatura importada que já foi paga (antes de começar a usar o app, ou paga por fora)
  if (plan.isCard && plan.alreadyPaid && plan.comp) {
    const key = plan.accountId + '|' + plan.comp;
    S.faturaMeta[key] = Object.assign({}, S.faturaMeta[key], { status: 'liq', upd: Date.now() }); paid++;
  }
  // saldo do extrato como saldo inicial da conta
  if (!plan.isCard && plan.setInitial) {
    const a = S.accounts.find(x => x.id === plan.accountId);
    if (a) { a.initial = plan.setInitial.value; a.initialDate = plan.setInitial.date; M.touch(a); }
  }
  return { created, learned, paid };
}

/* vincula um pagamento (linha da revisão) a outra fatura ou a nenhuma */
export function setRowFatura(row, key) { row.fatura = (row.options || []).find(f => f.key === key) || null; }

/* quando o usuário troca a categoria de uma linha, a regra vale para as outras do mesmo estabelecimento */
export function propagate(plan, row, itemId) {
  row.itemId = itemId; row.how = 'escolhida';
  let n = 0;
  plan.rows.forEach(r => { if (r !== row && r.status === 'new' && r.key && r.key === row.key && r.how !== 'escolhida' && r.tx && r.tx.type === row.tx.type) { r.itemId = itemId; r.how = 'escolhida'; n++; } });
  return n;
}
