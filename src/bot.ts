require('dotenv').config();
import TelegramBot from 'node-telegram-bot-api';
import { PrivyClient } from '@privy-io/node';
import { SessionData } from './types';
import { handleConnect, handleTransact, handleDisconnect } from './commands';

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

// Global error handler
bot.on('error', (error) => {
  console.error('[Bot Error]', error);
});

bot.on('polling_error', (error) => {
  console.error('[Polling Error]', error);
});

// Command handlers
bot.onText(/\/connect/, (msg) => handleConnect(msg, deps));
bot.onText(/\/transact/, (msg) => handleTransact(msg, deps));
bot.onText(/\/disconnect/, (msg) => handleDisconnect(msg, deps));

// TODO: create /analyze command to do chain queries and create a summary to be fed into the agent
// TODO: create /opportunities to call specific skills and suggest potential LPs/new tokens

// Startup validation
(() => {
  const requiredEnvVars = ['TELEGRAM_TOKEN', 'PRIVY_APP_ID', 'PRIVY_APP_SECRET', 'PRIVY_SIGNER_ID'];
  const missing = requiredEnvVars.filter(v => !process.env[v]);

  if (missing.length > 0) {
    console.error(`❌ Missing required environment variables: ${missing.join(', ')}`);
    console.error('Please check your .env file and ensure all required variables are set.');
    process.exit(1);
  }

  console.log('✅ Bot started successfully');
  console.log('📱 Listening for commands: /connect, /transact, /disconnect');
})();
