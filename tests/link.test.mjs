/* Vínculos de lançamentos que já existem e a lista "para conferir": pagamento de fatura lançado como despesa, conta que se
   repete, parcela de dívida, transferência, pix devolvido. Dados fictícios. Uso: node link.test.mjs */
import assert from 'node:assert/strict';
import { buildPlan, applyPlan } from '../js/imp/plan.js';
import * as M from '../js/model.js';
import * as C from '../js/calc.js';
import * as L from '../js/link.js';
import { payKey } from '../js/imp/classify.js';

const S = M.emptyState(); S.config.setupDone = true; const pl = M.defaultPlan(); S.groups = pl.groups; S.items = pl.items;
const conta = M.newAccount({ nature: 'debito', name: 'Conta Exemplo', initial: 10000, initialDate: '2026-02-28' });
const reserva = M.newAccount({ nature: 'debito', name: 'Reserva Exemplo', initial: 0, initialDate: '2026-02-28', inv: true });
const azul = M.newAccount({ nature: 'credito', name: 'Cartão Azul', closeDay: 25, dueDay: 5, payAccount: conta.id });
const verde = M.newAccount({ nature: 'credito', name: 'Cartão Verde', closeDay: 25, dueDay: 8, payAccount: conta.id });
S.accounts.push(conta, reserva, azul, verde);
const item = n => S.items.find(i => i.name === n).id;
const imp = lines => { const p = buildPlan(S, { kind: 'extrato', lines }, { accountId: conta.id }); p.rows.forEach(r => { if (r.status === 'new') { r.include = true; if (!r.tx.itemId) r.tx.itemId = item('Mercado'); } }); return p; };
const pix = (date, detail, amount, dir = 'out', title = 'Pix Enviado') => ({ date, desc: title + ' · ' + detail, title, detail, amount, dir, role: 'normal' });
const byDesc = (re, m) => S.tx.find(t => re.test(t.desc || '') && (!m || t.date.startsWith(m)));

// compras de março nos dois cartões (fatura com vencimento em abril)
S.tx.push(M.newTx({ type: 'cred', date: '2026-03-10', accountId: azul.id, itemId: item('Mercado'), amount: 800 }), M.newTx({ type: 'cred', date: '2026-03-12', accountId: verde.id, itemId: item('Mercado'), amount: 300 }));
const fAzul = C.faturas(S).find(f => f.cardId === azul.id), fVerde = C.faturas(S).find(f => f.cardId === verde.id);

// ---- fatura marcada como paga à mão não tira dinheiro da conta (o pagamento, se existir, é um lançamento) ----
S.faturaMeta[fAzul.key] = { status: 'liq', upd: 1 };
assert.equal(C.balances(S, '2026-04-30', true)[conta.id], 10000, 'marcada como paga: saldo confirmado não muda');
assert.equal(C.balances(S, '2026-04-30', false)[conta.id], 10000 - 300, 'previsão: só a fatura em aberto');
assert.equal(C.balanceBreakdown(S, conta.id, '2026-04-30').now.total, 10000);

// ---- o extrato traz o Pix para o emissor do cartão como despesa comum ----
let p = imp([pix('2026-04-05', 'EMISSOR AZUL SA', 800), pix('2026-04-08', 'EMISSOR VERDE IP', 300), pix('2026-04-09', 'COMPANHIA DE LUZ', 120), pix('2026-04-09', 'QR CODE REJEITADO', 120, 'in', 'Pix Rejeitado'), pix('2026-04-11', 'COMPANHIA DE LUZ', 120)]);
assert.deepEqual(p.rows.map(r => r.status), ['new', 'new', 'new', 'new', 'new']);
applyPlan(S, p);
const pa = byDesc(/EMISSOR AZUL/), pv = byDesc(/EMISSOR VERDE/);
assert.equal(C.monthSummary(S, '2026-04').desp, 1100 + 1100 + 240, 'do jeito que veio, a fatura conta duas vezes: nas compras e no pagamento');
let R = L.review(S);
assert.deepEqual(R.pay.map(x => [x.tx.id, x.cardId, x.why]).sort(), [[pa.id, azul.id, 'valor'], [pv.id, verde.id, 'valor']].sort());
assert.equal(R.refund.length, 1); assert.equal(R.refund[0].out.date, '2026-04-09', 'o devolvido é a saída mais antiga; o pagamento de verdade fica');
// vincular: deixa de ser despesa, a fatura fica paga e o saldo continua o mesmo
const before = C.balances(S, '2026-04-30', true)[conta.id];
assert(L.toCardPay(S, pa.id, fAzul.key, azul.id)); assert(L.toCardPay(S, pv.id, fVerde.key, verde.id));
assert.equal(C.balances(S, '2026-04-30', true)[conta.id], before);
assert.equal(C.monthSummary(S, '2026-04').desp, 1100 + 240); assert.equal(C.faturas(S).find(f => f.key === fVerde.key).status, 'liq');
const kA = 'pay:' + payKey('Pix Enviado · EMISSOR AZUL SA'), kV = 'pay:' + payKey('Pix Enviado · EMISSOR VERDE IP');
assert.deepEqual([S.rules[kA].cardId, S.rules[kV].cardId], [azul.id, verde.id]);
assert.equal(L.review(S).pay.length, 0);
// excluir o par devolvido
M.removeRecord(S, 'tx', R.refund[0].out.id); M.removeRecord(S, 'tx', R.refund[0].in.id); assert.equal(C.monthSummary(S, '2026-04').desp, 1100 + 120); assert.equal(C.monthSummary(S, '2026-04').rec, 0); assert.equal(L.review(S).refund.length, 0);

// ---- mês seguinte: o app já reconhece o Pix para o emissor como pagamento de fatura do cartão certo ----
S.tx.push(M.newTx({ type: 'cred', date: '2026-04-02', accountId: verde.id, itemId: item('Mercado'), amount: 450 }));
p = imp([pix('2026-05-08', 'EMISSOR VERDE IP', 450), pix('2026-05-05', 'EMISSOR AZUL SA', 77)]);
assert.deepEqual(p.rows.map(r => [r.status, r.tx.cardPay, r.tx.faturaKey]), [['cardpay', true, verde.id + '|2026-05'], ['cardpay', true, '']], 'com fatura no app vincula; sem fatura, fica como pagamento sem vínculo');
applyPlan(S, p); assert.equal(C.monthSummary(S, '2026-05').desp, 450, 'só a compra do cartão');
// pagamento sem fatura no app, de nome conhecido: aparece para conferir só se ainda for despesa comum
assert.equal(L.review(S).pay.length, 0);
// desfazer: volta a ser despesa e o nome deixa de valer (inclusive nos outros aparelhos)
const pv2 = byDesc(/EMISSOR VERDE/, '2026-05'); assert(L.undoCardPay(S, pv2.id)); assert.equal(pv2.cardPay, undefined); assert.equal(S.rules[kV].cardId, '');
p = imp([pix('2026-06-08', 'EMISSOR VERDE IP', 10)]); assert.equal(p.rows[0].status, 'new');
// pagamento ligado ao cartão errado: a descrição fala de outro cartão
const wrong = M.newTx({ type: 'deb', date: '2026-05-06', accountId: conta.id, amount: 50, desc: 'Pagamento de fatura · VERDE PLATINUM' }); Object.assign(wrong, { cardPay: true, faturaKey: azul.id + '|2026-05', itemId: '', origin: 'import' }); S.tx.push(wrong);
R = L.review(S); assert.deepEqual(R.relink.map(x => [x.tx.id, x.from, x.to]), [[wrong.id, azul.id, verde.id]]);
L.ignoreReview(S, [wrong.id]); assert.equal(L.review(S).relink.length, 0);

// ---- conta que se repete: vincular um lançamento já importado e propor o novo valor ----
const alug = M.newRec({ kind: 'fixa', type: 'deb', desc: 'Aluguel', itemId: item('Aluguel / Financiamento'), accountId: conta.id, amount: 2000, day: 10, start: '2026-06' }); S.rec.push(alug);
M.ensureRecurring(S, '2026-06-01');
const occ = (r, m) => S.tx.find(t => t.recId === r.id && t.recM === m);
const solto = M.newTx({ type: 'deb', date: '2026-06-09', accountId: conta.id, itemId: item('Mercado'), amount: 2150, desc: 'Pagamento de Boleto · IMOBILIARIA EXEMPLO LTDA' }); solto.origin = 'import'; S.tx.push(solto);
assert(L.canLink(solto)); assert.deepEqual(L.ruleOptions(S, solto).map(r => r.id), [alug.id]);
assert.equal(C.monthSummary(S, '2026-06').desp, 2000 + 2150, 'antes: o previsto e o real contam os dois');
let res = L.linkToRule(S, solto.id, alug.id, { fixFuture: true });
assert.deepEqual([res.ok, res.month, res.was], [true, '2026-06', 2000]);
assert.equal(C.monthSummary(S, '2026-06').desp, 2150); assert.equal(occ(alug, '2026-06').id, solto.id); assert.equal(solto.itemId, item('Mercado'), 'a categoria que a pessoa escolheu fica');
assert.equal(alug.amount, 2150); assert.equal(occ(alug, '2026-07').amount, 2150); assert.deepEqual(alug.keys, ['IMOBILIARIA EXEMPLO']);
assert.equal(M.ensureRecurring(S, '2026-06-01', true), 0, 'o mês vinculado não é recriado');
assert.equal(L.canLink(solto), false); assert.equal(L.linkToRule(S, solto.id, alug.id).ok, false);
// no mês seguinte a importação reconhece pelo nome
p = imp([{ date: '2026-07-10', desc: 'Pagamento de Boleto · IMOBILIARIA EXEMPLO LTDA', title: 'Pagamento de Boleto', detail: 'IMOBILIARIA EXEMPLO LTDA', amount: 2150, dir: 'out', role: 'normal' }]);
assert.deepEqual([p.rows[0].status, p.rows[0].match && p.rows[0].match.id], ['prev', occ(alug, '2026-07').id]);
// já existe lançamento confirmado no mês: não deixa vincular outro
const outro = M.newTx({ type: 'deb', date: '2026-06-20', accountId: conta.id, itemId: item('Mercado'), amount: 10, desc: 'x' }); S.tx.push(outro);
assert.equal(L.linkToRule(S, outro.id, alug.id).ok, false);
// desvincular
assert(L.unlinkRule(S, solto.id)); assert.equal(solto.recId, undefined); assert.deepEqual(alug.keys, []);

// ---- criar a conta que se repete a partir de um lançamento (despesa e receita) ----
const cond = M.newTx({ type: 'deb', date: '2026-06-12', accountId: conta.id, itemId: item('Condomínio'), amount: 640, desc: 'Pagamento de Boleto · ADMINISTRADORA FICTICIA' }); cond.origin = 'import'; S.tx.push(cond);
const rc = L.ruleFromTx(S, cond.id, 'var', '2026-06-15');
assert.deepEqual([rc.desc, rc.kind, rc.type, rc.day, rc.start, rc.amount, rc.keys[0]], ['ADMINISTRADORA FICTICIA', 'var', 'deb', 12, '2026-06', 640, 'ADMINISTRADORA FICTICIA']);
assert.equal(occ(rc, '2026-06').id, cond.id); assert.equal(occ(rc, '2026-07').prev, true); assert.equal(occ(rc, '2026-07').amount, 640);
const pens = M.newTx({ type: 'rec', date: '2026-06-07', accountId: conta.id, itemId: S.items.find(i => i.name === 'Salário').id, amount: 3300, desc: 'Pix Recebido · PESSOA FICTICIA' }); pens.origin = 'import'; S.tx.push(pens);
const rr = L.ruleFromTx(S, pens.id, 'fixa', '2026-06-15'); assert.deepEqual([rr.type, rr.desc, rr.amount], ['rec', 'PESSOA FICTICIA', 3300]); assert.equal(occ(rr, '2026-08').type, 'rec');

// ---- parcela de dívida: o lançamento real quita a parcela pendente ----
const { loan, txs } = M.makeLoan({ dir: 'out', person: 'Pessoa Exemplo', total: 1000, n: 2, firstDue: '2026-06-15', accountId: conta.id, itemId: item('Parcela de empréstimo') });
S.loans.push(loan); S.tx.push(...txs);
const pg = M.newTx({ type: 'deb', date: '2026-06-16', accountId: conta.id, itemId: item('Mercado'), amount: 500, desc: 'Pix Enviado · PESSOA EXEMPLO' }); pg.origin = 'import'; pg.impKey = 'k1'; S.tx.push(pg);
const opts = L.parcelOptions(S, pg); assert.equal(opts[0].tx.date, '2026-06-15');
const nTx = S.tx.length; assert(L.linkToParcel(S, pg.id, opts[0].tx.id));
assert.equal(S.tx.length, nTx - 1); const quit = S.tx.find(t => t.id === opts[0].tx.id); assert.deepEqual([quit.status, quit.date, quit.amount, quit.impKey], ['liq', '2026-06-16', 500, 'k1']);
assert.equal(M.loanStatus(S, loan).paid, 500);

// ---- transferência: saída que foi para o investimento ----
const ap = M.newTx({ type: 'deb', date: '2026-06-18', accountId: conta.id, itemId: item('Mercado'), amount: 700, desc: 'Pix Enviado · CORRETORA EXEMPLO' }); S.tx.push(ap);
const d0 = C.monthSummary(S, '2026-06').desp, b0 = C.balances(S, '2026-06-30', true);
assert(L.toTransfer(S, ap.id, reserva.id)); assert.deepEqual([ap.type, ap.accountId, ap.toAccountId, ap.itemId], ['trf', conta.id, reserva.id, '']);
assert.equal(C.monthSummary(S, '2026-06').desp, d0 - 700); const b1 = C.balances(S, '2026-06-30', true); assert.equal(b1[conta.id], b0[conta.id]); assert.equal(b1[reserva.id], b0[reserva.id] + 700);

// ---- sem categoria ----
const sc = M.newTx({ type: 'deb', date: '2026-06-19', accountId: conta.id, amount: 5, desc: 'sem categoria' }); sc.itemId = ''; S.tx.push(sc);
assert(L.review(S).nocat.some(t => t.id === sc.id));
console.log('vínculos e "para conferir" tests OK');

// ---- fatura que o cartão não gerou (mudança de vencimento) ----
{
  const Z = M.emptyState(); Z.config.setupDone = true; Z.groups = pl.groups; Z.items = pl.items;
  const cz = M.newAccount({ nature: 'debito', name: 'Conta' }), kz = M.newAccount({ nature: 'credito', name: 'Cartão Z', closeDay: 30, dueDay: 12, payAccount: cz.id }); Z.accounts.push(cz, kz);
  // compra em 4x importada na fatura de out: 1/4 real, 2/4 a 4/4 previstas em nov, dez, jan
  const p1 = M.newTx({ type: 'cred', date: '2026-09-10', accountId: kz.id, itemId: Z.items[0].id, amount: 100, desc: 'LOJA EXEMPLO (1/4)', signed: true });
  Object.assign(p1, { comp: '2026-10', parcKey: 'pkz', parcI: 1, parcN: 4, origin: 'import' }); Z.tx.push(p1);
  M.projectParcels(Z, p1, 'pkz', 1, 4, 'LOJA EXEMPLO');
  const comps = () => Z.tx.filter(t => t.parcKey === 'pkz').sort((a, b) => a.parcI - b.parcI).map(t => C.txComp(Z, t));
  assert.deepEqual(comps(), ['2026-10', '2026-11', '2026-12', '2027-01']);
  const pg = M.newTx({ type: 'deb', date: '2026-11-03', accountId: cz.id, amount: 500, desc: 'Pix' }); Object.assign(pg, { cardPay: true, faturaKey: kz.id + '|2026-11' }); Z.tx.push(pg);
  const r = L.skipFatura(Z, kz.id, '2026-11');
  assert.deepEqual([r.ok, r.next, r.pays], [true, '2026-12', 1]); assert.equal(pg.faturaKey, kz.id + '|2026-12');
  assert.deepEqual(comps(), ['2026-10', '2026-12', '2027-01', '2027-02'], 'as parcelas andam um mês');
  assert.equal(C.faturas(Z).some(f => f.comp === '2026-11'), false);
  // compra manual com data no ciclo pulado cai na fatura seguinte
  const m1 = M.newTx({ type: 'cred', date: '2026-10-20', accountId: kz.id, itemId: Z.items[0].id, amount: 10 }); Z.tx.push(m1); assert.equal(C.txComp(Z, m1), '2026-12');
  // nova compra parcelada projetada a partir de dez: não usa o mês pulado
  const q1 = M.newTx({ type: 'cred', date: '2026-10-25', accountId: kz.id, itemId: Z.items[0].id, amount: 30, desc: 'OUTRA (1/3)', signed: true }); Object.assign(q1, { comp: '2026-12', parcKey: 'pkq', parcI: 1, parcN: 3 }); Z.tx.push(q1);
  M.projectParcels(Z, q1, 'pkq', 1, 3, 'OUTRA'); assert.deepEqual(Z.tx.filter(t => t.parcKey === 'pkq').map(t => t.comp).sort(), ['2026-12', '2027-01', '2027-02']);
  // a parcela real chega: as previstas seguem a real
  const real2 = Z.tx.find(t => t.parcKey === 'pkz' && t.parcI === 2); delete real2.prev; assert.equal(M.realignParcels(Z, kz.id), 0);
  // não dá para pular fatura com compra real
  assert.equal(L.skipFatura(Z, kz.id, '2026-12').ok, false);
  console.log('fatura que não existiu tests OK');
}
