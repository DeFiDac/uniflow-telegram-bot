import TelegramBot from 'node-telegram-bot-api';
import { PrivyClient } from '@privy-io/node';
import { CommandDependencies, SessionData } from '../types';
import { ERROR_MESSAGES, INFO_MESSAGES, SUCCESS_MESSAGES, RESPONSE_TIMEOUT } from '../constants';

// Module-level state for pending confirmations
interface PendingConfirmation {
	chatId: number;
	userId: number;
	walletId: string;
	timeoutId: NodeJS.Timeout;
	responseReceived: boolean;
}

const pendingConfirmations = new Map<number, PendingConfirmation>();
let messageHandlerSetup = false;

/**
 * Sets up a persistent message handler for transaction confirmations.
 * Only called once per bot instance.
 */
function setupMessageHandler(
	bot: TelegramBot,
	privy: PrivyClient,
	sessions: Map<number, SessionData>
) {
	if (messageHandlerSetup) return;
	messageHandlerSetup = true;

	bot.on('message', async (msg) => {
		// Only process messages with user and chat info
		if (!msg.from || !msg.chat) return;

		const userId = msg.from.id;
		const chatId = msg.chat.id;

		// Check if this user has a pending confirmation
		const pending = pendingConfirmations.get(userId);
		if (!pending) return; // Not waiting for confirmation from this user

		// Validate message is from the correct chat
		if (pending.chatId !== chatId) {
			console.log(
				`[/transact] Ignoring message from user ${userId} in wrong chat ${chatId} (expected ${pending.chatId})`
			);
			return;
		}

		// Valid message from correct user in correct chat - set flag and clear timeout BEFORE any async work
		pending.responseReceived = true;
		clearTimeout(pending.timeoutId);

		try {
			if (!msg.text) {
				await bot.sendMessage(chatId, '❌ Please reply with text: YES or NO.');
				return;
			}

			const response = msg.text.toLowerCase().trim();
			console.log(`[/transact] User ${userId} responded: ${response}`);

			// Remove from pending confirmations (confirmation received)
			pendingConfirmations.delete(userId);

			if (response === 'yes') {
				try {
					//TODO: use function parameters to create dynamic transactions
					const txParams = {
						to: '0x...', // recipient address
						value: '0', // amount in wei
						data: '0x', // transaction data
					};

					console.log(
						`[/transact] Sending transaction for user ${userId}, wallet ${pending.walletId}`
					);
					const txResponse = await privy
						.wallets()
						.ethereum()
						.sendTransaction(pending.walletId, {
							caip2: 'eip155:1', // Ethereum mainnet (use testnet for testing)
							params: { transaction: txParams },
						});

					console.log(`[/transact] Transaction successful: ${txResponse.hash}`);
					await bot.sendMessage(chatId, SUCCESS_MESSAGES.TRANSACTION_SENT(txResponse.hash));
				} catch (error) {
					console.error('[/transact] Transaction failed:', error);
					const errorMessage = error instanceof Error ? error.message : String(error);
					await bot.sendMessage(
						chatId,
						`${ERROR_MESSAGES.TRANSACTION_FAILED}\n\nError: ${errorMessage}`
					);
				}
			} else if (response === 'no') {
				console.log(`[/transact] User ${userId} canceled transaction`);
				await bot.sendMessage(chatId, INFO_MESSAGES.TRANSACTION_CANCELED);
			} else {
				await bot.sendMessage(chatId, INFO_MESSAGES.INVALID_RESPONSE);
			}
		} catch (error) {
			console.error('[/transact] Error handling confirmation:', error);
			// Ensure pending confirmation is removed on error
			pendingConfirmations.delete(userId);
			try {
				await bot.sendMessage(chatId, '❌ An error occurred. Please try again with /transact.');
			} catch (sendError) {
				console.error('[/transact] Failed to send error message:', sendError);
			}
		}
	});
}

export async function handleTransact(
	msg: TelegramBot.Message,
	{ bot, privy, sessions }: CommandDependencies
): Promise<void> {
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
			await bot.sendMessage(chatId, ERROR_MESSAGES.NO_SESSION);
			return;
		}

		// Check if user already has a pending confirmation
		if (pendingConfirmations.has(userId)) {
			console.log(`[/transact] User ${userId} already has a pending transaction`);
			await bot.sendMessage(
				chatId,
				'⚠️ You already have a pending transaction. Please respond to it first or wait for it to timeout.'
			);
			return;
		}

		// Set up persistent message handler (one-time setup)
		setupMessageHandler(bot, privy, sessions);

		// Prompt confirmation with timeout
		await bot.sendMessage(
			chatId,
			'🔔 Transaction Request\n\nApprove sample Uniswap V4 swap on Ethereum?\n\n✅ Reply YES to approve\n❌ Reply NO to cancel\n\n⏱️ You have 60 seconds to respond.'
		);

		// Set up timeout that cleans up pending confirmation
		const timeoutId = setTimeout(async () => {
			const pending = pendingConfirmations.get(userId);
			if (pending && !pending.responseReceived) {
				console.log(`[/transact] User ${userId} response timeout`);
				// Remove from pending confirmations (timeout)
				pendingConfirmations.delete(userId);
				try {
					await bot.sendMessage(chatId, INFO_MESSAGES.TRANSACTION_TIMEOUT);
				} catch (error) {
					console.error('[/transact] Failed to send timeout message:', error);
				}
			}
		}, RESPONSE_TIMEOUT);

		// Add to pending confirmations
		pendingConfirmations.set(userId, {
			chatId,
			userId,
			walletId: session.walletId,
			timeoutId,
			responseReceived: false,
		});

		console.log(`[/transact] Waiting for confirmation from user ${userId} in chat ${chatId}`);
	} catch (error) {
		console.error('[/transact] Error:', error);
		const errorMessage = error instanceof Error ? error.message : String(error);

		// Clean up pending confirmation on error
		if (msg.from) {
			pendingConfirmations.delete(msg.from.id);
		}

		try {
			if (msg.chat && msg.chat.id) {
				await bot.sendMessage(
					msg.chat.id,
					`${ERROR_MESSAGES.GENERIC_ERROR}\n\nError: ${errorMessage}`
				);
			}
		} catch (sendError) {
			console.error('[/transact] Failed to send error message:', sendError);
		}
	}
}
