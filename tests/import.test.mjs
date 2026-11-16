/* Testes da importação com documentos FICTÍCIOS (gerados por fixtures/gerar.py).
   Uso: python3 fixtures/gerar.py && node import.test.mjs */
import assert from 'node:assert/strict';
import fs from 'node:fs';
const pdfjs = await import(process.env.PDFJS || 'pdfjs-dist/legacy/build/pdf.mjs');
import { openPdf, pdfLines } from '../js/imp/pdftext.js';
import * as P from '../js/imp/parse.js';
import { buildPlan, applyPlan, propagate } from '../js/imp/plan.js';
import { merchantKey } from '../js/imp/classify.js';
import * as M from '../js/model.js';
import * as C from '../js/calc.js';
const fx = f => new Uint8Array(fs.readFileSync(new URL('./fixtures/' + f, import.meta.url)));
const pdf = async (f, opt) => P.parsePdfPages(await pdfLines(await openPdf(pdfjs, fx(f), opt)));

// fatura
const f = await pdf('fatura-ficticia.pdf');
assert.equal(f.kind, 'fatura'); assert.equal(f.due, '2026-03-10'); assert.equal(f.comp, '2026-03');
assert.equal(f.lines.length, 6, 'saldo anterior e pagamento ficam de fora');
assert.equal(f.check.ok, true, f.check.msg);
const parc = f.lines.find(l => l.parc); assert.deepEqual(parc.parc, { i: 2, n: 10 }); assert.equal(parc.desc, 'LOJA DE MOVEIS');
assert.equal(f.lines.find(l => /ESTORNO/.test(l.desc)).dir, 'in');
assert.equal(f.lines[0].cardRef, '9999'); assert.equal(f.lines[0].date, '2026-02-03');

// senha: tenta os dígitos do CPF; depois pergunta
const g = await pdf('fatura-ficticia-senha.pdf', { tryPasswords: ['1234'] }); assert.equal(g.lines.length, 6);
let asked = 0;
const h = await pdf('fatura-ficticia-senha.pdf', { tryPasswords: ['9999'], ask: async wrong => { asked++; assert.equal(wrong, true); return '1234'; } }); assert.equal(asked, 1); assert.equal(h.lines.length, 6);
await assert.rejects(pdf('fatura-ficticia-senha.pdf', { ask: async () => null }), /senha/);

// extrato CSV em Latin-1
const x = P.parseCsv(fx('extrato-ficticio.csv'));
assert.equal(x.check.ok, true, x.check.msg);
assert.deepEqual(x.lines.map(l => l.role), ['normal', 'normal', 'normal', 'ignore', 'cardpay', 'normal']);
assert.equal(x.lines[1].date, '2026-03-02', 'compra no débito usa a data real'); assert.equal(x.lines[1].desc, 'PADARIA PAO QUENTE');

// plano: classificação, duplicata manual, reimportação, pagamento de fatura
const S = M.emptyState(); S.config.setupDone = true; const pl = M.defaultPlan(); S.groups = pl.groups; S.items = pl.items;
const conta = M.newAccount({ nature: 'debito', name: 'Conta Exemplo' }), cartao = M.newAccount({ nature: 'credito', name: 'Cartão Exemplo', closeDay: 25, dueDay: 10, payAccount: conta.id });
S.accounts.push(conta, cartao);
const item = n => S.items.find(i => i.name === n).id;
S.tx.push(M.newTx({ type: 'cred', date: '2026-02-12', accountId: cartao.id, itemId: item('Assinaturas / Streaming'), amount: 39.9, desc: 'Netflix' }));
let plan = buildPlan(S, f, { accountId: cartao.id, comp: f.comp });
const st = k => plan.rows.filter(r => r.status === k).length;
assert.equal(st('dup'), 1); assert.equal(st('new'), 5);
assert.equal(plan.rows.find(r => /PADARIA/.test(r.line.desc)).itemId, item('Padaria'));
assert.equal(plan.rows.find(r => /POSTO/.test(r.line.desc)).itemId, item('Combustível'));
const moveis = plan.rows.find(r => /MOVEIS/.test(r.line.desc)); propagate(plan, moveis, item('Manutenção da casa'));
let res = applyPlan(S, plan); assert.equal(res.created, 5);
assert.equal(C.faturaOf(S, cartao.id, '2026-03').total, 1077.4, 'fatura igual à impressa');
assert(S.tx.some(t => t.amount === -20), 'estorno negativo');
plan = buildPlan(S, f, { accountId: cartao.id, comp: f.comp }); assert.equal(plan.rows.filter(r => r.status === 'already').length, 5);
// regra aprendida vale na próxima vez
assert.equal(S.rules['out:' + merchantKey('LOJA DE MOVEIS')].itemId, item('Manutenção da casa'));
plan = buildPlan(S, x, { accountId: conta.id });
const pay = plan.rows.find(r => r.status === 'cardpay'); assert(pay.fatura && pay.fatura.exact, 'achou a fatura paga');
assert.equal(plan.rows.find(r => /PROVENTOS|EMPRESA/.test(r.line.desc)).itemId, item('Salário'));
pay.include = true; res = applyPlan(S, plan); assert.equal(res.paid, 1); assert.equal(C.faturaOf(S, cartao.id, '2026-03').status, 'liq');
// CSV de cartão (valores positivos = compras)
const csvCard = new TextEncoder().encode('date,title,amount\n2026-02-03,Padaria Pao Quente,18.50\n2026-02-05,Pagamento recebido,-500.00\n2026-02-07,Uber *Trip,22.10\n');
const cc = P.asFatura(P.parseCsv(csvCard)); assert.deepEqual(cc.lines.map(l => l.role + ':' + l.dir), ['normal:out', 'ignore:in', 'normal:out']);
// OFX
const ofx = new TextEncoder().encode('OFXHEADER:100\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST><STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260305<TRNAMT>-45.90<FITID>A1<MEMO>COMPRA FARMACIA</STMTTRN><STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260306<TRNAMT>100.00<FITID>A2<MEMO>PIX RECEBIDO</STMTTRN></BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>');
const o = P.parseOfx(ofx); assert.equal(o.lines.length, 2); assert.equal(o.lines[0].dir, 'out'); assert.equal(o.lines[0].doc, 'A1');
// Padaria chega para quem já usa o app (sem duplicar)
const old = M.emptyState(); old.config.setupDone = true; old.config.planV = 1; const op = M.defaultPlan(); old.groups = op.groups; old.items = op.items.filter(i => i.name !== 'Padaria');
M.migrate(old); assert.equal(old.items.filter(i => i.name === 'Padaria').length, 1); M.migrate(old); assert.equal(old.items.filter(i => i.name === 'Padaria').length, 1);
console.log('import tests OK');
