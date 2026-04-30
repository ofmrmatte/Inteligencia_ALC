# Dashboard Pré-Fatura

Dashboard web para análise de pré-fatura, descontos, PNR e pacotes perdidos por base, driver e competência.

## Como usar

Abra `index.html` no navegador para usar em modo local.

Para importar novos dados, use o botão **Importar Excel** e selecione uma ou mais planilhas `.xlsx` ou `.xls`.

## Arquivos principais

- `index.html`: estrutura da aplicação.
- `styles.css`: estilos e responsividade.
- `app.js`: lógica do dashboard, filtros, rankings, gráficos e importação.
- `seed-data.js`: dados iniciais carregados no modo local.
- `xlsx.full.min.js`: biblioteca usada para leitura dos arquivos Excel no navegador.
- `backend/`: backend simples para sincronização opcional.
- `render.yaml`: configuração opcional de deploy no Render.

## Backend opcional

```powershell
cd backend
npm install
npm start
```

Depois informe a URL do backend no campo **API Base URL** dentro do dashboard.
