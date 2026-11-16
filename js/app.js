/* Finanças · Fase 1 — núcleo: login, dados no aparelho + Drive, primeira configuração e telas básicas. */
import * as auth from './auth.js';
import * as sync from './sync.js';
import * as drive from './drive.js';
import * as M from './model.js';
import * as C from './calc.js';

export const VERSION = '0.2.0';
const CID_KEY = 'fin.cfg.clientId';
const clientId = () => (window.FIN_CONFIG && FIN_CONFIG.clientId) || (() => { try { return localStorage.getItem(CID_KEY) || ''; } catch { return ''; } })();

const $ = s => document.querySelector(s);
const app = () => $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const S = () => sync.state();

let ui = { tab: 'lanc', month: M.todayISO().slice(0, 7), sub: null, q: '', catKind: 'despesa' };
let toastT = null;
function toast(msg, bad) {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast on' + (bad ? ' bad' : '');
  clearTimeout(toastT); toastT = setTimeout(() => { t.className = 'toast'; }, 3200);
}
const confirmBox = msg => Promise.resolve(window.confirm(msg));

/* ---------- ícones ---------- */
const ICON = {
  lanc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
  resumo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  contas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h3"/></svg>',
  ajustes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>'
};

/* ---------- inicialização ---------- */
async function boot() {
  const cid = clientId();
  if (cid) auth.init(cid);
  await sync.load();
  sync.onData(() => { if (S() && S().config.setupDone && !$('#wz')) render(); });
  sync.onStatus(renderChip);
  auth.onChange(() => { if (S() && S().config.setupDone) renderChip(sync.currentStatus()); });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  route();
  if (auth.isSignedIn()) sync.schedule(200);
}

function route() {
  if (!clientId()) return screenNoClient();
  const st = S();
  if (st && st.config.setupDone) return render();
  if (!auth.isSignedIn()) return screenWelcome();
  return firstAccess();
}

/* ---------- sem ID do cliente (quem publicar a própria cópia) ---------- */
function screenNoClient() {
  app().innerHTML = `<div class="hero"><img src="icons/icon-192.png" alt=""><h1>Finanças</h1>
    <p>Esta cópia ainda não tem o <b>ID do cliente</b> do Google. Siga o README do projeto para criar o seu e cole aqui.</p>
    <label for="cid">ID do cliente OAuth</label><input id="cid" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="…apps.googleusercontent.com">
    <button class="btn primary block" id="saveCid" style="margin-top:12px">Salvar</button>
    <p class="hint">Origem para cadastrar no Google: <b>${esc(location.origin)}</b><br>Redirecionamento: <b>${esc(location.origin + location.pathname)}</b></p></div>`;
  $('#saveCid').onclick = () => {
    const v = $('#cid').value.trim();
    if (!/\.apps\.googleusercontent\.com$/.test(v)) return toast('Esse ID não termina em .apps.googleusercontent.com.', true);
    try { localStorage.setItem(CID_KEY, v); } catch { /* bloqueado */ }
    location.reload();
  };
}

/* ---------- boas-vindas ---------- */
function screenWelcome() {
  app().innerHTML = `<div class="hero"><img src="icons/icon-192.png" alt=""><h1>Finanças</h1>
    <p>Seu controle financeiro, com os dados guardados no <b>seu</b> Google Drive. Ninguém mais tem acesso.</p>
    <button class="btn primary block" id="login" style="margin-top:18px">Entrar com o Google</button>
    <p class="hint" id="offmsg">${navigator.onLine ? '' : 'Sem internet. Conecte-se para o primeiro acesso.'}</p>
    <p class="hint">O app cria a pasta <b>Finanças (app)</b> no seu Drive e só enxerga os arquivos dela.</p></div>`;
  $('#login').onclick = () => doLogin(true).then(ok => { if (ok) firstAccess(); });
}

async function doLogin(selectAccount) {
  try {
    await auth.signIn({ selectAccount });
    const u = await drive.whoAmI();
    const prev = sync.syncInfo().email;
    if (prev && prev !== u.emailAddress && S()) {
      const ok = await confirmBox(`Este aparelho guarda os dados de ${prev}. Entrar com ${u.emailAddress} vai tirar esses dados deste aparelho (eles continuam no Drive de ${prev}). Continuar?`);
      if (!ok) { auth.signOut(); auth.setHint(prev); return false; }
      await sync.forgetDevice();
    }
    auth.setHint(u.emailAddress);
    await sync.setEmail(u.emailAddress);
    return true;
  } catch (e) { toast(e.message, true); return false; }
}

async function firstAccess() {
  app().innerHTML = `<div class="hero"><img src="icons/icon-192.png" alt=""><h1>Um momento…</h1><p>Procurando seus dados no Google Drive.</p></div>`;
  try {
    if (await sync.remoteExists()) {
      await sync.sync();
      if (S() && S().config.setupDone) { toast('Seus dados foram carregados do Drive.'); return render(); }
    }
    wizard();
  } catch (e) {
    app().innerHTML = `<div class="hero"><h1>Não deu para acessar o Drive</h1><p>${esc(e.message)}</p><button class="btn primary block" id="retry">Tentar de novo</button></div>`;
    $('#retry').onclick = () => (auth.isSignedIn() ? firstAccess() : screenWelcome());
  }
}

/* ---------- assistente de primeira configuração ---------- */
let wz = null;
function wizard() {
  const plan = M.defaultPlan();
  wz = {
    step: 0, plan,
    accounts: [{ id: M.uid('a'), name: 'Conta corrente', initial: '' }],
    cards: [],
    groups: Object.fromEntries(plan.groups.map(g => [g.id, true])),
    cpf: '', start: M.todayISO().slice(0, 7)
  };
  drawWizard();
}

const WZ_STEPS = ['Início', 'Contas', 'Cartões', 'Categorias', 'CPF', 'Início do controle'];
function drawWizard() {
  const s = wz.step;
  const dots = WZ_STEPS.map((_, i) => `<i class="${i <= s ? 'on' : ''}"></i>`).join('');
  let body = '';
  if (s === 0) body = `<h1>Vamos configurar</h1><p class="hint">Leva uns 2 minutos. Tudo pode ser mudado depois.</p>
      <button class="btn primary block" data-wz="next" style="margin-top:14px">Começar do zero</button>
      <button class="btn block" data-wz="import" style="margin-top:10px">Importar backup (.json)</button>
      <p class="hint">O backup pode ser deste app ou do sistema antigo de planilha (arquivo <i>financas-…json</i>).</p>
      <input type="file" id="wzfile" accept=".json,application/json" hidden>`;
  if (s === 1) body = `<h1>Contas</h1><p class="hint">Contas correntes, poupança, carteira. O saldo inicial é o saldo de hoje (pode ser zero).</p>
      ${wz.accounts.map((a, i) => `<div class="item-row" data-i="${i}">${wz.accounts.length > 1 ? `<button class="btn ghost x" data-wz="delacc" data-i="${i}" aria-label="Remover">✕</button>` : ''}
        <label>Nome</label><input data-f="acc.name" data-i="${i}" value="${esc(a.name)}" placeholder="Ex.: Conta do banco">
        <label>Saldo inicial (R$)</label><input data-f="acc.initial" data-i="${i}" inputmode="decimal" value="${esc(a.initial)}" placeholder="0,00"></div>`).join('')}
      <button class="link" data-wz="addacc">+ Adicionar outra conta</button>`;
  if (s === 2) body = `<h1>Cartões de crédito</h1><p class="hint">Os dias de fechamento e vencimento estão na fatura. Se não usa cartão, só avance.</p>
      ${wz.cards.map((c, i) => `<div class="item-row"><button class="btn ghost x" data-wz="delcard" data-i="${i}" aria-label="Remover">✕</button>
        <label>Nome</label><input data-f="card.name" data-i="${i}" value="${esc(c.name)}" placeholder="Ex.: Cartão do banco">
        <div class="grid2"><div><label>Fecha no dia</label><input data-f="card.closeDay" data-i="${i}" inputmode="numeric" value="${esc(c.closeDay)}" placeholder="1 a 31"></div>
        <div><label>Vence no dia</label><input data-f="card.dueDay" data-i="${i}" inputmode="numeric" value="${esc(c.dueDay)}" placeholder="1 a 31"></div></div>
        <label>A fatura é paga pela conta</label><select data-f="card.payAccount" data-i="${i}">${wz.accounts.map(a => `<option value="${a.id}" ${a.id === c.payAccount ? 'selected' : ''}>${esc(a.name || 'Conta sem nome')}</option>`).join('')}</select></div>`).join('')}
      <button class="link" data-wz="addcard">+ Adicionar cartão</button>`;
  if (s === 3) body = `<h1>Categorias</h1><p class="hint">Desmarque os grupos que não fazem sentido para você. Dá para criar e renomear depois.</p>
      <div class="card">${wz.plan.groups.map(g => `<label class="check"><input type="checkbox" data-g="${g.id}" ${wz.groups[g.id] ? 'checked' : ''}>
        <span><b>${esc(g.name)}</b><br><small class="hint">${esc(wz.plan.items.filter(i => i.groupId === g.id).map(i => i.name).join(', '))}</small></span></label>`).join('')}</div>`;
  if (s === 4) body = `<h1>CPF para faturas com senha</h1>
      <p class="hint">Muitos bancos protegem o PDF da fatura com os primeiros dígitos do CPF. Com isso, o app abre a fatura sem pedir senha.</p>
      <label for="cpf">CPF</label><input id="cpf" inputmode="numeric" autocomplete="off" value="${esc(wz.cpf)}" placeholder="000.000.000-00">
      <p class="hint">Só os <b>6 primeiros dígitos</b> são guardados, no arquivo do seu Drive. O resto é descartado na hora. Pode deixar em branco.</p>`;
  if (s === 5) body = `<h1>A partir de quando?</h1><p class="hint">Mês em que você começa a lançar. Normalmente, o mês atual.</p>
      <label for="start">Mês inicial</label><input id="start" type="month" value="${esc(wz.start)}">`;
  const nav = s === 0 ? '' : `<div class="nav"><button class="btn" data-wz="back">Voltar</button><button class="btn primary" data-wz="${s === 5 ? 'finish' : 'next'}">${s === 5 ? 'Concluir' : 'Avançar'}</button></div>`;
  app().innerHTML = `<div class="wz" id="wz"><div class="steps">${dots}</div>${body}${nav}</div>`;
  bindWizard();
}

function bindWizard() {
  const root = $('#wz');
  if ($('#wzfile')) $('#wzfile').onchange = ev => importFile(ev.target.files[0], true);
  root.oninput = e => {
    const f = e.target.dataset.f; if (!f) return;
    const [list, key] = f.split('.'), i = +e.target.dataset.i;
    (list === 'acc' ? wz.accounts : wz.cards)[i][key] = e.target.value;
  };
  root.onchange = e => { if (e.target.dataset.g) wz.groups[e.target.dataset.g] = e.target.checked; else root.oninput(e); };
  root.onclick = async e => {
    const b = e.target.closest('[data-wz]'); if (!b) return;
    const act = b.dataset.wz, i = +b.dataset.i;
    if (wz.step === 4 && $('#cpf')) wz.cpf = $('#cpf').value;
    if (wz.step === 5 && $('#start')) wz.start = $('#start').value || wz.start;
    if (act === 'import') { $('#wzfile').click(); return; }
    if (act === 'addacc') wz.accounts.push({ id: M.uid('a'), name: '', initial: '' });
    if (act === 'delacc') wz.accounts.splice(i, 1);
    if (act === 'addcard') wz.cards.push({ name: '', closeDay: '', dueDay: '', payAccount: wz.accounts[0].id });
    if (act === 'delcard') wz.cards.splice(i, 1);
    if (act === 'back') wz.step--;
    if (act === 'next') { const err = wizardCheck(); if (err) return toast(err, true); wz.step++; }
    if (act === 'finish') { const err = wizardCheck(); if (err) return toast(err, true); return finishWizard(); }
    drawWizard();
  };
}

function wizardCheck() {
  if (wz.step === 1) {
    if (wz.accounts.some(a => !a.name.trim())) return 'Dê um nome a cada conta.';
    if (wz.accounts.some(a => a.initial !== '' && isNaN(C.parseMoney(a.initial)))) return 'Confira os saldos iniciais.';
  }
  if (wz.step === 2) {
    for (const c of wz.cards) {
      if (!c.name.trim()) return 'Dê um nome a cada cartão.';
      const cd = +c.closeDay, dd = +c.dueDay;
      if (!(cd >= 1 && cd <= 31) || !(dd >= 1 && dd <= 31)) return `Informe os dias de fechamento e vencimento do cartão ${c.name} (1 a 31).`;
    }
  }
  if (wz.step === 3 && !Object.values(wz.groups).some(Boolean)) return 'Mantenha pelo menos um grupo de categorias.';
  if (wz.step === 4 && M.cpf6From(wz.cpf) === null) return 'Digite pelo menos os 6 primeiros dígitos do CPF, ou deixe em branco.';
  if (wz.step === 5 && !/^\d{4}-\d{2}$/.test(wz.start)) return 'Escolha o mês inicial.';
  return '';
}

async function finishWizard() {
  /* outro aparelho pode ter feito a configuração enquanto este preenchia: nesse caso, vale o que já está no Drive */
  if (navigator.onLine && auth.isSignedIn()) {
    try {
      if (await sync.remoteExists()) {
        wz = null; await sync.sync();
        if (S() && S().config.setupDone) { toast('Seus dados já tinham sido configurados em outro aparelho e foram carregados do Drive.'); return render(); }
      }
    } catch { /* sem acesso agora: segue e junta depois */ }
  }
  const st = M.emptyState();
  const idMap = {};
  wz.accounts.forEach(a => { const n = M.newAccount({ nature: 'debito', name: a.name, initial: C.parseMoney(a.initial) }); idMap[a.id] = n.id; st.accounts.push(n); });
  wz.cards.forEach(c => st.accounts.push(M.newAccount({ nature: 'credito', name: c.name, closeDay: c.closeDay, dueDay: c.dueDay, payAccount: idMap[c.payAccount] || st.accounts[0].id })));
  st.groups = wz.plan.groups.filter(g => wz.groups[g.id]);
  st.items = wz.plan.items.filter(i => wz.groups[i.groupId]);
  st.profile = { cpf6: M.cpf6From(wz.cpf) || '', upd: Date.now() };
  st.config = { periodStart: wz.start, setupDone: true, upd: Date.now() };
  wz = null;
  await sync.replace(st);
  ui.month = M.todayISO().slice(0, 7);
  toast('Tudo pronto. Seus dados estão sendo salvos no Drive.');
  render();
}

/* ---------- telas principais ---------- */
function render() {
  if (!S() || !S().config.setupDone) return route();
  const tabs = [['lanc', 'Lançamentos'], ['resumo', 'Resumo'], ['contas', 'Contas'], ['ajustes', 'Ajustes']];
  const title = ui.sub === 'cats' ? 'Categorias' : { lanc: 'Lançamentos', resumo: 'Resumo', contas: 'Contas', ajustes: 'Ajustes' }[ui.tab];
  app().innerHTML = `<div class="shell"><header class="top">${ui.sub ? '<button class="back" id="back" aria-label="Voltar">‹</button>' : ''}<h1>${title}</h1><button class="chip" id="chip"><i></i><span></span></button></header>
    <main class="page" id="page"></main>
    ${ui.tab === 'lanc' && !ui.sub ? '<button class="fab" id="fab" aria-label="Novo lançamento">+</button>' : ''}
    <nav class="tabs">${tabs.map(([k, l]) => `<button data-tab="${k}" ${ui.tab === k ? 'aria-current="page"' : ''}>${ICON[k]}<span>${l}</span></button>`).join('')}</nav></div>`;
  app().querySelector('.tabs').onclick = e => { const b = e.target.closest('[data-tab]'); if (b) { ui.tab = b.dataset.tab; ui.sub = null; ui.q = ''; render(); window.scrollTo(0, 0); } };
  $('#chip').onclick = chipAction;
  if ($('#back')) $('#back').onclick = () => { ui.sub = null; render(); };
  if ($('#fab')) $('#fab').onclick = () => txSheet();
  if (ui.sub === 'cats') pageCategorias();
  else ({ lanc: pageLanc, resumo: pageResumo, contas: pageContas, ajustes: pageAjustes })[ui.tab]();
  renderChip(sync.currentStatus());
}

function renderChip(st) {
  const chip = $('#chip'); if (!chip) return;
  const txt = { ok: 'Salvo no Drive', syncing: 'Sincronizando…', offline: 'Sem internet · salvo aqui', login: 'Reconectar', error: 'Erro ao salvar', local: 'Salvo no aparelho' }[st.state] || '';
  chip.className = 'chip ' + st.state;
  chip.querySelector('span').textContent = txt;
  chip.title = st.msg || txt;
  const box = $('#syncBox'); if (box) box.innerHTML = syncBoxHTML();
}

function chipAction() {
  const st = sync.currentStatus();
  if (st.state === 'login') return reconnect();
  if (st.state === 'error') return toast(st.msg || 'Erro ao sincronizar.', true);
  if (st.state === 'offline') return toast('Sem internet. Tudo fica salvo neste aparelho e vai para o Drive quando a conexão voltar.');
  sync.sync();
}

function reconnect() {
  auth.signIn().then(() => { toast('Conectado.'); sync.schedule(50); }).catch(e => toast(e.message, true));
}

/* ----- utilidades de tela ----- */
const TYPE = { rec: 'Receita', deb: 'Despesa', cred: 'Cartão', trf: 'Transferência' };
const accById = id => S().accounts.find(a => a.id === id);
const itemById = id => S().items.find(i => i.id === id);
const groupOf = item => item && S().groups.find(g => g.id === item.groupId);
const monthNav = m => `<div class="month"><button data-m="-1" aria-label="Mês anterior">‹</button><b>${C.monthLabel(m)}</b><button data-m="1" aria-label="Próximo mês">›</button></div>`;
const shortM = m => ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][+m.slice(5) - 1] + '/' + m.slice(2, 4);

function txRow(t, showDate) {
  const it = itemById(t.itemId), g = groupOf(it), acc = accById(t.accountId);
  const title = t.desc || (it ? it.name : (t.type === 'trf' ? 'Transferência' : 'Sem categoria'));
  const sub = [showDate ? C.fmtD(t.date) + '/' + t.date.slice(2, 4) : '', t.type === 'trf' ? `${acc ? acc.name : '?'} → ${(accById(t.toAccountId) || {}).name || '?'}` : (it && t.desc ? it.name : ''), t.type !== 'trf' && acc ? acc.name : ''].filter(Boolean).join(' · ');
  const tags = (t.seriesId ? `<span class="tag info">${t.seriesIdx}/${t.seriesN}</span>` : '') + (t.status === 'pend' && t.type !== 'cred' ? '<span class="tag">pendente</span>' : '');
  return `<li data-tx="${t.id}"><span class="dot" style="background:${g ? g.color : '#90a4ae'}">${esc((TYPE[t.type] || '?')[0])}</span>
    <span class="t"><b>${esc(title)}</b><small>${esc(sub)}${tags}</small></span>
    <span class="num ${t.type === 'rec' ? 'pos' : ''}">${t.type === 'rec' || t.type === 'trf' ? '' : '−'}${C.brl(t.amount)}</span></li>`;
}

/* escolha entre opções (ex.: "só este" / "este e os seguintes"); devolve o valor ou null */
function askChoice(title, msg, options) {
  return new Promise(res => {
    const box = document.createElement('div');
    box.className = 'sheet ask';
    box.innerHTML = `<div class="panel" role="dialog" aria-modal="true"><h2>${esc(title)}</h2>${msg ? `<p class="hint">${esc(msg)}</p>` : ''}
      ${options.map((o, i) => `<button class="btn block ${o.danger ? 'danger' : i === 0 ? 'primary' : ''}" data-v="${i}" style="margin-top:8px">${esc(o.label)}</button>`).join('')}
      <button class="btn block ghost" data-v="-1" style="margin-top:8px">Cancelar</button></div>`;
    document.body.appendChild(box);
    box.onclick = e => {
      const b = e.target.closest('[data-v]'); if (!b && e.target !== box) return;
      const v = b ? +b.dataset.v : -1; box.remove(); res(v >= 0 ? options[v].value : null);
    };
  });
}

/* ----- lançamentos ----- */
function pageLanc() {
  const st = S(), m = ui.month, q = ui.q || '';
  let html = `<div class="search"><input id="q" type="search" placeholder="Buscar em todos os meses" value="${esc(q)}" autocomplete="off"></div>`;
  if (q.trim()) {
    const res = C.search(st, q);
    html += `<p class="hint">${res.length ? res.length + ' resultado(s)' : 'Nada encontrado.'}${res.length === 200 ? ' (mostrando os 200 mais recentes)' : ''}</p>`;
    if (res.length) html += `<div class="card" style="padding-top:2px"><ul class="list">${res.map(t => txRow(t, true)).join('')}</ul></div>`;
  } else {
    const sum = C.monthSummary(st, m);
    const list = st.tx.filter(t => ['rec', 'deb', 'trf'].includes(t.type) ? C.mOf(t.date) === m : t.type === 'cred' ? C.txComp(st, t) === m : false)
      .sort((a, b) => (b.date.localeCompare(a.date)) || ((b.created || 0) - (a.created || 0)));
    html += monthNav(m) + `<div class="kpis"><div class="kpi"><small>Receitas</small><b class="num pos">${C.brl(sum.rec)}</b></div>
      <div class="kpi"><small>Despesas</small><b class="num neg">${C.brl(sum.desp)}</b></div>
      <div class="kpi"><small>Resultado</small><b class="num ${sum.saldo < 0 ? 'neg' : ''}">${C.brl(sum.saldo)}</b></div></div>
      <p class="hint">Compras no cartão aparecem no mês da fatura.</p>`;
    if (!list.length) html += `<div class="card empty">Nenhum lançamento neste mês.<br>Toque em <b>+</b> para lançar.</div>`;
    else {
      let day = '';
      html += '<div class="card" style="padding-top:2px">';
      list.forEach(t => {
        if (t.date !== day) { if (day) html += '</ul>'; day = t.date; html += `<div class="day">${new Date(t.date + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: t.date.slice(0, 7) === m ? undefined : '2-digit' })}</div><ul class="list">`; }
        html += txRow(t);
      });
      html += '</ul></div>';
    }
  }
  $('#page').innerHTML = html;
  const qi = $('#q');
  qi.oninput = () => { ui.q = qi.value; const pos = qi.selectionStart; pageLanc(); const n = $('#q'); n.focus(); n.setSelectionRange(pos, pos); };
  $('#page').onclick = e => {
    const mb = e.target.closest('[data-m]'); if (mb) { ui.month = C.mAdd(ui.month, +mb.dataset.m); return pageLanc(); }
    const li = e.target.closest('[data-tx]'); if (li) txSheet(S().tx.find(t => t.id === li.dataset.tx));
  };
}

function optAccounts(nature, sel) {
  return S().accounts.filter(a => a.nature === nature && (a.active !== false || a.id === sel))
    .map(a => `<option value="${a.id}" ${a.id === sel ? 'selected' : ''}>${esc(a.name)}</option>`).join('');
}
function optItems(kind, sel) {
  return S().groups.filter(g => g.kind === kind).map(g => {
    const its = S().items.filter(i => i.groupId === g.id && (i.active !== false || i.id === sel));
    return its.length ? `<optgroup label="${esc(g.name)}">${its.map(i => `<option value="${i.id}" ${i.id === sel ? 'selected' : ''}>${esc(i.name)}</option>`).join('')}</optgroup>` : '';
  }).join('');
}

function openSheet(html, bind) {
  const sh = $('#sheet');
  sh.innerHTML = `<div class="panel" role="dialog" aria-modal="true">${html}</div>`;
  sh.hidden = false;
  sh.onclick = e => { if (e.target === sh) closeSheet(); };
  bind(sh.querySelector('.panel'));
}
function closeSheet() { const sh = $('#sheet'); sh.hidden = true; sh.innerHTML = ''; }

function txSheet(tx, preset) {
  const st = S();
  const hasCards = st.accounts.some(a => a.nature === 'credito' && a.active !== false);
  let type = tx ? tx.type : (preset && preset.type) || 'deb';
  const draw = panel => {
    const kind = type === 'rec' ? 'receita' : 'despesa';
    const defDate = tx ? tx.date : (ui.month === M.todayISO().slice(0, 7) ? M.todayISO() : ui.month + '-01');
    const accSel = tx && tx.type === type ? tx.accountId : (preset && preset.accountId) || '';
    const series = tx && tx.seriesId ? `<p class="hint">${tx.seriesKind === 'parc' ? 'Parcela' : 'Repetição'} ${tx.seriesIdx} de ${tx.seriesN}.</p>` : '';
    const repeat = tx ? '' : type === 'cred'
      ? `<label for="f-n">Parcelas</label><select id="f-n">${Array.from({ length: 24 }, (_, i) => `<option value="${i + 1}">${i ? (i + 1) + 'x' : 'À vista'}</option>`).join('')}</select>`
      : `<label class="check"><input type="checkbox" id="f-rep"> Repetir todo mês</label><div id="f-repbox" hidden><label for="f-n">Por quantos meses (contando este)</label><input id="f-n" type="number" inputmode="numeric" min="2" max="120" value="12"></div>`;
    panel.innerHTML = `<h2>${tx ? 'Editar lançamento' : 'Novo lançamento'}</h2>${series}
      <div class="seg" id="seg">${['deb', 'cred', 'rec', 'trf'].filter(k => k !== 'cred' || hasCards || type === 'cred').map(k => `<button type="button" data-type="${k}" aria-pressed="${k === type}" ${tx && tx.seriesId && k !== type ? 'disabled' : ''}>${TYPE[k]}</button>`).join('')}</div>
      <label for="f-val" id="f-vallbl">Valor (R$)</label><input id="f-val" inputmode="decimal" value="${tx ? String(tx.amount).replace('.', ',') : ''}" placeholder="0,00">
      <label for="f-date">${type === 'cred' ? 'Data da compra' : 'Data'}</label><input id="f-date" type="date" value="${esc(defDate)}">
      <label for="f-desc">Descrição</label><input id="f-desc" value="${esc(tx ? tx.desc : '')}" placeholder="Opcional">
      ${type === 'trf' ? `<label>De</label><select id="f-acc">${optAccounts('debito', accSel)}</select><label>Para</label><select id="f-to">${optAccounts('debito', tx && tx.toAccountId)}</select>`
        : `<label for="f-item">Categoria</label><select id="f-item"><option value="">Escolha…</option>${optItems(kind, tx && tx.itemId)}</select>
           <label for="f-acc">${type === 'cred' ? 'Cartão' : 'Conta'}</label><select id="f-acc">${optAccounts(type === 'cred' ? 'credito' : 'debito', accSel)}</select>`}
      ${type === 'cred' ? '' : `<label class="check"><input type="checkbox" id="f-pend" ${tx && tx.status === 'pend' ? 'checked' : ''}> Ainda não ${type === 'rec' ? 'recebido' : 'pago'} (pendente)</label>`}
      ${repeat}<p class="hint" id="f-prev"></p>
      <div class="actions">${tx ? '<button class="btn danger" id="f-del">Excluir</button>' : ''}<button class="btn" id="f-cancel">Cancelar</button><button class="btn primary" id="f-save">Salvar</button></div>`;
    panel.querySelector('#seg').onclick = e => { const b = e.target.closest('[data-type]'); if (b && !b.disabled) { type = b.dataset.type; draw(panel); } };
    const nOf = () => { const n = panel.querySelector('#f-n'); const r = panel.querySelector('#f-rep'); return n && (type === 'cred' || (r && r.checked)) ? Math.max(1, Math.min(120, +n.value || 1)) : 1; };
    const preview = () => {
      const h = panel.querySelector('#f-prev'), n = nOf(), v = C.parseMoney(panel.querySelector('#f-val').value), d = panel.querySelector('#f-date').value;
      const rb = panel.querySelector('#f-repbox'); if (rb) rb.hidden = !panel.querySelector('#f-rep').checked;
      panel.querySelector('#f-vallbl').textContent = type === 'cred' && n > 1 ? 'Valor total da compra (R$)' : 'Valor (R$)';
      let txt = '';
      if (type === 'cred') {
        const card = accById(panel.querySelector('#f-acc').value);
        if (card && d) {
          const c0 = C.cardCycle(card, d).comp;
          txt = n > 1 ? `${n}x de ${C.brl(M.splitAmount(v || 0, n)[1])}, nas faturas de ${shortM(c0)} a ${shortM(C.mAdd(c0, n - 1))}.` : `Entra na fatura de ${C.monthLabel(c0).toLowerCase()}.`;
        }
      } else if (n > 1 && d) txt = `${n} lançamentos de ${C.brl(v || 0)}, de ${shortM(d.slice(0, 7))} a ${shortM(C.mAdd(d.slice(0, 7), n - 1))}.`;
      h.textContent = txt;
    };
    panel.oninput = preview; panel.onchange = preview; preview();
    panel.querySelector('#f-cancel').onclick = closeSheet;
    if (tx) panel.querySelector('#f-del').onclick = async () => {
      let scope = 'one';
      if (tx.seriesId) { scope = await askChoice('Excluir', 'Este lançamento faz parte de uma série.', [{ label: 'Só este', value: 'one' }, { label: 'Este e os seguintes', value: 'next', danger: true }]); if (!scope) return; }
      else if (!(await confirmBox('Excluir este lançamento?'))) return;
      let n = 1;
      await sync.commit(s => { const cur = s.tx.find(t => t.id === tx.id); if (!cur) return; if (scope === 'next') n = M.removeSeriesFrom(s, cur); else M.removeRecord(s, 'tx', tx.id); });
      closeSheet(); toast(n > 1 ? `${n} lançamentos excluídos.` : 'Lançamento excluído.');
    };
    panel.querySelector('#f-save').onclick = async () => {
      const amount = C.parseMoney(panel.querySelector('#f-val').value);
      const date = panel.querySelector('#f-date').value;
      const accountId = panel.querySelector('#f-acc') && panel.querySelector('#f-acc').value;
      const itemId = panel.querySelector('#f-item') ? panel.querySelector('#f-item').value : '';
      const toAccountId = panel.querySelector('#f-to') ? panel.querySelector('#f-to').value : '';
      if (!(amount > 0)) return toast('Informe um valor maior que zero.', true);
      if (!date) return toast('Informe a data.', true);
      if (!accountId) return toast(type === 'cred' ? 'Cadastre um cartão em Contas.' : 'Escolha a conta.', true);
      if (type !== 'trf' && !itemId) return toast('Escolha a categoria.', true);
      if (type === 'trf' && (!toAccountId || toAccountId === accountId)) return toast('Escolha contas diferentes de origem e destino.', true);
      const status = type === 'cred' ? 'pend' : (panel.querySelector('#f-pend').checked ? 'pend' : 'liq');
      const desc = panel.querySelector('#f-desc').value.trim();
      const fields = { type, amount, date, accountId, itemId, toAccountId, desc, status };
      const n = nOf();
      let scope = 'one';
      if (tx && tx.seriesId) { scope = await askChoice('Salvar alteração', 'Este lançamento faz parte de uma série.', [{ label: 'Só este', value: 'one' }, { label: 'Este e os seguintes', value: 'next' }]); if (!scope) return; }
      const card = type === 'cred' ? accById(accountId) : null;
      ui.month = type === 'cred' ? (tx && tx.comp && tx.date === date ? tx.comp : C.cardCycle(card, date).comp) : C.mOf(date);
      let count = 1;
      await sync.commit(s => {
        if (tx) {
          const cur = s.tx.find(t => t.id === tx.id); if (!cur) return;
          if (scope === 'next') { const f = { amount, desc, itemId, accountId, status, date }; if (type === 'trf') f.toAccountId = toAccountId; count = M.editSeriesFrom(s, cur, f); return; }
          const nw = M.newTx(fields);
          ['type', 'amount', 'date', 'accountId', 'itemId', 'desc', 'status'].forEach(k => { cur[k] = nw[k]; });
          if (type === 'trf') cur.toAccountId = toAccountId; else delete cur.toAccountId;
          if (cur.type !== 'cred') delete cur.comp;
          else if (!cur.seriesId || tx.date !== date || tx.accountId !== accountId) delete cur.comp;
          M.touch(cur);
        } else if (n > 1) { const list = M.makeSeries(fields, n, card ? C.cardCycle(card, date).comp : null); s.tx.push(...list); count = list.length; }
        else s.tx.push(M.newTx(fields));
      });
      closeSheet(); render(); toast(tx ? (count > 1 ? `${count} lançamentos atualizados.` : 'Lançamento atualizado.') : (count > 1 ? `${count} lançamentos criados.` : 'Lançamento salvo.'));
    };
  };
  openSheet('', draw);
  setTimeout(() => { const v = $('#f-val'); if (v && !tx) v.focus(); }, 50);
}

/* ----- resumo ----- */
function pageResumo() {
  const st = S(), m = ui.month;
  const sum = C.monthSummary(st, m), cats = C.byCategory(st, m), recs = C.byCategory(st, m, 'receita');
  const series = C.monthSeries(st, m, 6);
  const max = Math.max(1, ...series.map(x => Math.max(x.rec, x.desp)));
  const W = 320, H = 150, bw = 18, gap = W / 6;
  const bars = series.map((x, i) => {
    const x0 = i * gap + gap / 2 - bw - 1, hr = Math.round(x.rec / max * (H - 30)), hd = Math.round(x.desp / max * (H - 30));
    return `<rect x="${x0}" y="${H - 20 - hr}" width="${bw}" height="${hr}" rx="3" class="b-rec"><title>Receitas ${shortM(x.m)}: ${C.brl(x.rec)}</title></rect>
      <rect x="${x0 + bw + 2}" y="${H - 20 - hd}" width="${bw}" height="${hd}" rx="3" class="b-desp"><title>Despesas ${shortM(x.m)}: ${C.brl(x.desp)}</title></rect>
      <text x="${i * gap + gap / 2}" y="${H - 5}" text-anchor="middle" class="ax ${x.m === m ? 'cur' : ''}">${shortM(x.m)}</text>`;
  }).join('');
  const catHTML = (list, total) => list.length ? list.map(g => `<details class="cat"><summary><span class="sw" style="background:${g.color}"></span><span class="grow">${esc(g.name)}</span><span class="num">${C.brl(g.total)}</span></summary>
      <div class="bar"><i style="width:${Math.max(2, g.total / total * 100).toFixed(1)}%;background:${g.color}"></i></div>
      <ul class="sublist">${g.items.map(i => `<li><span class="grow">${esc(i.name)} <small class="hint">(${i.n})</small></span><span class="num">${C.brl(i.total)}</span></li>`).join('')}</ul></details>`).join('')
    : '<p class="hint">Nada neste mês.</p>';
  $('#page').innerHTML = monthNav(m) + `<div class="kpis"><div class="kpi"><small>Receitas</small><b class="num pos">${C.brl(sum.rec)}</b></div>
      <div class="kpi"><small>Despesas</small><b class="num neg">${C.brl(sum.desp)}</b></div>
      <div class="kpi"><small>Resultado</small><b class="num ${sum.saldo < 0 ? 'neg' : ''}">${C.brl(sum.saldo)}</b></div></div>
    <div class="cols"><div class="card"><h2>Despesas por grupo</h2>${catHTML(cats, sum.desp || 1)}</div>
    <div><div class="card"><h2>Últimos 6 meses</h2><svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Receitas e despesas dos últimos 6 meses">${bars}</svg>
      <p class="legend"><span class="sw b-rec"></span>Receitas <span class="sw b-desp"></span>Despesas</p></div>
    <div class="card"><h2>Receitas</h2>${catHTML(recs, sum.rec || 1)}</div></div></div>`;
  $('#page').onclick = e => { const mb = e.target.closest('[data-m]'); if (mb) { ui.month = C.mAdd(ui.month, +mb.dataset.m); pageResumo(); } };
}

/* ----- contas e faturas ----- */
function pageContas() {
  const st = S(), today = M.todayISO();
  const bal = C.balances(st, today, true), proj = C.balances(st, today.slice(0, 7) + '-31', false);
  const debs = st.accounts.filter(a => a.nature === 'debito' && a.active !== false);
  const cards = st.accounts.filter(a => a.nature === 'credito' && a.active !== false);
  const archived = st.accounts.filter(a => a.active === false);
  const total = debs.reduce((s, a) => s + (bal[a.id] || 0), 0);
  let html = `<div class="cols"><div class="card"><h2>Saldo hoje</h2><div class="num" style="font-size:28px;font-weight:700">${C.brl(total)}</div>
    <p class="hint">Só o que já foi pago ou recebido.</p><ul class="list wrap">${debs.map(a => `<li data-acc="${a.id}"><span class="t"><b>${esc(a.name)}</b>
      <small>No fim do mês, com pendentes: ${C.brl(proj[a.id] || 0)}</small></span><span class="num ${bal[a.id] < 0 ? 'neg' : ''}">${C.brl(bal[a.id] || 0)}</span></li>`).join('')}</ul>
    <button class="link" data-new="debito">+ Nova conta</button></div>`;
  html += `<div class="card"><h2>Cartões</h2>${cards.length ? '<p class="hint">Toque no cartão para ver as faturas.</p>' : '<p class="hint">Nenhum cartão cadastrado.</p>'}<ul class="list wrap">${cards.map(c => {
    const comp = C.cardCycle(c, today).comp, f = C.faturaOf(st, c.id, comp);
    return `<li data-card="${c.id}"><span class="t"><b>${esc(c.name)}</b><small>Fatura aberta: ${C.monthLabel(comp).toLowerCase()} · vence ${C.fmtD(f.date)}</small></span><span class="num">${C.brl(f.total)}</span></li>`;
  }).join('')}</ul><button class="link" data-new="credito">+ Novo cartão</button></div></div>
  ${archived.length ? `<div class="card"><h2>Arquivadas</h2><ul class="list">${archived.map(a => `<li data-acc="${a.id}"><span class="t"><b>${esc(a.name)}</b><small>${a.nature === 'credito' ? 'Cartão' : 'Conta'} arquivado</small></span></li>`).join('')}</ul></div>` : ''}`;
  $('#page').innerHTML = html;
  $('#page').onclick = e => {
    const n = e.target.closest('[data-new]'); if (n) return accSheet(null, n.dataset.new);
    const c = e.target.closest('[data-card]'); if (c) return faturaSheet(c.dataset.card);
    const li = e.target.closest('[data-acc]'); if (li) accSheet(accById(li.dataset.acc));
  };
}

function faturaSheet(cardId, comp) {
  const card = accById(cardId);
  comp = comp || C.cardCycle(card, M.todayISO()).comp;
  openSheet('', panel => {
    const f = C.faturaOf(S(), cardId, comp), paid = f.status === 'liq';
    panel.innerHTML = `<h2>${esc(card.name)}</h2>
      <div class="month"><button data-c="-1" aria-label="Fatura anterior">‹</button><b>Fatura de ${C.monthLabel(comp).toLowerCase()}</b><button data-c="1" aria-label="Próxima fatura">›</button></div>
      <div class="kpis two"><div class="kpi"><small>Total</small><b class="num">${C.brl(f.total)}</b></div><div class="kpi"><small>Vencimento</small><b>${C.fmtD(f.date)}/${f.date.slice(0, 4)}</b></div></div>
      <p class="hint">${paid ? '✓ Paga' : 'Ainda não paga'} · paga pela conta ${esc((accById(f.accountId) || {}).name || '—')}.</p>
      ${f.list.length ? `<ul class="list">${f.list.map(t => txRow(t, true)).join('')}</ul>` : '<p class="empty">Nenhuma compra nesta fatura.</p>'}
      <div class="actions"><button class="btn" id="fa-edit">Editar cartão</button><button class="btn" id="fa-new">+ Compra</button>${f.list.length ? `<button class="btn ${paid ? '' : 'primary'}" id="fa-pay">${paid ? 'Marcar não paga' : 'Marcar paga'}</button>` : ''}</div>`;
    panel.onclick = async e => {
      const b = e.target.closest('[data-c]'); if (b) { comp = C.mAdd(comp, +b.dataset.c); return faturaSheet(cardId, comp); }
      const li = e.target.closest('[data-tx]'); if (li) return txSheet(S().tx.find(t => t.id === li.dataset.tx));
      if (e.target.id === 'fa-edit') return accSheet(card);
      if (e.target.id === 'fa-new') return txSheet(null, { type: 'cred', accountId: cardId });
      if (e.target.id === 'fa-pay') {
        await sync.commit(s => { s.faturaMeta[f.key] = Object.assign({}, s.faturaMeta[f.key], { status: paid ? 'pend' : 'liq', upd: Date.now() }); });
        toast(paid ? 'Fatura marcada como não paga.' : 'Fatura marcada como paga. O valor sai do saldo da conta.');
        faturaSheet(cardId, comp);
      }
    };
  });
}

function accSheet(acc, nature) {
  nature = acc ? acc.nature : nature;
  const credit = nature === 'credito';
  openSheet('', panel => {
    panel.innerHTML = `<h2>${acc ? 'Editar' : 'Novo'} ${credit ? 'cartão' : 'conta'}</h2>
      <label for="a-name">Nome</label><input id="a-name" value="${esc(acc ? acc.name : '')}">
      ${credit ? `<div class="grid2"><div><label>Fecha no dia</label><input id="a-close" inputmode="numeric" value="${acc ? acc.closeDay : ''}"></div>
        <div><label>Vence no dia</label><input id="a-due" inputmode="numeric" value="${acc ? acc.dueDay : ''}"></div></div>
        <label>Fatura paga pela conta</label><select id="a-pay">${optAccounts('debito', acc && acc.payAccount)}</select>`
        : `<label for="a-ini">Saldo inicial (R$)</label><input id="a-ini" inputmode="decimal" value="${acc ? String(acc.initial).replace('.', ',') : ''}" placeholder="0,00">`}
      <div class="actions">${acc ? `<button class="btn ${acc.active === false ? '' : 'danger'}" id="a-off">${acc.active === false ? 'Reativar' : 'Arquivar'}</button>` : ''}<button class="btn" id="a-cancel">Cancelar</button><button class="btn primary" id="a-save">Salvar</button></div>
      ${acc ? '<p class="hint">Arquivar esconde das listas, mas mantém os lançamentos antigos.</p>' : ''}`;
    panel.querySelector('#a-cancel').onclick = closeSheet;
    if (acc) panel.querySelector('#a-off').onclick = async () => {
      const on = acc.active === false;
      if (!on && !(await confirmBox(`Arquivar ${acc.name}?`))) return;
      await sync.commit(s => { const a = s.accounts.find(x => x.id === acc.id); a.active = on; M.touch(a); }); closeSheet(); toast(on ? 'Reativado.' : 'Arquivado.');
    };
    panel.querySelector('#a-save').onclick = async () => {
      const name = panel.querySelector('#a-name').value.trim(); if (!name) return toast('Dê um nome.', true);
      const f = { nature, name };
      if (credit) {
        f.closeDay = +panel.querySelector('#a-close').value; f.dueDay = +panel.querySelector('#a-due').value; f.payAccount = panel.querySelector('#a-pay').value;
        if (!(f.closeDay >= 1 && f.closeDay <= 31 && f.dueDay >= 1 && f.dueDay <= 31)) return toast('Dias de 1 a 31.', true);
        if (!f.payAccount) return toast('Cadastre antes uma conta para pagar a fatura.', true);
      } else f.initial = C.parseMoney(panel.querySelector('#a-ini').value);
      await sync.commit(s => {
        if (acc) { const a = s.accounts.find(x => x.id === acc.id); Object.assign(a, f); M.touch(a); }
        else s.accounts.push(M.newAccount(f));
      });
      closeSheet(); toast('Salvo.');
    };
  });
}

/* ----- categorias ----- */
const KINDS = [['despesa', 'Despesas'], ['receita', 'Receitas'], ['reserva', 'Reservas']];
const COLORS = ['#e0574f', '#ec7a6a', '#e98b3a', '#d9534f', '#c26b9e', '#b56cc9', '#7b55c7', '#5c6bc0', '#1e88e5', '#00897b', '#2e9e6b', '#7cbf3a', '#8d6e63', '#607d8b', '#9e9e9e'];

function pageCategorias() {
  const st = S(), kind = ui.catKind || 'despesa';
  const groups = st.groups.filter(g => g.kind === kind);
  $('#page').innerHTML = `<div class="seg" id="kseg">${KINDS.map(([k, l]) => `<button data-k="${k}" aria-pressed="${k === kind}">${l}</button>`).join('')}</div>
    <p class="hint">Toque num grupo ou numa categoria para renomear, mover, juntar ou arquivar.</p>
    ${groups.map(g => {
      const items = st.items.filter(i => i.groupId === g.id);
      return `<div class="card"><div class="ghead" data-g="${g.id}"><span class="sw" style="background:${g.color}"></span><b class="grow">${esc(g.name)}</b><span class="hint">${items.length}</span></div>
        <ul class="list">${items.map(i => `<li data-i="${i.id}"><span class="t"><b class="${i.active === false ? 'off' : ''}">${esc(i.name)}</b>${i.active === false ? '<small>arquivada</small>' : ''}</span></li>`).join('')}</ul>
        <button class="link" data-addi="${g.id}">+ Categoria</button></div>`;
    }).join('')}
    <button class="btn block" id="addg">+ Novo grupo de ${KINDS.find(k => k[0] === kind)[1].toLowerCase()}</button>`;
  $('#page').onclick = e => {
    const k = e.target.closest('[data-k]'); if (k) { ui.catKind = k.dataset.k; return pageCategorias(); }
    const g = e.target.closest('[data-g]'); if (g) return groupSheet(st.groups.find(x => x.id === g.dataset.g));
    const a = e.target.closest('[data-addi]'); if (a) return itemSheet(null, a.dataset.addi);
    const i = e.target.closest('[data-i]'); if (i) return itemSheet(itemById(i.dataset.i));
    if (e.target.id === 'addg') groupSheet(null, kind);
  };
}

function groupSheet(g, kind) {
  kind = g ? g.kind : kind;
  let color = g ? g.color : COLORS[Math.floor(Math.random() * COLORS.length)];
  openSheet('', panel => {
    const used = g && S().items.some(i => i.groupId === g.id);
    panel.innerHTML = `<h2>${g ? 'Editar grupo' : 'Novo grupo'}</h2><label for="g-name">Nome</label><input id="g-name" value="${esc(g ? g.name : '')}">
      <label>Cor</label><div class="colors">${COLORS.map(c => `<button type="button" data-color="${c}" style="background:${c}" aria-pressed="${c === color}" aria-label="Cor"></button>`).join('')}</div>
      <div class="actions">${g ? `<button class="btn danger" id="g-del" ${used ? 'disabled' : ''}>Excluir</button>` : ''}<button class="btn" id="g-cancel">Cancelar</button><button class="btn primary" id="g-save">Salvar</button></div>
      ${used ? '<p class="hint">Para excluir o grupo, mova ou junte antes as categorias dele.</p>' : ''}`;
    panel.querySelector('.colors').onclick = e => { const b = e.target.closest('[data-color]'); if (!b) return; color = b.dataset.color; panel.querySelectorAll('[data-color]').forEach(x => x.setAttribute('aria-pressed', x === b)); };
    panel.querySelector('#g-cancel').onclick = closeSheet;
    if (g) panel.querySelector('#g-del').onclick = async () => { if (!(await confirmBox(`Excluir o grupo ${g.name}?`))) return; await sync.commit(s => M.removeRecord(s, 'groups', g.id)); closeSheet(); };
    panel.querySelector('#g-save').onclick = async () => {
      const name = panel.querySelector('#g-name').value.trim(); if (!name) return toast('Dê um nome.', true);
      await sync.commit(s => { if (g) { const x = s.groups.find(y => y.id === g.id); x.name = name; x.color = color; M.touch(x); } else s.groups.push(M.newGroup(kind, name, color)); });
      closeSheet();
    };
  });
}

function itemSheet(it, groupId) {
  const st = S(), g = it ? groupOf(it) : st.groups.find(x => x.id === groupId), kind = g.kind;
  const uses = it ? st.tx.filter(t => t.itemId === it.id).length : 0;
  openSheet('', panel => {
    panel.innerHTML = `<h2>${it ? 'Editar categoria' : 'Nova categoria'}</h2>
      <label for="i-name">Nome</label><input id="i-name" value="${esc(it ? it.name : '')}">
      <label for="i-group">Grupo</label><select id="i-group">${st.groups.filter(x => x.kind === kind).map(x => `<option value="${x.id}" ${x.id === g.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
      ${it ? `<p class="hint">${uses} lançamento(s) usam esta categoria.</p>
        <details class="merge"><summary>Juntar com outra categoria</summary><p class="hint">Os lançamentos passam para a categoria escolhida e esta é apagada. Útil para categorias repetidas.</p>
        <select id="i-merge"><option value="">Escolha…</option>${optItems(kind, '').replace(`<option value="${it.id}" >`, `<option value="${it.id}" disabled>`)}</select>
        <button class="btn block" id="i-domerge" style="margin-top:8px">Juntar</button></details>` : ''}
      <div class="actions">${it ? `<button class="btn ${it.active === false ? '' : 'danger'}" id="i-off">${uses ? (it.active === false ? 'Reativar' : 'Arquivar') : 'Excluir'}</button>` : ''}<button class="btn" id="i-cancel">Cancelar</button><button class="btn primary" id="i-save">Salvar</button></div>
      ${it && uses ? '<p class="hint">Arquivada, a categoria some das listas de escolha, mas os lançamentos antigos continuam com ela.</p>' : ''}`;
    panel.querySelector('#i-cancel').onclick = closeSheet;
    if (it) {
      panel.querySelector('#i-off').onclick = async () => {
        if (!uses) { if (!(await confirmBox(`Excluir a categoria ${it.name}?`))) return; await sync.commit(s => M.removeRecord(s, 'items', it.id)); return closeSheet(); }
        await sync.commit(s => { const x = s.items.find(y => y.id === it.id); x.active = x.active === false; M.touch(x); }); closeSheet();
      };
      panel.querySelector('#i-domerge').onclick = async () => {
        const to = panel.querySelector('#i-merge').value; if (!to || to === it.id) return toast('Escolha a categoria de destino.', true);
        const dest = itemById(to);
        if (!(await confirmBox(`Passar ${uses} lançamento(s) de "${it.name}" para "${dest.name}" e apagar "${it.name}"?`))) return;
        let n = 0; await sync.commit(s => { n = M.mergeItems(s, it.id, to); }); closeSheet(); toast(`${n} lançamento(s) movidos para ${dest.name}.`);
      };
    }
    panel.querySelector('#i-save').onclick = async () => {
      const name = panel.querySelector('#i-name').value.trim(), gid = panel.querySelector('#i-group').value; if (!name) return toast('Dê um nome.', true);
      await sync.commit(s => { if (it) { const x = s.items.find(y => y.id === it.id); x.name = name; x.groupId = gid; M.touch(x); } else s.items.push(M.newItem(gid, name)); });
      closeSheet();
    };
  });
}

/* ----- ajustes ----- */
function syncBoxHTML() {
  const info = sync.syncInfo(), st = sync.currentStatus();
  const when = info.lastSync ? new Date(info.lastSync).toLocaleString('pt-BR') : 'nunca';
  const msg = { ok: 'Tudo salvo no Drive.', syncing: 'Sincronizando…', offline: 'Sem internet. As alterações ficam neste aparelho até a conexão voltar.', login: 'O acesso ao Drive venceu ou ainda não foi feito. Reconecte para enviar as alterações.', error: 'Erro: ' + (st.msg || 'desconhecido'), local: 'Salvo neste aparelho.' }[st.state];
  return `<p class="hint">${esc(msg)}<br>Última sincronização: ${esc(when)}${info.dirty ? ' · há alterações a enviar' : ''}</p>`;
}

function pageAjustes() {
  const st = S(), info = sync.syncInfo();
  const signed = auth.isSignedIn();
  $('#page').innerHTML = `
    <div class="card"><h2>Conta Google</h2><p class="hint">${info.email ? `Dados guardados no Drive de <b>${esc(info.email)}</b>, pasta <b>${esc(drive.FOLDER)}</b>.` : (signed ? 'Conectado. Identificando a conta…' : 'Não conectado neste momento. Os dados continuam salvos neste aparelho.')}</p>
      <div id="syncBox">${syncBoxHTML()}</div>
      <div class="row"><button class="btn" data-act="sync">Sincronizar agora</button>${signed ? '' : '<button class="btn primary" data-act="reconnect">Reconectar</button>'}</div></div>
    <div class="card"><h2>CPF para faturas com senha</h2>
      <p class="hint">${st.profile.cpf6 ? 'Cadastrado (6 primeiros dígitos).' : 'Não cadastrado. Faturas com senha vão pedir a senha toda vez.'}</p>
      <div class="row"><button class="btn" data-act="cpf">${st.profile.cpf6 ? 'Alterar' : 'Cadastrar'}</button>${st.profile.cpf6 ? '<button class="btn danger" data-act="cpfdel">Remover</button>' : ''}</div></div>
    <div class="card"><h2>Categorias</h2><p class="hint">${st.items.filter(i => i.active !== false).length} categorias em ${st.groups.length} grupos.</p>
      <button class="btn" data-act="cats">Gerenciar categorias</button></div>
    <div class="card"><h2>Backup</h2><p class="hint">Os dados já ficam no seu Drive. Este arquivo é uma cópia extra que você guarda onde quiser.</p>
      <div class="row"><button class="btn" data-act="export">Baixar backup</button><button class="btn" data-act="import">Importar backup</button></div>
      <input type="file" id="impfile" accept=".json,application/json" hidden></div>
    <div class="card"><h2>Este aparelho</h2><p class="hint">Sair desconecta o Google. Remover apaga a cópia deste aparelho; os dados continuam no Drive.</p>
      <div class="row"><button class="btn" data-act="logout">Sair</button><button class="btn danger" data-act="forget">Remover dados deste aparelho</button></div></div>
    <p class="hint" style="text-align:center">Finanças ${VERSION}</p>`;
  $('#impfile').onchange = ev => importFile(ev.target.files[0], false);
  $('#page').onclick = async e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const a = b.dataset.act;
    if (a === 'sync') { if (!auth.isSignedIn()) return reconnect(); sync.sync(); }
    if (a === 'reconnect') reconnect();
    if (a === 'cats') { ui.sub = 'cats'; render(); window.scrollTo(0, 0); }
    if (a === 'cpf') cpfSheet();
    if (a === 'cpfdel') { if (await confirmBox('Remover o CPF? Faturas com senha vão pedir a senha.')) { await sync.commit(s => { s.profile = { cpf6: '', upd: Date.now() }; }); render(); } }
    if (a === 'export') exportBackup();
    if (a === 'import') $('#impfile').click();
    if (a === 'logout') { auth.signOut(); toast('Desconectado. Os dados continuam neste aparelho e no Drive.'); render(); }
    if (a === 'forget') {
      if (sync.syncInfo().dirty && !(await confirmBox('Há alterações que ainda não foram para o Drive e serão perdidas. Remover mesmo assim?'))) return;
      if (!(await confirmBox('Remover os dados deste aparelho? Eles continuam no seu Drive.'))) return;
      auth.signOut(); await sync.forgetDevice(); route();
    }
  };
}

function cpfSheet() {
  openSheet('', panel => {
    panel.innerHTML = `<h2>CPF</h2><label for="c-cpf">CPF</label><input id="c-cpf" inputmode="numeric" autocomplete="off" placeholder="000.000.000-00">
      <p class="hint">Só os 6 primeiros dígitos são guardados.</p>
      <div class="actions"><button class="btn" id="c-cancel">Cancelar</button><button class="btn primary" id="c-save">Salvar</button></div>`;
    panel.querySelector('#c-cancel').onclick = closeSheet;
    panel.querySelector('#c-save').onclick = async () => {
      const v = M.cpf6From(panel.querySelector('#c-cpf').value);
      if (!v) return toast('Digite pelo menos os 6 primeiros dígitos.', true);
      await sync.commit(s => { s.profile = { cpf6: v, upd: Date.now() }; });
      closeSheet(); toast('CPF salvo.'); render();
    };
  });
}

function exportBackup() {
  const blob = new Blob([JSON.stringify(S(), null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'financas-backup-' + M.todayISO() + '.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

async function importFile(file, fromWizard) {
  if (!file) return;
  try {
    const obj = JSON.parse(await file.text());
    const st = M.importLegacy(obj);
    const n = st.tx.length, na = st.accounts.length;
    const msg = fromWizard ? `Importar ${n} lançamentos e ${na} contas/cartões?`
      : `Substituir TODOS os dados atuais por este backup (${n} lançamentos, ${na} contas/cartões)? Os dados atuais serão perdidos, inclusive no Drive.`;
    if (!(await confirmBox(msg))) return;
    if (!fromWizard) {
      const cur = S(); const t = Date.now();
      M.COLLS.forEach(k => (cur[k] || []).forEach(r => { if (!st[k].some(x => x.id === r.id)) st.deleted[r.id] = t; }));
    }
    if (!st.profile.cpf6 && S() && S().profile.cpf6) st.profile = S().profile;
    st.profile.upd = st.config.upd = Date.now();
    wz = null;
    await sync.replace(st);
    toast('Backup importado.');
    render();
  } catch (e) { toast(e.message.startsWith('Arquivo') ? e.message : 'Não foi possível ler o arquivo: ' + e.message, true); }
}

boot();
