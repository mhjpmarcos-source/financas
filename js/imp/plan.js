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
    if (l.role === 'cardpay') {
      row.status = 'cardpay'; row.reason = 'Pagamento de fatura: não é despesa nova (a compra já está no cartão).';
      row.fatura = findFaturaPaid(S, accountId, l);
      return row;
    }
    if (existingKeys.has(impKey)) { row.status = 'already'; row.reason = 'Já importado antes'; return row; }
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

/* pagamento de fatura no extrato → fatura do cartão pago por esta conta com vencimento próximo */
function findFaturaPaid(S, accountId, l) {
  const cards = S.accounts.filter(a => a.nature === 'credito' && a.payAccount === accountId);
  let best = null;
  C.faturas(S).filter(f => cards.some(c => c.id === f.cardId)).forEach(f => {
    const dd = days(f.date, l.date);
    if (dd > 12) return;
    const diff = Math.abs(f.total - l.amount);
    const score = dd + (diff < 0.01 ? 0 : 20);
    if (!best || score < best.score) best = { f, score, exact: diff < 0.01 };
  });
  return best ? { key: best.f.key, cardId: best.f.cardId, comp: best.f.comp, total: best.f.total, exact: best.exact } : null;
}

/* aplica no estado: cria lançamentos, aprende categorias, marca faturas pagas. Devolve contagem. */
export function applyPlan(S, plan, { markPaid = true } = {}) {
  let created = 0, learned = 0, paid = 0;
  if (!S.rules) S.rules = {};
  plan.rows.forEach(r => {
    if (r.status === 'cardpay' && markPaid && r.include && r.fatura) {
      S.faturaMeta[r.fatura.key] = Object.assign({}, S.faturaMeta[r.fatura.key], { status: 'liq', date: r.line.date, upd: Date.now() });
      paid++;
      return;
    }
    if (!r.include || !r.tx) return;
    const t = M.newTx({ ...r.tx, itemId: r.itemId, status: r.tx.type === 'cred' ? 'pend' : 'liq', origin: 'import', signed: true });
    ['impKey', 'rawDesc', 'doc', 'cardRef'].forEach(k => { if (r.tx[k]) t[k] = r.tx[k]; });
    S.tx.push(t); created++;
    if (r.itemId && r.key && r.how !== 'regra' && r.how !== 'histórico') {
      const dir = r.tx.type === 'rec' ? 'in' : 'out';
      S.rules[dir + ':' + r.key] = { itemId: r.itemId, upd: Date.now() }; learned++;
    }
  });
  return { created, learned, paid };
}

/* quando o usuário troca a categoria de uma linha, a regra vale para as outras do mesmo estabelecimento */
export function propagate(plan, row, itemId) {
  row.itemId = itemId; row.how = 'escolhida';
  let n = 0;
  plan.rows.forEach(r => { if (r !== row && r.status === 'new' && r.key && r.key === row.key && r.how !== 'escolhida' && r.tx && r.tx.type === row.tx.type) { r.itemId = itemId; r.how = 'escolhida'; n++; } });
  return n;
}
