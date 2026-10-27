export interface BookingWindow {
  startTime: string
  endTime: string
}

export type BookingWindowResult =
  | { valid: true; window: BookingWindow }
  | { valid: false; message: string }

function parseLocalDateTime(value: string): Date | null {
  const match: RegExpExecArray | null =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
  if (match === null) {
    return null
  }

  const year: number = Number(match[1])
  const month: number = Number(match[2])
  const day: number = Number(match[3])
  const hour: number = Number(match[4])
  const minute: number = Number(match[5])
  const date: Date = new Date(year, month - 1, day, hour, minute)

  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute
  ) {
    return null
  }

  return date
}

export function validateBookingWindow(
  startValue: string,
  endValue: string,
): BookingWindowResult {
  if (startValue.length === 0 || endValue.length === 0) {
    return { valid: false, message: 'Choose both a start and an end date and time.' }
  }

  const start: Date | null = parseLocalDateTime(startValue)
  const end: Date | null = parseLocalDateTime(endValue)
  if (start === null || end === null) {
    return { valid: false, message: 'Enter valid start and end dates and times.' }
  }
  if (end.getTime() <= start.getTime()) {
    return { valid: false, message: 'End time must be later than start time.' }
  }

  return {
    valid: true,
    window: { startTime: start.toISOString(), endTime: end.toISOString() },
  }
}
