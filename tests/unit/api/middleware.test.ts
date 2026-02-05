
import { Request, Response, NextFunction } from 'express';
import { validateTxParams, requestLogger } from '../../../src/api/middleware';
import { ErrorCodes } from '../../../src/core/types';
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';

describe('API Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let nextFunction: NextFunction;
  let jsonMock: Mock;
  let statusMock: Mock;

  beforeEach(() => {
    jsonMock = vi.fn();
    statusMock = vi.fn().mockReturnValue({ json: jsonMock });
    mockResponse = {
      status: statusMock,
      json: jsonMock
    } as unknown as Response; // Cast to satisfy type check
    nextFunction = vi.fn();

    // Spy on console.log
    vi.spyOn(console, 'log').mockImplementation(() => { });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('validateTxParams', () => {
    it('should pass for valid string value', () => {
      mockRequest = {
        body: {
          txParams: {
            to: '0x123',
            value: '1000'
          }
        }
      };

      validateTxParams(mockRequest as Request, mockResponse as Response, nextFunction);
      expect(nextFunction).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should fail if value is a number', () => {
      mockRequest = {
        body: {
          txParams: {
            to: '0x123',
            value: 1000
          }
        }
      };

      validateTxParams(mockRequest as Request, mockResponse as Response, nextFunction);
      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        error: ErrorCodes.INVALID_REQUEST,
        message: expect.stringContaining('must be a string')
      }));
    });

    it('should fail if value is null', () => {
      mockRequest = {
        body: {
          txParams: {
            to: '0x123',
            value: null
          }
        }
      };

      validateTxParams(mockRequest as Request, mockResponse as Response, nextFunction);
      expect(statusMock).toHaveBeenCalledWith(400);
    });
  });

  describe('requestLogger', () => {
    it('should redact sensitive keys in body', () => {
      mockRequest = {
        method: 'POST',
        path: '/test',
        body: {
          userId: 'secret-user',
          data: 'public',
          nested: {
            privateKey: 'very-secret',
            safe: 'value'
          },
          list: [{ account: '123' }]
        },
        params: {}
      };

      requestLogger(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('[API] POST /test'),
        expect.objectContaining({
          body: expect.objectContaining({
            userId: '[REDACTED]',
            data: 'public',
            nested: expect.objectContaining({
              privateKey: '[REDACTED]',
              safe: 'value'
            }),
            list: expect.arrayContaining([
              expect.objectContaining({ account: '[REDACTED]' })
            ])
          })
        })
      );
      expect(nextFunction).toHaveBeenCalled();
    });
  });
});
