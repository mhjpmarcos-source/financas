/* Modelo de dados do Finanças.
   Os nomes dos campos seguem o sistema antigo (accounts, groups, items, tx), para aproveitar os cálculos
   e importar backups antigos sem conversão. Cada registro tem `upd` (data da última alteração, em ms),
   usado para juntar as cópias do aparelho e do Drive. */

export const APP = 'financas';
export const FORMAT = 3;
export const COLLS = ['accounts', 'groups', 'items', 'tx'];
const TOMBSTONE_DAYS = 180;

export const uid = p => (p || 'x') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const clone = o => JSON.parse(JSON.stringify(o));
const pad = n => String(n).padStart(2, '0');
export const todayISO = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };

/* ---------- plano de contas padrão (neutro, sem nomes de pessoas) ---------- */
const PLAN = [
  ['receita', 'Receitas', '#2e9e6b', ['Salário', '13º salário', 'Férias', 'Honorários / Serviços', 'Pró-labore', 'Rendimentos de aplicações', 'Reembolsos recebidos', 'Outras receitas']],
  ['receita', 'Receitas extraordinárias', '#7cbf3a', ['Venda de bens', 'Presentes recebidos', 'Empréstimos recebidos', 'Restituição de IR']],
  ['despesa', 'Moradia', '#e0574f', ['Aluguel / Financiamento', 'Condomínio', 'Energia', 'Água / Esgoto', 'Gás', 'Internet / TV / Telefone', 'Manutenção da casa', 'Serviços domésticos']],
  ['despesa', 'Alimentação', '#ec7a6a', ['Mercado', 'Restaurantes / Delivery', 'Lanches / Café']],
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
    accounts: [], groups: [], items: [], tx: [],
    faturaMeta: {}, deleted: {}
  };
}

/* conta corrente / poupança / carteira (nature 'debito') ou cartão de crédito (nature 'credito') */
export function newAccount(f) {
  const credit = f.nature === 'credito';
  return {
    id: uid('a'), nature: credit ? 'credito' : 'debito', name: String(f.name || '').trim(),
    initial: credit ? 0 : (+f.initial || 0), closeDay: credit ? (+f.closeDay || 0) : 0, dueDay: credit ? (+f.dueDay || 0) : 0,
    payAccount: credit ? (f.payAccount || '') : '', active: true, upd: Date.now()
  };
}

/* tipos de lançamento: rec (receita), deb (despesa à vista/débito), cred (despesa no cartão), trf (transferência) */
export function newTx(f) {
  const t = Date.now();
  const tx = {
    id: uid('t'), type: f.type, date: f.date, accountId: f.accountId, itemId: f.type === 'trf' ? '' : (f.itemId || ''),
    amount: Math.round(Math.abs(+f.amount || 0) * 100) / 100, desc: String(f.desc || '').trim(),
    status: f.status || (f.type === 'cred' ? 'pend' : 'liq'), upd: t, created: t, origin: f.origin || 'manual'
  };
  if (f.type === 'trf') tx.toAccountId = f.toAccountId;
  if (f.comp) tx.comp = f.comp;
  if (f.seriesId) Object.assign(tx, { seriesId: f.seriesId, seriesIdx: f.seriesIdx, seriesN: f.seriesN, seriesKind: f.kind || 'rep' });
  return tx;
}

export function touch(rec) { rec.upd = Date.now(); return rec; }

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
  COLLS.forEach(k => s[k].forEach(r => { if (!r.id) r.id = uid(k[0]); if (typeof r.upd !== 'number') r.upd = 0; }));
  s.profile.cpf6 = /^\d{6}$/.test(s.profile.cpf6 || '') ? s.profile.cpf6 : '';
  return s;
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
  ['profile', 'config'].forEach(k => { out[k] = (b[k].upd || 0) > (a[k].upd || 0) ? b[k] : a[k]; });
  out.faturaMeta = Object.assign({}, a.faturaMeta);
  Object.entries(b.faturaMeta).forEach(([key, v]) => { const cur = out.faturaMeta[key]; if (!cur || (v.upd || 0) > (cur.upd || 0)) out.faturaMeta[key] = v; });
  const limit = Date.now() - TOMBSTONE_DAYS * 864e5;
  out.deleted = Object.fromEntries(Object.entries(del).filter(([, ts]) => ts > limit));
  out.updatedAt = Math.max(a.updatedAt || 0, b.updatedAt || 0);
  return out;
}

/* assinatura do conteúdo, para saber se duas cópias são iguais */
export function digest(s) {
  const pick = { profile: s.profile, config: s.config, faturaMeta: s.faturaMeta, deleted: s.deleted };
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
  return Array.from({ length: n }, (_, i) => newTx({ ...f, date: addMonthsDate(f.date, i), seriesId: sid, seriesIdx: i + 1, seriesN: n, kind: 'rep' }));
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
