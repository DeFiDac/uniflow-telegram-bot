# UniFlow API

HTTP API service for wallet operations powered by Privy.

## Overview

UniFlow provides REST API endpoints for wallet management that can be consumed by external services (e.g., Telegram bots, web frontends).

Built with TypeScript, Express, and @privy-io/node.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/api/connect` | Connect/create wallet for user |
| `POST` | `/api/transact` | Execute a transaction |
| `POST` | `/api/disconnect` | End user session |
| `GET` | `/api/session/:userId` | Check if user has active session |

### POST /api/connect

Create or retrieve a wallet for a user.

**Request:**
```json
{
  "userId": "telegram_123456"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "walletId": "abc123xyz",
    "privyUserId": "did:privy:...",
    "isNewUser": true
  },
  "message": "New wallet created successfully"
}
```

### POST /api/transact

Execute a blockchain transaction.

**Request:**
```json
{
  "userId": "telegram_123456",
  "txParams": {
    "to": "0x...",
    "value": "1000000000000000000",
    "data": "0x",
    "chainId": 1
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "hash": "0x..."
  },
  "message": "Transaction sent successfully"
}
```

### POST /api/disconnect

End user session (wallet remains safe).

**Request:**
```json
{
  "userId": "telegram_123456"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Disconnected successfully"
}
```

### GET /api/session/:userId

Check if user has an active session.

**Response:**
```json
{
  "success": true,
  "data": {
    "hasSession": true,
    "walletId": "abc123xyz"
  },
  "message": "Session found"
}
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PRIVY_APP_ID` | ✅ | Privy application ID |
| `PRIVY_APP_SECRET` | ✅ | Privy application secret |
| `PRIVY_SIGNER_ID` | ✅ | Privy signer ID for agentic transactions |
| `PORT` | ❌ | HTTP server port (default: 3000) |

## Running

```bash
# Install dependencies
pnpm install

# Development
pnpm dev

# Production
pnpm build
pnpm start
```

## Testing

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Generate coverage report
pnpm test:coverage
```

## Error Codes

| Code | Description |
|------|-------------|
| `SESSION_NOT_FOUND` | User needs to connect first |
| `WALLET_CREATION_FAILED` | Failed to create wallet |
| `TRANSACTION_FAILED` | Transaction execution failed |
| `INVALID_REQUEST` | Missing or invalid request parameters |
| `PRIVY_ERROR` | Privy API error |
| `INTERNAL_ERROR` | Internal server error |

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   External Clients                   │
│         (Telegram Bot, Web Frontend, etc.)          │
└───────────────────────┬─────────────────────────────┘
                        │ HTTP/REST
                        ▼
┌─────────────────────────────────────────────────────┐
│                   UniFlow API                        │
│  ┌───────────────┐  ┌───────────────┐               │
│  │   Express     │  │   Middleware  │               │
│  │   Routes      │  │   (Validation)│               │
│  └───────┬───────┘  └───────────────┘               │
│          │                                           │
│  ┌───────▼───────────────────────────┐              │
│  │         WalletService             │              │
│  │   (Platform-agnostic logic)       │              │
│  └───────┬───────────────────────────┘              │
│          │                                           │
│  ┌───────▼───────┐  ┌───────────────┐               │
│  │  Privy Client │  │   Sessions    │               │
│  └───────────────┘  └───────────────┘               │
└─────────────────────────────────────────────────────┘
```
