import type {
  GiftInput,
  InvitationPayload,
  RsvpInput,
  WishInput,
  WishItem,
} from './types';

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8787/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    let message = 'Yêu cầu thất bại.';

    try {
      const body = await response.json();
      if (typeof body?.message === 'string') {
        message = body.message;
      }
    } catch {
      // Keep fallback message when server response is not JSON.
    }

    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export function fetchInvitation(slug: string) {
  return request<InvitationPayload>(`/invitation/${encodeURIComponent(slug)}`);
}

export async function fetchWishes(slug: string) {
  const data = await request<{ wishes: WishItem[] }>(
    `/wishes?slug=${encodeURIComponent(slug)}`
  );
  return data.wishes;
}

export function submitRsvp(payload: RsvpInput) {
  return request<{ message: string }>('/rsvp', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function submitWish(payload: WishInput) {
  return request<{ message: string }>('/wishes', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function submitGift(payload: GiftInput) {
  return request<{ message: string }>('/gifts', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function trackEvent(
  slug: string,
  eventName: string,
  metadata?: Record<string, unknown>
) {
  return request<{ ok: true }>('/analytics/events', {
    method: 'POST',
    body: JSON.stringify({ slug, eventName, metadata }),
  });
}
