import type { EntriesResponse, Modes, RankResponse } from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new Error(`Cannot reach the API at ${API_URL}. Is the backend running?`);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export type RankParams = {
  now: string;
  modes: Modes;
  groupOffset: number;
  groupLimit: number;
  includeSingleAccountGroups: boolean;
  excludedOffset: number;
  excludedLimit: number;
  excludedReason: string | null;
};

export function fetchRank(params: RankParams, signal: AbortSignal): Promise<RankResponse> {
  const { excludedReason, ...rest } = params;
  return request<RankResponse>("/api/queue/rank", {
    method: "POST",
    body: JSON.stringify({ ...rest, ...(excludedReason ? { excludedReason } : {}) }),
    signal,
  });
}

export function fetchEntries(
  limit: number,
  offset: number,
  signal: AbortSignal,
): Promise<EntriesResponse> {
  return request<EntriesResponse>(`/api/queue/entries?limit=${limit}&offset=${offset}`, { signal });
}

export function updateLoyaltyPoints(id: string, loyaltyPoints: number): Promise<void> {
  return request<unknown>(`/api/queue/entries/${encodeURIComponent(id)}/loyalty-points`, {
    method: "PATCH",
    body: JSON.stringify({ loyaltyPoints }),
  }).then(() => undefined);
}
