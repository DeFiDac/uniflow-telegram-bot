import { vi } from 'vitest';

export const createMockPrivyClient = () => {
  // Create shared instances so they can be mocked consistently
  const mockGetByTelegramUserID = vi.fn();
  const mockCreate = vi.fn();
  const mockWalletCreate = vi.fn();
  const mockWalletList = vi.fn();
  const mockSendTransaction = vi.fn();

  const mockEthereum = vi.fn(() => ({
    sendTransaction: mockSendTransaction,
  }));

  const mockWallets = vi.fn(() => ({
    create: mockWalletCreate,
    list: mockWalletList,
    ethereum: mockEthereum,
  }));

  const mockUsers = vi.fn(() => ({
    getByTelegramUserID: mockGetByTelegramUserID,
    create: mockCreate,
  }));

  return {
    users: mockUsers,
    wallets: mockWallets,
  };
};

export type MockPrivyClient = ReturnType<typeof createMockPrivyClient>;
