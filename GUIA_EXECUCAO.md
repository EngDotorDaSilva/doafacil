# 🚀 Guia de Execução - DoaFácil

## 📋 Pré-requisitos

- **Node.js** (versão 18 ou superior)
- **npm** (vem com Node.js)
- **Expo Go** instalado no celular (Android/iOS)
- **MySQL** (opcional, se quiser usar MySQL ao invés de SQLite)
- Celular e PC na **mesma rede Wi‑Fi**

---

## 🔧 Opção 1: Executar com SQLite (Mais Simples)

### Backend

1. **Abra o terminal PowerShell** e navegue até a pasta do backend:
```powershell
cd C:\Users\dogev\ComputacaoMovel\doafacil-backend
```

2. **Instale as dependências** (se ainda não instalou):
```powershell
npm install
```

3. **Inicie o servidor**:
```powershell
npm run dev
```

✅ O servidor estará rodando em `http://localhost:3000`

**Usuário Admin padrão:**
- Email: `admin@doafacil.local`
- Senha: `admin123`

---

## 🗄️ Opção 2: Executar com MySQL

### Passo 1: Criar o Database MySQL

```powershell
cd C:\Users\dogev\ComputacaoMovel\doafacil-backend
$env:DB_HOST='127.0.0.1'
$env:DB_PORT='3306'
$env:DB_USERNAME='root'
$env:DB_PASSWORD=''
node --input-type=module -e "import mysql from 'mysql2/promise'; const c=await mysql.createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT),user:process.env.DB_USERNAME,password:process.env.DB_PASSWORD}); await c.query('CREATE DATABASE IF NOT EXISTS doafacil_backend CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'); await c.end(); console.log('Database criado!');"
```

### Passo 2: Migrar dados do SQLite (se já tiver dados)

```powershell
cd C:\Users\dogev\ComputacaoMovel\doafacil-backend
$env:DB_CONNECTION='mysql'
$env:DB_HOST='127.0.0.1'
$env:DB_PORT='3306'
$env:DB_DATABASE='doafacil_backend'
$env:DB_USERNAME='root'
$env:DB_PASSWORD=''
npm run migrate:mysql
```

### Passo 3: Iniciar o servidor com MySQL

```powershell
cd C:\Users\dogev\ComputacaoMovel\doafacil-backend
$env:DB_CONNECTION='mysql'
$env:DB_HOST='127.0.0.1'
$env:DB_PORT='3306'
$env:DB_DATABASE='doafacil_backend'
$env:DB_USERNAME='root'
$env:DB_PASSWORD=''
npm run dev
```

### 💡 Dica: Criar arquivo `.env` (opcional)

Para não precisar definir as variáveis toda vez, crie um arquivo `.env` na pasta `doafacil-backend`:

```
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=doafacil_backend
DB_USERNAME=root
DB_PASSWORD=
```

**Nota:** Você precisará instalar `dotenv` e carregar no `server.js` se quiser usar `.env`.

---

## 📱 Executar o App Mobile (Expo Go)

### Passo 1: Instalar dependências

Abra um **novo terminal PowerShell** e navegue até a pasta do mobile:

```powershell
cd C:\Users\dogev\ComputacaoMovel\doafacil-mobile
npm install
```

### Passo 2: Descobrir o IP do seu PC

No PowerShell, execute:

```powershell
ipconfig
```

Procure por **"IPv4 Address"** na seção do seu adaptador Wi‑Fi. Exemplo: `192.168.1.100`

### Passo 3: Configurar a URL da API

**Opção A - Automática (recomendado):**
O app tenta detectar automaticamente. Você verá a URL na tela de Login.

**Opção B - Manual (se a detecção automática falhar):**

1. Edite o arquivo `doafacil-mobile/src/config.ts`
2. Altere a linha com `API_BASE_URL` para o IP do seu PC:
```typescript
export const API_BASE_URL = 'http://192.168.1.100:3000';
```

**Opção C - Variável de ambiente:**
```powershell
cd C:\Users\dogev\ComputacaoMovel\doafacil-mobile
$env:EXPO_PUBLIC_API_URL='http://192.168.1.100:3000'
npm start
```

### Passo 4: Iniciar o Expo

```powershell
cd C:\Users\dogev\ComputacaoMovel\doafacil-mobile
npm start
```

### Passo 5: Conectar no celular

1. Abra o **Expo Go** no celular
2. Escaneie o **QR Code** que aparece no terminal
3. Aguarde o app carregar

---

## ✅ Verificação Rápida

### Backend está funcionando?

Abra no navegador: `http://localhost:3000/centers`

Se retornar JSON (mesmo que vazio `[]`), está funcionando! ✅

### Mobile está conectado?

1. Abra o app no Expo Go
2. Na tela de Login, verifique se aparece **"API: http://..."** no topo
3. Se aparecer, está conectado! ✅

---

## 🔍 Solução de Problemas

### Erro: "Porta 3000 já está em uso"

**Solução:** Use outra porta:
```powershell
$env:PORT=3001
npm run dev
```

E atualize a URL no mobile para `http://SEU_IP:3001`

### Erro: "Cannot connect to API"

**Soluções:**
1. Verifique se o backend está rodando
2. Verifique se o IP está correto no mobile
3. Verifique se o celular e PC estão na mesma rede Wi‑Fi
4. Desative temporariamente o firewall do Windows

### Erro: "Database connection failed" (MySQL)

**Soluções:**
1. Verifique se o MySQL está rodando
2. Verifique se as credenciais estão corretas
3. Verifique se o database `doafacil_backend` foi criado

---

## 📝 Resumo dos Comandos

### Backend (SQLite):
```powershell
cd doafacil-backend
npm install
npm run dev
```

### Backend (MySQL):
```powershell
cd doafacil-backend
$env:DB_CONNECTION='mysql'
$env:DB_HOST='127.0.0.1'
$env:DB_PORT='3306'
$env:DB_DATABASE='doafacil_backend'
$env:DB_USERNAME='root'
$env:DB_PASSWORD=''
npm run dev
```

### Mobile:
```powershell
cd doafacil-mobile
npm install
npm start
```

---

## 🎯 Próximos Passos

1. **Criar conta como Centro** → Fica pendente
2. **Entrar como Admin** (`admin@doafacil.local` / `admin123`)
3. **Aprovar o Centro** em Perfil → Aprovar centros
4. **Criar publicações** no Feed
5. **Testar o Chat** entre Doador e Centro

---

**Boa sorte! 🚀**
