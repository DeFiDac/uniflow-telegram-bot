import { describe, it, expect, beforeEach } from 'vitest';
import { handleDisconnect } from '@/commands/disconnect';
import { createMockTelegramBot, MockTelegramBot } from '@tests/setup/mocks/telegram-bot.mock';
import { createMockMessage, mockMessageWithoutFrom, mockMessageWithoutChat } from '@tests/fixtures/telegram-messages';
import { mockSession } from '@tests/fixtures/test-data';
import { SessionData } from '@/types';

describe('handleDisconnect', () => {
  let mockBot: MockTelegramBot;
  let sessions: Map<number, SessionData>;

  beforeEach(() => {
    mockBot = createMockTelegramBot();
    sessions = new Map();
  });

  describe('Happy path', () => {
    it('should disconnect user with active session', async () => {
      // Arrange
      const msg = createMockMessage();
      sessions.set(789, mockSession);

      // Act
      await handleDisconnect(msg, { bot: mockBot as any, privy: null as any, sessions });

      // Assert
      expect(sessions.has(789)).toBe(false);
      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        123456,
        expect.stringContaining('Disconnected successfully')
      );
    });
  });

  describe('Edge cases', () => {
    it('should handle disconnect without active session', async () => {
      // Arrange
      const msg = createMockMessage();

      // Act
      await handleDisconnect(msg, { bot: mockBot as any, privy: null as any, sessions });

      // Assert
      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        123456,
        expect.stringContaining('not currently connected')
      );
    });

    it('should return early if msg.from is missing', async () => {
      // Arrange
      const msg = mockMessageWithoutFrom();

      // Act
      await handleDisconnect(msg, { bot: mockBot as any, privy: null as any, sessions });

      // Assert
      expect(mockBot.sendMessage).not.toHaveBeenCalled();
    });

    it('should return early if msg.chat is missing', async () => {
      // Arrange
      const msg = mockMessageWithoutChat();

      // Act
      await handleDisconnect(msg, { bot: mockBot as any, privy: null as any, sessions });

      // Assert
      expect(mockBot.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('Multi-user isolation', () => {
    it('should only disconnect the requesting user', async () => {
      // Arrange
      sessions.set(789, mockSession);
      sessions.set(999, { userId: 'other_user', walletId: 'other_wallet' });
      const msg = createMockMessage();

      // Act
      await handleDisconnect(msg, { bot: mockBot as any, privy: null as any, sessions });

      // Assert
      expect(sessions.has(789)).toBe(false);
      expect(sessions.has(999)).toBe(true);
    });
  });

  describe('Error handling', () => {
    it('should handle error when sending success message', async () => {
      // Arrange
      const msg = createMockMessage();
      sessions.set(789, mockSession);
      mockBot.sendMessage.mockRejectedValue(new Error('Send failed'));

      // Act & Assert - should not throw
      await expect(
        handleDisconnect(msg, { bot: mockBot as any, privy: null as any, sessions })
      ).resolves.not.toThrow();

      // Session should still be removed
      expect(sessions.has(789)).toBe(false);
    });
  });
});
