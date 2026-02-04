import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
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
	let messageHandler: any; // Captured persistent message handler
	let handleTransact: any; // Dynamically imported function

	beforeEach(async () => {
		// Reset modules to clear module-level state
		await vi.resetModules();

		mockBot = createMockTelegramBot();
		mockPrivy = createMockPrivyClient();
		sessions = new Map();
		vi.useFakeTimers();

		// Capture the persistent message handler when bot.on('message') is called
		mockBot.on.mockImplementation((event, handler) => {
			if (event === 'message') {
				messageHandler = handler;
			}
			return mockBot as any; // Return bot for chaining
		});

		// Dynamically import handleTransact after resetting modules
		const module = await import('@/commands/transact');
		handleTransact = module.handleTransact;
	});

	afterEach(() => {
		vi.useRealTimers();
		messageHandler = null;
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
			expect(mockBot.on).toHaveBeenCalledWith('message', expect.any(Function));
			expect(messageHandler).toBeDefined();
		});

		it('should execute transaction on YES response', async () => {
			// Arrange
			const msg = createMockMessage();
			sessions.set(789, mockSession);
			mockPrivy.wallets().ethereum().sendTransaction.mockResolvedValue(mockTransactionResponse);

			// Act
			await handleTransact(msg, { bot: mockBot as any, privy: mockPrivy as any, sessions });

			const confirmMsg = createMockMessage({ text: 'yes' });
			await messageHandler(confirmMsg);

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

			// Act
			await handleTransact(msg, { bot: mockBot as any, privy: mockPrivy as any, sessions });

			const confirmMsg = createMockMessage({ text: 'no' });
			await messageHandler(confirmMsg);

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
			expect(mockBot.on).not.toHaveBeenCalled();
		});

		it('should timeout after 60 seconds', async () => {
			// Arrange
			const msg = createMockMessage();
			sessions.set(789, mockSession);

			// Act
			await handleTransact(msg, { bot: mockBot as any, privy: mockPrivy as any, sessions });

			// Fast-forward time
			await vi.advanceTimersByTimeAsync(60000);

			// Assert - check the last call to sendMessage (first call is the prompt)
			const calls = mockBot.sendMessage.mock.calls;
			const lastCall = calls[calls.length - 1];
			expect(lastCall[1]).toContain('timed out');
		});

		it('should reject response from different user', async () => {
			// Arrange
			const msg = createMockMessage();
			sessions.set(789, mockSession);

			// Act
			await handleTransact(msg, { bot: mockBot as any, privy: mockPrivy as any, sessions });

			const confirmMsg = createMockMessage({
				text: 'yes',
				from: { id: 999, is_bot: false, first_name: 'Other' },
			});
			await messageHandler(confirmMsg);

			// Assert - message from wrong user should be ignored
			expect(mockPrivy.wallets().ethereum().sendTransaction).not.toHaveBeenCalled();
		});

		it('should handle invalid response', async () => {
			// Arrange
			const msg = createMockMessage();
			sessions.set(789, mockSession);

			// Act
			await handleTransact(msg, { bot: mockBot as any, privy: mockPrivy as any, sessions });

			const confirmMsg = createMockMessage({ text: 'maybe' });
			await messageHandler(confirmMsg);

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

			// Act
			await handleTransact(msg, { bot: mockBot as any, privy: mockPrivy as any, sessions });

			const confirmMsg = createMockMessage({ text: undefined });
			await messageHandler(confirmMsg);

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
			mockPrivy
				.wallets()
				.ethereum()
				.sendTransaction.mockRejectedValue(new Error('Transaction failed'));

			// Act
			await handleTransact(msg, { bot: mockBot as any, privy: mockPrivy as any, sessions });

			const confirmMsg = createMockMessage({ text: 'yes' });
			await messageHandler(confirmMsg);

			// Assert
			expect(mockBot.sendMessage).toHaveBeenCalledWith(
				123456,
				expect.stringContaining('Transaction failed')
			);
		});
	});
});
