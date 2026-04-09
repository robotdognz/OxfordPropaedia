import { useEffect, useState } from 'preact/hooks';

interface JsonPayloadState<T> {
  data: T | null;
  error: boolean;
}

const jsonPayloadCache = new Map<string, unknown>();
const jsonPayloadRequests = new Map<string, Promise<unknown>>();

export function useJsonPayload<T>(url: string): JsonPayloadState<T> {
  const [state, setState] = useState<JsonPayloadState<T>>({
    data: (jsonPayloadCache.get(url) as T | undefined) ?? null,
    error: false,
  });

  useEffect(() => {
    let active = true;

    const cached = jsonPayloadCache.get(url) as T | undefined;
    if (cached) {
      setState({
        data: cached,
        error: false,
      });
      return () => {
        active = false;
      };
    }

    let request = jsonPayloadRequests.get(url) as Promise<T> | undefined;
    if (!request) {
      request = fetch(url, {
        cache: 'default',
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error(`Failed to load ${url}`);
          }
          return response.json() as Promise<T>;
        })
        .then((data) => {
          jsonPayloadCache.set(url, data);
          jsonPayloadRequests.delete(url);
          return data;
        })
        .catch((error) => {
          jsonPayloadRequests.delete(url);
          throw error;
        });
      jsonPayloadRequests.set(url, request);
    }

    request
      .then((data) => {
        if (!active) return;
        setState({
          data,
          error: false,
        });
      })
      .catch((error) => {
        if (!active) return;
        setState({
          data: null,
          error: true,
        });
      });

    return () => {
      active = false;
    };
  }, [url]);

  return state;
}
