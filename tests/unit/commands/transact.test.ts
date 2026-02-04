import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { handleTransact } from '@/commands/transact';
import { createMockTelegramBot, MockTelegramBot } from '@tests/setup/mocks/telegram-bot.mock';
import { createMockPrivyClient, MockPrivyClient } from '@tests/setup/mocks/privy-client.mock';
import { createMockMessage, mockMessageWithoutFrom } from '@tests/fixtures/telegram-messages';
import { mockSession, TEST_TX_HASH } from '@tests/fixtures/test-data';
import { mockTransactionResponse } from '@tests/fixtures/privy-responses';
import { SessionData } from '@/types';

describe('handleTransact', () => {
  let mockBot: MockTelegramBot;
  let mockPrivy: MockPrivyClient;
  let sessions: Map<number, SessionData>;

  beforeEach(() => {
    mockBot = createMockTelegramBot();
    mockPrivy = createMockPrivyClient();
    sessions = new Map();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Happy path', () => {
    it('should prompt for confirmation when session exists', async () => {
      // Arrange
      const msg = createMockMessage();
      sessions.set(789, mockSession);

      // Act
      await handleTransact(msg, { bot: mockBot as any, privy: mockPrivy as any, sessions });

      // Assert
      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        123456,
        expect.stringContaining('Transaction Request')
      );
      expect(mockBot.once).toHaveBeenCalledWith('message', expect.any(Function));
    });

    it('should execute transaction on YES response', async () => {
      // Arrange
      const msg = createMockMessage();
      sessions.set(789, mockSession);
      mockPrivy.wallets().ethereum().sendTransaction.mockResolvedValue(mockTransactionResponse);

      let confirmHandler: any;
      mockBot.once.mockImplementation((event, handler) => {
        confirmHandler = handler;
      });

      // Act
      await handleTransact(msg, { bot: mockBot as any, privy: mockPrivy as any, sessions });

      const confirmMsg = createMockMessage({ text: 'yes' });
      await confirmHandler(confirmMsg);

      // Assert
      expect(mockPrivy.wallets().ethereum().sendTransaction).toHaveBeenCalledWith(
        mockSession.walletId,
        expect.any(Object)
      );
      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        123456,
        expect.stringContaining('Transaction sent successfully')
      );
    });

    it('should cancel transaction on NO response', async () => {
      // Arrange
      const msg = createMockMessage();
      sessions.set(789, mockSession);

      let confirmHandler: any;
      mockBot.once.mockImplementation((event, handler) => {
        confirmHandler = handler;
      });

      // Act
      await handleTransact(msg, { bot: mockBot as any, privy: mockPrivy as any, sessions });

      const confirmMsg = createMockMessage({ text: 'no' });
      await confirmHandler(confirmMsg);

      // Assert
      expect(mockPrivy.wallets().ethereum().sendTransaction).not.toHaveBeenCalled();
      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        123456,
        expect.stringContaining('Transaction canceled')
      );
    });
  });

  describe('Edge cases', () => {
    it('should reject if no session exists', async () => {
      // Arrange
      const msg = createMockMessage();

      // Act
      await handleTransact(msg, { bot: mockBot as any, privy: mockPrivy as any, sessions });

      // Assert
      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        123456,
        expect.stringContaining('connect your wallet first')
      );
      expect(mockBot.once).not.toHaveBeenCalled();
    });

    it('should timeout after 60 seconds', async () => {
      // Arrange
      const msg = createMockMessage();
      sessions.set(789, mockSession);

      // Act
      await handleTransact(msg, { bot: mockBot as any, privy: mockPrivy as any, sessions });

      // Fast-forward time
      await vi.advanceTimersByTimeAsync(60000);

      // Assert
      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        123456,
        expect.stringContaining('timed out')
      );
    });

    it('should reject response from different user', async () => {
      // Arrange
      const msg = createMockMessage();
      sessions.set(789, mockSession);

      let confirmHandler: any;
      mockBot.once.mockImplementation((event, handler) => {
        confirmHandler = handler;
      });

      // Act
      await handleTransact(msg, { bot: mockBot as any, privy: mockPrivy as any, sessions });

      const confirmMsg = createMockMessage({
        text: 'yes',
        from: { id: 999, is_bot: false, first_name: 'Other' }
      });
      await confirmHandler(confirmMsg);

      // Assert
      expect(mockPrivy.wallets().ethereum().sendTransaction).not.toHaveBeenCalled();
    });

    it('should handle invalid response', async () => {
      // Arrange
      const msg = createMockMessage();
      sessions.set(789, mockSession);

      let confirmHandler: any;
      mockBot.once.mockImplementation((event, handler) => {
        confirmHandler = handler;
      });

      // Act
      await handleTransact(msg, { bot: mockBot as any, privy: mockPrivy as any, sessions });

      const confirmMsg = createMockMessage({ text: 'maybe' });
      await confirmHandler(confirmMsg);

      // Assert
      expect(mockPrivy.wallets().ethereum().sendTransaction).not.toHaveBeenCalled();
      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        123456,
        expect.stringContaining('Invalid response')
      );
    });

    it('should return early if msg.from is missing', async () => {
      // Arrange
      const msg = mockMessageWithoutFrom();

      // Act
      await handleTransact(msg, { bot: mockBot as any, privy: mockPrivy as any, sessions });

      // Assert
      expect(mockBot.sendMessage).not.toHaveBeenCalled();
      expect(sessions.size).toBe(0);
    });

    it('should handle response without text', async () => {
      // Arrange
      const msg = createMockMessage();
      sessions.set(789, mockSession);

      let confirmHandler: any;
      mockBot.once.mockImplementation((event, handler) => {
        confirmHandler = handler;
      });

      // Act
      await handleTransact(msg, { bot: mockBot as any, privy: mockPrivy as any, sessions });

      const confirmMsg = createMockMessage({ text: undefined });
      await confirmHandler(confirmMsg);

      // Assert
      expect(mockPrivy.wallets().ethereum().sendTransaction).not.toHaveBeenCalled();
      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        123456,
        expect.stringContaining('Please reply with text')
      );
    });
  });

  describe('Error handling', () => {
    it('should handle transaction failures gracefully', async () => {
      // Arrange
      const msg = createMockMessage();
      sessions.set(789, mockSession);
      mockPrivy.wallets().ethereum().sendTransaction.mockRejectedValue(new Error('Transaction failed'));

      let confirmHandler: any;
      mockBot.once.mockImplementation((event, handler) => {
        confirmHandler = handler;
      });

      // Act
      await handleTransact(msg, { bot: mockBot as any, privy: mockPrivy as any, sessions });

      const confirmMsg = createMockMessage({ text: 'yes' });
      await confirmHandler(confirmMsg);

      // Assert
      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        123456,
        expect.stringContaining('Transaction failed')
      );
    });
  });
});
