# Finanças

Controle financeiro pessoal, gratuito, que roda no navegador e guarda os dados no **Google Drive de quem usa**. Feito primeiro para o celular (iPhone), com adaptação para computador.

- Um usuário por instalação.
- Nenhum dado fica neste repositório nem em servidor de terceiros: o código é público, os dados ficam no Drive de cada pessoa.
- O app só enxerga os arquivos que ele mesmo criou no Drive (permissão `drive.file`), na pasta **Finanças (app)**.

> **Estado atual: Fase 0.** Esta versão só testa o login com o Google, a gravação no Drive e a instalação no iPhone. O sistema financeiro vem nas próximas fases.

---

## Como publicar a sua cópia

São três etapas, todas gratuitas. Leva uns 20 minutos.

### 1. GitHub (onde o app fica hospedado)

Use **a sua conta** do GitHub.

1. Entre em github.com e crie um repositório novo (botão **New**):
   - Nome: `financas`
   - Visibilidade: **Public** (o GitHub Pages gratuito exige público; não há dados no código).
   - Não marque nenhuma opção de README.
2. Na página do repositório vazio, clique em **uploading an existing file** e arraste **todo o conteúdo** desta pasta (inclusive a pasta `icons`). Clique em **Commit changes**.
   - O arquivo `.gitignore` começa com ponto e o Finder esconde. Para vê-lo, aperte ⌘⇧. na janela do Finder. Ele impede que PDFs de fatura subam por engano.
3. Vá em **Settings → Pages**. Em *Build and deployment*, escolha *Deploy from a branch*, branch `main`, pasta `/ (root)`, e salve.
4. Em um ou dois minutos o app fica no ar em `https://SEU-USUARIO.github.io/financas/`.

### 2. Google Cloud (para o app poder entrar no seu Drive)

Isto cria a "identidade" do app perante o Google. Não dá ao app acesso a nada sozinho; cada pessoa autoriza na hora de entrar.

1. Entre em console.cloud.google.com com uma conta Google (pode ser uma conta Gmail comum).
2. Crie um projeto: menu do topo → **Novo projeto** → nome `Financas` → Criar.
3. Ative a API do Drive: **APIs e serviços → Biblioteca** → procure "Google Drive API" → **Ativar**.
4. Configure a tela de consentimento: **Google Auth Platform** (ou "Tela de permissão OAuth") → Começar:
   - Nome do app: `Finanças`; e-mail de suporte: o seu.
   - Público: **Externo**.
   - Contato: o seu e-mail. Aceite os termos e crie.
5. Em **Público** (Audience) → *Usuários de teste* → **Adicionar usuários**: coloque o e-mail da conta Google cujo Drive vai guardar os dados. Enquanto o app estiver "em teste", só esses e-mails conseguem entrar (até 100).
6. Em **Acesso a dados** (Data access) → **Adicionar ou remover escopos** → marque `.../auth/drive.file` → Atualizar → Salvar.
7. Em **Clientes** → **Criar cliente**:
   - Tipo: **Aplicativo da Web**; nome: `Finanças web`.
   - **Origens JavaScript autorizadas**: `https://SEU-USUARIO.github.io`
   - **URIs de redirecionamento autorizados**: `https://SEU-USUARIO.github.io/financas/` (com a barra no fim)
   - Criar. Copie o **ID do cliente** (termina em `.apps.googleusercontent.com`). Não precisa da "chave secreta".

O próprio app mostra, na seção 2, os dois endereços exatos para copiar.

### 3. Colocar o ID do cliente no app

Escolha uma das opções:
- **Pela tela:** abra o app, cole o ID na seção 2 e toque em Salvar (vale para aquele aparelho).
- **No código:** edite `config.js` no GitHub e preencha `clientId`. Assim vale para todos os aparelhos.

---

## Roteiro de teste da Fase 0 (iPhone)

Anote o resultado de cada linha. Use o botão **Copiar registro** do app para mandar os detalhes.

| # | Onde | Ação | Esperado |
|---|---|---|---|
| 1 | Safari | Abrir o endereço do app | Seção 1 mostra "Navegador", "Endereço seguro: Sim" |
| 2 | Safari | Entrar (janela) | Abre a escolha de conta Google e volta "Conectado como …" |
| 3 | Safari | Gravar teste | "Gravação no Drive concluída" e uma linha na tabela |
| 4 | Safari | Sair, depois Entrar (redirecionamento) | Vai ao Google e volta conectado |
| 5 | Safari | Compartilhar → Adicionar à Tela de Início | Ícone "Finanças" aparece |
| 6 | App instalado | Abrir pelo ícone | Seção 1 mostra "App instalado" |
| 7 | App instalado | Entrar (janela) | Funciona ou não? |
| 8 | App instalado | Entrar (redirecionamento) | Funciona ou não? |
| 9 | App instalado | Gravar teste | Nova linha com "app instalado" |
| 10 | Computador | Abrir o endereço, entrar, Ler do Drive | Mostra as gravações feitas no iPhone |
| 11 | Google Drive | Abrir a pasta **Finanças (app)** | Arquivo `teste-conexao.json` presente |
| 12 | iPhone, modo avião | Abrir o app instalado | A tela abre mesmo sem internet |

As linhas 7 e 8 decidem qual forma de login o sistema vai usar no iPhone.

## Privacidade

- O acesso ao Drive dura 1 hora; depois o app pede para entrar de novo.
- "Sair" revoga o acesso daquele aparelho.
- Faturas em PDF (fases seguintes) são lidas no próprio aparelho e não são enviadas a nenhum servidor.
