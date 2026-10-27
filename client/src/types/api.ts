export type ResourceType = 'ROOM' | 'EQUIPMENT' | 'LAB'

export type ReservationStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED'

export interface Resource {
  id: string
  name: string
  type: ResourceType
  location: string
  isAvailable: boolean
}

export interface CreateReservationDTO {
  resourceId: string
  userId: string
  startTime: string
  endTime: string
}

export interface Reservation extends CreateReservationDTO {
  id: string
  status: ReservationStatus
}

export interface ApiErrorResponse {
  code: string
  message: string
}
