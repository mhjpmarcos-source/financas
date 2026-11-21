/* Textos do tutorial de primeiro uso e do guia (Ajustes › Ajuda). Só texto: quem desenha as telas é o app.js. */
export const TOUR = [
  { icon: 'ola', title: 'Bem-vindo ao Níquel', text: 'Seu controle financeiro, com os dados guardados no <b>seu</b> Google Drive e neste aparelho. Ninguém mais tem acesso, nem quem fez o app. Em um minuto você conhece o essencial.' },
  { icon: 'plus', title: 'Lance pelo +', text: 'O botão <b>+</b> registra uma despesa, uma compra no cartão, uma receita ou uma transferência. Em Lançamentos, a fila de atalhos faz o mesmo com um toque. Compra parcelada e conta que se repete todo mês são escolhidas no campo <b>Frequência</b>.' },
  { icon: 'imp', title: 'Ou importe o arquivo do banco', text: '<b>Importar</b> lê a fatura do cartão, o extrato da conta (PDF, CSV ou OFX) e o contracheque (PDF). O app sugere as categorias, avisa o que já foi lançado à mão e você confere antes de gravar. O arquivo é lido no aparelho e não é enviado a lugar nenhum.' },
  { icon: 'cred', title: 'Cartão conta no mês da fatura', text: 'Cada compra entra na fatura em que será cobrada. Em <b>Contas</b>, toque no cartão para ver a fatura, importar o arquivo dela e registrar o pagamento. O pagamento da fatura não conta como despesa de novo.' },
  { icon: 'agenda', title: 'Agenda: o que vem pela frente', text: 'Contas fixas, parcelas, dívidas e faturas em aberto aparecem em <b>Agenda</b>, com o que está atrasado no alto. Em <b>Fixas e parcelas</b> você cadastra aluguel, internet, assinaturas e a renda do emprego.' },
  { icon: 'resumo', title: 'Resumo: para onde vai o dinheiro', text: 'Veja o mês por categoria, o <b>orçamento</b>, o ano inteiro e, em <b>Futuro</b>, quanto da renda dos próximos meses já tem destino. Tocar em Receitas, Despesas ou numa categoria abre os lançamentos filtrados.' },
  { icon: 'ajustes', title: 'Deixe do seu jeito', text: 'Em <b>Ajustes</b> ficam o modo claro ou escuro, o bloqueio com PIN ou Face ID, o backup e o <b>guia de uso</b> completo. Este tutorial também pode ser visto de novo por lá.' }
];

export const GUIDE = [
  ['Primeiros passos', [
    ['Onde ficam meus dados?', 'Num arquivo dentro da pasta <b>Finanças (app)</b> do seu Google Drive e numa cópia neste aparelho, para funcionar sem internet. O app só enxerga os arquivos que ele mesmo criou no Drive.'],
    ['Como instalo no iPhone?', 'Abra o endereço do app no <b>Safari</b>, toque em Compartilhar e em <b>Adicionar à Tela de Início</b>. Ele passa a abrir em tela cheia, como um aplicativo.'],
    ['O que é o saldo inicial?', 'É quanto havia na conta no fim do dia informado. Lançamentos até essa data já estão dentro dele e não contam de novo. Para conferir, toque na conta em Contas e abra "Como chegamos neste valor".']
  ]],
  ['Lançar e importar', [
    ['Como lanço uma compra parcelada?', 'No <b>+</b>, escolha Cartão (ou Despesa), informe o valor total e, em Frequência, <b>Parcelada</b> com o número de parcelas. O app distribui as parcelas pelos meses.'],
    ['Como cadastro uma conta que se repete?', 'No <b>+</b>, em Frequência, escolha <b>Fixa todo mês</b> (mesmo valor) ou <b>Todo mês, valor variável</b> (luz, água). Ou vá em Agenda › Fixas e parcelas. O app cria os próximos 12 meses como previstos.'],
    ['O que posso importar?', 'Fatura de cartão e extrato de conta em PDF, CSV ou OFX, e contracheque em PDF (vários de uma vez). PDF com senha: cadastre os dígitos do CPF em Ajustes ou digite a senha na hora.'],
    ['Como lanço um Pix?', 'No <b>+</b>, em <b>Forma de pagamento</b>: Pix (sai na hora), Pix agendado (fica pendente até a data), Pix agendado recorrente e Pix Automático (viram conta que se repete), Pix parcelado (as parcelas saem da conta) e Pix no crédito (vai para a fatura do cartão). Na importação, o app reconhece o tipo pelo nome que vem do banco.'],
    ['E se eu já tinha lançado à mão?', 'A revisão da importação marca como <b>duplicata</b> o que parece já estar lançado e não importa de novo, a menos que você peça.'],
    ['O que são parcelas "previstas"?', 'Quando a fatura traz "3/10", o app cria as parcelas 4 a 10 nas faturas seguintes. A fatura do mês seguinte troca a prevista pela real, sem duplicar.']
  ]],
  ['Cartões e faturas', [
    ['Como registro o pagamento da fatura?', 'Contas › cartão › <b>Registrar pagamento</b> (pode ser parcial). Se o pagamento veio no extrato como um Pix para o banco do cartão, abra esse lançamento e toque em <b>Vincular a…</b>.'],
    ['O cartão pulou um mês. E agora?', 'Na fatura que só tem parcelas previstas, toque em "avise que esta fatura não existiu": tudo passa para a fatura seguinte.'],
    ['Tenho cartão adicional.', 'Contas › cartão › Editar cartão › <b>Quem usa este cartão</b>: dê um nome a cada final de 4 dígitos e diga se a pessoa devolve o dinheiro. Se devolve, as compras dela não contam como despesa sua.']
  ]],
  ['Agenda, renda e dívidas', [
    ['O que aparece em "A vencer"?', 'Tudo o que está pendente: contas fixas, parcelas de dívidas e faturas em aberto. O botão Pago/Recebido confirma; atrasados ficam no alto.'],
    ['Como funciona a renda do emprego?', 'Importe o contracheque: o app lança o líquido, separa o fixo do eventual, mostra o que é descontado em folha (consignado, plano de saúde) e prevê os próximos meses pelo piso fixo.'],
    ['O que é "Parecem assinaturas"?', 'Compras no cartão que se repetem ou têm nome de serviço por assinatura. Confirmando, viram conta fixa e passam a contar nos meses seguintes.'],
    ['Posso gerar um Pix para pagar alguém?', 'Sim. Cadastre a chave da pessoa em Agenda › Dívidas e Pix. Na parcela, o botão Pix copia o código para colar no app do banco.']
  ]],
  ['Resumo, orçamento e futuro', [
    ['Resultado é o mesmo que saldo?', 'Não. <b>Resultado</b> é receitas menos despesas do mês, incluindo o que ainda está previsto. <b>Saldo</b> é o dinheiro na conta e fica em Contas.'],
    ['Como defino um orçamento?', 'Resumo › Orçamento: toque numa categoria e diga quanto pretende gastar por mês, ou peça a sugestão pela média dos últimos 3 meses.'],
    ['O que a tela "Futuro" mostra?', 'Para cada um dos próximos 12 meses, a renda prevista e quanto dela já tem destino: descontos em folha, contas fixas e assinaturas, parcelas e dívidas. Mostra também o que termina em cada mês.'],
    ['Como filtro os lançamentos?', 'Em Lançamentos, use a fila Tudo · Receitas · Despesas… e "Conta, categoria…". Tocar em Receitas ou Despesas no alto também filtra.']
  ]],
  ['Segurança e cópias', [
    ['Como bloqueio o app?', 'Ajustes › Segurança: crie um PIN e, se quiser, ative Face ID ou Touch ID. É uma tranca de tela, por aparelho.'],
    ['E se eu perder o celular?', 'Os dados continuam no seu Drive. Entre com a mesma conta Google em outro aparelho e tudo volta.'],
    ['Existe cópia de segurança?', 'Sim: uma por dia na subpasta "Cópias de segurança" do Drive, restaurável em Ajustes. Você também pode baixar um backup e uma planilha CSV.'],
    ['Como paro de usar e apago tudo?', 'Apague a pasta <b>Finanças (app)</b> do seu Drive, use Ajustes › "Remover dados deste aparelho" e, se quiser, retire o acesso do app na sua conta Google (myaccount.google.com › Segurança › Conexões).']
  ]]
];
