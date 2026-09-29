export type ReservationStatus = "PENDING" | "CONFIRMED" | "CANCELLED";

export interface Resource {
  id: string;
  name: string;
  type: string;
  location: string;
  isAvailable: boolean;
}

export interface Reservation {
  readonly id?: string;
  resourceId: string;
  userId: string;
  startTime: string;
  endTime: string;
  readonly status?: ReservationStatus;
}

export interface ErrorResponse {
  code: string;
  message: string;
}
