## DoaFácil (Expo Go + Backend local)

Aplicação mobile (React Native/Expo) que conecta **Doadores** a **Centros de Doação**, com:

- **Gestão de centros**: cadastro (Centro), **aprovação (Admin)**, atualização de dados (endereço, mapa, horário, itens aceites) e perfil público
- **Feed social**: publicações por centros (texto + imagem + categoria), com filtro por categoria e localização
- **Chat Doador ↔ Centro**: histórico e notificação in-app (badge) quando chega nova mensagem (Socket.IO)

### Pré-requisitos

- Node.js (recomendado 18+)
- Expo Go instalado no celular
- Celular e PC na **mesma rede Wi‑Fi** (ou use túnel do Expo)

---

## Backend

O backend roda em `http://localhost:3000` e suporta **SQLite** (padrão) ou **MySQL**.

### Rodar com SQLite (padrão)

```bash
cd doafacil-backend
npm install
npm run dev
```

O SQLite cria automaticamente o arquivo `doafacil-backend/data.sqlite`.

### Rodar com MySQL

1. **Criar o database MySQL**:
```bash
# PowerShell
cd doafacil-backend
$env:DB_HOST='127.0.0.1'
$env:DB_PORT='3306'
$env:DB_USERNAME='root'
$env:DB_PASSWORD=''
node --input-type=module -e "import mysql from 'mysql2/promise'; const c=await mysql.createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT),user:process.env.DB_USERNAME,password:process.env.DB_PASSWORD}); await c.query('CREATE DATABASE IF NOT EXISTS doafacil_backend CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'); await c.end(); console.log('Database criado!');"
```

2. **Migrar dados do SQLite para MySQL** (opcional, se já tiver dados):
```bash
cd doafacil-backend
$env:DB_CONNECTION='mysql'
$env:DB_HOST='127.0.0.1'
$env:DB_PORT='3306'
$env:DB_DATABASE='doafacil_backend'
$env:DB_USERNAME='root'
$env:DB_PASSWORD=''
npm run migrate:mysql
```

3. **Iniciar o servidor com MySQL**:
```bash
cd doafacil-backend
$env:DB_CONNECTION='mysql'
$env:DB_HOST='127.0.0.1'
$env:DB_PORT='3306'
$env:DB_DATABASE='doafacil_backend'
$env:DB_USERNAME='root'
$env:DB_PASSWORD=''
npm run dev
```

**Nota**: Para configurar permanentemente, crie um arquivo `.env` na pasta `doafacil-backend`:
```
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=doafacil_backend
DB_USERNAME=root
DB_PASSWORD=
```

### Usuário Admin (seed automático)

- **Email**: `admin@doafacil.local`
- **Senha**: `admin123`

---

## Mobile (Expo Go)

### Rodar

```bash
cd doafacil-mobile
npm install
npm start
```

Abra o Expo Go e escaneie o QR Code.

### Configuração da URL da API (importante no Expo Go)

O app tenta detectar automaticamente o IP do Metro e montar:

- `http://<IP_DO_SEU_PC>:3000`

Você consegue ver a API detectada na tela de Login (**API:** ...).

Se precisar forçar manualmente:

- **Opção A**: iniciar o Expo com variável de ambiente:

```bash
cd doafacil-mobile
set EXPO_PUBLIC_API_URL=http://SEU_IP:3000
npm start
```

- **Opção B**: editar `doafacil-mobile/src/config.ts` e ajustar `API_BASE_URL`.

---

## Fluxos principais

- **Centro**: cria conta como Centro → fica **pendente** → Admin aprova → Centro pode publicar e aparecer publicamente.
- **Admin**: entra com o seed → aprova centros em **Perfil → Aprovar centros**.
- **Doador**: vê Feed e Centros → abre perfil do centro → inicia chat.

---

## Foco C: Push notifications reais (remoto)

**Importante**: desde o Expo SDK 53, o **Expo Go não suporta push remoto**. Para push real você precisa de um **Development Build (EAS)**.

### O que foi implementado

- O app (dev build) registra o **Expo Push Token** e envia ao backend em `POST /me/push-token`.
- O backend guarda tokens em `push_tokens` e, ao receber uma mensagem, envia push via **Expo Push API** *apenas se o destinatário estiver offline no Socket.IO* (evita duplicidade quando o app está aberto).

### Como testar (visão geral)

1) **Crie um dev build com EAS** (resumo):

```bash
npm install -g eas-cli
cd doafacil-mobile
eas init
eas build --profile development --platform android
```

2) Defina o Project ID para o app conseguir gerar token:

- No terminal, antes do `npm start`:

```bash
cd doafacil-mobile
set EXPO_PUBLIC_EAS_PROJECT_ID=SEU_PROJECT_ID
npm start
```

3) Rode backend normalmente (`doafacil-backend`) e use o dev build no celular.

> Observação: para push remoto funcionar 100% em Android/iOS, você ainda pode precisar configurar credenciais de push (FCM/APNs) no projeto EAS/Expo.

