/* Teste de navegador: detalhe ao tocar (Resumo › Mês, Ano e Futuro; saldo da conta; fatura; Agenda), juros do Pix no crédito
   e caixas de confirmação do próprio app. Dados fictícios. Uso: como os outros. */
import assert from 'node:assert/strict';
import { createDrive, newDevice, setup, wait } from './harness.mjs';
const { chromium, devices } = await import(process.env.PLAYWRIGHT || 'playwright');
const BASE = process.env.BASE || 'http://localhost:8766/';
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const drive = createDrive();
const { page: p, errs } = await newDevice(browser, devices, BASE, drive, 'A');
await setup(p); await wait(800);
const cm = await p.evaluate(async () => {
  const M = await import('./js/model.js'), C = await import('./js/calc.js'), sync = await import('./js/sync.js');
  const cm = M.todayISO().slice(0, 7);
  await sync.commit(s => {
    const acc = s.accounts.find(a => a.nature === 'debito'), card = s.accounts.find(a => a.nature === 'credito'), it = n => s.items.find(i => i.name === n).id;
    acc.initialDate = '2020-01-01';
    card.holders = [{ ref: '1111', name: 'Pessoa A', kind: 'adicional', reimb: false, since: C.mAdd(cm, -6) }, { ref: '2222', name: 'Pessoa B', kind: 'adicional', reimb: true, since: C.mAdd(cm, -6) }];
    const buy = (comp, v, desc, extra) => { const t = M.newTx({ type: 'cred', date: comp + '-03', accountId: card.id, itemId: it('Compras diversas'), amount: v, desc }); t.comp = comp; Object.assign(t, extra || {}); s.tx.push(t); };
    for (let i = 1; i <= 5; i++) buy(C.mAdd(cm, i - 2), 100, `GELADEIRA EXEMPLO (${i}/5)`, { parcKey: 'pg', parcI: i, parcN: 5, prev: i > 2, cardRef: '1111' });
    for (let i = 1; i <= 2; i++) buy(C.mAdd(cm, i - 1), 50, `SOFA EXEMPLO (${i}/2)`, { parcKey: 'ps', parcI: i, parcN: 2, prev: i > 1 });
    buy(cm, 80, 'MERCADO EXEMPLO', { cardRef: '1111' }); buy(cm, 40, 'FARMACIA EXEMPLO', { cardRef: '2222' }); buy(cm, 30, 'PADARIA EXEMPLO');
    const d = M.newTx({ type: 'deb', date: cm + '-01', accountId: acc.id, itemId: it('Mercado'), amount: 70, desc: 'FEIRA EXEMPLO', status: 'liq' }); s.tx.push(d);
  });
  return cm;
});
await wait(400);
const sheetNames = () => p.$$eval('#dr-list li[data-tx] .t b', l => l.map(x => x.textContent).sort());
const close = async () => { await p.click('#sheet-x'); await wait(80); };

// Resumo › Mês: quem usou o cartão → cada compra da pessoa; tocar numa compra abre o lançamento e, ao fechar, volta à lista
await p.click('[data-tab=resumo]');
for (let i = 0; i < 3 && !(await p.locator('#rs-who').count()); i++) { await p.click('.month [data-m="1"]'); await wait(100); }
await p.locator('#rs-who li', { hasText: 'Pessoa A' }).click(); await p.waitForSelector('#dr-list');
assert.deepEqual(await sheetNames(), ['GELADEIRA EXEMPLO', 'MERCADO EXEMPLO']); assert.match(await p.textContent('.dsum'), /180,00[\s\S]*2 lançamentos/);
await p.locator('#dr-list li[data-tx]').first().click(); await p.waitForSelector('#f-save'); await close();
assert.equal(await p.locator('#dr-list').count(), 1, 'fechar o lançamento volta para a lista');
await p.click('#dr-lanc'); assert.equal(await p.getAttribute('[data-tab=lanc]', 'aria-current'), 'page'); assert.equal(await p.locator('.fchip.on').count(), 2, 'cartão e pessoa como filtro');
await p.click('[data-fclear]');
// últimos 6 meses por pessoa → grupo → compras
await p.click('[data-tab=resumo]'); for (let i = 0; i < 3 && !(await p.locator('#rs-who').count()); i++) { await p.click('.month [data-m="1"]'); await wait(100); }
await p.click('#rs-who [data-dr^="pn|"]'); await p.waitForSelector('#sheet .dsum'); assert.match(await p.textContent('#sheet'), /Pessoa A[\s\S]*Pessoa B \(devolve\)/);
await p.locator('#sheet li', { hasText: 'Pessoa B' }).click(); await p.waitForSelector('#dr-list'); assert.deepEqual(await sheetNames(), ['FARMACIA EXEMPLO']); await close();
// categoria e grupo
await p.click('details.cat summary'); await p.click('details.cat li[data-dr^="cat|"]'); await p.waitForSelector('#dr-list'); assert((await sheetNames()).length >= 3); await close();

// Futuro: parcelas dos próximos 12 meses → por compra → parcelas da compra
await p.click('[data-rv=fut]'); await p.locator('#fu-kinds li', { hasText: 'Parcelas' }).click(); await p.waitForSelector('#sheet .dsum');
assert.match(await p.textContent('#sheet'), /GELADEIRA EXEMPLO[\s\S]*4 de 5 parcelas/);
await p.locator('#sheet li', { hasText: 'GELADEIRA' }).click(); await p.waitForSelector('#dr-list'); assert.equal(await p.locator('#dr-list li[data-tx]').count(), 4); await close();
await p.locator('details.cmp').nth(1).locator('li[data-dr*="|parcelas"]').click(); await p.waitForSelector('#dr-list'); assert((await sheetNames()).includes('GELADEIRA EXEMPLO')); await close();

// Ano: tocar numa célula
await p.click('[data-rv=ano]'); await p.locator('table.year td.dc').first().click(); await p.waitForSelector('#dr-list'); assert((await p.locator('#dr-list li[data-tx]').count()) > 0); await close();

// Contas: linha do saldo
await p.click('[data-tab=contas]'); await p.click('#page .card [data-acc]'); await p.waitForSelector('#a-calc'); await p.click('#a-calc li[data-dr*="|now|deb"]');
await p.waitForSelector('#dr-list'); assert.deepEqual(await sheetNames(), ['FEIRA EXEMPLO']); await close();
// fatura: por cartão (pessoa)
await p.click('[data-tab=contas]'); await p.click('[data-card]'); await p.waitForSelector('#fa-imp');
await p.click('#sheet [data-c="-1"]'); await wait(150); await p.click('#sheet [data-c="-1"]'); await wait(150);
for (let i = 0; i < 5 && !/MERCADO EXEMPLO/.test(await p.textContent('#sheet')); i++) { await p.click('#sheet [data-c="1"]'); await wait(150); }
await p.locator('#sheet li[data-dr^="who|"]', { hasText: 'Pessoa A' }).click(); await p.waitForSelector('#dr-list'); assert((await sheetNames()).includes('MERCADO EXEMPLO')); await close();
// Agenda: o Painel saiu; parcelados abrem as parcelas
await p.click('[data-tab=agenda]'); assert.equal(await p.locator('#agseg [data-v=pn]').count(), 0);
await p.click('#agseg [data-v=fix]'); await p.locator('li[data-dr^="plan|"]', { hasText: 'SOFA' }).click(); await p.waitForSelector('#dr-list'); assert.equal(await p.locator('#dr-list li[data-tx]').count(), 2); await close();

// Pix no crédito com juros informados
await p.click('[data-tab=lanc]'); await p.click('#fab'); await p.fill('#f-val', '110'); await p.fill('#f-desc', 'Pix Loja Exemplo'); await p.selectOption('#f-pay', 'pixcred'); await wait(100);
assert(await p.isVisible('#f-fee')); await p.fill('#f-fee', '10'); await p.selectOption('#f-item', { label: 'Mercado' }); await p.click('#f-save'); await wait(500);
const st = await p.evaluate(async () => (await import('./js/sync.js')).state()); const px = st.tx.find(t => t.desc === 'Pix Loja Exemplo'); assert.deepEqual([px.fee, px.pay, px.type], [10, 'pixcred', 'cred']);
await p.click('[data-tab=resumo]'); await p.click('[data-rv=mes]'); assert.match(await p.textContent('#rs-fee'), /10,00/); await p.click('#rs-fee'); await p.waitForSelector('#dr-list'); assert.deepEqual(await sheetNames(), ['Pix Loja Exemplo']); await close();

// confirmação do próprio app
await p.evaluate(() => { window.FIN_DIALOGS = true; });
await p.click('[data-tab=ajustes]'); await p.click('[data-act=cpf]'); await p.fill('#c-cpf', '123.456.789-00'); await p.click('#c-save'); await wait(400);
assert.match(await p.textContent('#cpf-card'), /✓ cadastrado/);
await p.click('[data-act=cpfdel]'); await p.waitForSelector('.sheet.confirm'); assert.match(await p.textContent('.sheet.confirm'), /Remover o CPF/);
await p.click('.sheet.confirm [data-no]'); await wait(200); assert.match(await p.textContent('#cpf-card'), /✓ cadastrado/, 'cancelar não remove');
await p.click('[data-act=cpfdel]'); await p.click('.sheet.confirm [data-ok]'); await wait(500); assert.match(await p.textContent('#cpf-card'), /não cadastrado/);

const real = errs.filter(e => !/Content Security Policy.*(frame-ancestors|report)/.test(e));
assert.equal(real.length, 0, real.join('\n'));
await browser.close(); console.log('E2E detalhe ao tocar OK');
