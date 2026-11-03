import { useState } from 'react'
import type { ChangeEvent, FormEvent, ReactElement } from 'react'
import { useCreateReservation } from '../hooks/useReservations'
import type { CreateReservationDTO, Resource } from '../types/api'
import { validateBookingWindow } from '../utils/bookingDateTime'
import styles from '../App.module.css'

export interface BookingFormProps {
  resource: Resource | null
  userId: string
  onBookingSuccess: () => void
}

function BookingForm({ resource, userId, onBookingSuccess }: BookingFormProps): ReactElement {
  const [startValue, setStartValue] = useState<string>('')
  const [endValue, setEndValue] = useState<string>('')
  const { isSubmitting, feedback, setFeedback, isSubmissionInProgress, submitReservation } =
    useCreateReservation({
      onSuccess: onBookingSuccess,
      onMountedSuccess: (): void => {
        setStartValue('')
        setEndValue('')
      },
    })

  function handleStartChange(event: ChangeEvent<HTMLInputElement>): void {
    setStartValue(event.target.value)
    setFeedback(null)
  }

  function handleEndChange(event: ChangeEvent<HTMLInputElement>): void {
    setEndValue(event.target.value)
    setFeedback(null)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (isSubmissionInProgress()) {
      return
    }
    setFeedback(null)

    if (resource === null || !resource.isAvailable) {
      setFeedback({ kind: 'error', message: 'Select an available resource first.' })
      return
    }
    if (userId.trim().length === 0) {
      setFeedback({ kind: 'error', message: 'Enter a demo user ID before booking.' })
      return
    }

    const timeResult = validateBookingWindow(startValue, endValue)
    if (!timeResult.valid) {
      setFeedback({ kind: 'error', message: timeResult.message })
      return
    }

    const payload: CreateReservationDTO = {
      resourceId: resource.id,
      userId: userId.trim(),
      ...timeResult.window,
    }
    await submitReservation(payload)
  }

  return (
    <section className={styles.panel} aria-labelledby="booking-heading">
      <p className={styles.eyebrow}>Reserve</p>
      <h2 id="booking-heading">Book a resource</h2>
      {resource === null ? (
        <p className={styles['helper-text']}>Select an available resource from the list to begin.</p>
      ) : (
        <div className={styles['selected-resource']}>
          <span className={styles['selected-resource-label']}>Selected resource</span>
          <strong>{resource.name}</strong>
          <span>{resource.type} · {resource.location}</span>
        </div>
      )}

      <form className={styles['booking-form']} onSubmit={handleSubmit}>
        <label htmlFor="booking-start">Start date and time</label>
        <input
          id="booking-start"
          type="datetime-local"
          step="60"
          required
          value={startValue}
          onChange={handleStartChange}
          disabled={isSubmitting}
        />
        <label htmlFor="booking-end">End date and time</label>
        <input
          id="booking-end"
          type="datetime-local"
          step="60"
          required
          value={endValue}
          onChange={handleEndChange}
          disabled={isSubmitting}
        />
        <p className={styles['helper-text']}>Times use your local timezone. Availability is confirmed when you submit.</p>
        <button
          type="submit"
          className={styles['primary-button']}
          disabled={isSubmitting || resource === null || !resource.isAvailable || userId.trim().length === 0}
        >
          {isSubmitting ? 'Creating booking…' : 'Request booking'}
        </button>
      </form>

      {isSubmitting && <p className={styles['state-message']} role="status">Submitting your booking…</p>}
      {feedback !== null && (
        <p className={`${styles.feedback} ${feedback.kind === 'error' ? styles['feedback-error'] : styles['feedback-success']}`} role={feedback.kind === 'error' ? 'alert' : 'status'}>
          {feedback.message}
        </p>
      )}
    </section>
  )
}

export default BookingForm
