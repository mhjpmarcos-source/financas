/* Teste de navegador: contracheque (fictício), consignado em folha com correção da parcela, investimentos e
   detalhamento do saldo. Uso: como os outros (ver importacao.e2e.mjs), depois de python3 fixtures/gerar.py */
import assert from 'node:assert/strict';
import { createDrive, newDevice, setup, wait } from './harness.mjs';
const pw = await import(process.env.PLAYWRIGHT || 'playwright');
const { chromium, devices } = pw;
const BASE = process.env.BASE || 'http://localhost:8766/';
const FX = new URL('../fixtures/', import.meta.url).pathname;
const shot = n => (process.env.SHOTS || '/tmp') + '/' + n + '.png';
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const drive = createDrive();
const { page: p, errs } = await newDevice(browser, devices, BASE, drive, 'A');
await setup(p);
const pick = async files => { const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('#imp')]); await fc.setFiles(files); await p.waitForSelector('#sl-go', { timeout: 20000 }); };

// ---------- primeiro contracheque ----------
await pick(FX + 'contracheque-ficticio-01.pdf');
assert.match(await p.textContent('.okbox'), /confere/);
assert.match(await p.textContent('#sheet'), /Empresa Ficticia de Exemplo Ltda/);
assert.notEqual(await p.inputValue('[data-bank]'), '', 'conta sugerida pelo nome do banco');
assert.match(await p.textContent('#sheet'), /Piso previsto: R\$\s4\.850,00/);
// consignado: o app leu 5 de 24; corrigindo para 6 de 24 na revisão
assert.deepEqual([await p.inputValue('[data-pi]'), await p.inputValue('[data-pn]')], ['5', '24']);
await p.fill('[data-pi]', '6'); await p.dispatchEvent('[data-pi]', 'change'); await wait(200);
assert.match(await p.textContent('.rgrid.parc'), /corrigida por você/);
// trocar uma rubrica de fixa para eventual tira ela do piso; voltar recoloca
const grat = p.locator('li.irow', { hasText: 'Gratificação de Função' }).locator('[data-kind]');
await grat.selectOption('ev'); await wait(200); assert.match(await p.textContent('#sheet'), /Piso previsto: R\$\s3\.850,00/);
await p.click('details[data-g=ev] summary'); await p.locator('li.irow', { hasText: 'Gratificação de Função' }).locator('[data-kind]').selectOption('fix'); await wait(200);
assert.match(await p.textContent('#sheet'), /Piso previsto: R\$\s4\.850,00/);
await p.screenshot({ path: shot('cc-revisao'), fullPage: false });
await p.click('#sl-go'); await wait(1500);
let d = drive.current();
assert.equal(d.jobs.length, 1); assert.equal(d.slips.length, 1);
const sal = d.tx.find(t => t.slipId && t.type === 'rec'); assert.deepEqual([sal.amount, sal.date, sal.status], [4850, '2026-02-05', 'liq']);
assert.equal(d.tx.filter(t => t.folha).length, 3); assert.equal(d.tx.find(t => t.folha && /Empr/.test(t.desc)).desc, 'Empréstimo Banco Exemplo 1 (6/24)');
assert.deepEqual(Object.values(d.jobs[0].parc)[0], { i: 6, n: 24, asOf: '2026-01' });
assert.equal(d.rec.length, 1); assert.equal(d.rec[0].amount, 4850);
assert.equal(await p.textContent('.month b'), 'Fevereiro de 2026');
const kp = await p.$$eval('.kpi b', l => l.map(x => x.textContent.replace(/\s/g, ' ')));
assert.deepEqual(kp, ['R$ 5.500,00', 'R$ 650,00', 'R$ 4.850,00'], 'líquido + descontos em folha na receita; descontos na despesa; resultado = líquido');
assert.match(await p.textContent('#page'), /descontados em folha/); assert.match(await p.textContent('#page'), /em folha/);
await p.screenshot({ path: shot('cc-lancamentos') });
// o desconto em folha não mexe no saldo
const bal = await p.evaluate(async () => { const c = await import('./js/calc.js'); const s = (await import('./js/sync.js')).state(); const a = s.accounts.find(x => x.nature === 'debito'); a.initialDate = '2025-12-31'; return c.balances(s, '2026-02-28', true)[a.id] - a.initial; });
assert.equal(bal, 4850);

// ---------- fonte de renda: consignado e correção manual da parcela ----------
await p.click('[data-tab=agenda]'); await p.click('#agseg [data-v=fix]');
assert.match(await p.textContent('#page'), /Renda do emprego/);
await p.click('[data-job]'); await p.waitForSelector('[data-lp]');
assert.match(await p.textContent('[data-lp]'), /parcela 6 de 24 · faltam 18 · termina em jul\/27 · corrigida por você/);
await p.screenshot({ path: shot('cc-renda') });
await p.click('[data-lp]'); await p.waitForSelector('#lp-save');
await p.fill('#lp-i', '7'); await p.fill('#lp-n', '30'); assert.match(await p.textContent('#lp-prev'), /Faltam 23/);
await p.click('#lp-save'); await p.waitForSelector('[data-lp]'); await wait(1300);
assert.match(await p.textContent('[data-lp]'), /parcela 7 de 30/);
d = drive.current(); assert.equal(d.tx.find(t => t.folha && /Empr/.test(t.desc)).desc, 'Empréstimo Banco Exemplo 1 (7/30)');
await p.click('[data-slip]'); await p.waitForSelector('#sd-back'); assert.match(await p.textContent('#sheet'), /Empréstimo Banco Exemplo 1 \(7\/30\)/); assert.match(await p.textContent('#sheet'), /despesa em Parcela de empréstimo/);
await p.click('#sd-back'); await p.click('#jb-close');

// ---------- dois de uma vez: eventual não muda o piso; reajuste muda ----------
await p.click('[data-tab=lanc]');
await pick([FX + 'contracheque-ficticio-02.pdf', FX + 'contracheque-ficticio-03.pdf']);
assert.match(await p.textContent('#sheet'), /2 contracheques, de fev\/26 a mar\/26/); assert.match(await p.textContent('.okbox'), /Todos conferem/);
assert.match(await p.textContent('#sheet'), /O que mudou no fixo desde fev\/26/); assert.match(await p.textContent('#sheet'), /Seguro de Vida/);
assert.match(await p.textContent('#sheet'), /Piso previsto: R\$\s4\.965,00/);
assert.equal(await p.inputValue('[data-pi]'), '9', 'a correção (7 em jan) segue contando: 9 em março');
await p.screenshot({ path: shot('cc-revisao-2') });
await p.click('#sl-go'); await wait(1500);
d = drive.current(); assert.equal(d.slips.length, 3); assert.equal(d.rec[0].amount, 4965);
assert.equal(d.tx.filter(t => t.type === 'rec' && !t.prev && t.slipId).length, 3); assert.equal(d.tx.filter(t => t.type === 'rec' && t.date.startsWith('2026-03')).length, 1, 'o previsto de março virou o real');
// reimportar: já importado, nada duplica
await pick(FX + 'contracheque-ficticio-02.pdf'); assert.match(await p.textContent('#sheet'), /já importado/);
const nTx = d.tx.length; await p.click('#sl-go'); await wait(1500); assert.equal(drive.current().tx.length, nTx);

// ---------- investimentos ----------
await p.click('[data-tab=contas]'); await p.click('[data-new=inv]'); await p.waitForSelector('#a-save');
assert.equal(await p.isChecked('#a-inv'), true);
await p.fill('#a-name', 'Tesouro'); await p.fill('#a-ini', '5000,00'); await p.click('#a-save'); await wait(600);
const saldo0 = await p.textContent('#page .card .num');
await p.click('[data-tab=lanc]'); await p.click('#fab'); await p.click('[data-type=trf]'); await p.fill('#f-val', '800,00'); await p.fill('#f-date', await p.evaluate(async () => (await import('./js/model.js')).todayISO()));
await p.selectOption('#f-acc', { label: 'Conta Exemplo' }); await p.selectOption('#f-to', { label: 'Tesouro' }); await p.click('#f-save'); await wait(600);
await p.click('[data-tab=contas]');
assert.match(await p.textContent('#inv-card'), /R\$\s5\.800,00/);
assert.notEqual(await p.textContent('#page .card .num'), saldo0, 'a transferência saiu do Saldo hoje');
await p.click('#inv-card [data-acc]'); await p.waitForSelector('#a-yield');
assert.match(await p.textContent('#a-calc'), /Aportes \(transferências recebidas\)/);
await p.click('#a-yield'); await p.waitForSelector('#y-save'); await p.fill('#y-val', '5850,00'); assert.match(await p.textContent('#y-prev'), /Rendimento de R\$\s50,00/);
await p.click('#y-save'); await wait(600);
assert.match(await p.textContent('#inv-card'), /R\$\s5\.850,00/); assert.match(await p.textContent('#inv-card'), /Rendimento registrado: R\$\s50,00 no mês/);
await wait(1500); d = drive.current(); const adj = d.tx.find(t => t.adj); assert.deepEqual([adj.type, adj.amount], ['rec', 50]);
await p.screenshot({ path: shot('cc-contas') });
// extrato com aplicação e resgate: viram transferências para a conta de investimento
await p.click('[data-tab=lanc]');
{ const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('#imp')]); await fc.setFiles(FX + 'extrato-ficticio-invest.csv'); await p.waitForSelector('#r-go'); }
assert.equal(await p.locator('li.irow.inv').count(), 2); assert.match(await p.textContent('li.irow.inv'), /Aplicação: transferência/);
assert.match(await p.textContent('#r-go'), /Importar 3/);
await p.screenshot({ path: shot('cc-extrato-invest') });
await p.click('#r-go'); await wait(1500);
d = drive.current(); assert.equal(d.tx.filter(t => t.type === 'trf' && t.origin === 'import').length, 2); assert.equal(d.tx.filter(t => t.type === 'deb' && t.origin === 'import' && !t.folha).length, 1);
await p.click('[data-tab=contas]');
// de onde vem o saldo
await p.click('#page .card [data-acc]'); await p.waitForSelector('#a-calc');
const calc = await p.textContent('#a-calc');
assert.match(calc, /Saldo inicial/); assert.match(calc, /Transferências enviadas/); assert.match(calc, /= Saldo hoje/); assert.match(calc, /= No fim do mês, com pendentes/);
await p.screenshot({ path: shot('cc-saldo') });
await p.click('#a-cancel');
// resumo: aporte aparece como investido, não como despesa; rendimento não é receita
await p.click('[data-tab=resumo]');
assert.match(await p.textContent('#rs-inv'), /Investido no mês: R\$\s300,00 \(aportes R\$\s500,00 − resgates R\$\s200,00\)/); // março, mês do extrato importado
const flow = await p.evaluate(async () => { const c = await import('./js/calc.js'); const s = (await import('./js/sync.js')).state(); return c.invFlow(s, new Date().toISOString().slice(0, 7)).net; }); assert.equal(flow, 800);
const sum = await p.evaluate(async () => { const c = await import('./js/calc.js'); const s = (await import('./js/sync.js')).state(); const m = new Date().toISOString().slice(0, 7); return c.monthSummary(s, m).desp; });
assert.equal(sum, 0);
assert.equal(JSON.stringify(drive.current()).includes('00.000.000'), false, 'CNPJ do contracheque não é guardado');
console.log('erros:', errs.join('\n') || 'nenhum'); assert.equal(errs.length, 0);
await browser.close(); console.log('E2E contracheque OK');
