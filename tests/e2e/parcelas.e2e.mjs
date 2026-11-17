/* Teste de navegador: planilha de parcelamentos (parcelas futuras como previstas). Dados fictícios. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createDrive, newDevice, setup, wait } from './harness.mjs';
const PP = await import('../../js/imp/parcelas.js');
const { chromium, devices } = await import(process.env.PLAYWRIGHT || 'playwright');
const BASE = process.env.BASE || 'http://localhost:8766/';
const SHOTS = process.env.SHOTS || '/tmp';
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const drive = createDrive();
const { page: p, errs } = await newDevice(browser, devices, BASE, drive, 'A');
await setup(p, {});
const file = '/tmp/parcelas-ficticias.csv';
fs.writeFileSync(file, PP.toCsv([
  { card: 'Cartão Exemplo', comp: '2026-11', date: '2026-09-10', desc: 'LOJA FICTICIA', i: 2, n: 6, amount: 45.16 },
  { card: 'Cartão Exemplo', comp: '2026-11', date: '2026-08-24', desc: 'OUTRA LOJA', i: 2, n: 2, amount: 10 },
  { card: 'Banco Inexistente', comp: '2026-11', date: '2026-05-09', desc: 'MOVEIS', i: 6, n: 21, amount: 250.21 }]));
await p.click('[data-tab=lanc]');
const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('#imp')]);
await fc.setFiles(file);
await p.waitForSelector('#pp-go');
assert.equal(await p.inputValue('[data-map="Cartão Exemplo"]') !== '', true, 'cartão reconhecido pelo nome');
assert.equal(await p.inputValue('[data-map="Banco Inexistente"]'), '', 'cartão desconhecido fica de fora até escolher');
assert.match(await p.textContent('#pp-go'), /Lançar 4 · R\$\s?180,64/);
await p.screenshot({ path: SHOTS + '/parcelas.png', fullPage: true });
await p.click('#pp-go'); await wait(500);
const s = await p.evaluate(async () => (await import('./js/sync.js')).state());
assert.equal(s.tx.filter(t => t.prev && t.parcKey).length, 4);
assert.match(await p.textContent('#page'), /LOJA FICTICIA/);
await wait(1500); assert.equal(drive.current().tx.filter(t => t.prev).length, 4);
console.log('erros:', errs.join('\n') || 'nenhum'); assert.equal(errs.length, 0);
await browser.close(); console.log('E2E parcelas OK');
