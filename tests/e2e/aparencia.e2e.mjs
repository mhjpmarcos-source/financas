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

// padrão: automático, estilo Maré; acompanha o aparelho
assert.equal(await html('data-style'), 'mare'); assert.equal(await html('data-mode'), 'light');
await p.emulateMedia({ colorScheme: 'dark' }); await wait(100); assert.equal(await html('data-mode'), 'dark', 'automático segue o aparelho');
// escolha manual vence o aparelho e fica guardada
await p.click('[data-tab=ajustes]'); await p.click('[data-thm=light]'); assert.equal(await html('data-mode'), 'light');
assert.equal(await p.getAttribute('[data-thm=light]', 'aria-pressed'), 'true');
await p.click('[data-look=ameixa]'); assert.equal(await html('data-style'), 'ameixa');
assert.match(await p.evaluate(() => getComputedStyle(document.body).fontFamily), /Jakarta/);
const hero = () => p.evaluate(() => getComputedStyle(document.querySelector('.top')).backgroundColor);
assert.equal(await p.evaluate(() => getComputedStyle(document.body).backgroundColor), await hero(), 'fundo de puxar a tela na cor do topo');
assert.notEqual(await p.evaluate(() => getComputedStyle(document.querySelector('#app')).backgroundColor), await hero(), 'o conteúdo tem o fundo claro');
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

// nada passa da largura da tela (nem nas folhas), também num aparelho estreito
const wide = () => p.evaluate(() => {
  const w = document.documentElement.clientWidth, bad = [];
  if (document.documentElement.scrollWidth > w + 1) bad.push('página ' + document.documentElement.scrollWidth);
  const pn = document.querySelector('#sheet .panel'); if (pn && pn.scrollWidth > pn.clientWidth + 1) bad.push('folha ' + pn.scrollWidth + '>' + pn.clientWidth);
  for (const el of document.querySelectorAll('#page input, #page select, #page .btn, #page .card, #page .hcard, #sheet .panel input, #sheet .panel select, #sheet .panel .btn, .tabs button')) {
    if (el.closest('.scrollx, .quick') || !el.offsetParent) continue;
    const r = el.getBoundingClientRect(); if (r.right > w + 1 || r.left < -1) bad.push((el.id || el.className || el.tagName) + ' ' + Math.round(r.left) + '–' + Math.round(r.right));
  }
  return bad;
});
for (const [vw, vh] of [[390, 664], [320, 568]]) {
  await p.setViewportSize({ width: vw, height: vh });
  for (const t of ['lanc', 'agenda', 'resumo', 'contas', 'ajustes']) { await p.click(`[data-tab=${t}]`); await wait(80); assert.deepEqual(await wide(), [], `largura em ${t} (${vw})`); }
  for (const v of ['fix', 'loans']) { await p.click('[data-tab=agenda]'); await p.click(`#agseg [data-v=${v}]`); assert.deepEqual(await wide(), [], `largura em agenda/${v} (${vw})`); }
  for (const v of ['orc', 'ano']) { await p.click('[data-tab=resumo]'); await p.click(`[data-rv=${v}]`); assert.deepEqual(await wide(), [], `largura em resumo/${v} (${vw})`); }
  await p.click('[data-rv=mes]');
  await p.click('[data-tab=lanc]');
  for (const k of ['deb', 'cred', 'rec', 'trf', 'pgto']) { await p.click(`[data-qa=${k}]`, { force: true }); await p.waitForSelector('#sheet-x'); await wait(80); assert.deepEqual(await wide(), [], `largura na folha ${k} (${vw})`); await p.click('#sheet-x'); }
  await p.click('[data-tab=contas]'); await p.click('[data-card]'); await p.waitForSelector('#fa-imp'); assert.deepEqual(await wide(), [], `largura na fatura (${vw})`);
  await p.click('#fa-edit'); await p.waitForSelector('#a-save'); assert.deepEqual(await wide(), [], `largura no cartão (${vw})`); await p.click('#sheet-x');
  await p.click('#res-new'); await p.waitForSelector('#rs-save'); assert.deepEqual(await wide(), [], `largura na reserva (${vw})`); await p.click('#sheet-x');
  await p.click('[data-tab=agenda]'); await p.click('#agseg [data-v=loans]'); await p.click('[data-newloan=out]'); await p.waitForSelector('#l-save'); assert.deepEqual(await wide(), [], `largura na dívida (${vw})`); await p.click('#sheet-x');
  await p.click('#agseg [data-v=pend]');
}
// filtros: a fila, os números do alto e o Resumo levam à lista filtrada
await p.setViewportSize({ width: 390, height: 664 }); await p.click('[data-tab=lanc]'); await p.click('#fab'); await p.click('#seg [data-type=rec]'); await p.fill('#f-val', '900'); await p.fill('#f-desc', 'Receita Exemplo'); await p.selectOption('#f-item', { label: 'Salário' }); await p.click('#f-save'); await wait(300);
await p.click('#fab'); await p.fill('#f-val', '70'); await p.fill('#f-desc', 'Despesa Exemplo'); await p.selectOption('#f-item', { label: 'Mercado' }); await p.click('#f-save'); await wait(300);
const names = () => p.$$eval('#lbody li[data-tx] .t b', l => l.map(x => x.textContent));
assert((await names()).includes('Receita Exemplo') && (await names()).includes('Despesa Exemplo'));
await p.click('#lfilt [data-fk=rec]'); assert.deepEqual(await names(), ['Receita Exemplo']); assert.match(await p.textContent('.fsum'), /1.*lançamento.*900,00/);
await p.click('#ltop [data-fk=desp]'); assert(!(await names()).includes('Receita Exemplo')); assert.equal(await p.getAttribute('#lfilt [data-fk=desp]', 'aria-pressed'), 'true');
await p.click('[data-fmore]'); await p.selectOption('#fl-cat', { label: 'Mercado' }); await p.click('#fl-ok'); assert.deepEqual(await names(), ['Despesa Exemplo']);
await p.fill('#q', 'exemplo'); await wait(300); assert.deepEqual(await names(), ['Despesa Exemplo'], 'o filtro vale na busca'); await p.fill('#q', ''); await wait(300);
await p.click('[data-fclear]'); assert((await names()).includes('Receita Exemplo'));
await p.click('[data-tab=resumo]'); await p.click('.hcard [data-fk=rec]'); assert.equal(await p.getAttribute('[data-tab=lanc]', 'aria-current'), 'page'); assert.deepEqual(await names(), ['Receita Exemplo']);
await p.click('[data-tab=resumo]'); await p.click('details.cat summary'); await p.click('[data-fcat]'); assert.equal(await p.locator('.fchip.on').count(), 1, 'categoria do Resumo vira filtro');
await p.click('[data-tab=agenda]'); await p.click('[data-tab=lanc]'); assert.equal(await p.locator('.fchip.on').count(), 0, 'trocar de aba limpa o filtro');

// computador: nada passa da largura e, a partir de 1000 px, o resumo fica ao lado da lista; Esc fecha a folha
for (const [vw, vh] of [[834, 1112], [1024, 768], [1280, 800], [1440, 900], [1728, 1117], [1920, 1080], [2560, 1440]]) {
  await p.setViewportSize({ width: vw, height: vh });
  for (const t of ['lanc', 'agenda', 'resumo', 'contas', 'ajustes']) { await p.click(`[data-tab=${t}]`); await wait(60); assert.deepEqual(await wide(), [], `largura em ${t} (${vw})`); }
  await p.click('[data-tab=lanc]');
  const side = await p.locator('.lside').boundingBox(), main = await p.locator('.lmain').boundingBox(), tabs = await p.locator('.tabs').boundingBox();
  assert.equal(side.x > main.x + main.width - 1, vw >= 1000, `resumo ao lado da lista (${vw})`); assert(tabs.x === 0 && tabs.height >= vh - 1, `menu na lateral (${vw})`);
  assert(main.width >= 440, `lista com largura útil (${vw}: ${Math.round(main.width)})`);
  await p.click('#fab'); await p.waitForSelector('#f-save'); await wait(60); assert.deepEqual(await wide(), [], `largura na folha (${vw})`); assert(await inView('#f-save'));
  await p.keyboard.press('Escape'); assert.equal(await p.isHidden('#sheet'), true, 'Esc fecha a folha');
}

// celular deitado (iPhone grande: 932 × 430, e menor: 844 × 390): as cinco abas cabem no trilho, sem cortar a última
for (const [vw, vh] of [[932, 430], [844, 390], [956, 440]]) {
  await p.setViewportSize({ width: vw, height: vh }); await wait(80);
  const last = await p.locator('.tabs [data-tab=ajustes]').boundingBox(); assert(last.y + last.height <= vh + 0.5, `aba Ajustes inteira na tela (${vw}×${vh}: termina em ${Math.round(last.y + last.height)})`);
  assert.deepEqual(await wide(), [], `largura deitado (${vw})`);
}

// o campo de data segue a largura dos outros campos
await p.setViewportSize({ width: 390, height: 664 }); await p.click('[data-tab=lanc]'); await p.click('#fab'); await p.waitForSelector('#f-date');
const bw = async s => Math.round((await p.locator(s).boundingBox()).width); assert.equal(await bw('#f-date'), await bw('#f-desc'), 'data com a mesma largura da descrição'); await p.click('#sheet-x');

const real = errs.filter(e => !/Content Security Policy.*(frame-ancestors|report)/.test(e));
assert.equal(real.length, 0, real.join('\n'));
await browser.close(); console.log('E2E aparência OK');
