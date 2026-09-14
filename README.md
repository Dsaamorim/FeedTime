# Feedtime

Extensão de navegador + painel web que medem quanto tempo você passa no
Facebook e no LinkedIn — a partir do momento em que a aba abre — e
sincronizam esse tempo entre dispositivos.

**Como funciona:** a extensão (Manifest V3) observa qual aba está realmente
ativa e em foco (ignorando quando você está ocioso ou em outra janela);
quando é uma aba do Facebook ou do LinkedIn, ela conta o tempo, guarda
localmente e sincroniza a cada minuto com um banco de dados no Supabase.
O painel web lê esses dados e mostra os totais do dia, da semana e um
gráfico dos últimos 7 dias.

Um site sozinho não consegue enxergar outras abas do navegador (é bloqueado
por segurança) — por isso a extensão é o coração do projeto, e o painel é
a "vitrine" dos dados que ela coleta.

## Estrutura

```
feedtime/
├── extension/     -> a extensão de navegador (Chrome, Edge, Brave...)
├── dashboard/     -> o painel web (site estático)
└── supabase/
    └── schema.sql -> script para criar o banco de dados
```

## Como funciona por dentro

### Extensão (`extension/background.js`)

O `background.js` é um service worker (Manifest V3) que fica de olho no
navegador e decide, a cada evento relevante (trocar de aba, trocar de
janela, uma aba terminar de carregar, o estado de ociosidade mudar), se
deve contar tempo ou não:

- **Detecção de aba ativa:** a cada checagem (`evaluate()`), a extensão
  percorre todas as janelas normais abertas (não só a que está em foco do
  sistema operacional) e procura alguma com a aba ativa em `facebook.com`
  ou `linkedin.com`. Isso cobre o caso de usar dois monitores, com uma
  dessas abas ativa numa janela que não está com o foco do SO no momento —
  ela ainda conta. Só ignora janelas minimizadas.
- **Ociosidade:** em vez de parar de contar assim que o mouse/teclado ficam
  parados por um tempo (o que penalizaria só ficar lendo o feed ou ouvindo
  algo), a extensão só considera "ausente" quando a tela do sistema está
  travada (`chrome.idle.queryState` retornando `"locked"`).
- **Duas abas ao mesmo tempo:** se Facebook e LinkedIn estiverem abertos e
  visíveis ao mesmo tempo (janelas lado a lado, por exemplo), só uma delas
  é contada por vez — o tempo real de uso não é duplicado.
- **Buffer e sincronização:** o tempo decorrido de cada "sessão" de
  contagem é somado a um total do dia guardado em `chrome.storage.local` e
  também empilhado numa fila (`pendingLogs`). Um alarme (`chrome.alarms`)
  dispara a cada 1 minuto, fechando a sessão atual, somando o tempo ao
  buffer e tentando enviar a fila pendente para o Supabase via `fetch`
  direto na API REST (`/rest/v1/time_logs`) — sem depender da biblioteca
  `supabase-js` dentro do service worker.
- **Sessão de login:** o token de acesso (JWT) e o refresh token ficam em
  `chrome.storage.local`; antes de cada envio, `ensureAccessToken()`
  verifica se o token ainda é válido e, se não for, pede um novo usando o
  refresh token (`/auth/v1/token?grant_type=refresh_token`). Se o refresh
  falhar (expirado/revogado), a sessão salva é apagada e a extensão volta a
  guardar tudo localmente até um novo login.

### Popup (`extension/popup.js`) e opções (`extension/options.js`)

O popup só lê o que o `background.js` já guardou (`todayTotals` e a sessão
em andamento) e recalcula o tempo ao vivo a cada segundo, sem ele mesmo
fazer nenhuma contagem. A página de opções cuida só do login/logout via
Supabase Auth (`supabase-js`, carregado localmente em `extension/lib/`, não
por CDN, para funcionar dentro das regras de uma extensão).

### Painel (`dashboard/`)

Um site estático que usa `supabase-js` para autenticar o mesmo usuário da
extensão e ler a view `daily_totals` dos últimos 7 dias. `app.js` calcula
os totais do dia/semana, a escala "arredondada" do eixo do gráfico
(`niceMaxSeconds`) e desenha as barras e o tooltip na mão, sem biblioteca de
gráficos.

### Banco de dados (`supabase/schema.sql`)

- `time_logs`: cada linha é um "pedaço" de tempo (no máximo 1h, por causa
  do `check` na coluna `seconds`) de uma plataforma, num dia, para um
  usuário.
- Row Level Security fica ligado na tabela, com políticas que só deixam
  cada usuário ler e inserir os próprios registros (`auth.uid() =
  user_id`) — mesmo com a chave pública (`anon`) exposta no `config.js`,
  ninguém enxerga dados de outra conta.
- `daily_totals` é uma view que soma os segundos por usuário/dia/plataforma
  (com `security_invoker = on`, para herdar o RLS da tabela base), usada
  pelo painel em vez de agregar no cliente.

### Ícones (`gen_icons.js`)

Os ícones em `extension/icons/` são gerados por um script Node (`npm
install` e depois `npm run gen-icons`), que monta um SVG do relógio com os
dois marcadores de cor e usa o `sharp` para exportar nos tamanhos 16, 32,
48 e 128px. É só uma ferramenta de apoio para recriar os ícones — não faz
parte da extensão em si.

## Passo a passo (uns 10 minutos)

### 1. Crie um projeto Supabase (gratuito)

1. Crie uma conta em [supabase.com](https://supabase.com) e clique em
   **New project** (o plano free serve tranquilamente para esse uso pessoal).
2. Espere o projeto terminar de provisionar (1–2 minutos).

### 2. Rode o schema do banco

1. No painel do Supabase, abra **SQL Editor > New query**.
2. Cole o conteúdo de `supabase/schema.sql` e clique em **Run**.
   Isso cria a tabela `time_logs`, as políticas de segurança (cada pessoa só
   vê os próprios dados) e a view `daily_totals` usada pelo dashboard.

### 3. Pegue a URL e a chave do projeto

Em **Project Settings > API**, copie:
- **Project URL**
- **anon public key** (a chave pública — nunca use a `service_role`)

### 4. Configure a extensão e o painel

Edite os dois arquivos abaixo com os mesmos valores (é o mesmo projeto
Supabase alimentando os dois):

- `extension/config.js`
- `dashboard/config.js`

```js
const FEEDTIME_CONFIG = {
  SUPABASE_URL: "https://SEU-PROJETO.supabase.co",
  SUPABASE_ANON_KEY: "sua-chave-anon-aqui",
  DASHBOARD_URL: "https://..." // só existe em extension/config.js, ajuste no passo 6
};
```

### 5. Carregue a extensão no navegador

1. Abra `chrome://extensions` (ou `edge://extensions`).
2. Ative o **Modo do desenvolvedor** (canto superior direito).
3. Clique em **Carregar sem compactação** (Load unpacked) e selecione a
   pasta `extension/`.
4. Clique no ícone da extensão na barra de ferramentas → **Login / ajustes**
   → crie sua conta (mesmo e-mail/senha que você quiser usar).

A partir daqui, navegue normalmente pelo Facebook e pelo LinkedIn — a
extensão já está contando o tempo (dá uma olhada no popup dela).

### 6. Publique o painel (deploy grátis)

O jeito mais simples é o [Netlify](https://app.netlify.com/drop): arraste a
pasta `dashboard/` inteira para lá e pronto, você recebe uma URL pública.
(Também funciona no Vercel ou GitHub Pages, se preferir.)

Depois de publicar, volte em `extension/config.js`, atualize `DASHBOARD_URL`
com o link gerado, e clique em **Recarregar** na extensão
(`chrome://extensions`).

### 7. Teste

Abra o painel publicado, entre com a mesma conta da extensão, e navegue um
pouco pelo Facebook/LinkedIn. Em cerca de 1 minuto (o intervalo de
sincronização) os números aparecem no painel.
