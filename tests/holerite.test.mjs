/* Testes do contracheque com documentos FICTÍCIOS (gerados por fixtures/gerar.py), das contas de investimento
   e do detalhamento do saldo. Uso: python3 fixtures/gerar.py && node holerite.test.mjs */
import assert from 'node:assert/strict';
import fs from 'node:fs';
const pdfjs = await import(process.env.PDFJS || 'pdfjs-dist/legacy/build/pdf.mjs');
import { openPdf, pdfLines } from '../js/imp/pdftext.js';
import * as P from '../js/imp/parse.js';
import * as H from '../js/imp/holerite.js';
import { buildPlan, applyPlan } from '../js/imp/plan.js';
import * as M from '../js/model.js';
import * as C from '../js/calc.js';
const fx = f => new Uint8Array(fs.readFileSync(new URL('./fixtures/' + f, import.meta.url)));
const lines = async f => pdfLines(await openPdf(pdfjs, fx(f)));
const read = async f => H.parseHolerite(await lines(f));

// ---------- leitura ----------
const h1 = await read('contracheque-ficticio-01.pdf');
assert.equal(h1.kind, 'holerite'); assert.equal(h1.ok, true, h1.check.msg);
assert.equal(h1.empregador, 'Empresa Ficticia de Exemplo Ltda'); assert.equal(h1.tipo, 'normal');
assert.deepEqual([h1.de, h1.ate, h1.credito], ['2026-01-01', '2026-01-31', '2026-02-05']);
assert.deepEqual([h1.bruto, h1.desc, h1.liq], [6800, 1950, 4850]); assert.equal(h1.banco, 'Banco Exemplo'); assert.equal(h1.faixa, 27.5); assert.equal(h1.margem, 1500);
assert.equal(h1.rubs.length, 8, 'duas vias iguais contam uma vez');
assert.deepEqual(h1.rubs.find(r => r.code === '930'), { code: '930', desc: 'Empréstimo Banco Exemplo 1', ref: '5,24', col: 'D', v: 400 });
assert.equal(h1.rubs.filter(r => r.col === 'V').length, 3);
// a linha "INSS 6.000,00 600,00" seguida de "IRRF 5.400,00" não pode ser confundida com a linha de totais
const h4 = await read('contracheque-ficticio-04-ferias.pdf');
assert.equal(h4.ok, true, h4.check.msg); assert.equal(h4.rubs.length, 14, 'folha 1 + folha 2; a 2ª via (página 2) não duplica'); assert.equal(h4.liq, 2575.56);
const h13 = await read('contracheque-ficticio-13.pdf'); assert.equal(h13.tipo, '13adt'); assert.equal(h13.liq, 2600);
// fatura de cartão não é contracheque; e o leitor de faturas continua igual
assert.equal(H.parseHolerite(await lines('fatura-ficticia.pdf')), null);
assert.equal(P.parsePdfPages(await lines('fatura-ficticia.pdf')).kind, 'fatura');

// ---------- estado de teste ----------
const S = M.emptyState(); S.config.setupDone = true; const pl = M.defaultPlan(); S.groups = pl.groups; S.items = pl.items;
const conta = M.newAccount({ nature: 'debito', name: 'Conta Exemplo', initial: 100, initialDate: '2025-12-31' }); S.accounts.push(conta);
const item = n => S.items.find(i => i.name === n).id;
assert.equal(H.guessAccount(S, 'Banco Exemplo'), conta.id); assert.equal(H.guessAccount(S, 'Banco Outro'), '');

// ---------- primeiro contracheque ----------
let plan = H.buildSlipPlan(S, [h1]);
const kinds = Object.fromEntries(plan.rubs.map(r => [r.desc, r.kind + (r.exp ? ':' + S.items.find(i => i.id === r.exp).name : '')]));
assert.deepEqual(kinds, { 'Dias Normais': 'fix', 'Gratificação de Função': 'fix', 'Auxílio Alimentação': 'fix', 'INSS salário': 'tax', 'IRRF salário': 'tax',
  'Desconto Sindicato': 'fix:Taxas e anuidades profissionais', 'Desc Assist Médica': 'fix:Plano de saúde', 'Empréstimo Banco Exemplo 1': 'fix:Parcela de empréstimo' });
assert.equal(plan.banks['Banco Exemplo'], conta.id); assert.equal(plan.slips[0].credito, '2026-02-05');
const loanRow = plan.rubs.find(r => r.loan); assert.deepEqual([loanRow.pi, loanRow.pn, loanRow.pm], [5, 24, '2026-01']);
assert.equal(H.planPiso(S, plan).piso, 4850, 'mês limpo: o piso é o próprio líquido');
let res = H.applySlipPlan(S, plan, '2026-02-10');
assert.deepEqual([res.slips, res.created, res.folha], [1, 1, 3]);
const sal = S.tx.find(t => t.slipId && t.type === 'rec');
assert.deepEqual([sal.amount, sal.date, sal.status, sal.itemId, sal.accountId], [4850, '2026-02-05', 'liq', item('Salário'), conta.id]);
const folha = S.tx.filter(t => t.folha && !t.prev); assert.equal(folha.length, 3); assert(folha.every(t => t.type === 'deb' && t.date === '2026-02-05' && t.folhaItem === item('Salário') && t.accountId === ''), 'pago pela folha: sem conta');
// o consignado é uma dívida paga pela folha; tudo o que a folha paga fica agendado até o mesmo horizonte da renda prevista (12 meses)
assert.equal(S.loans.length, 1); const cons = S.loans[0]; assert.deepEqual([cons.dir, cons.folha, cons.person, cons.parcel, cons.i0, cons.n, cons.asOf, cons.accountId], ['out', true, 'Empréstimo Banco Exemplo 1', 400, 5, 24, '2026-01', '']);
const sched = S.tx.filter(t => t.folha && t.prev); assert.equal(sched.length, 12 + 12 + 12); assert(sched.every(t => t.status === 'pend' && t.accountId === ''));
const nextP = sched.filter(t => t.loanId === cons.id).sort((a, b) => a.date < b.date ? -1 : 1); assert.deepEqual([nextP[0].desc, nextP[0].date, nextP[11].desc, nextP[11].folhaM], ['Empréstimo Banco Exemplo 1 (6/24)', '2026-03-05', 'Empréstimo Banco Exemplo 1 (17/24)', '2027-01']);
assert.deepEqual([H.loansOf(S)[0].end, H.loansOf(S)[0].n], ['2027-08', 24], 'o fim do consignado vem da parcela, não da agenda');
{ // com o passar dos meses a agenda da folha acompanha o horizonte, até a última parcela
  const Z = JSON.parse(JSON.stringify(S));
  assert.equal(H.maintain(Z, '2026-02-10', true), 0, 'nada a fazer no mesmo mês');
  assert(H.maintain(Z, '2026-12-10') > 0);
  const zs = Z.tx.filter(t => t.folha && t.prev && t.loanId).map(t => t.folhaM).sort();
  assert.equal(zs[zs.length - 1], '2027-08', 'para na última parcela'); assert.equal(H.maintain(Z, '2026-12-10', true), 0);
  const lastM = m => C.monthSummary(Z, m);
  assert.equal(lastM('2027-12').rec, 5500, 'último mês do horizonte: renda e descontos previstos juntos'); assert.equal(lastM('2028-01').rec, 0, 'além do horizonte não sobra só o desconto');
}
assert.deepEqual(C.monthSummary(S, '2026-03'), { rec: 5500, desp: 650, saldo: 4850, folha: 650 }, 'mês futuro: líquido previsto + o que a folha paga');
assert.equal(folha.find(t => /Empr/.test(t.desc)).desc, 'Empréstimo Banco Exemplo 1 (5/24)');
// o saldo só recebe o líquido; o resumo mostra os descontos em folha como despesa e soma o mesmo valor à receita
assert.equal(C.balances(S, '2026-02-28', true)[conta.id], 4950);
assert.deepEqual(C.monthSummary(S, '2026-02'), { rec: 5500, desp: 650, saldo: 4850, folha: 650 });
assert.equal(C.byCategory(S, '2026-02').reduce((s, g) => s + g.total, 0), 650);
const recCat = C.byCategory(S, '2026-02', 'receita'); assert.equal(recCat[0].items[0].name, 'Salário'); assert.equal(recCat[0].items[0].total, 5500); assert.equal(recCat[0].items[0].n, 1);
assert.equal(C.yearTable(S, 2026).resM[1], 4850);
// previsão: regra com o piso a partir do mês seguinte ao crédito
const job = S.jobs[0], rule = S.rec.find(r => r.id === job.recId);
assert.deepEqual([rule.type, rule.kind, rule.amount, rule.day, rule.start, rule.accountId], ['rec', 'fixa', 4850, 5, '2026-02', conta.id]);
assert.deepEqual([sal.recId, sal.recM], [rule.id, '2026-02']);
const mar = S.tx.find(t => t.recId === rule.id && t.recM === '2026-03'); assert(mar.prev && mar.status === 'pend' && mar.amount === 4850 && mar.date === '2026-03-05');
assert.equal(C.detectRecurring(S, '2026-08-10').length, 0, 'salário e descontos em folha não viram sugestão de conta fixa');
assert.equal(C.pendings(S).filter(p => p.kind === 'tx' && p.tx.folha).length, 0);

// reimportar o mesmo contracheque: nada duplica
plan = H.buildSlipPlan(S, [h1]); assert.equal(plan.slips[0].already, true);
const nTx = S.tx.length; H.applySlipPlan(S, plan, '2026-02-10'); assert.equal(S.tx.length, nTx); assert.equal(S.slips.length, 1);

// ---------- segundo contracheque (com horas extras): confirma o mês previsto, eventual não muda o piso ----------
const h2 = await read('contracheque-ficticio-02.pdf');
plan = H.buildSlipPlan(S, [h2]);
assert.equal(plan.rubs.find(r => /Horas Extras/.test(r.desc)).kind, 'ev');
assert.equal(plan.rubs.find(r => r.loan).pi, 6);
let diff = H.planDiff(S, plan);
assert.deepEqual(diff.eventuais.map(e => e.desc), ['Horas Extras 50%']); assert.deepEqual(diff.changes, [], 'IRRF maior por causa do eventual não é mudança do fixo');
assert.equal(H.planPiso(S, plan).piso, 4850);
H.applySlipPlan(S, plan, '2026-03-10');
assert.deepEqual([mar.prev, mar.status, mar.amount, mar.slipId != null], [undefined, 'liq', 5212.5, true], 'o previsto de março virou o valor real');
assert.equal(S.tx.filter(t => t.type === 'rec' && t.date.startsWith('2026-03')).length, 1);
assert.equal(S.tx.find(t => t.recId === rule.id && t.recM === '2026-04').amount, 4850);
assert.equal(C.balances(S, '2026-03-31', true)[conta.id], 100 + 4850 + 5212.5);

// ---------- terceiro: reajuste e desconto novo ----------
const h3 = await read('contracheque-ficticio-03.pdf');
plan = H.buildSlipPlan(S, [h3]); diff = H.planDiff(S, plan);
assert.deepEqual(diff.changes.map(c => [c.what, c.desc, c.v]).sort(), [['novo', 'Seguro de Vida', 30], ['valor', 'Dias Normais', 5200], ['valor', 'IRRF salário', 755]].sort());
assert.equal(H.planPiso(S, plan).piso, 4965);
H.applySlipPlan(S, plan, '2026-04-10');
assert.equal(rule.amount, 4965); assert.equal(S.tx.find(t => t.recId === rule.id && t.recM === '2026-05').amount, 4965);
assert.equal(S.tx.find(t => t.recId === rule.id && t.recM === '2026-04').amount, 4965, 'abril foi confirmado pelo contracheque de março');

// ---------- férias (duas folhas) e adiantamento do 13º ----------
plan = H.buildSlipPlan(S, [h13, h4]);
assert.deepEqual(plan.slips.map(s => s.h.tipo), ['normal', '13adt'], 'em ordem de período');
assert.equal(plan.rubs.find(r => r.desc === 'Desconto de Férias').kind, 'ev'); assert.equal(plan.rubs.find(r => r.desc === 'INSS férias').kind, 'ev');
assert.equal(H.planPiso(S, plan).piso, 4965, 'mês de férias não muda o piso');
H.applySlipPlan(S, plan, '2026-05-10');
const t13 = S.tx.find(t => t.slipId === plan.slips[1].id && t.type === 'rec'); assert.deepEqual([t13.amount, t13.date, t13.itemId, t13.recId], [2600, '2026-06-30', item('13º salário'), undefined]);
assert.equal(S.tx.find(t => t.recId === rule.id && t.recM === '2026-05').amount, 2575.56);
assert.equal(S.tx.find(t => t.recId === rule.id && t.recM === '2026-06').amount, 4965);
assert.equal(S.slips.length, 5); assert.equal(H.slipsOf(S, job.id).length, 5);

// ---------- consignado: parcela lida e correção manual ----------
let loans = H.loansOf(S, job.id);
assert.deepEqual([loans[0].i, loans[0].n, loans[0].left, loans[0].end, loans[0].rest, loans[0].manual], [8, 24, 16, '2027-08', 6400, false]);
assert.equal(S.tx.filter(t => t.loanId === loans[0].id && t.prev).length, 12, 'agenda até o horizonte da renda prevista');
const n = H.setLoanParc(S, loans[0].id, 10, 30, '2026-04', '2026-05-10'); assert(n >= 4, 'descrições corrigidas');
assert.equal(S.tx.filter(t => t.loanId === loans[0].id && t.prev).length, 12, 'agenda refeita com os números novos');
loans = H.loansOf(S, job.id); assert.deepEqual([loans[0].i, loans[0].n, loans[0].left, loans[0].end, loans[0].manual], [10, 30, 20, '2027-12', true]);
assert.deepEqual(S.tx.filter(t => t.folha && !t.prev && /Empr/.test(t.desc)).map(t => t.desc.match(/\((.*)\)/)[1]).sort(), ['10/30', '7/30', '8/30', '9/30']);
// a correção continua valendo no próximo contracheque (anda um número por mês)
const h5 = JSON.parse(JSON.stringify(h3)); Object.assign(h5, { de: '2026-05-01', ate: '2026-05-31', credito: '2026-06-05' });
plan = H.buildSlipPlan(S, [h5]); assert.deepEqual([plan.rubs.find(r => r.loan).pi, plan.rubs.find(r => r.loan).pn], [11, 30]);
// correção feita na própria revisão
plan.rubs.find(r => r.loan).pi = 12; plan.rubs.find(r => r.loan).pedit = true;
H.applySlipPlan(S, plan, '2026-06-10');
assert.equal(S.tx.find(t => t.folha && !t.prev && t.date === '2026-06-05' && /Empr/.test(t.desc)).desc, 'Empréstimo Banco Exemplo 1 (12/30)');
assert.deepEqual([cons.i0, cons.n, cons.asOf, cons.manual, job.parc], [12, 30, '2026-05', true, undefined]);
H.setLoanParc(S, cons.id, 0, 0, '2026-05', '2026-06-10'); assert.deepEqual([H.loansOf(S, job.id)[0].i, H.loansOf(S, job.id)[0].n], [7, 24], 'sem correção volta a valer o que o contracheque traz');

// ---------- o usuário muda a classificação: vale para os próximos e recalcula o piso ----------
plan = H.buildSlipPlan(S, [h5]); assert.equal(plan.rubs.find(r => r.desc === 'Seguro de Vida').how, 'escolha anterior');
plan.rubs.find(r => r.desc === 'Seguro de Vida').exp = item('Seguro do veículo');
H.applySlipPlan(S, plan, '2026-06-10');
assert.equal(S.tx.filter(t => t.folha && !t.prev && t.date === '2026-06-05').length, 4);
assert.equal(C.monthSummary(S, '2026-06').folha, 680);

// ---------- extrato importado depois: o crédito do salário é reconhecido como já lançado ----------
const st = { kind: 'extrato', lines: [{ date: '2026-06-05', desc: 'RECEBIMENTO DE PROVENTOS', amount: 4965, dir: 'in', role: 'normal' }] };
const ip = buildPlan(S, st, { accountId: conta.id }); assert.equal(ip.rows[0].status, 'dup');
// extrato importado ANTES do contracheque: o contracheque se liga ao lançamento do extrato, sem duplicar
const S2 = M.emptyState(); S2.config.setupDone = true; S2.groups = pl.groups; S2.items = pl.items; const c2 = M.newAccount({ nature: 'debito', name: 'Conta Exemplo' }); S2.accounts.push(c2);
applyPlan(S2, buildPlan(S2, { kind: 'extrato', lines: [{ date: '2026-02-05', desc: 'RECEBIMENTO DE PROVENTOS', amount: 4850, dir: 'in', role: 'normal' }] }, { accountId: c2.id }));
assert.equal(S2.tx.length, 1); const ext = S2.tx[0];
H.applySlipPlan(S2, H.buildSlipPlan(S2, [h1]));
assert.equal(S2.tx.filter(t => t.type === 'rec' && t.date.startsWith('2026-02')).length, 1); assert.equal(ext.slipId, S2.slips[0].id); assert.equal(ext.desc, 'RECEBIMENTO DE PROVENTOS');
assert.equal(S2.tx.filter(t => t.folha && !t.prev).length, 3);

// salário e 13º creditados no mesmo dia que o extrato trouxe como um crédito só: o total continua o mesmo
const S5 = M.emptyState(); S5.config.setupDone = true; S5.groups = pl.groups; S5.items = pl.items; const c5 = M.newAccount({ nature: 'debito', name: 'Conta Exemplo' }); S5.accounts.push(c5);
const h13b = JSON.parse(JSON.stringify(h13)); h13b.credito = '2026-04-06';
applyPlan(S5, buildPlan(S5, { kind: 'extrato', lines: [{ date: '2026-04-06', desc: 'RECEBIMENTO DE PROVENTOS', amount: 7565, dir: 'in', role: 'normal' }] }, { accountId: c5.id }));
H.applySlipPlan(S5, H.buildSlipPlan(S5, [h3, h13b]), '2026-04-10');
assert.deepEqual(S5.tx.filter(t => t.type === 'rec' && !t.prev && t.date === '2026-04-06').map(t => t.amount).sort(), [2600, 4965]);
assert.equal(C.balances(S5, '2026-04-30', true)[c5.id], 7565);
assert.equal(H.guessAccount({ accounts: [{ id: 'x', nature: 'debito', name: 'BB' }] }, 'Banco Brasileiro de Exemplo'), '', 'outro banco com "brasil" no nome não é o Banco do Brasil');
assert.equal(H.guessAccount({ accounts: [{ id: 'x', nature: 'debito', name: 'BB' }] }, 'Banco do Brasil'), 'x');

// contracheque antigo importado bem depois: a previsão começa no mês atual, sem "atrasados" no passado
const S4 = M.emptyState(); S4.config.setupDone = true; S4.groups = pl.groups; S4.items = pl.items; const c4 = M.newAccount({ nature: 'debito', name: 'Conta Exemplo' }); S4.accounts.push(c4);
H.applySlipPlan(S4, H.buildSlipPlan(S4, [h1]), '2026-11-20');
assert.equal(S4.rec[0].start, '2026-11'); assert.equal(S4.tx.filter(t => t.prev && t.recM < '2026-11').length, 0); assert.equal(S4.tx.filter(t => t.prev && t.recId).length, 13);
assert.equal(C.pendings(S4, '2026-10-31').length, 0);
H.applySlipPlan(S4, H.buildSlipPlan(S4, [h2, h3]), '2026-11-20'); assert.equal(S4.tx.filter(t => t.type === 'rec' && !t.prev).length, 3); assert.equal(S4.rec[0].amount, 4965);
assert.equal(S4.tx.find(t => t.recM === '2026-12').amount, 4965);

// ---------- só histórico (sem conta), excluir contracheque, junção entre aparelhos ----------
const S3 = M.emptyState(); S3.config.setupDone = true; S3.groups = pl.groups; S3.items = pl.items;
plan = H.buildSlipPlan(S3, [h1, h2]); assert.equal(plan.banks['Banco Exemplo'], '');
res = H.applySlipPlan(S3, plan, '2026-03-10'); assert.equal(S3.slips.length, 2); assert.equal(S3.tx.filter(t => !t.folha).length, 0, 'sem conta: o líquido não é lançado'); assert.equal(S3.rec.length, 0); assert.equal(res.piso.piso, 4850);
assert.equal(S3.tx.filter(t => t.folha && !t.prev).length, 6, 'mas o que a folha paga é registrado do mesmo jeito'); assert.equal(S3.loans.length, 1); assert.deepEqual([H.loansOf(S3)[0].i, H.loansOf(S3)[0].n], [6, 24]);
assert.deepEqual(C.balances(S3, '2026-12-31', false), {});
// consignado perto do fim: o líquido previsto sobe quando ele termina; e "acabou" tira as parcelas agendadas
const S6 = M.emptyState(); S6.config.setupDone = true; S6.groups = pl.groups; S6.items = pl.items; const c6 = M.newAccount({ nature: 'debito', name: 'Conta Exemplo' }); S6.accounts.push(c6);
H.applySlipPlan(S6, H.buildSlipPlan(S6, [h1]), '2026-02-10'); const l6 = S6.loans[0], r6 = S6.rec[0];
const fc = m => S6.tx.find(t => t.recId === r6.id && t.recM === m).amount;
H.setLoanParc(S6, l6.id, 23, 24, '2026-01', '2026-02-10');
assert.equal(S6.tx.filter(t => t.loanId === l6.id && t.prev).length, 1); assert.deepEqual([fc('2026-03'), fc('2026-04'), fc('2026-09')], [4850, 5250, 5250], 'última parcela em fev; a partir do contracheque de março o líquido sobe 400');
assert.equal(H.adjustForecast(S6, true), 0);
H.setLoanParc(S6, l6.id, 5, 24, '2026-01', '2026-02-10'); assert.equal(fc('2026-04'), 4850);
H.closeLoan(S6, l6.id, '2026-02-10'); assert.equal(S6.tx.filter(t => t.loanId === l6.id && t.prev).length, 0); assert.equal(H.loanInfo(S6, l6).ended, true); assert.deepEqual([fc('2026-03'), fc('2026-12')], [5250, 5250]);
assert.equal(S6.tx.filter(t => t.folha && t.prev).length, 24, 'os outros descontos continuam previstos');
H.applySlipPlan(S6, H.buildSlipPlan(S6, [h2]), '2026-03-10'); assert.equal(H.loanInfo(S6, l6).ended, false, 'a rubrica voltou num contracheque mais novo: a dívida reabre'); assert.equal(l6.closed, undefined);
const before = S.tx.length; const sl = H.slipsOf(S, job.id)[0];
assert.equal(H.removeSlip(S, sl.id, '2026-06-10'), 4); assert.equal(S.tx.length, before - 4); assert.equal(S.slips.length, 5);
const A = M.clone(S), B = M.clone(S);
H.applySlipPlan(B, H.buildSlipPlan(B, [h1]), '2026-06-10');
const mg = M.merge(A, B); assert.equal(mg.slips.length, 6); assert.equal(mg.jobs.length, 1); assert.equal(mg.tx.filter(t => t.slipId === sl.id).length, 4, 'reimportado em outro aparelho depois da exclusão');
H.removeJob(S, job.id); assert.equal(S.jobs.length, 0); assert.equal(S.slips.length, 0); assert.equal(S.tx.filter(t => t.slipId || t.recId || t.folha).length, 0); assert.equal(S.loans.length, 0);

// ---------- investimentos ----------
const I = M.emptyState(); I.config.setupDone = true; I.groups = pl.groups; I.items = pl.items;
const cc = M.newAccount({ nature: 'debito', name: 'Conta', initial: 1000, initialDate: '2026-01-31' }), inv = M.newAccount({ nature: 'debito', name: 'Tesouro', initial: 5000, initialDate: '2026-01-31', inv: true });
assert.equal(inv.inv, true); assert.equal(cc.inv, undefined); I.accounts.push(cc, inv);
I.tx.push(M.newTx({ type: 'rec', date: '2026-02-05', accountId: cc.id, itemId: item('Salário'), amount: 3000 }));
I.tx.push(M.newTx({ type: 'trf', date: '2026-02-10', accountId: cc.id, toAccountId: inv.id, amount: 800 }));
I.tx.push(M.newTx({ type: 'trf', date: '2026-02-20', accountId: inv.id, toAccountId: cc.id, amount: 100 }));
I.tx.push(M.newYield({ date: '2026-02-28', accountId: inv.id, diff: 42.5, itemId: item('Rendimentos de aplicações') }));
assert.deepEqual(C.balances(I, '2026-02-28', true), { [cc.id]: 3300, [inv.id]: 5742.5 });
assert.deepEqual(C.monthSummary(I, '2026-02'), { rec: 3000, desp: 0, saldo: 3000, folha: 0 }, 'aporte e rendimento não são receita nem despesa');
assert.deepEqual(C.invFlow(I, '2026-02'), { aportes: 800, resgates: 100, net: 700 });
assert.deepEqual(C.invYield(I, inv.id, '2026-02-28'), { mes: 42.5, ano: 42.5 });
assert.equal(C.byCategory(I, '2026-02', 'receita').reduce((s, g) => s + g.total, 0), 3000);
const loss = M.newYield({ date: '2026-03-01', accountId: inv.id, diff: -10 }); assert.deepEqual([loss.type, loss.amount, loss.adj], ['deb', 10, true]);

// extrato: aplicação e resgate viram transferência para a conta de investimento (sem ela cadastrada, seguem como antes)
import { setRowInv } from '../js/imp/plan.js';
const xl = [{ date: '2026-03-02', desc: 'APLICACAO CDB', amount: 500, dir: 'out', role: 'normal' }, { date: '2026-03-10', desc: 'RESGATE TESOURO DIRETO', amount: 200, dir: 'in', role: 'normal' }, { date: '2026-03-11', desc: 'PADARIA', amount: 10, dir: 'out', role: 'normal' }];
const ipl = buildPlan(I, { kind: 'extrato', lines: xl }, { accountId: cc.id });
assert.deepEqual(ipl.rows.map(r => r.status), ['inv', 'inv', 'new']); assert.deepEqual(ipl.rows.map(r => r.tx.type), ['trf', 'trf', 'deb']);
assert.deepEqual([ipl.rows[1].tx.accountId, ipl.rows[1].tx.toAccountId], [inv.id, cc.id]);
const I2 = M.clone(I); applyPlan(I2, ipl);
assert.deepEqual(C.balances(I2, '2026-03-31', true), { [cc.id]: 3300 - 500 + 200 - 10, [inv.id]: 5742.5 + 500 - 200 });
assert.deepEqual(C.monthSummary(I2, '2026-03'), { rec: 0, desp: 10, saldo: -10, folha: 0 }); assert.deepEqual(C.invFlow(I2, '2026-03'), { aportes: 500, resgates: 200, net: 300 });
assert.equal(buildPlan(I2, { kind: 'extrato', lines: xl }, { accountId: cc.id }).rows.filter(r => r.status === 'already').length, 3, 'reimportar não duplica');
setRowInv(ipl, ipl.rows[0], ''); assert.deepEqual([ipl.rows[0].status, ipl.rows[0].tx.type, ipl.rows[0].tx.toAccountId], ['new', 'deb', undefined]);
const noInv = M.clone(I); noInv.accounts = noInv.accounts.filter(a => !a.inv);
assert.deepEqual(buildPlan(noInv, { kind: 'extrato', lines: xl }, { accountId: cc.id }).rows.map(r => r.status), ['new', 'new', 'new']);

// ---------- de onde vem o saldo ----------
I.tx.push(M.newTx({ type: 'deb', date: '2026-02-12', accountId: cc.id, itemId: item('Mercado'), amount: 250 }));
I.tx.push(M.newTx({ type: 'deb', date: '2026-02-25', accountId: cc.id, itemId: item('Energia'), amount: 120, status: 'pend' }));
I.tx.push(M.newTx({ type: 'deb', date: '2026-01-15', accountId: cc.id, itemId: item('Mercado'), amount: 999 })); // antes do saldo inicial: não conta
const bd = C.balanceBreakdown(I, cc.id, '2026-02-20');
assert.deepEqual([bd.initial, bd.initialDate, bd.now.rec, bd.now.deb, bd.now.trfIn, bd.now.trfOut, bd.now.total], [1000, '2026-01-31', 3000, 250, 100, 800, 3050]);
assert.equal(bd.now.total, C.balances(I, '2026-02-20', true)[cc.id]); assert.equal(bd.end.total, C.balances(I, '2026-02-31', false)[cc.id]);
assert.deepEqual([bd.pend.deb, bd.end.total], [120, 2930]);
const bi = C.balanceBreakdown(I, inv.id, '2026-02-28'); assert.deepEqual([bi.now.adj, bi.now.total], [42.5, 5742.5]);

// versão antiga do app não apaga coleções de uma versão mais nova ao juntar
const old = M.clone(I), neu = M.clone(I); neu.futuro = [{ id: 'x1', upd: 1 }]; assert.deepEqual(M.merge(old, neu).futuro, [{ id: 'x1', upd: 1 }]);
console.log('contracheque, investimentos e saldo tests OK');

// ---------- só um contracheque, e de um mês com eventuais: o piso desconta o imposto dos eventuais pela faixa ----------
{
  const P = M.emptyState(); P.config.setupDone = true; P.groups = pl.groups; P.items = pl.items; const cp = M.newAccount({ nature: 'debito', name: 'Conta Exemplo' }); P.accounts.push(cp);
  H.applySlipPlan(P, H.buildSlipPlan(P, [h2]), '2026-03-10');
  const jb = P.jobs[0], rl = P.rec.find(r => r.id === jb.recId), ns = H.slipsOf(P, jb.id).filter(x => x.tipo === 'normal');
  const novo = H.pisoOf(ns), velho = H.pisoOf(ns, { legacy: true });
  assert.equal(novo.exact, false); assert.equal(novo.estimated, true); assert(novo.piso > velho.piso, 'sem o imposto dos eventuais o piso sobe');
  assert(novo.piso <= 4850 + 0.01 && novo.piso >= 4850 - 150, `perto do líquido de um mês limpo (4.850): ${novo.piso}`);
  assert.equal(rl.amount, novo.piso); assert.equal(jb.piso, novo.piso);
  // quem importou na versão antiga tem a regra com o piso baixo: a manutenção corrige sozinha…
  M.editRec(P, rl, { amount: velho.piso }, '2026-04'); delete jb.piso;
  assert(H.maintain(P, '2026-03-10', true) > 0); H.maintain(P, '2026-03-10');
  assert.equal(rl.amount, novo.piso); assert.equal(P.tx.find(t => t.recId === rl.id && t.recM === '2026-05').amount, novo.piso); assert.equal(H.maintain(P, '2026-03-10', true), 0);
  // …mas não mexe se a pessoa escolheu outro valor
  M.editRec(P, rl, { amount: 5000 }, '2026-04'); assert.equal(H.maintain(P, '2026-03-10', true), 0); assert.equal(rl.amount, 5000);
  console.log('piso sem mês limpo e manutenção tests OK');
}
