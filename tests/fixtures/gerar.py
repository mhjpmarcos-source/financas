"""Gera faturas, extratos e contracheques FICTÍCIOS para os testes (nenhum dado real).
Uso: python3 gerar.py  → cria fatura-ficticia.pdf, fatura-ficticia-senha.pdf (senha 1234), extrato-ficticio.csv
     e contracheque-ficticio-*.pdf"""
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
import pikepdf, os
here = os.path.dirname(os.path.abspath(__file__))
def fatura(path):
    c = canvas.Canvas(path, pagesize=A4); w, h = A4
    c.setFont('Helvetica-Bold', 14); c.drawString(40, h-50, 'FATURA DO CARTAO BANCO EXEMPLO')
    c.setFont('Helvetica', 10)
    c.drawString(40, h-80, 'Vencimento'); c.drawString(40, h-94, '10/03/2026')
    c.drawString(300, h-80, 'Total da fatura'); c.drawString(300, h-94, 'R$ 1.077,40')
    c.drawString(40, h-130, 'Limite de credito R$ 5.000,00   Pagamento minimo R$ 100,00')
    c.drawString(40, h-170, 'CLIENTE FICTICIO   Cartao final 9999')
    y = h-190
    rows = [('', 'SALDO FATURA ANTERIOR', '500,00'), ('05/02', 'PAGAMENTO DE FATURA', '500,00-'),
            ('03/02', 'PADARIA PAO QUENTE', '18,50'), ('07/02', 'POSTO CENTRAL', '200,00'),
            ('10/02', 'LOJA DE MOVEIS PARC 02/10', '150,00'), ('12/02', 'NETFLIX.COM', '39,90'),
            ('15/02', 'ESTORNO LOJA X', '20,00-'), ('20/02', 'SUPERMERCADO BOM PRECO', '689,00')]
    for d, desc, v in rows:
        c.drawString(40, y, d); c.drawString(90, y, desc); c.drawRightString(500, y, v); y -= 14
    c.drawString(40, y-10, 'Lancamentos atuais R$ 1.077,40')
    c.save()
fatura(os.path.join(here, 'fatura-ficticia.pdf'))
with pikepdf.open(os.path.join(here, 'fatura-ficticia.pdf')) as p:
    p.save(os.path.join(here, 'fatura-ficticia-senha.pdf'), encryption=pikepdf.Encryption(user='1234', owner='dono-ficticio', R=4))
open(os.path.join(here, 'extrato-ficticio.csv'), 'w', encoding='cp1252').write(
'"Data","Lançamento","Detalhes","Nº documento","Valor","Tipo Lançamento"\n'
'"01/03/2026","Saldo Anterior","","","100,00",""\n'
'"02/03/2026","Recebimento de Proventos","EMPRESA FICTICIA","1001","3.000,00","Entrada"\n'
'"03/03/2026","Compra com Cartão","02/03 10:00 PADARIA PAO QUENTE","1002","-12,00","Saída"\n'
'"04/03/2026","Pix - Enviado","04/03 09:00 FULANO FICTICIO","1003","-50,00","Saída"\n'
'"05/03/2026","BB Rende Fácil","Rende Facil","9903","-2.000,00","Saída"\n'
'"10/03/2026","Pagto cartão crédito","CARTAO EXEMPLO","1004","-1.077,40","Saída"\n'
'"11/03/2026","Tarifa Pacote de Serviços","Cobrança referente 11/03/2026","1005","-18,40","Saída"\n'
'"11/03/2026","S A L D O","","","-57,80",""\n')

open(os.path.join(here, 'extrato-ficticio-invest.csv'), 'w', encoding='cp1252').write(
'"Data","Lançamento","Detalhes","Nº documento","Valor","Tipo Lançamento"\n'
'"02/03/2026","Aplicação CDB","CDB EXEMPLO","2001","-500,00","Saída"\n'
'"10/03/2026","Resgate Tesouro Direto","TESOURO","2002","200,00","Entrada"\n'
'"11/03/2026","Compra com Cartão","11/03 10:00 PADARIA PAO QUENTE","2003","-10,00","Saída"\n')
# ---------- contracheques fictícios ----------
# Como muitos sistemas de folha: duas vias por página, colunas de proventos e descontos SEM título em texto,
# totais numa linha só com dois valores, líquido na linha do banco e uma linha de bases só com números.
def brl(v): return f'{v:,.2f}'.replace(',', 'X').replace('.', ',').replace('X', '.')
def via(c, top, tipo, de, ate, credito, rows, tot, bases, folha=1):
    c.setFont('Helvetica', 9)
    c.drawString(142, top, 'Empresa Ficticia de Exemplo Ltda'); c.drawString(375, top, '00.000.000/0001-00')
    c.drawString(142, top-9, 'Rua Inventada, 100 - Cidade Exemplo'); c.drawRightString(496, top-32, str(folha))
    c.drawString(36, top-32, '77'); c.drawString(80, top-32, 'PESSOA FICTICIA')
    c.drawString(44, top-41, 'Cargo:'); c.drawString(80, top-41, 'Analista de Exemplo   Admissão 01/02/2020'); c.drawString(364, top-41, f'{tipo}de {de} a {ate}')
    y = top-81
    for code, desc, ref, v, d in rows:
        c.drawRightString(51, y, code); c.drawString(60, y, desc); c.drawRightString(302, y, ref)
        if v is not None: c.drawRightString(399, y, brl(v))
        if d is not None: c.drawRightString(494, y, brl(d))
        y -= 11.4
    y = top-308
    c.drawRightString(399, y, brl(tot[0])); c.drawRightString(494, y, brl(tot[1]))
    c.drawString(38, y-11, f'Data de crédito: {credito}'); c.drawString(188, y-11, 'Margem consignável: 1.500,00')
    c.drawString(38, y-22, 'Banco Exemplo'); c.drawString(153, y-22, 'Ag.: 0001-9'); c.drawString(215, y-22, 'Conta: 12345-6'); c.drawRightString(494, y-22, brl(tot[0]-tot[1]))
    for x, b in zip((93, 176, 262, 329, 418, 483), bases): c.drawRightString(x, y-45, brl(b))
def contracheque(nome, tipo, de, ate, credito, rows, bases, folhas=None):
    c = canvas.Canvas(os.path.join(here, nome), pagesize=A4); w, h = A4
    tot = (sum(r[3] or 0 for r in rows), sum(r[4] or 0 for r in rows))
    if not folhas:  # uma folha: duas vias iguais na mesma página
        via(c, h-40, tipo, de, ate, credito, rows, tot, bases); via(c, h-449, tipo, de, ate, credito, rows, tot, bases)
    else:           # duas folhas (muitas rubricas): folha 1 e folha 2 na mesma página; a página seguinte repete (2ª via)
        for _ in range(2):
            via(c, h-40, tipo, de, ate, credito, rows[:folhas], tot, bases, 1); via(c, h-449, tipo, de, ate, credito, rows[folhas:], tot, bases, 2); c.showPage()
    c.save()
FIX = [('1', 'Dias Normais', '30,00', 5000.00, None), ('120', 'Gratificação de Função', '30,00', 1000.00, None), ('150', 'Auxílio Alimentação', '0,00', 800.00, None)]
def desc(irrf, parc, seguro=False):
    d = [('901', 'INSS salário', '6.000,00', None, 600.00), ('902', 'IRRF salário', '5.400,00', None, irrf), ('910', 'Desconto Sindicato', '5.000,00', None, 50.00),
         ('920', 'Desc Assist Médica', '0,00', None, 200.00), ('930', 'Empréstimo Banco Exemplo 1', f'{parc},24', None, 400.00)]
    return d + ([('940', 'Seguro de Vida', '0,00', None, 30.00)] if seguro else [])
B = (5000.00, 6000.00, 6000.00, 480.00, 5400.00, 27.50)
contracheque('contracheque-ficticio-01.pdf', 'Folha Normal', '01/01/26', '31/01/26', '05/02/2026', FIX + desc(700.00, 5), B)
contracheque('contracheque-ficticio-02.pdf', 'Folha Normal', '01/02/26', '28/02/26', '05/03/2026', FIX + [('60', 'Horas Extras 50%', '10,00', 500.00, None)] + desc(837.50, 6), B)
contracheque('contracheque-ficticio-03.pdf', 'Folha Normal', '01/03/26', '31/03/26', '06/04/2026', [('1', 'Dias Normais', '30,00', 5200.00, None)] + FIX[1:] + desc(755.00, 7, True), (5200.00, 6200.00, 6200.00, 496.00, 5600.00, 27.50))
contracheque('contracheque-ficticio-04-ferias.pdf', 'Folha Normal', '01/04/26', '30/04/26', '06/05/2026',
    [('1', 'Dias Normais', '10,00', 1733.33, None), ('40', 'Férias', '20,00', 3466.67, None), ('41', 'Adicional 1/3 de Férias', '0,00', 1155.56, None)] + FIX[1:] +
    [('950', 'Desconto de Férias', '0,00', None, 3900.00), ('901', 'INSS salário', '6.200,00', None, 200.00), ('903', 'INSS férias', '0,00', None, 400.00), ('902', 'IRRF salário', '1.500,00', None, 100.00),
     ('904', 'Trânsito IRRF férias', '0,00', None, 300.00)] + desc(0, 8, True)[2:], (5200.00, 6200.00, 6200.00, 496.00, 1500.00, 27.50), folhas=5)
contracheque('contracheque-ficticio-13.pdf', 'Adiantamento', '01/06/26', '30/06/26', '30/06/2026', [('70', 'Adto 13 Sal. - Salário Base', '0,00', 2600.00, None)], (5200.00, 0.00, 2600.00, 208.00, 0.00, 0.00))
print('ok')
