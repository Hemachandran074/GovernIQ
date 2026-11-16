import { z } from 'zod';
import { env } from './env';
import {
  errorResponseSchema,
  modelOptionSchema,
  queryResultSchema,
  type ErrorResponse,
  type ModelOption,
  type QueryRequest,
  type QueryResult,
} from '../types';

export class ApiClientError extends Error {
  code: string;
  status: number;

  constructor(message: string, code: string = 'API_ERROR', status: number = 500) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.status = status;
  }
}

/**
 * Make an authenticated API request and validate the response against a Zod schema.
 */
export async function apiFetch<T>(
  endpoint: string,
  schema: z.ZodType<T>,
  options: RequestInit = {}
): Promise<T> {
  const baseUrl = env.VITE_API_URL.replace(/\/+$/, '');
  const url = `${baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  const headers = new Headers(options.headers);
  if (!headers.has('X-API-Key')) {
    headers.set('X-API-Key', env.VITE_API_KEY);
  }
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorDetail: ErrorResponse['error'] = {
      code: `HTTP_${response.status}`,
      message: response.statusText || 'Request failed',
    };

    try {
      const errorJson = (await response.json()) as unknown;
      const parsed = errorResponseSchema.safeParse(errorJson);
      if (parsed.success) {
        errorDetail = parsed.data.error;
      }
    } catch {
      // Body was not JSON
    }

    throw new ApiClientError(errorDetail.message, errorDetail.code, response.status);
  }

  const json = (await response.json()) as unknown;
  return schema.parse(json);
}

/**
 * Fetch available LLM models for query engine.
 */
export async function fetchModels(): Promise<ModelOption[]> {
  return apiFetch('/api/models', z.array(modelOptionSchema));
}

/**
 * Submit natural language question to governance query engine.
 */
export async function submitGovernanceQuery(
  payload: QueryRequest
): Promise<QueryResult> {
  return apiFetch('/api/query', queryResultSchema, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
