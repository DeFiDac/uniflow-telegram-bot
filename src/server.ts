/**
 * UniFlow API Server
 * HTTP API service for wallet operations
 */

require('dotenv').config();

import express from 'express';
import { PrivyClient } from '@privy-io/node';
import { WalletService, PolicyManager, UniswapV4Service } from './core';
import { UniswapV4MintService } from './core/UniswapV4MintService';
import { createRouter, errorHandler, requestLogger } from './api';

// Validate critical environment variables
const requiredEnvVars = ['PRIVY_APP_ID', 'PRIVY_APP_SECRET', 'PRIVY_SIGNER_ID', 'PRIVY_SIGNER_PRIVATE_KEY'];

for (const envVar of requiredEnvVars) {
	if (!process.env[envVar]) {
		console.error(`❌ Missing required environment variable: ${envVar}`);
		process.exit(1);
	}
}

console.log('✅ Environment variables validated');

// Validate optional environment variables
const optionalEnvVars = ['THE_GRAPH_API_KEY', 'COINMARKETCAP_API_KEY'];
optionalEnvVars.forEach((key) => {
	if (!process.env[key]) {
		console.warn(
			`⚠️  Optional env var missing: ${key} - Some features may not work`
		);
	}
});

console.log('🚀 UniFlow API Server starting...');

// Initialize Privy client
const privy = new PrivyClient({
	appId: process.env.PRIVY_APP_ID ?? '',
	appSecret: process.env.PRIVY_APP_SECRET ?? '',
});

// Initialize Uniswap V4 Services
const uniswapV4Service = new UniswapV4Service();
const uniswapV4MintService = new UniswapV4MintService();

// Initialize Express app
const app: express.Express = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(requestLogger);

// Placeholder for WalletService (will be initialized after policy setup)
let walletService: WalletService | undefined;

/**
 * Safe getter for WalletService
 * Throws an error if WalletService has not been initialized
 * @throws Error if WalletService is not initialized
 */
export function getWalletService(): WalletService {
	if (!walletService) {
		throw new Error(
			'WalletService not initialized. Wait for server startup to complete before accessing WalletService.'
		);
	}
	return walletService;
}

// Health check endpoint
app.get('/health', (_req, res) => {
	res.json({
		status: 'ok',
		uptime: process.uptime(),
		timestamp: new Date().toISOString(),
		service: 'UniFlow API',
	});
});

// Shutdown guard
let isShuttingDown = false;
let server: ReturnType<typeof app.listen> | undefined;

// Async initialization function
async function startServer() {
	console.log('🚀 UniFlow API Server starting...');

	// Initialize PolicyManager
	console.log('🔒 Initializing security policies...');
	const policyManager = new PolicyManager(privy);
	const policyResult = await policyManager.initialize();

	if (!policyResult.success) {
		console.error('');
		console.error('═══════════════════════════════════════════════════════════');
		console.error('❌ CRITICAL ERROR: Security Policy Initialization Failed');
		console.error('═══════════════════════════════════════════════════════════');
		console.error('');
		console.error('The server cannot start without security policies in place.');
		console.error('This prevents unauthorized transactions and protects user wallets.');
		console.error('');
		console.error(`Reason: ${policyResult.error}`);
		console.error('');
		console.error('What to do:');
		console.error('  1. Review the error message and troubleshooting steps above');
		console.error('  2. Verify all Privy environment variables are set correctly');
		console.error('  3. Check that your Privy authorization key has policy permissions');
		console.error('  4. Ensure the Privy API is accessible from this server');
		console.error('');
		console.error('For more information, see:');
		console.error('  - README.md (Security Policies section)');
		console.error('  - https://docs.privy.io/controls/overview');
		console.error('');
		console.error('═══════════════════════════════════════════════════════════');
		console.error('');
		process.exit(1); // Fail-closed
		return; // Prevent further execution when process.exit is mocked in tests
	}

	console.log(`✅ Security policies active: ${policyResult.policyIds?.join(', ')}`);

	// Initialize WalletService WITH policy IDs
	walletService = new WalletService(privy, undefined, policyManager.getPolicyIds());

	// API routes
	app.use('/api', createRouter(walletService, uniswapV4Service, uniswapV4MintService));

	// Error handler (must be last)
	app.use(errorHandler);

	// Start server
	server = app.listen(PORT, () => {
		console.log(`✅ UniFlow API Server is running on port ${PORT}`);
		console.log('📡 Available endpoints:');
		console.log(`   GET  /health                      - Health check`);
		console.log(`   POST /api/connect                 - Connect wallet`);
		console.log(`   POST /api/transact                - Execute transaction`);
		console.log(`   POST /api/disconnect              - End session`);
		console.log(`   GET  /api/session/:userId         - Check session`);
		console.log(`   GET  /api/v4/positions/:address   - Get Uniswap V4 positions`);
		console.log(`   GET  /api/v4/pool-info            - Discover pool for token pair`);
		console.log(`   POST /api/v4/approve              - Approve tokens for minting`);
		console.log(`   POST /api/v4/mint                 - Mint Uniswap V4 position`);
	});
}

// Start the server
startServer().catch((error) => {
	console.error('❌ Failed to start server:', error);
	process.exit(1);
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
		// Close HTTP server (only if it was started)
		if (server) {
			const serverToClose = server; // Capture for closure
			await new Promise<void>((resolve, reject) => {
				serverToClose.close((err) => {
					if (err) {
						reject(err);
					} else {
						console.log('✅ HTTP server closed');
						resolve();
					}
				});
			});
		} else {
			console.log('ℹ️  HTTP server was not started, skipping close');
		}

		// Clear sessions (only if walletService was initialized)
		if (walletService) {
			walletService.clearAllSessions();
			console.log('✅ Sessions cleared');
		}

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
// Note: walletService is undefined until startServer() completes
// Use getWalletService() for safe access
export { app, walletService };
