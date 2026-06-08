# zencialnovo

## Deploy na Vercel (evita erro “Serviço temporariamente indisponível” no PIX)

Esse repositório é um **monorepo**: o `vercel.json` e a pasta **`api/`** ficam na **raiz** do projeto. Se a Vercel estiver com **Root Directory** apontando para `envy-skin-clone`, as rotas **`/api/*` não existem** no deploy: o navegador recebe **HTML** (404 ou página estática) e o checkout mostra erro ao interpretar JSON.

1. No painel da Vercel: **Settings → General → Root Directory** → deixe **vazio** (ou `.`), ou seja, a raiz do repositório `zencialnovo`.
2. **Settings → Environment Variables** (Production / Preview), configure pelo menos:
   - `FRUITFY_TOKEN`
   - `FRUITFY_STORE_ID`
   - `FRUITFY_PRODUCT_ID`
   - Opcional: `FRUITFY_API_BASE_URL` (padrão `https://api.fruitfy.io`)
3. Faça **Redeploy** após alterar variáveis ou o Root Directory.
4. Teste no navegador: `https://SEU_DOMINIO.vercel.app/api/health` → deve retornar JSON `{"ok":true,...}`. Se vier página HTML do site, o `/api` ainda não está na raiz correta do deploy.

Arquivos sensíveis (`envy-skin-clone/.env.local`) não vão para o Git; use só as variáveis no painel da Vercel.
# rejuvex
