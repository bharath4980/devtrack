export type ApiErrorResponse = {
  timestamp?: string;
  status?: number;
  error?: string;
  message?: string;
  path?: string;
  fieldErrors?: Record<string, string>;
};

export async function getApiErrorMessage(
  response: Response,
  fallbackMessage: string,
): Promise<string> {
  try {
    const data =
      (await response.json()) as ApiErrorResponse;

    if (data.fieldErrors) {
      const firstFieldError =
        Object.values(data.fieldErrors)[0];

      if (firstFieldError) {
        return firstFieldError;
      }
    }

    if (data.message) {
      return data.message;
    }
  } catch {
    // The response did not contain readable JSON.
  }

  return fallbackMessage;
}