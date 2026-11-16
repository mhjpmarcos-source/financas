/* Teste de navegador da Agenda e das dívidas com terceiros. Uso igual ao de importacao.e2e.mjs. */
import assert from 'node:assert/strict';
import { createDrive, newDevice, setup, wait } from './harness.mjs';
const { chromium, devices } = await import(process.env.PLAYWRIGHT || 'playwright');
const BASE = process.env.BASE || 'http://localhost:8766/';
const SHOTS = process.env.SHOTS || '/tmp';
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const drive = createDrive();
const { page: p, errs } = await newDevice(browser, devices, BASE, drive, 'A');
await setup(p, {});
const today = await p.evaluate(async () => (await import('./js/model.js')).todayISO());
const addDays = (d, n) => new Date(Date.parse(d + 'T12:00') + n * 864e5).toISOString().slice(0, 10);
// alguém me deve: 3 parcelas, primeira vencida há 5 dias, com registro da saída
await p.click('[data-tab=agenda]'); await p.click('#agseg [data-v=loans]'); await p.click('[data-newloan=in]');
await p.fill('#l-person', 'Pessoa Fictícia'); await p.fill('#l-desc', 'Conserto do carro'); await p.fill('#l-total', '900'); await p.fill('#l-n', '3'); await p.fill('#l-first', addDays(today, -5));
await p.check('#l-start'); console.log('prévia:', await p.textContent('#l-prev')); await p.screenshot({ path: SHOTS + '/ag-form.png' });
await p.click('#l-save'); await wait(600);
// eu devo: 2 parcelas
await p.click('[data-newloan=out]'); await p.fill('#l-person', 'Outra Pessoa'); await p.fill('#l-total', '400'); await p.fill('#l-n', '2'); await p.fill('#l-first', addDays(today, 10)); await p.click('#l-save'); await wait(600);
await p.screenshot({ path: SHOTS + '/ag-loans.png' });
// receita recorrente: 3 meses, futuras pendentes
await p.click('[data-tab=lanc]'); await p.click('#fab'); await p.click('[data-type=rec]'); await p.fill('#f-val', '2500'); await p.fill('#f-date', today); await p.selectOption('#f-item', { label: 'Salário' }); await p.check('#f-rep'); await p.fill('#f-n', '3'); await p.click('#f-save'); await wait(500);
let st = await p.evaluate(async () => (await import('./js/sync.js')).state());
assert.deepEqual(st.tx.filter(t => t.amount === 2500).map(t => t.status), ['liq', 'pend', 'pend']);
// agenda
await p.click('[data-tab=agenda]'); await p.click('#agseg [data-v=pend]'); await wait(200);
const late = await p.locator('.card.late li').count(); assert.equal(late, 1, 'uma parcela atrasada');
await p.screenshot({ path: SHOTS + '/ag-pend.png', fullPage: true });
await p.click('.card.late .okbtn'); await p.waitForSelector('.sheet.ask'); await p.click('.sheet.ask [data-v="0"]'); await wait(500);
st = await p.evaluate(async () => (await import('./js/sync.js')).state());
const loan = st.loans.find(l => l.dir === 'in'); const M = await p.evaluate(async id => { const m = await import('./js/model.js'); const s = (await import('./js/sync.js')).state(); return m.loanStatus(s, s.loans.find(l => l.id === id)); }, loan.id);
assert.equal(M.paid, 300); assert.equal(M.rest, 600); assert.equal(M.parcels[0].date, today, 'recebido hoje');
// saldo: saiu 900, voltou 300 → 100 inicial - 600 + 2500 do salário de hoje
const bal = await p.evaluate(async () => { const c = await import('./js/calc.js'); const s = (await import('./js/sync.js')).state(); return Object.values(c.balances(s, (await import('./js/model.js')).todayISO(), true))[0]; });
assert.equal(bal, 2000);
// ficha da dívida
await p.click('#agseg [data-v=loans]'); await p.click('[data-loan] >> nth=0'); await wait(200); await p.screenshot({ path: SHOTS + '/ag-loan.png' });
await p.click('#lo-del'); await p.click('.sheet.ask [data-v="0"]'); await wait(500);
st = await p.evaluate(async () => (await import('./js/sync.js')).state());
assert.equal(st.loans.length, 1); assert.equal(st.tx.filter(t => t.loanId === loan.id).length, 2, 'ficam a saída e a parcela recebida');
await wait(1500); assert.equal(drive.current().loans.length, 1, 'Drive em dia');
console.log('erros:', errs.join('\n') || 'nenhum'); await browser.close(); console.log('E2E agenda OK');
