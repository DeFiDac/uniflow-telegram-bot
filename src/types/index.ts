import TelegramBot from 'node-telegram-bot-api';
import { PrivyClient } from '@privy-io/node';

export interface SessionData {
  userId: string;    // Privy user ID
  walletId: string;  // Wallet ID or address
}

export interface CommandDependencies {
  bot: TelegramBot;
  privy: PrivyClient;
  sessions: Map<number, SessionData>;
}

export interface CommandHandler {
  (msg: TelegramBot.Message, deps: CommandDependencies): Promise<void>;
}
