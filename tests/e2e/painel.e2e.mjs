/* Teste de navegador: Agenda › Painel (parcelas a pagar, quem usou o cartão, filtros e tabela), juros do Pix no crédito
   e caixas de confirmação do próprio app. Dados fictícios. Uso: como os outros. */
import assert from 'node:assert/strict';
import { createDrive, newDevice, setup, wait } from './harness.mjs';
const { chromium, devices } = await import(process.env.PLAYWRIGHT || 'playwright');
const BASE = process.env.BASE || 'http://localhost:8766/';
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const drive = createDrive();
const { page: p, errs } = await newDevice(browser, devices, BASE, drive, 'A');
await setup(p); await wait(800);
await p.evaluate(async () => {
  const M = await import('./js/model.js'), C = await import('./js/calc.js'), sync = await import('./js/sync.js');
  await sync.commit(s => {
    const card = s.accounts.find(a => a.nature === 'credito'), it = n => s.items.find(i => i.name === n).id, cm = M.todayISO().slice(0, 7);
    card.holders = [{ ref: '1111', name: 'Pessoa A', kind: 'adicional', reimb: false, since: C.mAdd(cm, -6) }, { ref: '2222', name: 'Pessoa B', kind: 'adicional', reimb: true, since: C.mAdd(cm, -6) }];
    const buy = (comp, v, desc, extra) => { const t = M.newTx({ type: 'cred', date: comp + '-03', accountId: card.id, itemId: it('Compras diversas'), amount: v, desc }); t.comp = comp; Object.assign(t, extra || {}); s.tx.push(t); };
    for (let i = 1; i <= 5; i++) buy(C.mAdd(cm, i - 2), 100, `GELADEIRA EXEMPLO (${i}/5)`, { parcKey: 'pg', parcI: i, parcN: 5, prev: i > 2, cardRef: '1111' });   // 4 parcelas de hoje em diante
    for (let i = 1; i <= 2; i++) buy(C.mAdd(cm, i - 1), 50, `SOFA EXEMPLO (${i}/2)`, { parcKey: 'ps', parcI: i, parcN: 2, prev: i > 1 });
    buy(cm, 80, 'MERCADO EXEMPLO', { cardRef: '1111' }); buy(C.mAdd(cm, -1), 40, 'FARMACIA EXEMPLO', { cardRef: '2222' }); buy(cm, 30, 'PADARIA EXEMPLO');
  });
});
await wait(400);
const money = async sel => (await p.textContent(sel)).replace(/\s/g, ' ');
// Painel abre em "Parcelas a pagar": próximos 12 meses, por compra
await p.click('[data-tab=agenda]'); await p.click('#agseg [data-v=pn]');
assert.equal(await p.getAttribute('[data-pnp=parc]', 'aria-pressed'), 'true'); assert.equal(await money('#pn-total'), 'R$ 500,00');
assert.equal(await p.locator('#pn-months .pnrow').count(), 4, 'a lista para no último mês com parcela'); assert.match(await p.textContent('#pn-groups'), /GELADEIRA EXEMPLO[\s\S]*4 de 5 parcelas/);
assert.match((await p.textContent('#pn-table tr.res')).replace(/\s/g, ' '), /Total150,00150,00100,00100,00/);
// quem usou o cartão: inclui quem devolve o dinheiro
await p.click('[data-pnp=who]'); assert.equal(await money('#pn-total'), 'R$ 400,00');
const g = (await p.$$eval('#pn-groups li', l => l.map(x => x.textContent.replace(/\s+/g, ' ').trim())));
assert(g.some(x => /^Pessoa A.*R\$ 280,00/.test(x)) && g.some(x => /^Pessoa B \(devolve\).*R\$ 40,00/.test(x)) && g.some(x => /sem nome cadastrado.*R\$ 80,00/.test(x)), g.join(' | '));
// filtros livres: só a Pessoa A, este mês, por compra
await p.click('#pn-ctl summary'); await p.selectOption('[data-pn=who]', { label: 'Pessoa A · Cartão Exemplo' }); await p.selectOption('[data-pn=per]', 'cur'); await p.selectOption('[data-pn=group]', 'desc');
assert.equal(await money('#pn-total'), 'R$ 180,00'); assert.equal(await p.locator('#pn-months').count(), 0, 'um mês só: sem a lista de meses');
// do painel para os lançamentos do mês, com o mesmo recorte
await p.click('[data-pnp=parc]'); await p.locator('#pn-months .pnrow').nth(1).click();
assert.equal(await p.getAttribute('[data-tab=lanc]', 'aria-current'), 'page'); assert.equal(await p.getAttribute('#lfilt [data-fk=parc]', 'aria-pressed'), 'true');
assert.deepEqual((await p.$$eval('#lbody li[data-tx] .t b', l => l.map(x => x.textContent))).sort(), ['GELADEIRA EXEMPLO', 'SOFA EXEMPLO']);
await p.click('[data-fclear]');

// Pix no crédito com juros informados
await p.click('#fab'); await p.fill('#f-val', '110'); await p.fill('#f-desc', 'Pix Loja Exemplo'); await p.selectOption('#f-pay', 'pixcred'); await wait(100);
assert(await p.isVisible('#f-fee')); await p.fill('#f-fee', '10'); await p.selectOption('#f-item', { label: 'Mercado' }); await p.click('#f-save'); await wait(500);
let st = await p.evaluate(async () => (await import('./js/sync.js')).state()); const px = st.tx.find(t => t.desc === 'Pix Loja Exemplo'); assert.deepEqual([px.fee, px.pay, px.type], [10, 'pixcred', 'cred']);
await p.click('[data-tab=resumo]'); assert.match(await p.textContent('#rs-fee'), /10,00/);

// confirmação do próprio app (nos outros testes vale a caixa do navegador, aceita sozinha)
await p.evaluate(() => { window.FIN_DIALOGS = true; });
await p.click('[data-tab=ajustes]'); await p.click('[data-act=cpf]'); await p.fill('#c-cpf', '123.456.789-00'); await p.click('#c-save'); await wait(400);
assert.match(await p.textContent('#cpf-card'), /✓ cadastrado/);
await p.click('[data-act=cpfdel]'); await p.waitForSelector('.sheet.confirm'); assert.match(await p.textContent('.sheet.confirm'), /Remover o CPF/);
await p.click('.sheet.confirm [data-no]'); await wait(200); assert.match(await p.textContent('#cpf-card'), /✓ cadastrado/, 'cancelar não remove');
await p.click('[data-act=cpfdel]'); await p.click('.sheet.confirm [data-ok]'); await wait(500); assert.match(await p.textContent('#cpf-card'), /não cadastrado/);

const real = errs.filter(e => !/Content Security Policy.*(frame-ancestors|report)/.test(e));
assert.equal(real.length, 0, real.join('\n'));
await browser.close(); console.log('E2E painel OK');
