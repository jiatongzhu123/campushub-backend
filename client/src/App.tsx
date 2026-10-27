import { useState } from 'react'
import type { ChangeEvent, FormEvent, ReactElement } from 'react'
import BookingForm from './components/BookingForm'
import ResourceList from './components/ResourceList'
import UserReservations from './components/UserReservations'
import type { Resource } from './types/api'
import styles from './App.module.css'

function App(): ReactElement {
  const [draftUserId, setDraftUserId] = useState<string>('')
  const [userId, setUserId] = useState<string>('')
  const [userIdError, setUserIdError] = useState<string | null>(null)
  const [selectedResource, setSelectedResource] = useState<Resource | null>(null)
  const [reservationRefreshVersion, setReservationRefreshVersion] = useState<number>(0)

  function handleUserIdChange(event: ChangeEvent<HTMLInputElement>): void {
    setDraftUserId(event.target.value)
    setUserIdError(null)
  }

  function handleDemoUserSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    const nextUserId: string = draftUserId.trim()
    if (nextUserId.length === 0) {
      setUserIdError('Enter a demo user ID to continue.')
      return
    }
    setUserId(nextUserId)
    setUserIdError(null)
  }

  function handleSelectResource(resource: Resource): void {
    setSelectedResource(resource)
  }

  function handleBookingSuccess(): void {
    setReservationRefreshVersion((version: number): number => version + 1)
  }

  return (
    <main className={styles['app-shell']}>
      <header className={styles['app-header']}>
        <p className={styles.eyebrow}>Campus resources</p>
        <h1>CampusHub</h1>
        <p>Find a space or piece of equipment and request the time you need.</p>
      </header>

      <section className={`${styles.panel} ${styles['demo-user-panel']}`} aria-labelledby="demo-user-heading">
        <div>
          <h2 id="demo-user-heading">Demo user ID</h2>
          <p className={styles['helper-text']}>This lab has no sign-in system. Enter a user ID to make and view its bookings.</p>
        </div>
        <form className={styles['demo-user-form']} onSubmit={handleDemoUserSubmit}>
          <label htmlFor="demo-user-id">User ID</label>
          <div className={styles['demo-user-controls']}>
            <input
              id="demo-user-id"
              type="text"
              value={draftUserId}
              onChange={handleUserIdChange}
              autoComplete="off"
              aria-describedby={userIdError === null ? undefined : 'demo-user-error'}
            />
            <button className={styles['primary-button']} type="submit">Use this ID</button>
          </div>
          {userIdError !== null && <p id="demo-user-error" className={`${styles.feedback} ${styles['feedback-error']}`} role="alert">{userIdError}</p>}
          {userId.length > 0 && <p className={styles['current-user']}>Viewing bookings for <strong>{userId}</strong></p>}
        </form>
      </section>

      <div className={styles['app-grid']}>
        <ResourceList
          selectedResourceId={selectedResource?.id ?? null}
          onSelectResource={handleSelectResource}
        />
        <BookingForm
          key={`${selectedResource?.id ?? 'none'}:${userId}`}
          resource={selectedResource}
          userId={userId}
          onBookingSuccess={handleBookingSuccess}
        />
      </div>

      <UserReservations
        key={userId}
        userId={userId}
        refreshVersion={reservationRefreshVersion}
      />
    </main>
  )
}

export default App
