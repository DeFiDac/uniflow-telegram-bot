import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleConnect } from '@/commands/connect';
import { createMockTelegramBot, MockTelegramBot } from '@tests/setup/mocks/telegram-bot.mock';
import { createMockPrivyClient, MockPrivyClient } from '@tests/setup/mocks/privy-client.mock';
import { createMockMessage, mockMessageWithoutFrom, mockMessageWithoutChat } from '@tests/fixtures/telegram-messages';
import { mockPrivyUser, mockPrivyUserWithWallet, mockWallet } from '@tests/fixtures/privy-responses';
import { SessionData } from '@/types';

describe('handleConnect', () => {
  let mockBot: MockTelegramBot;
  let mockPrivy: MockPrivyClient;
  let sessions: Map<number, SessionData>;

  beforeEach(() => {
    mockBot = createMockTelegramBot();
    mockPrivy = createMockPrivyClient();
    sessions = new Map();
  });

  describe('Happy path - New user', () => {
    it('should create new Privy user when none exists', async () => {
      // Arrange
      const msg = createMockMessage();
      mockPrivy.users().getByTelegramUserID.mockRejectedValue(new Error('User not found'));
      mockPrivy.users().create.mockResolvedValue(mockPrivyUser);
      mockPrivy.wallets().create.mockResolvedValue(mockWallet);

      // Act
      await handleConnect(msg, { bot: mockBot as any, privy: mockPrivy as any, sessions });

      // Assert
      expect(mockPrivy.users().create).toHaveBeenCalledWith({
        linked_accounts: [
          { type: 'telegram', telegram_user_id: '789' }
        ]
      });
      expect(mockPrivy.wallets().create).toHaveBeenCalledWith({
        chain_type: 'ethereum',
        owner: { user_id: mockPrivyUser.id },
        additional_signers: expect.any(Array),
      });
      expect(sessions.has(789)).toBe(true);
      expect(sessions.get(789)).toEqual({
        userId: mockPrivyUser.id,
        walletId: mockWallet.id,
      });
      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        123456,
        expect.stringContaining('Wallet connected successfully')
      );
    });

    it('should reuse existing Privy user', async () => {
      // Arrange
      const msg = createMockMessage();
      mockPrivy.users().getByTelegramUserID.mockResolvedValue(mockPrivyUser);
      mockPrivy.wallets().create.mockResolvedValue(mockWallet);

      // Act
      await handleConnect(msg, { bot: mockBot as any, privy: mockPrivy as any, sessions });

      // Assert
      expect(mockPrivy.users().create).not.toHaveBeenCalled();
      expect(mockPrivy.users().getByTelegramUserID).toHaveBeenCalledWith({
        telegram_user_id: '789'
      });
      expect(sessions.has(789)).toBe(true);
    });

    it('should reuse existing wallet', async () => {
      // Arrange
      const msg = createMockMessage();
      mockPrivy.users().getByTelegramUserID.mockResolvedValue(mockPrivyUserWithWallet);

      // Act
      await handleConnect(msg, { bot: mockBot as any, privy: mockPrivy as any, sessions });

      // Assert
      expect(mockPrivy.wallets().create).not.toHaveBeenCalled();
      expect(sessions.get(789)?.walletId).toBe('0x1234567890abcdef');
    });
  });

  describe('Edge cases', () => {
    it('should return early if msg.from is missing', async () => {
      // Arrange
      const msg = mockMessageWithoutFrom();

      // Act
      await handleConnect(msg, { bot: mockBot as any, privy: mockPrivy as any, sessions });

      // Assert
      expect(mockPrivy.users().getByTelegramUserID).not.toHaveBeenCalled();
      expect(sessions.size).toBe(0);
    });

    it('should return early if msg.chat is missing', async () => {
      // Arrange
      const msg = mockMessageWithoutChat();

      // Act
      await handleConnect(msg, { bot: mockBot as any, privy: mockPrivy as any, sessions });

      // Assert
      expect(mockPrivy.users().getByTelegramUserID).not.toHaveBeenCalled();
      expect(sessions.size).toBe(0);
    });
  });

  describe('Error handling', () => {
    it('should handle Privy API errors gracefully', async () => {
      // Arrange
      const msg = createMockMessage();
      const error = new Error('Privy API error');
      mockPrivy.users().getByTelegramUserID.mockRejectedValue(error);

      // Act
      await handleConnect(msg, { bot: mockBot as any, privy: mockPrivy as any, sessions });

      // Assert
      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        123456,
        expect.stringContaining('Connection failed')
      );
      expect(sessions.size).toBe(0);
    });

    it('should handle message send failures', async () => {
      // Arrange
      const msg = createMockMessage();
      mockPrivy.users().getByTelegramUserID.mockResolvedValue(mockPrivyUser);
      mockPrivy.wallets().create.mockResolvedValue(mockWallet);
      mockBot.sendMessage.mockRejectedValue(new Error('Send failed'));

      // Act & Assert - should not throw
      await expect(
        handleConnect(msg, { bot: mockBot as any, privy: mockPrivy as any, sessions })
      ).resolves.not.toThrow();

      // Session should still be created even if message fails
      expect(sessions.has(789)).toBe(true);
    });
  });
});
