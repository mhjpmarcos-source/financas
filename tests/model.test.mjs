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
