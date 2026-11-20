/* Modelo de dados do Finanças.
   Os nomes dos campos seguem o sistema antigo (accounts, groups, items, tx), para aproveitar os cálculos
   e importar backups antigos sem conversão. Cada registro tem `upd` (data da última alteração, em ms),
   usado para juntar as cópias do aparelho e do Drive. */

export const APP = 'financas';
export const FORMAT = 3;
export const COLLS = ['accounts', 'groups', 'items', 'tx', 'loans', 'res', 'rec', 'people', 'jobs', 'slips'];
const TOMBSTONE_DAYS = 180;

export const uid = p => (p || 'x') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const clone = o => JSON.parse(JSON.stringify(o));
const pad = n => String(n).padStart(2, '0');
export const todayISO = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };

/* ---------- plano de contas padrão (neutro, sem nomes de pessoas) ---------- */
const PLAN = [
  ['receita', 'Receitas', '#2e9e6b', ['Salário', '13º salário', 'Férias', 'Honorários / Serviços', 'Pró-labore', 'Rendimentos de aplicações', 'Reembolsos recebidos', 'Outras receitas']],
  ['receita', 'Receitas extraordinárias', '#7cbf3a', ['Venda de bens', 'Presentes recebidos', 'Empréstimos recebidos', 'Recebimento de empréstimo concedido', 'Restituição de IR']],
  ['despesa', 'Moradia', '#e0574f', ['Aluguel / Financiamento', 'Condomínio', 'Energia', 'Água / Esgoto', 'Gás', 'Internet / TV / Telefone', 'Manutenção da casa', 'Serviços domésticos']],
  ['despesa', 'Alimentação', '#ec7a6a', ['Mercado', 'Padaria', 'Restaurantes / Delivery', 'Lanches / Café']],
  ['despesa', 'Transporte', '#e98b3a', ['Combustível', 'Aplicativos de transporte', 'Estacionamento / Pedágio', 'Transporte público', 'Manutenção do veículo', 'Seguro do veículo']],
  ['despesa', 'Saúde', '#d9534f', ['Plano de saúde', 'Farmácia', 'Consultas e exames', 'Academia']],
  ['despesa', 'Educação', '#c26b9e', ['Escola / Faculdade', 'Cursos / Livros', 'Material escolar']],
  ['despesa', 'Pessoal e lazer', '#b56cc9', ['Vestuário / Calçados', 'Cuidados pessoais', 'Lazer / Passeios', 'Viagens', 'Assinaturas / Streaming', 'Presentes', 'Pets', 'Compras diversas']],
  ['despesa', 'Encargos e tarifas', '#8d6e63', ['Juros e encargos do cartão', 'Multa e juros por atraso', 'Anuidade do cartão', 'IOF', 'Tarifas bancárias']],
  ['despesa', 'Impostos e taxas', '#a1887f', ['IPTU / IPVA', 'Imposto de renda', 'Taxas e anuidades profissionais', 'Multas de trânsito']],
  ['despesa', 'Investimentos e dívidas', '#607d8b', ['Aplicações', 'Previdência privada', 'Parcela de empréstimo', 'Empréstimos concedidos']],
  ['despesa', 'Outras despesas', '#9e9e9e', ['Doações', 'Despesas de terceiros', 'Outras despesas']],
  ['reserva', 'Reservas', '#7b55c7', ['Reserva de emergência', 'Reserva para despesas futuras', 'Reserva para viagens', 'Reserva para impostos anuais']]
];

export function defaultPlan() {
  const t = Date.now(), groups = [], items = [];
  let n = 0; const nid = p => p + (++n).toString(36) + t.toString(36).slice(-4);
  PLAN.forEach(([kind, name, color, list]) => {
    const g = { id: nid('g'), kind, name, color, upd: t };
    groups.push(g);
    list.forEach(it => items.push({ id: nid('i'), groupId: g.id, name: it, active: true, upd: t }));
  });
  return { groups, items };
}

/* ---------- estado ---------- */
export function emptyState() {
  const m = todayISO().slice(0, 7);
  return {
    app: APP, format: FORMAT, createdAt: new Date().toISOString(), updatedAt: 0,
    profile: { cpf6: '', upd: 0 },
    config: { periodStart: m, setupDone: false, upd: 0 },
    accounts: [], groups: [], items: [], tx: [], loans: [], res: [], rec: [], people: [], jobs: [], slips: [],
    faturaMeta: {}, rules: {}, orc: {}, deleted: {}
  };
}

/* conta corrente / poupança / carteira (nature 'debito') ou cartão de crédito (nature 'credito').
   inv: true = conta de investimento (fica fora do "Saldo hoje"; mandar dinheiro para ela é transferência, não despesa) */
export function newAccount(f) {
  const credit = f.nature === 'credito';
  const acc = newAccountBase(f, credit);
  if (!credit && f.inv) acc.inv = true;
  return acc;
}
function newAccountBase(f, credit) {
  return {
    id: uid('a'), nature: credit ? 'credito' : 'debito', name: String(f.name || '').trim(),
    initial: credit ? 0 : (+f.initial || 0), closeDay: credit ? (+f.closeDay || 0) : 0, dueDay: credit ? (+f.dueDay || 0) : 0,
    payAccount: credit ? (f.payAccount || '') : '', active: true, upd: Date.now(),
    initialDate: credit ? undefined : (f.initialDate || undefined)
  };
}

/* tipos de lançamento: rec (receita), deb (despesa à vista/débito), cred (despesa no cartão), trf (transferência) */
export function newTx(f) {
  const t = Date.now();
  const tx = {
    id: uid('t'), type: f.type, date: f.date, accountId: f.accountId, itemId: f.type === 'trf' ? '' : (f.itemId || ''),
    amount: Math.round((f.signed ? +f.amount || 0 : Math.abs(+f.amount || 0)) * 100) / 100, desc: String(f.desc || '').trim(),
    status: f.status || (f.type === 'cred' ? 'pend' : 'liq'), upd: t, created: t, origin: f.origin || 'manual'
  };
  if (f.type === 'trf') tx.toAccountId = f.toAccountId;
  if (f.comp) tx.comp = f.comp;
  if (f.seriesId) Object.assign(tx, { seriesId: f.seriesId, seriesIdx: f.seriesIdx, seriesN: f.seriesN, seriesKind: f.kind || 'rep' });
  return tx;
}

export function touch(rec) { rec.upd = Date.now(); return rec; }

/* investimento: informa o valor de hoje e a diferença para o saldo calculado vira rendimento (ou perda).
   adj: true = ajuste de valor; muda o saldo da conta de investimento, mas não entra em receitas/despesas do mês. */
export function newYield(f) {
  const t = newTx({ type: f.diff >= 0 ? 'rec' : 'deb', date: f.date, accountId: f.accountId, itemId: f.itemId || '', amount: Math.abs(f.diff), desc: f.diff >= 0 ? 'Rendimento' : 'Perda de valor', status: 'liq' });
  t.adj = true; return t;
}

export function removeRecord(state, coll, id) {
  state[coll] = state[coll].filter(r => r.id !== id);
  state.deleted[id] = Date.now();
}

export function cpf6Valid(s) { return s === '' || /^\d{6}$/.test(s); }
/* aceita o CPF com ou sem pontuação e guarda só os 6 primeiros dígitos */
export function cpf6From(input) { const d = String(input || '').replace(/\D/g, ''); return d.length >= 6 ? d.slice(0, 6) : (d.length ? null : ''); }

/* ---------- validação e migração ---------- */
export function isState(o) { return !!(o && typeof o === 'object' && o.config && Array.isArray(o.tx) && Array.isArray(o.accounts)); }

export function migrate(s) {
  const e = emptyState();
  s.app = APP; s.format = FORMAT;
  s.profile = Object.assign({}, e.profile, s.profile || {});
  s.config = Object.assign({}, e.config, s.config || {});
  COLLS.forEach(k => { if (!Array.isArray(s[k])) s[k] = []; });
  if (!s.faturaMeta || typeof s.faturaMeta !== 'object') s.faturaMeta = {};
  if (!s.deleted || typeof s.deleted !== 'object') s.deleted = {};
  if (!s.rules || typeof s.rules !== 'object') s.rules = {};
  if (!s.orc || typeof s.orc !== 'object') s.orc = {};
  addPlanUpdates(s);
  COLLS.forEach(k => s[k].forEach(r => { if (!r.id) r.id = uid(k[0]); if (typeof r.upd !== 'number') r.upd = 0; }));
  s.profile.cpf6 = /^\d{6}$/.test(s.profile.cpf6 || '') ? s.profile.cpf6 : '';
  return s;
}

/* categorias novas do plano padrão, acrescentadas a quem já usa o app (id fixo: dois aparelhos não duplicam;
   upd 0: se o usuário apagar, a exclusão prevalece) */
const PLAN_UPDATES = [
  { v: 2, group: 'Alimentação', kind: 'despesa', item: 'Padaria', id: 'i_pl2_padaria' },
  { v: 3, group: 'Receitas extraordinárias', kind: 'receita', item: 'Recebimento de empréstimo concedido', id: 'i_pl3_receb_emprest' }
];
function addPlanUpdates(s) {
  if (!s.config.setupDone) return;
  const cur = +s.config.planV || 1;
  PLAN_UPDATES.filter(u => u.v > cur).forEach(u => {
    const g = s.groups.find(x => x.kind === u.kind && x.name === u.group);
    const nm = x => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (!g || s.deleted[u.id] || s.items.some(i => i.id === u.id || nm(i.name) === nm(u.item))) return;
    s.items.push({ id: u.id, groupId: g.id, name: u.item, active: true, upd: 0 });
  });
  s.config.planV = Math.max(cur, ...PLAN_UPDATES.map(u => u.v));
}

/* ---------- backup do sistema antigo (format 2 com módulos, ou estado solto) ---------- */
const KEEP_CONFIG = ['periodStart', 'periodEnd', 'useReserves', 'useBudget'];
export function importLegacy(obj) {
  let st = null;
  if (obj && obj.app === APP && isState(obj)) return migrate(clone(obj));
  if (obj && obj.modules && obj.modules.pes) st = obj.modules.pes;
  else if (isState(obj) && !(obj.config && obj.config.module === 'corp')) st = obj;
  if (!isState(st)) throw new Error('Arquivo não reconhecido: não é um backup deste sistema nem do sistema antigo.');
  st = clone(st);
  const out = emptyState();
  KEEP_CONFIG.forEach(k => { if (st.config[k] != null) out.config[k] = st.config[k]; });
  out.config.setupDone = true; out.config.upd = Date.now();
  out.accounts = st.accounts; out.groups = st.groups; out.items = st.items;
  out.tx = st.tx.filter(t => ['rec', 'deb', 'cred', 'trf', 'res'].includes(t.type));
  out.faturaMeta = st.faturaMeta || {};
  if (st.budget) out.budget = st.budget;
  if (Array.isArray(st.initialReserves)) out.initialReserves = st.initialReserves;
  const t = Date.now();
  COLLS.forEach(k => out[k].forEach(r => { r.upd = t; }));
  return migrate(out);
}

/* ---------- junção de duas cópias (aparelho × Drive) ----------
   Registro a registro: vale a alteração mais recente; exclusões vencem alterações anteriores a elas. */
export function merge(a, b) {
  if (!a) return migrate(clone(b));
  if (!b) return migrate(clone(a));
  a = migrate(clone(a)); b = migrate(clone(b));
  const out = clone(a);
  const del = Object.assign({}, a.deleted);
  Object.entries(b.deleted).forEach(([id, ts]) => { del[id] = Math.max(del[id] || 0, ts); });
  COLLS.forEach(k => {
    const map = new Map();
    a[k].forEach(r => map.set(r.id, r));
    b[k].forEach(r => { const cur = map.get(r.id); if (!cur || (r.upd || 0) > (cur.upd || 0)) map.set(r.id, r); });
    const order = [...a[k].map(r => r.id), ...b[k].map(r => r.id).filter(id => !a[k].some(r => r.id === id))];
    out[k] = order.map(id => map.get(id)).filter(r => !(del[r.id] && del[r.id] >= (r.upd || 0)));
  });
  Object.keys(b).forEach(k => { if (!(k in out) && Array.isArray(b[k])) out[k] = b[k]; }); // coleção de uma versão mais nova do app: mantém
  ['profile', 'config'].forEach(k => { out[k] = (b[k].upd || 0) > (a[k].upd || 0) ? b[k] : a[k]; });
  ['faturaMeta', 'rules', 'orc'].forEach(k => {
    out[k] = Object.assign({}, a[k]);
    Object.entries(b[k]).forEach(([key, v]) => { const cur = out[k][key]; if (!cur || (v.upd || 0) > (cur.upd || 0)) out[k][key] = v; });
  });
  const limit = Date.now() - TOMBSTONE_DAYS * 864e5;
  out.deleted = Object.fromEntries(Object.entries(del).filter(([, ts]) => ts > limit));
  out.updatedAt = Math.max(a.updatedAt || 0, b.updatedAt || 0);
  return out;
}

/* assinatura do conteúdo, para saber se duas cópias são iguais */
export function digest(s) {
  const pick = { profile: s.profile, config: s.config, faturaMeta: s.faturaMeta, rules: s.rules, orc: s.orc, deleted: s.deleted };
  COLLS.forEach(k => { pick[k] = [...s[k]].sort((x, y) => x.id < y.id ? -1 : 1); });
  const str = JSON.stringify(pick);
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36) + ':' + str.length;
}

/* ---------- categorias ---------- */
export function newGroup(kind, name, color) {
  return { id: uid('g'), kind, name: String(name).trim(), color: color || '#78909c', upd: Date.now() };
}
export function newItem(groupId, name) {
  return { id: uid('i'), groupId, name: String(name).trim(), active: true, upd: Date.now() };
}
/* junta a categoria `fromId` em `toId`: os lançamentos passam para a outra e a primeira é apagada */
export function mergeItems(state, fromId, toId) {
  if (fromId === toId) return 0;
  let n = 0;
  state.tx.forEach(t => { if (t.itemId === fromId) { t.itemId = toId; touch(t); n++; } });
  removeRecord(state, 'items', fromId);
  return n;
}
export const itemInUse = (state, id) => state.tx.some(t => t.itemId === id);

/* ---------- parcelamentos e repetições ---------- */
const pad2 = n => String(n).padStart(2, '0');
function mAddM(m, n) { let [y, mo] = m.split('-').map(Number); mo += n; y += Math.floor((mo - 1) / 12); mo = ((mo - 1) % 12 + 12) % 12 + 1; return y + '-' + pad2(mo); }
function addMonthsDate(d, n) { const m = mAddM(d.slice(0, 7), n); const [y, mo] = m.split('-').map(Number); const last = new Date(y, mo, 0).getDate(); return m + '-' + pad2(Math.min(+d.slice(8, 10), last)); }

/* divide um total em n parcelas; a diferença de centavos fica na primeira */
export function splitAmount(total, n) {
  const cents = Math.round(Math.abs(total) * 100), base = Math.floor(cents / n), rest = cents - base * n;
  return Array.from({ length: n }, (_, i) => (base + (i === 0 ? rest : 0)) / 100);
}

/* compra parcelada no cartão: todas com a data da compra, cada uma numa fatura (comp) seguinte.
   repetição (débito/receita/transferência): mesma data a cada mês. */
export function makeSeries(f, n, firstComp) {
  const sid = uid('s');
  if (f.type === 'cred') {
    return splitAmount(f.amount, n).map((amount, i) => newTx({ ...f, amount, comp: mAddM(firstComp, i), seriesId: sid, seriesIdx: i + 1, seriesN: n, kind: 'parc' }));
  }
  if (f.kind === 'parc') return splitAmount(f.amount, n).map((amount, i) => newTx({ ...f, amount, date: addMonthsDate(f.date, i), seriesId: sid, seriesIdx: i + 1, seriesN: n, kind: 'parc' }));
  return Array.from({ length: n }, (_, i) => newTx({ ...f, date: addMonthsDate(f.date, i), seriesId: sid, seriesIdx: i + 1, seriesN: n, kind: 'rep' }));
}

export function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
const r2m = v => Math.round(v * 100) / 100;
const dayIn = (m, d) => m + '-' + pad2(Math.min(Math.max(1, d || 1), new Date(+m.slice(0, 4), +m.slice(5, 7), 0).getDate()));
const pendOpen = t => t.type === 'cred' ? !!t.prev : t.status === 'pend';

/* ----- despesas e receitas que se repetem todo mês, sem data para acabar -----
   fixa: mesmo valor todo mês; var (variável): sempre existe, valor muda (previsto = média dos 3 últimos meses confirmados).
   rec: {id, kind, type:'deb'|'rec'|'cred', desc, itemId, accountId, amount, day, start:'AAAA-MM', end:'' | 'AAAA-MM', gen}
   Cada mês vira um lançamento com id fixo (t_r_<regra>_<geração>_<AAAAMM>), criado até 12 meses à frente.
   O mesmo id em todos os aparelhos evita duplicar; um mês excluído à mão não volta (fica a marca de exclusão).
   prev: true = valor ainda é previsão (não confirmado por pagamento ou importação). */
export const REC_AHEAD = 12;
export function newRec(f) {
  return touch({ id: uid('r'), kind: f.kind === 'var' ? 'var' : 'fixa', type: f.type, desc: String(f.desc || '').trim(), itemId: f.itemId || '', accountId: f.accountId,
    amount: r2m(Math.abs(+f.amount || 0)), day: Math.min(31, Math.max(1, +f.day || 1)), start: f.start, end: f.end || '', gen: 0, person: f.person || '' });
}
export const recOccId = (r, m) => `t_r_${r.id}_${r.gen || 0}_${m.replace('-', '')}`;
export const recOccs = (S, r) => S.tx.filter(t => t.recId === r.id).sort((a, b) => a.recM < b.recM ? -1 : a.recM > b.recM ? 1 : 0);
export function recEstimate(S, r) {
  if (r.kind !== 'var') return r.amount;
  const real = recOccs(S, r).filter(t => !t.prev && (t.type === 'cred' || t.status === 'liq')).slice(-3);
  return real.length ? r2m(real.reduce((s, t) => s + Math.abs(t.amount), 0) / real.length) : r.amount;
}
/* primeiro lançamento (o do mês em que foi cadastrada), com o que a pessoa informou */
export function recFirst(S, r, f) {
  const t = newTx({ type: r.type, date: f.date, accountId: r.accountId, itemId: r.itemId, amount: f.amount, desc: r.desc, status: f.status, signed: r.type === 'cred' });
  t.id = recOccId(r, r.start); t.recId = r.id; t.recM = r.start;
  if (r.type === 'cred') t.prev = false; else if (t.status === 'pend') t.prev = true;
  S.tx.push(t); return t;
}
/* cria os meses que faltam (até 12 meses à frente) e atualiza a previsão das variáveis. Devolve quantas mudanças fez. */
export function ensureRecurring(S, today = todayISO(), dry = false) {
  let n = 0; const until = mAddM(today.slice(0, 7), REC_AHEAD);
  const have = new Set(S.tx.filter(t => t.recId).map(t => t.recId + '|' + t.recM)), byId = new Map(S.tx.map(t => [t.id, t]));
  for (const r of S.rec || []) {
    const last = r.end && r.end < until ? r.end : until, est = recEstimate(S, r);
    for (let m = r.start; m <= last; m = mAddM(m, 1)) {
      const id = recOccId(r, m), cur = byId.get(id);
      if (cur) { if (cur.prev && r.kind === 'var' && Math.abs(Math.abs(cur.amount) - est) > 0.004) { n++; if (!dry) { cur.amount = est; touch(cur); } } continue; }
      if (S.deleted[id] || have.has(r.id + '|' + m)) continue;
      if (dry) { n++; continue; }
      const t = newTx({ type: r.type, date: dayIn(m, r.day), accountId: r.accountId, itemId: r.itemId, amount: est, desc: r.desc, status: 'pend' });
      Object.assign(t, { id, recId: r.id, recM: m, prev: true });
      S.tx.push(t); n++;
    }
  }
  return n;
}
/* altera a regra e os meses ainda em aberto a partir de fromM */
export function editRec(S, r, f, fromM) {
  ['kind', 'desc', 'itemId', 'accountId', 'amount', 'day', 'person'].forEach(k => { if (f[k] !== undefined) r[k] = k === 'amount' ? r2m(Math.abs(+f[k] || 0)) : f[k]; });
  touch(r);
  let n = 0;
  recOccs(S, r).filter(t => t.recM >= fromM && pendOpen(t)).forEach(t => {
    t.desc = r.desc; t.itemId = r.itemId; t.accountId = r.accountId; t.date = dayIn(t.recM, r.day);
    if (r.kind === 'fixa') t.amount = r.amount;
    t.prev = true; delete t.comp; touch(t); n++;
  });
  return n;
}
/* encerra: o último mês é endM; os meses seguintes ainda em aberto são apagados */
export function endRec(S, r, endM) {
  r.end = endM; touch(r);
  const ids = recOccs(S, r).filter(t => t.recM > endM && pendOpen(t)).map(t => t.id);
  ids.forEach(id => removeRecord(S, 'tx', id));
  return ids.length;
}
export function reopenRec(S, r) { r.end = ''; r.gen = (r.gen || 0) + 1; touch(r); }
export function removeRec(S, r) {
  recOccs(S, r).filter(pendOpen).forEach(t => removeRecord(S, 'tx', t.id));
  recOccs(S, r).forEach(t => { delete t.recId; delete t.recM; touch(t); });
  removeRecord(S, 'rec', r.id);
}
/* liga lançamentos antigos a uma regra (para a média e para não gerar de novo os meses que já existem) */
export function linkToRec(S, r, txIds) {
  txIds.forEach(id => { const t = S.tx.find(x => x.id === id); if (t && !t.recId) { t.recId = r.id; t.recM = t.date.slice(0, 7); delete t.prev; touch(t); } });
}

/* ----- parcelas futuras previstas de compras parceladas importadas da fatura -----
   chave: cartão + descrição + data da compra + nº de parcelas; parcela k tem id t_p_<chave>_<k>.
   Quando a fatura seguinte chega, a parcela real ocupa o mesmo id (substitui a previsão, sem duplicar). */
export const normDesc = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export const parcKey = (cardId, desc, date, n) => hashStr([cardId, normDesc(desc), date, n].join('|'));
export const parcId = (key, k) => `t_p_${key}_${k}`;
export function projectParcels(S, base, key, i, n, cleanDesc) {
  let c = 0;
  for (let k = i + 1; k <= n; k++) {
    const id = parcId(key, k);
    if (S.deleted[id] || S.tx.some(t => t.id === id)) continue;
    const t = newTx({ type: 'cred', date: base.date, accountId: base.accountId, itemId: base.itemId, amount: base.amount, desc: `${cleanDesc} (${k}/${n})`, signed: true, origin: 'previsao' });
    Object.assign(t, { id, comp: mAddM(base.comp, k - i), prev: true, parcKey: key, parcI: k, parcN: n });
    S.tx.push(t); c++;
  }
  return c;
}
/* quanto falta de cada compra parcelada (previstas + em aberto), por cartão */
export function parcelPlans(S) {
  const g = new Map();
  S.tx.filter(t => t.parcKey || (t.seriesId && t.seriesKind === 'parc')).forEach(t => {
    const k = t.parcKey || t.seriesId;
    if (!g.has(k)) g.set(k, []);
    g.get(k).push(t);
  });
  return [...g.values()];
}

/* ----- pessoas (a quem devo / quem me deve), com chave Pix opcional ----- */
export function newPerson(f) {
  return touch({ id: uid('p'), name: String(f.name || '').trim(), pixKey: String(f.pixKey || '').trim(), city: String(f.city || '').trim() });
}
export const seriesMembers = (state, t) => t.seriesId ? state.tx.filter(x => x.seriesId === t.seriesId).sort((a, b) => a.seriesIdx - b.seriesIdx) : [t];

/* aplica a edição a "este e os seguintes" da série */
export function editSeriesFrom(state, t, fields) {
  const from = t.seriesIdx || 1;
  const deltaM = fields.date && t.type !== 'cred' ? monthsBetween(t.date, fields.date) : 0;
  const day = fields.date ? +fields.date.slice(8, 10) : null;
  let n = 0;
  seriesMembers(state, t).filter(x => x.seriesIdx >= from).forEach(x => {
    ['amount', 'desc', 'itemId', 'accountId', 'toAccountId', 'status'].forEach(k => { if (fields[k] !== undefined) x[k] = fields[k]; });
    if (x.type === 'cred') { if (fields.date) x.date = fields.date; }
    else if (fields.date) { const moved = addMonthsDate(x.date, deltaM); x.date = moved.slice(0, 8) + pad2(Math.min(day, new Date(+moved.slice(0, 4), +moved.slice(5, 7), 0).getDate())); }
    touch(x); n++;
  });
  return n;
}
export function removeSeriesFrom(state, t) {
  const from = t.seriesIdx || 1, ids = seriesMembers(state, t).filter(x => x.seriesIdx >= from).map(x => x.id);
  ids.forEach(id => removeRecord(state, 'tx', id));
  return ids.length;
}
function monthsBetween(d1, d2) { const [y1, m1] = d1.split('-').map(Number), [y2, m2] = d2.split('-').map(Number); return (y2 * 12 + m2) - (y1 * 12 + m1); }

/* ---------- dívidas com terceiros ----------
   dir 'in' = alguém me deve (a receber); 'out' = eu devo (a pagar).
   As parcelas são lançamentos pendentes (receita ou despesa) ligados ao empréstimo por loanId. */
/* reservas (objetivos): dinheiro separado "de cabeça" dentro do saldo das contas.
   Guardar/retirar não move dinheiro entre contas; só muda quanto do saldo está comprometido. */
export function newReserve(f) {
  return touch({ id: uid('r'), name: String(f.name || '').trim() || 'Reserva', target: Math.max(0, Math.round((+f.target || 0) * 100) / 100),
    deadline: f.deadline || '', color: f.color || '#2f8f6b', movs: [], done: false });
}
export function reserveMov(r, f) {
  const v = Math.round((+f.v || 0) * 100) / 100;
  if (!v) return null;
  const m = { id: uid('m'), date: f.date || todayISO(), v, note: String(f.note || '').trim() };
  if (f.ini) m.ini = true;
  r.movs = [...(r.movs || []), m].sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  touch(r); return m;
}
export const reserveSaved = r => Math.round((r.movs || []).reduce((s, m) => s + m.v, 0) * 100) / 100;

/* ----- cópias de segurança no Drive -----
   nomes: financas-AAAA-MM-DD.json (diária) e financas-AAAA-MM-DD-HHMM-motivo.json (antes de restaurar / grande exclusão).
   Fica: as 14 diárias mais recentes, a mais recente de cada um dos últimos 12 meses e as de motivo por 60 dias. */
export const recordCount = s => COLLS.reduce((n, k) => n + ((s && s[k]) || []).length, 0);
export function backupsToTrash(files, today) {
  const addDays = (d, n) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
  const parsed = files.map(f => ({ f, d: (f.name.match(/^financas-(\d{4}-\d{2}-\d{2})/) || [])[1], extra: /^financas-\d{4}-\d{2}-\d{2}-/.test(f.name) })).filter(x => x.d);
  const daily = parsed.filter(x => !x.extra).sort((a, b) => a.d < b.d ? 1 : a.d > b.d ? -1 : 0);
  const keep = new Set(daily.slice(0, 14).map(x => x.f.id)), seen = new Set(), from = addDays(today, -366);
  daily.forEach(x => { const mo = x.d.slice(0, 7); if (!seen.has(mo)) { seen.add(mo); if (x.d >= from) keep.add(x.f.id); } });
  parsed.filter(x => x.extra && x.d >= addDays(today, -60)).forEach(x => keep.add(x.f.id));
  return parsed.filter(x => !keep.has(x.f.id)).map(x => x.f);
}

export function makeLoan(f) {
  const t = Date.now();
  const loan = {
    id: uid('l'), dir: f.dir, person: String(f.person || '').trim(), desc: String(f.desc || '').trim(),
    total: Math.round(Math.abs(+f.total || 0) * 100) / 100, n: Math.max(1, Math.min(240, +f.n || 1)),
    firstDue: f.firstDue, accountId: f.accountId, itemId: f.itemId || '', created: t, upd: t
  };
  const label = [loan.desc || (loan.dir === 'in' ? 'Empréstimo concedido' : 'Dívida'), loan.person].filter(Boolean).join(' · ');
  const base = { type: loan.dir === 'in' ? 'rec' : 'deb', date: loan.firstDue, accountId: loan.accountId, itemId: loan.itemId, desc: label, status: 'pend' };
  const parcels = loan.n > 1
    ? makeSeries({ ...base, amount: loan.total }, loan.n).map((x, i, all) => Object.assign(x, { amount: splitAmount(loan.total, loan.n)[i], status: 'pend', seriesKind: 'parc' }))
    : [newTx({ ...base, amount: loan.total })];
  parcels.forEach(p => { p.loanId = loan.id; });
  const txs = [...parcels];
  // opcional: o movimento do dinheiro emprestado (saída quando eu empresto; entrada quando eu pego emprestado)
  if (f.startDate && f.startItemId) {
    const st = newTx({ type: loan.dir === 'in' ? 'deb' : 'rec', date: f.startDate, accountId: loan.accountId, itemId: f.startItemId, amount: loan.total, desc: label, status: 'liq' });
    st.loanId = loan.id; st.loanStart = true; loan.startTx = st.id; txs.push(st);
  }
  return { loan, txs };
}

export function loanStatus(state, loan) {
  const parcels = state.tx.filter(t => t.loanId === loan.id && !t.loanStart).sort((a, b) => a.date.localeCompare(b.date));
  const done = parcels.filter(t => t.status === 'liq'), open = parcels.filter(t => t.status !== 'liq');
  const paid = Math.round(done.reduce((s, t) => s + t.amount, 0) * 100) / 100;
  const total = Math.round(parcels.reduce((s, t) => s + t.amount, 0) * 100) / 100;
  return { parcels, paid, total, rest: Math.round((total - paid) * 100) / 100, next: open[0] || null, openN: open.length, doneN: done.length, late: open.filter(t => t.date < todayISO()).length };
}

/* apaga o empréstimo e as parcelas ainda não pagas (as pagas continuam como lançamentos) */
export function removeLoan(state, loanId) {
  state.tx.filter(t => t.loanId === loanId && t.status !== 'liq' && !t.loanStart).forEach(t => removeRecord(state, 'tx', t.id));
  removeRecord(state, 'loans', loanId);
}

/* ---------- orçamento ----------
   orc[itemId] = { def: valor mensal padrão, months: { 'AAAA-MM': valor só daquele mês }, upd } */
export function setBudget(state, itemId, value, month) {
  const cur = state.orc[itemId] ? clone(state.orc[itemId]) : { def: 0, months: {} };
  const v = Math.round(Math.max(0, +value || 0) * 100) / 100;
  if (month) cur.months[month] = v; else { cur.def = v; cur.months = {}; }
  cur.upd = Date.now();
  if (!cur.def && !Object.values(cur.months).some(Boolean)) { state.orc[itemId] = { def: 0, months: {}, upd: cur.upd }; return; }
  state.orc[itemId] = cur;
}
