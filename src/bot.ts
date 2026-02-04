require('dotenv').config();
import TelegramBot from 'node-telegram-bot-api';
import { PrivyClient } from '@privy-io/node';
import { startHealthServer } from './health';

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
const sessions = new Map();

// Start health check server
const healthServer = startHealthServer();

// Connect command
bot.onText(/\/connect/, async (msg) => {
	try {
		if (!msg.from) return;
		const telegramUserId = msg.from.id.toString();

		let privyUser;
		try {
			// Check if a Privy user exists with Telegram user ID
			privyUser = await privy.users().getByTelegramUserID({
				telegram_user_id: telegramUserId,
			});
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			if (errorMessage.includes('not found')) {
				privyUser = await privy.users().create({
					linked_accounts: [
						{
							type: 'telegram',
							telegram_user_id: telegramUserId
						}
					]
				});
			} else {
				throw error;
			}
		}

		// Create a wallet with bot as additional signer (agentic signer)
		let walletId: string;
		const existingWallet = privyUser.linked_accounts.find(acc => acc.type === 'wallet');
		if (!existingWallet) {
			const wallet = await privy.wallets().create({
				// TODO: change chain type based on users' demand (if possible)
				chain_type: 'ethereum',
				owner: { user_id: privyUser.id },
				additional_signers: [
					{
						signer_id: process.env.PRIVY_SIGNER_ID ?? "",
						override_policy_ids: []
					}
				]
			});
			walletId = wallet.id;
		} else {
			// For existing wallets from linked_accounts, use address as identifier
			walletId = existingWallet.address;
		}

		// Store in session
		sessions.set(msg.from.id, { userId: privyUser.id, walletId });
		bot.sendMessage(msg.chat.id, `Wallet connected/created! ID: ${walletId}. Now try /analyze.`);
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		bot.sendMessage(msg.chat.id, "Connection failed: " + errorMessage);
	}
});
