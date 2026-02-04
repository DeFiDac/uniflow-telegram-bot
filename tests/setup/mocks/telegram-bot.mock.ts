import { vi } from 'vitest';

export const createMockTelegramBot = () => ({
	onText: vi.fn(),
	on: vi.fn(),
	once: vi.fn(),
	sendMessage: vi.fn().mockResolvedValue({ message_id: 123 }),
	// Add more methods as needed
});

export type MockTelegramBot = ReturnType<typeof createMockTelegramBot>;
