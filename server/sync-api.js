/* eslint-disable */
/**
 * API REST local para executar sync-devices.sh on-demand
 * 
 * Versão: 1.2.0
 * Data: 2025-12-13
 * 
 * Esta API roda no droplet e permite que Edge Functions
 * executem o sync-devices.sh apenas quando necessário,
 * sem precisar de cron jobs constantes.
 * 
 * SEGURANÇA: Aceita requests de localhost OU via NGINX proxy
 */

const express = require('express');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.SYNC_API_PORT || 3001;
const API_SECRET = process.env.SYNC_API_SECRET || '';

// Rate limiting simples (prevenir spam)
const requestLog = new Map();
const RATE_LIMIT = 10; // max 10 requests por minuto por IP
const RATE_WINDOW = 60000; // 1 minuto

app.use(express.json());

// Middleware: Log todas as requests
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  const forwardedFor = req.headers['x-forwarded-for'] || 'none';
  const realIp = req.headers['x-real-ip'] || 'none';
  console.log(`[${timestamp}] ${req.method} ${req.path} from ${req.ip} (X-Forwarded-For: ${forwardedFor}, X-Real-IP: ${realIp})`);
  next();
});

// Middleware: Verificar se vem de localhost (direto ou via proxy)
app.use((req, res, next) => {
  const ip = req.ip?.replace('::ffff:', '');
  const forwardedFor = req.headers['x-forwarded-for'];
  const realIp = req.headers['x-real-ip'];
  
  // PERMITIR SE:
  // 1. Request direto de localhost (127.0.0.1, ::1)
  // 2. Request via NGINX proxy (tem X-Forwarded-For ou X-Real-IP header)
  const isLocalDirect = ['127.0.0.1', '::1', 'localhost'].includes(ip);
  const isViaProxy = forwardedFor || realIp;
  
  if (!isLocalDirect && !isViaProxy) {
    console.error(`[SECURITY] Request blocked from: ${ip}, no proxy headers`);
    return res.status(403).json({ 
      error: 'forbidden',
      message: 'API only accessible from localhost or via NGINX proxy'
    });
  }
  
  console.log(`[SECURITY] Request accepted: direct=${isLocalDirect}, proxy=${!!isViaProxy}`);
  next();
});

// Middleware: Rate limiting
app.use((req, res, next) => {
  const ip = req.ip;
  const now = Date.now();
  
  if (!requestLog.has(ip)) {
    requestLog.set(ip, []);
  }
  
  const requests = requestLog.get(ip);
  const recentRequests = requests.filter(time => now - time < RATE_WINDOW);
  
  if (recentRequests.length >= RATE_LIMIT) {
    return res.status(429).json({
      error: 'rate_limit_exceeded',
      message: `Maximum ${RATE_LIMIT} requests per minute`
    });
  }
  
  recentRequests.push(now);
  requestLog.set(ip, recentRequests);
  
  next();
});

// Middleware: Verificar token de autenticação
app.use((req, res, next) => {
  // Allow /health endpoint to bypass authentication
  const p = req.path || '';
  const ou = req.originalUrl || '';
  if (p === '/health' || ou.startsWith('/health')) {
    return next();
  }

  if (!API_SECRET) {
    console.error('[CONFIG] SYNC_API_SECRET not set - API is insecure!');
  }
  
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'unauthorized',
      message: 'Missing or invalid Authorization header'
    });
  }
  
  const token = authHeader.substring(7);
  
  if (API_SECRET && token !== API_SECRET) {
    console.error('[SECURITY] Invalid API token attempt');
    return res.status(401).json({
      error: 'unauthorized',
      message: 'Invalid API token'
    });
  }
  
  next();
});

// Health check endpoint (não requer auth)
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// POST /sync - Executa sync-devices.sh
app.post('/sync', async (req, res) => {
  const startTime = Date.now();
  console.log('[SYNC] Starting sync-devices.sh execution...');
  
  const scriptPath = path.join(__dirname, '..', 'scripts', 'sync-devices.sh');
  
  // Verificar se script existe
  if (!fs.existsSync(scriptPath)) {
    console.error(`[SYNC] Script not found: ${scriptPath}`);
    return res.status(500).json({
      error: 'script_not_found',
      message: 'sync-devices.sh not found',
      path: scriptPath
    });
  }
  
  // Executar script
  exec(`bash "${scriptPath}"`, {
    timeout: 30000, // 30 segundos timeout
    maxBuffer: 1024 * 1024 * 10, // 10MB buffer
  }, (error, stdout, stderr) => {
    const duration = Date.now() - startTime;
    
    if (error) {
      console.error(`[SYNC] Error executing script (${duration}ms):`, error.message);
      console.error(`[SYNC] stderr:`, stderr);
      
      return res.status(500).json({
        error: 'sync_failed',
        message: error.message,
        stderr: stderr.substring(0, 1000), // Limitar output
        duration_ms: duration
      });
    }
    
    console.log(`[SYNC] Completed successfully (${duration}ms)`);
    console.log(`[SYNC] stdout:`, stdout.substring(0, 500));
    
    res.json({
      success: true,
      message: 'Sync completed successfully',
      duration_ms: duration,
      output: stdout.substring(0, 1000) // Limitar output
    });
  });
});

// Cleanup: Limpar requestLog a cada 5 minutos
setInterval(() => {
  const now = Date.now();
  for (const [ip, requests] of requestLog.entries()) {
    const recentRequests = requests.filter(time => now - time < RATE_WINDOW);
    if (recentRequests.length === 0) {
      requestLog.delete(ip);
    } else {
      requestLog.set(ip, recentRequests);
    }
  }
}, 5 * 60 * 1000);

// Start server
app.listen(PORT, '127.0.0.1', () => {
  console.log('========================================');
  console.log('  RustDesk Sync API');
  console.log('========================================');
  console.log(`  Status: Running`);
  console.log(`  Port: ${PORT}`);
  console.log(`  Host: 127.0.0.1 (localhost only)`);
  console.log(`  Auth: ${API_SECRET ? 'Enabled' : 'DISABLED (INSECURE!)'}`);
  console.log('========================================');
  console.log('');
  console.log('Endpoints:');
  console.log('  GET  /health - Health check (no auth)');
  console.log('  POST /sync   - Trigger sync (requires auth)');
  console.log('');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[SHUTDOWN] SIGTERM received, closing server...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[SHUTDOWN] SIGINT received, closing server...');
  process.exit(0);
});