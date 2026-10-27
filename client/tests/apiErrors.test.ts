import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import { CampusHubApiError, fetchResources } from '../src/api/campushubApi.ts'

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
