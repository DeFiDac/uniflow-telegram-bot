import TelegramBot from 'node-telegram-bot-api';
import { CommandDependencies } from '../types';
import { ERROR_MESSAGES, SUCCESS_MESSAGES } from '../constants';
import { APIError } from '@privy-io/node';

export async function handleConnect(
	msg: TelegramBot.Message,
	{ bot, privy, sessions }: CommandDependencies
): Promise<void> {
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
			if (error instanceof APIError && error.status === 404) {
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

			const signerId = process.env.PRIVY_SIGNER_ID;
			if (!signerId) {
				throw new Error('PRIVY_SIGNER_ID environment variable is not configured');
			}

			const wallet = await privy.wallets().create({
				chain_type: 'ethereum',
				owner: { user_id: privyUser.id },
				additional_signers: [
					{
						signer_id: signerId,
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
		await bot.sendMessage(msg.chat.id, SUCCESS_MESSAGES.WALLET_CONNECTED(walletId));
	} catch (error) {
		console.error('[/connect] Error:', error);
		const errorMessage = error instanceof Error ? error.message : String(error);

		try {
			await bot.sendMessage(
				msg.chat.id,
				`${ERROR_MESSAGES.CONNECTION_FAILED}\n\nError: ${errorMessage}`
			);
		} catch (sendError) {
			console.error('[/connect] Failed to send error message:', sendError);
		}
	}
}
