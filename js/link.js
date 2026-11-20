/* Vínculos de um lançamento que já existe (importado ou lançado à mão) e a lista "para conferir".

   Um lançamento comum pode, na verdade, ser:
   - o pagamento de uma fatura de cartão (sai da conta, mas não é despesa nova);
   - o mês de uma conta que se repete (aluguel, condomínio, salário, assinatura);
   - a parcela de uma dívida com alguém;
   - uma transferência para outra conta ou investimento.
   Vincular evita contar duas vezes e ensina o app a reconhecer sozinho nas próximas importações
   (o nome que o banco usa fica guardado: rec.keys para contas que se repetem, rules['pay:…'] para cartões). */
import * as M from './model.js';
import * as C from './calc.js';
import { payKey } from './imp/classify.js';

const days = (a, b) => Math.abs(Math.round((Date.parse(a + 'T12:00') - Date.parse(b + 'T12:00')) / 864e5));
export const keyOf = t => (t && t.origin === 'import' ? payKey(t.desc || '') : '');
const monthOf = (S, t) => (t.type === 'cred' ? C.txComp(S, t) : t.date.slice(0, 7));
/* só lançamentos comuns podem ser vinculados (nada de previsto, série, folha, ajuste, já vinculado) */
export const canLink = t => !!t && !t.prev && !t.folha && !t.adj && !t.recId && !t.loanId && !t.seriesId && !t.parcKey && !t.slipId && ['deb', 'rec', 'cred'].includes(t.type);

/* ---------- pagamento de fatura ---------- */
/* transforma uma despesa da conta em pagamento de fatura; guarda o nome do banco para o cartão */
export function toCardPay(S, txId, faturaKey, cardId) {
  const t = S.tx.find(x => x.id === txId); if (!t || t.type !== 'deb') return false;
  const card = cardId || (faturaKey || '').split('|')[0];
  Object.assign(t, { cardPay: true, faturaKey: faturaKey || '', itemId: '', status: 'liq' }); M.touch(t);
  learnPay(S, t, card);
  return true;
}
export function learnPay(S, t, cardId) {
  const key = keyOf(t); if (!key || !cardId) return;
  if (!S.rules) S.rules = {};
  S.rules['pay:' + key] = { cardId, upd: Date.now() };
}
/* desfaz: volta a ser despesa comum, sem categoria */
export function undoCardPay(S, txId) {
  const t = S.tx.find(x => x.id === txId); if (!t || !t.cardPay) return false;
  const key = keyOf(t); if (key && S.rules && S.rules['pay:' + key]) S.rules['pay:' + key] = { cardId: '', upd: Date.now() }; // vazio (e não apagado) para valer nos outros aparelhos
  delete t.cardPay; delete t.faturaKey; M.touch(t);
  return true;
}

/* ---------- fatura que o cartão não gerou (mudança de vencimento) ---------- */
/* marca a fatura como inexistente: parcelas previstas e pagamentos ligados a ela passam para a fatura seguinte */
export function skipFatura(S, cardId, comp, on = true) {
  const key = cardId + '|' + comp;
  if (on && S.tx.some(t => t.type === 'cred' && t.accountId === cardId && !t.prev && t.comp === comp)) return { ok: false, error: 'Esta fatura tem compras reais: não dá para dizer que ela não existiu.' };
  S.faturaMeta[key] = Object.assign({}, S.faturaMeta[key], { skip: on, upd: Date.now() });
  const next = M.skipComp(S, cardId, comp);
  let pays = 0;
  if (on) S.tx.filter(t => t.cardPay && t.faturaKey === key).forEach(t => { t.faturaKey = cardId + '|' + next; M.touch(t); pays++; });
  // as parcelas previstas seguem a última parcela real de cada compra, pulando a fatura que não existiu
  const moved = M.realignParcels(S, cardId);
  return { ok: true, next, pays, moved };
}

/* ---------- conta que se repete ---------- */
export const ruleOptions = (S, t) => (S.rec || []).filter(r => r.type === t.type && !(r.end && r.end < monthOf(S, t)));
/* o lançamento passa a ser o mês da conta que se repete. Devolve { ok, month, was, error } */
export function linkToRule(S, txId, ruleId, { fixFuture = false } = {}) {
  const t = S.tx.find(x => x.id === txId), r = (S.rec || []).find(x => x.id === ruleId);
  if (!t || !r || !canLink(t)) return { ok: false, error: 'Este lançamento não pode ser vinculado.' };
  const m = monthOf(S, t), occ = S.tx.find(x => x.recId === r.id && x.recM === m);
  if (occ && !occ.prev && occ.id !== t.id) return { ok: false, error: `${r.desc} já tem um lançamento confirmado neste mês.` };
  const was = r.amount;
  if (occ) M.removeRecord(S, 'tx', occ.id); // o mês previsto dá lugar ao lançamento real
  t.recId = r.id; t.recM = m; if (!t.itemId) t.itemId = r.itemId; M.touch(t);
  const key = keyOf(t);
  if (key && !(r.keys || []).includes(key)) r.keys = [...(r.keys || []), key].slice(-8);
  if (fixFuture && r.kind === 'fixa') M.editRec(S, r, { amount: Math.abs(t.amount) }, C.mAdd(m, 1));
  M.touch(r);
  return { ok: true, month: m, was };
}
/* cria uma conta que se repete a partir do lançamento (ele vira o primeiro mês) */
export function ruleFromTx(S, txId, kind, today = M.todayISO()) {
  const t = S.tx.find(x => x.id === txId); if (!t || !canLink(t)) return null;
  const m = monthOf(S, t);
  const r = M.newRec({ kind, type: t.type, desc: (t.desc || '').replace(/^(Pix (Enviado|Recebido|Agendado|Agendamento)|Pagamento de Boleto|Compra com Cart[aã]o)\s*·\s*/i, '') || 'Conta', itemId: t.itemId, accountId: t.accountId, amount: Math.abs(t.amount), day: +t.date.slice(8, 10), start: m });
  const key = keyOf(t); if (key) r.keys = [key];
  S.rec.push(r);
  t.recId = r.id; t.recM = m; M.touch(t);
  M.ensureRecurring(S, today);
  return r;
}

/* desfaz o vínculo com a conta que se repete: volta a ser um lançamento solto (o nome aprendido é esquecido) */
export function unlinkRule(S, txId) {
  const t = S.tx.find(x => x.id === txId); if (!t || !t.recId || t.prev) return false;
  const r = (S.rec || []).find(x => x.id === t.recId), key = keyOf(t);
  if (r && key && (r.keys || []).includes(key)) { r.keys = r.keys.filter(k => k !== key); M.touch(r); }
  delete t.recId; delete t.recM; M.touch(t);
  return true;
}

/* ---------- parcela de dívida ---------- */
export const parcelOptions = (S, t) => S.tx.filter(x => x.loanId && !x.loanStart && !x.folha && x.status === 'pend' && x.type === t.type)
  .map(x => ({ tx: x, loan: (S.loans || []).find(l => l.id === x.loanId) })).filter(o => o.loan)
  .sort((a, b) => days(a.tx.date, t.date) - days(b.tx.date, t.date)).slice(0, 12);
/* o lançamento real quita a parcela pendente (a parcela fica com a data e o valor reais; o lançamento solto some) */
export function linkToParcel(S, txId, parcelId) {
  const t = S.tx.find(x => x.id === txId), p = S.tx.find(x => x.id === parcelId);
  if (!t || !p || !canLink(t) || p.status !== 'pend' || !p.loanId) return false;
  Object.assign(p, { amount: Math.abs(t.amount), date: t.date, accountId: t.accountId, status: 'liq' });
  ['impKey', 'rawDesc', 'doc', 'origin'].forEach(k => { if (t[k]) p[k] = t[k]; });
  delete p.prev; M.touch(p);
  M.removeRecord(S, 'tx', t.id);
  return true;
}

/* ---------- transferência ---------- */
export function toTransfer(S, txId, otherId) {
  const t = S.tx.find(x => x.id === txId); if (!t || !canLink(t) || t.type === 'cred' || !otherId || otherId === t.accountId) return false;
  if (t.type === 'deb') Object.assign(t, { type: 'trf', toAccountId: otherId });
  else Object.assign(t, { type: 'trf', toAccountId: t.accountId, accountId: otherId });
  t.itemId = ''; t.amount = Math.abs(t.amount); M.touch(t);
  return true;
}

/* ---------- para conferir ---------- */
const REFUND = /REJEITAD|DEVOLVID|DEVOLUCAO|ESTORN|CANCELAD/;
const up = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
/* lançamentos que provavelmente estão contando errado: pagamento de fatura lançado como despesa, pix devolvido que
   ficou como despesa + receita, e lançamentos sem categoria. Ignorados pela pessoa: config.reviewIgnore. */
export function review(S) {
  const ign = new Set((S.config && S.config.reviewIgnore) || []);
  const real = S.tx.filter(t => !t.prev && !t.folha && !t.adj);
  const fs = C.faturas(S), cards = new Set(S.accounts.filter(a => a.nature === 'credito').map(a => a.id));
  const pay = [];
  real.filter(t => t.type === 'deb' && !t.cardPay && canLink(t) && !ign.has(t.id)).forEach(t => {
    // mesmo valor do total de uma fatura sem pagamento, perto do vencimento; ou mesmo nome de um pagamento já vinculado
    const f = fs.filter(x => x.total > 0 && !x.payments.length && Math.abs(x.total - t.amount) <= 0.05 && days(x.date, t.date) <= 20).sort((a, b) => days(a.date, t.date) - days(b.date, t.date))[0];
    const pr = S.rules && S.rules['pay:' + keyOf(t)];
    if (f) pay.push({ tx: t, fatura: f, cardId: f.cardId, why: 'valor' });
    else if (pr && cards.has(pr.cardId)) pay.push({ tx: t, fatura: null, cardId: pr.cardId, why: 'nome' });
    else if (/^(PAGAMENTO DE FATURA|PAGTO CARTAO|PAGAMENTO CARTAO)/.test(up(t.desc))) { // o próprio extrato diz que é pagamento de fatura
      const dw = new Set(up(t.desc).split(/[^A-Z0-9]+/).filter(w => w.length >= 3 && !/^(PAGAMENTO|FATURA|CARTAO|PAGTO|CREDITO)$/.test(w)));
      const card = S.accounts.find(a => a.nature === 'credito' && up(a.name).split(/[^A-Z0-9]+/).some(w => w.length >= 3 && dw.has(w)));
      pay.push({ tx: t, fatura: null, cardId: card ? card.id : '', why: 'descricao' });
    }
  });
  const refund = [], used = new Set();
  real.filter(t => t.type === 'rec' && REFUND.test(up(t.desc)) && !ign.has(t.id)).forEach(r => {
    const d = real.filter(x => x.type === 'deb' && !x.cardPay && !used.has(x.id) && x.accountId === r.accountId && Math.abs(x.amount - r.amount) < 0.005 && x.date <= r.date && days(x.date, r.date) <= 5)
      .sort((a, b) => days(a.date, r.date) - days(b.date, r.date));
    // se o mesmo valor saiu duas vezes (pix devolvido e depois pago de outro jeito), o devolvido é o mais antigo
    const out = d.length > 1 ? d.sort((a, b) => (a.date + (a.created || 0) < b.date + (b.created || 0) ? -1 : 1))[0] : d[0];
    if (out) { used.add(out.id); refund.push({ in: r, out }); }
  });
  // pagamento ligado à fatura de um cartão, mas com o nome de outro na descrição
  const GEN = new Set(['PAGAMENTO', 'FATURA', 'CARTAO', 'PIX', 'ENVIADO', 'BANCO', 'CREDITO']);
  const words = x => new Set(up(x).split(/[^A-Z0-9]+/).filter(w => w.length >= 3 && !GEN.has(w)));
  const cardList = S.accounts.filter(a => a.nature === 'credito');
  const relink = [];
  real.filter(t => t.cardPay && t.faturaKey && !ign.has(t.id)).forEach(t => {
    const dw = words(t.desc), shares = c => [...words(c.name)].some(w => dw.has(w));
    const cur = cardList.find(c => c.id === t.faturaKey.split('|')[0]);
    const other = cur && !shares(cur) && cardList.find(c => c.id !== cur.id && shares(c));
    if (other) relink.push({ tx: t, from: cur.id, to: other.id });
  });
  const nocat = real.filter(t => !t.itemId && !t.cardPay && t.type !== 'trf' && !ign.has(t.id));
  return { pay, relink, refund, nocat, n: pay.length + relink.length + refund.length + nocat.length };
}
export function ignoreReview(S, ids) {
  S.config.reviewIgnore = [...new Set([...(S.config.reviewIgnore || []), ...ids])].slice(-300); S.config.upd = Date.now();
}
