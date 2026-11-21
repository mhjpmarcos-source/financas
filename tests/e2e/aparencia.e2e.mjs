/* Teste de navegador: aparência (claro, escuro, automático e estilos) e ações ao alcance sem rolar a tela
   (Importar na fatura e nos Lançamentos, Salvar fixo no fim da folha, botão de fechar). Dados fictícios.
   Uso: como os outros (ver importacao.e2e.mjs) */
import assert from 'node:assert/strict';
import { createDrive, newDevice, setup, wait } from './harness.mjs';
const { chromium, devices } = await import(process.env.PLAYWRIGHT || 'playwright');
const BASE = process.env.BASE || 'http://localhost:8766/';
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const drive = createDrive();
const { page: p, errs } = await newDevice(browser, devices, BASE, drive, 'A');
await setup(p);
const html = a => p.evaluate(k => document.documentElement.getAttribute(k), a);
const inView = async sel => { const b = await p.locator(sel).boundingBox(), v = p.viewportSize(); return !!b && b.y >= 0 && b.y + b.height <= v.height; };

// padrão: automático, estilo Mata; acompanha o aparelho
assert.equal(await html('data-style'), 'mata'); assert.equal(await html('data-mode'), 'light');
await p.emulateMedia({ colorScheme: 'dark' }); await wait(100); assert.equal(await html('data-mode'), 'dark', 'automático segue o aparelho');
// escolha manual vence o aparelho e fica guardada
await p.click('[data-tab=ajustes]'); await p.click('[data-thm=light]'); assert.equal(await html('data-mode'), 'light');
assert.equal(await p.getAttribute('[data-thm=light]', 'aria-pressed'), 'true');
await p.click('[data-look=ameixa]'); assert.equal(await html('data-style'), 'ameixa');
assert.match(await p.evaluate(() => getComputedStyle(document.body).fontFamily), /Jakarta/);
const hero = () => p.evaluate(() => getComputedStyle(document.querySelector('.top')).backgroundColor);
const h1 = await hero(); await p.click('[data-look=mare]'); assert.notEqual(await hero(), h1, 'o estilo troca a cor do topo');
assert.match(await p.getAttribute('meta[name=theme-color]', 'content'), /^#0c4a5f$/);
await p.reload(); await p.waitForSelector('.tabs');
assert.equal(await html('data-style'), 'mare'); assert.equal(await html('data-mode'), 'light', 'vale depois de reabrir');
assert.equal((await p.evaluate(async () => (await import('./js/sync.js')).state())).config.theme, undefined, 'aparência não vai para o Drive');
await p.click('[data-tab=ajustes]'); await p.click('[data-thm=dark]'); assert.equal(await html('data-mode'), 'dark');
await p.click('[data-thm=auto]'); await p.emulateMedia({ colorScheme: 'light' }); await wait(100); assert.equal(await html('data-mode'), 'light');

// fatura com muitas compras: Importar, + Compra e Registrar pagamento ficam no alto, sem rolar
await p.evaluate(async () => {
  const M = await import('./js/model.js'), C = await import('./js/calc.js'), sync = await import('./js/sync.js');
  await sync.commit(s => {
    const card = s.accounts.find(a => a.nature === 'credito'), comp = C.cardCycle(card, M.todayISO()).comp;
    for (let i = 1; i <= 40; i++) { const t = M.newTx({ type: 'cred', date: M.todayISO(), accountId: card.id, itemId: s.items[0].id, amount: 10 + i, desc: 'LOJA EXEMPLO ' + i }); t.comp = comp; s.tx.push(t); }
  });
});
await p.click('[data-tab=contas]'); await p.click('[data-card]'); await p.waitForSelector('#fa-imp');
for (const id of ['#fa-imp', '#fa-new', '#fa-reg', '#fa-edit']) assert(await inView(id), id + ' visível sem rolar');
assert.equal(await p.locator('#sheet li[data-tx]').count(), 40);
const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('#fa-imp')]); assert(fc, 'Importar abre a escolha do arquivo');
// botão de fechar no alto de toda folha
await p.click('[data-card]'); await p.waitForSelector('#sheet-x'); await p.click('#sheet-x'); assert.equal(await p.isHidden('#sheet'), true);
// Lançamentos: atalhos no alto (Importar inclusive) e o + em todas as abas principais
await p.click('[data-tab=lanc]'); assert(await inView('#imp')); assert(await inView('[data-qa=pgto]') || (await p.locator('[data-qa=pgto]').count()) === 1);
await p.click('[data-qa=rec]'); await p.waitForSelector('#f-save'); assert.equal(await p.getAttribute('#seg [data-type=rec]', 'aria-pressed'), 'true');
await wait(150); assert(await inView('#f-save'), 'Salvar à vista sem rolar o formulário'); await p.click('#sheet-x');
for (const t of ['agenda', 'resumo', 'contas']) { await p.click(`[data-tab=${t}]`); assert(await p.isVisible('#fab'), '+ na aba ' + t); }
await p.click('[data-tab=ajustes]'); assert.equal(await p.locator('#fab').count(), 0);
// Fixas e parcelas: cadastro no alto
await p.click('[data-tab=agenda]'); await p.click('#agseg [data-v=fix]'); assert(await inView('#fx-new'));

const real = errs.filter(e => !/Content Security Policy.*(frame-ancestors|report)/.test(e));
assert.equal(real.length, 0, real.join('\n'));
await browser.close(); console.log('E2E aparência OK');
