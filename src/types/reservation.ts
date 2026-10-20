export type ReservationStatus = "PENDING" | "CONFIRMED" | "CANCELLED";
export type ResourceType = "ROOM" | "EQUIPMENT" | "LAB";

export interface ResourceFilters {
  type?: ResourceType;
  isAvailable?: boolean;
}

export interface Resource {
  id: string;
  name: string;
  type: ResourceType;
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
