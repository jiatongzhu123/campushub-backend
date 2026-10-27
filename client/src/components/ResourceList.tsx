import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { fetchResources } from '../api/campushubApi'
import type { Resource, ResourceType } from '../types/api'
import styles from '../App.module.css'

type ResourceFilter = 'ALL' | ResourceType

interface FilterOption {
  label: string
  value: ResourceFilter
}

export interface ResourceListProps {
  selectedResourceId: string | null
  onSelectResource: (resource: Resource) => void
}

type ResourceLoadResult =
  | { requestKey: string; kind: 'success'; resources: Resource[] }
  | { requestKey: string; kind: 'error'; message: string }

const filterOptions: FilterOption[] = [
  { label: 'All', value: 'ALL' },
  { label: 'Rooms', value: 'ROOM' },
  { label: 'Equipment', value: 'EQUIPMENT' },
  { label: 'Labs', value: 'LAB' },
]

function ResourceList({ selectedResourceId, onSelectResource }: ResourceListProps): ReactElement {
  const [filter, setFilter] = useState<ResourceFilter>('ALL')
  const [loadResult, setLoadResult] = useState<ResourceLoadResult | null>(null)
  const [requestVersion, setRequestVersion] = useState<number>(0)
  const requestKey: string = `${filter}:${requestVersion}`
  const currentResult: ResourceLoadResult | null =
    loadResult?.requestKey === requestKey ? loadResult : null
  const isLoading: boolean = currentResult === null
  const error: string | null = currentResult?.kind === 'error' ? currentResult.message : null
  const resources: Resource[] = currentResult?.kind === 'success' ? currentResult.resources : []

  useEffect((): (() => void) => {
    let isCurrent: boolean = true

    const type: ResourceType | undefined = filter === 'ALL' ? undefined : filter
    void fetchResources(type)
      .then((result: Resource[]): void => {
        if (isCurrent) {
          setLoadResult({ requestKey, kind: 'success', resources: result })
        }
      })
      .catch((cause: unknown): void => {
        if (isCurrent) {
          setLoadResult({
            requestKey,
            kind: 'error',
            message: cause instanceof Error ? cause.message : 'Could not load resources.',
          })
        }
      })

    return (): void => {
      isCurrent = false
    }
  }, [filter, requestKey])

  function handleFilterChange(nextFilter: ResourceFilter): void {
    if (nextFilter !== filter) {
      setFilter(nextFilter)
      setRequestVersion((version: number): number => version + 1)
    }
  }

  function handleRetry(): void {
    setRequestVersion((version: number): number => version + 1)
  }

  return (
    <section className={styles.panel} aria-labelledby="resources-heading">
      <div className={styles['section-heading']}>
        <div>
          <p className={styles.eyebrow}>Explore</p>
          <h2 id="resources-heading">Campus resources</h2>
        </div>
        <p className={styles['section-caption']}>Choose a resource, then request a time window.</p>
      </div>

      <div className={styles['filter-row']} role="group" aria-label="Filter resources by type">
        {filterOptions.map((option: FilterOption): ReactElement => (
          <button
            key={option.value}
            type="button"
            className={`${styles['filter-button']}${filter === option.value ? ` ${styles['is-active']}` : ''}`}
            aria-pressed={filter === option.value}
            onClick={(): void => handleFilterChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <p className={styles['helper-text']}>
        Availability is a resource flag; a time slot is checked when you submit a booking.
      </p>

      {isLoading && <p className={styles['state-message']} role="status">Loading resources…</p>}
      {error !== null && (
        <div className={`${styles['state-message']} ${styles['state-error']}`} role="alert">
          <p>{error}</p>
          <button type="button" className={styles['text-button']} onClick={handleRetry}>Try again</button>
        </div>
      )}
      {!isLoading && error === null && resources.length === 0 && (
        <p className={styles['state-message']}>No resources match this filter.</p>
      )}

      {!isLoading && error === null && resources.length > 0 && (
        <div className={styles['resource-grid']}>
          {resources.map((resource: Resource): ReactElement => (
            <article className={styles['resource-card']} key={resource.id}>
              <div className={styles['resource-card-top']}>
                <span className={styles['resource-type']}>{resource.type}</span>
                <span className={`${styles.availability} ${resource.isAvailable ? styles['is-available'] : styles['is-unavailable']}`}>
                  {resource.isAvailable ? 'Available' : 'Unavailable'}
                </span>
              </div>
              <h3>{resource.name}</h3>
              <p className={styles['resource-location']}>{resource.location}</p>
              <button
                type="button"
                className={`${styles['secondary-button']} ${styles['resource-select']}`}
                disabled={!resource.isAvailable}
                aria-pressed={selectedResourceId === resource.id}
                onClick={(): void => onSelectResource(resource)}
              >
                {selectedResourceId === resource.id ? 'Selected' : 'Select resource'}
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

export default ResourceList
