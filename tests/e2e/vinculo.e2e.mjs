/* Teste de navegador: vincular a linha do boleto no extrato a uma conta fixa cadastrada e aceitar o novo valor previsto.
   Uso: como os outros (ver importacao.e2e.mjs), depois de python3 fixtures/gerar.py */
import assert from 'node:assert/strict';
import { createDrive, newDevice, setup, wait } from './harness.mjs';
const pw = await import(process.env.PLAYWRIGHT || 'playwright');
const { chromium, devices } = pw;
const BASE = process.env.BASE || 'http://localhost:8766/';
const FX = new URL('../fixtures/', import.meta.url).pathname;
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const drive = createDrive();
const { page: p, errs } = await newDevice(browser, devices, BASE, drive, 'A');
await setup(p, { card: false });
// conta fixa "Aluguel do 5º andar" de R$ 2.000 no dia 10, desde março de 2026 (cadastrada direto no estado, como o formulário faria)
await p.evaluate(async () => {
  const M = await import('./js/model.js'), sync = await import('./js/sync.js');
  await sync.commit(s => { const acc = s.accounts.find(a => a.nature === 'debito'), it = s.items.find(i => i.name === 'Aluguel / Financiamento');
    const r = M.newRec({ kind: 'fixa', type: 'deb', desc: 'Aluguel do 5º andar', itemId: it.id, accountId: acc.id, amount: 2000, day: 10, start: '2026-03' });
    s.rec.push(r); M.recFirst(s, r, { date: '2026-03-10', amount: 2000, status: 'pend' }); M.ensureRecurring(s); });
});
await wait(300);
const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('#imp')]);
await fc.setFiles(FX + 'extrato-ficticio-boletos.csv'); await p.waitForSelector('#r-go');
const row = p.locator('li.irow', { hasText: 'IMOBILIARIA EXEMPLO' });
assert.match(await row.locator('[data-rec]').textContent(), /É o pagamento de: Aluguel do 5º andar · mar\/26 · previsto R\$\s2\.000,00/);
await row.locator('[data-rec]').selectOption({ index: 1 }); await wait(200);
assert.match(await p.textContent('li.irow.prev'), /Vinculado por você/); assert.match(await p.textContent('li.irow.prev'), /O valor mudou de R\$\s2\.000,00 para R\$\s2\.150,00/);
assert.equal(await p.isChecked('[data-fixf]'), true);
await p.screenshot({ path: (process.env.SHOTS || '/tmp') + '/vinculo-revisao.png' });
await p.click('#r-go'); await wait(1500);
let d = drive.current(); const r = d.rec[0];
assert.equal(r.amount, 2150); assert.deepEqual(r.keys, ['IMOBILIARIA EXEMPLO']);
const mar = d.tx.find(t => t.recId === r.id && t.recM === '2026-03'); assert.deepEqual([mar.amount, mar.status, !!mar.prev], [2150, 'liq', false]);
assert.equal(d.tx.find(t => t.recId === r.id && t.recM === '2026-04').amount, 2150);
assert.equal(d.tx.filter(t => t.type === 'deb' && t.date.startsWith('2026-03')).length, 2, 'aluguel (sem duplicar) + condomínio como despesa comum');
// a tela da conta fixa mostra por qual nome do banco ela é reconhecida
await p.click('[data-tab=agenda]'); await p.click('#agseg [data-v=fix]'); await p.click('[data-rec]'); await p.waitForSelector('#rc-forget');
assert.match(await p.textContent('#sheet'), /No extrato, é reconhecida por: IMOBILIARIA EXEMPLO/);
console.log('erros:', errs.join('\n') || 'nenhum'); assert.equal(errs.length, 0);
await browser.close(); console.log('E2E vínculo OK');
