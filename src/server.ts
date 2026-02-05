/**
 * UniFlow API Server
 * HTTP API service for wallet operations
 */

require('dotenv').config();

import express from 'express';
import { PrivyClient } from '@privy-io/node';
import { WalletService } from './core';
import { createRouter, errorHandler, requestLogger } from './api';

// Validate critical environment variables
const requiredEnvVars = ['PRIVY_APP_ID', 'PRIVY_APP_SECRET', 'PRIVY_SIGNER_ID'];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`❌ Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

console.log('✅ Environment variables validated');
console.log('🚀 UniFlow API Server starting...');

// Initialize Privy client
const privy = new PrivyClient({
  appId: process.env.PRIVY_APP_ID ?? '',
  appSecret: process.env.PRIVY_APP_SECRET ?? '',
});

// Initialize WalletService
const walletService = new WalletService(privy);

// Initialize Express app
const app: express.Express = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(requestLogger);

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    service: 'UniFlow API',
  });
});

// API routes
app.use('/api', createRouter(walletService));

// Error handler (must be last)
app.use(errorHandler);

// Shutdown guard
let isShuttingDown = false;

// Start server
const server = app.listen(PORT, () => {
  console.log(`✅ UniFlow API Server is running on port ${PORT}`);
  console.log('📡 Available endpoints:');
  console.log(`   GET  /health         - Health check`);
  console.log(`   POST /api/connect    - Connect wallet`);
  console.log(`   POST /api/transact   - Execute transaction`);
  console.log(`   POST /api/disconnect - End session`);
  console.log(`   GET  /api/session/:userId - Check session`);
});

// Graceful shutdown handler
const gracefulShutdown = async (signal: string) => {
  if (isShuttingDown) {
    console.log(`${signal} received, but shutdown already in progress. Ignoring.`);
    return;
  }

  isShuttingDown = true;
  console.log(`\n${signal} received. Shutting down gracefully...`);

  try {
    // Close HTTP server
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) {
          reject(err);
        } else {
          console.log('✅ HTTP server closed');
          resolve();
        }
      });
    });

    // Clear sessions
    walletService.clearAllSessions();
    console.log('✅ Sessions cleared');

    console.log('👋 Shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
};

// Register shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Export for testing
export { app, walletService };
