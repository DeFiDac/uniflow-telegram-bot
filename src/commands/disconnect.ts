import TelegramBot from 'node-telegram-bot-api';
import { CommandDependencies } from '../types';
import { ERROR_MESSAGES, INFO_MESSAGES, SUCCESS_MESSAGES } from '../constants';

export async function handleDisconnect(
	msg: TelegramBot.Message,
	{ bot, sessions }: CommandDependencies
): Promise<void> {
	try {
		// Validate inputs
		if (!msg.from) {
			console.error('[/disconnect] Missing msg.from');
			return;
		}
		if (!msg.chat?.id) {
			console.error('[/disconnect] Missing chat ID');
			return;
		}

		const userId = msg.from.id;
		const chatId = msg.chat.id;

		console.log(`[/disconnect] User ${userId} initiated disconnect`);

		// Check if session exists
		const session = sessions.get(userId);
		if (!session) {
			await bot.sendMessage(chatId, INFO_MESSAGES.NOT_CONNECTED);
			return;
		}

		// Remove session
		const walletId = session.walletId;
		sessions.delete(userId);
		console.log(`[/disconnect] User ${userId} disconnected from wallet ${walletId}`);

		// Send success message
		await bot.sendMessage(chatId, SUCCESS_MESSAGES.DISCONNECTED);
	} catch (error) {
		console.error('[/disconnect] Error:', error);
		const errorMessage = error instanceof Error ? error.message : String(error);

		try {
			if (!msg.chat?.id) {
				console.error('[/disconnect] Cannot send error message: missing chat ID');
				return;
			}

			await bot.sendMessage(
				msg.chat.id,
				`${ERROR_MESSAGES.DISCONNECT_FAILED}\n\nError: ${errorMessage}`
			);
		} catch (sendError) {
			console.error('[/disconnect] Failed to send error message:', sendError);
		}
	}
}
