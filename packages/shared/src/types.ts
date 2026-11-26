/** API response shapes shared by the backend serializers and the web apps. Money = minor units. */
import type { RideStatus } from './ride-state';

export type Role = 'PASSENGER' | 'DRIVER' | 'ADMIN';
export type AdminRole = 'SUPER_ADMIN' | 'OPERATIONS' | 'FINANCE' | 'SUPPORT';
export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'PENDING';
export type PaymentType = 'CASH' | 'CARD' | 'WALLET';
export type VerificationStatus = 'PENDING' | 'UNDER_REVIEW' | 'NEEDS_INFO' | 'APPROVED' | 'REJECTED';

export interface UserDTO {
  id: string;
  email: string | null;
  phone: string | null;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  role: Role;
  adminRole: AdminRole | null;
  status: UserStatus;
  locale: 'en' | 'ar';
  emailVerified: boolean;
  phoneVerified: boolean;
  createdAt: string;
}

export interface AuthResponse {
  user: UserDTO;
  accessToken: string;
  /** Only returned to non-browser clients; browsers receive an httpOnly cookie instead. */
  refreshToken?: string;
}

export interface VehicleCategoryDTO {
  id: string;
  code: string;
  name: string;
  nameAr: string;
  description: string | null;
  descriptionAr: string | null;
  capacity: number;
  icon: string;
  sortOrder: number;
  isActive: boolean;
}

export interface FareEstimateDTO {
  category: VehicleCategoryDTO;
  fare: number;
  fareBeforeDiscount: number;
  discount: number;
  currency: string;
  surgeMultiplier: number;
  etaSeconds: number | null;
  nearbyDrivers: number;
}

export interface RouteDTO {
  distanceMeters: number;
  durationSeconds: number;
  geometry: [number, number][]; // [lat, lng]
  provider: string;
}

export interface EstimateResponse {
  route: RouteDTO;
  options: FareEstimateDTO[];
  coupon: { code: string; valid: boolean; message?: string } | null;
}

export interface VehicleDTO {
  id: string;
  make: string;
  model: string;
  year: number;
  color: string;
  plateNumber: string;
  seats: number;
  isElectric: boolean;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  category: VehicleCategoryDTO;
}

export interface DriverSummaryDTO {
  id: string; // user id
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  phone: string | null;
  rating: number;
  ratingCount: number;
  completedRides: number;
  vehicle: VehicleDTO | null;
  location: { lat: number; lng: number; heading: number | null } | null;
}

export interface PassengerSummaryDTO {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  phone: string | null;
  rating: number;
}

export interface RideDTO {
  id: string;
  code: string;
  status: RideStatus;
  category: VehicleCategoryDTO;
  pickup: { address: string; lat: number; lng: number };
  dropoff: { address: string; lat: number; lng: number };
  pickupNotes: string | null;
  estimatedDistanceMeters: number;
  estimatedDurationSeconds: number;
  routeGeometry: [number, number][] | null;
  estimatedFare: number;
  finalFare: number | null;
  discount: number;
  tip: number;
  cancellationFee: number;
  currency: string;
  surgeMultiplier: number;
  fareBreakdown: Record<string, number | boolean | string> | null;
  paymentType: PaymentType;
  paymentStatus: string | null;
  scheduledAt: string | null;
  requestedAt: string;
  acceptedAt: string | null;
  arrivedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  cancelledByRole: string | null;
  startPin: string | null;
  driver: DriverSummaryDTO | null;
  passenger: PassengerSummaryDTO | null;
  myRating: { score: number; comment: string | null } | null;
  driverEarning?: { gross: number; commission: number; net: number } | null;
  createdAt: string;
}

export interface RideOfferDTO {
  offerId: string;
  ride: RideDTO;
  expiresAt: string;
  pickupDistanceMeters: number;
  pickupEtaSeconds: number;
  estimatedEarning: number;
}

export interface MessageDTO {
  id: string;
  rideId: string;
  senderId: string;
  body: string;
  createdAt: string;
  readAt: string | null;
}

export interface NotificationDTO {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}
