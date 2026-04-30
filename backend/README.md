# Pre-fatura storage API

Backend Node para o dashboard estático da pré-fatura.

Ele guarda a biblioteca de arquivos, controla login e separa permissões:

- `admin`: importa, exclui, sincroniza e administra usuários.
- `viewer`: acessa o dashboard apenas para visualização e filtros.

O primeiro usuário criado vira `admin`. Os próximos usuários entram como `viewer` até um admin alterar o papel.

## Rodar localmente

```bash
node backend/server.js
```

Por padrão ele sobe em `http://localhost:8787`.

## Endpoints principais

- `GET /api/health`
- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/session`
- `GET /api/users` somente admin
- `PATCH /api/users/:id` somente admin
- `GET /api/library`
- `PUT /api/library` somente admin quando houver usuários cadastrados
- `POST /api/reset` somente admin quando houver usuários cadastrados

## Deploy recomendado

Use Render para o backend e GitHub Pages para o front-end.

O `render.yaml` já está configurado com disco persistente em `/var/data`. Isso é importante porque o backend salva a biblioteca em JSON. Sem disco persistente, a biblioteca pode sumir em redeploy.

Depois do deploy:

1. Abra o dashboard no GitHub Pages.
2. Cole a URL do Render em `API Base URL`.
3. Clique em `Salvar conexão`.
4. Crie o primeiro acesso pelo card `Acesso`.
5. Use esse primeiro acesso como Admin para importar arquivos e administrar usuários.
