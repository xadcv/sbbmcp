const BASE_URL = "https://transport.opendata.ch/v1";

export class TransportAPIError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`Transport API error (HTTP ${status}): ${body}`);
    this.name = "TransportAPIError";
  }
}

function buildURL(
  endpoint: string,
  params: Record<string, string | string[] | undefined>,
): string {
  const url = new URL(`${BASE_URL}/${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) {
        url.searchParams.append(`${key}[]`, v);
      }
    } else {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

export async function fetchTransportAPI<T>(
  endpoint: string,
  params: Record<string, string | string[] | undefined>,
): Promise<T> {
  const url = buildURL(endpoint, params);

  const response = await fetch(url);

  if (!response.ok) {
    const body = await response.text();
    throw new TransportAPIError(response.status, body);
  }

  return (await response.json()) as T;
}
