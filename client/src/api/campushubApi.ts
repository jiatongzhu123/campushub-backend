import type {
  ApiErrorResponse,
  CreateReservationDTO,
  Reservation,
  Resource,
} from '../types/api'

const API_PREFIX = '/api/v1'

export class CampusHubApiError extends Error {
  readonly status: number
  readonly code: string | undefined

  constructor(status: number, message: string, code?: string, cause?: unknown) {
    super(message, { cause })
    this.name = 'CampusHubApiError'
    this.status = status
    this.code = code
  }
}

function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  return (
    'code' in value &&
    typeof value.code === 'string' &&
    'message' in value &&
    typeof value.message === 'string'
  )
}

async function requestJson<T>(path: string, options?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_PREFIX}${path}`, options)
  } catch (cause: unknown) {
    throw new CampusHubApiError(0, 'Unable to reach the CampusHub API.', undefined, cause)
  }

  let body: unknown
  try {
    body = await response.json() as unknown
  } catch (cause: unknown) {
    const message: string = response.ok
      ? `The CampusHub API returned an unexpected response (HTTP ${response.status}).`
      : response.status >= 500
        ? `The CampusHub service is unavailable (HTTP ${response.status}). Please try again.`
        : `The CampusHub API could not complete the request (HTTP ${response.status}).`
    throw new CampusHubApiError(
      response.status,
      message,
      undefined,
      cause,
    )
  }

  if (!response.ok) {
    const errorResponse: ApiErrorResponse | undefined = isApiErrorResponse(body)
      ? body
      : undefined
    throw new CampusHubApiError(
      response.status,
      errorResponse?.message ?? `CampusHub API request failed (HTTP ${response.status}).`,
      errorResponse?.code,
    )
  }

  return body as T
}

export async function fetchResources(type?: string): Promise<Resource[]> {
  const query: string = type === undefined ? '' : `?${new URLSearchParams({ type })}`
  return requestJson<Resource[]>(`/resources${query}`)
}

export async function createReservation(
  payload: CreateReservationDTO,
): Promise<Reservation> {
  return requestJson<Reservation>('/reservations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function fetchUserReservations(userId: string): Promise<Reservation[]> {
  return requestJson<Reservation[]>(`/reservations/user/${encodeURIComponent(userId)}`)
}

export async function cancelReservation(reservationId: string): Promise<Reservation> {
  return requestJson<Reservation>(`/reservations/${encodeURIComponent(reservationId)}/cancel`, {
    method: 'PATCH',
  })
}
