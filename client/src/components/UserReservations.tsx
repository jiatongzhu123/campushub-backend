import type { ReactElement } from 'react'
import { useReservations } from '../hooks/useReservations'
import type { Reservation, ReservationStatus } from '../types/api'
import styles from '../App.module.css'

export interface UserReservationsProps {
  userId: string
  refreshVersion: number
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function UserReservations({ userId, refreshVersion }: UserReservationsProps): ReactElement {
  const {
    reservations,
    isLoading,
    loadError,
    actionError,
    actionSuccess,
    cancellingId,
    refresh: handleRetry,
    cancel: handleCancel,
  } = useReservations({ userId, refreshVersion })

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
