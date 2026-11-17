/* Planilha de parcelamentos: lança como PREVISTAS as parcelas que ainda vão vir de compras parceladas no cartão.
   Serve para quem começa a usar o app com compras parceladas em andamento (ou importou faturas antes da versão 0.8).
   Cada linha diz: em que fatura (mês) está a parcela atual, a compra, qual parcela é e quantas são no total.
   O app cria as parcelas seguintes nas faturas dos meses seguintes, com o mesmo identificador que a importação
   da fatura usa; assim, quando a fatura real chega, a parcela real substitui a prevista, sem duplicar.

   Formato (CSV com ponto e vírgula, UTF-8):
   Formato;financas-parcelas;1
   Cartão;Fatura;Data da compra;Descrição;Parcela atual;Total de parcelas;Valor da parcela
   Cartão Exemplo;2026-11;2026-09-10;LOJA EXEMPLO;2;10;45,16
*/
import * as M from '../model.js';
import { makeClassifier } from './classify.js';

export const HEADER = 'Formato;financas-parcelas;1';
const COLS = ['Cartão', 'Fatura', 'Data da compra', 'Descrição', 'Parcela atual', 'Total de parcelas', 'Valor da parcela'];
const money = v => (Math.round(v * 100) / 100).toFixed(2).replace('.', ',');
const cell = s => /[;"\n]/.test(String(s)) ? '"' + String(s).replace(/"/g, '""') + '"' : String(s);

export const isParcelFile = text => String(text || '').replace(/^﻿/, '').trimStart().startsWith(HEADER);

export function toCsv(rows) {
  return '﻿' + [HEADER, COLS.join(';'), ...rows.map(r => [r.card, r.comp, r.date, r.desc, r.i, r.n, money(r.amount)].map(cell).join(';'))].join('\r\n') + '\r\n';
}

function splitLine(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true; else if (c === ';') { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur); return out.map(s => s.trim());
}

export function parse(text) {
  const lines = String(text).replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  if (!lines.length || !lines[0].startsWith(HEADER)) throw new Error('Esta não é uma planilha de parcelamentos do app.');
  const rows = [], errors = [];
  lines.slice(2).forEach((l, k) => {
    const [card, comp, date, desc, i, n, val] = splitLine(l);
    const r = { card, comp, date, desc, i: +i, n: +n, amount: Math.round(parseFloat(String(val).replace(/\./g, '').replace(',', '.')) * 100) / 100 };
    const ok = card && /^\d{4}-\d{2}$/.test(comp) && /^\d{4}-\d{2}-\d{2}$/.test(date) && desc && r.i >= 1 && r.n >= 2 && r.i <= r.n && r.n <= 99 && r.amount > 0;
    if (ok) rows.push(r); else errors.push(k + 3);
  });
  return { rows, errors };
}

/* quantas parcelas cada linha ainda lança: da (atual + 1) até o total, a partir da fatura `from` do cartão */
export function pending(r, from) {
  const out = [];
  for (let k = r.i + 1; k <= r.n; k++) { const comp = mAdd(r.comp, k - r.i); if (!from || comp >= from) out.push({ k, comp }); }
  return out;
}
function mAdd(m, n) { let [y, mo] = m.split('-').map(Number); mo += n; y += Math.floor((mo - 1) / 12); mo = ((mo - 1) % 12 + 12) % 12 + 1; return y + '-' + String(mo).padStart(2, '0'); }

/* aplica: map = { nome do cartão na planilha: id do cartão no app (ou '' para pular) }; from = { id do cartão: primeira fatura a lançar } */
export function apply(S, rows, map, from = {}) {
  let created = 0, skipped = 0;
  const used = {}, classify = makeClassifier(S);
  rows.forEach(r => {
    const cardId = map[r.card]; if (!cardId) return;
    // mesma regra da importação da fatura: compras iguais (mesma descrição, data e nº de parcelas) ganham sufixo pela ordem
    let key = M.parcKey(cardId, r.desc, r.date, r.n);
    used[key] = (used[key] || 0) + 1; if (used[key] > 1) key += '-' + used[key];
    // a parcela atual, se já estiver no app (importada antes), passa a fazer parte da compra parcelada
    const curTx = S.tx.find(t => t.accountId === cardId && t.type === 'cred' && !t.parcKey && t.date === r.date && Math.abs(t.amount - r.amount) < 0.005 && (t.comp || '') === r.comp);
    if (curTx) { Object.assign(curTx, { parcKey: key, parcI: r.i, parcN: r.n }); M.touch(curTx); }
    const itemId = curTx ? curTx.itemId : (classify({ desc: r.desc, title: r.desc, detail: '', dir: 'out' }).itemId || '');
    for (const { k, comp } of pending(r, from[cardId])) {
      const id = M.parcId(key, k);
      if (S.deleted[id] || S.tx.some(t => t.id === id)) { skipped++; continue; }
      const t = M.newTx({ type: 'cred', date: r.date, accountId: cardId, itemId, amount: r.amount, desc: `${r.desc} (${k}/${r.n})`, signed: true, origin: 'previsao' });
      Object.assign(t, { id, comp, prev: true, parcKey: key, parcI: k, parcN: r.n });
      S.tx.push(t); created++;
    }
  });
  return { created, skipped };
}
