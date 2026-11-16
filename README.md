# Finanças

Controle financeiro pessoal, gratuito, que roda no navegador e guarda os dados no **Google Drive de quem usa**. Feito primeiro para o celular (iPhone), com adaptação para computador.

- Um usuário por instalação.
- Nenhum dado fica neste repositório nem em servidor de terceiros: o código é público, os dados ficam no Drive de cada pessoa, na pasta **Finanças (app)**, arquivo `financas-dados.json`.
- O app só enxerga os arquivos que ele mesmo criou no Drive (permissão `drive.file`).
- Funciona sem internet: tudo fica salvo no aparelho e vai para o Drive quando a conexão volta. Se dois aparelhos alterarem ao mesmo tempo, as alterações são juntadas lançamento a lançamento.

**Versão atual: 0.2 (Fase 2a).** Login com o Google, sincronização aparelho ↔ Drive, assistente de primeira configuração, lançamentos (despesa, cartão, receita, transferência), compras parceladas no cartão, lançamentos repetidos todo mês (editar ou excluir só um ou "este e os seguintes"), busca, fatura de cada cartão (marcar como paga), resumo do mês por categoria e gráfico dos últimos 6 meses, categorias editáveis (criar, renomear, mover, juntar, arquivar), backup e importação do sistema antigo. Próximas fases: importação de faturas e extratos (PDF e CSV), orçamento, segurança extra.

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
- Ao alterar qualquer arquivo, aumente `VERSION` em `sw.js`, senão os aparelhos continuam com a versão guardada.
- Teste do modelo: `cd tests && node model.test.mjs`.
- Nunca coloque faturas, backups ou dados reais no repositório (o `.gitignore` bloqueia `*.pdf`).
