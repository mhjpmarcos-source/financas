/* Teste de navegador: formas de pagamento (tipos de Pix) e como cada uma se comporta com a conta e com o cartão;
   entrada num segundo aparelho sem passar pela configuração inicial. Dados fictícios. Uso: como os outros. */
import assert from 'node:assert/strict';
import { createDrive, newDevice, setup, wait } from './harness.mjs';
const { chromium, devices } = await import(process.env.PLAYWRIGHT || 'playwright');
const BASE = process.env.BASE || 'http://localhost:8766/';
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const drive = createDrive();
const { page: p, errs } = await newDevice(browser, devices, BASE, drive, 'A');
await setup(p); await wait(1200);
const st = () => p.evaluate(async () => (await import('./js/sync.js')).state());
const open = async () => { await p.click('[data-tab=lanc]'); await p.click('#fab'); await p.waitForSelector('#f-pay'); };

// Pix agendado: fica pendente
await open(); await p.fill('#f-val', '50'); await p.fill('#f-desc', 'Presente Exemplo'); await p.selectOption('#f-item', { label: 'Mercado' });
await p.selectOption('#f-pay', 'pixag'); assert.equal(await p.isChecked('#f-pend'), true); assert.match(await p.textContent('#f-payhint'), /pendente/);
await p.click('#f-save'); await wait(300);
// Pix Automático: vira conta que se repete na conta
await open(); await p.fill('#f-val', '99,90'); await p.fill('#f-desc', 'Academia Exemplo'); await p.selectOption('#f-item', { label: 'Mercado' });
await p.selectOption('#f-pay', 'pixauto'); assert.equal(await p.inputValue('#f-freq'), 'fixa'); await p.click('#f-save'); await wait(500);
// Pix parcelado pelo banco: parcelas saem da conta
await open(); await p.fill('#f-val', '300'); await p.fill('#f-desc', 'Conserto Exemplo'); await p.selectOption('#f-item', { label: 'Mercado' });
await p.selectOption('#f-pay', 'pixparc'); assert.equal(await p.inputValue('#f-freq'), 'parc'); await p.selectOption('#f-n', '3'); await p.click('#f-save'); await wait(500);
// Pix no crédito: passa para o cartão sem perder o que foi digitado e entra na fatura
await open(); await p.fill('#f-val', '120'); await p.fill('#f-desc', 'Loja Exemplo'); await p.selectOption('#f-pay', 'pixcred'); await wait(100);
assert.equal(await p.getAttribute('#seg [data-type=cred]', 'aria-pressed'), 'true'); assert.equal(await p.inputValue('#f-val'), '120,00'); assert.equal(await p.inputValue('#f-desc'), 'Loja Exemplo'); assert.equal(await p.inputValue('#f-pay'), 'pixcred');
await p.selectOption('#f-item', { label: 'Mercado' }); await p.click('#f-save'); await wait(600);
let s = await st(); const by = d => s.tx.filter(t => t.desc.startsWith(d));
assert.deepEqual([by('Presente')[0].pay, by('Presente')[0].status, by('Presente')[0].type], ['pixag', 'pend', 'deb']);
const rule = s.rec.find(r => r.desc === 'Academia Exemplo'); assert.deepEqual([rule.pay, rule.type, rule.kind], ['pixauto', 'deb', 'fixa']); assert(by('Academia').length > 6, 'meses seguintes previstos');
assert.deepEqual(by('Conserto').map(t => [t.pay, t.type, t.amount]), [['pixparc', 'deb', 100], ['pixparc', 'deb', 100], ['pixparc', 'deb', 100]]);
assert.deepEqual([by('Loja')[0].pay, by('Loja')[0].type], ['pixcred', 'cred']); assert.equal(s.accounts.find(a => a.id === by('Loja')[0].accountId).nature, 'credito');
// dedução pelo nome que vem do banco, e a conta que se repete passa a forma para todos os meses
const inf = await p.evaluate(async () => { const C = await import('./js/calc.js'), s = (await import('./js/sync.js')).state(); const f = (desc, type = 'deb') => C.payOf(s, { type, desc });
  return [f('Pix Enviado · FULANO'), f('Pix Agendamento · LUZ'), f('PIX AUTOMATICO ACADEMIA'), f('Pagamento de Boleto · X'), f('PIX CREDITO LOJA', 'cred'), f('Padaria'), f('SUPERMERCADO', 'cred'), C.payOf(s, s.tx.filter(t => t.desc === 'Academia Exemplo').pop())]; });
assert.deepEqual(inf, ['pix', 'pixag', 'pixauto', 'boleto', 'pixcred', '', '', 'pixauto']);
// marca na lista, filtro por forma de pagamento e bloco no Resumo
await p.click('[data-tab=lanc]'); if (await p.locator('[data-mgo]').count()) await p.click('[data-mgo]'); // a compra no cartão levou a tela para o mês da fatura
assert.match(await p.locator('li[data-tx]', { hasText: 'Presente Exemplo' }).textContent(), /Pix agendado/);
await p.click('[data-fmore]'); await p.selectOption('#fl-pay', 'pix*'); await p.click('#fl-ok');
const names = await p.$$eval('#lbody li[data-tx] .t b', l => l.map(x => x.textContent)); assert(names.includes('Presente Exemplo') && names.includes('Academia Exemplo') && names.every(n => /Exemplo/.test(n)));
await p.click('[data-tab=resumo]'); assert.match(await p.textContent('#rs-pay'), /Pix Automático/); await p.click('#rs-pay [data-dr$="|pixauto"]'); await p.click('#dr-lanc');
assert.deepEqual(await p.$$eval('#lbody li[data-tx] .t b', l => l.map(x => x.textContent)), ['Academia Exemplo']);

// segundo aparelho: entra direto nos dados, sem a configuração inicial e sem o tutorial
const B = await newDevice(browser, devices, BASE, drive, 'B'); const q = B.page;
await q.click('#login'); await q.waitForSelector('.tabs, #wz', { timeout: 15000 });
assert.equal(await q.locator('#wz').count(), 0, 'não mostra a configuração inicial'); assert.equal(await q.locator('.sheet.tour').count(), 0);
await wait(600); assert((await q.locator('li[data-tx]').count()) > 0, 'dados carregados');

const real = [...errs, ...B.errs].filter(e => !/Content Security Policy.*(frame-ancestors|report)/.test(e));
assert.equal(real.length, 0, real.join('\n'));
await browser.close(); console.log('E2E pix e segundo aparelho OK');
