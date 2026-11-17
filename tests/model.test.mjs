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

// reservas
{
  const s = M.emptyState(); const r = M.newReserve({ name: 'Emergência', target: 1200, deadline: '2027-04-30' });
  M.reserveMov(r, { v: 200, date: '2026-11-02' }); M.reserveMov(r, { v: -50, date: '2026-11-10' }); s.res.push(r);
  assert.equal(M.reserveSaved(r), 150);
  const R = C.reserves(s, '2026-11-16'), x = R.list[0];
  assert.equal(R.total, 150); assert.equal(x.rest, 1050); assert.equal(x.months, 6); assert.equal(x.perMonth, 175); assert.equal(x.thisMonth, 150);
  r.done = true; assert.equal(C.reserves(s, '2026-11-16').total, 0, 'concluída sai do total');
  assert.equal(M.reserveMov(r, { v: 0 }), null);
  // sincronização: reserva entra no merge como as outras coleções
  const a = M.emptyState(), b = M.emptyState(); const r2 = M.newReserve({ name: 'Viagem' }); b.res.push(r2);
  const m = M.merge(a, b); assert.equal(m.res.length, 1);
  M.removeRecord(m, 'res', r2.id); assert.equal(M.merge(m, b).res.length, 0, 'exclusão vence');
  console.log('reservas tests OK');
}

// retenção das cópias de segurança
{
  const today = '2026-11-16', files = [];
  for (let i = 0; i < 400; i++) { const d = new Date('2026-11-16T12:00:00'); d.setDate(d.getDate() - i); files.push({ id: 'd' + i, name: `financas-${d.toISOString().slice(0, 10)}.json` }); }
  files.push({ id: 'x1', name: 'financas-2026-11-01-1030-antes-de-restaurar.json' }, { id: 'x2', name: 'financas-2026-08-01-1030-manual.json' }, { id: 'o', name: 'outro.json' });
  const trash = new Set(M.backupsToTrash(files, today).map(f => f.id));
  for (let i = 0; i < 14; i++) assert(!trash.has('d' + i), 'últimos 14 dias ficam');
  assert(trash.has('d20') && !trash.has('x1') && trash.has('x2') && !trash.has('o'));
  const kept = files.filter(f => /^d/.test(f.id) && !trash.has(f.id)).map(f => f.name.slice(9, 19));
  const months = new Set(kept.map(d => d.slice(0, 7))); assert.equal(kept.length, 14 + months.size - 1, 'uma por mês além das diárias');
  assert(!kept.some(d => d < '2025-11-15'), 'nada com mais de um ano');
  assert(kept.includes('2026-10-31') && kept.includes('2026-01-31'), 'a mais recente de cada mês');
  assert.equal(M.recordCount(M.emptyState()), 0);
  console.log('cópias tests OK');
}

// fixas, variáveis, parcelas previstas e Pix
{
  const IP = await import('../js/imp/plan.js');
  const PX = await import('../js/pix.js');
  const base = () => { const s = M.emptyState(); s.accounts.push({ id: 'cc', name: 'Conta', nature: 'debito', initial: 0 }, { id: 'k', name: 'Cartão', nature: 'credito', closeDay: 25, dueDay: 10 }); s.items.push({ id: 'luz', name: 'Energia', groupId: 'g' }, { id: 'net', name: 'Internet', groupId: 'g' }); s.groups.push({ id: 'g', name: 'Casa', kind: 'despesa' }); return s; };
  // fixa sem fim: 12 meses à frente, ids fixos (dois aparelhos geram o mesmo)
  const s = base(); const r = M.newRec({ kind: 'fixa', type: 'deb', desc: 'Internet', itemId: 'net', accountId: 'cc', amount: 99.9, day: 31, start: '2026-11' });
  s.rec.push(r); M.recFirst(s, r, { date: '2026-11-10', amount: 99.9, status: 'liq' });
  assert.equal(M.ensureRecurring(s, '2026-11-17'), 12);
  const occ = M.recOccs(s, r); assert.equal(occ.length, 13); assert.equal(occ[1].date, '2026-12-31'); assert.equal(occ[3].date, '2027-02-28', 'dia 31 em fevereiro');
  assert.equal(M.ensureRecurring(s, '2026-11-17'), 0, 'não duplica');
  const s2 = JSON.parse(JSON.stringify(s)); s2.tx = s2.tx.filter(t => !t.prev); M.ensureRecurring(s2, '2026-11-17');
  assert.equal(M.merge(s, s2).tx.filter(t => t.recId === r.id).length, 13, 'mesmo id nos dois aparelhos');
  // excluir um mês: não volta
  M.removeRecord(s, 'tx', M.recOccId(r, '2027-03')); M.ensureRecurring(s, '2026-11-17'); assert(!s.tx.some(t => t.recM === '2027-03'));
  // mudar valor a partir de jan; encerrar em abr; reabrir
  M.editRec(s, r, { amount: 109.9 }, '2027-01'); assert.equal(s.tx.find(t => t.recM === '2026-12').amount, 99.9); assert.equal(s.tx.find(t => t.recM === '2027-01').amount, 109.9);
  M.endRec(s, r, '2027-04'); assert.equal(M.recOccs(s, r).filter(t => t.recM > '2027-04').length, 0); M.ensureRecurring(s, '2026-11-17'); assert.equal(M.recOccs(s, r).filter(t => t.recM > '2027-04').length, 0);
  M.reopenRec(s, r); M.ensureRecurring(s, '2026-11-17'); assert.equal(M.recOccs(s, r).filter(t => t.recM > '2027-04').length, 7);
  // variável: previsão = média dos 3 últimos confirmados
  const v = base(); const rv = M.newRec({ kind: 'var', type: 'deb', desc: 'Conta de luz', itemId: 'luz', accountId: 'cc', amount: 150, day: 15, start: '2026-08' }); v.rec.push(rv);
  M.ensureRecurring(v, '2026-11-17');
  [['2026-08', 120], ['2026-09', 180], ['2026-10', 210]].forEach(([m, a]) => { const t = v.tx.find(x => x.recM === m); t.amount = a; t.status = 'liq'; delete t.prev; });
  M.ensureRecurring(v, '2026-11-17'); assert.equal(v.tx.find(x => x.recM === '2026-12').amount, 170);
  assert.deepEqual([C.recStats(v, rv).avg3, C.recStats(v, rv).min, C.recStats(v, rv).max], [170, 120, 210]);
  // importação de extrato confirma o mês previsto da conta de luz (valor diferente), sem duplicar
  const ext = { kind: 'extrato', lines: [{ date: '2026-11-16', desc: 'PAGTO ENERGIA ELETRICA', title: 'Pagamento conta', amount: 163.42, dir: 'out', role: 'normal' }] };
  let plan = IP.buildPlan(v, ext, { accountId: 'cc' }); assert.equal(plan.rows[0].status, 'prev', 'acha pela categoria');
  IP.applyPlan(v, plan); const nov = v.tx.find(x => x.recM === '2026-11'); assert.equal(nov.amount, 163.42); assert.equal(nov.status, 'liq'); assert(!nov.prev);
  assert.equal(v.tx.filter(x => x.date === '2026-11-16').length, 1);
  // parcelas: fatura de nov com 3/10 cria 4..10 previstas; fatura de dez com 4/10 ocupa a prevista
  const p = base();
  const fat = (comp, i) => ({ kind: 'fatura', lines: [{ date: '2026-08-20', desc: 'LOJA EXEMPLO', title: 'LOJA EXEMPLO 0' + i + '/10', amount: 85.5, dir: 'out', parc: { i, n: 10 }, role: 'normal' }] });
  plan = IP.buildPlan(p, fat('2026-11', 3), { accountId: 'k', comp: '2026-11' }); assert.equal(plan.projN, 7);
  IP.applyPlan(p, plan); assert.equal(p.tx.length, 8); assert.equal(p.tx.filter(t => t.prev).length, 7);
  assert.equal(p.tx.find(t => t.parcI === 10).comp, '2027-06');
  plan = IP.buildPlan(p, fat('2026-12', 4), { accountId: 'k', comp: '2026-12' }); assert.equal(plan.rows[0].status, 'prev'); assert.equal(plan.projN, 0);
  IP.applyPlan(p, plan); assert.equal(p.tx.length, 8, 'não duplica'); assert.equal(p.tx.filter(t => t.prev).length, 6);
  plan = IP.buildPlan(p, fat('2026-11', 3), { accountId: 'k', comp: '2026-11' }); assert.equal(plan.rows[0].status, 'already');
  const ps = C.parcelSummary(p, '2026-11-17'); assert.equal(ps.length, 1); assert.equal(ps[0].until, '2027-06');
  // parcelado fora do cartão: valor total dividido, datas mês a mês
  const ser = M.makeSeries({ type: 'deb', amount: 1000, date: '2026-11-05', accountId: 'cc', itemId: 'net', kind: 'parc' }, 3);
  assert.deepEqual(ser.map(t => t.amount).reduce((a, b) => a + b, 0).toFixed(2), '1000.00'); assert.equal(ser[2].date, '2027-01-05');
  // detecção no histórico
  const h = base();
  [['2026-05-10', 99.9], ['2026-06-10', 99.9], ['2026-07-10', 99.9], ['2026-08-10', 99.9], ['2026-09-10', 99.9], ['2026-10-10', 99.9]].forEach(([d, a]) => h.tx.push(M.newTx({ type: 'deb', date: d, accountId: 'cc', itemId: 'net', amount: a, desc: 'NET SERVICOS ' + d.slice(5, 7) })));
  [['2026-06-15', 140], ['2026-08-15', 180], ['2026-09-15', 160], ['2026-10-15', 175]].forEach(([d, a]) => h.tx.push(M.newTx({ type: 'deb', date: d, accountId: 'cc', itemId: 'luz', amount: a, desc: 'Conta de luz' })));
  for (let i = 0; i < 12; i++) h.tx.push(M.newTx({ type: 'deb', date: '2026-09-' + String(i + 1).padStart(2, '0'), accountId: 'cc', itemId: 'net', amount: 30, desc: 'Padaria' }));
  const det = C.detectRecurring(h, '2026-11-17');
  assert.deepEqual(det.map(d => [d.desc.slice(0, 12), d.kind]), [['Conta de luz', 'var'], ['NET SERVICOS', 'fixa']]);
  assert.equal(det[0].amount, 171.67); assert.equal(det[1].n, 6);
  // Pix
  assert.equal(PX.crc16('00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***6304'), '1D3D');
  const code = PX.payload({ key: PX.normalizeKey('fulano@exemplo.com').key, name: 'José da Silva', city: 'Brasília', amount: 150.5 });
  assert.match(code, /54061\d?50\.50/); assert.match(code, /5913JOSE DA SILVA/); assert.equal(code.slice(-4), PX.crc16(code.slice(0, -4)));
  assert.equal(PX.normalizeKey('(61) 98888-7777').key, '+5561988887777'); assert.equal(PX.normalizeKey('abc'), null);
  console.log('fixas/parcelas/pix tests OK');
}

// planilha de parcelamentos e reimportação de fatura antiga
{
  const IP = await import('../js/imp/plan.js'); const PP = await import('../js/imp/parcelas.js');
  const base = () => { const s = M.emptyState(); s.accounts.push({ id: 'k', name: "Cartão Exemplo", nature: 'credito', closeDay: 25, dueDay: 10 }); return s; };
  const rows = [{ card: 'Cartão X', comp: '2026-11', date: '2026-09-10', desc: 'LOJA A', i: 2, n: 6, amount: 21.49 }, { card: 'Cartão X', comp: '2026-11', date: '2026-05-09', desc: 'LOJA B', i: 6, n: 8, amount: 7.09 }, { card: 'Cartão X', comp: '2026-11', date: '2026-05-09', desc: 'LOJA B', i: 6, n: 8, amount: 7.09 }];
  const txt = PP.toCsv(rows); assert(PP.isParcelFile(txt)); const back = PP.parse(txt); assert.equal(back.rows.length, 3); assert.deepEqual(back.rows[0], rows[0]);
  assert.equal(PP.parse(txt + 'x;2026-1;;;;;\r\n').errors.length, 1);
  const s = base(); let r = PP.apply(s, back.rows, { 'Cartão X': 'k' });
  assert.equal(r.created, 4 + 2 + 2); assert.equal(s.tx.filter(t => t.desc.startsWith('LOJA B')).length, 4, 'compras iguais não se fundem');
  assert.equal(s.tx.find(t => t.parcI === 6 && t.desc.startsWith('LOJA A')).comp, '2027-03');
  assert.equal(PP.apply(s, back.rows, { 'Cartão X': 'k' }).created, 0, 'aplicar de novo não duplica');
  const s2 = base(); assert.equal(PP.apply(s2, back.rows, { 'Cartão X': 'k' }, { k: '2027-01' }).created, 3 + 1 + 1, 'a partir de jan/27');
  // a fatura real de dez substitui as previstas (mesmo id)
  const fat = { kind: 'fatura', lines: [{ date: '2026-09-10', desc: 'LOJA A', title: 'LOJA A 03/06', amount: 21.49, dir: 'out', parc: { i: 3, n: 6 }, role: 'normal' }, { date: '2026-05-09', desc: 'LOJA B', title: 'LOJA B 07/08', amount: 7.09, dir: 'out', parc: { i: 7, n: 8 }, role: 'normal' }, { date: '2026-05-09', desc: 'LOJA B', title: 'LOJA B 07/08', amount: 7.09, dir: 'out', parc: { i: 7, n: 8 }, role: 'normal' }] };
  const plan = IP.buildPlan(s, fat, { accountId: 'k', comp: '2026-12' }); assert.deepEqual(plan.rows.map(x => x.status), ['prev', 'prev', 'prev']);
  const n0 = s.tx.length; IP.applyPlan(s, plan); assert.equal(s.tx.length, n0, 'nada duplicado'); assert.equal(s.tx.filter(t => t.prev).length, 8 - 3);
  // fatura importada antes da 0.8 (sem parcelas futuras): reimportar lança as previstas
  const o = base(); const f1 = { kind: 'fatura', lines: [{ date: '2026-09-15', desc: 'AIRBNB', title: 'AIRBNB 2/6', amount: 299.23, dir: 'out', parc: { i: 2, n: 6 }, role: 'normal' }] };
  let pl = IP.buildPlan(o, f1, { accountId: 'k', comp: '2026-11' }); pl.project = false; IP.applyPlan(o, pl); assert.equal(o.tx.length, 1);
  o.tx[0].id = 'antigo'; delete o.tx[0].parcKey;
  pl = IP.buildPlan(o, f1, { accountId: 'k', comp: '2026-11' }); assert.equal(pl.rows[0].status, 'already'); assert.equal(pl.projN, 4);
  IP.applyPlan(o, pl); assert.equal(o.tx.length, 5); assert.equal(o.tx.find(t => t.id === 'antigo').parcKey, pl.rows[0].parcKey);
  assert.equal(IP.buildPlan(o, f1, { accountId: 'k', comp: '2026-11' }).projN, 0);
  console.log('planilha de parcelas tests OK');
}
