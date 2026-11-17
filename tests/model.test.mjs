import * as M from '../js/model.js';
import * as C from '../js/calc.js';
import assert from 'node:assert/strict';
const p=M.defaultPlan(); assert(p.groups.length>10 && p.items.length>50);
assert(p.items.every(i=>i.name && !/–/.test(i.name)));
let a=M.emptyState(); a.config.setupDone=true;
const conta=M.newAccount({nature:'debito',name:'Conta corrente',initial:1000});
const cartao=M.newAccount({nature:'credito',name:'Cartão',closeDay:27,dueDay:6,payAccount:conta.id});
a.accounts.push(conta,cartao); Object.assign(a,{groups:p.groups,items:p.items});
const t1=M.newTx({type:'deb',date:'2026-11-10',accountId:conta.id,itemId:p.items[0].id,amount:100});
const t2=M.newTx({type:'cred',date:'2026-11-28',accountId:cartao.id,itemId:p.items[1].id,amount:'50.5'});
a.tx.push(t1,t2);
// cartão: compra 28/11 com fechamento 27 → fecha em dez, vence 06/jan
assert.equal(C.txComp(a,t2),'2027-01');
assert.equal(C.cardCycle(cartao,'2026-10-26').comp,'2026-11');
// merge: device b edits t1 later, device a deletes t2, b adds t3
let b=M.clone(a);
await new Promise(r=>setTimeout(r,5));
b.tx[0].amount=120; M.touch(b.tx[0]);
const t3=M.newTx({type:'rec',date:'2026-11-05',accountId:conta.id,itemId:p.items[0].id,amount:3000}); b.tx.push(t3);
await new Promise(r=>setTimeout(r,5));
M.removeRecord(a,'tx',t2.id);
const m1=M.merge(a,b), m2=M.merge(b,a);
assert.equal(m1.tx.length,2); assert.equal(m1.tx.find(t=>t.id===t1.id).amount,120); assert(!m1.tx.find(t=>t.id===t2.id));
assert.equal(M.digest(m1),M.digest(m2),'merge commutative');
// profile newer wins
b.profile.cpf6='123456'; b.profile.upd=Date.now()+10; const m3=M.merge(a,b); assert.equal(m3.profile.cpf6,'123456');
assert.equal(M.cpf6From('123.456.789-00'),'123456'); assert.equal(M.cpf6From('12'),null); assert.equal(M.cpf6From(''),'');
// balances: 1000 + 3000 - 120 = 3880 (fatura pending/not due ignored when lq)
const bal=C.balances(m1,'2026-12-31',true); assert.equal(bal[conta.id],3880);
assert.equal(C.parseMoney('1.234,56'),1234.56); assert.equal(C.parseMoney('492,17-'),-492.17); assert.equal(C.parseMoney('R$ 12'),12);
// legacy import: format 2 with modules
const legacy={app:'Finanças X',format:2,modules:{pes:{config:{periodStart:'2026-01',module:'pes',shortcuts:{}},accounts:[conta],groups:p.groups,items:p.items,tx:[t1,{...t2},{id:'z',type:'weird'}],faturaMeta:{}},corp:{config:{module:'corp'},accounts:[],tx:[]}}};
const imp=M.importLegacy(legacy); assert.equal(imp.tx.length,2); assert(imp.config.setupDone); assert.equal(imp.config.periodStart,'2026-01'); assert(!imp.config.shortcuts);
assert.throws(()=>M.importLegacy({foo:1}));
const self=M.importLegacy(m1); assert.equal(self.tx.length,2);
console.log('model tests OK');
// ---- Fase 2a
{
  const s=M.emptyState(); s.config.setupDone=true; const pl=M.defaultPlan(); s.groups=pl.groups; s.items=pl.items;
  const ca=M.newAccount({nature:'debito',name:'C'}), cc=M.newAccount({nature:'credito',name:'K',closeDay:27,dueDay:6,payAccount:ca.id}); s.accounts.push(ca,cc);
  assert.deepEqual(M.splitAmount(100,3),[33.34,33.33,33.33]);
  const par=M.makeSeries({type:'cred',date:'2026-11-28',accountId:cc.id,itemId:s.items[5].id,amount:100,desc:'TV'},3,C.cardCycle(cc,'2026-11-28').comp);
  assert.deepEqual(par.map(t=>t.comp),['2027-01','2027-02','2027-03']); assert(par.every(t=>t.date==='2026-11-28'&&t.seriesN===3));
  s.tx.push(...par);
  const rep=M.makeSeries({type:'deb',date:'2026-01-31',accountId:ca.id,itemId:s.items[6].id,amount:50},4);
  assert.deepEqual(rep.map(t=>t.date),['2026-01-31','2026-02-28','2026-03-31','2026-04-30']);
  s.tx.push(...rep);
  assert.equal(M.editSeriesFrom(s,rep[1],{amount:60,date:'2026-02-10'}),3);
  assert.deepEqual(M.seriesMembers(s,rep[0]).map(t=>t.date+':'+t.amount),['2026-01-31:50','2026-02-10:60','2026-03-10:60','2026-04-10:60']);
  assert.equal(M.removeSeriesFrom(s,par[1]),2); assert.equal(s.tx.filter(t=>t.seriesId===par[0].seriesId).length,1);
  const f=C.faturaOf(s,cc.id,'2027-01'); assert.equal(f.total,33.34); assert.equal(f.list.length,1);
  const cat=C.byCategory(s,'2026-02'); assert.equal(cat[0].total,60);
  const it2=M.newItem(s.groups[2].id,'Nova'); s.items.push(it2); assert.equal(M.mergeItems(s,s.items[6].id,it2.id),4); assert(!s.items.find(i=>i.id===rep[0].itemId)||rep[0].itemId===it2.id);
  assert.equal(C.search(s,'tv').length,1); assert.equal(C.search(s,'60,00').length,3);
  assert.equal(C.monthSeries(s,'2026-04',4).map(x=>x.desp).join(),'50,60,60,60');
  console.log('fase 2a model tests OK');
}
// ---- dívidas e pendências
{
  const s = M.emptyState(); s.config.setupDone = true; const pl = M.defaultPlan(); s.groups = pl.groups; s.items = pl.items;
  const ca = M.newAccount({ nature: 'debito', name: 'C' }); s.accounts.push(ca);
  const rec = s.items.find(i => i.name === 'Recebimento de empréstimo concedido'); assert(rec, 'categoria nova no plano');
  const lent = s.items.find(i => i.name === 'Empréstimos concedidos');
  const { loan, txs } = M.makeLoan({ dir: 'in', person: 'Pessoa Fictícia', desc: 'Empréstimo', total: 1000, n: 3, firstDue: '2026-01-31', accountId: ca.id, itemId: rec.id, startDate: '2026-01-05', startItemId: lent.id });
  s.loans.push(loan); s.tx.push(...txs);
  assert.equal(txs.length, 4); assert.deepEqual(txs.filter(t => !t.loanStart).map(t => t.date + ':' + t.amount), ['2026-01-31:333.34', '2026-02-28:333.33', '2026-03-31:333.33']);
  assert(txs.filter(t => !t.loanStart).every(t => t.status === 'pend' && t.type === 'rec'));
  let ls = M.loanStatus(s, loan); assert.equal(ls.rest, 1000); assert.equal(ls.openN, 3);
  s.tx.find(t => t.date === '2026-01-31').status = 'liq'; ls = M.loanStatus(s, loan); assert.equal(ls.paid, 333.34); assert.equal(ls.next.date, '2026-02-28');
  assert.equal(C.pendings(s).length, 2);
  // saldo: saiu 1000 em 05/01, voltou 333,34 em 31/01
  assert.equal(C.balances(s, '2026-02-01', true)[ca.id], -666.66);
  M.removeLoan(s, loan.id); assert.equal(s.tx.length, 2); assert.equal(s.loans.length, 0);
  // migração: quem já usa ganha a categoria nova
  const old = M.emptyState(); old.config.setupDone = true; old.config.planV = 2; const op = M.defaultPlan(); old.groups = op.groups; old.items = op.items.filter(i => i.name !== 'Recebimento de empréstimo concedido');
  M.migrate(old); assert.equal(old.items.filter(i => i.name === 'Recebimento de empréstimo concedido').length, 1);
  // merge com loans
  const a = M.clone(s), b = M.clone(s); b.loans.push({ ...loan, id: 'lx', upd: Date.now() }); assert.equal(M.merge(a, b).loans.length, 1);
  console.log('dívidas tests OK');
}
// ---- pagamento de fatura (integral e parcial) e saldo inicial com data
{
  const s = M.emptyState(); s.config.setupDone = true; const pl = M.defaultPlan(); s.groups = pl.groups; s.items = pl.items;
  const ca = M.newAccount({ nature: 'debito', name: 'C', initial: 1000, initialDate: '2026-01-31' });
  const cc = M.newAccount({ nature: 'credito', name: 'K', closeDay: 25, dueDay: 5, payAccount: ca.id }); s.accounts.push(ca, cc);
  s.tx.push(M.newTx({ type: 'deb', date: '2026-01-20', accountId: ca.id, itemId: s.items[20].id, amount: 50 })); // antes da data do saldo inicial: não conta
  s.tx.push(M.newTx({ type: 'cred', date: '2026-01-10', accountId: cc.id, itemId: s.items[20].id, amount: 300 })); // fatura 2026-02, vence 05/02
  const key = cc.id + '|2026-02';
  let f = C.faturas(s).find(x => x.key === key); assert.equal(f.status, 'pend'); assert.equal(f.rest, 300);
  assert.equal(C.balances(s, '2026-02-10', true)[ca.id], 1000, 'compra no cartão não tira da conta antes de pagar');
  assert.equal(C.balances(s, '2026-02-10', false)[ca.id], 700, 'previsão desconta a fatura');
  const p1 = M.newTx({ type: 'deb', date: '2026-02-05', accountId: ca.id, amount: 100, desc: 'Pagamento de fatura' }); Object.assign(p1, { cardPay: true, faturaKey: key, itemId: '' }); s.tx.push(p1);
  f = C.faturas(s).find(x => x.key === key); assert.equal(f.status, 'parc'); assert.equal(f.paid, 100); assert.equal(f.rest, 200);
  assert.equal(C.balances(s, '2026-02-10', true)[ca.id], 900);
  assert.equal(C.monthSummary(s, '2026-02').desp, 300, 'pagamento de fatura não é despesa; a compra é');
  assert.equal(C.pendings(s).find(p => p.kind === 'fatura').amount, 200);
  assert.equal(C.faturaCandidates(s, { accountId: ca.id, date: '2026-02-20', amount: 200 })[0].exact, true);
  const p2 = M.newTx({ type: 'deb', date: '2026-02-20', accountId: ca.id, amount: 200 }); Object.assign(p2, { cardPay: true, faturaKey: key, itemId: '' }); s.tx.push(p2);
  f = C.faturas(s).find(x => x.key === key); assert.equal(f.status, 'liq'); assert.equal(C.balances(s, '2026-03-01', true)[ca.id], 700);
  // fatura paga antes do app: marcada à mão e com vencimento antes da data do saldo inicial → não mexe no saldo
  s.tx.push(M.newTx({ type: 'cred', date: '2025-12-10', accountId: cc.id, itemId: s.items[20].id, amount: 999 }));
  s.faturaMeta[cc.id + '|2026-01'] = { status: 'liq', upd: 1 };
  assert.equal(C.balances(s, '2026-03-01', true)[ca.id], 700);
  console.log('pagamento de fatura tests OK');
}
// ---- orçamento, relatório anual, CSV, calendário
{
  const s = M.emptyState(); s.config.setupDone = true; const pl = M.defaultPlan(); s.groups = pl.groups; s.items = pl.items;
  const ca = M.newAccount({ nature: 'debito', name: 'Conta; "X"' }), cc = M.newAccount({ nature: 'credito', name: 'K', closeDay: 25, dueDay: 5, payAccount: ca.id }); s.accounts.push(ca, cc);
  const merc = s.items.find(i => i.name === 'Mercado'), sal = s.items.find(i => i.name === 'Salário');
  M.setBudget(s, merc.id, 800); M.setBudget(s, merc.id, 1000, '2026-03');
  assert.equal(C.budgetOf(s, merc.id, '2026-02'), 800); assert.equal(C.budgetOf(s, merc.id, '2026-03'), 1000);
  s.tx.push(M.newTx({ type: 'deb', date: '2026-02-10', accountId: ca.id, itemId: merc.id, amount: 600 }));
  s.tx.push(M.newTx({ type: 'cred', date: '2026-01-20', accountId: cc.id, itemId: merc.id, amount: 300 })); // fatura de 2026-02
  s.tx.push(M.newTx({ type: 'rec', date: '2026-02-05', accountId: ca.id, itemId: sal.id, amount: 5000 }));
  const b = C.budgetMonth(s, '2026-02'); assert.equal(b.plan, 800); assert.equal(b.real, 900);
  assert.equal(C.avgLast(s, merc.id, '2026-05', 3), 300);
  const Y = C.yearTable(s, 2026); assert.equal(Y.despM[1], 900); assert.equal(Y.recT, 5000); assert.equal(Y.resM[1], 4100);
  const csv = C.txCsv(s, '2026-01-01', '2026-12-31'); assert(csv.startsWith('﻿Data;')); assert(csv.includes('"Conta; ""X"""')); assert(csv.includes('-600,00')); assert(csv.includes(';5000,00;'));
  assert(C.yearCsv(s, 2026).includes('RESULTADO;;'));
  s.tx.push(M.newTx({ type: 'deb', date: '2026-03-10', accountId: ca.id, itemId: merc.id, amount: 50, status: 'pend', desc: 'Conta de luz, março' }));
  const ics = C.icsPendings(s); assert(ics.includes('BEGIN:VEVENT')); assert(ics.includes('DTSTART;VALUE=DATE:20260310')); assert(ics.includes('Conta de luz\\, março')); assert((ics.match(/BEGIN:VEVENT/g) || []).length, 2);
  const a = M.clone(s), c2 = M.clone(s); M.setBudget(c2, sal.id, 5000); assert.equal(M.merge(a, c2).orc[sal.id].def, 5000);
  console.log('orçamento/anual/csv/ics tests OK');
}
