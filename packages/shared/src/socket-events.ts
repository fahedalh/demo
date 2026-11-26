/**
 * Socket.IO event contract. Rooms used by the server:
 *   user:<userId>   — every socket of a user (notifications, offers, ride updates)
 *   ride:<rideId>   — passenger + driver of a ride (location, chat, status)
 *   drivers:online  — all online drivers
 *   admins          — admin dashboards (live map, alerts)
 */
import type { MessageDTO, NotificationDTO, RideDTO, RideOfferDTO } from './types';

export interface DriverLocationPayload {
  driverId: string;
  rideId?: string;
  lat: number;
  lng: number;
  heading?: number | null;
  speed?: number | null;
  at: string;
}

export interface ServerToClientEvents {
  'ride:updated': (ride: RideDTO) => void;
  'ride:offer': (offer: RideOfferDTO) => void;
  'ride:offer:cancelled': (p: { offerId: string; rideId: string; reason: string }) => void;
  'ride:driver_location': (p: DriverLocationPayload) => void;
  'ride:message': (m: MessageDTO) => void;
  'ride:typing': (p: { rideId: string; userId: string }) => void;
  notification: (n: NotificationDTO) => void;
  'driver:status': (p: { isOnline: boolean }) => void;
  'admin:driver_location': (p: DriverLocationPayload & { isOnline: boolean; busy: boolean }) => void;
  'admin:driver_offline': (p: { driverId: string }) => void;
  'admin:ride_event': (p: { rideId: string; status: string; code: string }) => void;
  'admin:sos': (p: {
    rideId: string | null;
    userId: string;
    role: string;
    lat?: number;
    lng?: number;
    ticketId: string;
  }) => void;
  'session:revoked': () => void;
}

export type Ack<T = unknown> = (res: { ok: true; data?: T } | { ok: false; error: string }) => void;

export interface ClientToServerEvents {
  'driver:location': (p: { lat: number; lng: number; heading?: number; speed?: number }, ack?: Ack) => void;
  'ride:subscribe': (p: { rideId: string }, ack?: Ack) => void;
  'ride:unsubscribe': (p: { rideId: string }) => void;
  'ride:typing': (p: { rideId: string }) => void;
  'passenger:location': (p: { rideId: string; lat: number; lng: number }) => void;
}
