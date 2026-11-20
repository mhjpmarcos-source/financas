/* Vínculo entre a linha do extrato e uma conta que se repete (aluguel, condomínio…): reconhecimento pelo nome que o banco usa,
   vínculo à mão e proposta de novo valor previsto quando o valor muda. Dados fictícios. Uso: node vinculo.test.mjs */
import assert from 'node:assert/strict';
import { buildPlan, applyPlan, setRowRec } from '../js/imp/plan.js';
import * as M from '../js/model.js';
import * as C from '../js/calc.js';

const S = M.emptyState(); S.config.setupDone = true; const pl = M.defaultPlan(); S.groups = pl.groups; S.items = pl.items;
const conta = M.newAccount({ nature: 'debito', name: 'Conta Exemplo' }); S.accounts.push(conta);
const item = n => S.items.find(i => i.name === n).id;
const rule = (desc, kind, amount, day, cat) => { const r = M.newRec({ kind, type: 'deb', desc, itemId: item(cat), accountId: conta.id, amount, day, start: '2026-03' }); S.rec.push(r); M.recFirst(S, r, { date: '2026-03-' + String(day).padStart(2, '0'), amount, status: 'pend' }); return r; };
const alug = rule('Aluguel do 5º andar', 'fixa', 2000, 10, 'Aluguel / Financiamento'), cond = rule('Condomínio', 'var', 500, 12, 'Condomínio');
M.ensureRecurring(S, '2026-03-01');
const occ = (r, m) => S.tx.find(t => t.recId === r.id && t.recM === m);
const line = (date, detail, amount) => ({ date, desc: 'Pagamento de Boleto · ' + detail, title: 'Pagamento de Boleto', detail, amount, dir: 'out', role: 'normal' });
const imp = lines => buildPlan(S, { kind: 'extrato', lines }, { accountId: conta.id });

// março: aluguel com reajuste (2.000 → 2.150) e condomínio com nome que o app não conhece: nada vincula sozinho na primeira vez
let p = imp([line('2026-03-10', 'IMOBILIARIA EXEMPLO LTDA', 2150), line('2026-03-12', 'ADMINISTRADORA FICTICIA', 900)]);
assert.deepEqual(p.rows.map(r => r.status), ['new', 'new']);
assert(p.rows[0].recOptions.some(o => o.id === occ(alug, '2026-03').id) && !p.rows[0].recOptions.some(o => o.recM && o.id === occ(cond, '2026-03').id), 'opções: contas previstas perto da data e de valor parecido');
assert(p.rows[1].recOptions.some(o => o.id === occ(cond, '2026-03').id));
// vínculo à mão: vira confirmação do previsto, com proposta de novo valor para a conta fixa
setRowRec(S, p, p.rows[0], occ(alug, '2026-03').id);
assert.deepEqual([p.rows[0].status, p.rows[0].linked, p.rows[0].oldAmount, p.rows[0].newAmount, p.rows[0].fixFuture], ['prev', true, 2000, 2150, true]);
setRowRec(S, p, p.rows[0], ''); assert.deepEqual([p.rows[0].status, p.rows[0].match, p.rows[0].newAmount], ['new', null, undefined]);
setRowRec(S, p, p.rows[0], occ(alug, '2026-03').id); setRowRec(S, p, p.rows[1], occ(cond, '2026-03').id);
assert.equal(p.rows[1].newAmount, undefined, 'conta de valor variável não tem "novo valor previsto": usa a média');
let res = applyPlan(S, p); assert.equal(res.created, 2); assert.equal(S.tx.filter(t => t.type === 'deb' && t.date.startsWith('2026-03')).length, 2, 'nada duplicado');
assert.deepEqual([occ(alug, '2026-03').amount, occ(alug, '2026-03').status, occ(alug, '2026-03').prev], [2150, 'liq', false]);
assert.equal(alug.amount, 2150); assert.equal(occ(alug, '2026-04').amount, 2150, 'próximos meses previstos com o valor novo'); assert.equal(occ(alug, '2026-04').prev, true);
assert.deepEqual(alug.keys, ['IMOBILIARIA EXEMPLO']); assert.deepEqual(cond.keys, ['ADMINISTRADORA FICTICIA']);
assert.equal(occ(cond, '2026-03').amount, 900);

// abril: o app reconhece sozinho pelo nome do banco, mesmo com valor bem diferente; sem marcar, o previsto não muda
M.ensureRecurring(S, '2026-04-01');
p = imp([line('2026-04-09', 'IMOBILIARIA EXEMPLO LTDA', 2300), line('2026-04-14', 'ADMINISTRADORA FICTICIA', 1400)]);
assert.deepEqual(p.rows.map(r => [r.status, r.match && r.match.id]), [['prev', occ(alug, '2026-04').id], ['prev', occ(cond, '2026-04').id]]);
assert.deepEqual([p.rows[0].oldAmount, p.rows[0].newAmount], [2150, 2300]);
p.rows[0].fixFuture = false; // foi multa por atraso, não reajuste
applyPlan(S, p); assert.equal(occ(alug, '2026-04').amount, 2300); assert.equal(alug.amount, 2150); assert.equal(occ(alug, '2026-05').amount, 2150);
// reimportar o mesmo extrato: nada novo
assert.deepEqual(imp([line('2026-04-09', 'IMOBILIARIA EXEMPLO LTDA', 2300)]).rows.map(r => r.status), ['already']);

// duas contas pagas à mesma administradora (aluguel e taxa): cada boleto vai para a de valor mais próximo
const taxa = rule('Taxa extra do 5º andar', 'fixa', 150, 10, 'Condomínio'); taxa.keys = ['IMOBILIARIA EXEMPLO']; M.ensureRecurring(S, '2026-05-01');
p = imp([line('2026-05-10', 'IMOBILIARIA EXEMPLO LTDA', 160), line('2026-05-10', 'IMOBILIARIA EXEMPLO LTDA', 2150)]);
assert.deepEqual(p.rows.map(r => r.match && r.match.recId), [taxa.id, alug.id]);
assert.deepEqual([p.rows[0].newAmount, p.rows[1].newAmount], [160, undefined]);

// sem conta cadastrada de valor parecido, a linha segue como despesa comum, sem opções
assert.deepEqual(imp([line('2026-09-20', 'LOJA QUALQUER', 5)]).rows.map(r => [r.status, r.recOptions.length]), [['new', 0]], 'valor muito diferente de qualquer conta prevista: sem opção de vínculo');
assert.equal(C.pendings(S, '2026-04-30').filter(x => x.kind === 'tx' && x.tx.recId === alug.id).length, 0, 'meses pagos saem das pendências');
console.log('vínculo extrato × contas que se repetem tests OK');
