# Backend - Painel de Inteligência Operacional

API Node.js + Express com autenticação JWT, senhas com bcrypt e banco SQLite.

## Rodar localmente

```powershell
cd backend
npm install
npm run seed
npm run dev
```

Servidor local:

```txt
http://localhost:3001/api
```

Usuário inicial:

```txt
admin@empresa.com
admin123
```

## Scripts

- `npm run dev`: inicia com nodemon.
- `npm start`: inicia em modo normal.
- `npm run seed`: cria o admin inicial se ele ainda não existir.

## Rotas principais

- `POST /api/auth/login`
- `POST /api/auth/register`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/users`
- `POST /api/users`
- `PATCH /api/users/:id`
- `PATCH /api/users/:id/admin`
- `DELETE /api/users/:id`
- `POST /api/files/upload`
- `DELETE /api/files/:id`
- `GET /api/reports/download`

O token JWT é retornado no login e também enviado em cookie `httpOnly`. O dashboard ainda mantém fallback por `localStorage` para funcionamento local simples; em produção, priorizar cookie `httpOnly`.

