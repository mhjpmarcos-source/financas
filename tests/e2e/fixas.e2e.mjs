/* Teste de navegador: despesa fixa, variável, parcelado na conta, histórico detectado, pessoa com Pix. */
import assert from 'node:assert/strict';
import { createDrive, newDevice, setup, wait } from './harness.mjs';
const { chromium, devices } = await import(process.env.PLAYWRIGHT || 'playwright');
const BASE = process.env.BASE || 'http://localhost:8766/';
const SHOTS = process.env.SHOTS || '/tmp';
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const drive = createDrive();
const { page: p, ctx, errs } = await newDevice(browser, devices, BASE, drive, 'A');
await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(BASE).origin });
await setup(p, {});
const st = () => p.evaluate(async () => (await import('./js/sync.js')).state());
const today = await p.evaluate(async () => (await import('./js/model.js')).todayISO());
const novo = async (o) => {
  await p.click('[data-tab=lanc]'); await p.click('#fab'); if (o.type) await p.click(`[data-type=${o.type}]`);
  await p.fill('#f-val', o.v); await p.fill('#f-date', o.date || today); await p.selectOption('#f-item', { label: o.item });
  if (o.desc) await p.fill('#f-desc', o.desc); if (o.freq) await p.selectOption('#f-freq', o.freq); if (o.n) await p.selectOption('#f-n', String(o.n));
  if (o.pend) await p.check('#f-pend'); await p.click('#f-save'); await wait(400);
};
// fixa: 13 meses (este + 12)
await novo({ v: '99,90', item: 'Internet / TV / Telefone', desc: 'Internet fibra', freq: 'fixa' });
let s = await st(); assert.equal(s.rec.length, 1); assert.equal(s.tx.filter(t => t.recId).length, 13); assert.equal(s.tx.filter(t => t.recId && t.status === 'liq').length, 1);
// variável pendente: ao marcar "Pago" na Agenda, pede o valor real
await novo({ v: '150', item: 'Energia', desc: 'Conta de luz', freq: 'var', pend: true });
await p.click('[data-tab=agenda]'); await p.click('[data-v=pend]');
const luz = (await st()).tx.find(t => t.desc === 'Conta de luz' && t.recM === today.slice(0, 7));
await p.click(`[data-ok="tx:${luz.id}"]`); await p.waitForSelector('#f-val');
assert.equal(await p.isChecked('#f-pend'), false, 'já vem como pago');
await p.fill('#f-val', '172,35'); await p.click('#f-save'); await wait(400);
s = await st(); const l2 = s.tx.find(t => t.id === luz.id); assert.equal(l2.amount, 172.35); assert.equal(l2.status, 'liq'); assert(!l2.prev);
assert.equal(s.tx.find(t => t.recId === luz.recId && t.recM > today.slice(0, 7)).amount, 172.35, 'próximos meses com a média');
// parcelado na conta: total dividido
await novo({ v: '900', item: 'Compras diversas', desc: 'Sofá', freq: 'parc', n: 3 });
s = await st(); assert.deepEqual(s.tx.filter(t => t.desc === 'Sofá').map(t => t.amount), [300, 300, 300]);
// tela Fixas e parcelas
await p.click('[data-tab=agenda]'); await p.click('[data-v=fix]'); await wait(200);
const txt = await p.textContent('#page'); assert.match(txt, /Internet fibra/); assert.match(txt, /Conta de luz/); assert.match(txt, /Sofá/);
await p.screenshot({ path: SHOTS + '/fixas.png', fullPage: true });
// encerrar a internet no mês que vem
const rid = s.rec.find(r => r.desc === 'Internet fibra').id;
await p.click(`[data-rec="${rid}"]`); await p.click('#rc-end'); await p.click('.sheet.ask [data-v="2"]'); await wait(400);
s = await st(); assert.equal(s.tx.filter(t => t.recId === rid).length, 2);
// histórico: 4 meses de condomínio fixo → sugestão → cadastrar
await p.evaluate(async (today) => {
  const sync = await import('./js/sync.js'), M = await import('./js/model.js'), C = await import('./js/calc.js');
  await sync.commit(s => { const acc = s.accounts.find(a => a.nature === 'debito'), it = s.items.find(i => i.name === 'Condomínio');
    for (let k = 4; k >= 1; k--) s.tx.push(M.newTx({ type: 'deb', date: C.mAdd(today.slice(0, 7), -k) + '-05', accountId: acc.id, itemId: it.id, amount: 650, desc: 'CONDOMINIO EDIFICIO' })); });
}, today);
await p.click('[data-tab=lanc]'); await p.click('[data-tab=agenda]'); await p.click('[data-v=fix]');
assert.match(await p.textContent('#page'), /Encontradas no seu histórico/);
await p.click('[data-sug="0"]'); await wait(400);
s = await st(); const cond = s.rec.find(r => /CONDOMINIO/.test(r.desc)); assert(cond); assert.equal(s.tx.filter(t => t.recId === cond.id).length, 4 + 13);
// pessoa com Pix: dívida "eu devo" cria a pessoa; com a chave, a parcela ganha botão Pix
await p.click('[data-v=loans]'); await p.click('[data-newloan=out]'); await p.fill('#l-person', 'Ana Exemplo'); await p.fill('#l-total', '300'); await p.fill('#l-n', '3'); await p.click('#l-save'); await wait(400);
s = await st(); const ana = s.people.find(x => x.name === 'Ana Exemplo'); assert(ana, 'pessoa criada'); assert.equal(s.loans[0].personId, ana.id);
await p.click(`[data-person="${ana.id}"]`); await p.fill('#pp-key', 'ana@exemplo.com'); assert.match(await p.textContent('#pp-kind'), /E-mail/); await p.click('#pp-ok'); await wait(300);
await p.click('[data-v=pend]'); await p.waitForSelector('[data-pix]'); await p.click('[data-pix]');
await p.click('#px-copy'); await wait(300);
const code = await p.evaluate(() => navigator.clipboard.readText());
assert.match(code, /^000201/); assert.match(code, /ana@exemplo\.com/); assert.match(code, /5406100\.00/); assert.match(code, /6304[0-9A-F]{4}$/);
await p.screenshot({ path: SHOTS + '/pix.png' });
await p.click('#px-paid'); await wait(300);
s = await st(); assert.equal(s.tx.filter(t => t.loanId && t.status === 'liq').length, 1);
await wait(1500); const d = drive.current(); assert.equal(d.rec.length, 3); assert.equal(d.people.length, 1);
console.log('erros:', errs.join('\n') || 'nenhum'); assert.equal(errs.length, 0);
await browser.close(); console.log('E2E fixas OK');
