/* Níquel (antes "Finanças") · Fase 1 — núcleo: login, dados no aparelho + Drive, primeira configuração e telas básicas. */
import * as auth from './auth.js';
import * as sync from './sync.js';
import * as drive from './drive.js';
import * as lock from './lock.js';
import * as PX from './pix.js';
import * as M from './model.js';
import * as C from './calc.js';
import * as PT from './imp/pdftext.js';
import * as P from './imp/parse.js';
import * as IP from './imp/plan.js';
import * as PP from './imp/parcelas.js';
import * as H from './imp/holerite.js';
import * as L from './link.js';
import * as PH from './holder.js';
import { TOUR, GUIDE } from './help.js';
import * as PN from './panel.js';

export const VERSION = '0.17.0';
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
/* Nos testes automáticos (navegador controlado por programa) continuam as caixas do navegador, que o teste aceita sozinho;
   window.FIN_DIALOGS = true força as do app também ali (é assim que elas são testadas). */
const nativeDialogs = () => navigator.webdriver && !window.FIN_DIALOGS;
function confirmBox(msg, { ok = 'Confirmar', cancel = 'Cancelar', danger } = {}) {
  if (nativeDialogs()) return Promise.resolve(window.confirm(msg));
  return new Promise(res => {
    const box = document.createElement('div'); box.className = 'sheet ask confirm';
    const dz = danger === undefined ? /^(Remover|Excluir|Apagar)|\bexclu|\bremov|\bapag|perdid/i.test(msg) : danger;
    box.innerHTML = `<div class="panel" role="alertdialog" aria-modal="true"><p class="cmsg">${esc(msg)}</p>
      <div class="actions"><button class="btn" data-no>${esc(cancel)}</button><button class="btn ${dz ? 'danger solid' : 'primary'}" data-ok>${esc(ok)}</button></div></div>`;
    document.body.appendChild(box);
    box.onclick = e => { const y = e.target.closest('[data-ok]'), n = e.target.closest('[data-no]'); if (!y && !n && e.target !== box) return; box.remove(); res(!!y); };
    setTimeout(() => { const b = box.querySelector('[data-no]'); if (b) b.focus(); }, 30);
  });
}
function askText(title, fields) {
  if (nativeDialogs()) { const out = []; for (const f of fields) { const v = window.prompt(f.label, f.value || ''); if (v == null) return Promise.resolve(null); out.push(v); } return Promise.resolve(out); }
  return new Promise(res => {
    const box = document.createElement('div'); box.className = 'sheet ask confirm';
    box.innerHTML = `<div class="panel" role="dialog" aria-modal="true"><h2>${esc(title)}</h2>${fields.map((f, i) => `<label for="at-${i}">${esc(f.label)}</label><input id="at-${i}" value="${esc(f.value || '')}" autocomplete="off">`).join('')}
      <div class="actions"><button class="btn" data-no>Cancelar</button><button class="btn primary" data-ok>Salvar</button></div></div>`;
    document.body.appendChild(box);
    box.onclick = e => { const y = e.target.closest('[data-ok]'), n = e.target.closest('[data-no]'); if (!y && !n && e.target !== box) return; const v = y ? fields.map((_, i) => box.querySelector('#at-' + i).value) : null; box.remove(); res(v); };
    setTimeout(() => { const b = box.querySelector('input'); if (b) b.focus(); }, 30);
  });
}

/* ---------- ícones ---------- */
const ICON = {
  lanc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
  agenda: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M8 15l2 2 4-4"/></svg>',
  resumo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  contas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h3"/></svg>',
  ajustes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>'
};

const SV = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const QI = {
  imp: SV('<path d="M12 15V4M8 8l4-4 4 4M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/>'),
  deb: SV('<path d="M7 17 17 7M9 7h8v8"/>'),
  rec: SV('<path d="M17 7 7 17M15 17H7V9"/>'),
  cred: SV('<rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10.5h18M7 15h3"/>'),
  trf: SV('<path d="M4 8h14M14 4l4 4-4 4M20 16H6M10 12l-4 4 4 4"/>'),
  fat: SV('<path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6"/>'),
  job: SV('<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"/>'),
  plus: SV('<path d="M12 5v14M5 12h14"/>')
};
/* marca redonda do lançamento: cor do grupo no fundo e o desenho do tipo (saída, entrada, cartão, transferência, fatura) */
const col = c => /^#[0-9a-fA-F]{3,8}$/.test(c || '') ? c : '#90a4ae'; // cor só no formato #rrggbb: vem do arquivo de dados ou de um backup importado
const dot = (kind, color) => `<span class="dot" style="--c:${col(color)}">${QI[kind] || QI.deb}</span>`;

/* ---------- inicialização ---------- */
/* campos de valor: os dígitos entram como centavos (1 2 3 4 5 → 123,45), como em app de banco.
   Colar ou preencher de uma vez ("1.234,5", "50") é lido como valor normal. "-" inverte o sinal. */
const MF = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function moneyText(v) { return v ? MF.format(Math.abs(v)).replace(/^/, v < 0 ? '-' : '') : ''; }
function maskMoney(el, ev) {
  const raw = el.value, neg = (raw.match(/-/g) || []).length % 2 === 1;
  let v;
  if (ev && ev.data && ev.data.length > 1 || ev && ev.inputType === 'insertFromPaste') v = Math.abs(C.parseMoney(raw));
  else { const d = raw.replace(/\D/g, '').replace(/^0+/, '').slice(0, 13); v = d ? +d / 100 : 0; }
  el.value = v ? (neg ? '-' : '') + MF.format(v) : (neg ? '-' : '');
  try { el.setSelectionRange(el.value.length, el.value.length); } catch { /* alguns tipos não aceitam */ }
}
const isMoney = el => el && el.tagName === 'INPUT' && el.inputMode === 'decimal';
document.addEventListener('focusin', e => { if (isMoney(e.target) && e.target.value) { const v = C.parseMoney(e.target.value); e.target.value = v ? moneyText(v) : ''; } });
document.addEventListener('input', e => { if (isMoney(e.target)) maskMoney(e.target, e); });
/* como calculadora: dígito entra sempre no fim e apagar tira sempre o último, onde quer que esteja o cursor */
document.addEventListener('beforeinput', e => {
  const el = e.target; if (!isMoney(el)) return;
  if (el.selectionStart !== el.selectionEnd) return; /* com texto selecionado, vale o comportamento normal (substituir/apagar a seleção) */
  const neg = el.value.startsWith('-'), d = el.value.replace(/\D/g, '').replace(/^0+/, '');
  let nd;
  if (e.inputType === 'insertText' && /^\d$/.test(e.data || '')) nd = d + e.data;
  else if (e.inputType === 'deleteContentBackward' || e.inputType === 'deleteContentForward') nd = d.slice(0, -1);
  else return;
  e.preventDefault();
  el.value = (neg ? '-' : '') + nd;
  el.dispatchEvent(new Event('input', { bubbles: true }));
});
/* botão ±: o teclado numérico do iPhone não tem sinal de menos */
document.addEventListener('click', e => {
  const b = e.target.closest('[data-pm]'); if (!b) return;
  const el = b.parentElement.querySelector('input'); if (!el) return;
  el.value = el.value.startsWith('-') ? el.value.slice(1) : '-' + el.value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
});

/* Esc fecha a caixa de pergunta ou a folha aberta (teclado do computador) */
document.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[role=button][tabindex], [data-dr][tabindex]')) { e.preventDefault(); return e.target.click(); }
  if (e.key !== 'Escape' || document.body.classList.contains('locked')) return;
  const ask = document.querySelector('.sheet.ask'); if (ask) { ask.click(); return; }
  if (!$('#sheet').hidden) closeSheet();
});

async function boot() {
  const cid = clientId();
  if (cid) auth.init(cid);
  await sync.load();
  await lock.load();
  lock.onChange(lockScreen);
  applyDiscreet();
  sync.onData(() => {
    if (!S() || !S().config.setupDone) return;
    // os dados chegaram do Drive com a configuração inicial aberta: ela não é mais necessária
    if ($('#wz')) { wz = null; toast('Seus dados foram carregados do Drive.'); }
    render(); keepRecurring();
  });
  sync.onStatus(renderChip);
  auth.onChange(() => { if (S() && S().config.setupDone) renderChip(sync.currentStatus()); });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  route();
  lockScreen();
  keepRecurring();
  if (auth.isSignedIn()) sync.schedule(200);
  else autoRenew();
  /* app reaberto depois de um tempo (o iPhone costuma deixá-lo na memória): renova o acesso e sincroniza */
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
    if (!hiddenAt || Date.now() - hiddenAt < 60_000) return;
    if (auth.isSignedIn()) sync.schedule(100); else autoRenew();
  });
}

/* acesso ao Drive vencido: renovação silenciosa pelo Google, se nada estiver sendo editado */
function autoRenew() {
  const st = S();
  if (!st || !st.config.setupDone || !$('#sheet').hidden || document.querySelector('.sheet.ask')) return;
  const box = document.createElement('div'); box.className = 'renew'; box.textContent = 'Conectando ao Drive…';
  document.body.appendChild(box);
  if (!auth.silentRenew()) box.remove();
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
  app().innerHTML = `<div class="hero"><img src="icons/icon-192.png" alt=""><h1>Níquel</h1>
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
  app().innerHTML = `<div class="hero"><img src="icons/icon-192.png" alt=""><h1>Níquel</h1>
    <p>Seu controle financeiro, com os dados guardados no <b>seu</b> Google Drive. Ninguém mais tem acesso.</p>
    <button class="btn primary block" id="login" style="margin-top:18px">Entrar com o Google</button>
    <p class="hint" id="offmsg">${navigator.onLine ? '' : 'Sem internet. Conecte-se para o primeiro acesso.'}</p>
    <p class="hint">O app cria a pasta <b>Finanças (app)</b> no seu Drive e só enxerga os arquivos dela.</p>
    <p class="hint"><a class="link" href="privacidade.html">Política de privacidade</a></p></div>`;
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
    // Ao entrar, uma sincronização já pode estar em andamento: sync() volta na hora nesse caso. Por isso espera terminar
    // antes de decidir (era por isso que quem já tinha dados caía na configuração inicial num aparelho novo).
    if (await sync.remoteExists()) {
      for (let i = 0; i < 2 && !(S() && S().config.setupDone); i++) { await sync.sync(); await sync.whenIdle(); }
      if (S() && S().config.setupDone) { toast('Seus dados foram carregados do Drive.'); return render(); }
    }
    if (S() && S().config.setupDone) return render();
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
  if (s === 1) body = `<h1>Contas</h1><p class="hint">Contas correntes, poupança, carteira. O saldo inicial é o que havia na conta ontem à noite (pode ser zero): o que você lançar de hoje em diante muda o saldo.</p>
      ${wz.accounts.map((a, i) => `<div class="item-row" data-i="${i}">${wz.accounts.length > 1 ? `<button class="btn ghost x" data-wz="delacc" data-i="${i}" aria-label="Remover">✕</button>` : ''}
        <label>Nome</label><input data-f="acc.name" data-i="${i}" value="${esc(a.name)}" placeholder="Ex.: Conta do banco">
        <label>Saldo inicial (R$)</label><div class="pm"><input data-f="acc.initial" data-i="${i}" inputmode="decimal" value="${esc(a.initial)}" placeholder="0,00"><button type="button" class="pmb" data-pm aria-label="Trocar sinal (positivo ou negativo)">±</button></div></div>`).join('')}
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
  tourSheet();
}

/* ---------- telas principais ---------- */
function render() {
  if (!S() || !S().config.setupDone) return route();
  const tabs = [['lanc', 'Lançamentos'], ['agenda', 'Agenda'], ['resumo', 'Resumo'], ['contas', 'Contas'], ['ajustes', 'Ajustes']];
  const title = ui.sub === 'cats' ? 'Categorias' : ui.sub === 'help' ? 'Ajuda' : { lanc: 'Lançamentos', agenda: 'Agenda', resumo: 'Resumo', contas: 'Contas', ajustes: 'Ajustes' }[ui.tab];
  app().innerHTML = `<div class="shell"><header class="top">${ui.sub ? '<button class="back" id="back" aria-label="Voltar">‹</button>' : ''}<h1>${title}</h1><button class="eye" id="eye" aria-label="Esconder ou mostrar os valores"></button><button class="chip" id="chip"><i></i><span></span></button></header>
    <main class="page" id="page"></main>
    ${ui.tab !== 'ajustes' && !ui.sub ? '<button class="fab" id="fab" aria-label="Novo lançamento"><span aria-hidden="true">+</span><b>Novo lançamento</b></button>' : ''}
    <nav class="tabs">${tabs.map(([k, l]) => `<button data-tab="${k}" ${ui.tab === k ? 'aria-current="page"' : ''}>${ICON[k]}<span>${l}</span></button>`).join('')}</nav></div>`;
  app().querySelector('.tabs').onclick = e => { const b = e.target.closest('[data-tab]'); if (b) { ui.tab = b.dataset.tab; ui.sub = null; ui.q = ''; ui.f = null; render(); window.scrollTo(0, 0); } };
  $('#chip').onclick = chipAction;
  $('#eye').onclick = toggleDiscreet; applyDiscreet();
  if ($('#back')) $('#back').onclick = () => { ui.sub = null; render(); };
  if ($('#fab')) $('#fab').onclick = () => txSheet();
  if (ui.sub === 'cats') pageCategorias();
  else if (ui.sub === 'help') pageAjuda();
  else ({ lanc: pageLanc, agenda: pageAgenda, resumo: pageResumo, contas: pageContas, ajustes: pageAjustes })[ui.tab]();
  renderChip(sync.currentStatus());
  updateBadge();
}

/* atrasados: bolinha na aba Agenda e número no ícone do app (quando o aparelho permite) */
function updateBadge() {
  const today = M.todayISO(), n = C.pendings(S(), today).filter(p => p.date < today).length;
  const tab = app().querySelector('.tabs [data-tab="agenda"]');
  if (tab) tab.classList.toggle('badge', n > 0);
  try { if (navigator.setAppBadge) (n ? navigator.setAppBadge(n) : navigator.clearAppBadge()).catch(() => {}); } catch { /* sem suporte */ }
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
const shortM0 = m => ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][+m.slice(5) - 1] + '/' + m.slice(2, 4);
/* mês com setas, toque no nome para escolher mês e ano, e atalho para voltar ao mês atual */
const monthNav = m => {
  const cur = M.todayISO().slice(0, 7), h = C.mAdd(cur, M.REC_AHEAD);
  return `<div class="month"><button data-m="-1" aria-label="Mês anterior">‹</button><button class="mlabel" data-mpick aria-label="Escolher mês e ano"><b>${C.monthLabel(m)}</b><span class="caret" aria-hidden="true">▾</span></button><button data-m="1" aria-label="Próximo mês">›</button></div>
    ${m !== cur ? `<div class="mtoday"><button class="link" data-mgo="${cur}">↩ Voltar para ${C.monthLabel(cur).toLowerCase()}</button></div>` : ''}
    ${m > h ? `<p class="hint hz">As previsões de renda e de contas fixas vão até ${shortM0(h)}. Deste mês em diante aparecem só as parcelas já contratadas, por isso receitas e resultado ficam baixos.</p>` : ''}`;
};
function monthPicker(current) {
  return new Promise(res => {
    const cur = M.todayISO().slice(0, 7); let y = +current.slice(0, 4);
    const box = document.createElement('div'); box.className = 'sheet ask';
    const names = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const draw = () => { box.innerHTML = `<div class="panel" role="dialog" aria-modal="true"><h2>Ir para o mês</h2>
      <div class="month"><button data-py="-1" aria-label="Ano anterior">‹</button><b>${y}</b><button data-py="1" aria-label="Próximo ano">›</button></div>
      <div class="mgrid">${names.map((n, i) => { const m = y + '-' + String(i + 1).padStart(2, '0'); return `<button class="btn ${m === current ? 'primary' : ''} ${m === cur ? 'now' : ''}" data-pm="${m}">${n}</button>`; }).join('')}</div>
      <div class="actions"><button class="btn" data-pm="">Cancelar</button><button class="btn" data-pm="${cur}">Mês atual</button></div></div>`; };
    draw(); document.body.appendChild(box);
    box.onclick = e => {
      const yb = e.target.closest('[data-py]'); if (yb) { y += +yb.dataset.py; return draw(); }
      const b = e.target.closest('[data-pm]'); if (!b && e.target !== box) return;
      box.remove(); res(b && b.dataset.pm ? b.dataset.pm : null);
    };
  });
}
/* trata os toques na navegação de meses; devolve true se o toque era dela */
function monthNavClick(e, redraw) {
  const mb = e.target.closest('[data-m]'); if (mb) { ui.month = C.mAdd(ui.month, +mb.dataset.m); redraw(); return true; }
  const go = e.target.closest('[data-mgo]'); if (go) { ui.month = go.dataset.mgo; redraw(); return true; }
  if (e.target.closest('[data-mpick]')) { monthPicker(ui.month).then(m => { if (m) { ui.month = m; redraw(); } }); return true; }
  return false;
}
const shortM = m => ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][+m.slice(5) - 1] + '/' + m.slice(2, 4);

function txRow(t, showDate, inFat) {
  if (t.cardPay) {
    const f = t.faturaKey && C.faturas(S()).find(x => x.key === t.faturaKey), card = f && accById(f.cardId);
    return `<li data-tx="${t.id}" class="tx">${dot('fat', '#607d8b')}<span class="t"><b>${esc((t.desc || 'Pagamento de fatura').replace(/^Pagamento de fatura\s+·\s+(?=.)/, ''))}</b>
      <small>${showDate ? C.fmtD(t.date) + '/' + t.date.slice(2, 4) + ' · ' : ''}${f ? `fatura ${esc(card ? card.name : '')} ${shortM(f.comp)} · ${f.status === 'liq' ? 'paga' : 'faltam ' + C.brl(f.rest)}` : ''}${accById(t.accountId) ? (f ? ' · ' : '') + esc(accById(t.accountId).name) : ''}</small>
      <span class="chips"><span class="tag info">pagamento de fatura</span>${f ? '' : '<span class="tag">sem vínculo com fatura</span>'}</span></span>
      <span class="num">−${C.brl(t.amount)}</span></li>`;
  }
  const it = itemById(t.itemId), g = groupOf(it), acc = accById(t.accountId);
  const parc = t.seriesId && t.seriesKind !== 'rep' ? [t.seriesIdx, t.seriesN] : t.parcKey ? [t.parcI, t.parcN] : null;
  let title = t.desc || (it ? it.name : (t.type === 'trf' ? 'Transferência' : 'Sem categoria'));
  if (parc || t.loanId) title = title.replace(/\s*\(\d+\/\d+\)\s*$/, '') || title; // o número da parcela vai na marca, por extenso
  // "Pagamento de Boleto · FULANO": o nome vai no título e o tipo de operação desce para a linha de baixo
  const sp = t.desc ? /^([^·]{3,26}?)\s+·\s+(.+)$/.exec(title) : null; let lead = '';
  if (sp) { lead = sp[1]; title = sp[2]; }
  const sub = [showDate ? C.fmtD(t.date) + '/' + t.date.slice(2, 4) : '', lead, t.type === 'trf' ? `${acc ? acc.name : '?'} → ${(accById(t.toAccountId) || {}).name || '?'}` : (it && t.desc ? it.name : ''), t.type !== 'trf' && acc ? acc.name : ''].filter(Boolean).join(' · ');
  const rk = t.recId && (S().rec || []).find(r => r.id === t.recId);
  const chip = (txt, cls) => `<span class="tag ${cls || ''}">${txt}</span>`;
  const chips = (parc ? chip(`parcela ${parc[0]} de ${parc[1]}`, 'info') : t.seriesId ? chip(`${t.seriesIdx} de ${t.seriesN}`, 'info') : '')
    + (showDate && !inFat && t.type === 'cred' ? chip('fatura ' + shortM(C.txComp(S(), t)), 'info') : '')
    + (rk ? chip(rk.kind === 'var' ? 'todo mês · valor variável' : 'todo mês', 'info') : '')
    + (() => { const h = PH.holderOf(S(), t); return h ? chip(esc(h.name) + (h.reimb ? ' · devolve' : ''), h.reimb ? 'who reimb' : 'who') : ''; })()
    + (t.reimb ? chip('reembolso', 'who reimb') : '')
    + (() => { const pk = C.payOf(S(), t); return pk && (t.pay || ['pixag', 'pixrec', 'pixauto', 'pixparc', 'pixcred'].includes(pk)) ? chip(C.payLabel(pk), 'pay') : ''; })()
    + (t.fee ? chip('juros ' + C.brl(t.fee), 'pay') : '')
    + (t.folha ? chip('pago pela folha', 'info') : '') + (t.adj ? chip('ajuste de valor', 'info') : '')
    + (t.prev ? chip('previsto') : t.status === 'pend' && t.type !== 'cred' ? chip('pendente') : '')
    + (!t.itemId && t.type !== 'trf' && !t.reimb ? chip('sem categoria') : '');
  return `<li data-tx="${t.id}" class="tx">${dot(t.type, g ? g.color : t.type === 'trf' ? '#5c6bc0' : '')}
    <span class="t"><b>${esc(title)}</b><small>${esc(sub)}</small>${chips ? `<span class="chips">${chips}</span>` : ''}</span>
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
/* a busca atualiza só os resultados: trocar o campo a cada letra fazia o iPhone fechar e reabrir o teclado (e trocar o tipo dele) */
let qTimer = null;
/* filtros da lista: tipo (um por vez) + conta ou cartão, categoria e quem usou o cartão. Valem para o mês e para a busca. */
const F0 = () => ({ kind: 'all', acc: '', cat: '', who: '', pay: '' });
const FK = [['all', 'Tudo'], ['rec', 'Receitas'], ['desp', 'Despesas'], ['cred', 'Cartão'], ['parc', 'Parcelas'], ['fix', 'Fixas'], ['debt', 'Dívidas'], ['pend', 'Pendentes'], ['trf', 'Transferências'], ['nocat', 'Sem categoria']];
const fOn = () => { const f = ui.f; return !!f && (f.kind !== 'all' || !!f.acc || !!f.cat || !!f.who || !!f.pay); };
function fMatch(t) {
  const f = ui.f; if (!f) return true;
  const k = f.kind;
  if (k === 'rec' && t.type !== 'rec') return false;
  if (k === 'desp' && !((t.type === 'deb' && !t.cardPay) || t.type === 'cred')) return false;
  if (k === 'cred' && t.type !== 'cred') return false;
  if (k === 'parc' && !(t.type !== 'rec' && (t.parcKey || (t.seriesId && t.seriesKind !== 'rep')))) return false;
  if (k === 'fix' && !(t.recId && t.type !== 'rec')) return false;
  if (k === 'debt' && !t.loanId) return false;
  if (k === 'trf' && !(t.type === 'trf' || t.cardPay)) return false;
  if (k === 'pend' && !(t.prev || (t.status === 'pend' && t.type !== 'cred'))) return false;
  if (k === 'nocat' && (t.itemId || t.type === 'trf' || t.cardPay || t.reimb)) return false;
  if (f.acc && t.accountId !== f.acc && t.toAccountId !== f.acc) return false;
  if (f.cat === '_') { if (t.itemId || t.type === 'trf' || t.cardPay) return false; }
  else if (f.cat.startsWith('g:')) { const it = itemById(t.itemId); if (!it || it.groupId !== f.cat.slice(2)) return false; }
  else if (f.cat && t.itemId !== f.cat) return false;
  if (f.who) { const [c, ref] = f.who.split('|'), h = t.accountId === c && PH.holderOf(S(), t); if (!h || h.ref !== ref) return false; }
  if (f.pay) { const pk = C.payOf(S(), t); if (f.pay === 'pix*' ? !pk.startsWith('pix') : pk !== f.pay) return false; }
  return true;
}
const fCatName = c => c === '_' ? 'Sem categoria' : c.startsWith('g:') ? ((S().groups.find(g => g.id === c.slice(2)) || {}).name || '?') : ((itemById(c) || {}).name || '?');
const fWhoName = w => { const [c, ref] = w.split('|'), a = accById(c), h = a && (a.holders || []).find(x => x.ref === ref); return h ? h.name : 'final ' + ref; };
function filtHTML() {
  const f = ui.f || F0();
  const x = (k, label) => `<button class="fchip on" data-fx="${k}" aria-label="Tirar o filtro ${esc(label)}">${esc(label)} <span aria-hidden="true">✕</span></button>`;
  return `<div class="fchips" id="lfilt-row">${FK.map(([k, l]) => `<button class="fchip" data-fk="${k}" aria-pressed="${f.kind === k}">${l}</button>`).join('')}</div>
    <div class="fmore"><button class="fchip more" data-fmore>Conta, categoria, Pix…</button>${f.acc ? x('acc', (accById(f.acc) || {}).name || '?') : ''}${f.cat ? x('cat', fCatName(f.cat)) : ''}${f.who ? x('who', fWhoName(f.who)) : ''}${f.pay ? x('pay', f.pay === 'pix*' ? 'Pix (todos)' : C.payLabel(f.pay)) : ''}${fOn() ? '<button class="link" data-fclear>Limpar filtros</button>' : ''}</div>`;
}
function setKind(k) { const f = ui.f || F0(); ui.f = { ...f, kind: f.kind === k ? 'all' : k }; }
function filterSheet() {
  const st = S(), f = ui.f || F0();
  const accs = n => st.accounts.filter(a => a.nature === n && (a.active !== false || a.id === f.acc)).map(a => `<option value="${a.id}" ${a.id === f.acc ? 'selected' : ''}>${esc(a.name)}</option>`).join('');
  const cats = kind => st.groups.filter(g => g.kind === kind).map(g => `<optgroup label="${esc(g.name)}"><option value="g:${g.id}" ${f.cat === 'g:' + g.id ? 'selected' : ''}>${esc(g.name)}: tudo</option>${st.items.filter(i => i.groupId === g.id).map(i => `<option value="${i.id}" ${i.id === f.cat ? 'selected' : ''}>${esc(i.name)}</option>`).join('')}</optgroup>`).join('');
  const who = st.accounts.filter(a => a.nature === 'credito').flatMap(a => (a.holders || []).map(h => `<option value="${a.id}|${esc(h.ref)}" ${f.who === a.id + '|' + h.ref ? 'selected' : ''}>${esc(h.name)} · ${esc(a.name)} final ${esc(h.ref)}</option>`)).join('');
  openSheet(`<h2>Filtrar lançamentos</h2><p class="hint">Vale para o mês da tela e para a busca. Combine com Receitas, Despesas, Cartão… na fila de cima.</p>
    <label for="fl-acc">Conta ou cartão</label><select id="fl-acc"><option value="">Todas</option><optgroup label="Contas">${accs('debito')}</optgroup><optgroup label="Cartões">${accs('credito')}</optgroup></select>
    <label for="fl-cat">Categoria</label><select id="fl-cat"><option value="">Todas</option><option value="_" ${f.cat === '_' ? 'selected' : ''}>Sem categoria</option>${cats('despesa')}${cats('receita')}</select>
    ${who ? `<label for="fl-who">Quem usou o cartão</label><select id="fl-who"><option value="">Qualquer pessoa</option>${who}</select>` : ''}
    <label for="fl-pay">Forma de pagamento</label><select id="fl-pay"><option value="">Todas</option><option value="pix*" ${f.pay === 'pix*' ? 'selected' : ''}>Pix (todos os tipos)</option>${C.PAY.map(([k, l]) => `<option value="${k}" ${f.pay === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <div class="actions"><button class="btn" id="fl-clear">Limpar</button><button class="btn primary" id="fl-ok">Aplicar</button></div>`, panel => {
    panel.querySelector('#fl-clear').onclick = () => { ui.f = { ...(ui.f || F0()), acc: '', cat: '', who: '', pay: '' }; closeSheet(); pageLanc(); };
    panel.querySelector('#fl-ok').onclick = () => { const v = id => (panel.querySelector(id) || {}).value || ''; ui.f = { ...(ui.f || F0()), acc: v('#fl-acc'), cat: v('#fl-cat'), who: v('#fl-who'), pay: v('#fl-pay') }; closeSheet(); pageLanc(); };
  });
}

function pageLanc() {
  const q = ui.q || '', st = S();
  const hasCards = st.accounts.some(a => a.nature === 'credito' && a.active !== false);
  const qa = (k, label, extra) => `<button class="qa ${extra || ''}" data-qa="${k}"><i>${QI[k === 'pgto' ? 'fat' : k]}</i>${label}</button>`;
  // no celular: resumo, atalhos, busca, filtros, lista. Em tela larga, o resumo e os atalhos vão para a coluna da direita.
  $('#page').innerHTML = `<div class="lpage"><aside class="lside"><div id="ltop">${lancTop()}</div>
    <div class="quick" id="lquick"><button class="qa main" id="imp" title="Importar fatura, extrato ou contracheque (PDF, CSV, OFX)"><i>${QI.imp}</i>Importar</button>${qa('deb', 'Despesa')}${hasCards ? qa('cred', 'Compra no cartão') : ''}${qa('rec', 'Receita')}${qa('trf', 'Transferir')}${hasCards ? qa('pgto', 'Pagar fatura') : ''}</div></aside>
    <div class="lmain"><div class="search"><input id="q" type="search" inputmode="search" enterkeyhint="search" placeholder="Buscar em todos os meses (nome ou valor)" value="${esc(q)}" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"></div>
    <div id="lfilt">${filtHTML()}</div><div id="lbody">${lancBody()}</div></div></div>`;
  $('#imp').onclick = () => pickImportFile({});
  const qi = $('#q');
  qi.oninput = () => { ui.q = qi.value; clearTimeout(qTimer); qTimer = setTimeout(() => { const b = $('#lbody'), t = $('#ltop'); if (t) t.innerHTML = lancTop(); if (b) b.innerHTML = lancBody(); }, 120); };
  qi.onkeydown = e => { if (e.key === 'Enter') qi.blur(); }; // "Buscar" no teclado fecha o teclado para ver os resultados
  $('#page').onclick = e => {
    if (monthNavClick(e, pageLanc)) return;
    const a = e.target.closest('[data-qa]'); if (a) return a.dataset.qa === 'pgto' ? payFaturaSheet(null, {}) : txSheet(null, { type: a.dataset.qa });
    const fk = e.target.closest('[data-fk]'); if (fk) { setKind(fk.dataset.fk); return pageLanc(); }
    const fx = e.target.closest('[data-fx]'); if (fx) { ui.f = { ...(ui.f || F0()), [fx.dataset.fx]: '' }; return pageLanc(); }
    if (e.target.closest('[data-fclear]')) { ui.f = null; return pageLanc(); }
    if (e.target.closest('[data-fmore]')) return filterSheet();
    if (e.target.closest('#rv-open')) return conferirSheet();
    const fi = e.target.closest('[data-fimp]'); if (fi) return pickImportFile({ accountId: fi.dataset.fimp });
    const fp = e.target.closest('[data-fpay]'); if (fp) return payFaturaSheet(null, { cardId: fp.dataset.fpay, comp: ui.month });
    const fo = e.target.closest('[data-fat]'); if (fo) return faturaSheet(fo.dataset.fat, ui.month);
    const li = e.target.closest('[data-tx]'); if (li) txSheet(S().tx.find(t => t.id === li.dataset.tx));
  };
}
/* bloco do alto: mês e os três números. Some durante a busca (que vale para todos os meses). */
function lancTop() {
  if ((ui.q || '').trim()) return '';
  const st = S(), m = ui.month, sum = C.monthSummary(st, m);
  const k = (ui.f || F0()).kind, kp = (key, label) => `<div class="kpi tap" data-fk="${key}" role="button" tabindex="0" aria-pressed="${k === key}" title="Ver só ${label.toLowerCase()} na lista"><small>${label} <span aria-hidden="true">›</span></small>`;
  return `<div class="hcard">${monthNav(m)}<div class="kpis">${kp('rec', 'Receitas')}<b class="num pos">${C.brl(sum.rec)}</b></div>
      ${kp('desp', 'Despesas')}<b class="num neg">${C.brl(sum.desp)}</b></div>
      <div class="kpi"><small>Resultado do mês</small><b class="num ${sum.saldo < 0 ? 'neg' : ''}">${C.brl(sum.saldo)}</b></div></div>
      <p class="hint">Compras no cartão aparecem no mês da fatura.${sum.folha ? ` Receitas e despesas incluem ${C.brl(sum.folha)} pagos pela folha (não passam por conta).` : ''}${sum.terc ? ` ${C.brl(sum.terc)} em compras de quem devolve o dinheiro não contam como despesa sua.` : ''}</p></div>`;
}
function lancBody() {
  const st = S(), m = ui.month, q = ui.q || '', on = fOn();
  const sumLine = l => { const inn = l.filter(t => t.type === 'rec').reduce((a, t) => a + t.amount, 0), out = l.filter(t => (t.type === 'deb' && !t.cardPay) || t.type === 'cred').reduce((a, t) => a + t.amount, 0);
    return `<p class="hint fsum">Filtro: <b>${l.length}</b> lançamento${l.length === 1 ? '' : 's'}${inn ? ` · entradas <b class="num pos">${C.brl(inn)}</b>` : ''}${out ? ` · saídas <b class="num neg">${C.brl(out)}</b>` : ''}</p>`; };
  const none = where => `<div class="card empty">Nada com este filtro ${where}.<br><button class="link" data-fclear>Limpar filtros</button></div>`;
  let html = '';
  if (q.trim()) {
    const all = C.search(st, q), res = all.filter(fMatch);
    html += `<p class="hint">${all.length ? all.length + ' resultado(s)' : 'Nada encontrado.'}${all.length === 200 ? ' (mostrando os 200 mais recentes)' : ''}</p>`;
    if (on && all.length) html += res.length ? sumLine(res) : none('na busca');
    if (res.length) html += `<div class="card" style="padding-top:2px"><ul class="list">${res.map(t => txRow(t, true)).join('')}</ul></div>`;
  } else {
    const month = st.tx.filter(t => ['rec', 'deb', 'trf'].includes(t.type) ? C.mOf(t.date) === m : t.type === 'cred' ? C.txComp(st, t) === m : false)
      .sort((a, b) => (b.date.localeCompare(a.date)) || ((b.created || 0) - (a.created || 0)));
    const list = month.filter(fMatch);
    const rv = L.review(st);
    if (rv.n && !on) html += `<button class="banner" id="rv-open"><span class="grow"><b>${rv.n} lançamento${rv.n > 1 ? 's' : ''} para conferir</b><small>${[rv.pay.length + rv.relink.length ? 'pagamento de fatura lançado como despesa' : '', rv.refund.length ? 'pix devolvido' : '', rv.nocat.length ? 'sem categoria' : ''].filter(Boolean).join(' · ')}</small></span><span aria-hidden="true">›</span></button>`;
    if (!month.length) html += `<div class="card empty">Nenhum lançamento neste mês.<br>Toque em <b>+</b> para lançar ou em <b>Importar</b> para trazer uma fatura ou um extrato.</div>`;
    else if (!list.length) html += none('neste mês');
    else {
      if (on) html += sumLine(list);
      const inAcc = list.filter(t => t.type !== 'cred'), inCard = list.filter(t => t.type === 'cred');
      if (inAcc.length) {
        let day = '';
        html += '<div class="card" style="padding-top:2px">';
        inAcc.forEach(t => {
          if (t.date !== day) { if (day) html += '</ul>'; day = t.date; html += `<div class="day">${new Date(t.date + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })}</div><ul class="list">`; }
          html += txRow(t);
        });
        html += '</ul></div>';
      }
      // compras no cartão: uma seção por fatura, com a data de cada compra na linha (parcelas antigas não se misturam aos dias do mês)
      st.accounts.filter(a => a.nature === 'credito').forEach(card => {
        const rows = inCard.filter(t => t.accountId === card.id); if (!rows.length) return;
        const f = C.faturaOf(st, card.id, m), prevN = rows.filter(t => t.prev).length, part = on ? C.r2(rows.reduce((a, t) => a + t.amount, 0)) : f.total;
        html += `<details class="card fat" open><summary><span class="grow"><b>Fatura ${esc(card.name)}</b><small>${rows.length} compra${rows.length > 1 ? 's' : ''}${on ? ' no filtro' : ''}${prevN ? ` · ${prevN} prevista${prevN > 1 ? 's' : ''}` : ''} · vence ${C.fmtD(f.date)} · ${f.status === 'liq' ? 'paga' : f.status === 'parc' ? 'paga em parte' : 'em aberto'}</small></span><span class="num">−${C.brl(part)}</span></summary>
          <div class="fatacts"><button class="btn small" data-fat="${card.id}">Abrir a fatura</button><button class="btn small" data-fimp="${card.id}">Importar</button>${f.status !== 'liq' && f.total > 0 ? `<button class="btn small" data-fpay="${card.id}">Pagar</button>` : ''}</div>
          <ul class="list">${rows.map(t => txRow(t, true, true)).join('')}</ul></details>`;
      });
    }
  }
  return html;
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
  sh.innerHTML = `<div class="box"><div class="shead"><i class="grab" aria-hidden="true"></i><button type="button" class="sx" id="sheet-x" aria-label="Fechar">✕</button></div><div class="panel" role="dialog" aria-modal="true">${html}</div></div>`;
  sh.hidden = false;
  sh.onclick = e => { if (e.target === sh || e.target.closest('#sheet-x')) closeSheet(); };
  bind(sh.querySelector('.panel'));
}
function closeSheet() {
  const sh = $('#sheet'); sh.hidden = true; sh.innerHTML = '';
  // um lançamento aberto a partir de uma lista de detalhe: ao fechar (ou salvar), a lista volta, já atualizada
  const back = ui.reopen; ui.reopen = null; if (back) setTimeout(() => { if ($('#sheet').hidden) drillSheet(back); }, 0);
}

/* ===== Detalhe: todo número que soma lançamentos abre a lista deles =====
   O elemento leva data-dr="<tipo>|<args>"; drillData monta título, lançamentos e o atalho para os Lançamentos já filtrados.
   Tipos: sum (receitas ou despesas do mês ou do ano), cat e grp (categoria ou grupo), who (quem usou o cartão, numa fatura),
   pay (forma de pagamento), fee (juros), inv (investimentos), fut (Futuro: renda ou um tipo de compromisso), plan (uma compra
   parcelada), loan (dívida), rec (conta que se repete), bal (linha do saldo da conta), pend (a vencer), ids (lista guardada),
   pn (somas por grupo, abre groupSheet). */
const DRILL = {}; let drillSeq = 0;
const keepIds = (title, ids, sub) => { const k = 'k' + (++drillSeq); DRILL[k] = { title, ids, sub }; return 'ids|' + k; };
const monthsIn = m => m.length === 4 ? Array.from({ length: 12 }, (_, i) => m + '-' + String(i + 1).padStart(2, '0')) : [m];
const perLabel = m => m.length === 4 ? 'em ' + m : 'em ' + C.monthLabel(m).toLowerCase();
function drillData(spec) {
  const st = S(), [k, a, b, c, d] = spec.split('|'), byId = id => st.tx.find(t => t.id === id);
  const sumOf = (kind, m) => monthsIn(m).flatMap(mm => C.summaryTx(st, mm, kind));
  const kindF = kind => kind === 'receita' ? 'rec' : 'desp', one = m => m.length === 7 ? m : null;
  if (k === 'sum') return { title: a === 'receita' ? 'Receitas' : 'Despesas', sub: perLabel(b), list: sumOf(a, b).map(x => x.t), lanc: one(b) && { month: b, f: { kind: kindF(a) } } };
  if (k === 'cat' || k === 'grp') {
    const it = itemById(c), g = k === 'grp' && st.groups.find(x => x.id === c);
    const list = sumOf(a, b).filter(x => k === 'cat' ? (x.itemId || '_') === c : c === '_' ? !itemById(x.itemId) : (itemById(x.itemId) || {}).groupId === c).map(x => x.t);
    return { title: k === 'cat' ? (it ? it.name : 'Sem categoria') : (g ? g.name : 'Sem categoria'), sub: (a === 'receita' ? 'Receitas ' : 'Despesas ') + perLabel(b), list,
      lanc: one(b) && { month: b, f: { kind: kindF(a), cat: c === '_' ? '_' : k === 'grp' ? 'g:' + c : c } } };
  }
  if (k === 'who') {
    const card = accById(b), h = c && (card && card.holders || []).find(x => x.ref === c);
    const list = st.tx.filter(t => t.type === 'cred' && t.accountId === b && C.txComp(st, t) === a && ((PH.holderOf(st, t) || {}).ref || '') === (c || ''));
    return { title: h ? h.name : 'Sem nome cadastrado', sub: `${card ? card.name : 'Cartão'} · fatura de ${C.monthLabel(a).toLowerCase()}${h && h.reimb ? ' · devolve o dinheiro' : ''}`, list, lanc: c ? { month: a, f: { kind: 'cred', acc: b, who: b + '|' + c } } : null };
  }
  if (k === 'pay') {
    const list = sumOf('despesa', a).map(x => x.t).filter(t => (t.folha ? 'folha' : C.payOf(st, t) || (t.type === 'cred' ? 'cartao' : 'outros')) === b);
    const lab = { folha: 'Descontado na folha', cartao: 'Cartão de crédito', outros: 'Sem forma informada' }[b] || C.payLabel(b);
    return { title: lab, sub: 'Despesas ' + perLabel(a), list, lanc: C.payLabel(b) ? { month: a, f: { kind: 'desp', pay: b } } : null };
  }
  if (k === 'fee') return { title: 'Juros e taxas', sub: perLabel(a) + ' · Pix parcelado ou no crédito', list: st.tx.filter(t => t.fee && (t.type === 'cred' ? C.txComp(st, t) : C.mOf(t.date)) === a) };
  if (k === 'inv') { const inv = new Set(st.accounts.filter(x => x.inv).map(x => x.id)); return { title: 'Investimentos', sub: 'Aportes e resgates ' + perLabel(a), list: st.tx.filter(t => t.type === 'trf' && C.mOf(t.date) === a && inv.has(t.accountId) !== inv.has(t.toAccountId)) }; }
  if (k === 'fut') { const K = (C.COMMIT_KINDS.find(x => x[0] === b) || [])[1]; return { title: b === 'renda' ? 'Renda prevista' : K, sub: perLabel(a), list: C.committedTx(st, a, b), asc: true,
    lanc: { month: a, f: { kind: { renda: 'rec', parcelas: 'parc', fixas: 'fix', variaveis: 'fix', dividas: 'debt' }[b] || 'all' } } }; }
  if (k === 'plan') { const list = st.tx.filter(t => (t.parcKey || t.seriesId) === a); const f0 = list[0]; return { title: f0 ? f0.desc.replace(/\s*\(\d+\/\d+\)\s*$/, '') : 'Compra parcelada', sub: `${(accById(f0 && f0.accountId) || {}).name || ''} · ${list.length} parcela${list.length === 1 ? '' : 's'}`, list, asc: true, months: true }; }
  if (k === 'loan') { const l = st.loans.find(x => x.id === a); return { title: l ? [l.person, l.desc].filter(Boolean).join(' · ') : 'Dívida', sub: 'Parcelas', list: st.tx.filter(t => t.loanId === a), asc: true, months: true }; }
  if (k === 'rec') { const r = (st.rec || []).find(x => x.id === a); return { title: r ? r.desc : 'Conta que se repete', sub: 'Todos os meses, pagos e previstos', list: st.tx.filter(t => t.recId === a), asc: true, months: true }; }
  if (k === 'bal') { const B = C.balanceBreakdown(st, a, M.todayISO()); const ids = B ? (b === 'now' ? B.ids : B.pendIds)[c] || [] : [];
    return { title: { rec: 'Receitas', deb: 'Despesas', cardPay: 'Pagamentos de fatura', trfIn: 'Transferências recebidas', trfOut: 'Transferências enviadas', adj: 'Rendimento registrado' }[c], sub: `${(accById(a) || {}).name || ''} · ${b === 'now' ? 'já no saldo' : 'até o fim do mês'}`, list: ids.map(byId).filter(Boolean), months: true }; }
  if (k === 'pend') { const today = M.todayISO(), in30 = C.mAdd(today.slice(0, 7), 1) + today.slice(7);
    return { title: a === 'in' ? 'A receber' : 'A pagar', sub: 'Atrasados e próximos 30 dias' + (a === 'out' ? ' (faturas de cartão ficam na lista da Agenda)' : ''), list: C.pendings(st, in30).filter(p => p.kind === 'tx' && p.dir === a).map(p => p.tx), asc: true }; }
  if (k === 'ids') { const D = DRILL[a] || { title: 'Lançamentos', ids: [] }; return { title: D.title, sub: D.sub, list: D.ids.map(byId).filter(Boolean), months: true }; }
  return { title: 'Lançamentos', list: [] };
}
function drillSheet(spec) {
  if (spec.startsWith('pn|')) return sumsSheet(spec);
  const D = drillData(spec), list = D.list.slice().sort((x, y) => (D.asc ? 1 : -1) * (x.date.localeCompare(y.date) || 0));
  const mOf = t => t.type === 'cred' ? C.txComp(S(), t) : C.mOf(t.date);
  const multi = D.months || new Set(list.map(mOf)).size > 1;
  const tot = C.r2(list.reduce((x, t) => x + Math.abs(t.amount), 0));
  let body = '';
  if (!list.length) body = '<p class="empty">Nenhum lançamento.</p>';
  else if (multi) {
    const by = new Map(); list.forEach(t => { const m = mOf(t); if (!by.has(m)) by.set(m, []); by.get(m).push(t); });
    body = [...by].map(([m, l]) => `<div class="day dhead"><span>${C.monthLabel(m)}</span><span class="num">${C.brl(l.reduce((x, t) => x + Math.abs(t.amount), 0))}</span></div><ul class="list">${l.map(t => txRow(t, true)).join('')}</ul>`).join('');
  } else body = `<ul class="list">${list.map(t => txRow(t, true)).join('')}</ul>`;
  openSheet(`<h2>${esc(D.title || '')}</h2>${D.sub ? `<p class="hint">${esc(D.sub)}</p>` : ''}
    <div class="dsum"><span><b class="num">${C.brl(tot)}</b><small>${list.length} lançamento${list.length === 1 ? '' : 's'}</small></span>${D.lanc ? '<button class="btn small" id="dr-lanc">Abrir nos Lançamentos</button>' : ''}</div>
    <div id="dr-list">${body}</div>`, panel => {
    panel.onclick = e => {
      if (e.target.id === 'dr-lanc') { closeSheet(); ui.month = D.lanc.month; ui.f = { ...F0(), ...D.lanc.f }; ui.tab = 'lanc'; ui.q = ''; ui.sub = null; render(); return window.scrollTo(0, 0); }
      const li = e.target.closest('[data-tx]'); if (li) { const t = S().tx.find(x => x.id === li.dataset.tx); if (!t) return; txSheet(t); ui.reopen = spec; }
    };
  });
}
/* somas por grupo num período (motor do antigo Painel, js/panel.js): tocar num grupo ou num mês abre os lançamentos */
function sumsSheet(spec) {
  const [, set, per, group, title] = spec.split('|'), o = { ...PN.defaults(), set, per, group }, R = PN.build(S(), o);
  const perL = ((PN.PERIODS.find(x => x[0] === per) || [])[1] || '').toLowerCase(), maxG = Math.max(1, ...R.groups.map(g => Math.abs(g.total))), maxM = Math.max(1, ...R.byMonth.map(x => Math.abs(x.total)));
  let last = -1; R.byMonth.forEach((x, i) => { if (x.total) last = i; }); const mList = per[0] === 'n' ? R.byMonth.slice(0, last + 1) : R.byMonth;
  const sub = g => g.parcN ? `${g.parcLeft} de ${g.parcN} parcelas no período · até ${shortM(g.lastM)}` : `${g.n} lançamento${g.n === 1 ? '' : 's'}${R.months.length > 1 ? ' · até ' + shortM(g.lastM) : ''}`;
  openSheet(`<h2>${esc(title || 'Detalhe')}</h2><p class="hint">${esc(perL)}${R.months.length > 1 && R.total ? ` · média de ${C.brl(R.total / R.months.length)} por mês` : ''}</p>
    <div class="dsum"><span><b class="num">${C.brl(R.total)}</b><small>${R.n} lançamento${R.n === 1 ? '' : 's'}</small></span></div>
    ${!R.n ? '<p class="empty">Nada neste período.</p>' : `<h3 class="sub">Por ${group === 'who' ? 'pessoa' : 'item'}</h3><ul class="list wrap">${R.groups.map(g => `<li data-dr="${keepIds(g.label, g.ids, (title || '') + ' · ' + perL)}"><span class="sw" style="background:${col(g.color)};margin-top:6px;align-self:flex-start"></span><span class="t"><b>${esc(g.label)}</b><small>${sub(g)}</small><span class="bar"><i style="width:${(Math.abs(g.total) / maxG * 100).toFixed(1)}%;background:${col(g.color)}"></i></span></span><span class="num">${C.brl(g.total)}</span><span class="chev" aria-hidden="true">›</span></li>`).join('')}</ul>
    ${mList.length > 1 ? `<h3 class="sub">Mês a mês</h3>${mList.map(x => `<button class="pnrow" data-dr="${keepIds(title || 'Lançamentos', x.ids, C.monthLabel(x.m))}"><span class="cm"><b>${shortM(x.m)}</b></span><span class="cbar"><i style="width:${(Math.abs(x.total) / maxM * 100).toFixed(1)}%;background:var(--brand)"></i></span><span class="num pv">${C.brl(x.total)}</span></button>`).join('')}` : ''}`}`, () => {});
}
document.addEventListener('click', e => {
  const el = e.target.closest && e.target.closest('[data-dr]'); if (!el || document.body.classList.contains('locked')) return;
  e.stopPropagation(); e.preventDefault(); drillSheet(el.dataset.dr);
}, true);

function txSheet(tx, preset) {
  if (tx && tx.folha) return folhaTxSheet(tx);
  if ((tx && tx.cardPay) || (!tx && preset && preset.type === 'pgto')) return payFaturaSheet(tx, preset || {});
  const st = S();
  const hasCards = st.accounts.some(a => a.nature === 'credito' && a.active !== false);
  let type = tx ? tx.type : (preset && preset.type) || 'deb', pendTouched = false, keep = null, payPre = (preset && preset.pay) || '';
  const draw = panel => {
    const kind = type === 'rec' ? 'receita' : 'despesa';
    const defDate = tx ? tx.date : (ui.month === M.todayISO().slice(0, 7) ? M.todayISO() : ui.month + '-01');
    const accSel = tx && tx.type === type ? tx.accountId : (preset && preset.accountId) || '';
    const loanInfo = tx && tx.loanId ? (() => { const l = st.loans.find(x => x.id === tx.loanId); return l ? `<p class="hint">Parte da dívida ${l.dir === 'in' ? 'de' : 'com'} <b>${esc(l.person)}</b>.</p>` : ''; })() : '';
    const origin = (tx && tx.adj ? '<p class="hint"><b>Ajuste de valor do investimento:</b> muda o saldo da conta de investimento, sem entrar nas receitas e despesas do mês.</p>'
      : tx && tx.slipId ? '<p class="hint">Líquido do contracheque (Agenda › Fixas e parcelas › Renda do emprego).</p>' : '')
      + (tx && tx.origin === 'import' && !tx.slipId ? `<p class="hint">Importado${tx.rawDesc ? ': ' + esc(tx.rawDesc) : ''}${tx.cardRef ? ' · cartão final ' + esc(tx.cardRef) : ''}.</p>` : '');
    const rule = tx && tx.recId && (st.rec || []).find(r => r.id === tx.recId);
    const series = tx && tx.seriesId ? `<p class="hint">${tx.seriesKind === 'parc' ? 'Parcela' : 'Repetição'} ${tx.seriesIdx} de ${tx.seriesN}.</p>`
      : tx && tx.parcKey ? `<p class="hint">Parcela ${tx.parcI} de ${tx.parcN}${tx.prev ? ' prevista: será trocada pela real quando a fatura for importada' : ''}.</p>`
      : rule ? `<p class="hint">Faz parte de <b>${esc(rule.desc)}</b> (${rule.kind === 'var' ? 'todo mês, valor variável' : 'fixa, todo mês'}).${tx.prev ? ' Valor previsto.' : ''} Para mudar todos os meses ou encerrar: Agenda › Fixas e parcelas.</p>` : '';
    const FREQ = type === 'trf' ? [] : type === 'cred'
      ? [['uma', 'À vista'], ['parc', 'Parcelada'], ['fixa', 'Fixa todo mês (assinatura)'], ['var', 'Todo mês, valor variável']]
      : type === 'rec' ? [['uma', 'Só esta vez'], ['parc', 'Recebida em parcelas'], ['fixa', 'Fixa todo mês, sem data para acabar'], ['var', 'Todo mês, valor variável (comissão, aluguel recebido…)'], ['rep', 'Repetir por alguns meses']]
      : [['uma', 'Só esta vez'], ['parc', 'Parcelada'], ['fixa', 'Fixa todo mês, sem data para acabar'], ['var', 'Todo mês, valor variável (luz, água…)'], ['rep', 'Repetir por alguns meses']];
    const linkBox = !tx ? '' : L.canLink(tx) ? `<div class="linkbox"><button type="button" class="btn block" id="f-link">Vincular a…</button><small>Pagamento de fatura, conta que se repete (aluguel, condomínio, salário), parcela de dívida ou transferência.</small></div>`
      : rule && !tx.prev && !tx.slipId ? '<button type="button" class="link" id="f-unlink">Desvincular desta conta que se repete</button>' : '';
    const freq0 = (preset && preset.freq) || 'uma';
    // formas de pagamento conforme o tipo; sem escolha, o app deduz pelo nome que veio do banco
    const inferred = tx && !tx.pay ? C.payOf(st, tx) : '', paySel = tx && tx.type === type ? (tx.pay || '') : payPre;
    const payOpts = () => { const ks = type === 'cred' ? ['pixcred'] : type === 'rec' ? ['pix', 'ted', 'dinheiro', 'boleto'] : ['pix', 'pixag', 'pixrec', 'pixauto', 'pixparc', ...(hasCards && !tx ? ['pixcred'] : []), 'boleto', 'debito', 'debauto', 'dinheiro', 'ted'];
      const first = type === 'cred' ? 'Compra no cartão' : inferred ? `Automático (${C.payLabel(inferred)})` : 'Não informar';
      return `<option value="">${first}</option>` + ks.map(k => `<option value="${k}" ${k === paySel ? 'selected' : ''}>${k === 'pix' && type === 'rec' ? 'Pix recebido' : k === 'pixcred' && type !== 'cred' ? 'Pix no crédito (vai para a fatura do cartão)' : C.payLabel(k)}</option>`).join(''); };
    const repeat = tx || !FREQ.length ? '' : `<label for="f-freq">Frequência</label><select id="f-freq">${FREQ.map(([k, l]) => `<option value="${k}" ${k === freq0 ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <div id="f-nbox" hidden><label for="f-n" id="f-nlbl">Parcelas</label><select id="f-n"></select></div>`;
    panel.innerHTML = `<h2>${tx ? 'Editar lançamento' : preset && preset.freq === 'parc' ? (type === 'rec' ? 'Nova receita em parcelas' : 'Nova compra ou despesa parcelada') : preset && preset.freq ? `Nova ${kind} que se repete` : 'Novo lançamento'}</h2>${series}${origin}${loanInfo}
      <div class="seg" id="seg">${['deb', 'cred', 'rec', 'trf'].filter(k => k !== 'cred' || hasCards || type === 'cred').map(k => `<button type="button" data-type="${k}" aria-pressed="${k === type}" ${tx && (tx.seriesId || tx.recId || tx.parcKey) && k !== type ? 'disabled' : ''}>${TYPE[k]}</button>`).join('')}</div>
      ${!tx && hasCards ? '<button type="button" class="link" id="f-pgto">Pagar fatura de cartão →</button>' : ''}
      <label for="f-val" id="f-vallbl">Valor (R$)</label><div class="pm"><input id="f-val" inputmode="decimal" value="${keep ? esc(keep.val) : tx ? moneyText(tx.amount) : ''}" placeholder="0,00">${type === 'cred' ? '<button type="button" class="pmb" data-pm aria-label="Trocar sinal: negativo é estorno ou crédito no cartão">±</button>' : ''}</div>
      <label for="f-date">${type === 'cred' ? 'Data da compra' : 'Data'}</label><input id="f-date" type="date" value="${esc(keep ? keep.date : defDate)}">
      <label for="f-desc">Descrição</label><input id="f-desc" value="${esc(keep ? keep.desc : tx ? tx.desc : '')}" placeholder="Opcional">
      ${type === 'trf' ? `<label>De</label><select id="f-acc">${optAccounts('debito', accSel)}</select><label>Para</label><select id="f-to">${optAccounts('debito', tx && tx.toAccountId)}</select>`
        : `<label for="f-item">Categoria</label><select id="f-item"><option value="">Escolha…</option>${optItems(kind, tx && tx.itemId)}</select>
           <label for="f-acc">${type === 'cred' ? 'Cartão' : 'Conta'}</label><select id="f-acc">${optAccounts(type === 'cred' ? 'credito' : 'debito', accSel)}</select>${type === 'cred' ? '<div id="f-hbox"></div>' : ''}
           <label for="f-pay">Forma de pagamento</label><select id="f-pay">${payOpts()}</select><p class="hint" id="f-payhint"></p>
           <div id="f-feebox" hidden><label for="f-fee">Juros e taxas já incluídos no valor (R$)</label><input id="f-fee" inputmode="decimal" value="${tx && tx.fee ? moneyText(tx.fee) : ''}" placeholder="0,00 (opcional)"></div>`}
      ${type === 'cred' ? '' : `<label class="check"><input type="checkbox" id="f-pend" ${tx && tx.status === 'pend' && !(preset && preset.payNow) ? 'checked' : ''}> Ainda não ${type === 'rec' ? 'recebido' : 'pago'} (pendente)</label>`}
      ${repeat}<p class="hint" id="f-prev"></p>${linkBox}
      <div class="actions">${tx ? '<button class="btn danger" id="f-del">Excluir</button>' : ''}<button class="btn" id="f-cancel">Cancelar</button><button class="btn primary" id="f-save">Salvar</button></div>`;
    const keepNow = () => { keep = { val: panel.querySelector('#f-val').value, date: panel.querySelector('#f-date').value, desc: panel.querySelector('#f-desc').value }; }; // trocar de tipo não apaga o que já foi digitado
    panel.querySelector('#seg').onclick = e => { const b = e.target.closest('[data-type]'); if (b && !b.disabled) { keepNow(); type = b.dataset.type; if (type !== 'cred' && payPre === 'pixcred') payPre = ''; draw(panel); } };
    const payEl = panel.querySelector('#f-pay');
    const PAYHINT = { pix: type === 'rec' ? '' : 'Sai da conta na hora.', pixag: 'Agendado: fica pendente na conta até a data. Confirme na Agenda quando sair.',
      pixrec: 'Você agendou no banco um Pix de valor fixo todo mês: fica como conta que se repete, com os próximos meses previstos na conta.',
      pixauto: 'A empresa cobra e o banco debita sozinho, como um débito automático: fica como conta que se repete. Se o valor muda a cada mês, troque a frequência para "valor variável".',
      pixparc: 'O banco paga quem recebe à vista e debita as parcelas da sua conta. Informe o valor total com os juros e o número de parcelas.',
      pixcred: 'Entra na fatura do cartão e não sai da conta agora. Informe o valor total com a taxa; se dividiu, escolha "Parcelada" na frequência.' };
    const payChanged = user => {
      if (!payEl) return; const v = payEl.value, fq = panel.querySelector('#f-freq'), pe = panel.querySelector('#f-pend');
      if (user && v === 'pixcred' && type !== 'cred') { keepNow(); type = 'cred'; payPre = 'pixcred'; return draw(panel); }
      panel.querySelector('#f-payhint').textContent = PAYHINT[v] || '';
      panel.querySelector('#f-feebox').hidden = !(v === 'pixparc' || v === 'pixcred' || (tx && tx.fee));
      if (!user || tx) return;
      const setF = k => { if (fq && fq.value === 'uma') { fq.value = k; fq.dispatchEvent(new Event('change', { bubbles: true })); } };
      if (v === 'pixag' && pe) { pe.checked = true; pendTouched = true; }
      if (v === 'pixrec' || v === 'pixauto') setF('fixa');
      if (v === 'pixparc') setF('parc');
    };
    if (payEl) { payEl.onchange = () => payChanged(true); payChanged(false); }
    if (panel.querySelector('#f-pgto')) panel.querySelector('#f-pgto').onclick = () => payFaturaSheet(null, {});
    if (panel.querySelector('#f-link')) panel.querySelector('#f-link').onclick = () => linkSheet(tx);
    if (panel.querySelector('#f-unlink')) panel.querySelector('#f-unlink').onclick = async () => {
      if (!(await confirmBox(`Desvincular de "${rule.desc}"? O lançamento continua, como um lançamento comum.`))) return;
      await sync.commit(s => { L.unlinkRule(s, tx.id); }); closeSheet(); render(); toast('Desvinculado.');
    };
    // data no futuro: começa como pendente (o dinheiro ainda não saiu nem entrou); a pessoa pode desmarcar
    const pendEl = panel.querySelector('#f-pend'), dateEl = panel.querySelector('#f-date');
    if (pendEl && !tx) {
      const auto = () => { if (!pendTouched) pendEl.checked = dateEl.value > M.todayISO(); };
      pendEl.onchange = () => { pendTouched = true; }; dateEl.addEventListener('change', auto); auto();
    }
    const freqOf = () => { const f = panel.querySelector('#f-freq'); return f ? f.value : 'uma'; };
    let nFor = '';
    const fillN = () => {
      const fq = freqOf(), box = panel.querySelector('#f-nbox'); if (!box) return;
      box.hidden = !['parc', 'rep'].includes(fq);
      if (box.hidden || nFor === fq) return;
      const sel = panel.querySelector('#f-n'), old = +sel.value || 0, max = fq === 'parc' ? 36 : 120;
      panel.querySelector('#f-nlbl').textContent = fq === 'parc' ? 'Número de parcelas' : 'Por quantos meses (contando este)';
      sel.innerHTML = Array.from({ length: max - 1 }, (_, i) => `<option value="${i + 2}">${i + 2}${fq === 'parc' ? 'x' : ' meses'}</option>`).join('');
      sel.value = String(old >= 2 && old <= max ? old : fq === 'parc' ? 2 : 12); nFor = fq;
    };
    const nOf = () => ['parc', 'rep'].includes(freqOf()) ? Math.max(2, Math.min(120, +panel.querySelector('#f-n').value || 2)) : 1;
    const preview = () => {
      fillN();
      const h = panel.querySelector('#f-prev'), n = nOf(), fq = freqOf(), v = C.parseMoney(panel.querySelector('#f-val').value), d = panel.querySelector('#f-date').value;
      panel.querySelector('#f-vallbl').textContent = fq === 'parc' ? 'Valor total (R$)' : fq === 'var' ? 'Valor deste mês ou estimativa (R$)' : 'Valor (R$)';
      let txt = '';
      if ((fq === 'fixa' || fq === 'var') && d) {
        txt = `Todo mês no dia ${+d.slice(8, 10)}${type === 'cred' ? ', no cartão' : ''}, sem data para acabar: os próximos 12 meses aparecem ${type === 'cred' ? 'nas faturas' : 'na Agenda'}. `
          + (fq === 'var' ? `O valor previsto dos próximos meses é a média dos 3 últimos ${type === 'rec' ? 'recebidos' : 'pagos'} (começa com este). ` : '') + 'Para mudar ou encerrar: Agenda › Fixas e parcelas.';
      } else if (type === 'cred') {
        const card = accById(panel.querySelector('#f-acc').value);
        if (card && d) {
          const c0 = C.cardCycle(card, d).comp;
          txt = n > 1 ? `${n}x de ${C.brl(M.splitAmount(v || 0, n)[1])}, nas faturas de ${shortM(c0)} a ${shortM(C.mAdd(c0, n - 1))}.` : `Entra na fatura de ${C.monthLabel(c0).toLowerCase()}.`;
        }
      } else if (n > 1 && d) txt = fq === 'parc' ? `${n}x de ${C.brl(M.splitAmount(v || 0, n)[1])}, de ${shortM(d.slice(0, 7))} a ${shortM(C.mAdd(d.slice(0, 7), n - 1))} (os meses futuros ficam pendentes na Agenda).`
        : `${n} lançamentos de ${C.brl(v || 0)}, de ${shortM(d.slice(0, 7))} a ${shortM(C.mAdd(d.slice(0, 7), n - 1))}.`;
      h.textContent = txt;
    };
    // quem usou o cartão (portadores cadastrados em Contas › cartão)
    const fillHolders = () => {
      const box = panel.querySelector('#f-hbox'); if (!box) return;
      const card = accById(panel.querySelector('#f-acc').value), hs = PH.holdersOf(card), curRef = box.querySelector('#f-holder') ? box.querySelector('#f-holder').value : PH.refOf(tx && tx.cardRef);
      box.innerHTML = hs.length ? `<label for="f-holder">Quem usou</label><select id="f-holder"><option value="">Não informado</option>${hs.map(h => `<option value="${esc(h.ref)}" ${h.ref === curRef ? 'selected' : ''}>${esc(PH.label(h))}${h.reimb ? ' (devolve)' : ''}</option>`).join('')}</select>` : '';
    };
    fillHolders(); if (panel.querySelector('#f-hbox')) panel.querySelector('#f-acc').addEventListener('change', fillHolders);
    panel.oninput = preview; panel.onchange = preview; preview();
    panel.querySelector('#f-cancel').onclick = closeSheet;
    if (tx) panel.querySelector('#f-del').onclick = async () => {
      let scope = 'one';
      if (tx.seriesId || tx.parcKey) { scope = await askChoice('Excluir', 'Este lançamento faz parte de uma série.', [{ label: 'Só este', value: 'one' }, { label: 'Este e os seguintes', value: 'next', danger: true }]); if (!scope) return; }
      else if (tx.recId) { scope = await askChoice('Excluir', 'Este lançamento é de uma conta que se repete todo mês.', [{ label: 'Só este mês', value: 'one' }, { label: 'Este e os próximos (encerrar)', value: 'end', danger: true }]); if (!scope) return; }
      else if (!(await confirmBox('Excluir este lançamento?'))) return;
      let n = 1;
      await sync.commit(s => {
        const cur = s.tx.find(t => t.id === tx.id); if (!cur) return;
        if (scope === 'next' && cur.parcKey) { const ids = s.tx.filter(t => t.parcKey === cur.parcKey && t.parcI >= cur.parcI).map(t => t.id); ids.forEach(id => M.removeRecord(s, 'tx', id)); n = ids.length; }
        else if (scope === 'next') n = M.removeSeriesFrom(s, cur);
        else if (scope === 'end') { const r = s.rec.find(x => x.id === cur.recId); n = (r ? M.endRec(s, r, C.mAdd(cur.recM, -1)) : 0); if (s.tx.some(t => t.id === tx.id)) { M.removeRecord(s, 'tx', tx.id); n++; } }
        else M.removeRecord(s, 'tx', tx.id);
      });
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
      const hSel = panel.querySelector('#f-holder'), hRef = hSel ? hSel.value : '';
      const fields = { type, amount, date, accountId, itemId, toAccountId, desc, status, signed: type === 'cred', cardRef: hRef || undefined };
      const pay = panel.querySelector('#f-pay') ? panel.querySelector('#f-pay').value : '';
      const feeEl = panel.querySelector('#f-fee'), fee = feeEl && !panel.querySelector('#f-feebox').hidden ? Math.abs(C.parseMoney(feeEl.value)) : 0;
      if (fee > Math.abs(amount)) return toast('Os juros não podem ser maiores que o valor total.', true);
      const n = nOf(), freq = freqOf();
      if ((freq === 'fixa' || freq === 'var') && amount < 0) return toast('Conta que se repete não pode ter valor negativo.', true);
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
          else if (tx.date !== date || tx.accountId !== accountId) delete cur.comp; // só muda de fatura se mudou a data ou o cartão (a fatura importada fica)
          if (cur.type === 'cred' && hSel) { if (hRef) cur.cardRef = hRef; else if (PH.holderOf(s, cur)) delete cur.cardRef; }
          delete cur.prev; // valor conferido pela pessoa: não é mais previsão
          if (pay) cur.pay = pay; else delete cur.pay;
          if (fee) cur.fee = fee; else delete cur.fee;
          M.touch(cur);
        } else if (freq === 'fixa' || freq === 'var') {
          const r = M.newRec({ kind: freq, type, desc: desc || (itemById(itemId) || {}).name || '', itemId, accountId, amount: Math.abs(amount), day: +date.slice(8, 10), start: date.slice(0, 7) });
          if (pay) r.pay = pay; // vale para todos os meses da conta que se repete
          s.rec.push(r); M.recFirst(s, r, { date, amount, status }); count = 1 + M.ensureRecurring(s);
        } else if (n > 1) {
          const list = M.makeSeries({ ...fields, kind: freq === 'parc' ? 'parc' : 'rep' }, n, card ? C.cardCycle(card, date).comp : null);
          const today = M.todayISO();
          if (type === 'rec' || type === 'deb') list.forEach(x => { if (x.date > today) x.status = 'pend'; }); // o futuro fica pendente até ser confirmado na Agenda
          if (pay) list.forEach(x => { x.pay = pay; });
          if (fee) list.forEach(x => { x.fee = C.r2(fee / list.length); }); // os juros informados são do total: cada parcela leva a sua parte
          s.tx.push(...list); count = list.length;
        }
        else { const nt = M.newTx(fields); if (pay) nt.pay = pay; if (fee) nt.fee = fee; s.tx.push(nt); }
      });
      keepRecurring(); closeSheet(); render(); toast(tx ? (count > 1 ? `${count} lançamentos atualizados.` : 'Lançamento atualizado.') : (freq === 'fixa' || freq === 'var') ? 'Salvo. Os próximos meses estão em Agenda › Fixas e parcelas.' : (count > 1 ? `${count} lançamentos criados.` : 'Lançamento salvo.'));
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
      <p class="hint">${S() && S().profile && S().profile.cpf6 ? 'O CPF cadastrado em Ajustes não abriu este arquivo.' : '<b>CPF não cadastrado.</b> Se a senha for o começo do seu CPF, cadastre em Ajustes › CPF para senha de PDF e o app abre os próximos sozinho.'}</p>
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
    return H.parseHolerite(pages) || P.parsePdfPages(pages); // contracheque tem leitor próprio
  }
  if (name.endsWith('.ofx') || /<OFX>/i.test(new TextDecoder('latin1').decode(bytes.slice(0, 600)))) return P.parseOfx(bytes);
  return P.parseCsv(bytes);
}

function pickImportFile(preset) {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.pdf,.csv,.ofx,.txt,application/pdf,text/csv'; inp.multiple = true; // vários só para contracheques
  inp.onchange = () => { if (inp.files.length > 1) importMany([...inp.files]); else if (inp.files[0]) importFlow(inp.files[0], preset); };
  inp.click();
}

async function importFlow(file, preset = {}) {
  const ov = busyOverlay('Lendo ' + file.name + '…');
  try {
    if (/\.(csv|txt)$/i.test(file.name) || /csv|text/.test(file.type)) {
      const txt = new TextDecoder('utf-8').decode(new Uint8Array(await file.arrayBuffer()));
      if (PP.isParcelFile(txt)) { ov.close(); return parcelSheet(txt, file.name); }
    }
    const st = await readStatement(file);
    ov.close();
    if (st.kind === 'holerite') return slipSheet([st], file.name);
    if (!st.lines.length) return toast('Não encontrei lançamentos neste arquivo. Se for de outro banco, me envie um exemplo para eu ensinar o app a ler.', true);
    reviewSheet(st, file.name, preset);
  } catch (e) { ov.close(); toast(e.message || 'Não foi possível ler o arquivo.', true); }
}

/* vários arquivos de uma vez: só contracheques (para montar o histórico e a previsão de uma vez) */
async function importMany(files) {
  const ov = busyOverlay('Lendo ' + files.length + ' arquivos…');
  const list = [], bad = [];
  for (const [i, f] of files.entries()) {
    ov.set(`Lendo ${i + 1} de ${files.length}…`);
    try { const st = await readStatement(f); if (st && st.kind === 'holerite') list.push(st); else bad.push(f.name); } catch { bad.push(f.name); }
  }
  ov.close();
  if (!list.length) return toast('Escolher vários arquivos de uma vez só funciona para contracheques. Faturas e extratos: um por vez.', true);
  if (bad.length) toast(`${bad.length} arquivo(s) não são contracheques e ficaram de fora: ${bad.slice(0, 3).join(', ')}${bad.length > 3 ? '…' : ''}`, true);
  slipSheet(list, list.length + ' contracheques');
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
    if (acc && acc.nature === 'credito' && !comp) comp = M.skipComp(S(), acc.id, C.cardCycle(acc, (st.lines.map(l => l.date).filter(Boolean).sort().pop()) || M.todayISO()).comp);
    plan = acc ? IP.buildPlan(S(), st, { accountId, comp }) : null;
    if (plan && plan.isCard) { const due = st.due || (comp ? C.faturaOf(S(), accountId, comp).date : null); plan.alreadyPaid = !!(st.kind === 'fatura' && due && due < M.todayISO()); }
    // extrato com saldo anterior: sugere usá-lo como saldo inicial quando a conta ainda não tem data de saldo inicial, ou ela é posterior ao extrato
    if (plan && !plan.isCard && st.saldoIni != null && st.saldoIniDate && (!acc.initialDate || acc.initialDate >= st.saldoIniDate) && !(acc.initialDate === st.saldoIniDate && C.r2(acc.initial) === C.r2(st.saldoIni))) plan.setInitial = { value: st.saldoIni, date: st.saldoIniDate };
  };
  rebuild();
  openSheet('', panel => {
    panel.classList.add('wide');
    const draw = () => {
      const acc = accById(accountId), isCard = acc && acc.nature === 'credito';
      const count = k => plan ? plan.rows.filter(r => r.status === k || (k === 'ignored' && r.status === 'cardpay') || (k === 'new' && (r.status === 'prev' || r.status === 'inv'))).length : 0;
      const sel = plan ? plan.rows.filter(r => r.include && r.status !== 'cardpay') : [];
      const noCat = sel.filter(r => !r.itemId && r.tx.type !== 'trf').length;
      const total = sel.reduce((s, r) => s + r.tx.amount, 0);
      const inSum = sel.filter(r => r.line.dir === 'in').reduce((s, r) => s + r.tx.amount, 0), outSum = sel.filter(r => r.line.dir !== 'in').reduce((s, r) => s + r.tx.amount, 0);
      const goLabel = isCard ? `Importar ${sel.length} · ${C.brl(total)}` : `Importar ${sel.length}`;
      const opts = ['credito', 'debito'].map(n => {
        const l = S().accounts.filter(a => a.nature === n && a.active !== false);
        return l.length ? `<optgroup label="${n === 'credito' ? 'Cartões' : 'Contas'}">${l.map(a => `<option value="${a.id}" ${a.id === accountId ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</optgroup>` : '';
      }).join('');
      const chk = st.check || {};
      const taken = new Set(plan ? plan.rows.filter(r => r.status === 'prev' && r.match).map(r => r.match.id) : []);
      const rowsHTML = !plan ? '' : plan.rows.filter(r => filter === 'all' || r.status === filter || (filter === 'new' && (r.status === 'prev' || r.status === 'inv')) || (filter === 'ignored' && (r.status === 'cardpay' || r.status === 'already'))).map(r => {
        const l = r.line, sign = r.tx && r.tx.amount < 0 ? '−' : '';
        const amt = `<span class="num ${l.dir === 'in' && !isCard ? 'pos' : ''}">${l.dir === 'in' ? (isCard ? '−' : '+') : ''}${C.brl(l.amount)}</span>`;
        const head = `<div class="irow-h"><label class="check"><input type="checkbox" data-inc="${r.idx}" ${r.include ? 'checked' : ''} ${['ignored', 'already'].includes(r.status) || (r.status === 'cardpay' && !r.fatura) ? 'disabled' : ''}></label>
          <span class="t"><b>${esc(r.tx ? r.tx.desc : l.desc)}</b><small>${l.date ? C.fmtD(l.date) + '/' + l.date.slice(2, 4) : ''}${l.cardRef ? ' · final ' + esc(l.cardRef) : ''}${sign ? ' · estorno/crédito' : ''}</small></span>${amt}</div>`;
        let body = '';
        if (r.status === 'inv' || (r.status === 'new' && r.invOptions)) body = `<p class="hint">${r.status === 'inv' ? (l.dir === 'in' ? 'Resgate' : 'Aplicação') + ': transferência entre a conta e o investimento, sem contar como ' + (l.dir === 'in' ? 'receita' : 'despesa') + '.' : 'Lançado como ' + (l.dir === 'in' ? 'receita' : 'despesa') + ' comum.'}</p>
          <select data-inv="${r.idx}">${r.invOptions.map(id => `<option value="${id}" ${id === r.invId ? 'selected' : ''}>${esc((accById(id) || {}).name || '')}</option>`).join('')}<option value="" ${r.status === 'inv' ? '' : 'selected'}>Não é investimento</option></select>`
          + (r.status === 'new' ? `<select data-cat="${r.idx}" class="${r.itemId ? '' : 'missing'}"><option value="">Sem categoria</option>${optItems(r.tx.type === 'rec' ? 'receita' : 'despesa', r.itemId)}</select>` : '');
        else if (r.status === 'new') body = `<select data-cat="${r.idx}" class="${r.itemId ? '' : 'missing'}"><option value="">Sem categoria</option>${optItems(r.tx.type === 'rec' ? 'receita' : 'despesa', r.itemId)}</select>${r.how && r.how !== 'escolhida' ? `<small class="hint">sugerida por ${r.how}</small>` : ''}`;
        if (r.status === 'new' && (r.recOptions || []).some(o => !taken.has(o.id))) body += `<select data-rec="${r.idx}" aria-label="Vincular a uma conta que se repete"><option value="">Não é uma conta fixa cadastrada</option>${r.recOptions.filter(o => !taken.has(o.id)).map(o => `<option value="${o.id}">É o pagamento de: ${esc(o.desc)} · ${shortM(o.recM || o.date.slice(0, 7))} · previsto ${C.brl(o.amount)}</option>`).join('')}</select>`;
        if (r.status === 'new' && r.moveOpt) { const o = r.moveOpt, fromA = accById(o.from), toA = accById(r.tx.accountId), kindTo = r.tx.type === 'cred' ? 'cartão' : 'conta';
          body += `<label class="check fixf"><input type="checkbox" data-move="${r.idx}" ${r.move ? 'checked' : ''}> <span>É <b>${esc(o.desc)}</b> (previsto ${C.brl(o.amount)} em ${esc(fromA ? fromA.name : 'outra conta')})? Passar esta conta fixa para ${kindTo === 'cartão' ? 'o cartão' : 'a conta'} <b>${esc(toA ? toA.name : '')}</b> daqui em diante${o.fromType !== r.tx.type ? (r.tx.type === 'cred' ? ', agora no cartão' : ', agora fora do cartão') : ''}.</span></label>`; }
        if (r.status === 'prev') body = `<p class="hint">✓ ${esc(r.reason)}: <b>${esc(r.match.desc)}</b>, previsto ${C.brl(Math.abs(r.match.amount))}. O lançamento previsto passa a ter o valor real, sem duplicar.${r.linked ? ' Nas próximas importações o app reconhece este nome sozinho.' : ''}</p>`
          + (r.newAmount ? `<label class="check fixf"><input type="checkbox" data-fixf="${r.idx}" ${r.fixFuture ? 'checked' : ''}> <span>O valor mudou de ${C.brl(r.oldAmount)} para <b>${C.brl(r.newAmount)}</b>: usar o novo valor como previsto dos próximos meses</span></label>` : '')
          + (r.linked ? `<button type="button" class="link" data-unrec="${r.idx}">Desfazer o vínculo</button>` : '');
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
        ${plan && plan.projN ? `<label class="check"><input type="checkbox" id="r-proj" ${plan.project ? 'checked' : ''}> Lançar as próximas parcelas das compras parceladas como <b>previstas</b> nas faturas seguintes (${plan.projN} parcela${plan.projN > 1 ? 's' : ''})</label>` : ''}
        ${plan && isCard ? `<label class="check"><input type="checkbox" id="r-paid" ${plan.alreadyPaid ? 'checked' : ''}> Esta fatura já foi paga (não tira dinheiro da conta; se o pagamento estiver no extrato, vincule depois)</label>` : ''}
        ${plan && !isCard && st.saldoIni != null && st.saldoIniDate && !(acc.initialDate === st.saldoIniDate && C.r2(acc.initial) === C.r2(st.saldoIni)) ? `<label class="check"><input type="checkbox" id="r-ini" ${plan.setInitial ? 'checked' : ''}> Usar o saldo anterior do extrato como saldo inicial da conta: <b>${C.brl(st.saldoIni)}</b> em ${C.fmtD(st.saldoIniDate)}/${st.saldoIniDate.slice(0, 4)}${acc.initialDate ? ` (hoje: ${C.brl(acc.initial)} em ${C.fmtD(acc.initialDate)})` : ` (hoje: ${C.brl(acc.initial)}, sem data)`}</label>` : ''}
        ${plan ? `<div class="seg small" id="r-filter">${[['new', 'Novos'], ['dup', 'Duplicatas'], ['ignored', 'Outros'], ['all', 'Todos']].map(([k, l]) => `<button data-f="${k}" aria-pressed="${filter === k}">${l} ${k === 'all' ? plan.rows.length : k === 'ignored' ? count('ignored') + count('already') : count(k)}</button>`).join('')}</div>
        <ul class="list irows">${rowsHTML || '<li class="empty">Nada aqui.</li>'}</ul>` : ''}
        <div class="actions sticky"><button class="btn" id="r-cancel">Cancelar</button><button class="btn primary" id="r-go" ${sel.length || (plan && (plan.rows.some(r => r.status === 'cardpay' && r.include) || plan.rows.some(r => r.fillRef) || plan.alreadyPaid || plan.setInitial || (plan.project && plan.projN))) ? '' : 'disabled'}>${sel.length ? goLabel : plan && plan.project && plan.projN ? `Lançar ${plan.projN} parcelas previstas` : 'Aplicar'}</button></div>
        ${!isCard && sel.length ? `<p class="hint center">Entradas ${C.brl(inSum)} · saídas ${C.brl(outSum)}</p>` : ''}
        ${noCat ? `<p class="hint center">${noCat} sem categoria: dá para escolher agora ou depois.</p>` : ''}`;
    };
    draw();
    panel.onchange = e => {
      if (e.target.id === 'r-acc') { accountId = e.target.value; comp = stRaw.comp || null; rebuild(); return draw(); }
      if (e.target.id === 'r-comp') { comp = e.target.value; rebuild(); return draw(); }
      if (e.target.dataset.inc) { const r = plan.rows[+e.target.dataset.inc]; r.include = e.target.checked; return draw(); }
      if (e.target.dataset.fat) { IP.setRowFatura(plan.rows[+e.target.dataset.fat], e.target.value); return draw(); }
      if (e.target.dataset.inv) { IP.setRowInv(plan, plan.rows[+e.target.dataset.inv], e.target.value); return draw(); }
      if (e.target.dataset.rec) { IP.setRowRec(S(), plan, plan.rows[+e.target.dataset.rec], e.target.value); return draw(); }
      if (e.target.dataset.fixf) { plan.rows[+e.target.dataset.fixf].fixFuture = e.target.checked; return; }
      if (e.target.dataset.move) { plan.rows[+e.target.dataset.move].move = e.target.checked; return; }
      if (e.target.id === 'r-paid') { plan.alreadyPaid = e.target.checked; return; }
      if (e.target.id === 'r-proj') { plan.project = e.target.checked; return draw(); }
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
      const un = e.target.closest('[data-unrec]'); if (un) { IP.setRowRec(S(), plan, plan.rows[+un.dataset.unrec], ''); return draw(); }
      if (e.target.id === 'r-cancel') return closeSheet();
      if (e.target.id === 'r-go') {
        let res = null;
        const months = {}, prev0 = S().tx.filter(t => t.prev && t.parcKey).length;
        plan.rows.filter(r => r.include && r.tx).forEach(r => { const m = r.tx.comp || r.tx.date.slice(0, 7); months[m] = (months[m] || 0) + 1; });
        await sync.commit(s => { res = IP.applyPlan(s, plan); PH.syncReimb(s); });
        const top = Object.entries(months).sort((a, b) => b[1] - a[1])[0];
        if (top) ui.month = top[0];
        closeSheet(); ui.tab = 'lanc'; ui.q = ''; render();
        const proj = S().tx.filter(t => t.prev && t.parcKey).length - prev0;
        toast(`${res.created} lançamento(s) importado(s)${proj > 0 ? ` · ${proj} parcela(s) futura(s) prevista(s)` : ''}${res.paid ? ` · ${res.paid} fatura(s) marcada(s) como paga(s)` : ''}.`);
      }
    };
  });
}

/* ----- contracheque: revisão antes de aplicar (um ou vários do mesmo empregador) ----- */
const KIND_LBL = { fix: 'Todo mês', ev: 'Eventual', tax: 'Imposto' };
function slipSheet(list, title) {
  const plan = H.buildSlipPlan(S(), list);
  const open = { slips: plan.slips.length <= 4, fix: true, ev: false, tax: false };
  openSheet('', panel => {
    panel.classList.add('wide');
    const draw = () => {
      const st = S(), top = panel.scrollTop;
      panel.querySelectorAll('details[data-g]').forEach(d => { open[d.dataset.g] = d.open; });
      const P = H.planPiso(st, plan), D = H.planDiff(st, plan), n = plan.slips.length;
      const bad = plan.slips.filter(s => !s.h.ok).length, old = plan.slips.filter(s => s.already).length;
      const months = plan.slips.map(s => H.slipMonth(s.h)).sort();
      const accOpts = sel => `<option value="">Não lançar: guardar só o histórico</option>` + st.accounts.filter(a => a.nature === 'debito' && a.active !== false && !a.inv).map(a => `<option value="${a.id}" ${a.id === sel ? 'selected' : ''}>${esc(a.name)}</option>`).join('');
      const slipRow = (s, i) => { const h = s.h, acc = plan.banks[s.banco];
        return `<li class="irow"><div class="irow-h"><label class="check"><input type="checkbox" data-post="${i}" ${s.post && acc ? 'checked' : ''} ${acc ? '' : 'disabled'} aria-label="Lançar o líquido na conta"></label>
          <span class="t"><b>${esc(H.tipoLabel(h.tipo))} · ${shortM(H.slipMonth(h))}</b><small>bruto ${C.brl(h.bruto)} · descontos ${C.brl(h.desc)}${s.already ? '<span class="tag info">já importado</span>' : ''}${h.ok ? '' : '<span class="tag">não confere</span>'}</small></span>
          <span class="num pos">${C.brl(h.liq)}</span></div>
          <div class="rgrid"><label>Crédito em <input type="date" data-cred="${i}" value="${esc(s.credito)}"></label></div></li>`; };
      const rubRow = r => `<li class="irow"><div class="irow-h"><span class="t"><b>${esc(r.desc)}</b><small>${n > 1 ? `em ${r.n} de ${n} · ` : ''}${r.how === 'escolha anterior' ? 'como você escolheu antes' : 'sugerido pelo ' + (r.how === 'nome' ? 'nome' : 'histórico')}</small></span><span class="num ${r.col === 'V' ? 'pos' : ''}">${r.col === 'D' ? '−' : ''}${C.brl(r.last)}</span></div>
        <div class="rgrid"><select data-kind="${esc(r.key)}" aria-label="Tipo da rubrica">${(r.col === 'D' ? ['fix', 'ev', 'tax'] : ['fix', 'ev']).map(k => `<option value="${k}" ${r.kind === k ? 'selected' : ''}>${KIND_LBL[k]}</option>`).join('')}</select>
        ${r.col === 'D' && r.kind === 'fix' ? `<select data-exp="${esc(r.key)}" aria-label="Contar como despesa"><option value="">Não contar como despesa</option>${optItems('despesa', r.exp)}</select>` : ''}</div>
        ${r.loan && r.pm ? `<div class="rgrid parc"><label>Parcela <input data-pi="${esc(r.key)}" inputmode="numeric" value="${r.pi || ''}" placeholder="?"></label><label>de <input data-pn="${esc(r.key)}" inputmode="numeric" value="${r.pn || ''}" placeholder="?"></label><small class="hint">em ${shortM(r.pm)}${r.pedit || r.manual ? ' · corrigida por você' : ''}${!r.pedit && r.manual && r.rawI && r.rawI !== r.pi ? ` · o contracheque informa ${r.rawI}` : ''}</small></div>` : ''}</li>`;
      const group = (k, title, hint, rows) => rows.length ? `<details class="rgroup" data-g="${k}" ${open[k] ? 'open' : ''}><summary>${title} <span class="hint">(${rows.length})</span></summary><p class="hint">${hint}</p><ul class="list irows wrap">${rows.map(rubRow).join('')}</ul></details>` : '';
      const V = plan.rubs.filter(r => r.col === 'V'), Dd = plan.rubs.filter(r => r.col === 'D');
      const chg = D && D.prev ? D.changes.map(c => `<li><span class="grow">${esc(c.desc)}</span><span class="num">${c.what === 'novo' ? 'novo: ' + C.brl(c.v) : c.what === 'saiu' ? 'saiu (era ' + C.brl(c.v) + ')' : `${C.brl(c.from)} → ${C.brl(c.v)}`}</span></li>`).join('') : '';
      const evs = D ? D.eventuais.map(e => `<li><span class="grow">${esc(e.desc)}</span><span class="num ${e.col === 'V' ? 'pos' : ''}">${e.col === 'D' ? '−' : '+'}${C.brl(e.v)}</span></li>`).join('') : '';
      const noAcc = Object.values(plan.banks).every(v => !v);
      const lastN = plan.slips.filter(s => s.h.tipo === 'normal').pop();
      panel.innerHTML = `<h2>Importar contracheque${n > 1 ? 's' : ''}</h2>
        <p class="hint">${esc(plan.empregador)} · ${n > 1 ? `${n} contracheques, de ${shortM(months[0])} a ${shortM(months[n - 1])}` : esc(title)}</p>
        <p class="${bad ? 'warn' : 'okbox'}">${bad ? `⚠ ${bad === n && n === 1 ? esc(plan.slips[0].h.check.msg) : bad + ' contracheque(s) com soma diferente dos totais impressos: confira antes de aplicar.'}` : `✓ ${n > 1 ? 'Todos conferem: em cada um, as rubricas somam o bruto e os descontos impressos.' : esc(plan.slips[0].h.check.msg)}`}</p>
        ${plan.other ? `<p class="warn">${plan.other} arquivo(s) são de outro empregador e ficaram de fora. Importe-os separadamente.</p>` : ''}
        ${Object.keys(plan.banks).map(b => `<label>Conta onde o líquido cai${b ? ' (' + esc(b) + ')' : ''}</label><select data-bank="${esc(b)}">${accOpts(plan.banks[b])}</select>`).join('')}
        ${noAcc ? '<p class="hint">Sem conta escolhida, o líquido não é lançado. Os descontos pagos pela folha e os consignados são registrados do mesmo jeito, porque não dependem de conta.</p>' : ''}
        <details class="rgroup" data-g="slips" ${open.slips ? 'open' : ''}><summary>${n > 1 ? 'Contracheques' : 'Contracheque'} <span class="hint">(${n}${old ? `, ${old} já importado${old > 1 ? 's' : ''}` : ''})</span></summary>
          <p class="hint">A receita entra pelo <b>líquido</b>, na data de crédito (é o que aparece no extrato do banco). Desmarcado, o líquido não é lançado na conta.</p><ul class="list irows wrap">${plan.slips.map(slipRow).join('')}</ul></details>
        ${chg ? `<div class="card flat"><h2>O que mudou no fixo desde ${shortM(H.slipMonth(D.prev))}</h2><ul class="sublist calc">${chg}</ul></div>` : D && D.prev && lastN ? `<p class="hint">Nada mudou no fixo desde ${shortM(H.slipMonth(D.prev))}.</p>` : ''}
        ${evs && lastN ? `<div class="card flat"><h2>Eventuais de ${shortM(H.slipMonth(lastN.h))}</h2><ul class="sublist calc">${evs}</ul></div>` : ''}
        <h3 class="sub">Rubricas: confira o que é fixo e o que é eventual</h3>
        ${group('fix', 'Todo mês', 'Entram no piso previsto. Nos descontos, escolha a categoria dos que são gastos seus (plano de saúde, sindicato, empréstimo consignado): são despesas pagas pela folha, sem passar por conta nenhuma. O consignado vira uma dívida em Agenda › Dívidas, com as parcelas seguintes já agendadas.', [...V, ...Dd].filter(r => r.kind === 'fix'))}
        ${group('ev', 'Eventuais', 'Férias, 13º, horas extras, diferenças e estornos: não entram no piso previsto.', [...V, ...Dd].filter(r => r.kind === 'ev'))}
        ${group('tax', 'Impostos', 'INSS e imposto de renda. Para o piso, valem os de um mês sem eventuais.', Dd.filter(r => r.kind === 'tax'))}
        ${P ? `<div class="card flat"><h2>Piso previsto: <span class="num pos">${C.brl(P.piso)}</span> por mês</h2>
          <p class="hint">Proventos fixos ${C.brl(P.fixV)} − descontos fixos ${C.brl(P.fixD)} − impostos ${C.brl(P.tax)}${P.exact ? '' : P.estimated ? ' (estimados: ainda não há um mês sem eventuais, então o imposto dos eventuais foi tirado pela faixa do IR impressa no contracheque)' : ' (ainda sem um mês sem eventuais: os impostos podem estar altos)'}. Eventuais ficam de fora e aparecem quando o contracheque chegar.</p>
          <label class="check"><input type="checkbox" id="sl-fc" ${plan.forecast ? 'checked' : ''} ${noAcc ? 'disabled' : ''}> Prever esse valor como receita dos próximos meses (some ou muda quando eu importar o próximo contracheque)</label></div>` : ''}
        <div class="actions sticky"><button class="btn" id="sl-cancel">Cancelar</button><button class="btn primary" id="sl-go">Aplicar</button></div>`;
      panel.scrollTop = top;
    };
    draw();
    const rub = key => plan.rubs.find(r => r.key === key);
    panel.onchange = e => {
      const d = e.target.dataset;
      if (d.kind) { rub(d.kind).kind = e.target.value; rub(d.kind).how = 'escolha'; return draw(); }
      if (d.exp) { rub(d.exp).exp = e.target.value; return; }
      if (d.pi || d.pn) { const r = rub(d.pi || d.pn); const v = Math.max(0, parseInt(e.target.value, 10) || 0); if (d.pi) r.pi = v; else r.pn = v; r.pedit = true; return draw(); }
      if (d.post) { plan.slips[+d.post].post = e.target.checked; return; }
      if (d.cred) { if (e.target.value) plan.slips[+d.cred].credito = e.target.value; return; }
      if ('bank' in d) { plan.banks[d.bank] = e.target.value; plan.slips.forEach(s => { if (s.banco === d.bank && e.target.value) s.post = true; }); return draw(); }
      if (e.target.id === 'sl-fc') plan.forecast = e.target.checked;
    };
    panel.onclick = async e => {
      if (e.target.id === 'sl-cancel') return closeSheet();
      if (e.target.id !== 'sl-go') return;
      const badLoan = plan.rubs.find(r => r.pedit && r.pn && r.pi > r.pn);
      if (badLoan) return toast(`${badLoan.desc}: a parcela não pode ser maior que o total.`, true);
      let res = null;
      await sync.commit(s => { res = H.applySlipPlan(s, plan); });
      const posted = plan.slips.filter(s => s.post && plan.banks[s.banco]).pop();
      closeSheet();
      if (posted) { ui.tab = 'lanc'; ui.q = ''; ui.month = posted.credito.slice(0, 7); }
      render();
      toast(`${res.slips} contracheque(s) guardado(s)${res.created + res.updated ? ` · ${res.created + res.updated} receita(s)` : ''}${res.folha ? ` · ${res.folha} desconto(s) pagos pela folha` : ''}${res.piso && plan.forecast && posted ? ` · piso previsto ${C.brl(res.piso.piso)}` : ''}.`);
    };
  });
}

/* ----- renda do emprego: fonte de renda, consignados em folha e contracheques guardados ----- */
function jobsHTML(st) {
  const jobs = st.jobs || [];
  if (!jobs.length) return `<div class="card"><div class="chead"><h2>Renda do emprego</h2><button class="link" id="job-imp">Importar contracheque</button></div><p class="hint">Importe o contracheque em PDF (um ou vários de uma vez): o app lança o líquido, separa o que é fixo do que é eventual, mostra os consignados descontados em folha e prevê os próximos meses pelo piso fixo.</p></div>`;
  return `<div class="card"><div class="chead"><h2>Renda do emprego</h2><button class="link" id="job-imp">+ Importar contracheque</button></div><ul class="list wrap">${jobs.map(j => {
    const sl = H.slipsOf(st, j.id), P = H.pisoOf(sl.filter(x => x.tipo === 'normal')), last = sl[sl.length - 1], lo = H.loansOf(st, j.id);
    return `<li data-job="${j.id}">${dot('job', '#2e9e6b')}<span class="t"><b>${esc(j.name)}</b><small>${sl.length} contracheque${sl.length === 1 ? '' : 's'}${last ? ' · último ' + shortM(H.slipMonth(last)) : ''}${lo.filter(l => !l.ended).length ? ` · ${lo.filter(l => !l.ended).length} consignado(s)` : ''}</small></span><span class="num pos">${P ? C.brl(P.piso) : ''}</span></li>`;
  }).join('')}</ul><p class="hint">O valor é o piso fixo previsto por mês (sem eventuais).</p></div>`;
}
const loanLine = l => l.ended ? `✓ encerrado em ${l.end ? shortM(l.end) : '—'}` : l.i ? `parcela ${l.i}${l.n ? ` de ${l.n} · faltam ${l.left} · termina em ${shortM(l.end)}` : ' · total de parcelas não informado'}${l.manual ? ' · corrigida por você' : ''}` : 'parcela não informada';
function jobSheet(id) {
  const st = S(), job = (st.jobs || []).find(j => j.id === id); if (!job) return;
  const sl = H.slipsOf(st, id), P = H.pisoOf(sl.filter(x => x.tipo === 'normal')), loans = H.loansOf(st, id);
  const rest = loans.reduce((s, l) => s + (l.rest || 0), 0), month = loans.filter(l => !l.ended).reduce((s, l) => s + l.v, 0), others = H.folhaFixed(st, id);
  openSheet(`<h2>${esc(job.name)}</h2>
    ${P ? `<div class="kpis two"><div class="kpi"><small>Piso previsto por mês</small><b class="num pos">${C.brl(P.piso)}</b></div><div class="kpi"><small>Descontado em folha (despesas suas)</small><b class="num neg">${C.brl(P.folha)}</b></div></div>
      <p class="hint">Piso = proventos fixos ${C.brl(P.fixV)} − descontos fixos ${C.brl(P.fixD)} − impostos ${C.brl(P.tax)}${P.estimated ? ' (estimados pela faixa do IR, porque ainda não há um mês sem eventuais)' : ''}. É o líquido esperado num mês sem eventuais; a cada contracheque ele é recalculado.</p>` : '<p class="hint">Ainda sem contracheque mensal.</p>'}
    <h3 class="sub">Consignados (dívidas pagas pela folha)</h3>
    ${loans.length ? `<p class="hint">${C.brl(month)} por mês${rest ? ` · faltam ${C.brl(rest)} nos que informam o total` : ''}. Também aparecem em Agenda › Dívidas e Pix. Toque para ver ou corrigir a parcela.</p>
      <ul class="list wrap">${loans.map(l => `<li data-lp="${esc(l.id)}"><span class="t"><b>${esc(l.desc)}</b><small>${loanLine(l)}</small></span><span class="num">${C.brl(l.v)}</span></li>`).join('')}</ul>` : '<p class="hint">Nenhum empréstimo nos contracheques.</p>'}
    ${others.length ? `<h3 class="sub">Outros descontos pagos pela folha</h3><p class="hint">Despesas suas que saem direto do contracheque, sem conta. Os próximos 12 meses ficam previstos.</p>
      <ul class="sublist calc">${others.map(o => `<li><span class="grow">${esc(o.desc)} <small class="hint">${esc((itemById(o.itemId) || {}).name || '')}</small></span><span class="num">${C.brl(o.v)}</span></li>`).join('')}</ul>` : ''}
    <h3 class="sub">Contracheques</h3>
    <ul class="list wrap">${sl.slice().reverse().map(x => `<li data-slip="${x.id}"><span class="t"><b>${esc(H.tipoLabel(x.tipo))} · ${shortM(H.slipMonth(x))}</b><small>crédito ${C.fmtD(x.credito)}/${x.credito.slice(2, 4)} · bruto ${C.brl(x.bruto)}${x.txId ? '' : ' · líquido não lançado'}</small></span><span class="num pos">${C.brl(x.liq)}</span></li>`).join('') || '<li class="empty">Nenhum.</li>'}</ul>
    <div class="actions wrap"><button class="btn danger" id="jb-del">Excluir fonte de renda</button><button class="btn" id="jb-close">Fechar</button><button class="btn primary" id="jb-imp">Importar contracheque</button></div>`, panel => {
    panel.classList.add('wide');
    panel.onclick = async e => {
      if (e.target.id === 'jb-close') return closeSheet();
      if (e.target.id === 'jb-imp') { closeSheet(); return pickImportFile({}); }
      if (e.target.id === 'jb-del') {
        if (!(await confirmBox(`Excluir ${job.name}, os ${sl.length} contracheques guardados, os lançamentos que eles criaram, os consignados e a previsão do piso?`))) return;
        await sync.commit(s => H.removeJob(s, id)); closeSheet(); return toast('Fonte de renda excluída.');
      }
      const lp = e.target.closest('[data-lp]'); if (lp) return folhaLoanSheet(lp.dataset.lp, id);
      const s1 = e.target.closest('[data-slip]'); if (s1) return slipDetail(s1.dataset.slip);
    };
  });
}
/* dívida consignada: paga pela folha, sem conta. Mostra a situação e permite corrigir a parcela e o total. */
function folhaLoanSheet(loanId, backJob) {
  const st = S(), loan = st.loans.find(x => x.id === loanId); if (!loan) return;
  const l = H.loanInfo(st, loan), job = (st.jobs || []).find(j => j.id === loan.jobId);
  const back = () => (backJob ? jobSheet(backJob) : closeSheet());
  openSheet(`<h2>${esc(l.desc)}</h2>
    <p class="hint">Empréstimo consignado${job ? ' · ' + esc(job.name) : ''}. É pago pela folha: não passa por conta bancária, e cada contracheque quita uma parcela.</p>
    <div class="kpis two"><div class="kpi"><small>Parcela por mês</small><b class="num neg">${C.brl(l.v)}</b></div><div class="kpi"><small>Falta pagar</small><b class="num">${l.ended ? C.brl(0) : l.rest != null ? C.brl(l.rest) : 'informe o total'}</b></div></div>
    <p class="hint">${loanLine(l)}${l.paidN ? ` · ${l.paidN} parcela(s) registradas pelos contracheques (${C.brl(l.paid)})` : ''}.${l.rest ? ' "Falta pagar" é a soma das parcelas que faltam; para quitar antes, vale o valor que o banco informar.' : ''}</p>
    ${l.ended ? '' : `<h3 class="sub">Corrigir a contagem</h3>
    <div class="grid2"><div><label for="lp-i">Parcela em ${l.asOf ? shortM(l.asOf) : '—'}</label><input id="lp-i" inputmode="numeric" value="${l.i || ''}"></div>
    <div><label for="lp-n">Total de parcelas</label><input id="lp-n" inputmode="numeric" value="${l.n || ''}" placeholder="Não informado"></div></div>
    <p class="hint" id="lp-prev"></p>
    <button class="link" id="lp-end">Este empréstimo acabou (quitei, refinanciei ou fiz portabilidade)</button>`}
    <div class="actions wrap">${l.manual && !l.ended ? '<button class="btn" id="lp-reset">Voltar ao que o contracheque informa</button>' : ''}<button class="btn" id="lp-cancel">${backJob ? 'Voltar' : 'Fechar'}</button>${l.ended ? '' : '<button class="btn primary" id="lp-save">Salvar</button>'}</div>`, panel => {
    panel.querySelector('#lp-cancel').onclick = back;
    if (l.ended) return;
    const val = () => ({ i: parseInt(panel.querySelector('#lp-i').value, 10) || 0, n: parseInt(panel.querySelector('#lp-n').value, 10) || 0 });
    const prev = () => { const { i, n } = val(); panel.querySelector('#lp-prev').textContent = i && n && n >= i ? `Faltam ${n - i} parcela(s): termina em ${shortM(C.mAdd(l.asOf, n - i))} · ${C.brl((n - i) * l.v)} a pagar.` : i && n ? 'A parcela não pode ser maior que o total.' : ''; };
    panel.oninput = prev; prev();
    const save = async (i, n) => { let c = 0; await sync.commit(s => { c = H.setLoanParc(s, loanId, i, n, l.asOf); }); toast(i ? `Parcela corrigida${c ? ` · ${c} lançamento(s) atualizado(s)` : ''}.` : 'Voltou a valer o que o contracheque informa.'); folhaLoanSheet(loanId, backJob); };
    if (l.manual) panel.querySelector('#lp-reset').onclick = () => save(0, 0);
    panel.querySelector('#lp-save').onclick = () => { const { i, n } = val(); if (!(i >= 1)) return toast('Informe o número da parcela.', true); if (n && i > n) return toast('A parcela não pode ser maior que o total.', true); save(i, n); };
    panel.querySelector('#lp-end').onclick = async () => {
      if (!(await confirmBox(`Marcar ${l.desc} como encerrado? As parcelas previstas dos próximos meses são retiradas e o líquido previsto sobe ${C.brl(l.v)}. Se a rubrica voltar num contracheque mais novo, a dívida reabre.`))) return;
      await sync.commit(s => H.closeLoan(s, loanId)); toast('Empréstimo encerrado.'); folhaLoanSheet(loanId, backJob);
    };
  });
}
/* despesa paga pela folha (não tem conta): só consulta; muda pela revisão do contracheque */
function folhaTxSheet(tx) {
  const st = S(), job = (st.jobs || []).find(j => j.id === tx.jobId), it = itemById(tx.itemId);
  openSheet(`<h2>${esc(tx.desc)}</h2>
    <div class="kpis two"><div class="kpi"><small>${tx.prev ? 'Previsto' : 'Descontado'} em ${C.fmtD(tx.date)}/${tx.date.slice(2, 4)}</small><b class="num neg">${C.brl(tx.amount)}</b></div><div class="kpi"><small>Categoria</small><b>${esc(it ? it.name : 'Sem categoria')}</b></div></div>
    <p class="hint"><b>Pago pela folha</b>${job ? ' de ' + esc(job.name) : ''}${tx.folhaM ? ', contracheque de ' + shortM(tx.folhaM) : ''}. Conta como despesa na categoria, mas não passa por nenhuma conta: o salário já chega líquido. ${tx.prev ? 'É uma previsão; o contracheque do mês confirma o valor.' : 'Para mudar a categoria ou o tipo da rubrica, importe o contracheque de novo e altere na revisão.'}</p>
    <div class="actions wrap">${tx.loanId ? '<button class="btn" id="ft-loan">Ver o consignado</button>' : ''}${job ? '<button class="btn" id="ft-job">Renda do emprego</button>' : ''}<button class="btn primary" id="ft-close">Fechar</button></div>`, panel => {
    panel.querySelector('#ft-close').onclick = closeSheet;
    if (panel.querySelector('#ft-loan')) panel.querySelector('#ft-loan').onclick = () => folhaLoanSheet(tx.loanId);
    if (panel.querySelector('#ft-job')) panel.querySelector('#ft-job').onclick = () => jobSheet(job.id);
  });
}
function slipDetail(slipId) {
  const st = S(), x = (st.slips || []).find(s => s.id === slipId); if (!x) return;
  const job = (st.jobs || []).find(j => j.id === x.jobId);
  const row = r => { const p = r.col === 'D' && r.kind === 'fix' ? H.loanParcOf(st, x.jobId, r, H.slipMonth(x)) : null; return `<li><span class="grow">${esc(r.desc)}${p ? ` (${p.i}${p.n ? '/' + p.n : ''})` : ''} <small class="hint">${KIND_LBL[r.kind] || ''}${r.exp ? ' · paga pela folha em ' + esc((itemById(r.exp) || {}).name || 'categoria apagada') : ''}</small></span><span class="num ${r.col === 'V' ? 'pos' : ''}">${r.col === 'D' ? '−' : ''}${C.brl(r.v)}</span></li>`; };
  openSheet(`<h2>${esc(H.tipoLabel(x.tipo))} · ${shortM(H.slipMonth(x))}</h2>
    <p class="hint">${esc(job ? job.name : '')} · crédito em ${C.fmtD(x.credito)}/${x.credito.slice(0, 4)}${x.accountId && accById(x.accountId) ? ' · ' + esc(accById(x.accountId).name) : ' · líquido não lançado em conta'}</p>
    <div class="kpis"><div class="kpi"><small>Bruto</small><b class="num">${C.brl(x.bruto)}</b></div><div class="kpi"><small>Descontos</small><b class="num neg">${C.brl(x.desc)}</b></div><div class="kpi"><small>Líquido</small><b class="num pos">${C.brl(x.liq)}</b></div></div>
    <h3 class="sub">Proventos</h3><ul class="sublist calc">${x.rubs.filter(r => r.col === 'V').map(row).join('')}</ul>
    <h3 class="sub">Descontos</h3><ul class="sublist calc">${x.rubs.filter(r => r.col === 'D').map(row).join('') || '<li>Nenhum.</li>'}</ul>
    <p class="hint">Para mudar a classificação de uma rubrica, importe de novo este contracheque (ou o próximo) e altere na revisão.</p>
    <div class="actions"><button class="btn danger" id="sd-del">Excluir</button><button class="btn primary" id="sd-back">Voltar</button></div>`, panel => {
    panel.classList.add('wide');
    panel.querySelector('#sd-back').onclick = () => jobSheet(x.jobId);
    panel.querySelector('#sd-del').onclick = async () => {
      if (!(await confirmBox('Excluir este contracheque e os lançamentos que ele criou (o líquido e os descontos pagos pela folha)?'))) return;
      await sync.commit(s => H.removeSlip(s, slipId)); toast('Contracheque excluído.'); jobSheet(x.jobId);
    };
  });
}

/* ----- agenda: pendências e dívidas com terceiros ----- */
function pageAgenda() {
  const st = S(), today = M.todayISO(), in30 = C.mAdd(today.slice(0, 7), 1) + today.slice(7);
  const view = ui.agView || 'pend';
  // o seletor e os números da visão ficam no bloco colorido do alto
  let html = `<div class="hcard"><div class="seg" id="agseg"><button data-v="pend" aria-pressed="${view === 'pend'}">A vencer</button><button data-v="fix" aria-pressed="${view === 'fix'}">Fixas e parcelas</button><button data-v="loans" aria-pressed="${view === 'loans'}">Dívidas e Pix</button></div>`;
  if (view === 'fix') { const fx = fixasHTML(st); html += fx.head + '</div>' + fx.body; }
  else if (view === 'pend') {
    const all = C.pendings(st);
    const sum = (l, d) => l.filter(x => x.dir === d).reduce((s, x) => s + x.amount, 0);
    const late = all.filter(x => x.date < today), next = all.filter(x => x.date >= today && x.date <= in30), later = all.filter(x => x.date > in30);
    const nextAll = [...late, ...next];
    html += `<div class="kpis two"><div class="kpi tap" data-dr="pend|in" role="button" tabindex="0"><small>A receber (até 30 dias) <span aria-hidden="true">›</span></small><b class="num pos">${C.brl(sum(nextAll, 'in'))}</b></div>
      <div class="kpi tap" data-dr="pend|out" role="button" tabindex="0"><small>A pagar (até 30 dias) <span aria-hidden="true">›</span></small><b class="num neg">${C.brl(sum(nextAll, 'out'))}</b></div></div></div>`;
    const block = (title, list, cls) => list.length ? `<div class="card ${cls || ''}"><h2>${title} <span class="hint">(${list.length})</span></h2><ul class="list full">${list.slice(0, 60).map(pendRow).join('')}</ul>${list.length > 60 ? `<p class="hint">e mais ${list.length - 60}…</p>` : ''}</div>` : '';
    html += '<div class="cgrid">' + block('Atrasados', late, 'late') + block('Próximos 30 dias', next) + block('Mais adiante', later);
    if (!all.length) html += `<div class="card empty">Nada pendente.<br>Receitas e despesas marcadas como pendentes, parcelas de dívidas e faturas em aberto aparecem aqui.</div>`;
    if (all.length) html += `<div class="card"><h2>Lembretes no celular</h2><p class="hint">Baixe os vencimentos dos próximos 12 meses para o calendário do iPhone (ou do computador), com aviso às 9h do dia anterior. Ao abrir o arquivo, toque em "Adicionar todos". Se baixar de novo depois, os eventos repetidos são atualizados.</p>
      <button class="btn" id="ag-ics">Adicionar vencimentos ao calendário</button></div>`;
    html += `</div><p class="hint">Contas que se repetem todo mês (aluguel, internet, luz, salário) ficam em <b>Fixas e parcelas</b>, e os meses aparecem aqui.</p>`;
  } else {
    const folhaSt = l => { const f = H.loanInfo(st, l); return { folha: f, rest: f.ended ? 0 : f.rest || 0, paid: f.i || 0, total: f.n || 0, parcels: [], doneN: f.paidN, next: null, late: 0 }; };
    const loans = st.loans.map(l => ({ l, s: l.folha ? folhaSt(l) : M.loanStatus(st, l) }));
    const group = (dir, title) => {
      const list = loans.filter(x => x.l.dir === dir).sort((a, b) => (a.s.rest === 0) - (b.s.rest === 0) || String(a.s.next && a.s.next.date).localeCompare(String(b.s.next && b.s.next.date)));
      const rest = list.reduce((s, x) => s + x.s.rest, 0);
      return `<div class="card"><div class="chead"><h2>${title}</h2><button class="link" data-newloan="${dir}">+ ${dir === 'in' ? 'Alguém me deve' : 'Eu devo'}</button></div><p class="hint">Saldo em aberto: <b class="num">${C.brl(rest)}</b></p>
        ${list.length ? `<ul class="list wrap">${list.map(({ l, s }) => `<li data-loan="${l.id}"><span class="t"><b>${esc(l.person || 'Sem nome')}${l.desc ? ' · ' + esc(l.desc) : ''}</b>
          <small>${s.folha ? 'pago pela folha · ' + loanLine(s.folha) : s.rest === 0 ? '✓ quitado' : `${s.doneN}/${s.parcels.length} parcelas · próxima ${s.next ? C.fmtD(s.next.date) + '/' + s.next.date.slice(2, 4) : '—'}${s.late ? ` · <span class="tag">${s.late} atrasada(s)</span>` : ''}`}</small>
          <span class="bar"><i style="width:${s.total ? (s.paid / s.total * 100).toFixed(0) : 0}%;background:var(--brand)"></i></span></span>
          <span class="num">${s.folha && !s.folha.ended && s.folha.rest == null ? C.brl(s.folha.v) + '/mês' : C.brl(s.rest)}</span></li>`).join('')}</ul>` : '<p class="hint">Nenhuma.</p>'}</div>`;
    };
    const open = d => loans.filter(x => x.l.dir === d).reduce((s, x) => s + x.s.rest, 0);
    html += `<div class="kpis two"><div class="kpi"><small>Me devem</small><b class="num pos">${C.brl(open('in'))}</b></div><div class="kpi"><small>Eu devo</small><b class="num neg">${C.brl(open('out'))}</b></div></div></div>
      <div class="cols">${group('in', 'Me devem (a receber)')}${group('out', 'Eu devo (a pagar)')}</div>${peopleHTML(st)}`;
  }
  $('#page').innerHTML = html;
  $('#page').onclick = async e => {
    const v = e.target.closest('#agseg [data-v]'); if (v) { ui.agView = v.dataset.v; return pageAgenda(); }
    const ok = e.target.closest('[data-ok]'); if (ok) return confirmPending(ok.dataset.ok);
    const px = e.target.closest('[data-pix]'); if (px) { const t = S().tx.find(x => x.id === px.dataset.pix), who = t && payeeOf(t); return who && pixSheet(who, t.amount, t.id); }
    if (e.target.id === 'fx-new') return txSheet(null, { freq: 'fixa' });
    if (e.target.id === 'fx-new-rec') return txSheet(null, { type: 'rec', freq: 'fixa' });
    if (e.target.id === 'fx-new-parc') return txSheet(null, { freq: 'parc' });
    if (e.target.id === 'job-imp') return pickImportFile({});
    const jb = e.target.closest('[data-job]'); if (jb) return jobSheet(jb.dataset.job);
    const rc = e.target.closest('[data-rec]'); if (rc) return recSheet(rc.dataset.rec);
    const sg = e.target.closest('[data-sug]'); if (sg) return adoptSuggestion(ui._sug[+sg.dataset.sug]);
    const ig = e.target.closest('[data-ign]'); if (ig) return ignoreSuggestion(ui._sug[+ig.dataset.ign]);
    if (e.target.id === 'pp-new') return personForm(null);
    const pe = e.target.closest('[data-person]'); if (pe) return personForm(S().people.find(x => x.id === pe.dataset.person));
    const pay = e.target.closest('[data-pay]'); if (pay) { const [cardId, comp] = pay.dataset.pay.split('|'); return payFaturaSheet(null, { cardId, comp }); }
    const li = e.target.closest('[data-ptx]'); if (li) return txSheet(S().tx.find(t => t.id === li.dataset.ptx));
    const fa = e.target.closest('[data-pfat]'); if (fa) { const [card, comp] = fa.dataset.pfat.split('|'); return faturaSheet(card, comp); }
    if (e.target.id === 'ag-ics') { const until = C.mAdd(M.todayISO().slice(0, 7), 12) + '-31'; downloadFile('financas-vencimentos.ics', C.icsPendings(S(), { until }), 'text/calendar;charset=utf-8'); return toast('Arquivo de calendário baixado.'); }
    const nl = e.target.closest('[data-newloan]'); if (nl) return loanForm(nl.dataset.newloan);
    const lo = e.target.closest('[data-loan]'); if (lo) return loanSheet(lo.dataset.loan);
  };
}

function pendRow(p) {
  const today = M.todayISO();
  if (p.kind === 'fatura') {
    const card = accById(p.fatura.cardId);
    return `<li data-pfat="${p.fatura.cardId}|${p.fatura.comp}">${dot('fat', '#607d8b')}<span class="t"><b>Fatura ${esc(card ? card.name : '')} ${shortM(p.fatura.comp)}</b>
      <small>${C.fmtD(p.date)}/${p.date.slice(2, 4)}${p.fatura.status === 'parc' ? ` · paga em parte (${C.brl(p.fatura.paid)} de ${C.brl(p.fatura.total)})` : ''}${p.date < today ? ' · <span class="tag">atrasada</span>' : ''}</small></span><span class="num">−${C.brl(p.amount)}</span>
      <button class="okbtn" data-pay="${p.fatura.cardId}|${p.fatura.comp}">Pagar</button></li>`;
  }
  const t = p.tx, it = itemById(t.itemId), g = groupOf(it), acc = accById(t.accountId);
  const loan = t.loanId && S().loans.find(l => l.id === t.loanId);
  return `<li data-ptx="${t.id}">${dot(t.type === 'rec' ? 'rec' : 'deb', g && g.color)}
    <span class="t"><b>${esc(loan ? [loan.person, loan.desc].filter(Boolean).join(' · ') : (t.desc || (it ? it.name : '')))}</b><small>${C.fmtD(t.date)}/${t.date.slice(2, 4)}${t.seriesId ? ` · ${t.seriesIdx}/${t.seriesN}` : ''}${t.recId ? (t.prev && ((S().rec || []).find(r => r.id === t.recId) || {}).kind === 'var' ? ' · valor previsto' : ' · todo mês') : ''}${acc ? ' · ' + esc(acc.name) : ''}${loan ? (loan.dir === 'in' ? ' · me deve' : ' · eu devo') : ''}${t.date < today ? ' · <span class="tag">atrasado</span>' : ''}</small></span>
    <span class="num ${t.type === 'rec' ? 'pos' : ''}">${t.type === 'rec' ? '' : '−'}${C.brl(t.amount)}</span>
    ${t.type === 'deb' && (payeeOf(t) || {}).pixKey ? `<button class="okbtn pix" data-pix="${t.id}">Pix</button>` : ''}<button class="okbtn" data-ok="tx:${t.id}">${t.type === 'rec' ? 'Recebido' : 'Pago'}</button></li>`;
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
  if (t.recId && t.prev && ((S().rec || []).find(r => r.id === t.recId) || {}).kind === 'var') return txSheet(t, { payNow: true }); // variável: confirmar o valor real
  let date = t.date;
  if (t.date !== today) {
    const ch = await askChoice(t.type === 'rec' ? 'Quando recebeu?' : 'Quando pagou?', '', [{ label: 'Hoje (' + C.fmtD(today) + ')', value: 'today' }, { label: 'Na data prevista (' + C.fmtD(t.date) + ')', value: 'due' }]);
    if (!ch) return;
    if (ch === 'today') date = today;
  }
  await sync.commit(s => { const x = s.tx.find(y => y.id === id); x.status = 'liq'; x.date = date; delete x.prev; M.touch(x); });
  toast(t.type === 'rec' ? 'Marcado como recebido.' : 'Marcado como pago.');
}

function loanForm(dir) {
  const st = S();
  const findItem = (kind, name) => { const it = st.items.find(i => i.name === name && i.active !== false); return it && groupOf(it) && groupOf(it).kind === kind ? it.id : ''; };
  const defItem = dir === 'in' ? findItem('receita', 'Recebimento de empréstimo concedido') : findItem('despesa', 'Parcela de empréstimo');
  const defStart = dir === 'in' ? findItem('despesa', 'Empréstimos concedidos') : findItem('receita', 'Empréstimos recebidos');
  openSheet('', panel => {
    panel.innerHTML = `<h2>${dir === 'in' ? 'Alguém me deve' : 'Eu devo'}</h2>
      <label for="l-person">${dir === 'in' ? 'Quem deve' : 'A quem devo'}</label><input id="l-person" autocomplete="off" placeholder="Nome" list="l-people"><datalist id="l-people">${(S().people || []).map(p => `<option value="${esc(p.name)}">`).join('')}</datalist>
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
      { const pr = personOf(null, f.person); if (pr) loan.personId = pr.id; else { const np = M.newPerson({ name: f.person }); loan.personId = np.id; loan._newPerson = np; } }
      await sync.commit(s => { const np = loan._newPerson; delete loan._newPerson; if (np) s.people.push(np); s.loans.push(loan); s.tx.push(...txs); });
      closeSheet(); ui.tab = 'agenda'; ui.agView = 'loans'; render(); toast('Dívida cadastrada.');
    };
  });
}

function loanSheet(id) {
  const l = S().loans.find(x => x.id === id); if (!l) return;
  if (l.folha) return folhaLoanSheet(id);
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
      const ans = await askText('Renomear', [{ label: 'Nome da pessoa', value: l.person }, { label: 'Descrição', value: l.desc }]); if (!ans) return;
      const [name, desc] = ans;
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
  const convert = !!(tx && !tx.cardPay); // despesa comum que na verdade é o pagamento de uma fatura
  const learned = tx && st.rules && st.rules['pay:' + L.keyOf(tx)];
  let cardId = preset.cardId || (tx && tx.faturaKey ? tx.faturaKey.split('|')[0] : '') || (learned && cards.some(c => c.id === learned.cardId) ? learned.cardId : '') || cards[0].id;
  let key = tx && tx.cardPay && tx.faturaKey && tx.faturaKey.startsWith(cardId + '|') ? tx.faturaKey : (!tx && preset.comp ? cardId + '|' + preset.comp : (tx && tx.cardPay && !preset.cardId ? '' : null));
  openSheet('', panel => {
    const draw = (keepValues) => {
      const old = keepValues ? { v: panel.querySelector('#p-val').value, d: panel.querySelector('#p-date').value, acc: panel.querySelector('#p-acc').value } : null;
      const card = accById(cardId);
      // ao converter, procura a fatura pela data e pelo valor do lançamento (inclui as marcadas como pagas sem pagamento)
      const opts = C.faturaCandidates(S(), tx ? { cardId, date: tx.date, amount: tx.amount } : { cardId });
      if (tx) C.faturas(S()).filter(x => x.cardId === cardId && x.total > 0 && !x.payments.length && Math.abs(x.total - tx.amount) <= 0.05 && !opts.some(o => o.key === x.key)).forEach(x => opts.unshift(x));
      // a fatura já vinculada a este pagamento entra mesmo que esteja quitada
      if (key && !opts.some(f => f.key === key)) { const f = C.faturas(S()).find(x => x.key === key); if (f) opts.unshift(f); }
      if (key === null) { const best = opts[0]; key = best && (!tx || best.exact || Math.abs(best.total - tx.amount) <= 0.05 || best.dist <= 20) ? best.key : ''; }
      const sel = opts.find(f => f.key === key);
      const restFor = f => f ? C.r2(f.rest + (tx && tx.faturaKey === f.key ? tx.amount : 0)) : 0;
      const defVal = tx ? tx.amount : sel ? restFor(sel) : '';
      panel.innerHTML = `<h2>${convert ? 'É pagamento de fatura' : tx ? 'Editar pagamento de fatura' : 'Pagar fatura'}</h2>
        ${convert ? `<p class="hint"><b>${esc(tx.desc || '')}</b> deixa de contar como despesa: as compras já estão no cartão. O app guarda este nome e reconhece sozinho nas próximas importações.</p>` : '<p class="hint">O dinheiro sai da conta, mas não conta como despesa nova: as compras já estão no cartão.</p>'}
        <label for="p-card">Cartão</label><select id="p-card">${cards.map(c => `<option value="${c.id}" ${c.id === cardId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
        <label for="p-fat">Fatura</label><select id="p-fat">${opts.map(f => `<option value="${f.key}" ${f.key === key ? 'selected' : ''}>${esc(faturaLabel(f))}</option>`).join('')}<option value="" ${!key ? 'selected' : ''}>Sem vínculo com fatura</option></select>
        <label for="p-val">Valor pago (R$)</label><input id="p-val" inputmode="decimal" value="${old ? esc(old.v) : (defVal !== '' ? moneyText(+defVal) : '')}" placeholder="0,00">
        <label for="p-date">Data do pagamento</label><input id="p-date" type="date" value="${old ? esc(old.d) : (tx ? tx.date : M.todayISO())}">
        <label for="p-acc">Pago pela conta</label><select id="p-acc">${optAccounts('debito', old ? old.acc : (tx ? tx.accountId : (preset.accountId || (card && card.payAccount) || '')))}</select>
        <p class="hint" id="p-prev"></p>
        ${tx && tx.cardPay && tx.origin === 'import' ? '<button type="button" class="link" id="p-undo">Não é pagamento de fatura: voltar a ser despesa comum</button>' : ''}
        <div class="actions">${tx && !convert ? '<button class="btn danger" id="p-del">Excluir</button>' : ''}<button class="btn" id="p-cancel">Cancelar</button><button class="btn primary" id="p-save">${convert ? 'Vincular' : 'Salvar'}</button></div>`;
      const prev = () => {
        const v = C.parseMoney(panel.querySelector('#p-val').value), f = opts.find(x => x.key === panel.querySelector('#p-fat').value), h = panel.querySelector('#p-prev');
        if (!f) { h.textContent = 'Sem vínculo: o pagamento sai da conta, mas nenhuma fatura é dada como paga. Use quando a fatura deste mês não está no app.'; return; }
        const rest = restFor(f);
        h.textContent = !(v > 0) ? `Falta pagar ${C.brl(rest)} desta fatura.` : Math.abs(v - rest) < 0.01 ? 'Valor igual ao que falta: a fatura fica paga.'
          : v < rest ? `Pagamento parcial: depois dele ainda faltarão ${C.brl(rest - v)} desta fatura.` : `Valor maior que o que falta (${C.brl(rest)}): a fatura fica paga e sobra ${C.brl(v - rest)} de crédito.`;
      };
      panel.oninput = prev; prev();
      panel.querySelector('#p-card').onchange = e => { cardId = e.target.value; key = null; draw(true); };
      panel.querySelector('#p-fat').onchange = e => { key = e.target.value; const f = opts.find(x => x.key === key); if (f && !tx) panel.querySelector('#p-val').value = moneyText(restFor(f)); prev(); };
      panel.querySelector('#p-cancel').onclick = closeSheet;
      if (panel.querySelector('#p-undo')) panel.querySelector('#p-undo').onclick = async () => {
        await sync.commit(s => { L.undoCardPay(s, tx.id); }); closeSheet(); render(); toast('Voltou a ser despesa comum. Escolha a categoria.');
      };
      if (panel.querySelector('#p-del')) panel.querySelector('#p-del').onclick = async () => {
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
          if (!tx || (/^Pagamento de fatura/.test(tx.desc || '') && tx.origin !== 'import')) t.desc = desc;
          M.touch(t);
          L.learnPay(s, t, cardId); // o nome que o banco usa passa a apontar para este cartão
        });
        const after = C.faturas(S()).find(x => x.key === fk);
        closeSheet(); render();
        toast(!f ? (convert ? 'Vinculado: deixou de contar como despesa.' : 'Pagamento registrado.') : after && after.status === 'liq' ? 'Pagamento registrado: fatura paga.' : `Pagamento parcial registrado: faltam ${C.brl(after ? after.rest : 0)}.`);
        if (preset.then) preset.then();
      };
    };
    draw(false);
  });
}

/* ----- vincular um lançamento que já existe ----- */
function linkSheet(tx, then) {
  const st = S(); if (!L.canLink(tx)) return;
  const isAcc = tx.type !== 'cred', rules = L.ruleOptions(st, tx), parcels = isAcc ? L.parcelOptions(st, tx) : [];
  const others = isAcc ? st.accounts.filter(a => a.nature === 'debito' && a.active !== false && a.id !== tx.accountId) : [];
  const hasCards = st.accounts.some(a => a.nature === 'credito');
  const word = tx.type === 'rec' ? 'receita' : 'despesa';
  const opt = (id, title, sub) => `<button type="button" class="opt" id="${id}"><b>${title}</b><small>${sub}</small></button>`;
  const pick = (id, label, options, btn) => `<div class="optbox"><label for="${id}">${label}</label><div class="pickrow"><select id="${id}">${options}</select><button type="button" class="btn primary" id="${id}-ok">${btn}</button></div></div>`;
  const done = msg => { closeSheet(); render(); toast(msg); if (then) then(); };
  openSheet('', panel => {
    panel.innerHTML = `<h2>Vincular</h2>
      <p class="hint"><b>${esc(tx.desc || (itemById(tx.itemId) || {}).name || '')}</b> · ${C.fmtD(tx.date)}/${tx.date.slice(2, 4)} · ${C.brl(Math.abs(tx.amount))}</p>
      <p class="hint">Diga o que este lançamento é. O app para de contar em dobro e, nas próximas importações, reconhece sozinho pelo nome que o banco usa.</p>
      ${tx.type === 'deb' && hasCards ? opt('lk-pay', 'É o pagamento de uma fatura de cartão', 'Sai da conta, mas não é despesa nova: as compras já estão no cartão.') : ''}
      ${rules.length ? pick('lk-rule', `É o mês de uma ${word} que se repete, já cadastrada`, rules.map(r => `<option value="${r.id}">${esc(r.desc)} · ${r.kind === 'var' ? '≈ ' : ''}${C.brl(M.recEstimate(st, r))} · dia ${r.day}</option>`).join(''), 'Vincular') : ''}
      ${opt('lk-new', `Criar uma ${word} que se repete a partir deste`, tx.type === 'rec' ? 'Salário, aluguel recebido, pensão… Este vira o primeiro mês e os próximos ficam previstos.' : 'Aluguel, condomínio, escola, assinatura… Este vira o primeiro mês e os próximos ficam previstos.')}
      ${parcels.length ? pick('lk-parc', tx.type === 'rec' ? 'É a parcela de algo que me devem' : 'É a parcela de uma dívida minha', parcels.map(o => `<option value="${o.tx.id}">${esc(o.tx.desc || o.loan.person)} · ${C.fmtD(o.tx.date)}/${o.tx.date.slice(2, 4)} · ${C.brl(o.tx.amount)}</option>`).join(''), 'Quitar') : ''}
      ${tx.type === 'rec' && PH.reimbOptions(st, tx).length ? pick('lk-rb', 'É o reembolso de quem usa um cartão meu', PH.reimbOptions(st, tx).map(r => `<option value="${r.id}">${esc(r.desc)} · ${C.brl(r.amount)}</option>`).join(''), 'Vincular') : ''}
      ${others.length ? pick('lk-trf', tx.type === 'rec' ? 'É dinheiro meu que veio de outra conta' : 'É transferência para outra conta ou investimento', others.map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join(''), 'Transferência') : ''}
      <div class="actions"><button class="btn" id="lk-c">Voltar</button></div>`;
    const q = id => panel.querySelector('#' + id);
    q('lk-c').onclick = () => txSheet(S().tx.find(t => t.id === tx.id) || tx);
    if (q('lk-pay')) q('lk-pay').onclick = () => payFaturaSheet(tx, { then });
    if (q('lk-rule-ok')) q('lk-rule-ok').onclick = async () => {
      const r = rules.find(x => x.id === q('lk-rule').value); if (!r) return;
      let fix = false;
      if (r.kind === 'fixa' && Math.abs(r.amount - Math.abs(tx.amount)) > 0.005) {
        const ch = await askChoice('Valor diferente do previsto', `${r.desc} está prevista em ${C.brl(r.amount)} e este mês foi ${C.brl(Math.abs(tx.amount))}.`, [{ label: 'Só este mês foi diferente', value: 'one' }, { label: `Novo valor previsto: ${C.brl(Math.abs(tx.amount))} daqui em diante`, value: 'fix' }]);
        if (!ch) return; fix = ch === 'fix';
      }
      let res = { ok: false, error: 'Não foi possível vincular.' };
      await sync.commit(s => { res = L.linkToRule(s, tx.id, r.id, { fixFuture: fix }); if (res.ok) M.ensureRecurring(s); });
      if (!res.ok) return toast(res.error, true);
      done(`Vinculado a ${r.desc} (${shortM(res.month)}).${fix ? ' Próximos meses com o novo valor.' : ''}`);
    };
    q('lk-new').onclick = async () => {
      if (!tx.itemId) return toast('Escolha antes a categoria deste lançamento (volte e salve).', true);
      const kind = await askChoice(`Nova ${word} que se repete`, 'Como é o valor de um mês para o outro?', [{ label: 'Fixa: o mesmo valor todo mês', value: 'fixa' }, { label: 'Variável: muda todo mês (previsto pela média)', value: 'var' }]);
      if (!kind) return;
      let r = null; await sync.commit(s => { r = L.ruleFromTx(s, tx.id, kind); });
      if (!r) return toast('Não foi possível criar.', true);
      done(`${r.desc} cadastrada. Os próximos 12 meses estão em Agenda › Fixas e parcelas.`);
    };
    if (q('lk-parc-ok')) q('lk-parc-ok').onclick = async () => {
      let ok = false; await sync.commit(s => { ok = L.linkToParcel(s, tx.id, q('lk-parc').value); });
      ok ? done('Parcela quitada com este lançamento.') : toast('Não foi possível vincular.', true);
    };
    if (q('lk-rb-ok')) q('lk-rb-ok').onclick = async () => {
      const r = S().tx.find(x => x.id === q('lk-rb').value), less = r && tx.amount < r.amount - 0.005;
      let ok = false; await sync.commit(s => { ok = PH.linkReimb(s, tx.id, q('lk-rb').value); });
      ok ? done(less ? `Reembolso vinculado. Faltam ${C.brl(r.amount - tx.amount)}, que continuam a receber.` : 'Reembolso vinculado.') : toast('Não foi possível vincular.', true);
    };
    if (q('lk-trf-ok')) q('lk-trf-ok').onclick = async () => {
      let ok = false; await sync.commit(s => { ok = L.toTransfer(s, tx.id, q('lk-trf').value); });
      ok ? done('Virou transferência: não conta como receita nem despesa.') : toast('Não foi possível converter.', true);
    };
  });
}

/* lançamentos que provavelmente contam errado: o app aponta, a pessoa decide */
function conferirSheet() {
  openSheet('', panel => {
    const name = id => esc((accById(id) || {}).name || '');
    const head = t => `<span class="t"><b>${esc(t.desc || 'Sem descrição')}</b><small>${C.fmtD(t.date)}/${t.date.slice(2, 4)} · ${C.brl(Math.abs(t.amount))} · ${name(t.accountId)}</small></span>`;
    const draw = () => {
      const st = S(), R = L.review(st);
      if (!R.n) { closeSheet(); render(); return toast('Tudo conferido.'); }
      const sec = (title, hint, rows) => rows.length ? `<h3 class="sub">${title}</h3><p class="hint">${hint}</p><ul class="list rv">${rows.join('')}</ul>` : '';
      panel.innerHTML = `<h2>Para conferir</h2><p class="hint">O app não muda nada sozinho: ele aponta o que parece contar errado e você decide.</p>`
        + sec('Pagamento de fatura lançado como despesa', 'Do jeito que está, o gasto conta duas vezes: nas compras do cartão e de novo aqui.',
          R.pay.map((x, i) => `<li>${head(x.tx)}<small class="why">${x.fatura ? `Mesmo valor da fatura ${name(x.cardId)} de ${shortM(x.fatura.comp)}.` : x.why === 'descricao' ? `A descrição diz que é pagamento de fatura${x.cardId ? ' (' + name(x.cardId) + '?)' : ''}.` : `Mesmo nome de outro pagamento do cartão ${name(x.cardId)}.`}</small>
            <span class="row"><button class="btn small" data-rvno="${x.tx.id}">Não é</button><button class="btn small primary" data-rvpay="${i}">É o pagamento</button></span></li>`)
          .concat(R.relink.map((x, i) => `<li>${head(x.tx)}<small class="why">Está ligado à fatura do ${name(x.from)}, mas a descrição fala em ${name(x.to)}.</small>
            <span class="row"><button class="btn small" data-rvno="${x.tx.id}">Está certo</button><button class="btn small primary" data-rvfix="${i}">Corrigir cartão</button></span></li>`)))
        + sec('Pix devolvido ou rejeitado', 'Saiu e voltou no mesmo valor. Excluir os dois deixa as receitas e despesas do mês certas; o saldo não muda.',
          R.refund.map((x, i) => `<li>${head(x.out)}<small class="why">Voltou em ${C.fmtD(x.in.date)}: ${esc(x.in.desc || '')}.</small>
            <span class="row"><button class="btn small" data-rvno="${x.in.id}">Manter</button><button class="btn small primary" data-rvdel="${i}">Excluir os dois</button></span></li>`))
        + sec('Sem categoria', 'Ficam fora dos totais por categoria e do orçamento. Toque para escolher.',
          R.nocat.map(t => `<li data-tx="${t.id}" class="go">${head(t)}<span aria-hidden="true">›</span></li>`))
        + '<div class="actions"><button class="btn" id="rv-c">Fechar</button></div>';
      panel._R = R;
    };
    panel.onclick = async e => {
      const R = panel._R; if (!R) return;
      if (e.target.id === 'rv-c') { closeSheet(); return render(); }
      const b = e.target.closest('button[data-rvno],button[data-rvpay],button[data-rvfix],button[data-rvdel]'), li = e.target.closest('li[data-tx]');
      if (!b) { if (li) txSheet(S().tx.find(t => t.id === li.dataset.tx)); return; }
      if (b.dataset.rvno) { await sync.commit(s => L.ignoreReview(s, [b.dataset.rvno])); return draw(); }
      if (b.dataset.rvpay) {
        const x = R.pay[+b.dataset.rvpay];
        if (!x.fatura) return payFaturaSheet(x.tx, { cardId: x.cardId || undefined, then: conferirSheet });
        await sync.commit(s => { L.toCardPay(s, x.tx.id, x.fatura.key, x.cardId); });
        toast(`Vinculado à fatura ${(accById(x.cardId) || {}).name} de ${shortM(x.fatura.comp)}.`); return draw();
      }
      if (b.dataset.rvfix) { const x = R.relink[+b.dataset.rvfix]; return payFaturaSheet(x.tx, { cardId: x.to, then: conferirSheet }); }
      if (b.dataset.rvdel) {
        const x = R.refund[+b.dataset.rvdel];
        if (!(await confirmBox(`Excluir os dois lançamentos de ${C.brl(x.out.amount)} (a saída e a devolução)?`))) return;
        await sync.commit(s => { M.removeRecord(s, 'tx', x.out.id); M.removeRecord(s, 'tx', x.in.id); });
        toast('Os dois foram excluídos.'); return draw();
      }
    };
    draw();
  });
}

/* ----- resumo: mês, orçamento e ano ----- */
function downloadFile(name, text, type) {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 8000);
}

function pageResumo() {
  const view = ui.rsView || 'mes';
  const seg = `<div class="seg" id="rsseg">${[['mes', 'Mês'], ['orc', 'Orçamento'], ['ano', 'Ano'], ['fut', 'Futuro']].map(([k, l]) => `<button data-rv="${k}" aria-pressed="${view === k}">${l}</button>`).join('')}</div>`;
  if (view === 'orc') return pageOrcamento(seg);
  if (view === 'ano') return pageAno(seg);
  if (view === 'fut') return pageFuturo(seg);
  const st = S(), m = ui.month;
  const sum = C.monthSummary(st, m), cats = C.byCategory(st, m), recs = C.byCategory(st, m, 'receita'), inv = C.invFlow(st, m);
  const series = C.monthSeries(st, m, 6);
  const max = Math.max(1, ...series.map(x => Math.max(x.rec, x.desp)));
  const W = 320, H = 150, bw = 18, gap = W / 6;
  const bars = series.map((x, i) => {
    const x0 = i * gap + gap / 2 - bw - 1, hr = Math.round(x.rec / max * (H - 30)), hd = Math.round(x.desp / max * (H - 30));
    return `<rect x="${x0}" y="${H - 20 - hr}" width="${bw}" height="${hr}" rx="3" class="b-rec"><title>Receitas ${shortM(x.m)}: ${C.brl(x.rec)}</title></rect>
      <rect x="${x0 + bw + 2}" y="${H - 20 - hd}" width="${bw}" height="${hd}" rx="3" class="b-desp"><title>Despesas ${shortM(x.m)}: ${C.brl(x.desp)}</title></rect>
      <text x="${i * gap + gap / 2}" y="${H - 5}" text-anchor="middle" class="ax ${x.m === m ? 'cur' : ''}">${shortM(x.m)}</text>
      <rect x="${i * gap}" y="0" width="${gap}" height="${H}" fill="transparent" class="hit" data-mgo="${x.m}"><title>Ir para ${shortM(x.m)}</title></rect>`;
  }).join('');
  const catHTML = (list, total, kind) => list.length ? list.map(g => `<details class="cat"><summary><span class="sw" style="background:${col(g.color)}"></span><span class="grow">${esc(g.name)}</span><span class="num">${C.brl(g.total)}</span></summary>
      <div class="bar"><i style="width:${Math.max(2, g.total / total * 100).toFixed(1)}%;background:${col(g.color)}"></i></div>
      <ul class="sublist go">${g.items.length > 1 ? `<li data-dr="grp|${kind === 'rec' ? 'receita' : 'despesa'}|${m}|${g.id}" role="button" class="all"><span class="grow">Todo o grupo</span><span class="num">${C.brl(g.total)}</span><span class="chev" aria-hidden="true">›</span></li>` : ''}${g.items.map(i => `<li data-dr="cat|${kind === 'rec' ? 'receita' : 'despesa'}|${m}|${i.id}" role="button" title="Ver estes lançamentos"><span class="grow">${esc(i.name)} <small class="hint">(${i.n})</small></span><span class="num">${C.brl(i.total)}</span><span class="chev" aria-hidden="true">›</span></li>`).join('')}</ul></details>`).join('')
    : '<p class="hint">Nada neste mês.</p>';
  const b = C.budgetMonth(st, m);
  $('#page').innerHTML = '<div class="hcard">' + seg + monthNav(m) + `<div class="kpis"><div class="kpi tap" data-dr="sum|receita|${m}" role="button" tabindex="0" title="Ver as receitas do mês"><small>Receitas <span aria-hidden="true">›</span></small><b class="num pos">${C.brl(sum.rec)}</b></div>
      <div class="kpi tap" data-dr="sum|despesa|${m}" role="button" tabindex="0" title="Ver as despesas do mês"><small>Despesas <span aria-hidden="true">›</span></small><b class="num neg">${C.brl(sum.desp)}</b></div>
      <div class="kpi"><small>Resultado do mês</small><b class="num ${sum.saldo < 0 ? 'neg' : ''}">${C.brl(sum.saldo)}</b></div></div></div>
    ${(() => { const fees = C.r2(st.tx.reduce((x, t) => x + (t.fee && (t.type === 'cred' ? C.txComp(st, t) : C.mOf(t.date)) === m ? t.fee : 0), 0)); return fees ? `<p class="hint tapline" id="rs-fee" data-dr="fee|${m}" role="button">Juros e taxas de Pix parcelado ou no crédito neste mês: <b class="num">${C.brl(fees)}</b> (já estão dentro das despesas).</p>` : ''; })()}
    ${b.plan ? `<p class="hint">Orçamento de despesas: ${C.brl(b.plan)} · gasto ${C.brl(b.real)} (${Math.round(b.real / b.plan * 100)}%).</p>` : ''}
    <p class="hint"><b>Resultado</b> = receitas − despesas do mês (inclui o que ainda está previsto). Não é o saldo da conta: esse fica em Contas.${sum.folha ? ` Receitas e despesas incluem ${C.brl(sum.folha)} pagos pela folha.` : ''}</p>
    ${inv.aportes || inv.resgates ? `<p class="okbox" id="rs-inv" data-dr="inv|${m}" role="button">Investido no mês: ${C.brl(inv.net)}${inv.resgates ? ` (aportes ${C.brl(inv.aportes)} − resgates ${C.brl(inv.resgates)})` : ''}. É transferência: não entra nas despesas.</p>` : ''}
    ${(() => { const mh = PH.monthByHolder(st, m); return mh.length ? `<div class="card" id="rs-who"><div class="chead"><h2>Por quem usou o cartão</h2><button class="link" data-dr="pn|card|p6|who|Quem usou o cartão">Últimos 6 meses</button></div><ul class="list calc go">${mh.map(o => `<li data-dr="who|${m}|${o.card.id}|${esc(o.h.ref)}" role="button"><span class="grow">${esc(PH.label(o.h))} <small class="hint">${esc(o.card.name)} · ${o.n} compra${o.n > 1 ? 's' : ''}</small>${o.h.reimb ? ' <span class="tag who reimb">devolve</span>' : ''}</span><span class="num">${C.brl(o.total)}</span><span class="chev" aria-hidden="true">›</span></li>`).join('')}</ul>${sum.terc ? `<p class="hint">${C.brl(sum.terc)} de quem devolve o dinheiro ficam fora das suas despesas; o reembolso também não conta como receita.</p>` : ''}</div>` : ''; })()}
    <div class="cols"><div class="card"><h2>Despesas por grupo</h2>${catHTML(cats, sum.desp || 1, 'desp')}</div>
    <div><div class="card"><h2>Últimos 6 meses <span class="hint">(toque num mês)</span></h2><svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Receitas e despesas dos últimos 6 meses">${bars}</svg>
      <p class="legend"><span class="sw b-rec"></span>Receitas <span class="sw b-desp"></span>Despesas</p></div>
    <div class="card"><h2>Receitas</h2>${catHTML(recs, sum.rec || 1, 'rec')}</div>
    ${(() => { const bp = C.byPay(st, m); return bp.length ? `<div class="card" id="rs-pay"><h2>Despesas por forma de pagamento</h2><ul class="sublist go" style="padding-left:0">${bp.map(o => `<li data-dr="pay|${m}|${o.k}" role="button"><span class="grow">${o.label} <small class="hint">(${o.n})</small></span><span class="num">${C.brl(o.total)}</span><span class="chev" aria-hidden="true">›</span></li>`).join('')}</ul></div>` : ''; })()}</div></div>`;
  bindResumo(pageResumo);
}

/* Futuro: quanto da renda prevista de cada um dos próximos 12 meses já tem destino */
function pageFuturo(seg) {
  const st = S(), cur = M.todayISO().slice(0, 7), rows = C.committed(st, cur, M.REC_AHEAD + 1);
  const K = C.COMMIT_KINDS, nx = rows[1] || rows[0];
  const withR = rows.filter(r => r.renda > 0), avg = withR.length ? Math.round(withR.reduce((s, r) => s + r.pct, 0) / withR.length) : null;
  const bar = r => { const base = Math.max(r.renda, r.total, 1); return `<span class="cbar">${K.map(([k, , c]) => r.parts[k] ? `<i style="width:${(r.parts[k] / base * 100).toFixed(1)}%;background:${c}"></i>` : '').join('')}</span>`; };
  const ends = rows.flatMap(r => r.ends.map(e => ({ ...e, m: r.m })));
  const subs = C.detectSubs(st).length;
  $('#page').innerHTML = `<div class="hcard">${seg}<small class="lbl">${nx.renda > 0 ? `Em ${C.monthLabel(nx.m).toLowerCase()}, já tem destino` : 'Renda comprometida'}</small>
      <span class="big" id="fu-pct">${nx.pct == null ? '—' : nx.pct + '% da renda'}</span>
      <div class="kpis two"><div class="kpi"><small>Renda prevista</small><b class="num pos">${C.brl(nx.renda)}</b></div><div class="kpi"><small>${nx.sobra < 0 ? 'Falta' : 'Sobra prevista'}</small><b class="num ${nx.sobra < 0 ? 'neg' : ''}">${C.brl(Math.abs(nx.sobra))}</b></div></div>
      <p class="hint">${avg == null ? 'Cadastre a renda (contracheque ou receita que se repete) para ver o percentual.' : `Média dos próximos meses: ${avg}% da renda prevista.`}</p></div>
    ${subs ? `<button class="banner" id="fu-subs"><span class="grow"><b>${subs} compra${subs > 1 ? 's' : ''} no cartão parece${subs > 1 ? 'm' : ''} assinatura</b><small>Confirme para entrarem na conta dos próximos meses</small></span><span aria-hidden="true">›</span></button>` : ''}
    <div class="cols"><div class="card"><h2>Mês a mês</h2><p class="legend wrapl">${K.map(([, l, c]) => `<span><span class="sw" style="background:${c}"></span> ${l}</span>`).join('')}</p>
      ${rows.map((r, i) => `<details class="cmp" ${i === 1 ? 'open' : ''}><summary><span class="cm"><b>${shortM(r.m)}</b>${r.ends.length ? `<small>${r.ends.length} termina${r.ends.length > 1 ? 'm' : ''}</small>` : ''}</span>${bar(r)}<span class="num cp ${r.pct != null && r.pct > 100 ? 'neg' : ''}">${r.pct == null ? '—' : r.pct + '%'}</span></summary>
        <ul class="sublist calc go"><li data-dr="fut|${r.m}|renda" role="button"><span class="grow">Renda prevista</span><span class="num pos">${C.brl(r.renda)}</span><span class="chev" aria-hidden="true">›</span></li>
          ${K.map(([k, l, c]) => r.parts[k] ? `<li data-dr="fut|${r.m}|${k}" role="button"><span class="grow"><span class="sw" style="background:${c}"></span> ${l}</span><span class="num">−${C.brl(r.parts[k])}</span><span class="chev" aria-hidden="true">›</span></li>` : '').join('')}
          <li class="tot"><span class="grow">${r.sobra < 0 ? 'Falta' : 'Sobra'}</span><span class="num ${r.sobra < 0 ? 'neg' : ''}">${C.brl(Math.abs(r.sobra))}</span></li></ul>
        ${r.ends.length ? `<p class="hint">Termina neste mês: ${r.ends.map(e => `${esc(e.desc)} (${C.brl(e.amount)})`).join('; ')}.</p>` : ''}</details>`).join('')}</div>
    <div>${(() => { // os próximos 12 meses por tipo de compromisso: cada um abre as somas por item (compra, conta, dívida)
      const SET = { folha: 'folha', fixas: 'fix', variaveis: 'fix', parcelas: 'parc', dividas: 'debt' }, LAB = { fix: 'Fixas e de valor variável' };
      const tots = {}; rows.slice(0, 12).forEach(r => Object.entries(r.parts).forEach(([k, v]) => { const s = SET[k]; if (s && v) tots[s] = (tots[s] || 0) + v; }));
      const list = Object.entries(tots).sort((x, y) => y[1] - x[1]); if (!list.length) return '';
      return `<div class="card" id="fu-kinds"><h2>Próximos 12 meses, por tipo</h2><p class="hint">Toque para ver cada compra, conta ou dívida e quanto falta.</p><ul class="list wrap">${list.map(([s, v]) => { const kk = Object.keys(SET).find(x => SET[x] === s), lab = LAB[s] || (C.COMMIT_KINDS.find(x => x[0] === kk) || [])[1]; const cc = (C.COMMIT_KINDS.find(x => x[0] === kk) || [])[2];
        return `<li data-dr="pn|${s}|n12|desc|${esc(lab)}" role="button"><span class="sw" style="background:${cc}"></span><span class="t"><b>${esc(lab)}</b><small>média de ${C.brl(v / 12)} por mês</small></span><span class="num">${C.brl(v)}</span><span class="chev" aria-hidden="true">›</span></li>`; }).join('')}</ul></div>`; })()}
    <div class="card"><h2>O que termina</h2>${ends.length ? `<p class="hint">A partir do mês seguinte, o valor deixa de pesar.</p><ul class="list wrap">${ends.map(e => `<li ${e.plan ? `data-dr="plan|${e.plan}"` : e.loan ? `data-dr="loan|${e.loan}"` : 'style="cursor:default"'}><span class="t"><b>${esc(e.desc)}</b><small>${shortM(e.m)} · ${e.what}</small></span><span class="num pos">+${C.brl(e.amount)}/mês</span></li>`).join('')}</ul>` : '<p class="hint">Nenhuma parcela ou dívida termina nos próximos 12 meses.</p>'}</div>
    <div class="card flat"><h2>Como ler</h2><p class="hint">Conta o que já está no app para cada mês: descontos em folha, contas fixas e assinaturas, contas de valor variável (pela média), parcelas no cartão e na conta, e parcelas de dívidas. Gastos do dia a dia que ainda não aconteceram não entram, então a sobra é o que resta para eles. A renda e as contas fixas são previstas até ${shortM(C.mAdd(cur, M.REC_AHEAD))}.</p></div></div></div>`;
  bindResumo(() => pageFuturo(seg));
  const sb = $('#fu-subs'); if (sb) sb.onclick = e => { e.stopPropagation(); ui.tab = 'agenda'; ui.agView = 'fix'; render(); const c = $('#subs-card'); if (c) c.scrollIntoView({ block: 'center' }); };
}

function bindResumo(redraw) {
  $('#page').onclick = e => {
    const v = e.target.closest('[data-rv]'); if (v) { ui.rsView = v.dataset.rv; return pageResumo(); }
    if (monthNavClick(e, redraw)) return;
    // receitas, despesas e cada categoria abrem os Lançamentos do mês já filtrados
    const y = e.target.closest('[data-y]'); if (y) { ui.year = (ui.year || +M.todayISO().slice(0, 4)) + +y.dataset.y; return redraw(); }
    const bi = e.target.closest('[data-bi]'); if (bi) return budgetSheet(bi.dataset.bi);
    if (e.target.id === 'b-add') return budgetSheet(null);
    if (e.target.id === 'b-sug') return suggestBudget();
    if (e.target.id === 'y-csv') { const yy = ui.year || +M.todayISO().slice(0, 4); downloadFile(`financas-${yy}-por-categoria.csv`, C.yearCsv(S(), yy), 'text/csv;charset=utf-8'); toast('Planilha baixada (abre no Excel, Numbers ou Google Planilhas).'); }
  };
}

function pageOrcamento(seg) {
  const st = S(), m = ui.month, b = C.budgetMonth(st, m);
  const pct = (r, p) => p ? Math.round(r / p * 100) : null;
  const barOf = (r, p, color) => { const x = p ? Math.min(100, r / p * 100) : 100; return `<div class="bar ${p && r > p ? 'over' : ''}"><i style="width:${Math.max(2, x).toFixed(1)}%;background:${p && r > p ? 'var(--neg)' : col(color)}"></i></div>`; };
  const any = Object.values(st.orc || {}).some(o => o.def || Object.values(o.months || {}).some(Boolean));
  let html = '<div class="hcard">' + seg + monthNav(m);
  html += `<div class="kpis"><div class="kpi"><small>Planejado</small><b class="num">${C.brl(b.plan)}</b></div><div class="kpi"><small>Gasto</small><b class="num ${b.plan && b.real > b.plan ? 'neg' : ''}">${C.brl(b.real)}</b></div>
    <div class="kpi"><small>${b.real > b.plan ? 'Acima' : 'Disponível'}</small><b class="num ${b.real > b.plan ? 'neg' : 'pos'}">${C.brl(Math.abs(b.plan - b.real))}</b></div></div></div>`;
  if (!any) html += `<div class="card"><h2>Sem orçamento ainda</h2><p class="hint">Defina quanto pretende gastar por mês em cada categoria. O app compara com o que foi gasto (débito no mês e cartão pela fatura).</p>
    <div class="row"><button class="btn primary" id="b-sug">Sugerir pela média dos últimos 3 meses</button><button class="btn" id="b-add">Definir uma categoria</button></div></div>`;
  if (any) html += `<div class="newrow"><button class="btn" id="b-add">+ Orçar outra categoria</button><button class="btn" id="b-sug">Sugerir pela média</button></div>`;
  html += b.groups.map(g => `<div class="card"><div class="ghead"><span class="sw" style="background:${col(g.color)}"></span><b class="grow">${esc(g.name)}</b><span class="num">${C.brl(g.real)}${g.plan ? ' / ' + C.brl(g.plan) : ''}</span></div>
    <ul class="list budget">${g.items.map(i => `<li data-bi="${i.id}"><span class="t"><b>${esc(i.name)}</b>${barOf(i.real, i.plan, g.color)}
      <small>${i.plan ? `${C.brl(i.real)} de ${C.brl(i.plan)} · ${pct(i.real, i.plan)}%${i.real > i.plan ? ` · <span class="neg">passou ${C.brl(i.real - i.plan)}</span>` : ` · faltam ${C.brl(i.plan - i.real)}`}` : `${C.brl(i.real)} gasto · sem orçamento`}</small></span></li>`).join('')}</ul></div>`).join('');
  if (b.noCat) html += `<p class="hint">${C.brl(b.noCat)} em lançamentos sem categoria não entram em nenhum grupo.</p>`;
  $('#page').innerHTML = html;
  bindResumo(() => pageOrcamento(seg));
}

function budgetSheet(itemId) {
  const st = S(), m = ui.month;
  openSheet('', panel => {
    const draw = () => {
      const it = itemId && itemById(itemId), o = itemId && st.orc && st.orc[itemId], avg = itemId ? C.avgLast(S(), itemId, m) : 0;
      const hasMonth = o && o.months && o.months[m] != null;
      panel.innerHTML = `<h2>Orçamento</h2>
        <label for="o-item">Categoria</label><select id="o-item"><option value="">Escolha…</option>${optItems('despesa', itemId)}</select>
        ${it ? `<label for="o-val">Valor por mês (R$)</label><input id="o-val" inputmode="decimal" value="${moneyText(C.budgetOf(S(), itemId, m))}" placeholder="0,00">
          <p class="hint">Média dos 3 meses anteriores: <button class="link" id="o-avg">${C.brl(avg)}</button></p>
          <button type="button" class="link" data-dr="cat|despesa|${m}|${itemId}">Ver os gastos de ${C.monthLabel(m).toLowerCase()} ›</button>
          <label class="check"><input type="checkbox" id="o-only" ${hasMonth ? 'checked' : ''}> Valer só para ${C.monthLabel(m).toLowerCase()} (os outros meses continuam com o valor padrão${o && o.def ? ' de ' + C.brl(o.def) : ''})</label>` : ''}
        <div class="actions">${o && (o.def || hasMonth) ? '<button class="btn danger" id="o-del">Remover</button>' : ''}<button class="btn" id="o-cancel">Cancelar</button><button class="btn primary" id="o-save" ${it ? '' : 'disabled'}>Salvar</button></div>`;
      panel.querySelector('#o-item').onchange = e => { itemId = e.target.value; draw(); };
      panel.querySelector('#o-cancel').onclick = closeSheet;
      if (panel.querySelector('#o-avg')) panel.querySelector('#o-avg').onclick = () => { panel.querySelector('#o-val').value = moneyText(avg); };
      if (panel.querySelector('#o-del')) panel.querySelector('#o-del').onclick = async () => { await sync.commit(s => M.setBudget(s, itemId, 0, hasMonth ? m : null)); closeSheet(); render(); };
      panel.querySelector('#o-save').onclick = async () => {
        const v = C.parseMoney(panel.querySelector('#o-val').value), only = panel.querySelector('#o-only').checked;
        await sync.commit(s => M.setBudget(s, itemId, v, only ? m : null));
        closeSheet(); render(); toast('Orçamento salvo.');
      };
    };
    draw();
  });
}

async function suggestBudget() {
  const st = S(), m = ui.month;
  const sug = st.items.filter(i => groupOf(i) && groupOf(i).kind === 'despesa').map(i => ({ id: i.id, name: i.name, v: Math.ceil(C.avgLast(st, i.id, m) / 10) * 10 })).filter(x => x.v > 0 && !C.budgetOf(st, x.id, m));
  if (!sug.length) return toast('Não há gastos nos 3 meses anteriores para sugerir (ou essas categorias já têm orçamento).', true);
  const total = sug.reduce((s, x) => s + x.v, 0);
  const ok = await askChoice('Sugerir orçamento', `${sug.length} categoria(s), somando ${C.brl(total)} por mês, pela média dos 3 meses anteriores (arredondada para cima). Dá para ajustar cada uma depois.`, [{ label: 'Aplicar sugestão', value: 'y' }]);
  if (!ok) return;
  await sync.commit(s => sug.forEach(x => M.setBudget(s, x.id, x.v)));
  render(); toast('Orçamento criado.');
}

function pageAno(seg) {
  const st = S(), y = ui.year || +M.todayISO().slice(0, 4), Y = C.yearTable(st, y);
  const cell = v => v ? C.brl(v).replace('R$ ', '') : '–';
  const head = `<tr><th class="sticky">${y}</th>${Y.months.map(m => `<th ${m === M.todayISO().slice(0, 7) ? 'data-cur' : ''}>${shortM(m).slice(0, 3)}</th>`).join('')}<th>Total</th></tr>`;
  const kindOf = cls => cls === 'rec' ? 'receita' : 'despesa', dcell = (v, spec) => v ? `<td data-dr="${spec}" class="dc">${cell(v)}</td>` : `<td>${cell(v)}</td>`;
  const groupRows = (list, cls) => list.map(g => `<tr class="g ${cls}"><td class="sticky"><span class="sw" style="background:${col(g.color)}"></span> ${esc(g.name)}</td>${g.months.map((v, i) => dcell(v, `grp|${kindOf(cls)}|${Y.months[i]}|${g.id}`)).join('')}${dcell(g.total, `grp|${kindOf(cls)}|${y}|${g.id}`).replace('<td', '<td style="font-weight:700"')}</tr>
    ${g.items.map(i => `<tr class="i"><td class="sticky">${esc(i.name)}</td>${i.months.map((v, k) => dcell(v, `cat|${kindOf(cls)}|${Y.months[k]}|${i.id}`)).join('')}${dcell(i.total, `cat|${kindOf(cls)}|${y}|${i.id}`)}</tr>`).join('')}`).join('');
  const tot = (label, arr, total, cls, kind) => `<tr class="t ${cls}"><td class="sticky">${label}</td>${arr.map((v, i) => kind && v ? `<td data-dr="sum|${kind}|${Y.months[i]}" class="dc">${cell(v)}</td>` : `<td class="${v < 0 ? 'neg' : ''}">${cell(v)}</td>`).join('')}<td class="${total < 0 ? 'neg' : ''} ${kind && total ? 'dc' : ''}" ${kind && total ? `data-dr="sum|${kind}|${y}"` : ''}><b>${cell(total)}</b></td></tr>`;
  const res = C.r2(Y.recT - Y.despT);
  $('#page').innerHTML = '<div class="hcard">' + seg + `<div class="month"><button data-y="-1" aria-label="Ano anterior">‹</button><b>${y}</b><button data-y="1" aria-label="Próximo ano">›</button></div>
    <div class="kpis"><div class="kpi"><small>Receitas</small><b class="num pos">${C.brl(Y.recT)}</b></div><div class="kpi"><small>Despesas</small><b class="num neg">${C.brl(Y.despT)}</b></div>
    <div class="kpi"><small>Resultado do ano</small><b class="num ${res < 0 ? 'neg' : ''}">${C.brl(res)}</b></div></div></div>
    <div class="row" style="justify-content:flex-end"><button class="btn small" id="y-csv">Baixar planilha do ano (CSV)</button></div>
    <div class="card scrollx"><table class="year"><thead>${head}</thead><tbody>
      ${tot('Receitas', Y.recM, Y.recT, 'pos', 'receita')}${groupRows(Y.rec, 'rec')}
      ${tot('Despesas', Y.despM, Y.despT, '', 'despesa')}${groupRows(Y.desp, 'desp')}
      ${tot('Resultado', Y.resM, res, 'res')}</tbody></table></div>
    <p class="hint">Arraste a tabela para o lado para ver todos os meses. Toque num valor para ver os lançamentos. Cartão entra pelo mês da fatura.</p>`;
  const sx = $('#page .scrollx'), cur = sx && sx.querySelector('th[data-cur]');
  if (cur) sx.scrollLeft = Math.max(0, cur.offsetLeft - sx.clientWidth + cur.offsetWidth * 3);
  bindResumo(() => pageAno(seg));
}

/* ----- contas e faturas ----- */
function pageContas() {
  const st = S(), today = M.todayISO();
  const bal = C.balances(st, today, true), proj = C.balances(st, today.slice(0, 7) + '-31', false);
  const allDeb = st.accounts.filter(a => a.nature === 'debito' && a.active !== false);
  const debs = allDeb.filter(a => !a.inv), invs = allDeb.filter(a => a.inv);
  const cards = st.accounts.filter(a => a.nature === 'credito' && a.active !== false);
  const archived = st.accounts.filter(a => a.active === false);
  const total = debs.reduce((s, a) => s + (bal[a.id] || 0), 0), invTotal = invs.reduce((s, a) => s + (bal[a.id] || 0), 0);
  const projT = debs.reduce((s, a) => s + (proj[a.id] || 0), 0);
  let html = `<div class="hcard"><small class="lbl">Saldo hoje</small><span class="num big ${total < 0 ? 'neg' : ''}">${C.brl(total)}</span>
    <p class="hint">No fim do mês, com o que está pendente: <b class="num ${projT < 0 ? 'neg' : ''}">${C.brl(projT)}</b></p></div>
    <div class="cols"><div class="card"><div class="chead"><h2>Contas</h2><button class="link" data-new="debito">+ Nova conta</button></div>
    <ul class="list wrap">${debs.map(a => `<li data-acc="${a.id}"><span class="t"><b>${esc(a.name)}</b>
      <small>No fim do mês, com pendentes: ${C.brl(proj[a.id] || 0)}</small></span><span class="num ${bal[a.id] < 0 ? 'neg' : ''}">${C.brl(bal[a.id] || 0)}</span></li>`).join('')}</ul>
    <p class="hint">Saldo inicial de cada conta + o que já entrou − o que já saiu. Pendentes e compras no cartão ainda não pagas não contam. Toque na conta para ver a conta completa.</p></div>${resCard(st, today, total)}`;
  html += `<div class="card" id="inv-card"><div class="chead"><h2>Investimentos</h2><button class="link" data-new="inv">+ Novo</button></div>${invs.length ? `<div class="num" style="font-size:22px;font-weight:700">${C.brl(invTotal)}</div>
      <p class="hint">Fica fora do Saldo hoje. Para investir a sobra do mês, lance uma <b>Transferência</b> da conta para o investimento: não conta como despesa.</p>
      <ul class="list wrap">${invs.map(a => { const y = C.invYield(st, a.id, today); return `<li data-acc="${a.id}"><span class="t"><b>${esc(a.name)}</b><small>Rendimento registrado: ${C.brl(y.mes)} no mês · ${C.brl(y.ano)} no ano</small></span><span class="num">${C.brl(bal[a.id] || 0)}</span></li>`; }).join('')}</ul>`
    : '<p class="hint">Dinheiro aplicado (poupança, CDB, Tesouro, fundos, corretora). Cadastre a conta de investimento com o valor que já tem lá; para investir a sobra do mês, lance uma <b>Transferência</b> da conta corrente para ela. Transferência não é despesa.</p>'}</div>`;
  html += `<div class="card"><div class="chead"><h2>Cartões</h2><button class="link" data-new="credito">+ Novo cartão</button></div>${cards.length ? '<p class="hint">Toque no cartão para ver a fatura, importar o arquivo dela ou registrar o pagamento.</p>' : '<p class="hint">Nenhum cartão cadastrado.</p>'}<ul class="list wrap">${cards.map(c => {
    const comp = C.cardCycle(c, today).comp, f = C.faturaOf(st, c.id, comp);
    return `<li data-card="${c.id}">${dot('cred', '#607d8b')}<span class="t"><b>${esc(c.name)}</b><small>Fatura aberta: ${C.monthLabel(comp).toLowerCase()} · vence ${C.fmtD(f.date)}</small></span><span class="num">${C.brl(f.total)}</span></li>`;
  }).join('')}</ul></div></div>
  ${archived.length ? `<div class="card"><h2>Arquivadas</h2><ul class="list">${archived.map(a => `<li data-acc="${a.id}"><span class="t"><b>${esc(a.name)}</b><small>${a.nature === 'credito' ? 'Cartão' : 'Conta'} arquivado</small></span></li>`).join('')}</ul></div>` : ''}`;
  $('#page').innerHTML = html;
  $('#page').onclick = e => {
    if (e.target.id === 'res-new') return resForm(null);
    const rs = e.target.closest('[data-res]'); if (rs) return resSheet(rs.dataset.res);
    const n = e.target.closest('[data-new]'); if (n) return accSheet(null, n.dataset.new);
    const c = e.target.closest('[data-card]'); if (c) return faturaSheet(c.dataset.card);
    const li = e.target.closest('[data-acc]'); if (li) accSheet(accById(li.dataset.acc));
  };
}

/* de onde vem o saldo de uma conta, linha a linha */
function saldoHTML(acc) {
  const today = M.todayISO(), b = C.balanceBreakdown(S(), acc.id, today); if (!b) return '';
  const line = (label, v, sign, dr) => v ? `<li ${dr ? `data-dr="bal|${acc.id}|${dr}" role="button"` : ''}><span class="grow">${label}</span><span class="num">${sign}${C.brl(Math.abs(v))}</span>${dr ? '<span class="chev" aria-hidden="true">›</span>' : ''}</li>` : '';
  const n = b.now, p = b.pend, fat = p.fat + p.cardPay;
  const pend = line('A receber até o fim do mês', p.rec, '+', 'pend|rec') + line('A pagar até o fim do mês', p.deb, '−', 'pend|deb') + line('Faturas de cartão a pagar', fat, '−') + line('Transferências previstas (entrada)', p.trfIn, '+', 'pend|trfIn') + line('Transferências previstas (saída)', p.trfOut, '−', 'pend|trfOut');
  return `<details class="rgroup" id="a-calc" open><summary>Como chegamos neste valor</summary>
    <ul class="sublist calc go"><li><span class="grow">Saldo inicial${b.initialDate ? ' (fim do dia ' + C.fmtD(b.initialDate) + '/' + b.initialDate.slice(2, 4) + ')' : ''}</span><span class="num">${C.brl(b.initial)}</span></li>
      ${line(acc.inv ? 'Entradas' : 'Receitas já recebidas', n.rec, '+', 'now|rec')}${line(acc.inv ? 'Saídas' : 'Despesas já pagas', n.deb, '−', 'now|deb')}${line('Pagamentos de fatura de cartão', n.cardPay, '−', 'now|cardPay')}
      ${line(acc.inv ? 'Aportes (transferências recebidas)' : 'Transferências recebidas', n.trfIn, '+', 'now|trfIn')}${line(acc.inv ? 'Resgates (transferências enviadas)' : 'Transferências enviadas', n.trfOut, '−', 'now|trfOut')}
      ${line('Rendimento registrado', n.adj, n.adj < 0 ? '−' : '+', 'now|adj')}
      <li class="tot"><span class="grow">= Saldo hoje</span><span class="num">${C.brl(n.total)}</span></li>
      ${acc.inv ? '' : pend + `<li class="tot"><span class="grow">= No fim do mês, com pendentes</span><span class="num">${C.brl(b.end.total)}</span></li>`}</ul>
    <p class="hint">${b.initialDate ? `Lançamentos até ${C.fmtD(b.initialDate)}/${b.initialDate.slice(2, 4)} já estão dentro do saldo inicial e não contam de novo. ` : ''}${acc.inv ? '' : 'Compra no cartão só sai da conta quando a fatura é paga; o que é pago pela folha não passa pela conta. Se o valor não bate com o banco, confira o saldo inicial e a data dele, e veja se há lançamento pendente que já foi pago ou movimento que falta importar.'}</p></details>`;
}

/* ----- reservas ----- */
function resCard(st, today, total) {
  const R = C.reserves(st, today), act = R.list.filter(x => !x.r.done), done = R.list.filter(x => x.r.done);
  const row = x => `<li data-res="${x.r.id}"><span class="t"><b>${esc(x.r.name)}</b>
      ${x.r.target ? `<div class="bar"><i style="width:${Math.max(2, x.pct).toFixed(1)}%;background:${col(x.r.color)}"></i></div>` : ''}
      <small>${x.r.done ? 'Concluída' : x.r.target ? `${Math.round(x.pct)}% de ${C.brl(x.r.target)}${x.rest ? ` · faltam ${C.brl(x.rest)}` : ' · meta atingida ✓'}` : 'Sem meta de valor'}${!x.r.done && x.perMonth ? ` · guardar ${C.brl(x.perMonth)}/mês até ${C.fmtD(x.r.deadline)}/${x.r.deadline.slice(2, 4)}` : ''}${x.late ? ' · <span class="neg">prazo passou</span>' : ''}</small></span>
      <span class="num">${C.brl(x.saved)}</span></li>`;
  const livre = C.r2(total - R.total);
  return `<div class="card"><div class="chead"><h2>Reservas</h2><button class="link" id="res-new">+ Nova reserva</button></div>
    ${act.length ? `<div class="kpis two"><div class="kpi"><small>Guardado</small><b class="num">${C.brl(R.total)}</b></div><div class="kpi"><small>Livre nas contas</small><b class="num ${livre < 0 ? 'neg' : ''}">${C.brl(livre)}</b></div></div>
      ${livre < 0 ? '<p class="hint neg">As reservas somam mais do que o saldo das contas.</p>' : ''}` : '<p class="hint">Separe parte do saldo para objetivos (emergência, viagem, IPVA…). O dinheiro continua na conta; o app mostra quanto dele está comprometido e quanto está livre.</p>'}
    <ul class="list wrap">${act.map(row).join('')}</ul>
    ${done.length ? `<details><summary class="hint">Concluídas (${done.length})</summary><ul class="list wrap">${done.map(row).join('')}</ul></details>` : ''}</div>`;
}

function resForm(r) {
  openSheet('', panel => {
    let color = r ? r.color : COLORS[8];
    panel.innerHTML = `<h2>${r ? 'Editar reserva' : 'Nova reserva'}</h2>
      <label for="rs-name">Nome</label><input id="rs-name" value="${r ? esc(r.name) : ''}" placeholder="Ex.: Reserva de emergência">
      <div class="grid2"><div><label for="rs-target">Meta (R$, opcional)</label><input id="rs-target" inputmode="decimal" value="${r ? moneyText(r.target) : ''}" placeholder="0,00"></div>
        <div><label for="rs-dl">Até quando (opcional)</label><input id="rs-dl" type="date" value="${r ? r.deadline : ''}"></div></div>
      ${r ? '' : `<label for="rs-ini">Já tenho guardado (R$, opcional)</label><input id="rs-ini" inputmode="decimal" placeholder="0,00">`}
      <label>Cor</label><div class="colors">${COLORS.map(c => `<button type="button" data-color="${c}" style="background:${c}" aria-pressed="${c === color}" aria-label="Cor"></button>`).join('')}</div>
      ${r ? `<label class="check"><input type="checkbox" id="rs-done" ${r.done ? 'checked' : ''}> Reserva concluída (sai do total guardado)</label>` : ''}
      <div class="actions">${r ? '<button class="btn danger" id="rs-del">Excluir</button>' : ''}<button class="btn" id="rs-cancel">Cancelar</button><button class="btn primary" id="rs-save">Salvar</button></div>`;
    panel.querySelector('.colors').onclick = e => { const b = e.target.closest('[data-color]'); if (!b) return; color = b.dataset.color; panel.querySelectorAll('[data-color]').forEach(x => x.setAttribute('aria-pressed', x === b)); };
    panel.querySelector('#rs-cancel').onclick = closeSheet;
    if (r) panel.querySelector('#rs-del').onclick = async () => {
      if (!await askChoice('Excluir reserva', `Excluir "${r.name}" e o histórico dela? O dinheiro das contas não muda.`, [{ label: 'Excluir', value: 'y', danger: true }])) return;
      await sync.commit(s => M.removeRecord(s, 'res', r.id)); closeSheet(); render(); toast('Reserva excluída.');
    };
    panel.querySelector('#rs-save').onclick = async () => {
      const name = panel.querySelector('#rs-name').value.trim();
      if (!name) return toast('Dê um nome à reserva.', true);
      const f = { name, target: C.parseMoney(panel.querySelector('#rs-target').value), deadline: panel.querySelector('#rs-dl').value, color };
      if (f.target < 0) return toast('A meta não pode ser negativa.', true);
      if (r) {
        const done = panel.querySelector('#rs-done').checked;
        await sync.commit(s => { const x = s.res.find(y => y.id === r.id); if (x) { Object.assign(x, f, { name: f.name, done }); M.touch(x); } });
      } else {
        const ini = C.parseMoney(panel.querySelector('#rs-ini').value);
        await sync.commit(s => { const x = M.newReserve(f); if (ini) M.reserveMov(x, { v: ini, note: 'Valor inicial', ini: true }); s.res.push(x); });
      }
      closeSheet(); render(); toast('Reserva salva.');
    };
  });
}

function resSheet(id) {
  openSheet('', panel => {
    let mode = null;
    const draw = () => {
      const r = S().res.find(x => x.id === id); if (!r) return closeSheet();
      const x = C.reserves(S(), M.todayISO()).list.find(y => y.r.id === id);
      panel.innerHTML = `<h2>${esc(r.name)}</h2>
        <div class="kpis two"><div class="kpi"><small>Guardado</small><b class="num">${C.brl(x.saved)}</b></div><div class="kpi"><small>${r.target ? 'Falta' : 'Meta'}</small><b class="num">${r.target ? C.brl(x.rest) : '—'}</b></div></div>
        ${r.target ? `<div class="bar"><i style="width:${Math.max(2, x.pct).toFixed(1)}%;background:${col(r.color)}"></i></div>` : ''}
        <p class="hint">${x.perMonth ? `Para chegar a ${C.brl(r.target)} até ${C.fmtD(r.deadline)}/${r.deadline.slice(0, 4)}: guardar ${C.brl(x.perMonth)} por mês (${x.months} ${x.months === 1 ? 'mês' : 'meses'}). Neste mês: ${C.brl(x.thisMonth)}.` : x.late ? '<span class="neg">O prazo passou sem atingir a meta.</span> Edite a reserva para mudar a data.' : r.target && !x.rest ? 'Meta atingida. Marque como concluída quando usar o dinheiro.' : 'Guardar e retirar não movem dinheiro entre contas: só marcam quanto do saldo está separado.'}</p>
        ${mode ? `<div class="card inset"><h3 class="sub">${mode > 0 ? 'Guardar' : 'Retirar'}</h3>
          <div class="grid2"><div><label for="rm-v">Valor (R$)</label><input id="rm-v" inputmode="decimal" placeholder="0,00" value="${mode > 0 && x.perMonth ? moneyText(Math.max(0, x.perMonth - x.thisMonth)) : ''}"></div><div><label for="rm-d">Data</label><input id="rm-d" type="date" value="${M.todayISO()}"></div></div>
          <label for="rm-n">Observação (opcional)</label><input id="rm-n" placeholder="${mode > 0 ? 'Ex.: sobra do mês' : 'Ex.: conserto do carro'}">
          <div class="actions"><button class="btn" id="rm-cancel">Cancelar</button><button class="btn primary" id="rm-ok">${mode > 0 ? 'Guardar' : 'Retirar'}</button></div></div>`
        : `<div class="actions wrap"><button class="btn" id="rs-edit">Editar</button><button class="btn" id="rs-out" ${x.saved > 0 ? '' : 'disabled'}>Retirar</button><button class="btn primary" id="rs-in">Guardar</button></div>`}
        <h3 class="sub">Histórico</h3>${(r.movs || []).length ? `<ul class="list">${[...r.movs].reverse().map(m => `<li><span class="t"><b>${m.v > 0 ? 'Guardado' : 'Retirado'}</b><small>${C.fmtD(m.date)}/${m.date.slice(2, 4)}${m.note ? ' · ' + esc(m.note) : ''}</small></span><span class="num ${m.v < 0 ? 'neg' : 'pos'}">${C.brl(m.v)}</span><button class="link" data-delmov="${m.id}" aria-label="Apagar movimento">✕</button></li>`).join('')}</ul>` : '<p class="empty">Nada guardado ainda.</p>'}
        <div class="actions"><button class="btn" id="rs-close">Fechar</button></div>`;
    };
    panel.onclick = async e => {
      const t = e.target;
      if (t.id === 'rs-close') return closeSheet();
      if (t.id === 'rs-edit') { closeSheet(); return resForm(S().res.find(x => x.id === id)); }
      if (t.id === 'rs-in') { mode = 1; draw(); return panel.querySelector('#rm-v').focus(); }
      if (t.id === 'rs-out') { mode = -1; draw(); return panel.querySelector('#rm-v').focus(); }
      if (t.id === 'rm-cancel') { mode = null; return draw(); }
      if (t.id === 'rm-ok') {
        const v = Math.abs(C.parseMoney(panel.querySelector('#rm-v').value));
        if (!v) return toast('Informe o valor.', true);
        const saved = M.reserveSaved(S().res.find(x => x.id === id));
        if (mode < 0 && v > saved + 0.005) return toast(`A reserva só tem ${C.brl(saved)}.`, true);
        const f = { v: mode * v, date: panel.querySelector('#rm-d').value, note: panel.querySelector('#rm-n').value };
        await sync.commit(s => { const r = s.res.find(x => x.id === id); if (r) M.reserveMov(r, f); });
        mode = null; draw(); render(); return toast(f.v > 0 ? 'Guardado.' : 'Retirado.');
      }
      const dm = t.closest('[data-delmov]');
      if (dm && await askChoice('Apagar movimento', 'Apagar este movimento da reserva?', [{ label: 'Apagar', value: 'y', danger: true }])) {
        await sync.commit(s => { const r = s.res.find(x => x.id === id); if (r) { r.movs = r.movs.filter(m => m.id !== dm.dataset.delmov); M.touch(r); } });
        draw(); render();
      }
    };
    draw();
  });
}

/* ----- Fase 4: bloqueio, modo discreto e cópias no Drive ----- */
function lockScreen() {
  let box = document.getElementById('lock');
  if (!lock.isLocked()) { if (box) box.remove(); document.body.classList.remove('locked'); return; }
  document.body.classList.add('locked');
  if (box) return;
  box = document.createElement('div'); box.id = 'lock'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
  document.body.appendChild(box);
  const st = lock.settings(); let pin = '';
  const draw = msg => {
    const w = lock.waitSeconds();
    box.innerHTML = `<div class="lockin"><img src="icons/icon-192.png" alt=""><h1>Níquel</h1><p class="hint" id="lk-msg">${msg || (w ? `Muitas tentativas. Aguarde ${w} s.` : 'Digite o PIN')}</p>
      <div class="dots">${Array.from({ length: st.pinLen }, (_, i) => `<i class="${i < pin.length ? 'on' : ''}"></i>`).join('')}</div>
      <div class="pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-k="${n}">${n}</button>`).join('')}
        ${st.bio ? '<button data-k="bio" aria-label="Usar Face ID ou Touch ID">◉</button>' : '<span></span>'}<button data-k="0">0</button><button data-k="del" aria-label="Apagar">⌫</button></div>
      ${st.bio ? '<button class="btn block" data-k="bio">Usar Face ID / Touch ID</button>' : ''}
      <button class="link" data-k="forgot">Esqueci o PIN</button></div>`;
  };
  draw();
  box.onclick = async e => {
    const k = (e.target.closest('[data-k]') || {}).dataset?.k; if (!k) return;
    if (k === 'bio') { if (!(await lock.tryBio())) draw('Não foi possível confirmar. Use o PIN.'); return; }
    if (k === 'forgot') {
      if (!(await confirmBox('Sem o PIN, o jeito é apagar a cópia deste aparelho e entrar de novo com a sua conta Google (os dados estão no Drive). Alterações que ainda não foram para o Drive se perdem. Continuar?'))) return;
      await lock.disable(); auth.signOut(); await sync.forgetDevice(); route(); return;
    }
    if (lock.waitSeconds()) return draw();
    if (k === 'del') pin = pin.slice(0, -1); else if (pin.length < st.pinLen) pin += k;
    draw();
    if (pin.length === st.pinLen) {
      const ok = await lock.tryPin(pin); pin = '';
      if (!ok) { draw(lock.waitSeconds() ? `PIN errado. Aguarde ${lock.waitSeconds()} s.` : 'PIN errado.'); box.querySelector('.dots').classList.add('shake'); }
    }
  };
}

const discreet = () => { try { return localStorage.getItem('fin.discreet') === '1'; } catch { return false; } };
function applyDiscreet() { document.body.classList.toggle('discreet', discreet()); const b = $('#eye'); if (b) { b.setAttribute('aria-pressed', discreet()); b.innerHTML = discreet() ? ICON_EYE_OFF : ICON_EYE; } }
function toggleDiscreet() { try { localStorage.setItem('fin.discreet', discreet() ? '0' : '1'); } catch { /* bloqueado */ } applyDiscreet(); }
const ICON_EYE = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const ICON_EYE_OFF = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 3l18 18M10.6 5.1A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.8 9.8 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';

const AFTER = [[0, 'Assim que sair do app'], [1, 'Depois de 1 minuto fora'], [5, 'Depois de 5 minutos fora'], [15, 'Depois de 15 minutos fora']];
function securityCardHTML() {
  const st = lock.settings(), info = sync.syncInfo();
  return `<div class="card"><h2>Segurança</h2>
    <p class="hint">${st ? `Bloqueio com PIN de ${st.pinLen} números${st.bio ? ' e Face ID / Touch ID' : ''}.` : 'Sem bloqueio: quem pegar o celular desbloqueado abre o app.'}</p>
    ${st ? `<label for="lk-after">Pedir o PIN</label><select id="lk-after">${AFTER.map(([v, l]) => `<option value="${v}" ${v === st.after ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <div class="row"><button class="btn" data-act="pin">Trocar PIN</button><span id="bio-slot"></span><button class="btn danger" data-act="lockoff">Desligar bloqueio</button></div>`
    : '<button class="btn primary" data-act="pin">Criar PIN de bloqueio</button>'}
    <label class="check"><input type="checkbox" id="disc" ${discreet() ? 'checked' : ''}> Modo discreto: esconder os valores (também pelo olho no topo da tela)</label>
    <p class="hint">O bloqueio e o modo discreto valem só para este aparelho.</p></div>
  <div class="card"><h2>Cópias no Drive</h2><p class="hint">Uma cópia por dia na subpasta <b>${esc(drive.BKFOLDER)}</b>, dentro de <b>${esc(drive.FOLDER)}</b>. Ficam as dos últimos 14 dias e uma de cada mês do último ano. Antes de restaurar ou de uma exclusão muito grande, o app guarda uma cópia extra.
    ${info.lastBackupDay ? ` Última: ${C.fmtD(info.lastBackupDay)}/${info.lastBackupDay.slice(0, 4)}.` : ''}${info.backupError ? ` <span class="neg">Última tentativa falhou: ${esc(info.backupError)}</span>` : ''}</p>
    <div class="row"><button class="btn" data-act="bklist">Ver e restaurar cópias</button><button class="btn" data-act="bknow">Fazer cópia agora</button></div></div>`;
}

async function bindSecurity() {
  const slot = $('#bio-slot'), st = lock.settings();
  if (slot && await lock.bioAvailable()) slot.outerHTML = `<button class="btn" data-act="bio">${st.bio ? 'Desligar Face ID' : 'Usar Face ID / Touch ID'}</button>`;
  if ($('#lk-after')) $('#lk-after').onchange = async e => { await lock.setAfter(+e.target.value); toast('Salvo.'); };
  $('#disc').onchange = () => { toggleDiscreet(); };
}

async function securityAction(a) {
  if (a === 'pin') return pinSheet();
  if (a === 'lockoff') {
    const p = await askPin('Digite o PIN atual para desligar o bloqueio.'); if (p == null) return;
    if (!(await lock.checkPin(p))) return toast('PIN errado.', true);
    await lock.disable(); toast('Bloqueio desligado.'); return render();
  }
  if (a === 'bio') {
    if (lock.settings().bio) { await lock.removeBio(); toast('Face ID desligado.'); return render(); }
    try { await lock.enrollBio(); toast('Face ID / Touch ID ligado.'); } catch { toast('O aparelho não confirmou o Face ID / Touch ID.', true); }
    return render();
  }
  if (a === 'bknow') {
    try { if (await sync.backupNow('manual')) toast('Cópia guardada no Drive.'); else toast('Conecte-se ao Google para fazer a cópia.', true); } catch (e) { toast(e.message, true); }
  }
  if (a === 'bklist') return backupsSheet();
}

function askPin(msg) {
  return new Promise(res => openSheet('', panel => {
    panel.innerHTML = `<h2>PIN</h2><p class="hint">${esc(msg)}</p><input id="ap" type="password" inputmode="numeric" autocomplete="off" maxlength="6">
      <div class="actions"><button class="btn" id="ap-c">Cancelar</button><button class="btn primary" id="ap-ok">OK</button></div>`;
    panel.querySelector('#ap-c').onclick = () => { closeSheet(); res(null); };
    panel.querySelector('#ap-ok').onclick = () => { const v = panel.querySelector('#ap').value; closeSheet(); res(v); };
    setTimeout(() => panel.querySelector('#ap').focus(), 50);
  }));
}

function pinSheet() {
  const had = lock.enabled();
  openSheet('', panel => {
    panel.innerHTML = `<h2>${had ? 'Trocar PIN' : 'Criar PIN'}</h2>
      ${had ? '<label for="pn-old">PIN atual</label><input id="pn-old" type="password" inputmode="numeric" autocomplete="off" maxlength="6">' : ''}
      <label for="pn-1">Novo PIN (4 a 6 números)</label><input id="pn-1" type="password" inputmode="numeric" autocomplete="off" maxlength="6">
      <label for="pn-2">Repita o PIN</label><input id="pn-2" type="password" inputmode="numeric" autocomplete="off" maxlength="6">
      ${had ? '' : `<label for="pn-after">Pedir o PIN</label><select id="pn-after">${AFTER.map(([v, l]) => `<option value="${v}" ${v === 1 ? 'selected' : ''}>${l}</option>`).join('')}</select>`}
      <p class="hint">Se esquecer o PIN, dá para apagar a cópia deste aparelho e entrar de novo com a conta Google: os dados estão no Drive.</p>
      <div class="actions"><button class="btn" id="pn-c">Cancelar</button><button class="btn primary" id="pn-ok">Salvar</button></div>`;
    panel.querySelector('#pn-c').onclick = closeSheet;
    panel.querySelector('#pn-ok').onclick = async () => {
      const v = id => panel.querySelector(id).value.trim();
      if (had && !(await lock.checkPin(v('#pn-old')))) return toast('PIN atual errado.', true);
      if (!/^\d{4,6}$/.test(v('#pn-1'))) return toast('O PIN deve ter de 4 a 6 números.', true);
      if (v('#pn-1') !== v('#pn-2')) return toast('Os dois PINs não são iguais.', true);
      await lock.setPin(v('#pn-1'), had ? undefined : +panel.querySelector('#pn-after').value);
      closeSheet(); toast(had ? 'PIN trocado.' : 'Bloqueio ligado.'); render();
    };
  });
}

function backupsSheet() {
  openSheet('', async panel => {
    panel.innerHTML = '<h2>Cópias no Drive</h2><p class="hint">Carregando…</p>';
    let list;
    try { list = await sync.listBackups(); } catch (e) { panel.innerHTML = `<h2>Cópias no Drive</h2><p class="hint neg">${esc(e.message)}</p><div class="actions"><button class="btn" id="bk-c">Fechar</button></div>`; panel.querySelector('#bk-c').onclick = closeSheet; return; }
    const label = n => { const m = n.match(/^financas-(\d{4})-(\d{2})-(\d{2})(?:-(\d{2})(\d{2})-(.+))?\.json$/); if (!m) return esc(n);
      const why = { manual: 'feita por você', 'antes-de-restaurar': 'antes de restaurar', 'antes-de-grande-exclusao': 'antes de uma exclusão grande' }[m[6]] || m[6];
      return `<b>${m[3]}/${m[2]}/${m[1]}</b>${m[4] ? ` às ${m[4]}h${m[5]}<small> · ${esc(why || '')}</small>` : '<small> · cópia do dia</small>'}`; };
    panel.innerHTML = `<h2>Cópias no Drive</h2>
      ${list.length ? `<p class="hint">Restaurar troca todos os dados atuais pelos da cópia, neste e nos outros aparelhos. Antes disso o app guarda uma cópia de como está agora.</p>
        <ul class="list">${list.map(f => `<li><span class="t">${label(f.name)}<small>${f.size ? (f.size / 1024).toFixed(0) + ' KB' : ''}</small></span><button class="btn" data-bk="${f.id}">Restaurar</button></li>`).join('')}</ul>`
        : '<p class="empty">Nenhuma cópia ainda. A primeira é feita na próxima sincronização.</p>'}
      <div class="actions"><button class="btn" id="bk-c">Fechar</button></div>`;
    panel.querySelector('#bk-c').onclick = closeSheet;
    panel.onclick = async e => {
      const b = e.target.closest('[data-bk]'); if (!b) return;
      b.disabled = true;
      try { const obj = await sync.downloadBackup(b.dataset.bk); closeSheet(); await restoreState(obj, 'esta cópia'); }
      catch (err) { b.disabled = false; toast('Não foi possível baixar a cópia: ' + err.message, true); }
    };
  });
}

/* ----- fixas, variáveis e parcelas (Agenda) ----- */
function fixasHTML(st) {
  const today = M.todayISO(), cm = today.slice(0, 7);
  const R = (st.rec || []).map(r => ({ r, s: C.recStats(st, r), est: M.recEstimate(st, r), ended: !!(r.end && r.end < cm) }));
  const act = R.filter(x => !x.ended), out = act.filter(x => x.r.type !== 'rec'), inc = act.filter(x => x.r.type === 'rec');
  const sum = l => l.reduce((s, x) => s + x.est, 0);
  const row = ({ r, s, est, ended }) => { const acc = accById(r.accountId), it = itemById(r.itemId), g = groupOf(it);
    return `<li data-rec="${r.id}">${dot(r.type, g && g.color)}
      <span class="t"><b>${esc(r.desc || (it ? it.name : ''))}</b><small>dia ${r.day}${acc ? ' · ' + esc(acc.name) : ''}${r.person ? ' · Pix' : ''}${ended ? ` · encerrada em ${shortM(r.end)}` : r.end ? ` · até ${shortM(r.end)}` : ''}${r.kind === 'var' && s.n > 1 ? ` · média ${C.brl(s.avg3)} (de ${C.brl(s.min)} a ${C.brl(s.max)})` : r.kind === 'var' && s.n ? (r.type === 'rec' ? ' · 1 mês recebido' : ' · 1 mês pago') : r.kind === 'var' ? ' · estimativa' : ''}</small></span>
      <span class="num ${r.type === 'rec' ? 'pos' : ''}">${r.kind === 'var' ? '≈ ' : ''}${C.brl(est)}</span></li>`; };
  const block = (title, list, hint) => list.length ? `<div class="card"><h2>${title} <span class="hint">(${list.length})</span></h2>${hint ? `<p class="hint">${hint}</p>` : ''}<ul class="list wrap">${list.map(row).join('')}</ul></div>` : '';
  const sug = C.detectRecurring(st, today), subs = C.detectSubs(st, today), allSug = [...sug, ...subs];
  const P = C.parcelSummary(st, today);
  const head = `<div class="kpis two"><div class="kpi"><small>Saídas fixas e variáveis / mês</small><b class="num neg">${C.brl(sum(out))}</b></div><div class="kpi"><small>Entradas fixas e variáveis / mês</small><b class="num pos">${C.brl(sum(inc))}</b></div></div>`;
  let html = `<div class="newrow"><button class="btn" id="fx-new">+ Despesa que se repete</button><button class="btn" id="fx-new-rec">+ Receita que se repete</button><button class="btn" id="fx-new-parc">+ Parcelado</button></div>`;
  html += '<div class="cgrid">' + jobsHTML(st);
  html += block('Despesas fixas', out.filter(x => x.r.kind === 'fixa'), 'Mesmo valor todo mês, sem data para acabar, até você encerrar.')
    + block('Despesas variáveis', out.filter(x => x.r.kind === 'var'), 'Sempre existem, mas o valor muda. O previsto é a média dos 3 últimos meses pagos.')
    + block('Receitas fixas', inc.filter(x => x.r.kind === 'fixa'), 'Mesmo valor todo mês, até você encerrar. A renda do emprego é corrigida pelo contracheque.')
    + block('Receitas variáveis', inc.filter(x => x.r.kind === 'var'), 'O previsto é a média dos 3 últimos meses recebidos.');
  if (!act.length) html += `<div class="card empty">Nenhuma conta fixa cadastrada.<br>Cadastre aqui ou, ao lançar, escolha a frequência "Fixa todo mês" ou "Todo mês, valor variável".</div>`;
  html += `<p class="hint">Fixa ou de valor variável (luz, comissão). Em "Parcelado" você escolhe se é despesa, compra no cartão ou receita em parcelas. Uma conta que já está nos lançamentos pode ser vinculada: abra o lançamento e toque em "Vincular a…".</p>`;
  if (subs.length) html += `<div class="card" id="subs-card"><h2>Parecem assinaturas no cartão <span class="hint">(${subs.length})</span></h2><p class="hint">Compras que se repetem na fatura ou têm nome de serviço por assinatura. Confirmando, viram conta fixa no cartão: os próximos meses ficam previstos nas faturas e entram em Resumo › Futuro.</p>
    <ul class="list wrap">${subs.map((x, i) => `<li><span class="t"><b>${esc(x.desc)}</b><small>${esc((accById(x.accountId) || {}).name || '')} · ${x.n > 1 ? `${x.n} faturas seguidas` : 'apareceu 1 vez'}${x.kind === 'var' ? ` · de ${C.brl(x.min)} a ${C.brl(x.max)}` : ''}</small></span>
      <span class="num">${x.kind === 'var' ? '≈ ' : ''}${C.brl(x.amount)}</span><span class="row"><button class="btn small" data-ign="${sug.length + i}">Não é</button><button class="btn small primary" data-sug="${sug.length + i}">É assinatura</button></span></li>`).join('')}</ul></div>`;
  if (sug.length) html += `<div class="card"><h2>Encontradas no seu histórico</h2><p class="hint">Aparecem quase todo mês nos últimos 6 meses. Cadastre para o app prever os próximos meses.</p>
    <ul class="list wrap">${sug.map((x, i) => `<li><span class="t"><b>${esc(x.desc || (itemById(x.itemId) || {}).name || '')}</b><small>${x.kind === 'fixa' ? 'fixa' : `variável, de ${C.brl(x.min)} a ${C.brl(x.max)}`} · ${x.n} dos últimos 6 meses · dia ~${x.day}${accById(x.accountId) ? ' · ' + esc(accById(x.accountId).name) : ''}</small></span>
      <span class="num">${x.kind === 'var' ? '≈ ' : ''}${C.brl(x.amount)}</span><span class="row"><button class="btn small" data-ign="${i}">Ignorar</button><button class="btn small primary" data-sug="${i}">Cadastrar</button></span></li>`).join('')}</ul></div>`;
  html += `<div class="card"><h2>Parcelados <span class="hint">(${P.length})</span></h2>${P.length ? `<p class="hint">Faltam ${C.brl(P.reduce((s, p) => s + p.rest, 0))} no total. Parcelas "previstas" vêm de faturas importadas e são trocadas pelas reais quando a fatura seguinte chega.</p>
    <ul class="list wrap">${P.map(p => `<li data-dr="plan|${p.key}"><span class="t"><b>${esc(p.desc)}</b><small>${esc((accById(p.accountId) || {}).name || '')} · faltam ${p.open} de ${p.n} · ${C.brl(p.parcel)} por mês · até ${shortM(p.until)}${p.prev ? ` · ${p.prev} prevista(s)` : ''}</small></span><span class="num">${C.brl(p.rest)}</span></li>`).join('')}</ul>`
    : '<p class="hint">Nenhuma compra parcelada em aberto. Ao lançar, escolha "Parcelada" (até 36x, no cartão ou na conta); ao importar uma fatura, as parcelas futuras entram como previstas.</p>'}</div>`;
  ui._sug = allSug;
  return { head, body: html + '</div>' };
}

function recSheet(id) {
  const st = S(), r = st.rec.find(x => x.id === id); if (!r) return;
  const s = C.recStats(st, r), est = M.recEstimate(st, r), cm = M.todayISO().slice(0, 7), ended = !!(r.end && r.end < cm);
  const nature = r.type === 'cred' ? 'credito' : 'debito', paidW = r.type === 'rec' ? 'recebidos' : 'pagos';
  openSheet('', panel => {
    panel.innerHTML = `<h2>${esc(r.desc)}</h2>
      <p class="hint">${r.kind === 'var' ? (s.n ? `Últimos ${s.n} meses ${paidW}: média dos 3 últimos ${C.brl(s.avg3)}, menor ${C.brl(s.min)}, maior ${C.brl(s.max)}, último ${C.brl(s.last)}.` : `Ainda sem meses ${paidW}: usa a estimativa abaixo.`) + ` Previsto para os próximos meses: <b>${C.brl(est)}</b>.` : `Fixa: ${C.brl(r.amount)} todo mês.`}
        Desde ${shortM(r.start)}${r.end ? `, ${ended ? 'encerrada em' : 'até'} ${shortM(r.end)}` : ', sem data para acabar'}.</p>
      ${(r.keys || []).length ? `<p class="hint">No extrato, é reconhecida por: <b>${r.keys.map(esc).join('</b>, <b>')}</b>. <button type="button" class="link" id="rc-forget">Esquecer</button></p>` : `<p class="hint">Para o app reconhecer sozinho no extrato: ao importar, escolha esta conta na linha do ${r.type === 'rec' ? 'crédito' : 'pagamento'}; ou abra um lançamento já importado e toque em "Vincular a…". O app guarda o nome que o banco usa, mesmo quando o valor muda.</p>`}
      <button type="button" class="link" data-dr="rec|${r.id}">Ver os lançamentos de todos os meses ›</button>
      <label for="rc-desc">Descrição</label><input id="rc-desc" value="${esc(r.desc)}">
      <p class="hint">Pode dar o nome que quiser: o app continua reconhecendo pelo nome que vem do banco, que fica guardado em cada lançamento.</p>
      <div class="seg small" id="rc-kind"><button type="button" data-k="fixa" aria-pressed="${r.kind === 'fixa'}">Fixa</button><button type="button" data-k="var" aria-pressed="${r.kind === 'var'}">Valor variável</button></div>
      <div class="grid2"><div><label for="rc-val" id="rc-vallbl">${r.kind === 'var' ? 'Estimativa (R$)' : 'Valor (R$)'}</label><input id="rc-val" inputmode="decimal" value="${moneyText(r.amount)}"></div>
        <div><label for="rc-day">Dia do mês</label><input id="rc-day" type="number" inputmode="numeric" min="1" max="31" value="${r.day}"></div></div>
      <label for="rc-item">Categoria</label><select id="rc-item">${optItems(r.type === 'rec' ? 'receita' : 'despesa', r.itemId)}</select>
      <label for="rc-acc">${nature === 'credito' ? 'Cartão' : 'Conta'}</label><select id="rc-acc">${optAccounts(nature, r.accountId)}</select>
      ${r.type !== 'cred' ? `<label for="rc-person">${r.type === 'rec' ? 'Quem paga' : 'Para quem (para pagar com Pix)'}</label><select id="rc-person"><option value="">—</option>${(st.people || []).map(p => `<option value="${p.id}" ${p.id === r.person ? 'selected' : ''}>${esc(p.name)}${p.pixKey ? '' : ' (sem chave Pix)'}</option>`).join('')}</select>` : ''}
      <p class="hint">Salvar muda este mês e os próximos que ainda não foram ${paidW}.</p>
      <div class="actions wrap"><button class="btn danger" id="rc-del">Excluir</button>${ended || r.end ? '<button class="btn" id="rc-open">Reativar</button>' : '<button class="btn" id="rc-end">Encerrar</button>'}<button class="btn" id="rc-c">Cancelar</button><button class="btn primary" id="rc-ok">Salvar</button></div>`;
    let kind = r.kind;
    if (panel.querySelector('#rc-forget')) panel.querySelector('#rc-forget').onclick = async () => { await sync.commit(st2 => { const x = st2.rec.find(y => y.id === id); if (x) { delete x.keys; delete x.words; M.touch(x); } }); toast('Nome do banco esquecido: o app volta a reconhecer só pelo valor e pela descrição.'); recSheet(id); };
    panel.querySelector('#rc-kind').onclick = e => { const b = e.target.closest('[data-k]'); if (!b) return; kind = b.dataset.k; panel.querySelectorAll('#rc-kind [data-k]').forEach(x => x.setAttribute('aria-pressed', x === b)); panel.querySelector('#rc-vallbl').textContent = kind === 'var' ? 'Estimativa (R$)' : 'Valor (R$)'; };
    panel.querySelector('#rc-c').onclick = closeSheet;
    panel.querySelector('#rc-ok').onclick = async () => {
      const f = { kind, desc: panel.querySelector('#rc-desc').value.trim() || r.desc, amount: C.parseMoney(panel.querySelector('#rc-val').value), day: Math.min(31, Math.max(1, +panel.querySelector('#rc-day').value || r.day)),
        itemId: panel.querySelector('#rc-item').value, accountId: panel.querySelector('#rc-acc').value };
      if (panel.querySelector('#rc-person')) f.person = panel.querySelector('#rc-person').value;
      if (!(f.amount > 0)) return toast('Informe um valor maior que zero.', true);
      let n = 0;
      await sync.commit(s => { const x = s.rec.find(y => y.id === id); if (x) {
        const renamed = f.desc !== x.desc; if (renamed && !x.words) x.words = M.normDesc(x.desc); // o nome antigo continua valendo para reconhecer as importações
        n = M.editRec(s, x, f, cm); if (renamed) M.renameRecHistory(s, x, f.desc); M.ensureRecurring(s); } });
      closeSheet(); render(); toast(n ? `Salvo. ${n} mês(es) em aberto atualizados.` : 'Salvo.');
    };
    if (panel.querySelector('#rc-end')) panel.querySelector('#rc-end').onclick = async () => {
      const ch = await askChoice('Encerrar', `Qual foi o último mês de ${r.desc}? Os meses seguintes ainda em aberto são apagados; os já ${paidW} ficam.`, [{ label: `Este mês (${shortM(cm)})`, value: cm }, { label: `O mês passado (${shortM(C.mAdd(cm, -1))})`, value: C.mAdd(cm, -1) }, { label: `O mês que vem (${shortM(C.mAdd(cm, 1))})`, value: C.mAdd(cm, 1) }]);
      if (!ch) return;
      let n = 0; await sync.commit(s => { const x = s.rec.find(y => y.id === id); if (x) n = M.endRec(s, x, ch); });
      closeSheet(); render(); toast(`Encerrada em ${shortM(ch)}.${n ? ` ${n} mês(es) futuros apagados.` : ''}`);
    };
    if (panel.querySelector('#rc-open')) panel.querySelector('#rc-open').onclick = async () => {
      await sync.commit(s => { const x = s.rec.find(y => y.id === id); if (x) { M.reopenRec(s, x); M.ensureRecurring(s); } });
      closeSheet(); render(); toast('Reativada: os próximos meses voltaram para a Agenda.');
    };
    panel.querySelector('#rc-del').onclick = async () => {
      if (!(await confirmBox(`Excluir "${r.desc}"? Os meses em aberto são apagados; os já ${paidW} continuam como lançamentos comuns.`))) return;
      await sync.commit(s => { const x = s.rec.find(y => y.id === id); if (x) M.removeRec(s, x); });
      closeSheet(); render(); toast('Excluída.');
    };
  });
}

async function adoptSuggestion(x) {
  const lastDate = x.txIds.map(id => (S().tx.find(t => t.id === id) || {}).date || '').sort().pop() || M.todayISO();
  await sync.commit(s => {
    const r = M.newRec({ kind: x.kind, type: x.type, desc: x.desc || (itemById(x.itemId) || {}).name || '', itemId: x.itemId, accountId: x.accountId, amount: x.amount, day: x.day, start: C.mAdd(lastDate.slice(0, 7), 1) });
    r.words = M.normDesc(x.desc); s.rec.push(r); M.linkToRec(s, r, x.txIds); M.ensureRecurring(s);
  });
  render(); toast(x.sub ? `${x.desc} cadastrada como assinatura.` : `${x.desc || 'Conta'} cadastrada como ${x.kind === 'fixa' ? 'fixa' : 'variável'}.`);
}
async function ignoreSuggestion(x) {
  await sync.commit(s => { s.config.recIgnore = [...new Set([...(s.config.recIgnore || []), x.key])]; s.config.upd = Date.now(); });
  render();
}
/* cria os meses que faltam das contas que se repetem (ao abrir e quando chegam dados de outro aparelho) */
let recBusy = false;
async function keepRecurring() {
  const st = S(); if (recBusy || !st || !st.config.setupDone) return;
  if (!H.maintain(st, M.todayISO(), true) && !PH.syncReimb(st, M.todayISO(), true)) return;
  recBusy = true;
  try { await sync.commit(s => { H.maintain(s); PH.syncReimb(s); }); } finally { recBusy = false; }
}

/* ----- pessoas e Pix ----- */
const personOf = (id, name) => (S().people || []).find(p => p.id === id) || (name ? (S().people || []).find(p => M.normDesc(p.name) === M.normDesc(name)) : null);
function payeeOf(t) {
  if (t.loanId) { const l = S().loans.find(x => x.id === t.loanId); return l && l.dir === 'out' ? personOf(l.personId, l.person) : null; }
  if (t.recId && t.type === 'deb') { const r = (S().rec || []).find(x => x.id === t.recId); return r && r.person ? personOf(r.person) : null; }
  return null;
}
function peopleHTML(st) {
  const P = (st.people || []).slice().sort((a, b) => a.name.localeCompare(b.name));
  return `<div class="card"><h2>Pessoas e chaves Pix</h2><p class="hint">Com a chave Pix cadastrada, as parcelas que você deve ganham o botão "Pix": o app gera o código Pix Copia e Cola com o valor; no app do banco é só colar e confirmar.</p>
    ${P.length ? `<ul class="list wrap">${P.map(p => { const k = PX.normalizeKey(p.pixKey); return `<li data-person="${p.id}"><span class="t"><b>${esc(p.name)}</b><small>${k ? k.label + ': ' + esc(p.pixKey) : p.pixKey ? '<span class="neg">chave Pix não reconhecida</span>' : 'sem chave Pix'}</small></span></li>`; }).join('')}</ul>` : '<p class="hint">Ninguém cadastrado. Quem você coloca numa dívida entra aqui automaticamente.</p>'}
    <button class="link" id="pp-new">+ Pessoa</button></div>`;
}
function personForm(p) {
  openSheet('', panel => {
    panel.innerHTML = `<h2>${p ? 'Editar pessoa' : 'Nova pessoa'}</h2>
      <label for="pp-name">Nome</label><input id="pp-name" value="${p ? esc(p.name) : ''}" autocomplete="off">
      <label for="pp-key">Chave Pix (opcional)</label><input id="pp-key" value="${p ? esc(p.pixKey) : ''}" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="CPF, CNPJ, celular, e-mail ou chave aleatória">
      <p class="hint" id="pp-kind"></p>
      <label for="pp-city">Cidade de quem recebe (opcional)</label><input id="pp-city" value="${p ? esc(p.city) : ''}" placeholder="Se não souber, deixe em branco">
      <div class="actions wrap">${p ? '<button class="btn danger" id="pp-del">Excluir</button>' : ''}${p && p.pixKey ? '<button class="btn" id="pp-pix">Gerar Pix</button>' : ''}<button class="btn" id="pp-c">Cancelar</button><button class="btn primary" id="pp-ok">Salvar</button></div>`;
    const kind = () => { const v = panel.querySelector('#pp-key').value, k = PX.normalizeKey(v); panel.querySelector('#pp-kind').innerHTML = !v.trim() ? '' : k ? `Reconhecida como <b>${k.label}</b>: ${esc(k.key)}` : '<span class="neg">Não parece uma chave Pix válida. Confira os números (CPF e CNPJ têm dígito verificador) ou use o celular com DDD.</span>'; };
    panel.querySelector('#pp-key').oninput = kind; kind();
    panel.querySelector('#pp-c').onclick = closeSheet;
    if (p && p.pixKey) panel.querySelector('#pp-pix').onclick = () => pixSheet(p, 0);
    if (p) panel.querySelector('#pp-del').onclick = async () => {
      if (!(await confirmBox(`Excluir ${p.name}? As dívidas continuam, só sem a chave Pix.`))) return;
      await sync.commit(s => M.removeRecord(s, 'people', p.id)); closeSheet(); render();
    };
    panel.querySelector('#pp-ok').onclick = async () => {
      const name = panel.querySelector('#pp-name').value.trim(), pixKey = panel.querySelector('#pp-key').value.trim(), city = panel.querySelector('#pp-city').value.trim();
      if (!name) return toast('Informe o nome.', true);
      if (pixKey && !PX.normalizeKey(pixKey)) return toast('A chave Pix não foi reconhecida.', true);
      await sync.commit(s => { if (p) { const x = s.people.find(y => y.id === p.id); if (x) { Object.assign(x, { name, pixKey, city }); M.touch(x); } } else s.people.push(M.newPerson({ name, pixKey, city })); });
      closeSheet(); render(); toast('Salvo.');
    };
  });
}
/* tela do Pix: valor, código Copia e Cola e, se veio de uma parcela, marcar como paga */
function pixSheet(person, amount, txId) {
  const k = PX.normalizeKey(person.pixKey); if (!k) return toast('A chave Pix desta pessoa não foi reconhecida. Corrija em Agenda › Dívidas e Pix.', true);
  openSheet('', panel => {
    const code = () => PX.payload({ key: k.key, name: person.name, city: person.city, amount: C.parseMoney(panel.querySelector('#px-val').value), msg: panel.querySelector('#px-msg').value });
    panel.innerHTML = `<h2>Pix para ${esc(person.name)}</h2><p class="hint">${k.label}: ${esc(k.key)}</p>
      <div class="grid2"><div><label for="px-val">Valor (R$)</label><input id="px-val" inputmode="decimal" value="${amount ? moneyText(amount) : ''}" placeholder="0,00"></div>
        <div><label for="px-msg">Mensagem (opcional)</label><input id="px-msg" maxlength="40" placeholder="Ex.: parcela 3"></div></div>
      <button class="btn primary block" id="px-copy">Copiar código Pix</button>
      <p class="hint">Depois de copiar: abra o app do banco › <b>Pix</b> › <b>Pix Copia e Cola</b>, cole, confira o nome e o valor e confirme. Muitos bancos já reconhecem o código copiado ao abrir.</p>
      <details><summary class="hint">Ver o código</summary><textarea id="px-code" readonly rows="4"></textarea></details>
      <div class="actions">${txId ? '<button class="btn" id="px-paid">Já paguei: marcar como pago</button>' : ''}<button class="btn" id="px-c">Fechar</button></div>`;
    const upd = () => { panel.querySelector('#px-code').value = code(); };
    panel.oninput = upd; upd();
    panel.querySelector('#px-c').onclick = closeSheet;
    panel.querySelector('#px-copy').onclick = async () => {
      if (!(C.parseMoney(panel.querySelector('#px-val').value) > 0) && !(await confirmBox('Sem valor, quem paga digita o valor no banco. Copiar assim mesmo?'))) return;
      const c = code(); let ok = false;
      try { await navigator.clipboard.writeText(c); ok = true; } catch { const ta = panel.querySelector('#px-code'); panel.querySelector('details').open = true; ta.select(); try { ok = document.execCommand('copy'); } catch { ok = false; } }
      toast(ok ? 'Código Pix copiado. Abra o app do banco › Pix Copia e Cola.' : 'Não deu para copiar sozinho: toque no código, selecione e copie.', !ok);
    };
    if (txId) panel.querySelector('#px-paid').onclick = async () => {
      await sync.commit(s => { const x = s.tx.find(y => y.id === txId); if (x) { x.status = 'liq'; x.date = M.todayISO(); x.amount = C.parseMoney(panel.querySelector('#px-val').value) || x.amount; delete x.prev; M.touch(x); } });
      closeSheet(); render(); toast('Marcado como pago.');
    };
  });
}

/* ----- planilha de parcelamentos: parcelas futuras como previstas ----- */
function parcelSheet(text, fileName) {
  let data;
  try { data = PP.parse(text); } catch (e) { return toast(e.message, true); }
  if (!data.rows.length) return toast('A planilha não tem linhas válidas.', true);
  const st = S(), cards = st.accounts.filter(a => a.nature === 'credito' && a.active !== false);
  const labels = [...new Set(data.rows.map(r => r.card))];
  const guess = l => { const n = M.normDesc(l); const c = cards.find(a => M.normDesc(a.name) === n) || cards.find(a => { const x = M.normDesc(a.name); return x && (n.includes(x) || x.includes(n)); }); return c ? c.id : ''; };
  const map = Object.fromEntries(labels.map(l => [l, guess(l)]));
  // por padrão começa depois da última fatura que já tem lançamentos (evita repetir o que já está numa fatura lançada à mão)
  const defFrom = (label, cardId) => {
    const base = data.rows.filter(r => r.card === label).map(r => C.mAdd(r.comp, 1)).sort()[0];
    const last = S().tx.filter(t => t.accountId === cardId && t.type === 'cred' && !t.prev).map(t => C.txComp(S(), t)).sort().pop();
    return last && C.mAdd(last, 1) > base ? C.mAdd(last, 1) : base;
  };
  const from = {}; labels.forEach(l => { if (map[l]) from[l] = defFrom(l, map[l]); });
  openSheet('', panel => {
    panel.classList.add('wide');
    const draw = () => {
      let total = 0, count = 0;
      const blocks = labels.map(l => {
        const rows = data.rows.filter(r => r.card === l), cardId = map[l];
        const items = rows.map(r => ({ r, p: cardId ? PP.pending(r, from[l]) : [] }));
        const n = items.reduce((s, x) => s + x.p.length, 0), v = items.reduce((s, x) => s + x.p.length * x.r.amount, 0);
        const skippedEarly = cardId ? rows.reduce((s, r) => s + (PP.pending(r).length - PP.pending(r, from[l]).length), 0) : 0;
        total += v; count += n;
        return `<div class="card inset"><div class="grid2"><div><label>Cartão "${esc(l)}" no app</label><select data-map="${esc(l)}"><option value="">Não lançar</option>${cards.map(c => `<option value="${c.id}" ${c.id === cardId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
          ${cardId ? `<div><label>A partir da fatura de</label><input type="month" data-from="${esc(l)}" value="${from[l] || ''}"></div>` : '<div></div>'}</div>
          ${cardId ? `<p class="hint">${n} parcela(s), ${C.brl(v)}${skippedEarly ? ` · ${skippedEarly} de faturas anteriores a ${shortM(from[l])} ficam de fora` : ''}</p>` : !cards.length ? '<p class="warn">Cadastre o cartão em Contas antes.</p>' : '<p class="hint">Escolha o cartão para lançar estas parcelas.</p>'}
          <ul class="list">${items.map(({ r, p }) => `<li><span class="t"><b>${esc(r.desc)}</b><small>${C.fmtD(r.date)}/${r.date.slice(2, 4)} · parcela ${r.i} de ${r.n} na fatura de ${shortM(r.comp)}${p.length ? ` · lança ${p.length}, até ${shortM(p[p.length - 1].comp)}` : ' · nada a lançar'}</small></span><span class="num">${C.brl(r.amount)}</span></li>`).join('')}</ul></div>`;
      }).join('');
      panel.innerHTML = `<h2>Parcelas a vencer</h2><p class="hint">${esc(fileName)}${data.errors.length ? ` · ${data.errors.length} linha(s) com problema ignorada(s) (linhas ${data.errors.slice(0, 5).join(', ')})` : ''}</p>
        <p class="hint">As parcelas entram como <b>previstas</b> nas faturas dos próximos meses. Quando você importar a fatura real, cada parcela prevista é trocada pela real, sem duplicar.</p>
        ${blocks}
        <div class="actions sticky"><button class="btn" id="pp-c">Cancelar</button><button class="btn primary" id="pp-go" ${count ? '' : 'disabled'}>Lançar ${count} · ${C.brl(total)}</button></div>`;
    };
    draw();
    panel.onchange = e => {
      if (e.target.dataset.map !== undefined) { const l = e.target.dataset.map; map[l] = e.target.value; if (map[l]) from[l] = defFrom(l, map[l]); return draw(); }
      if (e.target.dataset.from !== undefined) { from[e.target.dataset.from] = e.target.value; return draw(); }
    };
    panel.onclick = async e => {
      if (e.target.id === 'pp-c') return closeSheet();
      if (e.target.id !== 'pp-go') return;
      const fromById = {}; labels.forEach(l => { if (map[l]) fromById[map[l]] = from[l]; });
      let res = null;
      await sync.commit(s => { res = PP.apply(s, data.rows, map, fromById); });
      closeSheet(); ui.tab = 'agenda'; ui.agView = 'fix'; render();
      toast(`${res.created} parcela(s) prevista(s) lançada(s)${res.skipped ? ` · ${res.skipped} já existiam` : ''}.`);
    };
  });
}

function faturaSheet(cardId, comp) {
  const card = accById(cardId);
  comp = comp || C.cardCycle(card, M.todayISO()).comp;
  openSheet('', panel => {
    const f = C.faturaOf(S(), cardId, comp), paid = f.status === 'liq';
    const stTxt = paid ? (f.manual && f.paid < f.total - 0.005 ? '✓ Marcada como paga, sem pagamento registrado (não tira dinheiro da conta)' : '✓ Paga') : f.status === 'parc' ? `Paga em parte: ${C.brl(f.paid)} de ${C.brl(f.total)} · faltam ${C.brl(f.rest)}` : 'Ainda não paga';
    panel.innerHTML = `<h2>${esc(card.name)}</h2>
      <div class="month"><button data-c="-1" aria-label="Fatura anterior">‹</button><b>Fatura de ${C.monthLabel(comp).toLowerCase()}</b><button data-c="1" aria-label="Próxima fatura">›</button></div>
      <div class="kpis two"><div class="kpi"><small>Total</small><b class="num">${C.brl(f.total)}</b></div><div class="kpi"><small>Vencimento</small><b>${C.fmtD(f.date)}/${f.date.slice(0, 4)}</b></div></div>
      <p class="hint">${stTxt} · paga pela conta ${esc((accById(f.accountId) || {}).name || '—')}.</p>
      <div class="acts">${f.total > 0 && !paid ? '<button class="btn primary" id="fa-reg">Registrar pagamento</button>' : ''}
        <button class="btn" id="fa-imp">Importar</button><button class="btn" id="fa-new">+ Compra</button><button class="btn" id="fa-edit">Editar cartão</button></div>
      ${M.isSkipped(S(), cardId, comp) ? `<div class="card flat"><p class="hint"><b>O cartão não gerou esta fatura</b> (mudança de vencimento). As compras deste período, as parcelas e os pagamentos ficam na fatura de ${shortM(M.skipComp(S(), cardId, comp))}.</p><button class="btn small" id="fa-unskip">Desfazer: esta fatura existiu</button></div>`
        : (f.list.length && f.list.every(t => t.prev)) || (!f.list.length && f.payments.length) ? `<p class="hint">Só há parcelas previstas${f.payments.length ? ' e pagamentos' : ''} nesta fatura. Se o cartão mudou o vencimento e pulou este mês, <button class="link" id="fa-skip">avise que esta fatura não existiu</button>: tudo passa para a fatura seguinte.</p>` : ''}
      ${f.list.length && (f.manual || !paid) ? `<details class="more"><summary>${f.manual ? 'Fatura marcada como paga' : 'Já paguei e não quero registrar'}</summary>
        <p class="hint">"Registrar pagamento" tira o valor da conta (pode ser parcial). "Marcar paga sem registrar" não mexe no saldo: serve para faturas pagas antes de você começar a usar o app. Se o pagamento já está nos lançamentos como despesa (um Pix para o banco do cartão), abra-o e toque em "Vincular a…".</p>
        <button class="btn small" id="fa-pay">${f.manual ? 'Desmarcar paga' : 'Marcar paga sem registrar'}</button></details>` : ''}
      ${(() => { const bh = PH.byHolder(S(), cardId, comp); return bh.length > 1 || (bh[0] && bh[0].h) ? `<h3 class="sub">Por cartão</h3><ul class="list calc go">${bh.map(o => `<li data-dr="who|${comp}|${cardId}|${esc(o.ref || '')}" role="button"><span class="grow">${o.h ? esc(PH.label(o.h)) + (o.h.reimb ? ' <span class="tag who reimb">devolve</span>' : '') : 'Sem cartão cadastrado'} <small class="hint">(${o.n})</small></span><span class="num">${C.brl(o.total)}</span><span class="chev" aria-hidden="true">›</span></li>`).join('')}</ul>` : ''; })()}
      ${f.payments.length ? `<h3 class="sub">Pagamentos</h3><ul class="list">${f.payments.map(t => txRow(t, true)).join('')}</ul>` : ''}
      ${f.list.length ? `<h3 class="sub">Compras (${f.list.length})</h3><ul class="list">${f.list.map(t => txRow(t, true, true)).join('')}</ul>` : '<p class="empty">Nenhuma compra nesta fatura.<br>Toque em <b>Importar</b> para trazer o PDF ou o CSV da fatura.</p>'}`;
    panel.onclick = async e => {
      const b = e.target.closest('[data-c]'); if (b) { comp = C.mAdd(comp, +b.dataset.c); return faturaSheet(cardId, comp); }
      const li = e.target.closest('[data-tx]'); if (li) return txSheet(S().tx.find(t => t.id === li.dataset.tx));
      if (e.target.id === 'fa-edit') return accSheet(card);
      if (e.target.id === 'fa-new') return txSheet(null, { type: 'cred', accountId: cardId });
      if (e.target.id === 'fa-imp') { closeSheet(); return pickImportFile({ accountId: cardId }); }
      if (e.target.id === 'fa-reg') return payFaturaSheet(null, { cardId, comp });
      if (e.target.id === 'fa-skip' || e.target.id === 'fa-unskip') {
        const on = e.target.id === 'fa-skip';
        if (on && !(await confirmBox(`A fatura de ${shortM(comp)} do ${card.name} não existiu? As parcelas previstas e os pagamentos dela passam para a fatura seguinte, e as próximas parcelas andam um mês.`))) return;
        let r = null; await sync.commit(s => { r = L.skipFatura(s, cardId, comp, on); });
        if (!r.ok) return toast(r.error, true);
        toast(on ? `Pronto: tudo foi para a fatura de ${shortM(r.next)}.` : 'Desfeito.'); render();
        return faturaSheet(cardId, on ? r.next : comp);
      }
      if (e.target.id === 'fa-pay') {
        await sync.commit(s => { s.faturaMeta[f.key] = Object.assign({}, s.faturaMeta[f.key], { status: f.manual ? 'pend' : 'liq', upd: Date.now() }); });
        toast(f.manual ? 'Marcação desfeita.' : 'Fatura marcada como paga.');
        faturaSheet(cardId, comp);
      }
    };
  });
}

/* portadores do cartão: titular, adicionais e virtuais, e quem devolve o dinheiro */
function holderSheet(cardId, edit) {
  const st = S(), card = accById(cardId); if (!card) return;
  const hs = PH.holdersOf(card), unk = PH.unknownRefs(st, cardId), cm = M.skipComp(st, cardId, C.cardCycle(card, M.todayISO()).comp);
  const h = edit === undefined ? null : edit === '' ? { ref: '', name: '', kind: 'adicional', reimb: false } : (hs.find(x => x.ref === edit) || { ref: edit, name: '', kind: 'adicional', reimb: false });
  const months = Array.from({ length: 13 }, (_, i) => C.mAdd(cm, i - 12)).reverse();
  openSheet('', panel => {
    panel.innerHTML = h ? `<h2>${h.name ? esc(h.name) : 'Novo cartão de ' + esc(card.name)}</h2>
      <div class="grid2"><div><label for="h-ref">Final do cartão</label><input id="h-ref" inputmode="numeric" maxlength="4" value="${esc(h.ref)}" placeholder="0000"></div>
        <div><label for="h-kind">Tipo</label><select id="h-kind">${Object.keys(PH.KIND).map(k => `<option value="${k}" ${k === h.kind ? 'selected' : ''}>${k[0].toUpperCase() + k.slice(1)}</option>`).join('')}</select></div></div>
      <label for="h-name">Quem usa</label><input id="h-name" value="${esc(h.name)}" placeholder="Nome">
      <div class="seg small" id="h-reimb" style="margin-top:12px"><button type="button" data-r="0" aria-pressed="${!h.reimb}">É despesa minha</button><button type="button" data-r="1" aria-pressed="${!!h.reimb}">A pessoa me devolve</button></div>
      <p class="hint" id="h-hint"></p>
      <div id="h-sincebox"><label for="h-since">Cobrar a partir da fatura de</label><select id="h-since">${months.map(m => `<option value="${m}" ${m === (h.since || cm) ? 'selected' : ''}>${C.monthLabel(m)}</option>`).join('')}</select></div>
      <div class="actions">${hs.some(x => x.ref === h.ref) ? '<button class="btn danger" id="h-del">Excluir</button>' : ''}<button class="btn" id="h-back">Voltar</button><button class="btn primary" id="h-ok">Salvar</button></div>`
    : `<h2>Quem usa o ${esc(card.name)}</h2>
      <p class="hint">Cada compra da fatura vem com o final do cartão (titular, adicional ou virtual). Cadastrado o final, a compra ganha a marca de quem usou, além da categoria. Se a pessoa devolve o dinheiro, as compras dela saem das suas despesas e o app cria um "a receber" para cada fatura.</p>
      ${hs.length ? `<ul class="list wrap">${hs.map(x => `<li data-h="${x.ref}"><span class="t"><b>${esc(x.name)}</b><small>${x.kind} · final ${x.ref} · ${x.reimb ? 'devolve o dinheiro' + (x.since ? ' desde a fatura de ' + shortM(x.since) : '') : 'despesa sua'}</small></span><span aria-hidden="true">›</span></li>`).join('')}</ul>` : ''}
      ${unk.length ? `<h3 class="sub">Finais encontrados nas faturas, sem cadastro</h3><ul class="list">${unk.map(x => `<li data-h="${x.ref}" data-new="1"><span class="t"><b>Final ${x.ref}</b><small>${x.count} compra${x.count > 1 ? 's' : ''}</small></span><span class="link">Cadastrar</span></li>`).join('')}</ul>` : ''}
      <button class="btn block" id="h-new">+ Cartão de outra pessoa ou virtual</button>
      <div class="actions"><button class="btn" id="h-close">Fechar</button></div>`;
    if (!h) {
      panel.onclick = e => {
        const li = e.target.closest('[data-h]'); if (li) return holderSheet(cardId, li.dataset.h);
        if (e.target.id === 'h-new') return holderSheet(cardId, '');
        if (e.target.id === 'h-close') return accSheet(accById(cardId));
      };
      return;
    }
    let reimb = !!h.reimb;
    const upd = () => {
      panel.querySelectorAll('#h-reimb [data-r]').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.r === '1') === reimb)));
      panel.querySelector('#h-sincebox').hidden = !reimb;
      panel.querySelector('#h-hint').textContent = reimb ? 'As compras deste cartão não entram nas suas despesas. Para cada fatura, o valor que a pessoa gastou fica "a receber" na Agenda, no dia do vencimento. Quando o Pix dela chegar, abra o lançamento e toque em "Vincular a…".'
        : 'As compras deste cartão contam como despesa sua, com a categoria de cada uma, e ganham a marca de quem usou.';
    };
    upd();
    panel.querySelector('#h-reimb').onclick = e => { const b = e.target.closest('[data-r]'); if (b) { reimb = b.dataset.r === '1'; upd(); } };
    panel.querySelector('#h-back').onclick = () => holderSheet(cardId);
    if (panel.querySelector('#h-del')) panel.querySelector('#h-del').onclick = async () => {
      if (!(await confirmBox(`Excluir ${h.name} (final ${h.ref})? As compras continuam, só sem a marca de quem usou.${h.reimb ? ' Os "a receber" em aberto são apagados.' : ''}`))) return;
      await sync.commit(s2 => PH.removeHolder(s2, cardId, h.ref)); render(); holderSheet(cardId);
    };
    panel.querySelector('#h-ok').onclick = async () => {
      const ref = PH.refOf(panel.querySelector('#h-ref').value), name = panel.querySelector('#h-name').value.trim();
      if (!ref) return toast('Informe os 4 últimos números do cartão.', true);
      if (!name) return toast('Informe quem usa.', true);
      const old = hs.some(x => x.ref === h.ref) ? h.ref : '';
      let nh = null;
      await sync.commit(s2 => { nh = PH.setHolder(s2, cardId, { ref, name, kind: panel.querySelector('#h-kind').value, reimb, since: reimb ? panel.querySelector('#h-since').value : undefined }, old); });
      const n = S().tx.filter(t => t.type === 'cred' && t.accountId === cardId && PH.refOf(t.cardRef) === ref).length;
      render(); toast(`Salvo: ${n} compra${n === 1 ? '' : 's'} marcada${n === 1 ? '' : 's'} com ${name}.${nh && nh.reimb ? ' O "a receber" está na Agenda.' : ''}`);
      holderSheet(cardId);
    };
  });
}

function accSheet(acc, nature) {
  const invNew = !acc && nature === 'inv';
  nature = acc ? acc.nature : invNew ? 'debito' : nature;
  const credit = nature === 'credito', isInv = acc ? !!acc.inv : invNew;
  openSheet('', panel => {
    panel.innerHTML = `<h2>${acc ? esc(acc.name) : 'Nov' + (credit ? 'o cartão' : isInv ? 'a conta de investimento' : 'a conta')}</h2>
      ${acc && !credit ? saldoHTML(acc) : ''}
      ${acc && isInv ? '<button class="btn block" id="a-yield">Atualizar valor de hoje (registrar rendimento)</button>' : ''}
      ${acc ? `<h3 class="sub">${credit ? 'Dados do cartão' : 'Dados da conta'}</h3>` : ''}
      <label for="a-name">Nome</label><input id="a-name" value="${esc(acc ? acc.name : '')}" ${isInv && !acc ? 'placeholder="Ex.: Tesouro, CDB, corretora"' : ''}>
      ${credit ? `<div class="grid2"><div><label>Fecha no dia</label><input id="a-close" inputmode="numeric" value="${acc ? acc.closeDay : ''}"></div>
        <div><label>Vence no dia</label><input id="a-due" inputmode="numeric" value="${acc ? acc.dueDay : ''}"></div></div>
        <label>Fatura paga pela conta</label><select id="a-pay">${optAccounts('debito', acc && acc.payAccount)}</select>
        ${acc ? `<button type="button" class="opt" id="a-holders"><b>Quem usa este cartão${PH.holdersOf(acc).length ? ` (${PH.holdersOf(acc).length})` : ''}</b><small>${PH.holdersOf(acc).length ? PH.holdersOf(acc).map(h => esc(h.name) + ' ' + h.ref + (h.reimb ? ' (devolve)' : '')).join(' · ') : 'Titular, adicional e virtual: o app marca cada compra com quem usou e, se a pessoa devolve o dinheiro, cria o "a receber".'}${PH.unknownRefs(S(), acc.id).length ? ` · finais sem cadastro: ${PH.unknownRefs(S(), acc.id).map(x => x.ref).join(', ')}` : ''}</small></button>` : ''}`
        : `<div class="grid2"><div><label for="a-ini">${isInv ? 'Valor aplicado (R$)' : 'Saldo inicial (R$)'}</label><div class="pm"><input id="a-ini" inputmode="decimal" value="${acc ? moneyText(acc.initial) : ''}" placeholder="0,00"><button type="button" class="pmb" data-pm aria-label="Trocar sinal (positivo ou negativo)">±</button></div></div>
           <div><label for="a-inid">No fim do dia</label><input id="a-inid" type="date" value="${acc && acc.initialDate ? acc.initialDate : (acc ? '' : yesterday())}"></div></div>
           <p class="hint">Lançamentos até essa data já estão dentro do saldo inicial e não mudam o saldo. Sem data, todos os lançamentos contam.</p>
           <label class="check"><input type="checkbox" id="a-inv" ${isInv ? 'checked' : ''}> Conta de investimento (fica fora do "Saldo hoje"; mandar dinheiro para ela é transferência, não despesa)</label>`}
      <div class="actions">${acc ? `<button class="btn ${acc.active === false ? '' : 'danger'}" id="a-off">${acc.active === false ? 'Reativar' : 'Arquivar'}</button>` : ''}<button class="btn" id="a-cancel">Cancelar</button><button class="btn primary" id="a-save">Salvar</button></div>
      ${acc ? '<p class="hint">Arquivar esconde das listas, mas mantém os lançamentos antigos.</p>' : ''}`;
    panel.querySelector('#a-cancel').onclick = closeSheet;
    if (panel.querySelector('#a-yield')) panel.querySelector('#a-yield').onclick = () => yieldSheet(acc);
    if (panel.querySelector('#a-holders')) panel.querySelector('#a-holders').onclick = () => holderSheet(acc.id);
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
      } else { f.initial = C.parseMoney(panel.querySelector('#a-ini').value); f.initialDate = panel.querySelector('#a-inid').value || undefined; f.inv = panel.querySelector('#a-inv').checked; }
      await sync.commit(s => {
        if (acc) { const a = s.accounts.find(x => x.id === acc.id); Object.assign(a, f); if (!f.inv) delete a.inv; M.touch(a); }
        else s.accounts.push(M.newAccount(f));
      });
      closeSheet(); toast('Salvo.');
    };
  });
}
/* investimento: informa quanto vale hoje; a diferença para o saldo calculado vira rendimento (ou perda) */
function yieldSheet(acc) {
  const today = M.todayISO(), cur = C.balances(S(), today, true)[acc.id] || 0;
  openSheet(`<h2>${esc(acc.name)}: valor de hoje</h2>
    <p class="hint">Pelo app, esta conta tem <b class="num">${C.brl(cur)}</b> (valor aplicado + aportes − resgates + rendimentos já registrados). Digite quanto o banco ou a corretora mostra hoje: a diferença é registrada como rendimento, sem entrar nas receitas do mês.</p>
    <label for="y-val">Valor de hoje (R$)</label><input id="y-val" inputmode="decimal" placeholder="0,00">
    <p class="hint" id="y-prev"></p>
    <div class="actions"><button class="btn" id="y-cancel">Cancelar</button><button class="btn primary" id="y-save">Registrar</button></div>`, panel => {
    const diff = () => C.r2(C.parseMoney(panel.querySelector('#y-val').value) - cur);
    panel.oninput = () => { const v = panel.querySelector('#y-val').value, d = diff(); panel.querySelector('#y-prev').textContent = !v ? '' : d === 0 ? 'Igual ao valor do app: nada a registrar.' : d > 0 ? `Rendimento de ${C.brl(d)}.` : `Perda de valor de ${C.brl(-d)}.`; };
    panel.querySelector('#y-cancel').onclick = () => accSheet(accById(acc.id));
    panel.querySelector('#y-save').onclick = async () => {
      const d = diff(); if (!panel.querySelector('#y-val').value) return toast('Informe o valor de hoje.', true);
      if (d === 0) return toast('Igual ao valor do app: nada a registrar.');
      const nm = x => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const it = S().items.find(i => nm(i.name) === 'rendimentos de aplicacoes');
      await sync.commit(s => { s.tx.push(M.newYield({ date: today, accountId: acc.id, diff: d, itemId: d > 0 && it ? it.id : '' })); });
      closeSheet(); toast(d > 0 ? `Rendimento de ${C.brl(d)} registrado.` : `Perda de ${C.brl(-d)} registrada.`);
    };
    setTimeout(() => { const v = panel.querySelector('#y-val'); if (v) v.focus(); }, 50);
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
      return `<div class="card"><div class="ghead" data-g="${g.id}"><span class="sw" style="background:${col(g.color)}"></span><b class="grow">${esc(g.name)}</b><span class="hint">${items.length}</span></div>
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

/* tutorial de primeiro uso: poucas telas, uma ideia por tela; aparece ao terminar a configuração e em Ajustes › Ajuda */
function tourSheet() {
  const old = document.querySelector('.sheet.tour'); if (old) old.remove();
  const box = document.createElement('div'); box.className = 'sheet ask tour'; let i = 0;
  const art = k => k === 'ola' ? '<img src="icons/icon-192.png?v=3" alt="">' : (QI[k] || ICON[k] || QI.plus);
  const draw = () => { const s = TOUR[i], last = i === TOUR.length - 1;
    box.innerHTML = `<div class="panel" role="dialog" aria-modal="true" aria-label="Tutorial"><div class="tart">${art(s.icon)}</div>
      <h2>${s.title}</h2><p>${s.text}</p>
      <div class="steps">${TOUR.map((_, k) => `<i class="${k <= i ? 'on' : ''}"></i>`).join('')}</div>
      <div class="actions">${last ? '' : '<button class="btn ghost" data-tour="skip">Pular</button>'}${i ? '<button class="btn" data-tour="back">Voltar</button>' : ''}<button class="btn primary" data-tour="${last ? 'skip' : 'next'}">${last ? 'Começar a usar' : 'Próximo'}</button></div></div>`; };
  draw(); document.body.appendChild(box);
  box.onclick = e => {
    const b = e.target.closest('[data-tour]'); if (!b) { if (e.target === box) box.remove(); return; }
    if (b.dataset.tour === 'skip') return box.remove();
    i += b.dataset.tour === 'back' ? -1 : 1; draw();
  };
}
function pageAjuda() {
  $('#page').innerHTML = `<div class="card"><h2>Guia de uso</h2><p class="hint">Toque numa pergunta para abrir a resposta.</p>
      <div class="row"><button class="btn small" id="hp-tour">Ver o tutorial de 1 minuto</button><a class="btn small" href="privacidade.html">Política de privacidade</a></div></div>
    <div class="cgrid">${GUIDE.map(([t, qs]) => `<div class="card"><h2>${t}</h2>${qs.map(([q, a]) => `<details class="faq"><summary>${q}</summary><p>${a}</p></details>`).join('')}</div>`).join('')}</div>`;
  $('#page').onclick = e => { if (e.target.id === 'hp-tour') tourSheet(); };
}

/* aparência: claro, escuro ou automático, e o estilo visual (cores, letra e cantos). Vale só para o aparelho. */
const LOOKS = [
  { k: 'mare', name: 'Maré', hint: 'petróleo e coral', h: '#0c4a5f', b: '#eff4f6', c: '#ff8562', f: 'Nunito', r: '4px' },
  { k: 'mata', name: 'Mata', hint: 'verde e limão', h: '#0b5d4a', b: '#f1f5f1', c: '#c8f25c', f: 'Figtree', r: '5px' },
  { k: 'ameixa', name: 'Ameixa', hint: 'roxo e damasco', h: '#4b2170', b: '#f6f2f8', c: '#ffb24d', f: 'Plus Jakarta Sans', r: '8px' }
];
function lookCardHTML() {
  const t = window.FIN_THEME.get();
  return `<div class="card" id="look-card"><h2>Aparência</h2>
    <div class="seg" id="th-mode">${[['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Escuro']].map(([k, l]) => `<button data-thm="${k}" aria-pressed="${t.mode === k}">${l}</button>`).join('')}</div>
    <p class="hint">${t.mode === 'auto' ? 'Automático: acompanha o modo claro ou escuro do aparelho.' : t.mode === 'dark' ? 'Sempre escuro, mesmo com o aparelho no modo claro.' : 'Sempre claro, mesmo com o aparelho no modo escuro.'}</p>
    <div class="looks">${LOOKS.map(o => `<button class="look" data-look="${o.k}" aria-pressed="${t.style === o.k}" style="--ph:${o.h};--pb:${o.b};--pc:${o.c};--pk:#fff;--pr:${o.r};--pf:'${o.f}',sans-serif"><span class="pv"><u></u><i></i></span>${o.name}<small>${o.hint}</small></button>`).join('')}</div>
    <p class="hint">O estilo muda as cores, a letra e o formato dos botões. Vale só para este aparelho.</p></div>`;
}

function pageAjustes() {
  const st = S(), info = sync.syncInfo();
  const signed = auth.isSignedIn();
  $('#page').innerHTML = `<div class="cgrid">
    <div class="card"><h2>Conta Google</h2><p class="hint">${info.email ? `Dados guardados no Drive de <b>${esc(info.email)}</b>, pasta <b>${esc(drive.FOLDER)}</b>.` : (signed ? 'Conectado. Identificando a conta…' : 'Não conectado neste momento. Os dados continuam salvos neste aparelho.')}</p>
      <div id="syncBox">${syncBoxHTML()}</div>
      <div class="row"><button class="btn" data-act="sync">Sincronizar agora</button>${signed ? '' : '<button class="btn primary" data-act="reconnect">Reconectar</button>'}</div></div>
    ${lookCardHTML()}
    ${securityCardHTML()}
    <div class="card" id="cpf-card"><div class="chead"><h2>CPF para senha de PDF</h2>${st.profile.cpf6 ? '<span class="tag info">✓ cadastrado</span>' : '<span class="tag">não cadastrado</span>'}</div>
      <p class="hint">${st.profile.cpf6 ? 'Faturas e extratos em PDF protegidos pelos dígitos do CPF abrem sozinhos. O app guarda só os 6 primeiros dígitos.' : 'Muitos bancos protegem o PDF com os primeiros dígitos do CPF. Sem cadastro, o app pede a senha a cada arquivo.'}</p>
      <div class="row"><button class="btn" data-act="cpf">${st.profile.cpf6 ? 'Alterar' : 'Cadastrar'}</button>${st.profile.cpf6 ? '<button class="btn danger" data-act="cpfdel">Remover</button>' : ''}</div></div>
    <div class="card"><h2>Categorias</h2><p class="hint">${st.items.filter(i => i.active !== false).length} categorias em ${st.groups.length} grupos.</p>
      <button class="btn" data-act="cats">Gerenciar categorias</button></div>
    <div class="card"><h2>Backup</h2><p class="hint">Os dados já ficam no seu Drive. Este arquivo é uma cópia extra que você guarda onde quiser.</p>
      <div class="row"><button class="btn" data-act="export">Baixar backup</button><button class="btn" data-act="import">Importar backup</button></div></div>
    <div class="card"><h2>Exportar para planilha</h2><p class="hint">Lançamentos em CSV (abre no Excel, Numbers ou Google Planilhas): data, categoria, conta, valor com sinal, situação.</p>
      <div class="row"><select id="exp-y" style="flex:1">${expYears().map(y => `<option value="${y}">${y === 'all' ? 'Todos os lançamentos' : y}</option>`).join('')}</select><button class="btn" data-act="csv">Baixar CSV</button></div>
      <input type="file" id="impfile" accept=".json,application/json" hidden></div>
    <div class="card" id="help-card"><h2>Ajuda</h2><p class="hint">Como usar cada parte do app e o que é feito com os seus dados.</p>
      <div class="row"><button class="btn" data-act="guide">Guia de uso</button><button class="btn" data-act="tour">Ver o tutorial</button><a class="btn" href="privacidade.html">Política de privacidade</a></div></div>
    <div class="card"><h2>Este aparelho</h2><p class="hint">Sair desconecta o Google. Remover apaga a cópia deste aparelho; os dados continuam no Drive.</p>
      <div class="row"><button class="btn" data-act="logout">Sair</button><button class="btn danger" data-act="forget">Remover dados deste aparelho</button></div></div></div>
    <p class="hint" style="text-align:center">Níquel ${VERSION}</p>`;
  $('#impfile').onchange = ev => importFile(ev.target.files[0], false);
  bindSecurity();
  $('#page').onclick = async e => {
    const th = e.target.closest('[data-thm]'), lk = e.target.closest('[data-look]');
    if (th || lk) { const y = window.scrollY; window.FIN_THEME.set(th ? 'mode' : 'style', th ? th.dataset.thm : lk.dataset.look); pageAjustes(); window.scrollTo(0, y); return; }
    const b = e.target.closest('[data-act]'); if (!b) return;
    const a = b.dataset.act;
    if (['pin', 'lockoff', 'bio', 'bknow', 'bklist'].includes(a)) return securityAction(a);
    if (a === 'sync') { if (!auth.isSignedIn()) return reconnect(); sync.sync(); }
    if (a === 'reconnect') reconnect();
    if (a === 'cats') { ui.sub = 'cats'; render(); window.scrollTo(0, 0); }
    if (a === 'guide') { ui.sub = 'help'; render(); window.scrollTo(0, 0); }
    if (a === 'tour') tourSheet();
    if (a === 'cpf') cpfSheet();
    if (a === 'cpfdel') { if (await confirmBox('Remover o CPF? Faturas com senha vão pedir a senha.')) { await sync.commit(s => { s.profile = { cpf6: '', upd: Date.now() }; }); render(); } }
    if (a === 'export') exportBackup();
    if (a === 'csv') { const y = $('#exp-y').value; downloadFile(`financas-lancamentos-${y === 'all' ? 'todos' : y}.csv`, C.txCsv(S(), y === 'all' ? null : y + '-01-01', y === 'all' ? null : y + '-12-31'), 'text/csv;charset=utf-8'); toast('Planilha baixada.'); }
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

function expYears() {
  const ys = [...new Set(S().tx.map(t => t.date.slice(0, 4)))].sort().reverse();
  return [...(ys.length ? ys : [M.todayISO().slice(0, 4)]), 'all'];
}

function exportBackup() {
  const blob = new Blob([JSON.stringify(S(), null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'financas-backup-' + M.todayISO() + '.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/* troca todos os dados pelos de um backup (arquivo ou cópia do Drive); antes guarda no Drive uma cópia de como está */
async function restoreState(obj, what) {
  const st = M.importLegacy(obj);
  if (!(await confirmBox(`Substituir TODOS os dados atuais pelos de ${what} (${st.tx.length} lançamentos, ${st.accounts.length} contas/cartões)? Vale para todos os aparelhos. Antes, o app guarda no Drive uma cópia de como está agora.`))) return;
  try { await sync.backupNow('antes-de-restaurar'); } catch (e) { if (!(await confirmBox('Não deu para guardar a cópia de segurança antes (' + e.message + '). Restaurar mesmo assim?'))) return; }
  const cur = S(), t = Date.now();
  M.COLLS.forEach(k => (cur[k] || []).forEach(r => { if (!st[k].some(x => x.id === r.id)) st.deleted[r.id] = t; }));
  M.COLLS.forEach(k => st[k].forEach(r => { r.upd = t; delete st.deleted[r.id]; }));
  ['faturaMeta', 'rules', 'orc'].forEach(k => Object.values(st[k] || {}).forEach(v => { if (v && typeof v === 'object') v.upd = t; }));
  if (!st.profile.cpf6 && cur && cur.profile.cpf6) st.profile = cur.profile;
  st.profile.upd = st.config.upd = t;
  await sync.replace(st);
  toast('Dados restaurados.');
  render();
}

async function importFile(file, fromWizard) {
  if (!file) return;
  try {
    const obj = JSON.parse(await file.text());
    if (!fromWizard) return await restoreState(obj, 'este backup');
    const st = M.importLegacy(obj);
    if (!(await confirmBox(`Importar ${st.tx.length} lançamentos e ${st.accounts.length} contas/cartões?`))) return;
    if (!st.profile.cpf6 && S() && S().profile.cpf6) st.profile = S().profile;
    st.profile.upd = st.config.upd = Date.now();
    wz = null;
    await sync.replace(st);
    toast('Backup importado.');
    render();
  } catch (e) { toast(e.message.startsWith('Arquivo') ? e.message : 'Não foi possível ler o arquivo: ' + e.message, true); }
}

boot();
