export type ReservationStatus = "PENDING" | "CONFIRMED" | "CANCELLED";
export type ResourceType = "ROOM" | "EQUIPMENT" | "LAB";

export interface Resource {
  id: string;
  name: string;
  type: ResourceType;
  location: string;
  isAvailable: boolean;
}

export interface CreateReservationDTO {
  resourceId: string;
  userId: string;
  startTime: string;
  endTime: string;
}

export interface ReservationResponse extends CreateReservationDTO {
  readonly id: string;
  readonly status: ReservationStatus;
}

export interface ErrorResponse {
  code: string;
  message: string;
}
