/* Simulador de Google (login) e Google Drive para testes de navegador com Playwright.
   Nada sai da máquina: as chamadas ao Google são respondidas aqui. */
export function createDrive() {
  const files = {}; let seq = 0; const renewCalls = []; let renewMode = 'ok';
  const list = q => {
    if (!q) return [];
    const name = (q.match(/name='([^']+)'/) || [])[1], parent = (q.match(/'([^']+)' in parents/) || [])[1], folder = q.includes('folder');
    return Object.entries(files).filter(([, f]) => !f.trashed && (!name || f.name === name) && (!parent || f.parents.includes(parent)) && (folder ? f.mime.includes('folder') : true))
      .map(([id, f]) => ({ id, name: f.name, version: String(f.version), modifiedTime: 'x', createdTime: String(f.created), size: String(f.content.length) })).sort((a, b) => q.includes('in parents') && !name ? (a.name < b.name ? 1 : -1) : 0);
  };
  const data = () => Object.values(files).filter(f => f.name === 'financas-dados.json' && !f.trashed);
  async function attach(ctx, email = 'pessoa@exemplo.com') {
    await ctx.route('https://accounts.google.com/gsi/client', r => r.fulfill({ contentType: 'text/javascript', body: `window.google={accounts:{oauth2:{initTokenClient:o=>({requestAccessToken:()=>setTimeout(()=>o.callback({access_token:'tk',expires_in:3599}),10)})}}}` }));
    await ctx.route('https://oauth2.googleapis.com/**', r => r.fulfill({ status: 200, body: '' }));
    // login por redirecionamento (inclusive a renovação silenciosa, prompt=none): devolve à página com o acesso ou com erro
    await ctx.route('https://accounts.google.com/o/oauth2/v2/auth**', r => {
      const u = new URL(r.request().url()); renewCalls.push(u.searchParams.get('prompt'));
      const back = u.searchParams.get('redirect_uri') + '#' + (renewMode === 'ok' ? 'access_token=tk' + renewCalls.length + '&expires_in=3599&token_type=Bearer' : 'error=interaction_required') + '&state=' + u.searchParams.get('state');
      return r.fulfill({ status: 302, headers: { location: back } });
    });
    await ctx.route('https://www.googleapis.com/**', async r => {
      const u = new URL(r.request().url()), m = r.request().method(), path = u.pathname;
      if (path.endsWith('/about')) return r.fulfill({ json: { user: { emailAddress: email } } });
      if (m === 'GET' && path === '/drive/v3/files') return r.fulfill({ json: { files: list(u.searchParams.get('q')) } });
      if (m === 'POST' && path === '/drive/v3/files') { const md = JSON.parse(r.request().postData()); const id = 'F' + (++seq); files[id] = { name: md.name, mime: md.mimeType, parents: md.parents || [], version: 1, content: '', created: seq }; return r.fulfill({ json: { id } }); }
      const cp = path.match(/files\/(\w+)\/copy$/);
      if (cp && m === 'POST') { const md = JSON.parse(r.request().postData()), src = files[cp[1]]; const id = 'C' + (++seq); files[id] = { ...src, name: md.name, parents: md.parents, version: 1, created: seq, trashed: false }; return r.fulfill({ json: { id, name: md.name } }); }
      if (m === 'POST' && path === '/upload/drive/v3/files') {
        const body = r.request().postData(); const parts = body.split(/\r\n--fin\w+/);
        const md = JSON.parse(parts[0].split('\r\n\r\n')[1]); const content = parts[1].split('\r\n\r\n').slice(1).join('\r\n\r\n');
        const id = 'D' + (++seq); files[id] = { name: md.name, mime: md.mimeType, parents: md.parents, version: 1, content, created: seq }; return r.fulfill({ json: { id, version: '1' } });
      }
      const mm = path.match(/files\/(\w+)$/);
      if (mm && m === 'PATCH' && !path.startsWith('/upload')) { Object.assign(files[mm[1]], JSON.parse(r.request().postData())); return r.fulfill({ json: { id: mm[1] } }); }
      if (mm && m === 'PATCH') { const f = files[mm[1]]; f.content = r.request().postData(); f.version++; return r.fulfill({ json: { id: mm[1], version: String(f.version) } }); }
      if (mm && m === 'GET') {
        const f = files[mm[1]]; if (!f) return r.fulfill({ status: 404, json: { error: { message: 'not found' } } });
        if (u.searchParams.get('alt') === 'media') return r.fulfill({ contentType: 'application/json', body: f.content });
        return r.fulfill({ json: { id: mm[1], version: String(f.version), trashed: !!f.trashed } });
      }
      r.fulfill({ status: 400, body: '?' });
    });
  }
  const backups = () => Object.values(files).filter(f => /^financas-\d/.test(f.name) && !f.trashed);
  return { files, data, backups, renewCalls, setRenew: m => { renewMode = m; }, current: () => { const d = data()[0]; return d && JSON.parse(d.content); }, attach };
}

export async function newDevice(browser, devices, base, drive, label) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], serviceWorkers: 'allow' });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(label + ': ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(label + ' console: ' + m.text()); });
  page.on('dialog', d => d.accept());
  await drive.attach(ctx);
  await page.goto(base);
  return { ctx, page, errs };
}

/* primeiro acesso + assistente com uma conta e um cartão */
export async function setup(p, { cpf = '', card = true } = {}) {
  await p.click('#login'); await p.waitForSelector('#wz');
  await p.click('[data-wz=next]'); await p.fill('[data-f="acc.name"]', 'Conta Exemplo'); await p.fill('[data-f="acc.initial"]', '100');
  await p.click('[data-wz=next]');
  if (card) { await p.click('[data-wz=addcard]'); await p.fill('[data-f="card.name"]', 'Cartão Exemplo'); await p.fill('[data-f="card.closeDay"]', '25'); await p.fill('[data-f="card.dueDay"]', '10'); }
  await p.click('[data-wz=next]'); await p.click('[data-wz=next]');
  if (cpf) await p.fill('#cpf', cpf);
  await p.click('[data-wz=next]'); await p.click('[data-wz=finish]'); await p.waitForSelector('.tabs');
}
export const wait = ms => new Promise(r => setTimeout(r, ms));
