import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import { CampusHubApiError, fetchResources } from '../src/api/campushubApi.ts'
import { bookingErrorMessage, cancellationErrorMessage } from '../src/hooks/useReservations.ts'

test('non-JSON proxy errors retain status and show a useful message', async (): Promise<void> => {
  const fetchMock = mock.method(
    globalThis,
    'fetch',
    async (): Promise<Response> => new Response('<html>Bad Gateway</html>', { status: 502 }),
  )

  try {
    await assert.rejects(fetchResources(), (cause: unknown): boolean => {
      assert.ok(cause instanceof CampusHubApiError)
      assert.equal(cause.status, 502)
      assert.match(cause.message, /service is unavailable/i)
      assert.doesNotMatch(cause.message, /invalid JSON/i)
      return true
    })
  } finally {
    fetchMock.mock.restore()
  }
})

test('booking feedback preserves exact HTTP and network error messages', (): void => {
  interface ErrorCase {
    status: number
    message: string
    expected: string
  }

  const cases: ErrorCase[] = [
    {
      status: 400,
      message: 'endTime must be later than startTime.',
      expected: 'Please check your booking details. endTime must be later than startTime.',
    },
    {
      status: 409,
      message: 'Resource is already reserved for this time slot.',
      expected: 'This resource is already reserved for that time window. Choose different times and try again.',
    },
    {
      status: 500,
      message: 'An unexpected server error occurred.',
      expected: 'The booking service encountered an error. Please try again later.',
    },
    {
      status: 0,
      message: 'Unable to reach the CampusHub API.',
      expected: 'The booking service could not be reached. Check your connection and try again.',
    },
    { status: 502, message: 'Service unavailable.', expected: 'Service unavailable.' },
  ]

  for (const errorCase of cases) {
    assert.equal(
      bookingErrorMessage(new CampusHubApiError(errorCase.status, errorCase.message)),
      errorCase.expected,
    )
  }
})

test('unexpected booking failures retain generic feedback', (): void => {
  const failures: unknown[] = [
    new Error('Internal details'),
    'Internal details',
    { status: 409, message: 'Not a CampusHubApiError' },
    null,
    undefined,
  ]

  for (const failure of failures) {
    assert.equal(bookingErrorMessage(failure), 'The booking could not be completed. Please try again.')
  }
})

test('cancellation feedback preserves not-found, network, API, and unexpected-error messages', (): void => {
  const cases: Array<{ cause: unknown; expected: string }> = [
    {
      cause: new CampusHubApiError(404, 'Reservation not found.'),
      expected: 'This reservation could not be found. Refresh the list and try again.',
    },
    {
      cause: new CampusHubApiError(0, 'Unable to reach the CampusHub API.'),
      expected: 'The booking service could not be reached. Check your connection and try again.',
    },
    {
      cause: new CampusHubApiError(400, 'id must be a valid MongoDB ObjectId.'),
      expected: 'id must be a valid MongoDB ObjectId.',
    },
    {
      cause: new CampusHubApiError(500, 'An unexpected server error occurred.'),
      expected: 'An unexpected server error occurred.',
    },
  ]
  for (const errorCase of cases) {
    assert.equal(cancellationErrorMessage(errorCase.cause), errorCase.expected)
  }
  const unexpectedFailures: unknown[] = [new Error('Internal details'), 'details', { status: 404 }, null, undefined]
  for (const cause of unexpectedFailures) {
    assert.equal(cancellationErrorMessage(cause), 'The reservation could not be cancelled. Please try again.')
  }
})
