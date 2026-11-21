/* Teste de navegador: tutorial de primeiro uso, guia, política de privacidade, assinaturas no cartão e Resumo › Futuro
   (renda comprometida). Dados fictícios. Uso: como os outros (ver importacao.e2e.mjs) */
import assert from 'node:assert/strict';
import { createDrive, newDevice, wait } from './harness.mjs';
const { chromium, devices } = await import(process.env.PLAYWRIGHT || 'playwright');
const BASE = process.env.BASE || 'http://localhost:8766/';
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const drive = createDrive();
const { page: p, errs } = await newDevice(browser, devices, BASE, drive, 'A');
// primeiro acesso sem pular o tutorial: ele abre ao terminar a configuração
await p.click('#login'); await p.waitForSelector('#wz');
await p.click('[data-wz=next]'); await p.fill('[data-f="acc.name"]', 'Conta Exemplo'); await p.fill('[data-f="acc.initial"]', '100'); await p.click('[data-wz=next]');
await p.click('[data-wz=addcard]'); await p.fill('[data-f="card.name"]', 'Cartão Exemplo'); await p.fill('[data-f="card.closeDay"]', '25'); await p.fill('[data-f="card.dueDay"]', '10');
await p.click('[data-wz=next]'); await p.click('[data-wz=next]'); await p.click('[data-wz=next]'); await p.click('[data-wz=finish]');
await p.waitForSelector('.sheet.tour'); assert.match(await p.textContent('.sheet.tour h2'), /Bem-vindo ao Níquel/);
let n = 1; while (await p.locator('.sheet.tour [data-tour=next]').count()) { await p.click('.sheet.tour [data-tour=next]'); n++; }
assert(n >= 5, 'várias telas'); assert.match(await p.textContent('.sheet.tour [data-tour=skip]'), /Começar a usar/); await p.click('.sheet.tour [data-tour=back]'); await p.click('.sheet.tour [data-tour=next]');
await p.click('.sheet.tour [data-tour=skip]'); assert.equal(await p.locator('.sheet.tour').count(), 0);
await p.reload(); await p.waitForSelector('.tabs'); await wait(300); assert.equal(await p.locator('.sheet.tour').count(), 0, 'não volta sozinho');
// Ajustes › Ajuda: tutorial de novo, guia e política
await p.click('[data-tab=ajustes]'); await p.click('[data-act=tour]'); await p.waitForSelector('.sheet.tour'); await p.keyboard.press('Escape'); assert.equal(await p.locator('.sheet.tour').count(), 0);
await p.click('[data-act=guide]'); assert.match(await p.textContent('.top h1'), /Ajuda/); assert((await p.locator('details.faq').count()) > 15);
await p.click('details.faq summary'); assert(await p.isVisible('details.faq p')); await p.click('#back');
await p.click('#help-card a.btn'); await p.waitForSelector('main.doc'); assert.match(await p.textContent('h1'), /Política de privacidade/); assert.match(await p.textContent('main'), /drive\.file/);
await p.goBack(); await p.waitForSelector('.tabs');

// dados: renda e conta fixa que se repetem, compra parcelada, duas compras iguais em faturas seguidas e um serviço conhecido
await p.evaluate(async () => {
  const M = await import('./js/model.js'), C = await import('./js/calc.js'), sync = await import('./js/sync.js');
  await sync.commit(s => {
    const acc = s.accounts.find(a => a.nature === 'debito'), card = s.accounts.find(a => a.nature === 'credito'), it = n => s.items.find(i => i.name === n).id, cm = M.todayISO().slice(0, 7);
    s.rec.push(M.newRec({ kind: 'fixa', type: 'rec', desc: 'Salário Exemplo', itemId: it('Salário'), accountId: acc.id, amount: 5000, day: 5, start: cm }),
      M.newRec({ kind: 'fixa', type: 'deb', desc: 'Aluguel Exemplo', itemId: it('Aluguel / Financiamento'), accountId: acc.id, amount: 1500, day: 10, start: cm }));
    const buy = (comp, v, desc, extra) => { const t = M.newTx({ type: 'cred', date: comp + '-03', accountId: card.id, itemId: it('Compras diversas'), amount: v, desc }); t.comp = comp; Object.assign(t, extra || {}); s.tx.push(t); };
    buy(C.mAdd(cm, -1), 29.9, 'STREAMING EXEMPLO'); buy(cm, 29.9, 'STREAMING EXEMPLO'); buy(cm, 44.9, 'NETFLIX.COM'); buy(cm, 80, 'PADARIA EXEMPLO');
    for (let i = 1; i <= 3; i++) buy(C.mAdd(cm, i - 1), 200, `LOJA EXEMPLO (${i}/3)`, { parcKey: 'pkx', parcI: i, parcN: 3, prev: i > 1 });
    M.ensureRecurring(s);
  });
});
await wait(500);
const calc = () => p.evaluate(async () => { const C = await import('./js/calc.js'), M = await import('./js/model.js'), s = (await import('./js/sync.js')).state(); const cm = M.todayISO().slice(0, 7);
  return { subs: C.detectSubs(s).map(x => [x.desc, x.kind, x.amount, x.n]), rows: C.committed(s, cm, 4) }; });
let r = await calc();
assert.deepEqual(r.subs, [['NETFLIX.COM', 'fixa', 44.9, 1], ['STREAMING EXEMPLO', 'fixa', 29.9, 2]], 'assinaturas encontradas (a padaria, de uma vez só, fica fora)');
assert.deepEqual([r.rows[1].renda, r.rows[1].parts.fixas, r.rows[1].parts.parcelas, r.rows[1].pct], [5000, 1500, 200, 34]);
assert.deepEqual(r.rows[2].ends.map(e => [e.desc, e.amount]), [['LOJA EXEMPLO', 200]], 'a última parcela aparece como término');
// Futuro: percentual do mês que vem, aviso das assinaturas e confirmação
await p.click('[data-tab=resumo]'); await p.click('[data-rv=fut]'); assert.match(await p.textContent('#fu-pct'), /34% da renda/);
assert.equal(await p.locator('details.cmp').count(), 13); assert.match(await p.textContent('#page'), /LOJA EXEMPLO/);
await p.click('#fu-subs'); await p.waitForSelector('#subs-card'); assert.equal(await p.locator('#subs-card li').count(), 2);
await p.locator('#subs-card li', { hasText: 'STREAMING EXEMPLO' }).locator('[data-sug]').click(); await wait(600);
await p.locator('#subs-card li', { hasText: 'NETFLIX' }).locator('[data-ign]').click(); await wait(400);
assert.equal(await p.locator('#subs-card').count(), 0, 'nada mais a perguntar');
r = await calc(); assert.deepEqual(r.subs, []); assert.equal(r.rows[3].parts.fixas, 1529.9, 'a assinatura passou a contar nos meses seguintes (pela fatura em que cai)');
const st = await p.evaluate(async () => (await import('./js/sync.js')).state());
const rule = st.rec.find(x => x.desc === 'STREAMING EXEMPLO'); assert(rule && rule.type === 'cred'); assert.equal(st.tx.filter(t => t.recId === rule.id && !t.prev).length, 2, 'as compras antigas ficaram ligadas');
await p.click('[data-tab=resumo]'); assert.match(await p.textContent('#fu-pct'), /% da renda/); assert.equal(await p.locator('#fu-subs').count(), 0);
await p.screenshot({ path: (process.env.SHOTS || '/tmp') + '/futuro.png', fullPage: true });

const real = errs.filter(e => !/Content Security Policy.*(frame-ancestors|report)/.test(e));
assert.equal(real.length, 0, real.join('\n'));
await browser.close(); console.log('E2E ajuda e futuro OK');
