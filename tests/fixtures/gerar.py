"""Gera faturas e extratos FICTÍCIOS para os testes (nenhum dado real).
Uso: python3 gerar.py  → cria fatura-ficticia.pdf, fatura-ficticia-senha.pdf (senha 1234) e extrato-ficticio.csv"""
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
print('ok')
