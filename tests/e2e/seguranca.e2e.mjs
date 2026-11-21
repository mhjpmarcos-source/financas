/* Teste de navegador: cópias no Drive (diária, manual, restaurar), bloqueio com PIN e modo discreto. */
import assert from 'node:assert/strict';
import { createDrive, newDevice, setup, wait } from './harness.mjs';
const { chromium, devices } = await import(process.env.PLAYWRIGHT || 'playwright');
const BASE = process.env.BASE || 'http://localhost:8766/';
const SHOTS = process.env.SHOTS || '/tmp';
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const drive = createDrive();
const { page: p, ctx, errs } = await newDevice(browser, devices, BASE, drive, 'A');
await setup(p, {});
const st = () => p.evaluate(async () => (await import('./js/sync.js')).state());
const addTx = async (v, label = 'Mercado') => { await p.click('[data-tab=lanc]'); await p.click('#fab'); await p.fill('#f-val', String(v)); await p.selectOption('#f-item', { label }); await p.click('#f-save'); await wait(250); };
await addTx(10); await wait(1800);
// cópia diária criada na pasta de cópias
let bk = drive.backups(); assert.equal(bk.length, 1, 'cópia do dia'); assert.match(bk[0].name, /^financas-\d{4}-\d{2}-\d{2}\.json$/);
const bkFolder = Object.entries(drive.files).find(([, f]) => f.name === 'Cópias de segurança');
assert(bkFolder && bk[0].parents.includes(bkFolder[0]), 'na subpasta'); assert(bkFolder[1].parents.length === 1, 'subpasta dentro da pasta do app');
// mais lançamentos e uma cópia manual
await addTx(20); await addTx(30); await wait(1500);
await p.click('[data-tab=ajustes]'); await p.click('[data-act=bknow]'); await wait(500);
assert.equal(drive.backups().length, 2); assert.match(drive.backups()[1].name, /-manual\.json$/);
// restaurar a cópia do dia (só com o lançamento de 10)
await p.click('[data-act=bklist]'); await p.waitForSelector('[data-bk]');
await p.screenshot({ path: SHOTS + '/bk-list.png' });
const daily = Object.entries(drive.files).find(([, f]) => /^financas-\d{4}-\d{2}-\d{2}\.json$/.test(f.name))[0];
await p.click(`[data-bk="${daily}"]`); await wait(1800);
// a cópia do dia é feita na primeira sincronização: conforme o instante, tem o lançamento de 10 ou ainda nenhum; nunca os de 20 e 30
const inCopy = JSON.parse(drive.files[daily].content).tx.map(t => t.amount).sort((a, b) => a - b); assert(inCopy.length <= 1 && !inCopy.includes(20) && !inCopy.includes(30));
let s = await st(); assert.deepEqual(s.tx.map(t => t.amount).sort((a, b) => a - b), inCopy);
assert.equal(drive.current().tx.length, inCopy.length, 'Drive restaurado');
assert(drive.backups().some(f => /antes-de-restaurar/.test(f.name)), 'cópia antes de restaurar');
// segundo aparelho também fica com os dados restaurados
const B = await newDevice(browser, devices, BASE, drive, 'B'); await B.page.click('#login'); await B.page.waitForSelector('.tabs', { timeout: 15000 }); await wait(1500);
assert.equal((await B.page.evaluate(async () => (await import('./js/sync.js')).state())).tx.length, inCopy.length);
// modo discreto
await p.click('[data-tab=ajustes]'); await p.click('#eye'); assert(await p.evaluate(() => document.body.classList.contains('discreet')));
await p.click('[data-tab=resumo]'); await p.screenshot({ path: SHOTS + '/discreto.png' }); await p.click('#eye');
// bloqueio
await p.click('[data-tab=ajustes]'); await p.click('[data-act=pin]'); await p.fill('#pn-1', '1234'); await p.fill('#pn-2', '1234'); await p.selectOption('#pn-after', '0'); await p.click('#pn-ok'); await wait(800);
await p.reload(); await p.waitForSelector('#lock .pad');
assert.equal(await p.isVisible('.tabs'), false, 'conteúdo escondido');
await p.screenshot({ path: SHOTS + '/lock.png' });
for (const k of '9999') await p.click(`#lock [data-k="${k}"]`); await wait(900);
assert.match(await p.textContent('#lk-msg'), /errado/);
for (const k of '1234') await p.click(`#lock [data-k="${k}"]`); await wait(900);
assert.equal(await p.locator('#lock').count(), 0, 'desbloqueado'); assert(await p.isVisible('.tabs'));
// ao sair do app (aba escondida) bloqueia de novo
await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
await p.waitForSelector('#lock .pad');
// desligar exige o PIN
await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); });
for (const k of '1234') await p.click(`#lock [data-k="${k}"]`); await wait(900);
await p.click('[data-tab=ajustes]'); await p.click('[data-act=lockoff]'); await p.fill('#ap', '1234'); await p.click('#ap-ok'); await wait(800);
await p.reload(); await p.waitForSelector('.tabs'); assert.equal(await p.locator('#lock').count(), 0);
const real = errs.filter(e => !/Content Security Policy.*(frame-ancestors|report)/.test(e));
console.log('erros:', real.join('\n') || 'nenhum'); assert.equal(real.length, 0);
await browser.close(); console.log('E2E segurança OK');
