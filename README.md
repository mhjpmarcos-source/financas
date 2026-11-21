# Níquel

Controle financeiro pessoal, gratuito, que roda no navegador e guarda os dados no **Google Drive de quem usa**. Feito primeiro para o celular (iPhone), com adaptação para computador.

- Um usuário por instalação.
- Nenhum dado fica neste repositório nem em servidor de terceiros: o código é público, os dados ficam no Drive de cada pessoa, na pasta **Finanças (app)**, arquivo `financas-dados.json`.
- O app só enxerga os arquivos que ele mesmo criou no Drive (permissão `drive.file`).
- Funciona sem internet: tudo fica salvo no aparelho e vai para o Drive quando a conexão volta. Se dois aparelhos alterarem ao mesmo tempo, as alterações são juntadas lançamento a lançamento.

**Versão atual: 0.13.1.** Novidades:
- **0.13.1:** **Maré** passa a ser o estilo padrão (Mata e Ameixa continuam em Ajustes › Aparência) e o ícone ganha as cores dele; ao puxar a tela para baixo no iPhone, o fundo que aparece é da cor do topo.
- **0.13.0:** **filtros nos Lançamentos** e **tela de computador**. Filtros: fila "Tudo · Receitas · Despesas · Cartão · Pendentes · Transferências · Sem categoria" e "Conta, categoria…" (conta ou cartão, grupo ou categoria, quem usou o cartão); valem para o mês e para a busca e mostram o total filtrado. Tocar em **Receitas** ou **Despesas** no alto filtra a lista; no Resumo, os mesmos números e cada categoria abrem os Lançamentos já filtrados. Computador: a partir de 760 px o menu vira um trilho à esquerda e as folhas abrem no centro; a partir de 1000 px, Lançamentos fica em duas colunas (lista à esquerda; mês, números e atalhos presos à direita) e os blocos das outras telas ficam lado a lado; a partir de 1280 px o menu lateral é completo; em monitores grandes o conteúdo alarga e Ajustes usa três colunas. Esc fecha a folha; realce ao passar o mouse.
- **0.12.1:** o app passa a se chamar **Níquel** (antes "Finanças") e ganha ícone com a inicial. Nada muda nos dados: a pasta no Drive continua **Finanças (app)**, o arquivo continua `financas-dados.json` e o endereço do site é o mesmo.
- **0.12.0:** **cara nova e ações à mão.** Aparência em Ajustes: modo **automático, claro ou escuro** e três **estilos** (Mata, Ameixa, Maré), cada um com cores, letra e formato de botão próprios; vale por aparelho. Topo colorido com o mês e o resultado em destaque; **atalhos** em Lançamentos (Importar, Despesa, Compra no cartão, Receita, Transferir, Pagar fatura); botão **+** em todas as abas. Na **fatura**, "Importar", "+ Compra", "Registrar pagamento" e "Editar cartão" ficam no alto, antes da lista de compras; em Lançamentos, cada fatura do mês tem "Abrir", "Importar" e "Pagar". Toda folha tem **botão de fechar** e os botões de salvar ficam presos embaixo; "+ Nova conta", "+ Novo cartão", "+ Nova reserva", "+ Eu devo" e os cadastros de Fixas e parcelas subiram para o título de cada bloco. No computador, o menu fica na lateral. Ícone novo.
- **0.11.0:** **quem usa o cartão** (titular, adicional, virtual): em Contas › cartão › "Quem usa este cartão", cada final de 4 dígitos ganha um nome. As compras lidas da fatura (PDF, ou CSV com coluna "Final"/"Cartão") recebem a marca de quem usou, além da categoria, e a fatura e o Resumo mostram o total por pessoa. Por padrão é despesa de quem paga a fatura; se a pessoa devolve o dinheiro, as compras dela saem das despesas e o app cria um "a receber" por fatura, que o Pix dela quita pelo "Vincular a…" (se vier menos, o resto continua a receber). Editar a categoria de uma compra importada não a tira mais da fatura em que veio.
- **0.10.2:** **fatura que o cartão não gerou** (mudança de vencimento): na tela da fatura que só tem parcelas previstas, "avise que esta fatura não existiu" passa parcelas e pagamentos para a fatura seguinte; as parcelas previstas acompanham a última parcela real de cada compra.
- **0.10.1:** a busca de lançamentos atualiza só os resultados enquanto se digita (no iPhone o teclado não pisca nem troca de tipo a cada tecla); "Para conferir" também aponta despesa cuja descrição diz que é pagamento de fatura.
- **0.10.0:**
  - **Vincular um lançamento que já existe:** ao abrir um lançamento, "Vincular a…" diz o que ele é: pagamento de fatura de cartão, mês de uma conta que se repete (despesa ou receita, com proposta de novo valor previsto), parcela de uma dívida ou transferência. O app guarda o nome que o banco usa e reconhece sozinho nas importações seguintes, inclusive o Pix para o emissor do cartão.
  - **Para conferir:** a tela de Lançamentos avisa quando algo parece contar errado (pagamento de fatura lançado como despesa, pagamento ligado ao cartão errado, pix devolvido que ficou como despesa e receita, lançamento sem categoria). O app aponta e a pessoa decide.
  - **Lista mais legível:** a descrição aparece inteira (o nome em destaque, o tipo de operação embaixo), as parcelas vêm por extenso ("parcela 3 de 6") e as compras no cartão ficam agrupadas por fatura, em vez de espalhadas pelos dias do mês.
  - **Meses:** toque no nome do mês para ir direto a qualquer mês e ano; fora do mês atual aparece o atalho para voltar a ele. Vale para Lançamentos, Resumo e Orçamento.
  - **Renda prevista mais fiel:** com um único contracheque, e de um mês com eventuais, o piso desconta o imposto que os eventuais puxaram (pela faixa do IR impressa). O que a folha paga fica previsto até o mesmo horizonte da renda (12 meses), para a receita dos meses distantes não parecer cair; além do horizonte, a tela avisa.
  - **Correções:** fatura "marcada como paga" não tira mais dinheiro da conta; "Fixas e parcelas" tem botões próprios para despesa, receita e parcelado; textos de receita deixam de falar em "despesa" e "pago"; lançamento com data futura começa como pendente.
- **0.9.2:**
  - **Vincular o pagamento do extrato a uma conta fixa:** na revisão da importação, a linha do boleto pode ser ligada a uma conta que se repete (aluguel, condomínio, mensalidade). A conta guarda o nome que o banco usa e as importações seguintes reconhecem sozinhas, mesmo quando o valor muda.
  - **Novo valor previsto:** quando uma conta fixa é paga com valor diferente, a revisão propõe usar o novo valor nos próximos meses (dá para desmarcar quando foi multa ou desconto pontual).
- **0.9.1:**
  - **Pago pela folha, sem conta:** os descontos do contracheque que são gastos da pessoa (plano de saúde, sindicato, consignado) deixam de ficar presos à conta do salário. São despesas pagas pela folha, registradas mesmo quando o líquido não é lançado em nenhuma conta, e os meses seguintes já ficam previstos.
  - **Consignado é uma dívida:** aparece em Agenda › Dívidas, em "Eu devo", com credor, parcela, total, término e quanto falta. Cada contracheque quita uma parcela; as seguintes ficam agendadas até a última. Dá para corrigir a parcela e o total, e marcar que o empréstimo acabou (quitação, refinanciamento, portabilidade).
  - **Líquido previsto sobe sozinho** no mês seguinte ao fim de cada consignado.
- **0.9.0:**
  - **Contracheque (PDF):** importado pelo mesmo botão Importar, um ou vários de uma vez. O leitor é genérico: acha a linha de totais pela conta (bruto − descontos = líquido), separa proventos e descontos pela posição e confere a soma. A receita entra pelo **líquido**, na data de crédito. Cada rubrica é classificada como fixa, eventual ou imposto (pelo nome e pelo histórico; dá para corrigir na revisão, e a escolha vale para os próximos).
  - **Descontos em folha:** os que são gastos da pessoa aparecem como despesa na categoria, sem mexer no saldo, porque o líquido já veio sem eles. No resumo do mês o mesmo valor entra na receita e na despesa.
  - **Consignados:** o número da parcela (ex.: 17 de 36) é lido do contracheque e pode ser corrigido à mão (ver 0.9.1).
  - **Piso previsto:** os próximos meses ficam previstos com o líquido esperado num mês sem eventuais, recalculado a cada contracheque, com a lista do que mudou no fixo.
  - **Investimentos:** conta de investimento fica fora do "Saldo hoje"; mandar dinheiro para ela é transferência (não é despesa); "Atualizar valor de hoje" registra o rendimento sem entrar nas receitas do mês. Ao importar um extrato, aplicações e resgates são sugeridos como transferência para a conta de investimento.
  - **Como chegamos neste valor:** tocar numa conta mostra o saldo linha a linha (saldo inicial, entradas, saídas, transferências, faturas) e o que ainda está pendente até o fim do mês.
- **0.8.2:**
  - **Planilha de parcelamentos:** importada pelo mesmo botão Importar, lança como previstas as parcelas que ainda vão vir de compras parceladas em andamento, cada uma na fatura do mês certo. O formato está descrito em `js/imp/parcelas.js`.
  - **Reimportar uma fatura importada antes da versão 0.8** agora também lança as parcelas futuras.
  - **Fatura do Mercado Pago** reconhecida pelo nome do banco.
- **0.8.1:** ao abrir o app (ou voltar a ele) com o acesso ao Drive vencido (o Google dá 1 hora), o app renova sozinho passando rapidamente pelo Google e sincroniza, sem precisar tocar em "Reconectar". Só pede o toque se o Google exigir (ex.: saiu da conta Google naquele aparelho).
- **0.8.0:** em Agenda › Fixas e parcelas:
  - **Despesas fixas:** todo mês, sem data para acabar, até você encerrar.
  - **Despesas variáveis:** luz, água etc.; o valor previsto é a média dos 3 últimos meses pagos.
  - **Contas que se repetem encontradas no histórico,** que você pode cadastrar com um toque.
  - **Parcelados até 36x,** no cartão ou na conta.
  - **Ao importar uma fatura,** as parcelas futuras das compras parceladas entram como previstas nas faturas seguintes e são trocadas pelas reais quando a próxima fatura chega, sem duplicar.
  - **Pessoas com chave Pix:** as parcelas que você deve ganham um botão que gera o código **Pix Copia e Cola** com o valor, para colar no app do banco.
- **0.7.0 (segurança e cópias):**
  - O app faz uma **cópia automática por dia no seu Drive**, na subpasta "Cópias de segurança". Ficam as dos últimos 14 dias e uma por mês do último ano.
  - Antes de restaurar ou de uma exclusão muito grande, ele guarda uma cópia extra.
  - Em Ajustes, dá para restaurar qualquer cópia.
  - **Bloqueio com PIN** e, se quiser, Face ID / Touch ID, com escolha do tempo para bloquear.
  - **Modo discreto**: o olho no topo da tela esconde os valores.
  - Política de segurança de conteúdo: o app só carrega código dele mesmo e do Google.
- **0.6.0:** **reservas**, para separar parte do saldo para objetivos, com meta, prazo e quanto guardar por mês, mostrando quanto fica livre nas contas. Também ganhou o botão **±** nos valores que podem ser negativos.
- **0.5.0:** **orçamento por categoria** (planejado × gasto no mês, com sugestão pela média dos 3 meses anteriores e valor diferente só para um mês), **relatório anual** (receitas, despesas e resultado mês a mês por grupo e categoria, com download em planilha), **exportação de lançamentos em CSV** (Ajustes), **vencimentos no calendário do celular** (arquivo .ics com aviso às 9h do dia anterior, na Agenda), número de atrasados no ícone do app e **valores com centavos automáticos** (digitar 1 2 3 4 5 mostra 123,45). Antes disso: Pagamento de fatura de cartão é um tipo próprio de lançamento: sai da conta, não conta como despesa e se vincula à fatura (valor idêntico quita; valor menor fica como pagamento parcial, mostrando quanto falta). Saldo inicial das contas tem data; ao importar um extrato, o saldo anterior dele pode virar o saldo inicial. Lançamentos, parcelas, repetições, faturas, resumo, categorias editáveis, **Agenda** (o que vence e o que está atrasado, com botão de recebido/pago), **dívidas com terceiros** (quem me deve e a quem devo, parceladas, com vencimentos e saldo em aberto) e **importação**. O app **importa faturas de cartão e extratos de conta** em **PDF, CSV ou OFX**:
- O arquivo é lido no próprio aparelho; nada é enviado a servidor.
- PDF com senha: o app tenta os 4, 5 e 6 primeiros dígitos do CPF cadastrado; se não abrir, pede a senha, que não é guardada.
- Reconhece compras, parcelas ("PARC 06/12", "- 7/8"), estornos, encargos, cartões adicionais e virtuais; no extrato, Pix, boletos, compras no débito (com a data real da compra), tarifas e juros.
- Ignora linhas de saldo, aplicações e resgates automáticos e lançamentos futuros; pagamento de fatura no extrato marca a fatura do cartão como paga.
- Confere a soma lida com o total impresso na fatura, ou o saldo inicial + movimentação com o saldo final do extrato.
- Sugere a categoria (dicionário de estabelecimentos + o que você já classificou) e aprende com as suas escolhas.
- Detecta duplicatas: o que você já lançou à mão (mesmo valor, data próxima) e o que já foi importado antes (não importa duas vezes).
- Tela de revisão antes de gravar.

Testado com faturas e extratos do Banco do Brasil e do Sam's Club; o leitor é genérico e deve funcionar com a maioria dos bancos. Se algum arquivo não for lido direito, guarde-o (sem compartilhar publicamente) para ajustar o leitor.

---

## Como usar

- **Usar a instalação de outra pessoa:** abra o endereço que ela passar, toque em **Entrar com o Google** e siga o assistente. Enquanto o app dela estiver "em teste" no Google, ela precisa cadastrar o seu e-mail como usuário de teste. Ela não tem acesso aos seus dados.
- **No iPhone:** abra o endereço no Safari → Compartilhar → **Adicionar à Tela de Início**.
- **Publicar a sua própria cópia** (independente de qualquer pessoa): siga as etapas abaixo.

## Como publicar a sua cópia

Três etapas gratuitas, uns 20 minutos.

### 1. GitHub (onde o app fica hospedado)

**Opção A — GitHub Desktop (Mac/Windows)**

1. Faça um *fork* deste repositório no site do GitHub (botão **Fork**) e clone pelo GitHub Desktop (**File → Clone Repository**). Guarde a pasta **fora** do iCloud/OneDrive (ex.: uma pasta na sua pasta pessoal), porque esses serviços corrompem repositórios.
2. No site, em **Settings → Pages**: *Deploy from a branch*, branch `main`, pasta `/ (root)`, **Save**. O repositório precisa ser **público** (exigência do plano gratuito).
3. Em um ou dois minutos o app fica em `https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/`.

**Opção B — só pelo site:** **Fork** e depois o passo 2 acima.

### 2. Google Cloud (para o app poder entrar no Drive)

1. Entre em console.cloud.google.com (um Gmail comum serve) e crie um projeto.
2. Ative a **Google Drive API** (busca no topo → Ativar).
3. **Google Auth Platform → Começar**: nome do app, e-mail de suporte, público **Externo**.
4. **Público-alvo → Usuários de teste → Add users**: o e-mail de quem vai usar. Só esses e-mails entram enquanto o app estiver em teste (até 100).
5. **Acesso a dados → Adicionar ou remover escopos**: marque `.../auth/drive.file` → Atualizar → Salvar.
6. **Clientes → Criar cliente → Aplicativo da Web**:
   - Origens JavaScript autorizadas: `https://SEU-USUARIO.github.io`
   - URIs de redirecionamento autorizados: `https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/` (com a barra no fim)
   - Copie o **ID do cliente**. A chave secreta não é usada; não guarde nem publique.

### 3. Colocar o ID do cliente no app

Edite `config.js` e troque o `clientId` pelo seu. Se deixar vazio, o app pede o ID na tela (vale só para aquele aparelho).

---

## Para quem mexe no código

- Sem etapa de compilação: HTML, CSS e JavaScript puros (módulos em `js/`).
  - `model.js` — formato dos dados, plano de contas padrão, junção de cópias, importação de backups.
  - `calc.js` — fatura do cartão, saldos, resumo do mês.
  - `auth.js` — login com o Google (janela; redirecionamento como reserva).
  - `drive.js` — leitura e gravação no Drive.
  - `store.js` — cópia no aparelho (IndexedDB).
  - `sync.js` — sincronização aparelho ↔ Drive.
  - `holder.js` — quem usa cada cartão (portadores) e reembolso.
  - `link.js` — vínculos de lançamentos que já existem e a lista "para conferir".
  - `app.js` — telas.
  - `theme.js` — aparência (claro/escuro/automático e estilo), carregado antes do CSS; as cores de cada estilo estão no começo de `style.css`.
  - `imp/` — importação: `pdftext.js` (texto e posição no PDF), `parse.js` (fatura × extrato, PDF/CSV/OFX), `classify.js` (categorias), `plan.js` (duplicatas e gravação).
- Ao alterar qualquer arquivo, aumente `VERSION` em `sw.js`, senão os aparelhos continuam com a versão guardada.
- Testes de navegador também para a Agenda e as dívidas: `e2e/agenda.e2e.mjs`.
- Testes (pasta `tests`): `npm install && python3 fixtures/gerar.py && npm test`. Os documentos de teste são **fictícios** e gerados pelo `gerar.py`. Testes de navegador: `e2e/basico.e2e.mjs`, `e2e/importacao.e2e.mjs`, `e2e/contracheque.e2e.mjs` e os demais da pasta `e2e` (precisam do Playwright e de um servidor local na raiz do app; instruções no topo de cada arquivo).
- Fontes: pasta `fonts` (Figtree, Plus Jakarta Sans e Nunito, licença SIL OFL 1.1), servidas pelo próprio app. Ícone: `icons/icone.svg` (os PNG saem dele).
- Leitor de PDF: `vendor/pdfjs` (pdf.js da Mozilla, licença Apache-2.0), carregado só na hora de importar.
- Nunca coloque faturas, extratos, backups ou dados reais no repositório (o `.gitignore` bloqueia `*.pdf`, `*.csv`, `*.ofx` e planilhas).
