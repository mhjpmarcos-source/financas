/* Teste de navegador: fatura que o cartão não gerou (mudança de vencimento). Dados fictícios. */
import assert from 'node:assert/strict';
import { createDrive, newDevice, setup, wait } from './harness.mjs';
const pw = await import(process.env.PLAYWRIGHT || 'playwright');
const { chromium, devices } = pw;
const BASE = process.env.BASE || 'http://localhost:8766/';
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const drive = createDrive();
const { page: p, errs } = await newDevice(browser, devices, BASE, drive, 'A');
await setup(p);
const comps = await p.evaluate(async () => {
  const M = await import('./js/model.js'), C = await import('./js/calc.js'), sync = await import('./js/sync.js');
  let out;
  await sync.commit(s => {
    const card = s.accounts.find(a => a.nature === 'credito'), cm = M.todayISO().slice(0, 7), c0 = C.mAdd(cm, -1);
    const p1 = M.newTx({ type: 'cred', date: c0 + '-02', accountId: card.id, itemId: s.items[0].id, amount: 100, desc: 'LOJA EXEMPLO (1/3)', signed: true });
    Object.assign(p1, { comp: c0, parcKey: 'pk', parcI: 1, parcN: 3, origin: 'import' }); s.tx.push(p1); M.projectParcels(s, p1, 'pk', 1, 3, 'LOJA EXEMPLO');
    out = { card: card.id, skip: C.mAdd(c0, 1) };
  });
  return out;
});
await wait(300);
await p.click('[data-tab=contas]'); await wait(200);
await p.locator('[data-card]').first().click(); await wait(300);
for (let i = 0; i < 3; i++) { await p.click('#sheet [data-c="-1"]'); await wait(150); }
// abre a fatura com só a parcela prevista
for (let i = 0; i < 3 && !(await p.locator('#fa-skip').count()); i++) { await p.click('#sheet [data-c="1"]'); await wait(200); }
assert.equal(await p.locator('#fa-skip').count(), 1, 'fatura só com previstas oferece "não existiu"');
await p.click('#fa-skip'); await wait(1500);
const d = drive.current();
assert.equal(d.faturaMeta[comps.card + '|' + comps.skip].skip, true);
assert.deepEqual(d.tx.filter(t => t.parcKey === 'pk').sort((a, b) => a.parcI - b.parcI).map(t => t.comp).slice(1).every(c => c > comps.skip), true);
console.log('erros:', errs.join('\n') || 'nenhum'); assert.equal(errs.length, 0);
await browser.close(); console.log('E2E pular fatura OK');
