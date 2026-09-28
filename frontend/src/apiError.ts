export class ApiError extends Error {
  constructor(message: string, public fieldErrors: Record<string, string> = {}) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function readApiError(response: Response, fallback: string): Promise<ApiError> {
  try {
    const data = await response.json();
    const fields: Record<string, string> = {};
    if (data?.fieldErrors && typeof data.fieldErrors === 'object') {
      for (const [key, value] of Object.entries(data.fieldErrors)) {
        if (typeof value === 'string') fields[key] = value;
      }
    }
    let message = typeof data?.message === 'string' ? data.message : fallback;
    if (response.status === 429) {
      const seconds = Number(response.headers.get('Retry-After'));
      if (seconds > 0) message += ` Try again in about ${Math.ceil(seconds / 60)} minute(s).`;
    }
    return new ApiError(message, fields);
  } catch {
    return new ApiError(fallback);
  }
}

export async function getApiErrorMessage(response: Response, fallback: string): Promise<string> {
  return (await readApiError(response, fallback)).message;
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
