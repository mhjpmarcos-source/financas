/* Sugere a categoria de cada linha importada:
   1) regra aprendida com as escolhas do próprio usuário (fica salva no Drive dele);
   2) lançamentos anteriores com o mesmo estabelecimento;
   3) dicionário de estabelecimentos e termos comuns no Brasil (mapeia para nomes do plano de contas padrão). */
import { norm } from './parse.js';

const STOP = new Set(['PIX', 'ENVIADO', 'RECEBIDO', 'AGENDADO', 'COMPRA', 'COM', 'CARTAO', 'PAGAMENTO', 'PAGTO', 'DE', 'DA', 'DO', 'BOLETO', 'CONTA', 'TED', 'DOC', 'TRANSF', 'TRANSFERENCIA', 'LTDA', 'SA', 'S', 'A', 'ME', 'EIRELI', 'BR', 'BRA', 'BRASIL']);
const PREFIX = /^(?:DL|IFD|IFOOD|MP|PG|PAG|EC|EBN|EBANX|KREDIT|CAPPTA|PICPAY|SUMUP|STONE|CIELO|GETNET|ASA|GLX|HNA|PAYPAL|MERCPAGO|SHPP|APPLE\.COM\/BILL)\s*\*\s*/;

/* chave do estabelecimento: tira prefixos de maquininha, cidade depois da vírgula, números e palavras genéricas */
export function merchantKey(desc) {
  let t = norm(desc).replace(/·/g, ' ');
  t = t.replace(/^(PIX (ENVIADO|RECEBIDO|AGENDADO)|PAGAMENTO DE BOLETO|COMPRA COM CARTAO)\s*/, '');
  t = t.replace(PREFIX, '').replace(/,.*$/, '').replace(/\s-\s.*$/, '');
  const words = t.replace(/[^A-Z ]+/g, ' ').split(/\s+/).filter(w => w.length > 1 && !STOP.has(w));
  return words.slice(0, 3).join(' ');
}

/* chave do nome que o banco usa num pagamento de fatura (com ou sem o prefixo que o app coloca) */
export const payKey = desc => merchantKey(String(desc || '').replace(/^Pagamento de fatura\s*·\s*/i, ''));

const DICT = [
  [/PANIFIC|PADARIA|\bPAES\b|PANIFICADORA|CONFEITARIA/, 'Padaria'],
  [/SUPERMERC|ATACAD|ASSAI|CARREFOUR|PAO DE ACUCAR|SAMS\b|SAM S|EXTRA HIPER|BIG BOMPRECO|COMERCIAL DE ALIMENTOS|HORTIFRUTI|SACOLAO|MERCADINHO|\bMERCADO\b(?! PAGO| LIVRE)|TARUMA|DIA BRASIL|GUANABARA|ZAFFARI|SONDA|COMPER|OBA HORT/, 'Mercado'],
  [/IFOOD|IFD\*|RAPPI|RESTAUR|LANCHON|CHURRASC|PIZZ|BURGER|MC ?DONALD|OUTBACK|SUBWAY|BK BRASIL|HABIB|SPOLETO|MADERO|COCO BAMBU|GIRAFFAS|BAR E |\bBAR\b|CHOPP|BOTEC|SUSHI|TEMAKI|COZINHA|GRILL|DELIVERY/, 'Restaurantes / Delivery'],
  [/CAFE|CAFETERIA|STARBUCKS|GELATERIA|SORVET|DOCERIA|LANCHE|PASTEL|BOLO|CACAU SHOW|KOPENHAGEN/, 'Lanches / Café'],
  [/DROGA|FARMA|RAIA|PAGUE MENOS|PANVEL|NISSEI|ARAUJO|VENANCIO/, 'Farmácia'],
  [/UBER|99APP|99 TAXI|99POP|CABIFY|INDRIVE|TAXI/, 'Aplicativos de transporte'],
  [/POSTO|COMBUST|SHELL|IPIRANGA|PETROBRAS|BR MANIA|ALE COMB|GASOLIN/, 'Combustível'],
  [/ESTACION|PARKING|ESTAPAR|ZONA AZUL|PEDAGIO|SEM PARAR|CONECTCAR|VELOE|TAG ?PASS|MOVE MAIS/, 'Estacionamento / Pedágio'],
  [/METRO|ONIBUS|BRT|BILHETE UNICO|CPTM|TRENS|VLT|TRANSPORTE PUBLICO/, 'Transporte público'],
  [/LATAM|GOL LINHAS|AZUL LINHAS|AZUL\b|DECOLAR|BOOKING|AIRBNB|HOTEL|POUSADA|HURB|123MILHAS|MAXMILHAS|SMILES|TAM\b/, 'Viagens'],
  [/NETFLIX|SPOTIFY|DEEZER|AMAZON PRIME|PRIME VIDEO|AMAZON MUSIC|DISNEY|HBO|MAX\b|GLOBOPLAY|YOUTUBE|APPLE\.COM|ICLOUD|GOOGLE ONE|PARAMOUNT|STAR\+|CRUNCHYROLL|ASSINATU|PRODUTOSUOL|UOL\b|FSP\b|ESTADAO|CLUBE/, 'Assinaturas / Streaming'],
  [/CINE|INGRESSO|TEATRO|SHOW|MUSEU|PARQUE|SYMPLA|EVENTIM|TICKET ?MASTER|MULTIPLEX|SESC/, 'Lazer / Passeios'],
  [/NEOENERGIA|\bCEB\b|ENEL|CEMIG|LIGHT\b|COPEL|CELESC|CPFL|COELBA|CELPE|EQUATORIAL|ENERGISA|ELEKTRO|ENERGIA|ELETRIC|CONTA LUZ|\bLUZ\b/, 'Energia'],
  [/CAESB|SABESP|CEDAE|COPASA|SANEPAR|EMBASA|COMPESA|CORSAN|CASAN|SANEAGO|\bAGUA\b|ESGOTO/, 'Água / Esgoto'],
  [/COMGAS|\bGAS\b|ULTRAGAZ|LIQUIGAS|SUPERGASBRAS|NACIONAL GAS/, 'Gás'],
  [/CONDOMINIO|COND\.|ADMINISTRADORA DE COND/, 'Condomínio'],
  [/ALUGUEL|QUINTOANDAR|QUINTO ANDAR|IMOBILIARIA|LOCACAO/, 'Aluguel / Financiamento'],
  [/CLARO|VIVO|\bTIM\b|\bOI\b|NEXTEL|NET SERVICOS|SKY\b|INTERNET|TELEFON|FIBRA|DESKTOP|ALGAR/, 'Internet / TV / Telefone'],
  [/UNIMED|AMIL|BRADESCO SAUDE|SULAMERICA SAUDE|HAPVIDA|NOTREDAME|PLANO DE SAUDE|GEAP|CASSI|PORTO SAUDE/, 'Plano de saúde'],
  [/CLINICA|LABORAT|HOSPITAL|CONSULT|MEDIC|ODONTO|DENTIST|EXAME|FLEURY|SABIN|DASA|PSICOLOG/, 'Consultas e exames'],
  [/ACADEMIA|SMART ?FIT|BLUEFIT|BODYTECH|SELFIT|GYMPASS|WELLHUB|TOTALPASS|CROSSFIT|PILATES/, 'Academia'],
  [/ESCOLA|COLEGIO|FACULDADE|UNIVERSIDADE|MENSALIDADE ESC|EDUCACIONAL|UNIP|ESTACIO|ANHANGUERA/, 'Escola / Faculdade'],
  [/CURSO|UDEMY|ALURA|COURSERA|LIVRARIA|SARAIVA|LEITURA|AMAZON KINDLE|KINDLE|LIVRO/, 'Cursos / Livros'],
  [/PETLOVE|PETZ|COBASI|PET SHOP|PETSHOP|VETERIN|\bPET\b/, 'Pets'],
  [/RENNER|RIACHUELO|C&A|C E A|ZARA|HERING|CENTAUR|NETSHOES|DAFITI|SHEIN|CALCAD|AREZZO|NIKE|ADIDAS|DECATHLON|MARISA|YOUCOM/, 'Vestuário / Calçados'],
  [/SALAO|BARBEAR|BARBEARIA|CABELEI|ESTETICA|MANICURE|BOTICARIO|NATURA|SEPHORA|PERFUM|AVON/, 'Cuidados pessoais'],
  [/AMAZON|MERCADOLIVRE|MERCADO LIVRE|MAGALU|MAGAZINE LUIZA|AMERICANAS|SHOPEE|ALIEXPRESS|SUBMARINO|CASAS BAHIA|KABUM|DELL|LEROY|TOK ?STOK|ETNA|CAMICADO|MOBIL/, 'Compras diversas'],
  [/ENCARGOS? FINANC|JUROS|ROTATIVO|ENCARGO/, 'Juros e encargos do cartão'],
  [/MULTA POR ATRASO|MORA\b|MULTA/, 'Multa e juros por atraso'],
  [/ANUIDADE/, 'Anuidade do cartão'],
  [/\bIOF\b|I\.O\.F/, 'IOF'],
  [/TARIFA|PACOTE DE SERV|CESTA DE SERV|MANUTENCAO DE CONTA/, 'Tarifas bancárias'],
  [/IPTU|IPVA|DETRAN|LICENCIAMENTO/, 'IPTU / IPVA'],
  [/RECEITA FEDERAL|DARF|IMPOSTO DE RENDA|IRPF/, 'Imposto de renda'],
  [/FIES|EMPRESTIMO|FINANCIAMENTO|CONSIGNADO|AMORTIZACAO|CREDITO PESSOAL|PARCELA EXPRESS/, 'Parcela de empréstimo'],
  [/SEGURO AUTO|SEGURO VEIC|PORTO SEGURO|AZUL SEGUROS|TOKIO MARINE|HDI|LIBERTY/, 'Seguro do veículo'],
  [/OFICINA|AUTO PECAS|PNEU|MECANIC|FUNILARIA|LAVA JATO|AUTO CENTER/, 'Manutenção do veículo'],
  [/DOACAO|VAKINHA|IGREJA|DIZIMO|OFERTA/, 'Doações']
];
const DICT_IN = [
  [/PROVENTOS|SALARIO|FOLHA|VENCIMENTOS|REMUNERACAO|PAGAMENTO DE SALARIO/, 'Salário'],
  [/13O SAL|13 SAL|DECIMO TERCEIRO/, '13º salário'],
  [/FERIAS/, 'Férias'],
  [/RENDIMENTO|JUROS SOBRE|DIVIDENDO|JCP|RESGATE/, 'Rendimentos de aplicações'],
  [/ESTORNO|REEMBOLSO|DEVOLUCAO|CASHBACK/, 'Reembolsos recebidos'],
  [/RESTITUICAO/, 'Restituição de IR'],
  [/HONORARIO/, 'Honorários / Serviços']
];

export function makeClassifier(S) {
  const byName = new Map();
  S.items.filter(i => i.active !== false).forEach(i => { const g = S.groups.find(x => x.id === i.groupId); if (g) byName.set(g.kind + ':' + norm(i.name), i.id); });
  const history = new Map();
  [...S.tx].sort((a, b) => (a.upd || 0) - (b.upd || 0)).forEach(t => { if (t.itemId && t.desc) { const k = merchantKey(t.rawDesc || t.desc); if (k) history.set((t.type === 'rec' ? 'in:' : 'out:') + k, t.itemId); } });
  const alive = id => S.items.some(i => i.id === id && i.active !== false);
  return function classify(line) {
    const key = merchantKey(line.desc), dir = line.dir === 'in' && line.kindHint !== 'estorno' ? 'in' : 'out';
    const rule = S.rules && S.rules[dir + ':' + key];
    if (key && rule && alive(rule.itemId)) return { itemId: rule.itemId, how: 'regra', key };
    const h = key && history.get(dir + ':' + key);
    if (h && alive(h)) return { itemId: h, how: 'histórico', key };
    const text = norm(line.desc + ' ' + (line.title || ''));
    const list = dir === 'in' ? DICT_IN : DICT;
    for (const [rx, name] of list) if (rx.test(text)) { const id = byName.get((dir === 'in' ? 'receita' : 'despesa') + ':' + norm(name)); if (id) return { itemId: id, how: 'dicionário', key }; }
    return { itemId: '', how: '', key };
  };
}
