/* Contracheque (holerite): leitura genérica do PDF, classificação das rubricas, piso previsto e lançamento.

   Leitura sem depender do modelo do empregador. Muitos contracheques não trazem os títulos "Vencimentos" e
   "Descontos" como texto, então a âncora é a conta: a linha de totais (bruto e descontos) seguida do líquido
   (bruto − descontos). A posição dos dois totais define as duas colunas, e cada rubrica vai para a mais próxima.
   No fim a leitura é conferida: soma das rubricas = totais impressos.

   Como entra no app:
   - a receita é o LÍQUIDO, na data de crédito (bate com o extrato do banco);
   - descontos que são gastos da pessoa (plano de saúde, sindicato, consignado) viram despesas PAGAS PELA FOLHA:
     aparecem nas categorias, sem conta nenhuma (o líquido já veio sem eles). No resumo do mês o mesmo valor
     entra como receita e como despesa, para o resultado continuar igual ao que passou pela conta;
   - o empréstimo consignado é uma DÍVIDA (coleção loans, folha: true): credor, parcela, total e término. Cada
     contracheque quita uma parcela e as seguintes ficam agendadas até o fim; não depende de conta bancária;
   - a previsão dos meses seguintes é o piso fixo (proventos fixos − descontos fixos − impostos de um mês sem
     eventuais), corrigido a cada contracheque. */
import * as M from '../model.js';

const r2 = v => Math.round((+v || 0) * 100) / 100;
const MONEY = /^-?\d{1,3}(\.\d{3})*,\d{2}-?$/;
const money = s => { const neg = /^-|-$/.test(s); const v = parseFloat(s.replace(/-/g, '').replace(/\./g, '').replace(',', '.')); return r2(neg ? -v : v); };
const nrm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const mAdd = (m, n) => { let [y, mo] = m.split('-').map(Number); mo += n; y += Math.floor((mo - 1) / 12); mo = ((mo - 1) % 12 + 12) % 12 + 1; return y + '-' + String(mo).padStart(2, '0'); };
const iso = s => { const m = String(s || '').match(/(\d{2})\/(\d{2})\/(\d{2,4})/); if (!m) return ''; const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[2]}-${m[1]}`; };
const lastDay = m => new Date(+m.slice(0, 4), +m.slice(5, 7), 0).getDate();
const MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/* ---------- leitura ---------- */
const KEYWORDS = /l[ií]quido|sal[aá]rio|inss|irrf|fgts|admiss|folha|vencimentos|proventos|holerite|contracheque|demonstrativo de pagamento/i;

/* linha de totais: dois valores (bruto, descontos) e, até 3 linhas abaixo, o líquido; ou os três na mesma linha */
function findTotals(L, start) {
  for (let i = start; i < L.length; i++) {
    const nums = L[i].cells.filter(c => MONEY.test(c.s));
    // linha só de números, ou com rótulo de total: uma rubrica comum (descrição + referência + valor) não serve de âncora
    if (nums.length !== L[i].cells.length && !/tota(l|is)|bruto|proventos|vencimentos|l[ií]quido/i.test(L[i].text)) continue;
    if (nums.length === 3) {
      const [a, b, c] = nums.map(x => money(x.s));
      if (a > 0 && b >= 0 && Math.abs(a - b - c) < 0.011) return { i, j: i, bruto: a, desc: b, liq: c, xv: nums[0].x2, xd: nums[1].x2, cv: (nums[0].x + nums[0].x2) / 2, cd: (nums[1].x + nums[1].x2) / 2 };
    }
    if (nums.length !== 2) continue;
    const b = money(nums[0].s), d = money(nums[1].s);
    if (!(b > 0) || d < 0 || d > b + 0.005) continue;
    for (let j = i + 1; j < Math.min(i + 4, L.length); j++) {
      for (const x of L[j].cells) if (MONEY.test(x.s) && Math.abs(money(x.s) - (b - d)) < 0.011) return { i, j, bruto: b, desc: d, liq: money(x.s), xv: nums[0].x2, xd: nums[1].x2, cv: (nums[0].x + nums[0].x2) / 2, cd: (nums[1].x + nums[1].x2) / 2 };
    }
  }
  return null;
}

function rubricRow(line, t) {
  const c = line.cells, nums = c.filter(x => MONEY.test(x.s));
  if (!nums.length || nums.length === c.length) return null; // sem valor, ou só números (linha de bases)
  const last = nums[nums.length - 1];
  let dv = Math.abs(last.x2 - t.xv), dd = Math.abs(last.x2 - t.xd);
  if (Math.min(dv, dd) > 8) { // valores não alinhados à direita: compara pelo centro
    const mid = (last.x + last.x2) / 2; dv = Math.abs(mid - t.cv); dd = Math.abs(mid - t.cd);
    if (Math.min(dv, dd) > 30) return null;
  }
  const text = c.filter(x => !MONEY.test(x.s));
  const code = text.length > 1 && /^\d{1,6}$/.test(text[0].s) ? text[0].s : '';
  const desc = text.slice(code ? 1 : 0).filter(x => x.x < last.x).map(x => x.s).join(' ').replace(/\s+/g, ' ').trim();
  if (!desc || !/[a-zA-ZÀ-ú]/.test(desc)) return null;
  const v = money(last.s); if (!(Math.abs(v) > 0)) return null;
  return { code, desc, ref: nums.length > 1 ? nums[nums.length - 2].s : '', col: dv < dd ? 'V' : 'D', v };
}

function headerInfo(L, t) {
  const text = L.slice(0, Math.min(L.length, t.j + 6)).map(l => l.text).join('\n');
  const out = { tipoLabel: '', de: '', ate: '', credito: '', banco: '', margem: null, faixa: null, empregador: '' };
  // empregador: primeiro trecho com letras no alto da página (sem CNPJ)
  for (const l of L.slice(0, 4)) { const c = l.cells.find(x => /[a-zA-ZÀ-ú]{3}/.test(x.s) && !/\d{2}\.\d{3}\.\d{3}\/\d{4}/.test(x.s)); if (c) { out.empregador = c.s.replace(/\s+/g, ' ').trim().slice(0, 60); break; } }
  // período: "de 01/10/26 a 31/10/26", ou referência/competência "10/2026" ou "outubro de 2026"
  for (const l of L.slice(0, t.i)) {
    const m = l.text.match(/(\d{2}\/\d{2}\/\d{2,4})\s*a\s*(\d{2}\/\d{2}\/\d{2,4})/);
    if (!m) continue;
    out.de = iso(m[1]); out.ate = iso(m[2]);
    const cell = l.cells.find(x => x.s.includes(m[1]));
    out.tipoLabel = ((cell ? cell.s : l.text).slice(0, (cell ? cell.s : l.text).indexOf(m[1])) || '').replace(/\s*d\s*e\s*$/i, '').replace(/^.*\d{2}\/\d{2}\/\d{2,4}\s*/, '').replace(/\s+/g, ' ').trim();
    break;
  }
  if (!out.ate) {
    const m = text.match(/(?:refer[eê]ncia|compet[eê]ncia|m[eê]s\s*\/\s*ano|per[ií]odo|folha)\D{0,14}(\d{2})\s*\/\s*(\d{4})/i);
    const n = !m && nrm(text).match(new RegExp('(' + MESES.join('|') + ')\\s*(?:de|/)\\s*(\\d{4})'));
    const ym = m ? `${m[2]}-${m[1]}` : n ? `${n[2]}-${String(MESES.indexOf(n[1]) + 1).padStart(2, '0')}` : '';
    if (ym && +ym.slice(5) >= 1 && +ym.slice(5) <= 12) { out.de = ym + '-01'; out.ate = ym + '-' + lastDay(ym); }
  }
  let m = text.match(/(?:data\s+d[eo]\s+cr[eé]dito|cr[eé]dito\s+em|data\s+(?:d[eo]\s+)?pagamento|pagamento\s+em|pago\s+em)\s*:?\s*(\d{2}\/\d{2}\/\d{2,4})/i);
  if (m) out.credito = iso(m[1]);
  m = text.match(/margem\s+consign[aá]vel\s*:?\s*([\d.]+,\d{2})/i); if (m) out.margem = money(m[1]);
  const bl = L.find(l => /\bag(?:[eê]ncia)?\.?\s*:/i.test(l.text));
  if (bl) out.banco = bl.cells[0].s.split(/\s+ag(?:[eê]ncia)?\.?\s*:/i)[0].replace(/[\s-]+$/, '').trim().slice(0, 40);
  // linha de bases (só números) depois do líquido: o último valor costuma ser a faixa do IR
  for (const l of L.slice(t.j + 1, t.j + 6)) {
    const c = l.cells;
    if (c.length >= 4 && c.every(x => MONEY.test(x.s))) { const f = money(c[c.length - 1].s); if ([7.5, 15, 22.5, 27.5].includes(f)) out.faixa = f; break; }
  }
  return out;
}

const TIPOS = { normal: 'Folha mensal', '13adt': 'Adiantamento do 13º', '13': '13º salário', ferias: 'Férias', adt: 'Adiantamento', resc: 'Rescisão', outro: 'Outra folha' };
export const tipoLabel = t => TIPOS[t] || TIPOS.outro;
function tipoOf(label, rubs) {
  const s = nrm(label), all13 = rubs.filter(r => r.col === 'V').every(r => /13|decimo/.test(nrm(r.desc)));
  if (/adiant|adto/.test(s)) return all13 || /13|decimo/.test(s) ? '13adt' : 'adt';
  if (/13|decimo/.test(s) || (all13 && rubs.length && !/normal|mensal/.test(s))) return rubs.some(r => /adto|adiant/.test(nrm(r.desc)) && r.col === 'V') ? '13adt' : '13';
  if (/ferias/.test(s)) return 'ferias';
  if (/rescis/.test(s)) return 'resc';
  return 'normal';
}

/* pages: saída de pdfLines. Devolve null quando o PDF não parece um contracheque. */
export function parseHolerite(pages) {
  const blocks = []; let head = null, first = null;
  const all = pages.map(L0 => L0.map(l => ({ ...l, cells: l.cells.map(c => ({ ...c, s: c.s.replace(/[\r\n]+/g, '').trim() })).filter(c => c.s) })).map(l => ({ ...l, text: l.cells.map(c => c.s).join('   ') })));
  const fullText = all.map(L => L.map(l => l.text).join('\n')).join('\n');
  if (!KEYWORDS.test(fullText)) return null;
  for (const L of all) {
    let start = 0;
    for (;;) {
      const t = findTotals(L, start); if (!t) break;
      const rows = L.slice(start, t.i).map(l => rubricRow(l, t)).filter(Boolean);
      if (!first) { first = t; head = headerInfo(L, t); }
      blocks.push(rows); start = t.j + 1;
    }
  }
  if (!first) return null;
  // cada página traz duas vias iguais, ou a folha 1 e a folha 2 (e a página seguinte repete): blocos idênticos contam uma vez
  const seen = new Set(), rubs = [];
  for (const b of blocks) { const k = JSON.stringify(b); if (!b.length || seen.has(k)) continue; seen.add(k); rubs.push(...b); }
  if (!rubs.length) return null;
  const somaV = r2(rubs.filter(r => r.col === 'V').reduce((s, r) => s + r.v, 0)), somaD = r2(rubs.filter(r => r.col === 'D').reduce((s, r) => s + r.v, 0));
  const ok = Math.abs(somaV - first.bruto) < 0.011 && Math.abs(somaD - first.desc) < 0.011;
  const kw = (fullText.match(new RegExp(KEYWORDS.source, 'gi')) || []).length;
  if (!ok && kw < 3) return null;
  const tipo = tipoOf(head.tipoLabel, rubs);
  if (!head.ate && head.credito) { const m = mAdd(head.credito.slice(0, 7), +head.credito.slice(8) <= 15 ? -1 : 0); head.de = m + '-01'; head.ate = m + '-' + lastDay(m); }
  return {
    kind: 'holerite', empregador: head.empregador || 'Empregador', tipo, tipoTexto: head.tipoLabel, de: head.de, ate: head.ate, credito: head.credito,
    banco: head.banco, margem: head.margem, faixa: head.faixa, bruto: first.bruto, desc: first.desc, liq: first.liq, rubs, somaV, somaD, ok,
    check: { ok, msg: ok ? `Leitura confere: as ${rubs.length} rubricas somam o bruto e os descontos impressos.` : `As rubricas lidas somam ${somaV.toFixed(2)} de proventos e ${somaD.toFixed(2)} de descontos, mas o contracheque informa ${first.bruto.toFixed(2)} e ${first.desc.toFixed(2)}. Confira antes de aplicar.` }
  };
}

/* ---------- classificação das rubricas ---------- */
const TAX = /\binss\b|\birrf?\b|imposto de renda|previdencia social|\bir\b/;
const EVENTUAL = /ferias|\b13\b|13o|decimo|abono|\bdif\b|\bdif\.|diferenca|extra|banco de? ?horas|retroativ|media|\badto\b|adiant|substitui|dobrado|noturn|repouso|premio|\bplr\b|rescis|bonus|aviso previo|indeniz/;
const FIXED = /dias normais|salario|vencimento|ordenado|gratifica|auxilio|\bvale\b|adicional|emprestimo|consign|sind|assist|\bass\.? med|plano|pensao|previd|seguro|mensalidade|odont|anuenio|quinquenio/;
const LOAN = /emprestimo|consign|financiamento/;
const NO_TAX_BASE = /auxilio|reembolso|indeniz|\bvale\b|ajuda de custo/;
export const rubKey = r => r.code ? 'c' + r.code : 'd' + M.normDesc(r.desc);

/* parcela do consignado na coluna de referência: "17,36" = 17 de 36; ",00" = total não informado */
export function parcOf(r) {
  if (r.col !== 'D' || !LOAN.test(nrm(r.desc))) return null;
  const m = String(r.ref || '').match(/^(\d{1,3}),(\d{2})$/); if (!m) return null;
  const i = +m[1], n = +m[2]; if (!i) return null;
  return { i, n: n >= i ? n : 0 };
}

/* a dívida consignada guarda uma âncora (i0 = número da parcela no mês asOf; n = total, 0 se não informado) e a contagem anda
   um número por mês. A âncora vem do contracheque mais recente ou da correção feita à mão (manual: true). */
const monthsBetween = (a, b) => (+b.slice(0, 4) * 12 + +b.slice(5, 7)) - (+a.slice(0, 4) * 12 + +a.slice(5, 7));
export const loanIdOf = (jobId, key) => 'l_' + M.hashStr(jobId + '|' + key);
export function loanParcAt(loan, month) {
  if (!loan || !loan.i0 || !loan.asOf || !month) return null;
  const i = loan.i0 + monthsBetween(loan.asOf, month);
  return i >= 1 && (!loan.n || i <= loan.n) ? { i, n: loan.n || 0, manual: !!loan.manual } : null;
}
/* parcela de uma rubrica de empréstimo num mês: pela dívida, se ela já existe; senão, pelo que o contracheque traz */
export function loanParcOf(S, jobId, r, month) {
  const loan = (S.loans || []).find(l => l.id === loanIdOf(jobId, rubKey(r)));
  return (loan && loan.i0 ? loanParcAt(loan, month) : null) || parcOf(r);
}
const folhaId = (jobId, key, m) => `t_f_${M.hashStr(jobId + '|' + key)}_${m.replace('-', '')}`;
const parcText = p => p ? ` (${p.i}${p.n ? '/' + p.n : ''})` : '';

/* categoria sugerida para um desconto que é gasto da pessoa; '' = não contar como despesa */
function suggestExp(S, r) {
  const d = nrm(r.desc);
  const find = name => { const it = S.items.find(i => nrm(i.name) === nrm(name) && i.active !== false && (S.groups.find(g => g.id === i.groupId) || {}).kind === 'despesa'); return it ? it.id : ''; };
  if (LOAN.test(d)) return find('Parcela de empréstimo');
  if (/assist|\bass\.? med|plano|saude|odont|unimed|medic/.test(d)) return find('Plano de saúde');
  if (/sind|associa|conselho|anuidade/.test(d)) return find('Taxas e anuidades profissionais');
  if (/previd.*(priv|compl)|funp/.test(d)) return find('Previdência privada');
  if (/pensao/.test(d)) return find('Outras despesas');
  if (/vale.?transp|\bvt\b/.test(d)) return find('Transporte público');
  return '';
}

/* fix (todo mês), ev (eventual) ou tax (imposto); usa o que a pessoa já escolheu, depois o dicionário, depois a frequência */
export function classifyRub(S, job, r, hist) {
  const key = rubKey(r), saved = job && job.rubs && job.rubs[key];
  if (saved) return { key, kind: saved.kind, exp: saved.exp || '', how: 'escolha anterior' };
  const d = nrm(r.desc);
  let kind, how = 'nome';
  if (r.col === 'D' && TAX.test(d) && !EVENTUAL.test(d.replace(/\binss\b|\birrf?\b/g, ''))) kind = 'tax';
  else if (r.col === 'D' && TAX.test(d)) kind = 'evtax'; // imposto sobre eventual (férias, 13º): eventual
  else if (EVENTUAL.test(d)) kind = 'ev';
  else if (FIXED.test(d)) kind = 'fix';
  else {
    how = 'frequência';
    const last = (hist || []).slice(-4), freq = last.filter(h => h.rubs.some(x => rubKey(x) === key)).length;
    kind = last.length < 3 || freq >= 3 ? 'fix' : 'ev';
  }
  if (kind === 'evtax') kind = 'ev';
  return { key, kind, exp: r.col === 'D' && kind === 'fix' ? suggestExp(S, r) : '', how };
}

/* ---------- fontes de renda e contracheques guardados ---------- */
export const jobIdOf = name => 'j_' + M.hashStr(M.normDesc(name));
export const slipIdOf = (jobId, h) => 'sl_' + M.hashStr([jobId, h.tipo, h.de, h.ate].join('|'));
export const slipsOf = (S, jobId) => (S.slips || []).filter(s => s.jobId === jobId).sort((a, b) => (a.ate + a.tipo < b.ate + b.tipo ? -1 : 1));
const normalSlips = (S, jobId) => slipsOf(S, jobId).filter(s => s.tipo === 'normal');
export const slipMonth = s => (s.ate || s.credito || '').slice(0, 7);

/* mês cheio (sem férias nem dias a menos) e mês limpo (cheio e quase sem eventuais) */
function slipFlags(slip) {
  const dias = slip.rubs.find(r => r.col === 'V' && /dias normais|dias trabalhados|salario base|^salario$/.test(nrm(r.desc)));
  const ref = dias ? parseFloat(String(dias.ref || '').replace(/\./g, '').replace(',', '.')) : NaN;
  const full = !(ref > 0 && ref < 28) && !slip.rubs.some(r => /ferias/.test(nrm(r.desc)));
  const evV = slip.rubs.filter(r => r.col === 'V' && r.kind === 'ev').reduce((s, r) => s + r.v, 0);
  return { full, clean: full && evV <= 0.02 * slip.bruto, evV: r2(evV), evD: r2(slip.rubs.filter(r => r.col === 'D' && r.kind === 'ev').reduce((s, r) => s + r.v, 0)) };
}

/* piso fixo previsto a partir de uma lista de contracheques mensais (já com kind em cada rubrica), em ordem.
   proventos fixos: do último mês cheio; descontos fixos: do último; impostos: do último mês limpo
   (ajustados pela faixa do IR quando os proventos fixos tributáveis mudaram desde então). */
export function pisoOf(list) {
  if (!list.length) return null;
  const F = list.map(slipFlags), L = list.length - 1;
  let Si = L; while (Si > 0 && !F[Si].full) Si--; if (!F[Si].full) Si = L;
  let Ci = L; while (Ci > 0 && !F[Ci].clean) Ci--; const hasClean = F[Ci].clean; if (!hasClean) Ci = L;
  const sum = (slip, f) => r2(slip.rubs.filter(f).reduce((s, r) => s + r.v, 0));
  // num mês com eventuais (ex.: substituição), uma rubrica fixa pode vir reduzida: vale o maior entre ele e o último mês limpo
  const cleanV = new Map(list[Ci].rubs.filter(r => r.col === 'V' && r.kind === 'fix').map(r => [rubKey(r), r.v]));
  const baseV = list[Si].rubs.filter(r => r.col === 'V' && r.kind === 'fix').map(r => ({ ...r, v: hasClean && !F[Si].clean ? Math.max(r.v, cleanV.get(rubKey(r)) || 0) : r.v }));
  const fixV = r2(baseV.reduce((s, r) => s + r.v, 0)), fixD = sum(list[L], r => r.col === 'D' && r.kind === 'fix');
  let tax = sum(list[Ci], r => r.col === 'D' && r.kind === 'tax');
  const taxable = rubs => r2(rubs.filter(r => r.col === 'V' && r.kind === 'fix' && !NO_TAX_BASE.test(nrm(r.desc))).reduce((s, r) => s + r.v, 0));
  const faixa = list[Ci].faixa || 0;
  if (hasClean && Si !== Ci && faixa) tax = r2(tax + faixa / 100 * (taxable(baseV) - taxable(list[Ci].rubs)));
  const folha = sum(list[L], r => r.col === 'D' && r.kind === 'fix' && r.exp);
  return { piso: r2(Math.max(0, fixV - fixD - tax)), fixV, fixD, tax, folha, exact: hasClean, fromV: slipMonth(list[Si]), fromTax: slipMonth(list[Ci]), fromD: slipMonth(list[L]) };
}

/* o que mudou no fixo deste contracheque mensal em relação aos anteriores (lista em ordem, o atual por último).
   Proventos fixos: contra o último mês cheio; impostos: contra o último mês limpo (senão a diferença é efeito de eventual);
   descontos fixos: contra o mês anterior. Os eventuais do mês vão à parte. */
export function slipDiff(before, cur) {
  const out = { changes: [], eventuais: cur.rubs.filter(r => r.kind === 'ev').map(r => ({ desc: r.desc, col: r.col, v: r.v })) };
  const prev = before[before.length - 1]; if (!prev) return out;
  const fc = slipFlags(cur);
  const lastWhere = f => { for (let i = before.length - 1; i >= 0; i--) if (f(slipFlags(before[i]))) return before[i]; return null; };
  const ref = r => r.col === 'V' ? (fc.full ? lastWhere(x => x.full) : null) : r.kind === 'tax' ? (fc.clean ? lastWhere(x => x.clean) : null) : prev;
  const has = (slip, r) => slip.rubs.find(x => rubKey(x) === rubKey(r));
  cur.rubs.filter(r => r.kind !== 'ev').forEach(r => {
    const base = ref(r); if (!base) { if (!before.some(s => has(s, r))) out.changes.push({ what: 'novo', desc: r.desc, col: r.col, v: r.v }); return; }
    const p = has(base, r);
    if (!p) { if (!has(prev, r)) out.changes.push({ what: 'novo', desc: r.desc, col: r.col, v: r.v }); }
    else if (Math.abs(p.v - r.v) > 1) out.changes.push({ what: 'valor', desc: r.desc, col: r.col, v: r.v, from: p.v });
  });
  prev.rubs.filter(r => r.kind !== 'ev' && !has(cur, r) && (r.col === 'D' && r.kind !== 'tax' ? true : fc.full)).forEach(r => out.changes.push({ what: 'saiu', desc: r.desc, col: r.col, v: r.v }));
  return out;
}

/* situação de uma dívida consignada: parcela atual (no último mês com contracheque), quanto falta e quando termina */
export function loanInfo(S, loan) {
  const real = S.tx.filter(t => t.loanId === loan.id && !t.prev).sort((a, b) => (a.folhaM < b.folhaM ? -1 : 1));
  const asOf = real.length ? real[real.length - 1].folhaM : loan.asOf || '';
  const p = loanParcAt(loan, asOf), left = loan.end ? 0 : p && p.n ? p.n - p.i : null;
  return { id: loan.id, key: loan.rk, jobId: loan.jobId, desc: loan.person, v: loan.parcel || 0, i: p ? p.i : null, n: p && p.n ? p.n : null, left, asOf,
    end: loan.end || (left != null ? mAdd(asOf, left) : ''), ended: !!loan.end || left === 0, rest: left != null ? r2(left * (loan.parcel || 0)) : null,
    manual: !!loan.manual, paidN: real.length, paid: r2(real.reduce((s, t) => s + t.amount, 0)) };
}
export const loansOf = (S, jobId) => (S.loans || []).filter(l => l.folha && (!jobId || l.jobId === jobId)).map(l => loanInfo(S, l)).sort((a, b) => a.ended - b.ended);
/* outros descontos fixos pagos pela folha (plano de saúde, sindicato…), pelo último contracheque mensal */
export function folhaFixed(S, jobId) {
  const last = normalSlips(S, jobId).pop(); if (!last) return [];
  return last.rubs.filter(r => r.col === 'D' && r.kind === 'fix' && r.exp && !LOAN.test(nrm(r.desc))).map(r => ({ desc: r.desc, v: r.v, itemId: r.exp }));
}

/* depois de aplicar contracheques: atualiza as dívidas consignadas pelo último contracheque mensal e agenda os descontos
   em folha dos meses seguintes (consignado: até a última parcela; os demais: 12 meses), como previstos. */
function syncFolha(S, job, edits, today) {
  if (!S.loans) S.loans = [];
  const normals = normalSlips(S, job.id), last = normals[normals.length - 1];
  if (!last) { S.tx.filter(t => t.folha && t.jobId === job.id && t.prev).map(t => t.id).forEach(id => M.removeRecord(S, 'tx', id)); return; }
  const lm = slipMonth(last), day = Math.min(28, Math.max(1, +last.credito.slice(8, 10)));
  const mk = (key, r) => { let l = S.loans.find(x => x.id === loanIdOf(job.id, key)); if (!l) { l = { id: loanIdOf(job.id, key), dir: 'out', folha: true, jobId: job.id, rk: key, person: r ? r.desc : '', desc: 'Consignado', accountId: '', itemId: '', total: 0, n: 0, created: Date.now(), upd: 0 }; S.loans.push(l); } return l; };
  // correções feitas na revisão
  edits.forEach(e => { const l = mk(e.key, e); if (e.pi > 0) Object.assign(l, { i0: e.pi, n: e.pn || 0, asOf: e.pm, manual: true }); else delete l.manual; revive(S, l); });
  const active = new Map();
  last.rubs.filter(r => r.col === 'D' && r.kind === 'fix' && LOAN.test(nrm(r.desc))).forEach(r => {
    const key = rubKey(r), l = mk(key, r), p = parcOf(r);
    if (l.closed && l.closed >= lm) { l.end = l.end || lm; return; } // a pessoa marcou como quitado; um contracheque mais novo com a rubrica reabre
    delete l.closed;
    if (!l.manual && p) Object.assign(l, { i0: p.i, asOf: lm, n: p.n || l.n || 0 });
    Object.assign(l, { person: r.desc, parcel: r.v, itemId: r.exp || l.itemId || '' }); delete l.end;
    revive(S, l); active.set(key, l);
  });
  // consignado que não veio no último contracheque: encerrado no último mês em que apareceu
  S.loans.filter(l => l.folha && l.jobId === job.id && !active.has(l.rk) && !l.end).forEach(l => {
    const seen = normals.filter(x => x.rubs.some(r => rubKey(r) === l.rk)).pop();
    l.end = seen ? slipMonth(seen) : lm; revive(S, l);
  });
  // agenda dos meses seguintes
  const want = new Map();
  last.rubs.filter(r => r.col === 'D' && r.kind === 'fix' && r.exp).forEach(r => {
    const key = rubKey(r), l = active.get(key), p = l && loanParcAt(l, lm);
    if (!l && LOAN.test(nrm(r.desc))) return; // consignado que a pessoa encerrou
    const count = l ? (p && p.n ? Math.min(120, p.n - p.i) : 12) : 12;
    for (let k = 1; k <= count; k++) { const m = mAdd(lm, k); want.set(folhaId(job.id, key, m), { r, key, m, l }); }
  });
  want.forEach((w, id) => {
    let d = S.tx.find(t => t.id === id);
    if (d && !d.prev) return; // já tem o desconto real desse mês
    if (!d) { d = M.newTx({ type: 'deb', date: today, accountId: '', itemId: w.r.exp, amount: w.r.v, desc: w.r.desc, status: 'pend', origin: 'previsao' }); d.id = id; S.tx.push(d); }
    const cm = mAdd(w.m, 1), date = cm + '-' + String(Math.min(day, lastDay(cm))).padStart(2, '0');
    const f = { date, accountId: '', itemId: w.r.exp, amount: w.r.v, status: 'pend', prev: true, folha: true, folhaItem: job.itemId, jobId: job.id, rk: w.key, folhaM: w.m };
    if (Object.keys(f).some(k => d[k] !== f[k]) || (w.l ? d.loanId !== w.l.id : d.loanId)) { Object.assign(d, f); if (w.l) d.loanId = w.l.id; else delete d.loanId; revive(S, d); }
  });
  S.tx.filter(t => t.folha && t.jobId === job.id && t.prev && !want.has(t.id)).map(t => t.id).forEach(id => M.removeRecord(S, 'tx', id));
  relabelLoans(S, job.id);
}
/* descrição das parcelas com o número (17/36), pela âncora da dívida */
function relabelLoans(S, jobId) {
  let c = 0;
  (S.loans || []).filter(l => l.folha && l.jobId === jobId).forEach(l => S.tx.filter(t => t.loanId === l.id).forEach(t => {
    const p = loanParcAt(l, t.folhaM), desc = l.person + parcText(p);
    if (t.desc !== desc) { t.desc = desc; M.touch(t); c++; }
  }));
  return c;
}
/* quando um consignado termina, o líquido previsto dos meses seguintes sobe o valor da parcela.
   Devolve quantos meses previstos mudaram (dry = só conta). */
export function adjustForecast(S, dry = false) {
  let c = 0;
  (S.jobs || []).forEach(job => {
    const rule = job.recId && (S.rec || []).find(r => r.id === job.recId); if (!rule) return;
    const ends = (S.loans || []).filter(l => l.folha && l.jobId === job.id && l.parcel && (l.closed || (!l.end && l.n && l.i0))).map(l => ({ m: l.closed || mAdd(l.asOf, l.n - l.i0), v: l.parcel }));
    S.tx.filter(t => t.recId === rule.id && t.prev).forEach(t => {
      const comp = mAdd(t.recM, -1), amt = r2(rule.amount + ends.filter(e => e.m < comp).reduce((s, e) => s + e.v, 0));
      if (Math.abs(t.amount - amt) > 0.004) { c++; if (!dry) { t.amount = amt; M.touch(t); } }
    });
  });
  return c;
}

/* ---------- plano de importação (um ou vários contracheques do mesmo empregador) ---------- */
export function guessAccount(S, banco) {
  const list = S.accounts.filter(a => a.nature === 'debito' && a.active !== false && !a.inv);
  if (!banco) return '';
  const b = nrm(banco), first = b.split(' ').filter(w => w.length > 2 && !/^banco$/.test(w))[0] || b;
  const sig = b.split(' ').filter(w => w.length > 2 && !/^(de|do|da)$/.test(w)).map(w => w[0]).join(''); // "banco do brasil" → "bb"
  const hit = list.find(a => nrm(a.name).includes(first)) || list.find(a => new RegExp('\\b' + sig + '\\b').test(nrm(a.name))) || (/\bbrasil\b/.test(b) && list.find(a => /\bbb\b|ourocard/.test(nrm(a.name))));
  return hit ? hit.id : '';
}
const incomeItem = (S, tipo) => {
  const want = tipo === '13' || tipo === '13adt' ? '13º salário' : tipo === 'ferias' ? 'Férias' : 'Salário';
  const rec = S.items.filter(i => i.active !== false && (S.groups.find(g => g.id === i.groupId) || {}).kind === 'receita');
  return (rec.find(i => nrm(i.name) === nrm(want)) || rec.find(i => nrm(i.name) === 'salario') || rec[0] || {}).id || '';
};

export function buildSlipPlan(S, parsedList) {
  const emp = parsedList[0].empregador, jobId = jobIdOf(emp);
  const job = (S.jobs || []).find(j => j.id === jobId) || null;
  const stored = slipsOf(S, jobId);
  const docs = parsedList.filter(h => h.empregador === emp).slice().sort((a, b) => (a.ate + a.tipo < b.ate + b.tipo ? -1 : 1));
  const other = parsedList.length - docs.length;
  const banks = {};
  const slips = [];
  docs.forEach(h => {
    const id = slipIdOf(jobId, h);
    if (slips.some(s => s.id === id)) return; // o mesmo contracheque escolhido duas vezes
    const old = stored.find(s => s.id === id);
    const credito = h.credito || (old && old.credito) || (h.ate ? mAdd(h.ate.slice(0, 7), 1) + '-05' : M.todayISO());
    if (!(h.banco in banks)) banks[h.banco] = (old && old.accountId) || guessAccount(S, h.banco) || (job && job.accountId) || '';
    slips.push({ id, h, credito, already: !!old, post: !old || !!old.txId, banco: h.banco });
  });
  // rubricas de todos os documentos, com a classificação (a mesma rubrica tem a mesma classificação em todos)
  const rubs = new Map(), hist = stored.filter(s => s.tipo === 'normal');
  const seq = [...hist, ...slips.filter(s => s.h.tipo === 'normal' && !s.already).map(s => s.h)];
  slips.forEach(s => s.h.rubs.forEach(r => {
    const key = rubKey(r);
    if (!rubs.has(key)) { const c = classifyRub(S, job, r, seq); rubs.set(key, { key, desc: r.desc, col: r.col, kind: c.kind, exp: c.exp, how: c.how, n: 0, last: 0, loan: !!parcOf(r) || LOAN.test(nrm(r.desc)) }); }
    const x = rubs.get(key); x.n++; x.last = r.v; x.desc = r.desc;
    if (x.loan && s.h.tipo === 'normal') { const p = loanParcOf(S, jobId, r, slipMonth(s.h)), raw = parcOf(r); x.pi = p ? p.i : 0; x.pn = p ? p.n : 0; x.pm = slipMonth(s.h); x.rawI = raw ? raw.i : 0; x.manual = !!(p && p.manual); }
  }));
  return { jobId, job, empregador: emp, slips, rubs: [...rubs.values()], banks, forecast: true, ruleId: (job && job.recId) || '', other, incomeItem: (job && job.itemId) || incomeItem(S, 'normal') };
}

/* contracheques mensais como ficarão depois de aplicar o plano (guardados + novos), com kind/exp do plano */
export function planSlips(S, plan) {
  const kinds = new Map(plan.rubs.map(r => [r.key, r]));
  const tag = rubs => rubs.map(r => { const k = kinds.get(rubKey(r)); return k ? { ...r, kind: k.kind, exp: k.exp } : r; });
  const map = new Map(slipsOf(S, plan.jobId).map(s => [s.id, { ...s, rubs: tag(s.rubs) }]));
  plan.slips.forEach(s => map.set(s.id, { id: s.id, jobId: plan.jobId, tipo: s.h.tipo, de: s.h.de, ate: s.h.ate, credito: s.credito, bruto: s.h.bruto, desc: s.h.desc, liq: s.h.liq, faixa: s.h.faixa, margem: s.h.margem, banco: s.h.banco, rubs: tag(s.h.rubs) }));
  return [...map.values()].sort((a, b) => (a.ate + a.tipo < b.ate + b.tipo ? -1 : 1));
}
export function planPiso(S, plan) { return pisoOf(planSlips(S, plan).filter(s => s.tipo === 'normal')); }
export function planDiff(S, plan) {
  const all = planSlips(S, plan).filter(s => s.tipo === 'normal');
  const news = plan.slips.filter(s => s.h.tipo === 'normal'); if (!news.length) return null;
  const cur = all.find(s => s.id === news[news.length - 1].id), i = all.indexOf(cur);
  return { cur, prev: i > 0 ? all[i - 1] : null, ...slipDiff(all.slice(0, i), cur) };
}

/* registro com id fixo que já foi excluído antes: a nova gravação precisa ser mais recente que a marca de exclusão */
const revive = (S, r) => { M.touch(r); if (S.deleted[r.id] >= r.upd) r.upd = S.deleted[r.id] + 1; return r; };
const shortM = m => ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][+m.slice(5, 7) - 1] + '/' + m.slice(2, 4);
const days = (a, b) => Math.abs(Math.round((Date.parse(a + 'T12:00') - Date.parse(b + 'T12:00')) / 864e5));

/* aplica: guarda os contracheques, lança o líquido e os descontos em folha e atualiza a previsão */
export function applySlipPlan(S, plan, today = M.todayISO()) {
  if (!S.jobs) S.jobs = []; if (!S.slips) S.slips = [];
  const res = { slips: 0, created: 0, updated: 0, folha: 0, piso: null };
  let job = S.jobs.find(j => j.id === plan.jobId);
  if (!job) { job = { id: plan.jobId, name: plan.empregador, accountId: '', itemId: plan.incomeItem, recId: '', rubs: {}, upd: 0 }; S.jobs.push(job); }
  plan.rubs.forEach(r => { job.rubs[r.key] = { desc: r.desc, col: r.col, kind: r.kind, exp: r.col === 'D' && r.kind === 'fix' ? (r.exp || '') : '' }; });
  job.itemId = plan.incomeItem || job.itemId;
  const edits = plan.rubs.filter(r => r.pedit && r.pm).map(r => ({ key: r.key, desc: r.desc, pi: Math.max(0, +r.pi || 0), pn: Math.max(0, +r.pn || 0), pm: r.pm }));
  const kinds = new Map(plan.rubs.map(r => [r.key, r]));
  const name = job.name;
  // dois contracheques creditados no mesmo dia (ex.: salário + adiantamento do 13º) podem ter vindo do extrato como um crédito só:
  // o primeiro assume esse lançamento (com o seu líquido) e o outro cria o dele; o total não muda e nada duplica
  const combo = new Map(), groups = {};
  plan.slips.forEach(s => { const acc = plan.banks[s.banco] || ''; if (s.post && acc && s.h.liq > 0 && !(S.slips.find(x => x.id === s.id) || {}).txId) (groups[acc + '|' + s.credito] = groups[acc + '|' + s.credito] || []).push(s); });
  Object.entries(groups).forEach(([k, g]) => {
    if (g.length < 2) return;
    const [acc, date] = k.split('|'), free = t => t.type === 'rec' && !t.slipId && !t.prev && !t.recId && t.accountId === acc && days(t.date, date) <= 4;
    if (g.some(s => S.tx.some(t => free(t) && Math.abs(t.amount - s.h.liq) < 0.005))) return;
    const sum = r2(g.reduce((x, s) => x + s.h.liq, 0)), hit = S.tx.find(t => free(t) && Math.abs(t.amount - sum) < 0.005);
    if (hit) combo.set(g[0].id, hit);
  });
  S.slips.filter(x => x.jobId === job.id).forEach(x => { // a reclassificação vale também para os contracheques já guardados
    let ch = false;
    x.rubs.forEach(r => { const k = kinds.get(rubKey(r)); if (k && r.kind !== k.kind) { r.kind = k.kind; ch = true; } });
    if (ch) M.touch(x);
  });
  for (const s of plan.slips) {
    const h = s.h, accountId = plan.banks[s.banco] || '', post = s.post && !!accountId && h.liq > 0;
    const rubs = h.rubs.map(r => { const k = kinds.get(rubKey(r)) || {}; return { code: r.code, desc: r.desc, ref: r.ref, col: r.col, v: r.v, kind: k.kind || 'ev', exp: r.col === 'D' && k.kind === 'fix' ? (k.exp || '') : '' }; });
    let slip = S.slips.find(x => x.id === s.id);
    if (!slip) { slip = { id: s.id, jobId: job.id }; S.slips.push(slip); }
    Object.assign(slip, { tipo: h.tipo, de: h.de, ate: h.ate, credito: s.credito, bruto: h.bruto, desc: h.desc, liq: h.liq, faixa: h.faixa || null, margem: h.margem ?? null, banco: h.banco || '', accountId, rubs });
    res.slips++;
    const m = slipMonth(slip), label = `${h.tipo === 'normal' ? 'Salário' : tipoLabel(h.tipo)} ${name} · ${shortM(m)}`;
    const cm = s.credito.slice(0, 7);
    let tx = slip.txId ? S.tx.find(t => t.id === slip.txId) : null;
    const itemId = h.tipo === 'normal' ? job.itemId : incomeItem(S, h.tipo);
    // descontos pagos pela folha contados como despesa: sem conta, não dependem de o líquido ser lançado
    const keep = new Set();
    rubs.filter(r => r.col === 'D' && r.exp).forEach(r => {
      const key = rubKey(r); let id = folhaId(job.id, key, m);
      const cur = S.tx.find(t => t.id === id); if (cur && cur.slipId && cur.slipId !== slip.id) id += '_' + slip.id.slice(3); // mesma rubrica em duas folhas do mês
      keep.add(id);
      let d = S.tx.find(t => t.id === id);
      if (!d) { d = M.newTx({ type: 'deb', date: s.credito, accountId: '', itemId: r.exp, amount: r.v, desc: r.desc, status: 'liq', origin: 'import' }); d.id = id; S.tx.push(d); }
      Object.assign(d, { date: s.credito, accountId: '', itemId: r.exp, amount: r.v, desc: r.desc, status: 'liq', origin: 'import', folha: true, folhaItem: itemId, slipId: slip.id, jobId: job.id, rk: key, folhaM: m });
      if (LOAN.test(nrm(r.desc))) d.loanId = loanIdOf(job.id, key); else delete d.loanId;
      delete d.prev; revive(S, d); res.folha++;
    });
    S.tx.filter(t => t.slipId === slip.id && t.folha && !keep.has(t.id)).map(t => t.id).forEach(id => M.removeRecord(S, 'tx', id));
    if (!post) { // líquido sem conta no app: só o contracheque e os descontos em folha ficam registrados
      S.tx.filter(t => t.slipId === slip.id && !t.folha).forEach(t => { if (t.impKey) { delete t.slipId; delete t.jobId; M.touch(t); } else M.removeRecord(S, 'tx', t.id); });
      delete slip.txId; revive(S, slip); continue;
    }
    const rule = job.recId && (S.rec || []).find(r => r.id === job.recId);
    if (!tx && h.tipo === 'normal' && rule) tx = S.tx.find(t => t.recId === rule.id && t.recM === cm && !t.slipId) || null; // mês da regra do piso (previsto ou confirmado à mão)
    if (!tx) { // já veio do extrato ou foi lançado à mão: mesmo valor, mesma conta, data próxima
      const hit = combo.get(s.id) || S.tx.filter(t => t.type === 'rec' && !t.slipId && !t.prev && t.accountId === accountId && Math.abs(t.amount - h.liq) < 0.005 && days(t.date, s.credito) <= 4).sort((a, b) => days(a.date, s.credito) - days(b.date, s.credito))[0];
      if (hit) {
        tx = hit;
        if (h.tipo === 'normal' && rule) { const pv = S.tx.find(t => t.recId === rule.id && t.recM === cm && t.prev); if (pv) M.removeRecord(S, 'tx', pv.id); if (!tx.recId) { tx.recId = rule.id; tx.recM = cm; } }
      }
    }
    if (tx) { res.updated++; if (!tx.impKey) { tx.date = s.credito; tx.desc = label; } }
    else { tx = M.newTx({ type: 'rec', date: s.credito, accountId, itemId, amount: h.liq, desc: label, status: 'liq', origin: 'import' }); tx.id = 't_' + slip.id; if (S.tx.some(t => t.id === tx.id)) tx.id = M.uid('t'); S.tx.push(tx); res.created++; }
    Object.assign(tx, { amount: h.liq, accountId, status: 'liq', slipId: slip.id, jobId: job.id }); if (!tx.itemId) tx.itemId = itemId;
    delete tx.prev; revive(S, tx);
    slip.txId = tx.id;
    revive(S, slip);
  }
  // previsão: piso a partir do mês seguinte ao crédito do último contracheque mensal
  const normals = normalSlips(S, job.id), last = normals[normals.length - 1];
  const P = pisoOf(normals); res.piso = P;
  if (last && last.accountId) job.accountId = last.accountId;
  if (plan.forecast && P && P.piso > 0 && last && last.accountId) {
    const cm = last.credito.slice(0, 7), day = Math.min(28, Math.max(1, +last.credito.slice(8, 10)));
    // a previsão começa no mês do último crédito, ou no mês atual se ele já passou (meses antigos sem contracheque não viram "atrasados")
    const startM = cm >= today.slice(0, 7) ? cm : today.slice(0, 7);
    let rule = (plan.ruleId || job.recId) && (S.rec || []).find(r => r.id === (plan.ruleId || job.recId));
    if (!rule) {
      rule = M.newRec({ kind: 'fixa', type: 'rec', desc: 'Salário ' + name, itemId: job.itemId, accountId: last.accountId, amount: P.piso, day, start: startM });
      S.rec.push(rule);
    }
    if (startM > rule.start) { rule.start = startM; M.touch(rule); }
    S.tx.filter(t => t.recId === rule.id && t.prev && t.recM < startM).map(t => t.id).forEach(id => M.removeRecord(S, 'tx', id));
    job.recId = rule.id; rule.jobId = job.id;
    const cur = last.txId && S.tx.find(t => t.id === last.txId);
    if (cur && !cur.recId) { const pv = S.tx.find(t => t.recId === rule.id && t.recM === cm && t.prev); if (pv) M.removeRecord(S, 'tx', pv.id); if (!S.tx.some(t => t.recId === rule.id && t.recM === cm)) { cur.recId = rule.id; cur.recM = cm; M.touch(cur); } }
    if (rule.end) M.reopenRec(S, rule);
    M.editRec(S, rule, { amount: P.piso, day, accountId: last.accountId, itemId: job.itemId }, mAdd(cm, 1));
    M.ensureRecurring(S, today);
  }
  // correções guardadas no formato da 0.9.0 (job.parc) passam para a dívida
  Object.entries(job.parc || {}).forEach(([key, v]) => { if (v && v.i && !edits.some(e => e.key === key)) edits.push({ key, desc: (job.rubs[key] || {}).desc || '', pi: v.i, pn: v.n || 0, pm: v.asOf }); });
  delete job.parc;
  syncFolha(S, job, edits, today);
  adjustForecast(S);
  revive(S, job);
  return res;
}

/* correção manual da dívida consignada: i = parcela no mês asOf, n = total (0 = não informado); i = 0 volta a valer o que o
   contracheque informa. Reagenda as parcelas futuras e corrige as descrições. Devolve quantos lançamentos mudaram. */
export function setLoanParc(S, loanId, i, n, asOf, today = M.todayISO()) {
  const l = (S.loans || []).find(x => x.id === loanId); if (!l) return 0;
  const job = (S.jobs || []).find(j => j.id === l.jobId); if (!job) return 0;
  if (i > 0) Object.assign(l, { i0: Math.round(i), n: Math.max(0, Math.round(n || 0)), asOf, manual: true }); else { delete l.manual; l.i0 = 0; l.n = 0; }
  M.touch(l);
  const before = new Map(S.tx.filter(t => t.loanId === l.id).map(t => [t.id, t.desc]));
  syncFolha(S, job, [], today); adjustForecast(S);
  return S.tx.filter(t => t.loanId === l.id && before.get(t.id) !== t.desc).length + [...before.keys()].filter(id => !S.tx.some(t => t.id === id)).length;
}

/* exclui um contracheque guardado e os lançamentos que ele criou */
/* a pessoa informa que o consignado acabou (quitou, refinanciou, fez portabilidade): tira as parcelas agendadas */
export function closeLoan(S, loanId, today = M.todayISO()) {
  const l = (S.loans || []).find(x => x.id === loanId), job = l && (S.jobs || []).find(j => j.id === l.jobId); if (!job) return;
  const last = normalSlips(S, job.id).pop(); if (!last) return;
  l.closed = slipMonth(last); l.end = l.closed; M.touch(l);
  syncFolha(S, job, [], today); adjustForecast(S);
}
function dropSlip(S, slipId) {
  const ids = S.tx.filter(t => t.slipId === slipId).map(t => t.id);
  ids.forEach(id => M.removeRecord(S, 'tx', id));
  M.removeRecord(S, 'slips', slipId);
  return ids.length;
}
export function removeSlip(S, slipId, today = M.todayISO()) {
  const sl = (S.slips || []).find(x => x.id === slipId), job = sl && (S.jobs || []).find(j => j.id === sl.jobId);
  const n = dropSlip(S, slipId);
  if (job) { syncFolha(S, job, [], today); adjustForecast(S); }
  return n;
}
export function removeJob(S, jobId) {
  slipsOf(S, jobId).forEach(s => dropSlip(S, s.id));
  S.tx.filter(t => t.folha && t.jobId === jobId).map(t => t.id).forEach(id => M.removeRecord(S, 'tx', id)); // descontos agendados
  (S.loans || []).filter(l => l.folha && l.jobId === jobId).map(l => l.id).forEach(id => M.removeRecord(S, 'loans', id));
  const job = (S.jobs || []).find(j => j.id === jobId);
  const rule = job && job.recId && (S.rec || []).find(r => r.id === job.recId);
  if (rule) M.removeRec(S, rule);
  M.removeRecord(S, 'jobs', jobId);
}
