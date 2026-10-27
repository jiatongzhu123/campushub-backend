import assert from 'node:assert/strict'
import test from 'node:test'
import { validateBookingWindow } from '../src/utils/bookingDateTime.ts'

test('valid local booking times become timezone-aware ISO strings', (): void => {
  const result = validateBookingWindow('2026-11-12T09:30', '2026-11-12T10:45')
  assert.equal(result.valid, true)
  if (result.valid) {
    assert.equal(result.window.startTime, new Date(2026, 10, 12, 9, 30).toISOString())
    assert.equal(result.window.endTime, new Date(2026, 10, 12, 10, 45).toISOString())
    assert.match(result.window.startTime, /Z$/)
  }
})

test('missing, invalid, and non-increasing times are rejected', (): void => {
  assert.equal(validateBookingWindow('', '2026-11-12T10:00').valid, false)
  assert.equal(validateBookingWindow('2026-02-30T09:00', '2026-03-01T10:00').valid, false)
  assert.equal(validateBookingWindow('2026-11-12T10:00', '2026-11-12T10:00').valid, false)
  assert.equal(validateBookingWindow('2026-11-12T11:00', '2026-11-12T10:00').valid, false)
})
