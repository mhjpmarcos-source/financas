/* Teste de navegador: reservas e botão ± (valor negativo sem tecla de menos). */
import assert from 'node:assert/strict';
import { createDrive, newDevice, setup, wait } from './harness.mjs';
const { chromium, devices } = await import(process.env.PLAYWRIGHT || 'playwright');
const BASE = process.env.BASE || 'http://localhost:8766/';
const SHOTS = process.env.SHOTS || '/tmp';
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const drive = createDrive();
const { page: p, errs } = await newDevice(browser, devices, BASE, drive, 'A');
await setup(p, {});
const st = () => p.evaluate(async () => (await import('./js/sync.js')).state());
// ± no saldo inicial de uma conta nova
await p.click('[data-tab=contas]'); await p.click('[data-new=debito]');
await p.fill('#a-name', 'Conta B'); await p.type('#a-ini', '15050'); await p.click('[data-pm]');
assert.equal(await p.inputValue('#a-ini'), '-150,50'); await p.type('#a-ini', '1'); assert.equal(await p.inputValue('#a-ini'), '-1.505,01', 'sinal continua ao digitar');
await p.click('[data-pm]'); await p.click('[data-pm]'); await p.click('#a-save'); await wait(300);
assert.equal((await st()).accounts.find(a => a.name === 'Conta B').initial, -1505.01);
// ± no lançamento só aparece em compra no cartão (estorno)
await p.click('[data-tab=lanc]'); await p.click('#fab'); assert.equal(await p.locator('#f-val ~ [data-pm]').count(), 0); await p.click('#f-cancel'); await wait(200);
// reserva
await p.click('[data-tab=contas]'); await p.click('#res-new');
await p.fill('#rs-name', 'Emergência'); await p.type('#rs-target', '120000'); await p.type('#rs-ini', '20000');
const dl = new Date(); dl.setMonth(dl.getMonth() + 5); await p.fill('#rs-dl', dl.toISOString().slice(0, 10));
await p.click('#rs-save'); await wait(300);
let s = await st(); assert.equal(s.res.length, 1); assert.equal(s.res[0].target, 1200); assert.equal(s.res[0].movs[0].v, 200);
await p.click('[data-res]'); await p.click('#rs-in'); await p.fill('#rm-v', ''); await p.type('#rm-v', '5000'); await p.click('#rm-ok'); await wait(300);
await p.click('#rs-out'); await p.fill('#rm-v', '9999'); await p.click('#rm-ok'); await wait(200);
assert.match(await p.textContent('#toast'), /só tem/);
await p.fill('#rm-v', '30'); await p.fill('#rm-n', 'conserto'); await p.click('#rm-ok'); await wait(300);
s = await st(); assert.equal(s.res[0].movs.reduce((a, m) => a + m.v, 0), 220);
await p.screenshot({ path: SHOTS + '/res-sheet.png', fullPage: true });
await p.click('#rs-close'); await wait(200);
assert.match(await p.textContent('#page'), /Livre nas contas/);
await p.screenshot({ path: SHOTS + '/res-contas.png', fullPage: true });
await wait(1500); assert.equal(drive.current().res.length, 1, 'reserva no Drive');
console.log('erros:', errs.join('\n') || 'nenhum'); await browser.close(); console.log('E2E reservas OK');
