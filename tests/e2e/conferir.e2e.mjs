/* Teste de navegador: lista "para conferir" (pagamento de fatura lançado como despesa, pix devolvido), "Vincular a…" num
   lançamento que já existe, navegação de meses (voltar ao atual, escolher mês e ano) e botões de receita em Fixas e parcelas.
   Dados fictícios. Uso: como os outros (ver importacao.e2e.mjs) */
import assert from 'node:assert/strict';
import { createDrive, newDevice, setup, wait } from './harness.mjs';
const pw = await import(process.env.PLAYWRIGHT || 'playwright');
const { chromium, devices } = pw;
const BASE = process.env.BASE || 'http://localhost:8766/';
const shot = n => (process.env.SHOTS || '/tmp') + '/' + n + '.png';
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const drive = createDrive();
const { page: p, errs } = await newDevice(browser, devices, BASE, drive, 'A');
await setup(p);
// estado de partida (como viria de uma importação): compra no cartão, Pix para o emissor no valor da fatura, pix devolvido,
// aluguel pago com reajuste e a conta fixa "Aluguel" já cadastrada
await p.evaluate(async () => {
  const M = await import('./js/model.js'), C = await import('./js/calc.js'), sync = await import('./js/sync.js');
  await sync.commit(s => {
    const acc = s.accounts.find(a => a.nature === 'debito'), card = s.accounts.find(a => a.nature === 'credito'), it = n => s.items.find(i => i.name === n).id;
    acc.initialDate = '2020-01-01';
    const cm = M.todayISO().slice(0, 7), d = n => cm + '-' + String(n).padStart(2, '0');
    const buy = M.newTx({ type: 'cred', date: C.mAdd(cm, -1) + '-05', accountId: card.id, itemId: it('Mercado'), amount: 800, desc: 'Supermercado Exemplo com um nome bem comprido para ocupar duas linhas (3/6)' });
    buy.comp = cm; Object.assign(buy, { parcKey: 'pk1', parcI: 3, parcN: 6 });
    const mk = (type, day, amount, desc, cat) => { const t = M.newTx({ type, date: d(day), accountId: acc.id, itemId: cat ? it(cat) : '', amount, desc, status: 'liq' }); t.origin = 'import'; if (!cat) t.itemId = ''; return t; };
    s.tx.push(buy, mk('deb', 2, 800, 'Pix Enviado · EMISSOR EXEMPLO SA', 'Mercado'), mk('deb', 3, 120, 'Pix Agendamento · COMPANHIA DE LUZ', 'Energia'), mk('rec', 3, 120, 'Pix Rejeitado · QR CODE REJEITADO', 'Salário'),
      mk('deb', 4, 120, 'Pagamento de Boleto · COMPANHIA DE LUZ', 'Energia'), mk('deb', 1, 2150, 'Pagamento de Boleto · IMOBILIARIA EXEMPLO LTDA', 'Aluguel / Financiamento'));
    const r = M.newRec({ kind: 'fixa', type: 'deb', desc: 'Aluguel', itemId: it('Aluguel / Financiamento'), accountId: acc.id, amount: 2000, day: 1, start: cm }); s.rec.push(r); M.ensureRecurring(s);
  });
});
await wait(400); await p.click('[data-tab=agenda]'); await p.click('[data-tab=lanc]'); await wait(200);
// ---------- lista: descrição inteira, parcela por extenso, compras agrupadas na fatura ----------
const li = p.locator('li[data-tx]', { hasText: 'Supermercado Exemplo' });
assert.match(await li.textContent(), /nome bem comprido para ocupar duas linhas/); assert.match(await li.textContent(), /parcela 3 de 6/); assert.doesNotMatch(await li.locator('b').textContent(), /\(3\/6\)/);
assert.match(await p.textContent('details.fat summary'), /Fatura Cartão Exemplo/);
const box = await li.locator('b').boundingBox(), lh = await li.locator('b').evaluate(e => parseFloat(getComputedStyle(e).lineHeight)); assert(box.height > lh * 1.5, 'a descrição longa quebra em duas linhas, em vez de cortar');
await p.screenshot({ path: shot('conferir-lista'), fullPage: true });
// ---------- para conferir ----------
assert.match(await p.textContent('#rv-open'), /2 lançamentos para conferir/);
await p.click('#rv-open'); await p.waitForSelector('[data-rvpay]');
assert.match(await p.textContent('#sheet'), /Mesmo valor da fatura Cartão Exemplo/); assert.match(await p.textContent('#sheet'), /Pix devolvido ou rejeitado/);
await p.screenshot({ path: shot('conferir-sheet') });
await p.click('[data-rvpay]'); await wait(1500);
let d = drive.current(); const pay = d.tx.find(t => /EMISSOR EXEMPLO/.test(t.desc));
assert.equal(pay.cardPay, true); assert.match(pay.faturaKey, /\|\d{4}-\d{2}$/); assert(Object.keys(d.rules).some(k => k.startsWith('pay:EMISSOR')));
await p.click('[data-rvdel]'); await wait(1500);
d = drive.current(); assert.equal(d.tx.filter(t => /COMPANHIA DE LUZ|REJEITADO/.test(t.desc)).length, 1, 'fica só o boleto pago de verdade');
assert.equal(await p.locator('#sheet').isHidden(), true, 'nada mais a conferir: a lista fecha'); assert.equal(await p.locator('#rv-open').count(), 0);
// ---------- vincular um lançamento à conta que se repete, com novo valor previsto ----------
await p.locator('li[data-tx]', { hasText: 'IMOBILIARIA EXEMPLO' }).click(); await p.click('#f-link'); await p.waitForSelector('#lk-rule-ok');
assert.match(await p.textContent('#lk-rule'), /Aluguel · R\$\s2\.000,00 · dia 1/);
await p.screenshot({ path: shot('conferir-vincular') });
await p.click('#lk-rule-ok'); await p.locator('.sheet.ask button', { hasText: 'Novo valor previsto' }).click(); await wait(1500);
d = drive.current(); const r = d.rec[0], cm = new Date().toISOString().slice(0, 7);
assert.equal(r.amount, 2150); assert.deepEqual(r.keys, ['IMOBILIARIA EXEMPLO']);
assert.equal(d.tx.filter(t => t.recId === r.id && t.recM === d.tx.find(t => /IMOBILIARIA/.test(t.desc)).recM).length, 1, 'o previsto do mês deu lugar ao lançamento real');
assert(d.tx.filter(t => t.recId === r.id && t.prev).every(t => t.amount === 2150));
assert.match(await p.locator('li[data-tx]', { hasText: 'IMOBILIARIA EXEMPLO' }).textContent(), /todo mês/);
// ---------- meses: voltar ao atual e escolher mês e ano ----------
const label = () => p.textContent('.month b'); const cur = await label();
await p.click('.month [data-m="1"]'); await p.click('.month [data-m="1"]'); assert.notEqual(await label(), cur);
await p.click('[data-mgo]'); assert.equal(await label(), cur); assert.equal(await p.locator('[data-mgo]').count(), 0);
await p.click('[data-mpick]'); await p.click('.sheet.ask [data-py="1"]'); await p.click('.sheet.ask [data-py="1"]'); await p.locator('.sheet.ask [data-pm]', { hasText: 'Mar' }).click();
assert.match(await label(), new RegExp('março de ' + (new Date().getFullYear() + 2), 'i')); assert.match(await p.textContent('.hz'), /previsões de renda e de contas fixas vão até/);
await p.click('[data-tab=resumo]'); assert.match(await label(), /março/i, 'o mês escolhido vale também no Resumo'); await p.click('[data-mpick]'); await p.locator('.sheet.ask button', { hasText: 'Mês atual' }).click(); assert.equal(await label(), cur);
// ---------- fixas e parcelas: receita tem o próprio botão ----------
await p.click('[data-tab=agenda]'); await p.click('#agseg [data-v=fix]'); await p.click('#fx-new-rec'); await p.waitForSelector('#f-save');
assert.match(await p.textContent('#sheet h2'), /Nova receita que se repete/); assert.equal(await p.getAttribute('#seg [data-type=rec]', 'aria-pressed'), 'true'); assert.equal(await p.inputValue('#f-freq'), 'fixa');
await p.click('#f-cancel'); await p.click('#fx-new-parc'); assert.match(await p.textContent('#sheet h2'), /parcelada/); assert.equal(await p.inputValue('#f-freq'), 'parc'); await p.click('#f-cancel');
// busca: digitar não troca o campo (no iPhone, trocar o campo reabria o teclado a cada tecla)
await p.click('[data-tab=lanc]'); await p.evaluate(() => { window.__q = document.querySelector('#q'); });
await p.type('#q', '2150', { delay: 30 }); await wait(400);
assert.equal(await p.evaluate(() => window.__q === document.querySelector('#q') && document.activeElement === window.__q), true, 'mesmo campo e com o foco');
assert.match(await p.textContent('#lbody'), /IMOBILIARIA/); await p.fill('#q', ''); await wait(300);
// lançamento com data no futuro começa como pendente
await p.click('[data-tab=lanc]'); await p.click('.month [data-m="1"]'); await p.click('#fab'); await p.waitForSelector('#f-save'); assert.equal(await p.isChecked('#f-pend'), true); await p.click('#f-cancel');
console.log('erros:', errs.join('\n') || 'nenhum'); assert.equal(errs.length, 0);
await browser.close(); console.log('E2E conferir OK');
