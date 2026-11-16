/* Finanças · Fase 1 — núcleo: login, dados no aparelho + Drive, primeira configuração e telas básicas. */
import * as auth from './auth.js';
import * as sync from './sync.js';
import * as drive from './drive.js';
import * as M from './model.js';
import * as C from './calc.js';
import * as PT from './imp/pdftext.js';
import * as P from './imp/parse.js';
import * as IP from './imp/plan.js';

export const VERSION = '0.4.1';
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
  agenda: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M8 15l2 2 4-4"/></svg>',
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

/* o saldo informado no primeiro acesso vale até ontem: o que for lançado hoje em diante muda o saldo */
const yesterday = () => new Date(Date.parse(M.todayISO() + 'T12:00') - 864e5).toISOString().slice(0, 10);
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
  wz.accounts.forEach(a => { const n = M.newAccount({ nature: 'debito', name: a.name, initial: C.parseMoney(a.initial), initialDate: yesterday() }); idMap[a.id] = n.id; st.accounts.push(n); });
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
  const tabs = [['lanc', 'Lançamentos'], ['agenda', 'Agenda'], ['resumo', 'Resumo'], ['contas', 'Contas'], ['ajustes', 'Ajustes']];
  const title = ui.sub === 'cats' ? 'Categorias' : { lanc: 'Lançamentos', agenda: 'Agenda', resumo: 'Resumo', contas: 'Contas', ajustes: 'Ajustes' }[ui.tab];
  app().innerHTML = `<div class="shell"><header class="top">${ui.sub ? '<button class="back" id="back" aria-label="Voltar">‹</button>' : ''}<h1>${title}</h1><button class="chip" id="chip"><i></i><span></span></button></header>
    <main class="page" id="page"></main>
    ${ui.tab === 'lanc' && !ui.sub ? '<button class="fab" id="fab" aria-label="Novo lançamento">+</button>' : ''}
    <nav class="tabs">${tabs.map(([k, l]) => `<button data-tab="${k}" ${ui.tab === k ? 'aria-current="page"' : ''}>${ICON[k]}<span>${l}</span></button>`).join('')}</nav></div>`;
  app().querySelector('.tabs').onclick = e => { const b = e.target.closest('[data-tab]'); if (b) { ui.tab = b.dataset.tab; ui.sub = null; ui.q = ''; render(); window.scrollTo(0, 0); } };
  $('#chip').onclick = chipAction;
  if ($('#back')) $('#back').onclick = () => { ui.sub = null; render(); };
  if ($('#fab')) $('#fab').onclick = () => txSheet();
  if (ui.sub === 'cats') pageCategorias();
  else ({ lanc: pageLanc, agenda: pageAgenda, resumo: pageResumo, contas: pageContas, ajustes: pageAjustes })[ui.tab]();
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
  if (t.cardPay) {
    const f = t.faturaKey && C.faturas(S()).find(x => x.key === t.faturaKey), card = f && accById(f.cardId);
    return `<li data-tx="${t.id}"><span class="dot" style="background:#607d8b">F</span><span class="t"><b>${esc(t.desc || 'Pagamento de fatura')}</b>
      <small>${showDate ? C.fmtD(t.date) + '/' + t.date.slice(2, 4) + ' · ' : ''}${f ? `fatura ${esc(card ? card.name : '')} ${shortM(f.comp)} · ${f.status === 'liq' ? 'paga' : 'faltam ' + C.brl(f.rest)}` : '<span class="tag">sem vínculo com fatura</span>'}${accById(t.accountId) ? ' · ' + esc(accById(t.accountId).name) : ''}</small></span>
      <span class="num">−${C.brl(t.amount)}</span></li>`;
  }
  const it = itemById(t.itemId), g = groupOf(it), acc = accById(t.accountId);
  const title = t.desc || (it ? it.name : (t.type === 'trf' ? 'Transferência' : 'Sem categoria'));
  const sub = [showDate ? C.fmtD(t.date) + '/' + t.date.slice(2, 4) : '', t.type === 'trf' ? `${acc ? acc.name : '?'} → ${(accById(t.toAccountId) || {}).name || '?'}` : (it && t.desc ? it.name : ''), t.type !== 'trf' && acc ? acc.name : ''].filter(Boolean).join(' · ');
  const tags = (t.seriesId ? `<span class="tag info">${t.seriesIdx}/${t.seriesN}</span>` : '') + (t.status === 'pend' && t.type !== 'cred' ? '<span class="tag">pendente</span>' : '');
  return `<li data-tx="${t.id}"><span class="dot" style="background:${g ? g.color : '#90a4ae'}">${esc((TYPE[t.type] || '?')[0])}</span>
    <span class="t"><b>${esc(title)}</b><small>${esc(sub)}${tags}</small></span>
    <span class="num ${t.type === 'rec' || t.amount < 0 ? 'pos' : ''}">${t.type === 'rec' || t.type === 'trf' ? '' : t.amount < 0 ? '+' : '−'}${C.brl(Math.abs(t.amount))}</span></li>`;
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
  let html = `<div class="search"><input id="q" type="search" placeholder="Buscar em todos os meses" value="${esc(q)}" autocomplete="off"><button class="btn" id="imp" title="Importar fatura ou extrato (PDF, CSV, OFX)">Importar</button></div>`;
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
  $('#imp').onclick = () => pickImportFile({});
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
  if ((tx && tx.cardPay) || (!tx && preset && preset.type === 'pgto')) return payFaturaSheet(tx, preset || {});
  const st = S();
  const hasCards = st.accounts.some(a => a.nature === 'credito' && a.active !== false);
  let type = tx ? tx.type : (preset && preset.type) || 'deb';
  const draw = panel => {
    const kind = type === 'rec' ? 'receita' : 'despesa';
    const defDate = tx ? tx.date : (ui.month === M.todayISO().slice(0, 7) ? M.todayISO() : ui.month + '-01');
    const accSel = tx && tx.type === type ? tx.accountId : (preset && preset.accountId) || '';
    const loanInfo = tx && tx.loanId ? (() => { const l = st.loans.find(x => x.id === tx.loanId); return l ? `<p class="hint">Parte da dívida ${l.dir === 'in' ? 'de' : 'com'} <b>${esc(l.person)}</b>.</p>` : ''; })() : '';
    const origin = tx && tx.origin === 'import' ? `<p class="hint">Importado${tx.rawDesc ? ': ' + esc(tx.rawDesc) : ''}${tx.cardRef ? ' · cartão final ' + esc(tx.cardRef) : ''}.</p>` : '';
    const series = tx && tx.seriesId ? `<p class="hint">${tx.seriesKind === 'parc' ? 'Parcela' : 'Repetição'} ${tx.seriesIdx} de ${tx.seriesN}.</p>` : '';
    const repeat = tx ? '' : type === 'cred'
      ? `<label for="f-n">Parcelas</label><select id="f-n">${Array.from({ length: 24 }, (_, i) => `<option value="${i + 1}">${i ? (i + 1) + 'x' : 'À vista'}</option>`).join('')}</select>`
      : `<label class="check"><input type="checkbox" id="f-rep"> Repetir todo mês <small class="hint">(os meses futuros ficam pendentes na Agenda)</small></label><div id="f-repbox" hidden><label for="f-n">Por quantos meses (contando este)</label><input id="f-n" type="number" inputmode="numeric" min="2" max="120" value="12"></div>`;
    panel.innerHTML = `<h2>${tx ? 'Editar lançamento' : 'Novo lançamento'}</h2>${series}${origin}${loanInfo}
      <div class="seg" id="seg">${['deb', 'cred', 'rec', 'trf'].filter(k => k !== 'cred' || hasCards || type === 'cred').map(k => `<button type="button" data-type="${k}" aria-pressed="${k === type}" ${tx && tx.seriesId && k !== type ? 'disabled' : ''}>${TYPE[k]}</button>`).join('')}</div>
      ${!tx && hasCards ? '<button type="button" class="link" id="f-pgto">Pagar fatura de cartão →</button>' : ''}
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
    if (panel.querySelector('#f-pgto')) panel.querySelector('#f-pgto').onclick = () => payFaturaSheet(null, {});
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
      if (!(amount > 0) && !(type === 'cred' && amount < 0)) return toast('Informe um valor maior que zero (no cartão, use valor negativo para estorno).', true);
      if (!date) return toast('Informe a data.', true);
      if (!accountId) return toast(type === 'cred' ? 'Cadastre um cartão em Contas.' : 'Escolha a conta.', true);
      if (type !== 'trf' && !itemId) return toast('Escolha a categoria.', true);
      if (type === 'trf' && (!toAccountId || toAccountId === accountId)) return toast('Escolha contas diferentes de origem e destino.', true);
      const status = type === 'cred' ? 'pend' : (panel.querySelector('#f-pend').checked ? 'pend' : 'liq');
      const desc = panel.querySelector('#f-desc').value.trim();
      const fields = { type, amount, date, accountId, itemId, toAccountId, desc, status, signed: type === 'cred' };
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
        } else if (n > 1) {
          const list = M.makeSeries(fields, n, card ? C.cardCycle(card, date).comp : null);
          const today = M.todayISO();
          if (type === 'rec' || type === 'deb') list.forEach(x => { if (x.date > today) x.status = 'pend'; }); // o futuro fica pendente até ser confirmado na Agenda
          s.tx.push(...list); count = list.length;
        }
        else s.tx.push(M.newTx(fields));
      });
      closeSheet(); render(); toast(tx ? (count > 1 ? `${count} lançamentos atualizados.` : 'Lançamento atualizado.') : (count > 1 ? `${count} lançamentos criados.` : 'Lançamento salvo.'));
    };
  };
  openSheet('', draw);
  setTimeout(() => { const v = $('#f-val'); if (v && !tx) v.focus(); }, 50);
}

/* ----- importação de faturas e extratos ----- */
let pdfjsLib = null;
async function loadPdfjs() {
  if (pdfjsLib) return pdfjsLib;
  const lib = await import('../vendor/pdfjs/pdf.min.mjs');
  lib.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
  return (pdfjsLib = lib);
}

function busyOverlay(msg) {
  const box = document.createElement('div');
  box.className = 'sheet ask'; box.innerHTML = `<div class="panel center"><div class="spinner"></div><p>${esc(msg)}</p></div>`;
  document.body.appendChild(box);
  return { set: m => { box.querySelector('p').textContent = m; }, close: () => box.remove() };
}

/* pede a senha do PDF; ela é usada só nesta abertura e não é guardada */
function askPassword(wrong) {
  return new Promise(res => {
    const box = document.createElement('div');
    box.className = 'sheet ask';
    box.innerHTML = `<div class="panel"><h2>PDF com senha</h2>
      <p class="hint">${wrong ? 'A senha não abriu o arquivo. ' : ''}Digite a senha do PDF. Ela não é guardada em lugar nenhum.</p>
      <input id="pw" type="password" autocomplete="off" autocapitalize="off" inputmode="text">
      <div class="actions"><button class="btn" data-v="0">Cancelar</button><button class="btn primary" data-v="1">Abrir</button></div></div>`;
    document.body.appendChild(box);
    const inp = box.querySelector('#pw'); setTimeout(() => inp.focus(), 50);
    const done = ok => { const v = inp.value; box.remove(); res(ok ? v : null); };
    box.onclick = e => { const b = e.target.closest('[data-v]'); if (b) done(b.dataset.v === '1'); };
    inp.onkeydown = e => { if (e.key === 'Enter') done(true); };
  });
}

async function readStatement(file) {
  const name = file.name.toLowerCase(), bytes = new Uint8Array(await file.arrayBuffer());
  const isPdf = name.endsWith('.pdf') || file.type === 'application/pdf' || (bytes[0] === 0x25 && bytes[1] === 0x50);
  if (isPdf) {
    const lib = await loadPdfjs();
    const cpf = S().profile.cpf6 || '';
    const tries = cpf ? [cpf.slice(0, 4), cpf.slice(0, 5), cpf.slice(0, 6)] : [];
    const doc = await PT.openPdf(lib, bytes, { tryPasswords: tries, ask: askPassword });
    const pages = await PT.pdfLines(doc);
    if (!pages.some(p => p.length)) throw new Error('Este PDF não tem texto (parece ser uma imagem digitalizada). Baixe a fatura ou o extrato direto do site ou app do banco.');
    return P.parsePdfPages(pages);
  }
  if (name.endsWith('.ofx') || /<OFX>/i.test(new TextDecoder('latin1').decode(bytes.slice(0, 600)))) return P.parseOfx(bytes);
  return P.parseCsv(bytes);
}

function pickImportFile(preset) {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.pdf,.csv,.ofx,.txt,application/pdf,text/csv';
  inp.onchange = () => { if (inp.files[0]) importFlow(inp.files[0], preset); };
  inp.click();
}

async function importFlow(file, preset = {}) {
  const ov = busyOverlay('Lendo ' + file.name + '…');
  try {
    const st = await readStatement(file);
    ov.close();
    if (!st.lines.length) return toast('Não encontrei lançamentos neste arquivo. Se for de outro banco, me envie um exemplo para eu ensinar o app a ler.', true);
    reviewSheet(st, file.name, preset);
  } catch (e) { ov.close(); toast(e.message || 'Não foi possível ler o arquivo.', true); }
}

function guessTarget(st, preset) {
  const s = S();
  if (preset.accountId && accById(preset.accountId)) return preset.accountId;
  const want = st.kind === 'fatura' ? 'credito' : 'debito';
  const list = s.accounts.filter(a => a.nature === want && a.active !== false);
  const refs = [...new Set(st.lines.map(l => l.cardRef).filter(Boolean))];
  const nm = x => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const byRef = list.find(a => refs.some(r => a.name.includes(r)));
  const byBank = st.bank && list.find(a => nm(a.name).includes(nm(st.bank).split(' ')[0]) || (st.bank === 'Banco do Brasil' && /\bbb\b|ourocard/i.test(nm(a.name))));
  return (byRef || byBank || list[0] || {}).id || '';
}

function reviewSheet(stRaw, fileName, preset) {
  let accountId = guessTarget(stRaw, preset);
  let comp = stRaw.comp || null;
  let filter = 'new';
  let plan = null, st = stRaw;
  const rebuild = () => {
    const acc = accById(accountId);
    st = acc && acc.nature === 'credito' && stRaw.kind !== 'fatura' ? P.asFatura(stRaw) : stRaw;
    if (acc && acc.nature === 'credito' && !comp) comp = C.cardCycle(acc, (st.lines.map(l => l.date).filter(Boolean).sort().pop()) || M.todayISO()).comp;
    plan = acc ? IP.buildPlan(S(), st, { accountId, comp }) : null;
    if (plan && plan.isCard) { const due = st.due || (comp ? C.faturaOf(S(), accountId, comp).date : null); plan.alreadyPaid = !!(st.kind === 'fatura' && due && due < M.todayISO()); }
    // extrato com saldo anterior: sugere usá-lo como saldo inicial quando a conta ainda não tem data de saldo inicial, ou ela é posterior ao extrato
    if (plan && !plan.isCard && st.saldoIni != null && st.saldoIniDate && (!acc.initialDate || acc.initialDate >= st.saldoIniDate)) plan.setInitial = { value: st.saldoIni, date: st.saldoIniDate };
  };
  rebuild();
  openSheet('', panel => {
    panel.classList.add('wide');
    const draw = () => {
      const acc = accById(accountId), isCard = acc && acc.nature === 'credito';
      const count = k => plan ? plan.rows.filter(r => r.status === k || (k === 'ignored' && r.status === 'cardpay')).length : 0;
      const sel = plan ? plan.rows.filter(r => r.include && r.status !== 'cardpay') : [];
      const noCat = sel.filter(r => !r.itemId).length;
      const total = sel.reduce((s, r) => s + r.tx.amount, 0);
      const inSum = sel.filter(r => r.tx.type === 'rec').reduce((s, r) => s + r.tx.amount, 0), outSum = sel.filter(r => r.tx.type !== 'rec').reduce((s, r) => s + r.tx.amount, 0);
      const goLabel = isCard ? `Importar ${sel.length} · ${C.brl(total)}` : `Importar ${sel.length}`;
      const opts = ['credito', 'debito'].map(n => {
        const l = S().accounts.filter(a => a.nature === n && a.active !== false);
        return l.length ? `<optgroup label="${n === 'credito' ? 'Cartões' : 'Contas'}">${l.map(a => `<option value="${a.id}" ${a.id === accountId ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</optgroup>` : '';
      }).join('');
      const chk = st.check || {};
      const rowsHTML = !plan ? '' : plan.rows.filter(r => filter === 'all' || r.status === filter || (filter === 'ignored' && (r.status === 'cardpay' || r.status === 'already'))).map(r => {
        const l = r.line, sign = r.tx && r.tx.amount < 0 ? '−' : '';
        const amt = `<span class="num ${l.dir === 'in' && !isCard ? 'pos' : ''}">${l.dir === 'in' ? (isCard ? '−' : '+') : ''}${C.brl(l.amount)}</span>`;
        const head = `<div class="irow-h"><label class="check"><input type="checkbox" data-inc="${r.idx}" ${r.include ? 'checked' : ''} ${['ignored', 'already'].includes(r.status) || (r.status === 'cardpay' && !r.fatura) ? 'disabled' : ''}></label>
          <span class="t"><b>${esc(r.tx ? r.tx.desc : l.desc)}</b><small>${l.date ? C.fmtD(l.date) + '/' + l.date.slice(2, 4) : ''}${l.cardRef ? ' · final ' + esc(l.cardRef) : ''}${sign ? ' · estorno/crédito' : ''}</small></span>${amt}</div>`;
        let body = '';
        if (r.status === 'new') body = `<select data-cat="${r.idx}" class="${r.itemId ? '' : 'missing'}"><option value="">Sem categoria</option>${optItems(r.tx.type === 'rec' ? 'receita' : 'despesa', r.itemId)}</select>${r.how && r.how !== 'escolhida' ? `<small class="hint">sugerida por ${r.how}</small>` : ''}`;
        if (r.status === 'dup') body = `<p class="hint">Parece igual a <b>${esc(r.match.desc || (itemById(r.match.itemId) || {}).name || '')}</b> de ${C.fmtD(r.match.date)} (${C.brl(r.match.amount)}), já lançado. Marque para importar mesmo assim.</p>`;
        if (r.status === 'ignored' || r.status === 'already') body = `<p class="hint">${esc(r.reason || '')}</p>`;
        if (r.status === 'cardpay') {
          const f = r.fatura, rest = f ? f.rest : 0;
          body = `<p class="hint">Pagamento de fatura: sai da conta, mas não conta como despesa.</p>
            <select data-fat="${r.idx}">${(r.options || []).map(o => `<option value="${o.key}" ${f && o.key === f.key ? 'selected' : ''}>${esc(faturaLabel(o))}</option>`).join('')}<option value="" ${f ? '' : 'selected'}>Sem vínculo com fatura</option></select>
            <p class="hint">${!f ? ((r.options || []).length ? 'Escolha a fatura que este pagamento quita.' : 'Nenhuma fatura em aberto encontrada: cadastre o cartão e importe a fatura para vincular depois.') : Math.abs(l.amount - rest) < 0.01 ? '✓ Valor idêntico: a fatura fica paga.' : l.amount < rest ? `Pagamento parcial: faltarão ${C.brl(rest - l.amount)} desta fatura.` : 'Valor maior que o que falta: a fatura fica paga.'}</p>`;
        }
        return `<li class="irow ${r.status}">${head}${body}</li>`;
      }).join('');
      panel.innerHTML = `<h2>Importar ${st.kind === 'fatura' ? 'fatura' : 'extrato'}</h2>
        <p class="hint">${esc(fileName)}${st.bank ? ' · ' + esc(st.bank) : ''}${st.due ? ' · vence ' + C.fmtD(st.due) + '/' + st.due.slice(0, 4) : ''}</p>
        <div class="grid2"><div><label for="r-acc">${isCard ? 'Cartão' : 'Conta'}</label><select id="r-acc"><option value="">Escolha…</option>${opts}</select></div>
        ${isCard ? `<div><label for="r-comp">Fatura de</label><input id="r-comp" type="month" value="${esc(comp || '')}"></div>` : '<div></div>'}</div>
        ${!S().accounts.some(a => a.nature === (stRaw.kind === 'fatura' ? 'credito' : 'debito') && a.active !== false) ? `<p class="warn">Cadastre ${stRaw.kind === 'fatura' ? 'o cartão' : 'a conta'} em Contas antes de importar.</p>` : ''}
        ${chk.msg ? `<p class="${chk.ok === true ? 'okbox' : chk.ok === false ? 'warn' : 'hint'}">${chk.ok === true ? '✓ ' : chk.ok === false ? '⚠ ' : ''}${esc(chk.msg)}</p>` : ''}
        ${plan && isCard ? `<label class="check"><input type="checkbox" id="r-paid" ${plan.alreadyPaid ? 'checked' : ''}> Esta fatura já foi paga antes de eu usar o app (não tira dinheiro da conta)</label>` : ''}
        ${plan && !isCard && st.saldoIni != null && st.saldoIniDate ? `<label class="check"><input type="checkbox" id="r-ini" ${plan.setInitial ? 'checked' : ''}> Usar o saldo anterior do extrato como saldo inicial da conta: <b>${C.brl(st.saldoIni)}</b> em ${C.fmtD(st.saldoIniDate)}/${st.saldoIniDate.slice(0, 4)}${acc.initialDate ? ` (hoje: ${C.brl(acc.initial)} em ${C.fmtD(acc.initialDate)})` : ` (hoje: ${C.brl(acc.initial)}, sem data)`}</label>` : ''}
        ${plan ? `<div class="seg small" id="r-filter">${[['new', 'Novos'], ['dup', 'Duplicatas'], ['ignored', 'Outros'], ['all', 'Todos']].map(([k, l]) => `<button data-f="${k}" aria-pressed="${filter === k}">${l} ${k === 'all' ? plan.rows.length : k === 'ignored' ? count('ignored') + count('already') : count(k)}</button>`).join('')}</div>
        <ul class="list irows">${rowsHTML || '<li class="empty">Nada aqui.</li>'}</ul>` : ''}
        <div class="actions sticky"><button class="btn" id="r-cancel">Cancelar</button><button class="btn primary" id="r-go" ${sel.length || (plan && (plan.rows.some(r => r.status === 'cardpay' && r.include) || plan.alreadyPaid || plan.setInitial)) ? '' : 'disabled'}>${sel.length ? goLabel : 'Aplicar'}</button></div>
        ${!isCard && sel.length ? `<p class="hint center">Entradas ${C.brl(inSum)} · saídas ${C.brl(outSum)}</p>` : ''}
        ${noCat ? `<p class="hint center">${noCat} sem categoria: dá para escolher agora ou depois.</p>` : ''}`;
    };
    draw();
    panel.onchange = e => {
      if (e.target.id === 'r-acc') { accountId = e.target.value; comp = stRaw.comp || null; rebuild(); return draw(); }
      if (e.target.id === 'r-comp') { comp = e.target.value; rebuild(); return draw(); }
      if (e.target.dataset.inc) { const r = plan.rows[+e.target.dataset.inc]; r.include = e.target.checked; return draw(); }
      if (e.target.dataset.fat) { IP.setRowFatura(plan.rows[+e.target.dataset.fat], e.target.value); return draw(); }
      if (e.target.id === 'r-paid') { plan.alreadyPaid = e.target.checked; return; }
      if (e.target.id === 'r-ini') { plan.setInitial = e.target.checked ? { value: st.saldoIni, date: st.saldoIniDate } : null; return draw(); }
      if (e.target.dataset.cat) {
        const r = plan.rows[+e.target.dataset.cat];
        const n = IP.propagate(plan, r, e.target.value);
        if (n) toast(`Aplicado também a mais ${n} linha(s) do mesmo estabelecimento.`);
        return draw();
      }
    };
    panel.onclick = async e => {
      const f = e.target.closest('[data-f]'); if (f) { filter = f.dataset.f; return draw(); }
      if (e.target.id === 'r-cancel') return closeSheet();
      if (e.target.id === 'r-go') {
        let res = null;
        const months = {};
        plan.rows.filter(r => r.include && r.tx).forEach(r => { const m = r.tx.comp || r.tx.date.slice(0, 7); months[m] = (months[m] || 0) + 1; });
        await sync.commit(s => { res = IP.applyPlan(s, plan); });
        const top = Object.entries(months).sort((a, b) => b[1] - a[1])[0];
        if (top) ui.month = top[0];
        closeSheet(); ui.tab = 'lanc'; ui.q = ''; render();
        toast(`${res.created} lançamento(s) importado(s)${res.paid ? ` · ${res.paid} fatura(s) marcada(s) como paga(s)` : ''}.`);
      }
    };
  });
}

/* ----- agenda: pendências e dívidas com terceiros ----- */
function pageAgenda() {
  const st = S(), today = M.todayISO(), in30 = C.mAdd(today.slice(0, 7), 1) + today.slice(7);
  const view = ui.agView || 'pend';
  let html = `<div class="seg" id="agseg"><button data-v="pend" aria-pressed="${view === 'pend'}">A pagar e receber</button><button data-v="loans" aria-pressed="${view === 'loans'}">Dívidas</button></div>`;
  if (view === 'pend') {
    const all = C.pendings(st);
    const sum = (l, d) => l.filter(x => x.dir === d).reduce((s, x) => s + x.amount, 0);
    const late = all.filter(x => x.date < today), next = all.filter(x => x.date >= today && x.date <= in30), later = all.filter(x => x.date > in30);
    const nextAll = [...late, ...next];
    html += `<div class="kpis two"><div class="kpi"><small>A receber (até 30 dias)</small><b class="num pos">${C.brl(sum(nextAll, 'in'))}</b></div>
      <div class="kpi"><small>A pagar (até 30 dias)</small><b class="num neg">${C.brl(sum(nextAll, 'out'))}</b></div></div>`;
    const block = (title, list, cls) => list.length ? `<div class="card ${cls || ''}"><h2>${title} <span class="hint">(${list.length})</span></h2><ul class="list full">${list.slice(0, 60).map(pendRow).join('')}</ul>${list.length > 60 ? `<p class="hint">e mais ${list.length - 60}…</p>` : ''}</div>` : '';
    html += block('Atrasados', late, 'late') + block('Próximos 30 dias', next) + block('Mais adiante', later);
    if (!all.length) html += `<div class="card empty">Nada pendente.<br>Receitas e despesas marcadas como pendentes, parcelas de dívidas e faturas em aberto aparecem aqui.</div>`;
    html += `<p class="hint">Para cadastrar uma receita que vai entrar (salário, aluguel recebido, um trabalho), use <b>+</b> em Lançamentos, marque "pendente" e, se for todo mês, "Repetir todo mês".</p>`;
  } else {
    const loans = st.loans.map(l => ({ l, s: M.loanStatus(st, l) }));
    const group = (dir, title) => {
      const list = loans.filter(x => x.l.dir === dir).sort((a, b) => (a.s.rest === 0) - (b.s.rest === 0) || String(a.s.next && a.s.next.date).localeCompare(String(b.s.next && b.s.next.date)));
      const rest = list.reduce((s, x) => s + x.s.rest, 0);
      return `<div class="card"><h2>${title}</h2><p class="hint">Saldo em aberto: <b class="num">${C.brl(rest)}</b></p>
        ${list.length ? `<ul class="list wrap">${list.map(({ l, s }) => `<li data-loan="${l.id}"><span class="t"><b>${esc(l.person || 'Sem nome')}${l.desc ? ' · ' + esc(l.desc) : ''}</b>
          <small>${s.rest === 0 ? '✓ quitado' : `${s.doneN}/${s.parcels.length} parcelas · próxima ${s.next ? C.fmtD(s.next.date) + '/' + s.next.date.slice(2, 4) : '—'}${s.late ? ` · <span class="tag">${s.late} atrasada(s)</span>` : ''}`}</small>
          <span class="bar"><i style="width:${s.total ? (s.paid / s.total * 100).toFixed(0) : 0}%;background:var(--brand)"></i></span></span>
          <span class="num">${C.brl(s.rest)}</span></li>`).join('')}</ul>` : '<p class="hint">Nenhuma.</p>'}
        <button class="link" data-newloan="${dir}">+ ${dir === 'in' ? 'Alguém me deve' : 'Eu devo'}</button></div>`;
    };
    html += `<div class="cols">${group('in', 'Me devem (a receber)')}${group('out', 'Eu devo (a pagar)')}</div>`;
  }
  $('#page').innerHTML = html;
  $('#page').onclick = async e => {
    const v = e.target.closest('#agseg [data-v]'); if (v) { ui.agView = v.dataset.v; return pageAgenda(); }
    const ok = e.target.closest('[data-ok]'); if (ok) return confirmPending(ok.dataset.ok);
    const pay = e.target.closest('[data-pay]'); if (pay) { const [cardId, comp] = pay.dataset.pay.split('|'); return payFaturaSheet(null, { cardId, comp }); }
    const li = e.target.closest('[data-ptx]'); if (li) return txSheet(S().tx.find(t => t.id === li.dataset.ptx));
    const fa = e.target.closest('[data-pfat]'); if (fa) { const [card, comp] = fa.dataset.pfat.split('|'); return faturaSheet(card, comp); }
    const nl = e.target.closest('[data-newloan]'); if (nl) return loanForm(nl.dataset.newloan);
    const lo = e.target.closest('[data-loan]'); if (lo) return loanSheet(lo.dataset.loan);
  };
}

function pendRow(p) {
  const today = M.todayISO();
  if (p.kind === 'fatura') {
    const card = accById(p.fatura.cardId);
    return `<li data-pfat="${p.fatura.cardId}|${p.fatura.comp}"><span class="dot" style="background:#607d8b">F</span><span class="t"><b>Fatura ${esc(card ? card.name : '')} ${shortM(p.fatura.comp)}</b>
      <small>${C.fmtD(p.date)}/${p.date.slice(2, 4)}${p.fatura.status === 'parc' ? ` · paga em parte (${C.brl(p.fatura.paid)} de ${C.brl(p.fatura.total)})` : ''}${p.date < today ? ' · <span class="tag">atrasada</span>' : ''}</small></span><span class="num">−${C.brl(p.amount)}</span>
      <button class="okbtn" data-pay="${p.fatura.cardId}|${p.fatura.comp}">Pagar</button></li>`;
  }
  const t = p.tx, it = itemById(t.itemId), g = groupOf(it), acc = accById(t.accountId);
  const loan = t.loanId && S().loans.find(l => l.id === t.loanId);
  return `<li data-ptx="${t.id}"><span class="dot" style="background:${g ? g.color : '#90a4ae'}">${t.type === 'rec' ? 'R' : 'D'}</span>
    <span class="t"><b>${esc(loan ? [loan.person, loan.desc].filter(Boolean).join(' · ') : (t.desc || (it ? it.name : '')))}</b><small>${C.fmtD(t.date)}/${t.date.slice(2, 4)}${t.seriesId ? ` · ${t.seriesIdx}/${t.seriesN}` : ''}${acc ? ' · ' + esc(acc.name) : ''}${loan ? (loan.dir === 'in' ? ' · me deve' : ' · eu devo') : ''}${t.date < today ? ' · <span class="tag">atrasado</span>' : ''}</small></span>
    <span class="num ${t.type === 'rec' ? 'pos' : ''}">${t.type === 'rec' ? '' : '−'}${C.brl(t.amount)}</span>
    <button class="okbtn" data-ok="tx:${t.id}">${t.type === 'rec' ? 'Recebido' : 'Pago'}</button></li>`;
}

/* confirma uma pendência; se estiver atrasada ou adiantada, pergunta a data em que aconteceu */
async function confirmPending(ref) {
  const [kind, id] = [ref.slice(0, ref.indexOf(':')), ref.slice(ref.indexOf(':') + 1)];
  const today = M.todayISO();
  if (kind === 'fat') {
    await sync.commit(s => { s.faturaMeta[id] = Object.assign({}, s.faturaMeta[id], { status: 'liq', upd: Date.now() }); });
    return toast('Fatura marcada como paga.');
  }
  const t = S().tx.find(x => x.id === id); if (!t) return;
  let date = t.date;
  if (t.date !== today) {
    const ch = await askChoice(t.type === 'rec' ? 'Quando recebeu?' : 'Quando pagou?', '', [{ label: 'Hoje (' + C.fmtD(today) + ')', value: 'today' }, { label: 'Na data prevista (' + C.fmtD(t.date) + ')', value: 'due' }]);
    if (!ch) return;
    if (ch === 'today') date = today;
  }
  await sync.commit(s => { const x = s.tx.find(y => y.id === id); x.status = 'liq'; x.date = date; M.touch(x); });
  toast(t.type === 'rec' ? 'Marcado como recebido.' : 'Marcado como pago.');
}

function loanForm(dir) {
  const st = S();
  const findItem = (kind, name) => { const it = st.items.find(i => i.name === name && i.active !== false); return it && groupOf(it) && groupOf(it).kind === kind ? it.id : ''; };
  const defItem = dir === 'in' ? findItem('receita', 'Recebimento de empréstimo concedido') : findItem('despesa', 'Parcela de empréstimo');
  const defStart = dir === 'in' ? findItem('despesa', 'Empréstimos concedidos') : findItem('receita', 'Empréstimos recebidos');
  openSheet('', panel => {
    panel.innerHTML = `<h2>${dir === 'in' ? 'Alguém me deve' : 'Eu devo'}</h2>
      <label for="l-person">${dir === 'in' ? 'Quem deve' : 'A quem devo'}</label><input id="l-person" autocomplete="off" placeholder="Nome">
      <label for="l-desc">Descrição</label><input id="l-desc" placeholder="Opcional (ex.: empréstimo para o carro)">
      <div class="grid2"><div><label for="l-total">Valor total (R$)</label><input id="l-total" inputmode="decimal" placeholder="0,00"></div>
      <div><label for="l-n">Parcelas</label><input id="l-n" type="number" inputmode="numeric" min="1" max="240" value="1"></div></div>
      <label for="l-first">${dir === 'in' ? 'Primeiro recebimento' : 'Primeiro pagamento'} (vencimento)</label><input id="l-first" type="date" value="${M.todayISO()}">
      <label for="l-acc">Conta</label><select id="l-acc">${optAccounts('debito', '')}</select>
      <label for="l-item">Categoria das parcelas</label><select id="l-item"><option value="">Sem categoria</option>${optItems(dir === 'in' ? 'receita' : 'despesa', defItem)}</select>
      <label class="check"><input type="checkbox" id="l-start"> Registrar também ${dir === 'in' ? 'a saída do dinheiro que emprestei' : 'a entrada do dinheiro que peguei'}</label>
      <div id="l-startbox" hidden><label for="l-sdate">Data</label><input id="l-sdate" type="date" value="${M.todayISO()}">
        <label for="l-sitem">Categoria</label><select id="l-sitem">${optItems(dir === 'in' ? 'despesa' : 'receita', defStart)}</select></div>
      <p class="hint" id="l-prev"></p>
      <div class="actions"><button class="btn" id="l-cancel">Cancelar</button><button class="btn primary" id="l-save">Salvar</button></div>`;
    const prev = () => {
      const n = Math.max(1, +panel.querySelector('#l-n').value || 1), v = C.parseMoney(panel.querySelector('#l-total').value), d = panel.querySelector('#l-first').value;
      panel.querySelector('#l-startbox').hidden = !panel.querySelector('#l-start').checked;
      panel.querySelector('#l-prev').textContent = v > 0 && d ? (n > 1 ? `${n} parcelas de ${C.brl(M.splitAmount(v, n)[1])}, de ${C.fmtD(d)}/${d.slice(0, 4)} a ${shortM(C.mAdd(d.slice(0, 7), n - 1))}. Aparecem na Agenda até serem confirmadas.` : `Uma parcela de ${C.brl(v)} em ${C.fmtD(d)}/${d.slice(0, 4)}.`) : '';
    };
    panel.oninput = prev; panel.onchange = prev;
    panel.querySelector('#l-cancel').onclick = closeSheet;
    panel.querySelector('#l-save').onclick = async () => {
      const f = { dir, person: panel.querySelector('#l-person').value, desc: panel.querySelector('#l-desc').value, total: C.parseMoney(panel.querySelector('#l-total').value),
        n: +panel.querySelector('#l-n').value || 1, firstDue: panel.querySelector('#l-first').value, accountId: panel.querySelector('#l-acc').value, itemId: panel.querySelector('#l-item').value };
      if (!f.person.trim()) return toast('Informe o nome da pessoa.', true);
      if (!(f.total > 0)) return toast('Informe o valor.', true);
      if (!f.firstDue) return toast('Informe o vencimento.', true);
      if (!f.accountId) return toast('Cadastre uma conta em Contas.', true);
      if (panel.querySelector('#l-start').checked) { f.startDate = panel.querySelector('#l-sdate').value; f.startItemId = panel.querySelector('#l-sitem').value; }
      const { loan, txs } = M.makeLoan(f);
      await sync.commit(s => { s.loans.push(loan); s.tx.push(...txs); });
      closeSheet(); ui.tab = 'agenda'; ui.agView = 'loans'; render(); toast('Dívida cadastrada.');
    };
  });
}

function loanSheet(id) {
  const l = S().loans.find(x => x.id === id); if (!l) return;
  openSheet('', panel => {
    const s = M.loanStatus(S(), l);
    panel.innerHTML = `<h2>${esc(l.person)}</h2><p class="hint">${l.dir === 'in' ? 'Me deve' : 'Eu devo'}${l.desc ? ' · ' + esc(l.desc) : ''}</p>
      <div class="kpis"><div class="kpi"><small>Total</small><b class="num">${C.brl(s.total)}</b></div><div class="kpi"><small>${l.dir === 'in' ? 'Recebido' : 'Pago'}</small><b class="num pos">${C.brl(s.paid)}</b></div><div class="kpi"><small>Em aberto</small><b class="num">${C.brl(s.rest)}</b></div></div>
      <ul class="list">${s.parcels.map(t => `<li data-ptx="${t.id}"><span class="t"><b>Parcela ${t.seriesIdx || 1}/${t.seriesN || 1}</b><small>${C.fmtD(t.date)}/${t.date.slice(2, 4)} · ${t.status === 'liq' ? '✓ ' + (l.dir === 'in' ? 'recebida' : 'paga') : t.date < M.todayISO() ? '<span class="tag">atrasada</span>' : 'em aberto'}</small></span>
        <span class="num">${C.brl(t.amount)}</span>${t.status === 'liq' ? '' : `<button class="okbtn" data-ok="tx:${t.id}">${l.dir === 'in' ? 'Recebida' : 'Paga'}</button>`}</li>`).join('')}</ul>
      <p class="hint">Toque numa parcela para mudar valor ou data (dá para aplicar às seguintes).</p>
      <div class="actions"><button class="btn danger" id="lo-del">Excluir</button><button class="btn" id="lo-edit">Renomear</button><button class="btn" id="lo-close">Fechar</button></div>`;
  });
  const panel = $('#sheet .panel');
  panel.onclick = async e => {
    const ok = e.target.closest('[data-ok]'); if (ok) { await confirmPending(ok.dataset.ok); return loanSheet(id); }
    const li = e.target.closest('[data-ptx]'); if (li) return txSheet(S().tx.find(t => t.id === li.dataset.ptx));
    if (e.target.id === 'lo-close') return closeSheet();
    if (e.target.id === 'lo-edit') {
      const name = window.prompt('Nome da pessoa', l.person); if (name == null) return;
      const desc = window.prompt('Descrição', l.desc); if (desc == null) return;
      const label = [desc.trim() || (l.dir === 'in' ? 'Empréstimo concedido' : 'Dívida'), name.trim()].filter(Boolean).join(' · ');
      await sync.commit(st => { const x = st.loans.find(y => y.id === id); x.person = name.trim(); x.desc = desc.trim(); M.touch(x); st.tx.filter(t => t.loanId === id).forEach(t => { t.desc = label; M.touch(t); }); });
      return loanSheet(id);
    }
    if (e.target.id === 'lo-del') {
      const ch = await askChoice('Excluir dívida', 'As parcelas já confirmadas continuam nos lançamentos.', [{ label: 'Excluir a dívida e as parcelas em aberto', value: 'y', danger: true }]);
      if (!ch) return;
      await sync.commit(st => M.removeLoan(st, id)); closeSheet(); toast('Dívida excluída.');
    }
  };
}

/* ----- pagamento de fatura: despesa especial que se vincula à fatura do cartão ----- */
function faturaLabel(f) {
  const card = accById(f.cardId);
  return `${card ? card.name : 'Cartão'} · ${shortM(f.comp)} · total ${C.brl(f.total)}${f.paid ? ' · falta ' + C.brl(f.rest) : ''}`;
}

function payFaturaSheet(tx, preset = {}) {
  const st = S();
  const cards = st.accounts.filter(a => a.nature === 'credito' && (a.active !== false || (tx && tx.faturaKey && tx.faturaKey.startsWith(a.id + '|'))));
  if (!cards.length) return toast('Cadastre o cartão em Contas antes de registrar o pagamento da fatura.', true);
  let cardId = preset.cardId || (tx && tx.faturaKey ? tx.faturaKey.split('|')[0] : '') || cards[0].id;
  let key = tx ? (tx.faturaKey || '') : (preset.comp ? cardId + '|' + preset.comp : null);
  openSheet('', panel => {
    const draw = (keepValues) => {
      const old = keepValues ? { v: panel.querySelector('#p-val').value, d: panel.querySelector('#p-date').value, acc: panel.querySelector('#p-acc').value } : null;
      const card = accById(cardId);
      const opts = C.faturaCandidates(S(), { cardId });
      // a fatura já vinculada a este pagamento entra mesmo que esteja quitada
      if (key && !opts.some(f => f.key === key)) { const f = C.faturas(S()).find(x => x.key === key); if (f) opts.unshift(f); }
      if (key === null) key = (opts[0] || {}).key || '';
      const sel = opts.find(f => f.key === key);
      const restFor = f => f ? C.r2(f.rest + (tx && tx.faturaKey === f.key ? tx.amount : 0)) : 0;
      const defVal = tx ? tx.amount : sel ? restFor(sel) : '';
      panel.innerHTML = `<h2>${tx ? 'Editar pagamento de fatura' : 'Pagar fatura'}</h2>
        <p class="hint">O dinheiro sai da conta, mas não conta como despesa nova: as compras já estão no cartão.</p>
        <label for="p-card">Cartão</label><select id="p-card">${cards.map(c => `<option value="${c.id}" ${c.id === cardId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
        <label for="p-fat">Fatura</label><select id="p-fat">${opts.map(f => `<option value="${f.key}" ${f.key === key ? 'selected' : ''}>${esc(faturaLabel(f))}</option>`).join('')}<option value="" ${!key ? 'selected' : ''}>Sem vínculo com fatura</option></select>
        <label for="p-val">Valor pago (R$)</label><input id="p-val" inputmode="decimal" value="${old ? esc(old.v) : (defVal !== '' ? String(defVal).replace('.', ',') : '')}" placeholder="0,00">
        <label for="p-date">Data do pagamento</label><input id="p-date" type="date" value="${old ? esc(old.d) : (tx ? tx.date : M.todayISO())}">
        <label for="p-acc">Pago pela conta</label><select id="p-acc">${optAccounts('debito', old ? old.acc : (tx ? tx.accountId : (preset.accountId || (card && card.payAccount) || '')))}</select>
        <p class="hint" id="p-prev"></p>
        <div class="actions">${tx ? '<button class="btn danger" id="p-del">Excluir</button>' : ''}<button class="btn" id="p-cancel">Cancelar</button><button class="btn primary" id="p-save">Salvar</button></div>`;
      const prev = () => {
        const v = C.parseMoney(panel.querySelector('#p-val').value), f = opts.find(x => x.key === panel.querySelector('#p-fat').value), h = panel.querySelector('#p-prev');
        if (!f) { h.textContent = 'Sem vínculo: o pagamento sai da conta, mas nenhuma fatura é dada como paga.'; return; }
        const rest = restFor(f);
        h.textContent = !(v > 0) ? `Falta pagar ${C.brl(rest)} desta fatura.` : Math.abs(v - rest) < 0.01 ? 'Valor igual ao que falta: a fatura fica paga.'
          : v < rest ? `Pagamento parcial: depois dele ainda faltarão ${C.brl(rest - v)} desta fatura.` : `Valor maior que o que falta (${C.brl(rest)}): a fatura fica paga e sobra ${C.brl(v - rest)} de crédito.`;
      };
      panel.oninput = prev; prev();
      panel.querySelector('#p-card').onchange = e => { cardId = e.target.value; key = null; draw(true); };
      panel.querySelector('#p-fat').onchange = e => { key = e.target.value; const f = opts.find(x => x.key === key); if (f && !tx) panel.querySelector('#p-val').value = String(restFor(f)).replace('.', ','); prev(); };
      panel.querySelector('#p-cancel').onclick = closeSheet;
      if (tx) panel.querySelector('#p-del').onclick = async () => {
        if (!(await confirmBox('Excluir este pagamento de fatura?'))) return;
        await sync.commit(s => M.removeRecord(s, 'tx', tx.id)); closeSheet(); toast('Pagamento excluído.');
      };
      panel.querySelector('#p-save').onclick = async () => {
        const amount = C.parseMoney(panel.querySelector('#p-val').value), date = panel.querySelector('#p-date').value, accountId = panel.querySelector('#p-acc').value;
        const fk = panel.querySelector('#p-fat').value, f = opts.find(x => x.key === fk);
        if (!(amount > 0)) return toast('Informe o valor pago.', true);
        if (!date) return toast('Informe a data.', true);
        if (!accountId) return toast('Escolha a conta.', true);
        const desc = 'Pagamento de fatura · ' + (accById(cardId) || {}).name + (f ? ' ' + shortM(f.comp) : '');
        await sync.commit(s => {
          let t = tx && s.tx.find(x => x.id === tx.id);
          if (!t) { t = M.newTx({ type: 'deb', amount, date, accountId, desc, status: 'liq' }); s.tx.push(t); }
          Object.assign(t, { type: 'deb', amount, date, accountId, itemId: '', status: 'liq', cardPay: true, faturaKey: fk });
          if (!tx || /^Pagamento de fatura/.test(tx.desc || '')) t.desc = desc;
          M.touch(t);
        });
        const after = C.faturas(S()).find(x => x.key === fk);
        closeSheet(); render();
        toast(!f ? 'Pagamento registrado.' : after && after.status === 'liq' ? 'Pagamento registrado: fatura paga.' : `Pagamento parcial registrado: faltam ${C.brl(after ? after.rest : 0)}.`);
      };
    };
    draw(false);
  });
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
    const stTxt = paid ? (f.manual && f.paid < f.total - 0.005 ? '✓ Marcada como paga' : '✓ Paga') : f.status === 'parc' ? `Paga em parte: ${C.brl(f.paid)} de ${C.brl(f.total)} · faltam ${C.brl(f.rest)}` : 'Ainda não paga';
    panel.innerHTML = `<h2>${esc(card.name)}</h2>
      <div class="month"><button data-c="-1" aria-label="Fatura anterior">‹</button><b>Fatura de ${C.monthLabel(comp).toLowerCase()}</b><button data-c="1" aria-label="Próxima fatura">›</button></div>
      <div class="kpis two"><div class="kpi"><small>Total</small><b class="num">${C.brl(f.total)}</b></div><div class="kpi"><small>Vencimento</small><b>${C.fmtD(f.date)}/${f.date.slice(0, 4)}</b></div></div>
      <p class="hint">${stTxt} · paga pela conta ${esc((accById(f.accountId) || {}).name || '—')}.</p>
      ${f.payments.length ? `<h3 class="sub">Pagamentos</h3><ul class="list">${f.payments.map(t => txRow(t, true)).join('')}</ul>` : ''}
      ${f.list.length ? `<h3 class="sub">Compras</h3><ul class="list">${f.list.map(t => txRow(t, true)).join('')}</ul>` : '<p class="empty">Nenhuma compra nesta fatura.</p>'}
      <div class="actions wrap"><button class="btn" id="fa-edit">Editar cartão</button><button class="btn" id="fa-new">+ Compra</button><button class="btn" id="fa-imp">Importar</button>
        ${f.total > 0 && !paid ? '<button class="btn primary" id="fa-reg">Registrar pagamento</button>' : ''}
        ${f.list.length ? `<button class="btn" id="fa-pay">${f.manual ? 'Desmarcar paga' : paid ? '' : 'Marcar paga sem registrar'}</button>`.replace('<button class="btn" id="fa-pay"></button>', '') : ''}</div>
      ${!paid && f.total > 0 ? '<p class="hint">"Registrar pagamento" tira o valor da conta (pode ser parcial). "Marcar paga sem registrar" só serve para faturas pagas antes de você começar a usar o app.</p>' : ''}`;
    panel.onclick = async e => {
      const b = e.target.closest('[data-c]'); if (b) { comp = C.mAdd(comp, +b.dataset.c); return faturaSheet(cardId, comp); }
      const li = e.target.closest('[data-tx]'); if (li) return txSheet(S().tx.find(t => t.id === li.dataset.tx));
      if (e.target.id === 'fa-edit') return accSheet(card);
      if (e.target.id === 'fa-new') return txSheet(null, { type: 'cred', accountId: cardId });
      if (e.target.id === 'fa-imp') { closeSheet(); return pickImportFile({ accountId: cardId }); }
      if (e.target.id === 'fa-reg') return payFaturaSheet(null, { cardId, comp });
      if (e.target.id === 'fa-pay') {
        await sync.commit(s => { s.faturaMeta[f.key] = Object.assign({}, s.faturaMeta[f.key], { status: f.manual ? 'pend' : 'liq', upd: Date.now() }); });
        toast(f.manual ? 'Marcação desfeita.' : 'Fatura marcada como paga.');
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
        : `<div class="grid2"><div><label for="a-ini">Saldo inicial (R$)</label><input id="a-ini" inputmode="decimal" value="${acc ? String(acc.initial).replace('.', ',') : ''}" placeholder="0,00"></div>
           <div><label for="a-inid">No fim do dia</label><input id="a-inid" type="date" value="${acc && acc.initialDate ? acc.initialDate : (acc ? '' : yesterday())}"></div></div>
           <p class="hint">Lançamentos até essa data já estão dentro do saldo inicial e não mudam o saldo. Sem data, todos os lançamentos contam.</p>`}
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
      } else { f.initial = C.parseMoney(panel.querySelector('#a-ini').value); f.initialDate = panel.querySelector('#a-inid').value || undefined; }
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
