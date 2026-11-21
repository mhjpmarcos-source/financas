/* Conta que se repete que muda de lugar (assinatura que troca de cartão, ou passa do cartão para o Pix) e nome escolhido pela
   pessoa com o nome do banco guardado. Dados fictícios. Uso: node mover.test.mjs */
import assert from 'node:assert/strict';
import { buildPlan, applyPlan } from '../js/imp/plan.js';
import * as M from '../js/model.js';
import * as C from '../js/calc.js';

const S = M.emptyState(); S.config.setupDone = true; const pl = M.defaultPlan(); S.groups = pl.groups; S.items = pl.items;
const conta = M.newAccount({ nature: 'debito', name: 'Conta Exemplo' });
const cA = M.newAccount({ nature: 'credito', name: 'Cartão A', closeDay: 25, dueDay: 10, payAccountId: conta.id }), cB = M.newAccount({ nature: 'credito', name: 'Cartão B', closeDay: 25, dueDay: 10, payAccountId: conta.id });
S.accounts.push(conta, cA, cB);
const item = n => S.items.find(i => i.name === n).id;
const occ = (r, m) => S.tx.find(t => t.recId === r.id && t.recM === m);
// assinatura no cartão A, cadastrada com o nome do banco e já paga em março
const sub = M.newRec({ kind: 'fixa', type: 'cred', desc: 'STREAMING EXEMPLO COM BR', itemId: item('Compras diversas'), accountId: cA.id, amount: 39.9, day: 5, start: '2026-03' });
sub.words = M.normDesc(sub.desc); S.rec.push(sub); M.recFirst(S, sub, { date: '2026-03-05', amount: 39.9, status: 'liq' });
M.ensureRecurring(S, '2026-03-10');
const fat = (card, comp, lines) => buildPlan(S, { kind: 'fatura', lines, comp }, { accountId: card.id, comp });
const buy = (date, desc, amount) => ({ date, desc, amount, dir: 'out', role: 'normal' });

// a pessoa dá outro nome: vale para os meses em aberto e para o que já foi lançado; o nome antigo continua reconhecendo
const old = sub.desc; if (!sub.words) sub.words = M.normDesc(old);
M.editRec(S, sub, { desc: 'Filmes e séries' }, '2026-03'); M.renameRecHistory(S, sub, 'Filmes e séries');
assert.equal(occ(sub, '2026-03').desc, 'Filmes e séries'); assert.equal(occ(sub, '2026-04').desc, 'Filmes e séries');

// abril, mesmo cartão: a fatura traz o nome do banco; o lançamento fica com o nome escolhido e guarda o do banco
let comp = C.txComp(S, occ(sub, '2026-04'));
let p = fat(cA, comp, [buy('2026-04-05', 'STREAMING EXEMPLO COM BR', 39.9)]);
assert.equal(p.rows[0].status, 'prev', 'reconhece pelo nome antigo mesmo depois de renomear'); applyPlan(S, p);
assert.deepEqual([occ(sub, '2026-04').desc, occ(sub, '2026-04').rawDesc, occ(sub, '2026-04').prev], ['Filmes e séries', 'STREAMING EXEMPLO COM BR', false]);
assert(C.search(S, 'streaming').some(t => t.id === occ(sub, '2026-04').id), 'a busca acha pelo nome do banco');

// maio: a assinatura aparece na fatura do cartão B → pergunta se é a mesma, já marcada (nome conhecido e valor igual)
comp = C.txComp(S, occ(sub, '2026-05'));
p = fat(cB, comp, [buy('2026-05-06', 'STREAMING EXEMPLO COM BR', 39.9), buy('2026-05-07', 'PADARIA EXEMPLO', 12)]);
assert.deepEqual(p.rows.map(r => [r.status, !!r.moveOpt, !!r.move]), [['new', true, true], ['new', false, false]]);
assert.equal(p.rows[0].moveOpt.from, cA.id);
const before = S.tx.length; applyPlan(S, p);
assert.equal(S.tx.length, before + 1, 'só a padaria é lançamento novo; a assinatura ocupa o mês previsto');
assert.deepEqual([sub.accountId, occ(sub, '2026-05').accountId, occ(sub, '2026-05').prev, occ(sub, '2026-05').desc], [cB.id, cB.id, false, 'Filmes e séries']);
assert.equal(occ(sub, '2026-06').accountId, cB.id, 'os meses seguintes foram para o cartão novo'); assert.equal(occ(sub, '2026-04').accountId, cA.id, 'o que já foi pago fica onde foi pago');
assert.equal(S.tx.filter(t => t.recId === sub.id && t.recM === '2026-05').length, 1, 'sem previsto sobrando no cartão antigo');

// junho: passa a ser paga por Pix, com outro valor → mesma pergunta, já marcada porque o nome do banco é conhecido
p = buildPlan(S, { kind: 'extrato', lines: [{ date: '2026-06-05', desc: 'Pix Enviado · STREAMING EXEMPLO', title: 'Pix Enviado', detail: 'STREAMING EXEMPLO', amount: 44.9, dir: 'out', role: 'normal' }] }, { accountId: conta.id });
assert.deepEqual([p.rows[0].status, !!p.rows[0].moveOpt, p.rows[0].move], ['new', true, true]);
applyPlan(S, p);
assert.deepEqual([sub.type, sub.accountId, occ(sub, '2026-06').type, occ(sub, '2026-06').status, occ(sub, '2026-06').amount], ['deb', conta.id, 'deb', 'liq', 44.9]);
assert.deepEqual([occ(sub, '2026-07').type, occ(sub, '2026-07').accountId, occ(sub, '2026-07').prev], ['deb', conta.id, true]);
// sem marcar, nada muda de lugar: vira lançamento comum
p = buildPlan(S, { kind: 'extrato', lines: [{ date: '2026-07-05', desc: 'Pix Enviado · OUTRA COISA STREAMING', title: 'Pix Enviado', detail: 'OUTRA COISA STREAMING', amount: 300, dir: 'out', role: 'normal' }] }, { accountId: conta.id });
assert.equal(!!p.rows[0].moveOpt, false, 'valor muito diferente não é oferecido como a mesma conta');
console.log('conta fixa que muda de cartão ou de conta tests OK');
