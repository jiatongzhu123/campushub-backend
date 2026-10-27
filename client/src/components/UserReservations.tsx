import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { CampusHubApiError, cancelReservation, fetchUserReservations } from '../api/campushubApi'
import type { Reservation, ReservationStatus } from '../types/api'
import styles from '../App.module.css'

export interface UserReservationsProps {
  userId: string
  refreshVersion: number
}

type ReservationLoadResult =
  | { requestKey: string; kind: 'success'; reservations: Reservation[] }
  | { requestKey: string; kind: 'error'; message: string }

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function cancellationErrorMessage(cause: unknown): string {
  if (cause instanceof CampusHubApiError) {
    if (cause.status === 404) {
      return 'This reservation could not be found. Refresh the list and try again.'
    }
    if (cause.status === 0) {
      return 'The booking service could not be reached. Check your connection and try again.'
    }
    return cause.message
  }
  return 'The reservation could not be cancelled. Please try again.'
}

function UserReservations({ userId, refreshVersion }: UserReservationsProps): ReactElement {
  const [loadResult, setLoadResult] = useState<ReservationLoadResult | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [reloadVersion, setReloadVersion] = useState<number>(0)
  const cancellationInProgress = useRef<boolean>(false)
  const isMounted = useRef<boolean>(true)
  const requestKey: string = JSON.stringify([userId, refreshVersion, reloadVersion])
  const currentResult: ReservationLoadResult | null =
    loadResult?.requestKey === requestKey ? loadResult : null
  const isLoading: boolean = userId.trim().length > 0 && currentResult === null
  const loadError: string | null = currentResult?.kind === 'error' ? currentResult.message : null
  const reservations: Reservation[] =
    currentResult?.kind === 'success' ? currentResult.reservations : []

  useEffect((): (() => void) => {
    isMounted.current = true
    return (): void => {
      isMounted.current = false
    }
  }, [])

  useEffect((): (() => void) => {
    let isCurrent: boolean = true
    if (userId.trim().length === 0) {
      return (): void => {
        isCurrent = false
      }
    }

    void fetchUserReservations(userId)
      .then((result: Reservation[]): void => {
        if (isCurrent) {
          setLoadResult({ requestKey, kind: 'success', reservations: result })
        }
      })
      .catch((cause: unknown): void => {
        if (isCurrent) {
          setLoadResult({
            requestKey,
            kind: 'error',
            message: cause instanceof Error ? cause.message : 'Could not load bookings.',
          })
        }
      })

    return (): void => {
      isCurrent = false
    }
  }, [userId, requestKey])

  function handleRetry(): void {
    setReloadVersion((version: number): number => version + 1)
  }

  function handleCancel(reservationId: string): void {
    if (cancellationInProgress.current) {
      return
    }
    cancellationInProgress.current = true
    setCancellingId(reservationId)
    setActionError(null)
    setActionSuccess(null)

    void cancelReservation(reservationId)
      .then((): void => {
        if (isMounted.current) {
          setActionSuccess('Reservation cancelled successfully.')
          setReloadVersion((version: number): number => version + 1)
        }
      })
      .catch((cause: unknown): void => {
        if (isMounted.current) {
          setActionError(cancellationErrorMessage(cause))
        }
      })
      .finally((): void => {
        cancellationInProgress.current = false
        if (isMounted.current) {
          setCancellingId(null)
        }
      })
  }

  const activeReservations: Reservation[] = reservations.filter(
    (reservation: Reservation): boolean => reservation.status !== 'CANCELLED',
  )
  const cancelledReservations: Reservation[] = reservations.filter(
    (reservation: Reservation): boolean => reservation.status === 'CANCELLED',
  )

  function reservationCard(reservation: Reservation, canCancel: boolean): ReactElement {
    const status: ReservationStatus = reservation.status
    const statusStyle: string = {
      PENDING: styles['status-pending'],
      CONFIRMED: styles['status-confirmed'],
      CANCELLED: styles['status-cancelled'],
    }[status]
    return (
      <li className={styles['reservation-card']} key={reservation.id}>
        <div className={styles['reservation-card-top']}>
          <strong>Resource ID: {reservation.resourceId}</strong>
          <span className={`${styles['reservation-status']} ${statusStyle}`}>{status}</span>
        </div>
        <p>{formatDateTime(reservation.startTime)} to {formatDateTime(reservation.endTime)}</p>
        {canCancel && (
          <button
            type="button"
            className={styles['secondary-button']}
            disabled={cancellingId !== null}
            onClick={(): void => handleCancel(reservation.id)}
          >
            {cancellingId === reservation.id ? 'Cancelling…' : 'Cancel reservation'}
          </button>
        )}
      </li>
    )
  }

  return (
    <section className={styles.panel} aria-labelledby="reservations-heading">
      <div className={styles['section-heading']}>
        <div>
          <p className={styles.eyebrow}>Your schedule</p>
          <h2 id="reservations-heading">My Bookings</h2>
        </div>
        {userId.length > 0 && (
          <div className={styles['reservation-heading-actions']}>
            <p className={styles['section-caption']}>Demo user ID: {userId}</p>
            <button type="button" className={styles['text-button']} onClick={handleRetry} disabled={isLoading}>
              Refresh bookings
            </button>
          </div>
        )}
      </div>

      {userId.length === 0 && <p className={styles['state-message']}>Enter a demo user ID above to view bookings.</p>}
      {isLoading && <p className={styles['state-message']} role="status">Loading bookings…</p>}
      {loadError !== null && (
        <div className={`${styles['state-message']} ${styles['state-error']}`} role="alert">
          <p>{loadError}</p>
          <button type="button" className={styles['text-button']} onClick={handleRetry}>Try again</button>
        </div>
      )}
      {actionError !== null && <p className={`${styles.feedback} ${styles['feedback-error']}`} role="alert">{actionError}</p>}
      {actionSuccess !== null && <p className={`${styles.feedback} ${styles['feedback-success']}`} role="status">{actionSuccess}</p>}

      {!isLoading && loadError === null && userId.length > 0 && reservations.length === 0 && (
        <p className={styles['state-message']}>No bookings found for this demo user ID.</p>
      )}
      {!isLoading && loadError === null && activeReservations.length > 0 && (
        <div className={styles['reservations-group']}>
          <h3>Active bookings</h3>
          <ul className={styles['reservation-list']}>
            {activeReservations.map((reservation: Reservation): ReactElement => reservationCard(reservation, true))}
          </ul>
        </div>
      )}
      {!isLoading && loadError === null && cancelledReservations.length > 0 && (
        <div className={styles['reservations-group']}>
          <h3>Cancelled bookings</h3>
          <ul className={styles['reservation-list']}>
            {cancelledReservations.map((reservation: Reservation): ReactElement => reservationCard(reservation, false))}
          </ul>
        </div>
      )}
    </section>
  )
}

export default UserReservations
