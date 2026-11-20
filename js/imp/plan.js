/* Transforma o documento lido num plano de importação: o que é novo, o que já foi importado,
   o que provavelmente já foi lançado à mão (duplicata) e o que é ignorado. Depois aplica o plano. */
import { norm } from './parse.js';
import { makeClassifier, merchantKey, payKey } from './classify.js';
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
    // nome que a pessoa já vinculou a um cartão (ex.: o Pix para o emissor): também é pagamento de fatura
    const payDesc = l.role === 'cardpay' ? 'Pagamento de fatura · ' + (l.detail || l.desc).replace(/^Pagto cart[aã]o cr[eé]dito\s*·?\s*/i, '') : l.desc;
    const payRule = !isCard && l.dir === 'out' && S.rules && S.rules['pay:' + payKey(payDesc)];
    const payCard = payRule && payRule.cardId && S.accounts.find(a => a.id === payRule.cardId && a.nature === 'credito');
    if (l.role === 'cardpay' || payCard) {
      // o dinheiro saiu da conta, mas não é despesa nova (as compras estão no cartão): vira "pagamento de fatura"
      row.status = 'cardpay'; row.reason = 'Pagamento de fatura: tira o dinheiro da conta, mas não conta como despesa (as compras já estão no cartão).';
      row.options = C.faturaCandidates(S, { accountId, cardId: payCard ? payCard.id : undefined, date: l.date, amount: l.amount });
      const best = row.options[0];
      row.fatura = best && (best.exact || best.dist <= 15) ? best : null; // idêntico: vincula; senão, a mais próxima (o usuário pode trocar)
      row.include = true;
      row.tx.cardPay = true; row.tx.faturaKey = row.fatura ? row.fatura.key : '';
      row.tx.desc = payDesc;
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
    row.key = c.key;
    const prev = findPrev(S, row.tx, l, isCard, used, c.itemId, c.key);
    if (prev) return prevRow(row, prev, prev.recId ? 'Confirma o valor previsto da conta que se repete' : 'Parcela que estava prevista');
    const dup = findManual(S, row.tx, used, isCard);
    if (dup) { used.add(dup.id); row.status = 'dup'; row.match = dup; row.reason = 'Parece já lançado'; if (row.parcKey) row.base = dup; return row; }
    row.itemId = c.itemId; row.how = c.how; row.key = c.key;
    row.status = 'new'; row.include = true;
    row.recOptions = recOptions(S, row.tx, isCard); // contas que se repetem que esta linha pode estar pagando (vínculo à mão)
    return row;
    function prevRow(r, x, reason) { used.add(x.id); r.status = 'prev'; r.match = x; r.reason = reason; r.include = true; r.itemId = x.itemId; variation(S, r); return r; }
  });
  return { rows, isCard, accountId, comp, projN, project: projN > 0 };
}

/* meses previstos de contas que se repetem, da mesma conta e perto da data: opções para vincular uma linha à mão */
function recOptions(S, t, isCard) {
  const amt = Math.abs(t.amount), near = x => { const xa = Math.abs(x.amount); return amt >= xa * 0.25 && amt <= xa * 4; }; // valor na mesma ordem de grandeza
  return S.tx.filter(x => x.prev && x.recId && x.accountId === t.accountId && x.type === t.type && near(x) && (isCard ? C.txComp(S, x) === t.comp : days(x.date, t.date) <= 31))
    .sort((a, b) => days(a.date, t.date) - days(b.date, t.date)).slice(0, 12).map(x => ({ id: x.id, desc: x.desc, amount: Math.abs(x.amount), date: x.date, recM: x.recM }));
}
/* conta fixa paga com valor diferente do previsto: propõe usar o novo valor nos próximos meses */
function variation(S, row) {
  delete row.newAmount; delete row.oldAmount; delete row.fixFuture;
  const x = row.match, rr = x && x.recId && (S.rec || []).find(y => y.id === x.recId);
  if (rr && rr.kind === 'fixa' && Math.abs(Math.abs(row.tx.amount) - rr.amount) > 0.005) { row.newAmount = Math.abs(row.tx.amount); row.oldAmount = rr.amount; row.fixFuture = true; }
}
/* vincula à mão uma linha nova a um mês previsto de conta que se repete (txId), ou desfaz (txId vazio).
   Ao aplicar, a conta aprende o nome que veio do banco e as próximas importações vinculam sozinhas. */
export function setRowRec(S, plan, row, txId) {
  const x = txId && S.tx.find(t => t.id === txId && t.prev);
  if (x) { Object.assign(row, { status: 'prev', match: x, reason: 'Vinculado por você', linked: true, include: true, itemId: x.itemId }); variation(S, row); }
  else { Object.assign(row, { status: 'new', match: null, reason: '', linked: false, include: true }); variation(S, row); }
}

/* lançamento previsto (parcela futura ou mês de conta que se repete) que esta linha confirma */
function findPrev(S, t, l, isCard, used, itemId, lineKey) {
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
    // o nome que o banco usa já foi vinculado a esta conta (à mão ou numa importação anterior): vale mesmo com valor diferente
    const known = !!(lineKey && (r.keys || []).includes(lineKey));
    if (isCard ? C.txComp(S, x) !== t.comp : dd > (known ? 20 : 12)) continue;
    const exact = Math.abs(xa - amt) < 0.005;
    if (!known) {
      const okAmt = r.kind === 'fixa' ? Math.abs(xa - amt) <= Math.max(0.5, amt * 0.03) : amt >= xa * 0.3 && amt <= xa * 2.5;
      if (!okAmt) continue;
      const rw = words(r.desc + ' ' + (r.words || ''));
      if (!([...lw].some(w => rw.has(w)) || (itemId && itemId === x.itemId) || (r.kind === 'fixa' && exact))) continue;
    }
    // entre contas com o mesmo nome no banco (ex.: aluguel e condomínio na mesma administradora), a de valor mais próximo
    const score = known ? -1000 + Math.abs(xa - amt) / Math.max(amt, 1) * 100 + (isCard ? 0 : dd / 10) : (isCard ? 0 : dd) + (exact ? 0 : 1);
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
      if (x.recId) {
        const rr = (S.rec || []).find(y => y.id === x.recId);
        if (rr) {
          rr.words = M.normDesc(r.line.desc);
          if (r.key && !(rr.keys || []).includes(r.key)) rr.keys = [...(rr.keys || []), r.key].slice(-8); // nome do banco aprendido
          if (r.fixFuture && r.newAmount && rr.kind === 'fixa') M.editRec(S, rr, { amount: r.newAmount }, C.mAdd(x.recM, 1)); // novo valor previsto daqui em diante
          M.touch(rr);
        }
      }
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
  if (plan.isCard) M.realignParcels(S, plan.accountId); // parcela real que chegou numa fatura depois da prevista: as seguintes acompanham
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
