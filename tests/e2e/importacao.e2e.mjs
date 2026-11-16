/* Teste de navegador da importação, com documentos fictícios.
   Uso: (na pasta tests) npm install playwright pdfjs-dist && npx playwright install chromium && python3 fixtures/gerar.py
        servidor na raiz do app (ex.: python3 -m http.server 8766) e: node e2e/importacao.e2e.mjs */
import assert from 'node:assert/strict';
import { createDrive, newDevice, setup, wait } from './harness.mjs';
const pw = await import(process.env.PLAYWRIGHT || 'playwright');
const { chromium, devices } = pw;
const BASE = process.env.BASE || 'http://localhost:8766/';
const FX = new URL('../fixtures/', import.meta.url).pathname;
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const drive = createDrive();
const { page: p, errs } = await newDevice(browser, devices, BASE, drive, 'A');
await setup(p, { cpf: '123.456.789-00' });
// lançamento manual que deve virar duplicata
await p.click('#fab'); await p.click('[data-type=cred]'); await p.fill('#f-val', '39,90'); await p.fill('#f-date', '2026-02-12'); await p.selectOption('#f-item', { label: 'Assinaturas / Streaming' }); await p.fill('#f-desc', 'Netflix'); await p.click('#f-save'); await wait(400);
// fatura com senha: abre com os dígitos do CPF, sem perguntar
const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('#imp')]);
await fc.setFiles(FX + 'fatura-ficticia-senha.pdf');
await p.waitForSelector('#r-go', { timeout: 20000 });
console.log('conferência:', await p.textContent('.okbox, .warn'));
assert.match(await p.textContent('.okbox'), /confere/);
assert.equal(await p.inputValue('#r-comp'), '2026-03');
assert.match(await p.textContent('#r-filter [data-f=dup]'), /1/);
await p.screenshot({ path: process.env.SHOTS ? process.env.SHOTS + '/imp-fatura.png' : '/tmp/imp-fatura.png' });
// trocar categoria da loja de móveis
const mov = p.locator('li.irow', { hasText: 'LOJA DE MOVEIS' }).locator('select'); await mov.selectOption({ label: 'Manutenção da casa' });
console.log('botão:', await p.textContent('#r-go')); await p.click('#r-go'); await wait(1500);
let d = drive.current(); assert.equal(d.tx.filter(t => t.origin === 'import').length, 5); assert(Object.keys(d.rules).length > 0);
assert.equal(await p.textContent('.month b'), 'Março de 2026');
// extrato CSV: pagamento da fatura marca a fatura como paga
const [fc2] = await Promise.all([p.waitForEvent('filechooser'), p.click('#imp')]);
await fc2.setFiles(FX + 'extrato-ficticio.csv'); await p.waitForSelector('#r-go');
await p.click('#r-filter [data-f=ignored]'); await p.screenshot({ path: process.env.SHOTS ? process.env.SHOTS + '/imp-extrato.png' : '/tmp/imp-extrato.png' });
assert.match(await p.textContent('li.irow.cardpay'), /idêntico/);
await p.click('#r-go'); await wait(1500);
d = drive.current(); assert.equal(d.tx.filter(t => t.cardPay && t.faturaKey).length, 1, 'pagamento vinculado à fatura');
assert.equal(d.tx.filter(t => t.origin === 'import').length, 10);
const fst = await p.evaluate(async () => { const c = await import('./js/calc.js'); const s = (await import('./js/sync.js')).state(); return c.faturas(s).map(f => f.status); });
assert.deepEqual(fst, ['liq'], 'fatura paga pelo pagamento do extrato');
// importar o mesmo extrato de novo: nada novo
const [fc3] = await Promise.all([p.waitForEvent('filechooser'), p.click('#imp')]);
await fc3.setFiles(FX + 'extrato-ficticio.csv'); await p.waitForSelector('#r-go');
assert.equal(await p.isDisabled('#r-go'), true);
await p.click('#r-cancel');
// senha errada: pergunta e aceita a certa
await p.click('[data-tab=ajustes]'); await p.click('[data-act=cpf]'); await p.fill('#c-cpf', '999.999.999-99'); await p.click('#c-save'); await wait(300);
await p.click('[data-tab=lanc]');
const [fc4] = await Promise.all([p.waitForEvent('filechooser'), p.click('#imp')]);
await fc4.setFiles(FX + 'fatura-ficticia-senha.pdf'); await p.waitForSelector('#pw', { timeout: 20000 });
await p.fill('#pw', '1234'); await p.keyboard.press('Enter'); await p.waitForSelector('#r-go');
assert.match(await p.textContent('#r-filter [data-f=ignored]'), /5/, 'já importados');
await p.click('#r-cancel');
assert.equal(JSON.stringify(drive.current()).includes('1234'), false, 'senha digitada não é guardada');
console.log('erros:', errs.join('\n') || 'nenhum');
await browser.close(); console.log('E2E importação OK');
