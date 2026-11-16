/* Finanças · Fase 1 — núcleo: login, dados no aparelho + Drive, primeira configuração e telas básicas. */
import * as auth from './auth.js';
import * as sync from './sync.js';
import * as drive from './drive.js';
import * as M from './model.js';
import * as C from './calc.js';

export const VERSION = '0.1.2';
const CID_KEY = 'fin.cfg.clientId';
const clientId = () => (window.FIN_CONFIG && FIN_CONFIG.clientId) || (() => { try { return localStorage.getItem(CID_KEY) || ''; } catch { return ''; } })();

const $ = s => document.querySelector(s);
const app = () => $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const S = () => sync.state();

let ui = { tab: 'lanc', month: M.todayISO().slice(0, 7) };
let toastT = null;
function toast(msg, bad) {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast on' + (bad ? ' bad' : '');
  clearTimeout(toastT); toastT = setTimeout(() => { t.className = 'toast'; }, 3200);
}
const confirmBox = msg => Promise.resolve(window.confirm(msg));

/* ---------- ícones ---------- */
const ICON = {
  lanc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
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
  const tabs = [['lanc', 'Lançamentos'], ['contas', 'Contas'], ['ajustes', 'Ajustes']];
  const title = { lanc: 'Lançamentos', contas: 'Contas', ajustes: 'Ajustes' }[ui.tab];
  app().innerHTML = `<div class="shell"><header class="top"><h1>${title}</h1><button class="chip" id="chip"><i></i><span></span></button></header>
    <main class="page" id="page"></main>
    ${ui.tab === 'lanc' ? '<button class="fab" id="fab" aria-label="Novo lançamento">+</button>' : ''}
    <nav class="tabs">${tabs.map(([k, l]) => `<button data-tab="${k}" ${ui.tab === k ? 'aria-current="page"' : ''}>${ICON[k]}<span>${l}</span></button>`).join('')}</nav></div>`;
  app().querySelector('.tabs').onclick = e => { const b = e.target.closest('[data-tab]'); if (b) { ui.tab = b.dataset.tab; render(); window.scrollTo(0, 0); } };
  $('#chip').onclick = chipAction;
  if ($('#fab')) $('#fab').onclick = () => txSheet();
  ({ lanc: pageLanc, contas: pageContas, ajustes: pageAjustes })[ui.tab]();
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

/* ----- lançamentos ----- */
const TYPE = { rec: 'Receita', deb: 'Despesa', cred: 'Cartão', trf: 'Transferência' };
const accById = id => S().accounts.find(a => a.id === id);
const itemById = id => S().items.find(i => i.id === id);
const groupOf = item => item && S().groups.find(g => g.id === item.groupId);

function pageLanc() {
  const st = S(), m = ui.month;
  const sum = C.monthSummary(st, m);
  const list = st.tx.filter(t => ['rec', 'deb', 'trf'].includes(t.type) ? C.mOf(t.date) === m : t.type === 'cred' ? C.txComp(st, t) === m : false)
    .sort((a, b) => (b.date.localeCompare(a.date)) || ((b.created || 0) - (a.created || 0)));
  let html = `<div class="month"><button data-m="-1" aria-label="Mês anterior">‹</button><b>${C.monthLabel(m)}</b><button data-m="1" aria-label="Próximo mês">›</button></div>
    <div class="kpis"><div class="kpi"><small>Receitas</small><b class="num pos">${C.brl(sum.rec)}</b></div>
    <div class="kpi"><small>Despesas</small><b class="num neg">${C.brl(sum.desp)}</b></div>
    <div class="kpi"><small>Resultado</small><b class="num ${sum.saldo < 0 ? 'neg' : ''}">${C.brl(sum.saldo)}</b></div></div>`;
  if (!list.length) html += `<div class="card empty">Nenhum lançamento neste mês.<br>Toque em <b>+</b> para lançar.</div>`;
  else {
    let day = '';
    html += '<div class="card" style="padding-top:2px">';
    list.forEach(t => {
      if (t.date !== day) { if (day) html += '</ul>'; day = t.date; html += `<div class="day">${new Date(t.date + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })}</div><ul class="list">`; }
      const it = itemById(t.itemId), g = groupOf(it), acc = accById(t.accountId);
      const title = t.desc || (it ? it.name : (t.type === 'trf' ? 'Transferência' : 'Sem categoria'));
      const sub = [t.type === 'trf' ? `${acc ? acc.name : '?'} → ${(accById(t.toAccountId) || {}).name || '?'}` : (it && t.desc ? it.name : ''), t.type !== 'trf' && acc ? acc.name : ''].filter(Boolean).join(' · ');
      const sign = t.type === 'rec' ? '' : t.type === 'trf' ? '' : '−';
      const cls = t.type === 'rec' ? 'pos' : t.type === 'trf' ? '' : '';
      html += `<li data-tx="${t.id}"><span class="dot" style="background:${g ? g.color : '#90a4ae'}">${esc((TYPE[t.type] || '?')[0])}</span>
        <span class="t"><b>${esc(title)}</b><small>${esc(sub)}${t.status === 'pend' && t.type !== 'cred' ? '<span class="tag">pendente</span>' : ''}</small></span>
        <span class="num ${cls}">${sign}${C.brl(t.amount)}</span></li>`;
    });
    html += '</ul></div>';
  }
  $('#page').innerHTML = html;
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

function txSheet(tx) {
  const st = S();
  const hasCards = st.accounts.some(a => a.nature === 'credito' && a.active !== false);
  let type = tx ? tx.type : 'deb';
  const draw = panel => {
    const kind = type === 'rec' ? 'receita' : 'despesa';
    const defDate = tx ? tx.date : (ui.month === M.todayISO().slice(0, 7) ? M.todayISO() : ui.month + '-01');
    const accSel = tx && tx.type === type ? tx.accountId : '';
    panel.innerHTML = `<h2>${tx ? 'Editar lançamento' : 'Novo lançamento'}</h2>
      <div class="seg" id="seg">${['deb', 'cred', 'rec', 'trf'].filter(k => k !== 'cred' || hasCards || type === 'cred').map(k => `<button type="button" data-type="${k}" aria-pressed="${k === type}">${TYPE[k]}</button>`).join('')}</div>
      <label for="f-val">Valor (R$)</label><input id="f-val" inputmode="decimal" value="${tx ? String(tx.amount).replace('.', ',') : ''}" placeholder="0,00">
      <label for="f-date">${type === 'cred' ? 'Data da compra' : 'Data'}</label><input id="f-date" type="date" value="${esc(defDate)}">
      <label for="f-desc">Descrição</label><input id="f-desc" value="${esc(tx ? tx.desc : '')}" placeholder="Opcional">
      ${type === 'trf' ? `<label>De</label><select id="f-acc">${optAccounts('debito', accSel)}</select><label>Para</label><select id="f-to">${optAccounts('debito', tx && tx.toAccountId)}</select>`
        : `<label for="f-item">Categoria</label><select id="f-item"><option value="">Escolha…</option>${optItems(kind, tx && tx.itemId)}</select>
           <label for="f-acc">${type === 'cred' ? 'Cartão' : 'Conta'}</label><select id="f-acc">${optAccounts(type === 'cred' ? 'credito' : 'debito', accSel)}</select>`}
      ${type === 'cred' ? '<p class="hint" id="f-comp"></p>' : `<label class="check"><input type="checkbox" id="f-pend" ${tx && tx.status === 'pend' ? 'checked' : ''}> Ainda não ${type === 'rec' ? 'recebido' : 'pago'} (pendente)</label>`}
      <div class="actions">${tx ? '<button class="btn danger" id="f-del">Excluir</button>' : ''}<button class="btn" id="f-cancel">Cancelar</button><button class="btn primary" id="f-save">Salvar</button></div>`;
    panel.querySelector('#seg').onclick = e => { const b = e.target.closest('[data-type]'); if (b) { type = b.dataset.type; draw(panel); } };
    const compHint = () => {
      const h = panel.querySelector('#f-comp'); if (!h) return;
      const card = accById(panel.querySelector('#f-acc').value), d = panel.querySelector('#f-date').value;
      h.textContent = card && d ? `Entra na fatura de ${C.monthLabel(C.cardCycle(card, d).comp).toLowerCase()}.` : '';
    };
    panel.oninput = compHint; compHint();
    panel.querySelector('#f-cancel').onclick = closeSheet;
    if (tx) panel.querySelector('#f-del').onclick = async () => {
      if (!(await confirmBox('Excluir este lançamento?'))) return;
      await sync.commit(s => M.removeRecord(s, 'tx', tx.id)); closeSheet(); toast('Lançamento excluído.');
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
      const fields = { type, amount, date, accountId, itemId, toAccountId, desc: panel.querySelector('#f-desc').value, status };
      ui.month = type === 'cred' ? C.cardCycle(accById(accountId), date).comp : C.mOf(date);
      await sync.commit(s => {
        if (tx) {
          const cur = s.tx.find(t => t.id === tx.id); if (!cur) return;
          const n = M.newTx(fields);
          ['type', 'amount', 'date', 'accountId', 'itemId', 'desc', 'status'].forEach(k => { cur[k] = n[k]; });
          if (type === 'trf') cur.toAccountId = toAccountId; else delete cur.toAccountId;
          if (cur.type !== 'cred') delete cur.comp;
          M.touch(cur);
        } else s.tx.push(M.newTx(fields));
      });
      closeSheet(); render(); toast(tx ? 'Lançamento atualizado.' : 'Lançamento salvo.');
    };
  };
  openSheet('', draw);
  setTimeout(() => { const v = $('#f-val'); if (v && !tx) v.focus(); }, 50);
}

/* ----- contas ----- */
function pageContas() {
  const st = S(), today = M.todayISO();
  const bal = C.balances(st, today, true), proj = C.balances(st, C.mAdd(today.slice(0, 7), 0) + '-31', false);
  const debs = st.accounts.filter(a => a.nature === 'debito' && a.active !== false);
  const cards = st.accounts.filter(a => a.nature === 'credito' && a.active !== false);
  const total = debs.reduce((s, a) => s + (bal[a.id] || 0), 0);
  const fats = C.faturas(st);
  let html = `<div class="card"><h2>Saldo hoje</h2><div class="num" style="font-size:28px;font-weight:700">${C.brl(total)}</div>
    <p class="hint">Só o que já foi pago ou recebido.</p><ul class="list wrap">${debs.map(a => `<li data-acc="${a.id}"><span class="t"><b>${esc(a.name)}</b>
      <small>No fim do mês, com pendentes: ${C.brl(proj[a.id] || 0)}</small></span><span class="num ${bal[a.id] < 0 ? 'neg' : ''}">${C.brl(bal[a.id] || 0)}</span></li>`).join('')}</ul>
    <button class="link" data-new="debito">+ Nova conta</button></div>`;
  html += `<div class="card"><h2>Cartões</h2>${cards.length ? '' : '<p class="hint">Nenhum cartão cadastrado.</p>'}<ul class="list wrap">${cards.map(c => {
    const comp = C.cardCycle(c, today).comp, f = fats.find(x => x.cardId === c.id && x.comp === comp);
    return `<li data-acc="${c.id}"><span class="t"><b>${esc(c.name)}</b><small>Fatura de ${C.monthLabel(comp).toLowerCase()} · vence dia ${c.dueDay}</small></span><span class="num">${C.brl(f ? f.total : 0)}</span></li>`;
  }).join('')}</ul><button class="link" data-new="credito">+ Novo cartão</button></div>`;
  $('#page').innerHTML = html;
  $('#page').onclick = e => {
    const n = e.target.closest('[data-new]'); if (n) return accSheet(null, n.dataset.new);
    const li = e.target.closest('[data-acc]'); if (li) accSheet(accById(li.dataset.acc));
  };
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
      <div class="actions">${acc ? '<button class="btn danger" id="a-off">Arquivar</button>' : ''}<button class="btn" id="a-cancel">Cancelar</button><button class="btn primary" id="a-save">Salvar</button></div>
      ${acc ? '<p class="hint">Arquivar esconde das listas, mas mantém os lançamentos antigos.</p>' : ''}`;
    panel.querySelector('#a-cancel').onclick = closeSheet;
    if (acc) panel.querySelector('#a-off').onclick = async () => {
      if (!(await confirmBox(`Arquivar ${acc.name}?`))) return;
      await sync.commit(s => { const a = s.accounts.find(x => x.id === acc.id); a.active = false; M.touch(a); }); closeSheet(); toast('Arquivado.');
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
