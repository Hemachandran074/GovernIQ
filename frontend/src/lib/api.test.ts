import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { apiFetch, ApiClientError } from './api';

describe('apiFetch', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends X-API-Key header and parses valid data with Zod', async () => {
    const mockData = { status: 'ok' };
    const schema = z.object({ status: z.string() });

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
    } as Response);

    const result = await apiFetch('/api/health', schema);

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/health'),
      expect.objectContaining({
        headers: expect.any(Headers),
      })
    );

    const callArgs = fetchSpy.mock.calls[0];
    const headers = callArgs?.[1]?.headers as Headers;
    expect(headers.get('X-API-Key')).toBe('dev-secret-key-12345');
    expect(result).toEqual(mockData);
  });

  it('throws ApiClientError with code and message on error response', async () => {
    const errorResponse = {
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid API key',
      },
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => errorResponse,
    } as Response);

    await expect(apiFetch('/api/protected', z.unknown())).rejects.toThrow(ApiClientError);

    try {
      await apiFetch('/api/protected', z.unknown());
    } catch (err) {
      if (err instanceof ApiClientError) {
        expect(err.code).toBe('UNAUTHORIZED');
        expect(err.status).toBe(401);
        expect(err.message).toBe('Invalid API key');
      }
    }
  });
});
