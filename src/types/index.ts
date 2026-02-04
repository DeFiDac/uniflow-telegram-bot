import TelegramBot from 'node-telegram-bot-api';
import { PrivyClient } from '@privy-io/node';

export interface SessionData {
	userId: string; // Privy user ID
	walletId: string; // Privy wallet ID (lowercase alphanumeric, e.g., "id2tptkqrxd39qo9j423etij")
}

export interface CommandDependencies {
	bot: TelegramBot;
	privy: PrivyClient;
	sessions: Map<number, SessionData>;
}

export interface CommandHandler {
	(msg: TelegramBot.Message, deps: CommandDependencies): Promise<void>;
}
