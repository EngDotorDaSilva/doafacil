import express from 'express';
import cors from 'cors';
import http from 'http';
import { fileURLToPath } from 'url';
import { db, migrate, touchCenter, touchThread } from './db.js';
import { hashPassword } from './auth.js';
import { createSocket } from './socket.js';
import routes from './routes/index.js';

const PORT = Number(process.env.PORT || 3000);

await migrate();
await seedAdmin();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const uploadsDir = fileURLToPath(new URL('../uploads', import.meta.url));
app.use('/uploads', express.static(uploadsDir));

// Create HTTP server and Socket.IO
const httpServer = http.createServer(app);
const { io, notifyUser, isUserOnline } = createSocket(httpServer);

// Make io, notifyUser, and isUserOnline available to routes
app.set('io', io);
app.set('notifyUser', notifyUser);
app.set('isUserOnline', isUserOnline);

// Use routes
app.use('/', routes);

// Global error handler middleware
app.use((err, req, res, next) => {
  console.error('[Global Error Handler]', err);
  console.error('[Global Error Handler] Stack:', err?.stack);
  console.error('[Global Error Handler] Request:', {
    method: req.method,
    url: req.url,
    body: req.body,
    headers: req.headers
  });
  
  if (!res.headersSent) {
    const isDev = process.env.NODE_ENV !== 'production';
    res.status(err.status || 500).json({
      error: err.message || 'Server error',
      ...(isDev && { stack: err.stack, details: err })
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

httpServer.on('error', (err) => {
  if (err && typeof err === 'object' && 'code' in err && err.code === 'EADDRINUSE') {
    console.error(`\n[DoaFácil] Porta ${PORT} já está em uso.`);
    console.error(`[DoaFácil] Feche o processo que está usando a porta ou rode com outra porta.`);
    console.error(`[DoaFácil] PowerShell (porta alternativa): $env:PORT=3001; npm run dev\n`);
    process.exit(1);
  }
  console.error('\n[DoaFácil] Erro ao iniciar o servidor:', err);
  process.exit(1);
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`DoaFácil backend listening on http://localhost:${PORT}`);
});

async function seedAdmin() {
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@doafacil.local').toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

  const exists = await db.get(`SELECT id FROM users WHERE email = ?`, [adminEmail]);
  if (exists) return;

  const passwordHash = await hashPassword(adminPassword);
  await db.run(`INSERT INTO users (name, email, passwordHash, role) VALUES (?, ?, ?, 'admin')`, [
    'Administrador',
    adminEmail,
    passwordHash
  ]);
  console.log(`Seeded admin user: ${adminEmail} / ${adminPassword}`);
}
