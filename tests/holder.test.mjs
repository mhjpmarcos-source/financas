/* Portadores do cartão (titular, adicional, virtual) e reembolso de quem devolve o dinheiro. Dados fictícios.
   Uso: node holder.test.mjs */
import assert from 'node:assert/strict';
import * as M from '../js/model.js';
import * as C from '../js/calc.js';
import * as PH from '../js/holder.js';
import * as L from '../js/link.js';
import * as P from '../js/imp/parse.js';
import { buildPlan, applyPlan } from '../js/imp/plan.js';

const S = M.emptyState(); S.config.setupDone = true; const pl = M.defaultPlan(); S.groups = pl.groups; S.items = pl.items;
const conta = M.newAccount({ nature: 'debito', name: 'Conta Exemplo', initial: 1000, initialDate: '2026-09-30' });
const card = M.newAccount({ nature: 'credito', name: 'Cartão Exemplo', closeDay: 30, dueDay: 12, payAccount: conta.id }); S.accounts.push(conta, card);
const item = n => S.items.find(i => i.name === n).id;
// CSV de fatura com a coluna do final do cartão
const csv = 'Data;Descrição;Valor;Final\n10/11/2026;RESTAURANTE EXEMPLO, CIDADE;100,00;1111\n12/11/2026;FARMACIA EXEMPLO, CIDADE;50,00;2222\n14/11/2026;LOJA EXEMPLO - Parcela 1/3;90,00;2222\n15/11/2026;PADARIA EXEMPLO;10,00;\n';
const st = P.asFatura(P.parseCsv(new TextEncoder().encode(csv)));
assert.deepEqual(st.lines.map(l => l.cardRef), ['1111', '2222', '2222', '']);
let plan = buildPlan(S, st, { accountId: card.id, comp: '2026-12' }); plan.rows.forEach(r => { r.include = true; r.itemId = r.itemId || item('Restaurantes / Delivery'); });
applyPlan(S, plan);
assert.equal(S.tx.filter(t => t.cardRef === '2222').length, 1 + 1 + 2, 'parcelas previstas herdam o portador');
const unk = PH.unknownRefs(S, card.id); assert.deepEqual(unk.map(x => x.ref), ['2222', '1111']);
// cadastra: titular (despesa dele) e adicional que, por padrão, também é despesa
PH.setHolder(S, card.id, { ref: '1111', name: 'Titular Exemplo', kind: 'titular' });
PH.setHolder(S, card.id, { ref: '2222', name: 'Pessoa Exemplo', kind: 'adicional' });
const rest = S.tx.find(t => /RESTAURANTE/.test(t.desc)), farm = S.tx.find(t => /FARMACIA/.test(t.desc));
assert.equal(PH.holderOf(S, farm).name, 'Pessoa Exemplo'); assert.equal(PH.holderOf(S, rest).kind, 'titular');
assert.equal(C.monthSummary(S, '2026-12').desp, 250, 'padrão: compras do adicional são despesa de quem paga');
assert.equal(S.tx.filter(t => t.reimb).length, 0);
const bh = PH.byHolder(S, card.id, '2026-12'); assert.deepEqual(bh.map(o => [o.h && o.h.ref, o.total]), [['2222', 140], ['1111', 100], [null, 10]]);
// a pessoa passa a devolver a partir da fatura de dez/26
PH.setHolder(S, card.id, { ref: '2222', name: 'Pessoa Exemplo', kind: 'adicional', reimb: true, since: '2026-12' }, '2222', '2026-11-20');
let rb = S.tx.filter(t => t.reimb && t.reimb.endsWith('2026-12'));
assert.deepEqual(rb.map(t => [t.type, t.amount, t.date, t.status, t.accountId]), [['rec', 140, '2026-12-12', 'pend', conta.id]]);
const sm = C.monthSummary(S, '2026-12'); assert.deepEqual([sm.desp, sm.terc, sm.rec], [110, 140, 0], 'compras de quem devolve saem das despesas; reembolso não é receita');
assert.equal(C.byCategory(S, '2026-12').reduce((s, g) => s + g.total, 0), 110);
assert.equal(C.monthSummary(S, '2027-01').terc, 90); assert.equal(S.tx.filter(t => t.reimb).length, 3, 'um "a receber" por fatura (parcelas futuras também)');
assert.equal(C.pendings(S, '2026-12-31').some(p => p.tx && p.tx.reimb || p.reimb), true);
assert.equal(PH.syncReimb(S, '2026-11-20', true), 0, 'estável');
// o Pix da pessoa chega com menos: o resto continua a receber
const pix = M.newTx({ type: 'rec', date: '2026-12-10', accountId: conta.id, itemId: item('Salário'), amount: 100, desc: 'Pix Recebido · PESSOA EXEMPLO' }); S.tx.push(pix);
assert(PH.reimbOptions(S, pix).length >= 1); assert.equal(L.canLink(rb[0]), false);
const key = rb[0].reimb;
assert(PH.linkReimb(S, pix.id, rb[0].id, '2026-12-10'));
rb = S.tx.filter(t => t.reimb === key);
assert.deepEqual(rb.map(t => [t.status, t.amount]).sort(), [['liq', 100], ['pend', 40]]);
assert.equal(C.monthSummary(S, '2026-12').rec, 0, 'reembolso recebido também não é receita');
assert.equal(C.balances(S, '2026-12-11', true)[conta.id], 1000 + 100, 'mas entra no saldo da conta');
// nova compra dela na mesma fatura: o que falta sobe
const nova = M.newTx({ type: 'cred', date: '2026-11-20', accountId: card.id, itemId: item('Mercado'), amount: 60, cardRef: '2222' }); S.tx.push(nova);
PH.syncReimb(S, '2026-11-20'); assert.equal(S.tx.find(t => t.reimb === key && t.status === 'pend').amount, 100);
// excluir o "a receber" de uma fatura: não volta
const jan = S.tx.find(t => t.reimb && t.reimb.endsWith('2027-01')); M.removeRecord(S, 'tx', jan.id); PH.syncReimb(S, '2026-11-20');
assert.equal(S.tx.some(t => t.reimb && t.reimb.endsWith('2027-01')), false);
// volta a ser despesa: os "a receber" em aberto somem; o recebido fica
PH.setHolder(S, card.id, { ref: '2222', name: 'Pessoa Exemplo', kind: 'adicional', reimb: false }, '2222', '2026-11-20');
assert.deepEqual(S.tx.filter(t => t.reimb).map(t => t.status), ['liq']);
assert.equal(C.monthSummary(S, '2026-12').terc, undefined);
// reimportar um arquivo antigo, sem a coluna do final, e depois o novo: completa o portador
const S2 = M.emptyState(); S2.groups = pl.groups; S2.items = pl.items; const c2 = M.newAccount({ nature: 'credito', name: 'K', closeDay: 30, dueDay: 12 }); S2.accounts.push(c2);
const old = P.asFatura(P.parseCsv(new TextEncoder().encode('Data;Descrição;Valor\n10/11/2026;RESTAURANTE EXEMPLO, CIDADE;100,00\n'))); let p2 = buildPlan(S2, old, { accountId: c2.id, comp: '2026-12' }); p2.rows[0].include = true; applyPlan(S2, p2);
const neu = P.asFatura(P.parseCsv(new TextEncoder().encode(csv))); p2 = buildPlan(S2, neu, { accountId: c2.id, comp: '2026-12' });
assert.equal(p2.rows[0].status, 'already'); assert.equal(p2.rows[0].fillRef, '1111'); applyPlan(S2, p2);
assert.equal(S2.tx.find(t => /RESTAURANTE/.test(t.desc)).cardRef, '1111');
// lançamento à mão no cartão com portador
assert.equal(M.newTx({ type: 'cred', date: '2026-11-01', accountId: card.id, amount: 5, cardRef: '1111' }).cardRef, '1111');
console.log('portadores e reembolso tests OK');
