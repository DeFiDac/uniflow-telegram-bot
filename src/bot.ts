require('dotenv').config();
import TelegramBot from 'node-telegram-bot-api';
import { PrivyClient } from '@privy-io/node';
import { startHealthServer } from './health';
import { SessionData } from './types';
import { handleConnect, handleTransact, handleDisconnect } from './commands';

// Validate critical environment variables
const requiredEnvVars = [
	'TELEGRAM_TOKEN',
	'PRIVY_APP_ID',
	'PRIVY_APP_SECRET',
	'PRIVY_SIGNER_ID',
];

for (const envVar of requiredEnvVars) {
	if (!process.env[envVar]) {
		console.error(`❌ Missing required environment variable: ${envVar}`);
		process.exit(1);
	}
}

console.log('✅ Environment variables validated');
console.log('🤖 UniFlow Bot starting...');

const token = process.env.TELEGRAM_TOKEN ?? '';
const bot = new TelegramBot(token, { polling: true });
const privy = new PrivyClient({
	appId: process.env.PRIVY_APP_ID ?? '',
	appSecret: process.env.PRIVY_APP_SECRET ?? '',
});

// In-memory session storage (Map for user data)
// TODO: upgrade to DB for persistence
const sessions = new Map<number, SessionData>();

// Shared dependencies for command handlers
const deps = { bot, privy, sessions };

// Start health check server
const healthServer = startHealthServer();

const logSafeError = (label: string, err: unknown) => {
	if (err instanceof Error) {
		console.error(label, { message: err.message, stack: err.stack });
		return;
	}

	console.error(label, String(err));
};

// Global error handler
bot.on('error', (error) => {
	logSafeError('[Bot Error]', error);
});

// Graceful shutdown handler
const gracefulShutdown = async (signal: string) => {
	console.log(`\n${signal} received. Shutting down gracefully...`);

	try {
		// Stop polling
		await bot.stopPolling();
		console.log('✅ Bot stopped polling');

		// Close health check server (await completion)
		await new Promise<void>((resolve, reject) => {
			healthServer.close((err) => {
				if (err) {
					reject(err);
				} else {
					console.log('✅ Health server closed');
					resolve();
				}
			});
		});

		// Clear sessions
		sessions.clear();
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

// Handle polling errors
bot.on('polling_error', (error) => {
	logSafeError('[Polling Error]', error);
});

// Command handlers
bot.onText(/\/connect/, (msg) => handleConnect(msg, deps));
bot.onText(/\/transact/, (msg) => handleTransact(msg, deps));
bot.onText(/\/disconnect/, (msg) => handleDisconnect(msg, deps));

// TODO: create /analyze command to do chain queries and create a summary to be fed into the agent
// TODO: create /opportunities to call specific skills and suggest potential LPs/new tokens

console.log('✅ UniFlow Bot is running and listening for commands');
console.log('📡 Polling mode active');
console.log('📱 Available commands: /connect, /transact, /disconnect');
