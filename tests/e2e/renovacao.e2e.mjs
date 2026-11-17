/* Teste de navegador: ao abrir o app com o acesso ao Drive vencido, renova sozinho (sem toque) e sincroniza;
   se o Google pedir interação, não fica em loop e mostra "Reconectar". */
import assert from 'node:assert/strict';
import { createDrive, newDevice, setup, wait } from './harness.mjs';
const { chromium, devices } = await import(process.env.PLAYWRIGHT || 'playwright');
const BASE = process.env.BASE || 'http://localhost:8766/';
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const drive = createDrive();
const { page: p, errs } = await newDevice(browser, devices, BASE, drive, 'A');
await setup(p, {});
await wait(1500);
// outro aparelho mudou algo no Drive enquanto este estava fechado
const d = drive.current(); d.tx.push({ id: 'tOutro', type: 'deb', date: '2026-11-01', accountId: d.accounts[0].id, itemId: d.items[0].id, amount: 7, desc: 'Do outro aparelho', status: 'liq', upd: Date.now(), created: Date.now(), origin: 'manual' });
drive.data()[0].content = JSON.stringify(d); drive.data()[0].version++;
// acesso vencido (mais de 1 hora depois) e app aberto de novo
const expire = () => p.evaluate(() => { localStorage.setItem('fin.auth.token', JSON.stringify({ access: 'velho', exp: Date.now() - 1000 })); localStorage.removeItem('fin.auth.silent'); localStorage.removeItem('fin.auth.silentFail'); });
await expire(); await p.reload(); await p.waitForSelector('.tabs'); await wait(2500);
assert.deepEqual(drive.renewCalls, ['none'], 'renovou sozinho, sem pedir nada');
const st = await p.evaluate(async () => (await import('./js/sync.js')).state());
assert(st.tx.some(t => t.id === 'tOutro'), 'sincronizou sem tocar em nada');
assert.match(await p.textContent('#chip'), /Salvo no Drive/);
// Google pede interação: volta sem acesso, mostra Reconectar e não tenta de novo em seguida
drive.setRenew('fail'); await expire(); await p.reload(); await p.waitForSelector('.tabs'); await wait(1500);
assert.equal(drive.renewCalls.length, 2);
await p.reload(); await p.waitForSelector('.tabs'); await wait(1500);
assert.equal(drive.renewCalls.length, 2, 'sem loop');
assert.match(await p.textContent('#chip'), /Reconectar|Entrar|conectar/i);
console.log('erros:', errs.join('\n') || 'nenhum');
await browser.close(); console.log('E2E renovação OK');
