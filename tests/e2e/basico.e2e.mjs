/* Teste de navegador dos fluxos básicos: primeiro acesso, lançamentos, parcelas, dois aparelhos, sem internet.
   Uso igual ao de importacao.e2e.mjs. */
import assert from 'node:assert/strict';
import { createDrive, newDevice, setup, wait } from './harness.mjs';
const { chromium, devices } = await import(process.env.PLAYWRIGHT || 'playwright');
const BASE = process.env.BASE || 'http://localhost:8766/';
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const drive = createDrive();
const A = await newDevice(browser, devices, BASE, drive, 'A'); const p = A.page;
await setup(p, { cpf: '123.456.789-00' });
await wait(1200);
let d = drive.current(); assert(d, 'arquivo criado no Drive'); assert.equal(d.profile.cpf6, '123456'); assert(!JSON.stringify(d).includes('78900'), 'CPF inteiro não é guardado');
assert(d.items.some(i => i.name === 'Padaria'));
// despesa e compra parcelada
await p.click('#fab'); await p.fill('#f-val', '45,90'); await p.selectOption('#f-item', { label: 'Padaria' }); await p.click('#f-save'); await wait(300);
await p.click('#fab'); await p.click('[data-type=cred]'); await p.fill('#f-val', '600'); await p.fill('#f-date', '2026-11-28'); await p.selectOption('#f-item', { label: 'Compras diversas' }); await p.selectOption('#f-freq', 'parc'); await p.selectOption('#f-n', '6'); await p.click('#f-save'); await wait(1500);
d = drive.current(); assert.equal(d.tx.length, 7);
// segundo aparelho vê os dados; alteração offline em A e simultânea em B se juntam
const B = await newDevice(browser, devices, BASE, drive, 'B'); const q = B.page;
await q.click('#login'); await q.waitForSelector('.tabs'); await wait(500);
await A.ctx.setOffline(true);
await p.click('[data-tab=lanc]'); await p.click('#fab'); await p.click('[data-type=rec]'); await p.fill('#f-val', '5000'); await p.selectOption('#f-item', { label: 'Salário' }); await p.click('#f-save'); await wait(500);
assert.match(await p.textContent('#chip'), /Sem internet/);
await q.click('#fab'); await q.fill('#f-val', '10'); await q.selectOption('#f-item', { label: 'Mercado' }); await q.click('#f-save'); await wait(1500);
await A.ctx.setOffline(false); await p.evaluate(() => dispatchEvent(new Event('online'))); await wait(2500);
assert.equal(drive.current().tx.length, 9, 'junção dos dois aparelhos');
// reabre sem internet
await A.ctx.setOffline(true); await p.reload(); await p.waitForSelector('.tabs', { timeout: 8000 }); await A.ctx.setOffline(false);
// acesso vencido → Reconectar
await p.evaluate(() => localStorage.removeItem('fin.auth.token')); await p.reload(); await p.waitForSelector('.tabs'); await wait(800);
assert.match(await p.textContent('#chip'), /Reconectar/); await p.click('#chip'); await wait(1200); assert.match(await p.textContent('#chip'), /Salvo no Drive/);
assert.equal(drive.data().length, 1, 'um só arquivo de dados');
console.log('erros:', [...A.errs, ...B.errs].join('\n') || 'nenhum');
await browser.close(); console.log('E2E básico OK');
