/** Booking-flow state (what the passenger is composing before the ride exists). */
import { create } from 'zustand';
import type { PaymentType } from '@masar/shared';

export interface Place {
  address: string;
  lat: number;
  lng: number;
}

export type Stage = 'home' | 'search' | 'pin' | 'options';

interface BookingState {
  stage: Stage;
  pickup: Place | null;
  dropoff: Place | null;
  pinTarget: 'pickup' | 'dropoff';
  focus: 'pickup' | 'dropoff';
  categoryCode: string;
  paymentType: PaymentType;
  paymentMethodId: string | null;
  couponCode: string | null;
  scheduledAt: Date | null;
  notes: string;
  route: [number, number][] | null;
  set: (p: Partial<BookingState>) => void;
  reset: () => void;
}

const initial = {
  stage: 'home' as Stage,
  dropoff: null,
  pinTarget: 'dropoff' as const,
  focus: 'dropoff' as const,
  categoryCode: 'ECONOMY',
  couponCode: null,
  scheduledAt: null,
  notes: '',
  route: null,
};

export const useBooking = create<BookingState>((set) => ({
  ...initial,
  pickup: null,
  paymentType: 'CARD',
  paymentMethodId: null,
  set: (p) => set(p),
  // Keeps pickup and payment preferences between rides.
  reset: () => set({ ...initial }),
}));
