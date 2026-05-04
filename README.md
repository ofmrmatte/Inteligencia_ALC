# Dashboard Pré-Fatura

Dashboard web para análise de pré-fatura, descontos, PNR e pacotes perdidos por base, driver e competência.

## Como usar

Abra `index.html` no navegador para usar em modo local.

Para importar novos dados, use o botão **Importar Excel** e selecione uma ou mais planilhas `.xlsx` ou `.xls`.

## Arquivos principais

- `index.html`: estrutura da aplicação.
- `styles.css`: estilos e responsividade.
- `app.js`: lógica do dashboard, filtros, rankings, gráficos e importação.
- `assets/data/seed-data.js`: dados iniciais carregados no modo local.
- `assets/vendor/xlsx.full.min.js`: biblioteca usada para leitura dos arquivos Excel no navegador.
- `backend/`: backend simples para sincronização opcional.
- `render.yaml`: configuração opcional de deploy no Render.

## Backend de login e permissões

```powershell
cd backend
npm install
npm run seed
npm run dev
```

API local:

```txt
http://localhost:3001/api
```

Usuário inicial:

```txt
admin@empresa.com
admin123
```

O dashboard já usa `http://localhost:3001/api` como backend padrão. A autenticação usa JWT, senha criptografada com bcrypt e permissões para relatório, upload, exclusão e administração de usuários.
