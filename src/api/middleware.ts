/**
 * API Middleware - Request validation and error handling
 */

import { Request, Response, NextFunction } from 'express';
import { ApiResponse, ErrorCodes } from '../core/types';

/**
 * Validate that userId is present in request body
 */
export function validateUserId(req: Request, res: Response, next: NextFunction): void {
  const { userId } = req.body;

  if (!userId || typeof userId !== 'string' || userId.trim() === '') {
    const response: ApiResponse = {
      success: false,
      message: 'userId is required',
      error: ErrorCodes.INVALID_REQUEST,
    };
    res.status(400).json(response);
    return;
  }

  // Normalize userId
  req.body.userId = userId.trim();
  next();
}

/**
 * Validate transaction parameters
 */
export function validateTxParams(req: Request, res: Response, next: NextFunction): void {
  const { txParams } = req.body;

  if (!txParams || typeof txParams !== 'object') {
    const response: ApiResponse = {
      success: false,
      message: 'txParams is required',
      error: ErrorCodes.INVALID_REQUEST,
    };
    res.status(400).json(response);
    return;
  }

  const { to, value } = txParams;

  if (!to || typeof to !== 'string') {
    const response: ApiResponse = {
      success: false,
      message: 'txParams.to is required and must be a valid address',
      error: ErrorCodes.INVALID_REQUEST,
    };
    res.status(400).json(response);
    return;
  }

  if (value === undefined || value === null || typeof value !== 'string') {
    const response: ApiResponse = {
      success: false,
      message: 'txParams.value is required and must be a string (hex or decimal)',
      error: ErrorCodes.INVALID_REQUEST,
    };
    res.status(400).json(response);
    return;
  }

  next();
}

/**
 * Global error handler
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error('[API Error]', err);

  const response: ApiResponse = {
    success: false,
    message: 'An internal error occurred',
    error: ErrorCodes.INTERNAL_ERROR,
  };

  res.status(500).json(response);
}

/**
 * Sanitization helper for logs
 */
const SENSITIVE_KEYS = [
  'userId', 'password', 'token', 'secret', 'key',
  'mnemonic', 'privateKey', 'cardNumber', 'account',
  'ssn', 'transactionAmount', 'value'
];

function sanitizeData(data: any): any {
  if (!data) return data;
  if (typeof data !== 'object') return data;

  if (Array.isArray(data)) {
    return data.map(item => sanitizeData(item));
  }

  const sanitized: any = { ...data };

  for (const key of Object.keys(sanitized)) {
    // Redact if key matches sensitive list (case-insensitive partial match)
    if (SENSITIVE_KEYS.some(k => key.toLowerCase().includes(k.toLowerCase()))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof sanitized[key] === 'object') {
      sanitized[key] = sanitizeData(sanitized[key]);
    }
  }

  return sanitized;
}

/**
 * Request logging middleware
 */
export function requestLogger(req: Request, _res: Response, next: NextFunction): void {
  const sanitizedBody = sanitizeData(req.body);
  const sanitizedParams = sanitizeData(req.params);

  console.log(`[API] ${req.method} ${req.path}`, {
    body: sanitizedBody,
    params: sanitizedParams,
  });
  next();
}
