/* Teste de navegador: quem usa o cartão (portadores) e reembolso. Dados fictícios. */
import assert from 'node:assert/strict';
import { createDrive, newDevice, setup, wait } from './harness.mjs';
const pw = await import(process.env.PLAYWRIGHT || 'playwright');
const { chromium, devices } = pw;
const BASE = process.env.BASE || 'http://localhost:8766/';
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const drive = createDrive();
const { page: p, errs } = await newDevice(browser, devices, BASE, drive, 'A');
await setup(p);
await p.evaluate(async () => {
  const M = await import('./js/model.js'), sync = await import('./js/sync.js');
  await sync.commit(s => {
    const card = s.accounts.find(a => a.nature === 'credito'), it = n => s.items.find(i => i.name === n).id, d = M.todayISO();
    s.tx.push(M.newTx({ type: 'cred', date: d, accountId: card.id, itemId: it('Restaurantes / Delivery'), amount: 80, desc: 'RESTAURANTE EXEMPLO', cardRef: '4321' }),
      M.newTx({ type: 'cred', date: d, accountId: card.id, itemId: it('Mercado'), amount: 20, desc: 'MERCADO EXEMPLO', cardRef: '8765' }));
  });
});
await wait(300);
await p.click('[data-tab=contas]'); await p.locator('[data-card]').first().click(); await p.click('#fa-edit'); await p.waitForSelector('#a-holders');
assert.match(await p.textContent('#a-holders'), /finais sem cadastro: 4321, 8765|finais sem cadastro: 8765, 4321/);
await p.click('#a-holders'); await p.locator('[data-h="4321"]').click();
await p.fill('#h-name', 'Pessoa Exemplo'); await p.click('#h-reimb [data-r="1"]');
assert.match(await p.textContent('#h-hint'), /não entram nas suas despesas/);
await p.click('#h-ok'); await wait(1500);
let d = drive.current();
const card = d.accounts.find(a => a.nature === 'credito');
assert.deepEqual(card.holders.map(h => [h.ref, h.name, h.kind, h.reimb]), [['4321', 'Pessoa Exemplo', 'adicional', true]]);
const rb = d.tx.filter(t => t.reimb); assert.equal(rb.length, 1); assert.deepEqual([rb[0].type, rb[0].amount, rb[0].status], ['rec', 80, 'pend']);
await p.click('#h-close'); await p.click('#a-cancel');
await p.click('[data-tab=lanc]');
for (let i = 0; i < 2 && !(await p.locator('li[data-tx]', { hasText: 'RESTAURANTE EXEMPLO' }).count()); i++) { await p.click('.month [data-m="1"]'); await wait(200); }
const row = p.locator('li[data-tx]', { hasText: 'RESTAURANTE EXEMPLO' }).first(); await row.waitFor();
assert.match(await row.textContent(), /Pessoa Exemplo · devolve/);
await p.click('[data-tab=resumo]'); await wait(200); assert.match(await p.textContent('#page'), /Por quem usou o cartão/);
// lançamento à mão: escolhe quem usou
await p.click('[data-tab=lanc]'); await p.click('#fab'); await p.click('#seg [data-type=cred]'); await p.waitForSelector('#f-holder');
await p.fill('#f-val', '15,00'); await p.selectOption('#f-item', { label: 'Mercado' }); await p.selectOption('#f-holder', '4321'); await p.fill('#f-desc', 'PADARIA EXEMPLO'); await p.click('#f-save'); await wait(1500);
d = drive.current(); assert.equal(d.tx.find(t => t.desc === 'PADARIA EXEMPLO').cardRef, '4321');
console.log('reimb', JSON.stringify(d.tx.filter(t => t.reimb).map(t => [t.amount, t.status, t.reimb.split('|').pop()])), d.tx.find(t => t.desc === 'PADARIA EXEMPLO').date);
assert.equal(d.tx.filter(t => t.reimb && t.status === 'pend').reduce((a, t) => a + t.amount, 0), 95, 'o "a receber" acompanha as compras');
console.log('erros:', errs.join('\n') || 'nenhum'); assert.equal(errs.length, 0);
await browser.close(); console.log('E2E portador OK');
