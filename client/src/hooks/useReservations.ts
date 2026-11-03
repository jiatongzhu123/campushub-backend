import { useEffect, useRef, useState } from 'react'
import { CampusHubApiError, cancelReservation, createReservation, fetchUserReservations } from '../api/campushubApi.ts'
import type { CreateReservationDTO, Reservation } from '../types/api'

interface Feedback {
  kind: 'success' | 'error'
  message: string
}

interface CreateReservationOptions {
  onSuccess: () => void
  onMountedSuccess?: () => void
}

interface CreateReservationResult {
  isSubmitting: boolean
  feedback: Feedback | null
  setFeedback: (feedback: Feedback | null) => void
  isSubmissionInProgress: () => boolean
  submitReservation: (payload: CreateReservationDTO) => Promise<void>
}

export function bookingErrorMessage(cause: unknown): string {
  if (cause instanceof CampusHubApiError) {
    if (cause.status === 409) {
      return 'This resource is already reserved for that time window. Choose different times and try again.'
    }
    if (cause.status === 400) {
      return `Please check your booking details. ${cause.message}`
    }
    if (cause.status === 0) {
      return 'The booking service could not be reached. Check your connection and try again.'
    }
    if (cause.status === 500) {
      return 'The booking service encountered an error. Please try again later.'
    }
    return cause.message
  }

  return 'The booking could not be completed. Please try again.'
}

export function useCreateReservation({
  onSuccess,
  onMountedSuccess,
}: CreateReservationOptions): CreateReservationResult {
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [feedback, updateFeedback] = useState<Feedback | null>(null)
  const submissionInProgress = useRef<boolean>(false)
  const isMounted = useRef<boolean>(true)

  useEffect((): (() => void) => {
    isMounted.current = true
    return (): void => {
      isMounted.current = false
    }
  }, [])

  function setFeedback(nextFeedback: Feedback | null): void {
    if (isMounted.current) {
      updateFeedback(nextFeedback)
    }
  }

  function isSubmissionInProgress(): boolean {
    return submissionInProgress.current
  }

  async function submitReservation(payload: CreateReservationDTO): Promise<void> {
    if (submissionInProgress.current || !isMounted.current) {
      return
    }
    submissionInProgress.current = true
    setFeedback(null)
    setIsSubmitting(true)

    try {
      await createReservation(payload)
      if (isMounted.current) {
        setFeedback({ kind: 'success', message: 'Booking created. It now appears in My Bookings.' })
        onMountedSuccess?.()
      }
      // Refresh the parent even if the originating form has unmounted.
      onSuccess()
    } catch (cause: unknown) {
      if (isMounted.current) {
        setFeedback({ kind: 'error', message: bookingErrorMessage(cause) })
      }
    } finally {
      submissionInProgress.current = false
      if (isMounted.current) {
        setIsSubmitting(false)
      }
    }
  }

  return { isSubmitting, feedback, setFeedback, isSubmissionInProgress, submitReservation }
}

type ReservationLoadResult =
  | { requestKey: string; kind: 'success'; reservations: Reservation[] }
  | { requestKey: string; kind: 'error'; message: string }

interface ReservationsOptions {
  userId: string
  refreshVersion: number
}

interface ReservationsResult {
  reservations: Reservation[]
  isLoading: boolean
  loadError: string | null
  actionError: string | null
  actionSuccess: string | null
  cancellingId: string | null
  refresh: () => void
  cancel: (reservationId: string) => void
}

export function cancellationErrorMessage(cause: unknown): string {
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

export function useReservations({ userId, refreshVersion }: ReservationsOptions): ReservationsResult {
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

  function refresh(): void {
    setReloadVersion((version: number): number => version + 1)
  }

  function cancel(reservationId: string): void {
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

  return { reservations, isLoading, loadError, actionError, actionSuccess, cancellingId, refresh, cancel }
}
