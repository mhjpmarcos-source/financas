# Finanças

Controle financeiro pessoal, gratuito, que roda no navegador e guarda os dados no **Google Drive de quem usa**. Feito primeiro para o celular (iPhone), com adaptação para computador.

- Um usuário por instalação.
- Nenhum dado fica neste repositório nem em servidor de terceiros: o código é público, os dados ficam no Drive de cada pessoa, na pasta **Finanças (app)**, arquivo `financas-dados.json`.
- O app só enxerga os arquivos que ele mesmo criou no Drive (permissão `drive.file`).
- Funciona sem internet: tudo fica salvo no aparelho e vai para o Drive quando a conexão volta. Se dois aparelhos alterarem ao mesmo tempo, as alterações são juntadas lançamento a lançamento.

**Versão atual: 0.7.0.** Novidades:
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
  - `app.js` — telas.
  - `imp/` — importação: `pdftext.js` (texto e posição no PDF), `parse.js` (fatura × extrato, PDF/CSV/OFX), `classify.js` (categorias), `plan.js` (duplicatas e gravação).
- Ao alterar qualquer arquivo, aumente `VERSION` em `sw.js`, senão os aparelhos continuam com a versão guardada.
- Testes de navegador também para a Agenda e as dívidas: `e2e/agenda.e2e.mjs`.
- Testes (pasta `tests`): `npm install && python3 fixtures/gerar.py && npm test`. Os documentos de teste são **fictícios** e gerados pelo `gerar.py`. Testes de navegador: `e2e/basico.e2e.mjs` e `e2e/importacao.e2e.mjs` (precisam do Playwright e de um servidor local na raiz do app; instruções no topo de cada arquivo).
- Leitor de PDF: `vendor/pdfjs` (pdf.js da Mozilla, licença Apache-2.0), carregado só na hora de importar.
- Nunca coloque faturas, extratos, backups ou dados reais no repositório (o `.gitignore` bloqueia `*.pdf`, `*.csv`, `*.ofx` e planilhas).
