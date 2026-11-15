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
