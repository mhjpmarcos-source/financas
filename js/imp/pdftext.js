/* Lê o texto de um PDF no próprio aparelho, com a posição de cada trecho, e remonta as linhas.
   Nada do arquivo sai do aparelho. Recebe a biblioteca pdf.js já carregada (navegador ou testes). */

export class PasswordNeeded extends Error { constructor(wrong) { super(wrong ? 'Senha incorreta.' : 'O PDF tem senha.'); this.wrong = wrong; } }

/* abre o PDF tentando, em ordem, as senhas da lista; depois pergunta (ask devolve a senha ou null) */
export async function openPdf(pdfjs, data, { tryPasswords = [], ask } = {}) {
  const attempt = password => pdfjs.getDocument({ data: data.slice(0), password, isEvalSupported: false, useSystemFonts: false }).promise;
  try { return await attempt(undefined); }
  catch (e) { if (e.name !== 'PasswordException') throw e; }
  for (const pw of tryPasswords) {
    try { return await attempt(pw); } catch (e) { if (e.name !== 'PasswordException') throw e; }
  }
  let wrong = tryPasswords.length > 0;
  while (ask) {
    const pw = await ask(wrong);
    if (pw == null || pw === '') throw new Error('Importação cancelada: o PDF precisa de senha.');
    try { return await attempt(pw); } catch (e) { if (e.name !== 'PasswordException') throw e; wrong = true; }
  }
  throw new PasswordNeeded(false);
}

/* linhas de cada página: [{ y, text, cells:[{x, x2, s}] }]; o texto junta trechos próximos e separa colunas com 3 espaços */
export async function pdfLines(doc) {
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const items = tc.items.filter(it => it.str && it.str.trim()).map(it => ({
      x: it.transform[4], y: it.transform[5], w: it.width, h: Math.abs(it.transform[3]) || it.height || 8, s: it.str
    }));
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    const rows = [];
    for (const it of items) {
      const tol = Math.max(2, it.h * 0.35);
      let row = rows.find(r => Math.abs(r.y - it.y) <= tol);
      if (!row) { row = { y: it.y, items: [] }; rows.push(row); }
      row.items.push(it);
    }
    rows.sort((a, b) => b.y - a.y);
    pages.push(rows.map(r => {
      r.items.sort((a, b) => a.x - b.x);
      const cells = [];
      for (const it of r.items) {
        const last = cells[cells.length - 1];
        const cw = it.s.length ? it.w / it.s.length : 4;
        if (last && it.x - last.x2 < Math.max(cw * 1.6, 4)) { last.s += (it.x - last.x2 > cw * 0.25 ? ' ' : '') + it.s; last.x2 = it.x + it.w; }
        else cells.push({ x: it.x, x2: it.x + it.w, s: it.s });
      }
      cells.forEach(c => { c.s = c.s.replace(/\s+/g, ' ').trim(); });
      return { y: r.y, h: Math.max(...r.items.map(i => i.h)), cells, text: cells.map(c => c.s).join('   ') };
    }));
  }
  return pages;
}
