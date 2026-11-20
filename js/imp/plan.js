/* Transforma o documento lido num plano de importação: o que é novo, o que já foi importado,
   o que provavelmente já foi lançado à mão (duplicata) e o que é ignorado. Depois aplica o plano. */
import { norm } from './parse.js';
import { makeClassifier, merchantKey } from './classify.js';
import * as M from '../model.js';
import * as C from '../calc.js';

/* aplicação ou resgate no extrato: com conta de investimento cadastrada, vira transferência (não é despesa nem receita) */
const INVEST = /APLICAC|RESGATE|\bCDB\b|\bLCI\b|\bLCA\b|\bRDB\b|TESOURO|FUNDO DE INVEST|POUPANCA|INVEST|CORRETORA/;
const days = (a, b) => Math.abs(Math.round((Date.parse(a + 'T12:00') - Date.parse(b + 'T12:00')) / 864e5));
const hash = M.hashStr;

/* st: documento lido; accountId: conta (extrato) ou cartão (fatura); comp: mês da fatura */
export function buildPlan(S, st, { accountId, comp }) {
  const acc = S.accounts.find(a => a.id === accountId);
  const isCard = acc && acc.nature === 'credito';
  const classify = makeClassifier(S);
  const used = new Set();
  const seen = {};
  const existingKeys = new Set(S.tx.filter(t => t.impKey).map(t => t.impKey));
  const byId = new Map(S.tx.map(t => [t.id, t])), usedParc = {};
  const invAccs = S.accounts.filter(a => a.nature === 'debito' && a.inv && a.active !== false && a.id !== accountId);
  let projN = 0;
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
    const parcInfo = () => {
      let key = M.parcKey(accountId, l.desc, l.date, l.parc.n);
      usedParc[key] = (usedParc[key] || 0) + 1; if (usedParc[key] > 1) key += '-' + usedParc[key];
      Object.assign(row, { parcKey: key, parcI: l.parc.i, parcN: l.parc.n, cleanDesc: l.desc });
      for (let k = l.parc.i + 1; k <= l.parc.n; k++) { const id = M.parcId(key, k); if (!byId.has(id) && !S.deleted[id]) row.projN = (row.projN || 0) + 1; }
      projN += row.projN || 0;
      return key;
    };
    if (existingKeys.has(impKey)) {
      row.status = 'already'; row.reason = 'Já importado antes';
      // importada antes da versão 0.8: a compra parcelada ganha agora as parcelas futuras previstas
      if (isCard && l.parc && l.dir !== 'in') { parcInfo(); row.base = S.tx.find(t => t.impKey === impKey); }
      return row;
    }
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
    if (!isCard && invAccs.length && INVEST.test(norm([l.desc, l.title, l.detail].filter(Boolean).join(' ')))) {
      const words = norm(l.desc + ' ' + (l.detail || '')).split(/[^A-Z0-9]+/).filter(w => w.length > 3);
      const best = invAccs.find(a => words.some(w => norm(a.name).includes(w))) || invAccs[0];
      setRowInv({ accountId }, row, best.id); row.invOptions = invAccs.map(a => a.id);
      const dupT = findManual(S, row.tx, used, false);
      if (dupT) { used.add(dupT.id); row.status = 'dup'; row.match = dupT; row.reason = 'Parece já lançado'; row.include = false; }
      return row;
    }
    const c = classify({ ...l, kindHint: isCard && l.dir === 'in' ? 'estorno' : '' });
    // compra parcelada na fatura: id da parcela fixo (cartão + compra + nº de parcelas), para a próxima fatura achar a mesma
    if (isCard && l.parc && l.dir !== 'in') {
      const key = parcInfo();
      const same = byId.get(M.parcId(key, l.parc.i));
      if (same && !same.prev) { row.status = 'already'; row.reason = 'Esta parcela já está lançada'; row.base = same; return row; }
      if (same) return prevRow(row, same, 'Parcela que estava prevista');
    }
    const prev = findPrev(S, row.tx, l, isCard, used, c.itemId);
    if (prev) return prevRow(row, prev, prev.recId ? 'Confirma o valor previsto da conta que se repete' : 'Parcela que estava prevista');
    const dup = findManual(S, row.tx, used, isCard);
    if (dup) { used.add(dup.id); row.status = 'dup'; row.match = dup; row.reason = 'Parece já lançado'; if (row.parcKey) row.base = dup; return row; }
    row.itemId = c.itemId; row.how = c.how; row.key = c.key;
    row.status = 'new'; row.include = true;
    return row;
    function prevRow(r, x, reason) { used.add(x.id); r.status = 'prev'; r.match = x; r.reason = reason; r.include = true; r.itemId = x.itemId; return r; }
  });
  return { rows, isCard, accountId, comp, projN, project: projN > 0 };
}

/* lançamento previsto (parcela futura ou mês de conta que se repete) que esta linha confirma */
function findPrev(S, t, l, isCard, used, itemId) {
  const amt = Math.abs(t.amount);
  const cands = S.tx.filter(x => x.prev && !used.has(x.id) && x.accountId === t.accountId && x.type === t.type);
  if (isCard && l.parc) {
    const nd = M.normDesc(l.desc);
    const hit = cands.find(x => x.parcI === l.parc.i && x.parcN === l.parc.n && C.txComp(S, x) === t.comp && M.normDesc(x.desc.replace(/\(\d+\/\d+\)\s*$/, '')) === nd && Math.abs(Math.abs(x.amount) - amt) <= Math.max(1, amt * 0.02));
    if (hit) return hit;
  }
  const words = s => new Set(M.normDesc(s).split(' ').filter(w => w.length >= 4 && !/^\d+$/.test(w)));
  const lw = words(l.desc + ' ' + (l.title || '') + ' ' + (l.detail || ''));
  let best = null;
  for (const x of cands) {
    if (!x.recId) continue;
    const r = (S.rec || []).find(y => y.id === x.recId); if (!r) continue;
    const xa = Math.abs(x.amount), dd = days(x.date, t.date);
    if (isCard ? C.txComp(S, x) !== t.comp : dd > 12) continue;
    const exact = Math.abs(xa - amt) < 0.005;
    const okAmt = r.kind === 'fixa' ? Math.abs(xa - amt) <= Math.max(0.5, amt * 0.03) : amt >= xa * 0.3 && amt <= xa * 2.5;
    if (!okAmt) continue;
    const rw = words(r.desc + ' ' + (r.words || ''));
    if (!([...lw].some(w => rw.has(w)) || (itemId && itemId === x.itemId) || (r.kind === 'fixa' && exact))) continue;
    const score = (isCard ? 0 : dd) + (exact ? 0 : 1);
    if (!best || score < best.score) best = { x, score };
  }
  return best ? best.x : null;
}

/* lançamento existente (feito à mão ou de outra importação) com mesmo valor e data próxima */
function findManual(S, t, used, isCard) {
  const cands = S.tx.filter(x => !x.prev && !used.has(x.id) && x.accountId === t.accountId && x.type === t.type && Math.abs(x.amount - t.amount) < 0.005 && !(x.impKey && x.impKey === t.impKey));
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
    // parcela que já estava no app (importada antes ou lançada à mão): só lança as próximas como previstas
    if (plan.project && r.parcKey && r.base && !(r.include && r.status === 'dup')) {
      const x = S.tx.find(y => y.id === r.base.id);
      if (x) {
        if (!x.parcKey) { Object.assign(x, { parcKey: r.parcKey, parcI: r.parcI, parcN: r.parcN }); M.touch(x); }
        M.projectParcels(S, { ...x, comp: x.comp || plan.comp }, r.parcKey, r.parcI, r.parcN, r.cleanDesc);
      }
      if (r.status === 'already') return;
    }
    if (r.status === 'cardpay' && r.include) { r.tx.faturaKey = r.fatura ? r.fatura.key : ''; if (r.fatura) paid++; }
    if (!r.include || !r.tx) return;
    if (r.status === 'prev') {
      // a linha confirma o previsto: o lançamento existente passa a ter os dados reais (sem criar outro)
      const x = S.tx.find(y => y.id === r.match.id); if (!x) return;
      x.amount = Math.round(r.tx.amount * 100) / 100; x.date = r.tx.date; x.prev = false; x.origin = 'import';
      if (r.tx.type !== 'cred') x.status = 'liq'; else x.comp = r.tx.comp;
      if (x.parcKey) x.desc = r.tx.desc;
      ['impKey', 'rawDesc', 'doc', 'cardRef'].forEach(k => { if (r.tx[k]) x[k] = r.tx[k]; });
      if (x.recId) { const rr = (S.rec || []).find(y => y.id === x.recId); if (rr) { rr.words = M.normDesc(r.line.desc); M.touch(rr); } }
      M.touch(x); created++;
      if (plan.project && r.parcKey) M.projectParcels(S, x, r.parcKey, r.parcI, r.parcN, r.cleanDesc);
      return;
    }
    const t = M.newTx({ ...r.tx, itemId: r.itemId, status: r.tx.type === 'cred' ? 'pend' : 'liq', origin: 'import', signed: true });
    ['impKey', 'rawDesc', 'doc', 'cardRef', 'cardPay', 'faturaKey'].forEach(k => { if (r.tx[k]) t[k] = r.tx[k]; });
    if (t.cardPay) t.itemId = '';
    if (t.type === 'trf') t.amount = Math.abs(t.amount);
    if (r.parcKey) { const id = M.parcId(r.parcKey, r.parcI); if (!S.tx.some(y => y.id === id)) t.id = id; Object.assign(t, { parcKey: r.parcKey, parcI: r.parcI, parcN: r.parcN }); }
    S.tx.push(t); created++;
    if (plan.project && r.parcKey) M.projectParcels(S, t, r.parcKey, r.parcI, r.parcN, r.cleanDesc);
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

/* linha de aplicação/resgate: transferência entre a conta do extrato e a conta de investimento escolhida;
   invId vazio = não é investimento (volta a ser despesa ou receita comum, sem categoria) */
export function setRowInv(plan, row, invId) {
  const l = row.line, acc = plan.accountId;
  if (invId) { row.status = 'inv'; row.include = true; row.invId = invId; row.itemId = ''; Object.assign(row.tx, { type: 'trf', accountId: l.dir === 'in' ? invId : acc, toAccountId: l.dir === 'in' ? acc : invId }); }
  else { row.status = 'new'; row.include = true; row.invId = ''; Object.assign(row.tx, { type: l.dir === 'in' ? 'rec' : 'deb', accountId: acc }); delete row.tx.toAccountId; }
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
