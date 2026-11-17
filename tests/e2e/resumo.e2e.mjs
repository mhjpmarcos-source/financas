/* Teste de navegador: orçamento, relatório anual, exportação CSV e calendário. Uso igual ao de importacao.e2e.mjs. */
import assert from 'node:assert/strict';
import { createDrive, newDevice, setup, wait } from './harness.mjs';
const { chromium, devices } = await import(process.env.PLAYWRIGHT || 'playwright');
const BASE = process.env.BASE || 'http://localhost:8766/';
const SHOTS = process.env.SHOTS || '/tmp';
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const drive = createDrive();
const { page: p, ctx, errs } = await newDevice(browser, devices, BASE, drive, 'A');
await setup(p, {});
const today = await p.evaluate(async () => (await import('./js/model.js')).todayISO());
const m = today.slice(0, 7);
const prev = (k) => { const [y, mo] = m.split('-').map(Number); const d = new Date(y, mo - 1 - k, 10); return d.toISOString().slice(0, 10); };
// digitação de valor: centavos automáticos
await p.click('#fab'); await p.type('#f-val', '12345'); assert.equal(await p.inputValue('#f-val'), '123,45');
await p.press('#f-val', 'Backspace'); assert.equal(await p.inputValue('#f-val'), '12,34');
await p.fill('#f-val', ''); await p.type('#f-val', '123456789'); assert.equal(await p.inputValue('#f-val'), '1.234.567,89');
await p.fill('#f-val', '1.234,5'); assert.equal(await p.inputValue('#f-val'), '1.234,50', 'colar valor');
await p.click('#f-cancel'); await wait(200);
// gastos em mercado nos 3 meses anteriores (média 300) e neste mês
for (const [d, v] of [[prev(1), 200], [prev(2), 300], [prev(3), 400], [today, 350], [today, 100]]) {
  await p.click('[data-tab=lanc]'); await p.click('#fab'); await p.fill('#f-val', String(v)); await p.fill('#f-date', d); await p.selectOption('#f-item', { label: 'Mercado' }); await p.click('#f-save'); await wait(250);
}
await p.click('#fab'); await p.click('[data-type=rec]'); await p.fill('#f-val', '5000'); await p.fill('#f-date', today); await p.selectOption('#f-item', { label: 'Salário' }); await p.click('#f-save'); await wait(250);
// pendência futura (para o calendário)
await p.click('#fab'); await p.fill('#f-val', '120'); await p.fill('#f-date', today.slice(0, 8) + '28'); await p.selectOption('#f-item', { label: 'Energia' }); await p.check('#f-pend'); await p.click('#f-save'); await wait(250);
// orçamento: sugestão pela média
await p.click('[data-tab=resumo]'); await p.click('[data-rv=orc]'); await p.click('#b-sug'); await p.click('.sheet.ask [data-v="0"]'); await wait(400);
let st = await p.evaluate(async () => (await import('./js/sync.js')).state());
const merc = st.items.find(i => i.name === 'Mercado'); assert.equal(st.orc[merc.id].def, 300, 'média arredondada');
assert.match(await p.textContent(`li[data-bi="${merc.id}"]`), /passou/);
await p.screenshot({ path: SHOTS + '/rs-orc.png', fullPage: true });
// ajustar só este mês
await p.click(`li[data-bi="${merc.id}"]`); await p.fill('#o-val', '500'); await p.check('#o-only'); await p.click('#o-save'); await wait(300);
st = await p.evaluate(async () => (await import('./js/sync.js')).state()); assert.equal(st.orc[merc.id].months[m], 500); assert.equal(st.orc[merc.id].def, 300);
// ano
await p.click('[data-rv=ano]'); await wait(200); await p.screenshot({ path: SHOTS + '/rs-ano.png' });
const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#y-csv')]); const csv = await (await import('node:fs')).promises.readFile(await dl.path(), 'utf8');
assert.match(csv, /RESULTADO/); assert.match(csv, /Mercado/);
// exportar lançamentos
await p.click('[data-tab=ajustes]'); await p.selectOption('#exp-y', 'all');
const [dl2] = await Promise.all([p.waitForEvent('download'), p.click('[data-act=csv]')]); const csv2 = await (await import('node:fs')).promises.readFile(await dl2.path(), 'utf8');
assert.equal(csv2.trim().split('\r\n').length, 8, 'cabeçalho + 7 lançamentos'); assert.match(csv2, /-350,00/);
// calendário
await p.click('[data-tab=agenda]');
const [dl3] = await Promise.all([p.waitForEvent('download'), p.click('#ag-ics')]); const ics = await (await import('node:fs')).promises.readFile(await dl3.path(), 'utf8');
assert.match(ics, /BEGIN:VEVENT/); assert.match(ics, /Energia|Pagar/); assert.match(ics, /TRIGGER:-PT15H/);
await wait(1500); assert(drive.current().orc[merc.id], 'orçamento no Drive');
console.log('erros:', errs.join('\n') || 'nenhum'); await browser.close(); console.log('E2E resumo OK');
