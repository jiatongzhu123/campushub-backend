import type { ResourceType } from "../../shared/types/api";

export type {
  ReservationStatus,
  ResourceType,
  Resource,
  CreateReservationDTO,
  ReservationResponse as Reservation,
  ErrorResponse,
} from "../../shared/types/api";

export interface ResourceFilters {
  type?: ResourceType;
  isAvailable?: boolean;
}
