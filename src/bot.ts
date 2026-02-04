require('dotenv').config();
import TelegramBot from 'node-telegram-bot-api';
import { PrivyClient } from '@privy-io/node';

const token = process.env.TELEGRAM_TOKEN ?? '';
const bot = new TelegramBot(token, { polling: true });
const privy = new PrivyClient({
	appId: process.env.PRIVY_APP_ID ?? '',
	appSecret: process.env.PRIVY_APP_SECRET ?? '',
});

// In-memory session storage (Map for user data)
// TODO: upgrade to DB for persistence
const sessions = new Map();

// Constants
const RESPONSE_TIMEOUT = 60000; // 60 seconds for user responses

// Global error handler
bot.on('error', (error) => {
	console.error('[Bot Error]', error);
});

bot.on('polling_error', (error) => {
	console.error('[Polling Error]', error);
});

// Connect command
bot.onText(/\/connect/, async (msg) => {
	try {
		// Validate inputs
		if (!msg.from) {
			console.error('[/connect] Missing msg.from');
			return;
		}
		if (!msg.chat || !msg.chat.id) {
			console.error('[/connect] Missing chat ID');
			return;
		}

		const telegramUserId = msg.from.id.toString();
		console.log(`[/connect] User ${telegramUserId} initiating connection`);

		let privyUser;
		try {
			// Check if a Privy user exists with Telegram user ID
			privyUser = await privy.users().getByTelegramUserID({
				telegram_user_id: telegramUserId,
			});
			console.log(`[/connect] Found existing Privy user: ${privyUser.id}`);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			if (errorMessage.includes('not found')) {
				console.log(`[/connect] Creating new Privy user for ${telegramUserId}`);
				privyUser = await privy.users().create({
					linked_accounts: [
						{
							type: 'telegram',
							telegram_user_id: telegramUserId
						}
					]
				});
				console.log(`[/connect] Created new Privy user: ${privyUser.id}`);
			} else {
				console.error('[/connect] Error fetching Privy user:', error);
				throw error;
			}
		}

		// Validate privy user was created/fetched
		if (!privyUser || !privyUser.id) {
			throw new Error('Failed to create or fetch Privy user');
		}

		// Create a wallet with bot as additional signer (agentic signer)
		let walletId: string;
		const existingWallet = privyUser.linked_accounts.find(acc => acc.type === 'wallet');
		if (!existingWallet) {
			console.log(`[/connect] Creating new wallet for user ${privyUser.id}`);
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
			console.log(`[/connect] Created wallet: ${walletId}`);
		} else {
			// For existing wallets from linked_accounts, use address as identifier
			walletId = existingWallet.address;
			console.log(`[/connect] Using existing wallet: ${walletId}`);
		}

		// Store in session
		sessions.set(msg.from.id, { userId: privyUser.id, walletId });
		await bot.sendMessage(msg.chat.id, `✅ Wallet connected successfully!\n\nWallet ID: ${walletId}\n\nYou can now use /transact to send transactions.`);
	} catch (error) {
		console.error('[/connect] Error:', error);
		const errorMessage = error instanceof Error ? error.message : String(error);

		try {
			await bot.sendMessage(msg.chat.id, `❌ Connection failed. Please try again later.\n\nIf the problem persists, please contact support.\n\nError: ${errorMessage}`);
		} catch (sendError) {
			console.error('[/connect] Failed to send error message:', sendError);
		}
	}
});

// /transact command
bot.onText(/\/transact/, async (msg) => {
	try {
		// Validate inputs
		if (!msg.from) {
			console.error('[/transact] Missing msg.from');
			return;
		}
		if (!msg.chat || !msg.chat.id) {
			console.error('[/transact] Missing chat ID');
			return;
		}

		const userId = msg.from.id;
		const chatId = msg.chat.id;
		console.log(`[/transact] User ${userId} initiating transaction`);

		// Check session
		const session = sessions.get(userId);
		if (!session) {
			console.log(`[/transact] No session found for user ${userId}`);
			await bot.sendMessage(chatId, "❌ Please connect your wallet first with /connect!");
			return;
		}

		// Prompt confirmation with timeout
		await bot.sendMessage(chatId, "🔔 Transaction Request\n\nApprove sample Uniswap V4 swap on Ethereum?\n\n✅ Reply YES to approve\n❌ Reply NO to cancel\n\n⏱️ You have 60 seconds to respond.");

		let responseReceived = false;
		const timeoutId = setTimeout(async () => {
			if (!responseReceived) {
				console.log(`[/transact] User ${userId} response timeout`);
				try {
					await bot.sendMessage(chatId, "⏱️ Transaction request timed out. Please try /transact again if you wish to proceed.");
				} catch (error) {
					console.error('[/transact] Failed to send timeout message:', error);
				}
			}
		}, RESPONSE_TIMEOUT);

		bot.once('message', async (confirmMsg) => {
			try {
				responseReceived = true;
				clearTimeout(timeoutId);

				// Validate confirmation message
				if (!confirmMsg || !confirmMsg.from || confirmMsg.from.id !== userId) {
					console.log('[/transact] Invalid confirmation message');
					return;
				}

				if (!confirmMsg.text) {
					await bot.sendMessage(chatId, "❌ Please reply with text: YES or NO.");
					return;
				}

				const response = confirmMsg.text.toLowerCase().trim();
				console.log(`[/transact] User ${userId} responded: ${response}`);

				if (response === 'yes') {
					try {
						const txParams = {
							// TODO: Add actual transaction parameters
							to: '0x...', // recipient address
							value: '0', // amount in wei
							data: '0x' // transaction data
						};

						console.log(`[/transact] Sending transaction for user ${userId}, wallet ${session.walletId}`);
						const txResponse = await privy.wallets().ethereum().sendTransaction(session.walletId, {
							caip2: 'eip155:1', // Ethereum mainnet (use testnet for testing)
							params: { transaction: txParams }
						});

						console.log(`[/transact] Transaction successful: ${txResponse.hash}`);
						await bot.sendMessage(chatId, `✅ Transaction sent successfully!\n\nTransaction Hash: ${txResponse.hash}`);
					} catch (error) {
						console.error('[/transact] Transaction failed:', error);
						const errorMessage = error instanceof Error ? error.message : String(error);
						await bot.sendMessage(chatId, `❌ Transaction failed. Please try again.\n\nError: ${errorMessage}`);
					}
				} else if (response === 'no') {
					console.log(`[/transact] User ${userId} canceled transaction`);
					await bot.sendMessage(chatId, "❌ Transaction canceled.");
				} else {
					await bot.sendMessage(chatId, "❌ Invalid response. Please reply with YES or NO.\n\nTo start a new transaction, use /transact again.");
				}
			} catch (error) {
				console.error('[/transact] Error handling confirmation:', error);
				try {
					await bot.sendMessage(chatId, "❌ An error occurred. Please try again with /transact.");
				} catch (sendError) {
					console.error('[/transact] Failed to send error message:', sendError);
				}
			}
		});
	} catch (error) {
		console.error('[/transact] Error:', error);
		const errorMessage = error instanceof Error ? error.message : String(error);

		try {
			if (msg.chat && msg.chat.id) {
				await bot.sendMessage(msg.chat.id, `❌ An error occurred. Please try again.\n\nError: ${errorMessage}`);
			}
		} catch (sendError) {
			console.error('[/transact] Failed to send error message:', sendError);
		}
	}
});

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
	console.log('📱 Listening for commands: /connect, /transact');
})();


