/* Pix "Copia e Cola" (BR Code estático, padrão do Banco Central / EMV).
   Não existe link universal que abra o app de qualquer banco já preenchido; o caminho padrão é o código:
   o app copia, a pessoa abre o banco › Pix › Copia e Cola, confere e confirma. Nada passa por servidor. */

/* reconhece o tipo de chave e devolve no formato que o Pix exige */
export function normalizeKey(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return { type: 'aleatoria', key: s.toLowerCase(), label: 'Chave aleatória' };
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return { type: 'email', key: s.toLowerCase(), label: 'E-mail' };
  const d = s.replace(/\D/g, '');
  const phone = n => { const x = n.startsWith('55') && n.length >= 12 ? n : '55' + n; return x.length === 12 || x.length === 13 ? { type: 'telefone', key: '+' + x, label: 'Celular' } : null; };
  if (/^\+/.test(s) || /\(\d{2}\)/.test(s)) return phone(d);
  if (d.length === 11 && cpfOk(d)) return { type: 'cpf', key: d, label: 'CPF' };
  if (d.length === 14 && cnpjOk(d)) return { type: 'cnpj', key: d, label: 'CNPJ' };
  if (/^[\d\s().-]+$/.test(s) && (d.length === 10 || d.length === 11)) return phone(d);
  return null;
}
function cpfOk(d) {
  if (/^(\d)\1{10}$/.test(d)) return false;
  const dv = n => { let s = 0; for (let i = 0; i < n; i++) s += +d[i] * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return dv(9) === +d[9] && dv(10) === +d[10];
}
function cnpjOk(d) {
  if (/^(\d)\1{13}$/.test(d)) return false;
  const dv = n => { const w = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; const s = w.reduce((a, x, i) => a + x * +d[i], 0) % 11; return s < 2 ? 0 : 11 - s; };
  return dv(12) === +d[12] && dv(13) === +d[13];
}

const field = (id, v) => id + String(v.length).padStart(2, '0') + v;
/* nome e cidade: só letras sem acento, maiúsculas, tamanho máximo do padrão */
const clean = (s, max) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase().slice(0, max);

export function crc16(s) {
  let crc = 0xFFFF;
  for (let i = 0; i < s.length; i++) {
    crc ^= s.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/* key: chave já normalizada; amount em reais (opcional); msg: texto curto que aparece para quem recebe */
export function payload({ key, name, city, amount, msg, txid }) {
  const info = clean(msg, 40);
  const acc = field('00', 'br.gov.bcb.pix') + field('01', key) + (info ? field('02', info) : '');
  let p = field('00', '01') + field('26', acc) + field('52', '0000') + field('53', '986');
  if (amount > 0) p += field('54', (Math.round(amount * 100) / 100).toFixed(2));
  p += field('58', 'BR') + field('59', clean(name, 25) || 'RECEBEDOR') + field('60', clean(city, 15) || 'BRASIL');
  p += field('62', field('05', (String(txid || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 25)) || '***'));
  p += '6304';
  return p + crc16(p);
}
