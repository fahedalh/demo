/**
 * Ride lifecycle state machine.
 *
 * Happy path:
 *   REQUESTED → SEARCHING → ACCEPTED → DRIVER_ARRIVING → ARRIVED → IN_PROGRESS
 *   → COMPLETED → (PAYMENT_PENDING →) PAYMENT_COMPLETED
 *
 * Side exits: CANCELLED (by passenger/driver/admin before the trip starts),
 * EXPIRED (no driver accepted within the dispatch window),
 * NO_DRIVER_AVAILABLE (no eligible driver at all).
 *
 * The backend is the only authority: every transition goes through
 * `assertTransition`, and the transition table below is the single source of truth
 * shared with the frontends (which use it to decide which buttons to show).
 */
export const RIDE_STATUSES = [
  'REQUESTED',
  'SEARCHING',
  'ACCEPTED',
  'DRIVER_ARRIVING',
  'ARRIVED',
  'IN_PROGRESS',
  'COMPLETED',
  'PAYMENT_PENDING',
  'PAYMENT_COMPLETED',
  'CANCELLED',
  'EXPIRED',
  'NO_DRIVER_AVAILABLE',
] as const;

export type RideStatus = (typeof RIDE_STATUSES)[number];

export type ActorRole = 'PASSENGER' | 'DRIVER' | 'ADMIN' | 'SYSTEM';

interface TransitionRule {
  to: RideStatus;
  /** Which actors may trigger this transition. */
  by: ActorRole[];
}

export const RIDE_TRANSITIONS: Record<RideStatus, TransitionRule[]> = {
  REQUESTED: [
    { to: 'SEARCHING', by: ['SYSTEM'] },
    { to: 'CANCELLED', by: ['PASSENGER', 'ADMIN', 'SYSTEM'] },
    { to: 'EXPIRED', by: ['SYSTEM'] },
  ],
  SEARCHING: [
    { to: 'ACCEPTED', by: ['DRIVER', 'ADMIN'] },
    { to: 'CANCELLED', by: ['PASSENGER', 'ADMIN', 'SYSTEM'] },
    { to: 'EXPIRED', by: ['SYSTEM'] },
    { to: 'NO_DRIVER_AVAILABLE', by: ['SYSTEM'] },
  ],
  ACCEPTED: [
    { to: 'DRIVER_ARRIVING', by: ['DRIVER', 'SYSTEM'] },
    { to: 'ARRIVED', by: ['DRIVER'] },
    { to: 'CANCELLED', by: ['PASSENGER', 'DRIVER', 'ADMIN'] },
    // A driver who cancels after accepting puts the ride back into dispatch.
    { to: 'SEARCHING', by: ['SYSTEM'] },
  ],
  DRIVER_ARRIVING: [
    { to: 'ARRIVED', by: ['DRIVER'] },
    { to: 'CANCELLED', by: ['PASSENGER', 'DRIVER', 'ADMIN'] },
    { to: 'SEARCHING', by: ['SYSTEM'] },
  ],
  ARRIVED: [
    { to: 'IN_PROGRESS', by: ['DRIVER'] },
    { to: 'CANCELLED', by: ['PASSENGER', 'DRIVER', 'ADMIN'] },
  ],
  IN_PROGRESS: [{ to: 'COMPLETED', by: ['DRIVER', 'ADMIN'] }],
  COMPLETED: [
    { to: 'PAYMENT_PENDING', by: ['SYSTEM'] },
    { to: 'PAYMENT_COMPLETED', by: ['SYSTEM', 'ADMIN'] },
  ],
  PAYMENT_PENDING: [{ to: 'PAYMENT_COMPLETED', by: ['SYSTEM', 'ADMIN', 'PASSENGER'] }],
  PAYMENT_COMPLETED: [],
  CANCELLED: [],
  EXPIRED: [],
  NO_DRIVER_AVAILABLE: [],
};

export function canTransition(from: RideStatus, to: RideStatus, actor: ActorRole): boolean {
  return RIDE_TRANSITIONS[from].some((r) => r.to === to && r.by.includes(actor));
}

export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: RideStatus,
    public readonly to: RideStatus,
    public readonly actor: ActorRole,
  ) {
    super(`Ride cannot move from ${from} to ${to} (actor: ${actor})`);
    this.name = 'InvalidTransitionError';
  }
}

export function assertTransition(from: RideStatus, to: RideStatus, actor: ActorRole): void {
  if (!canTransition(from, to, actor)) throw new InvalidTransitionError(from, to, actor);
}

/** Ride is waiting for, or being served by, a driver. A passenger may only have one of these. */
export const ACTIVE_RIDE_STATUSES: RideStatus[] = [
  'REQUESTED',
  'SEARCHING',
  'ACCEPTED',
  'DRIVER_ARRIVING',
  'ARRIVED',
  'IN_PROGRESS',
];

/** Ride has a driver assigned and is not finished. */
export const DRIVER_ENGAGED_STATUSES: RideStatus[] = [
  'ACCEPTED',
  'DRIVER_ARRIVING',
  'ARRIVED',
  'IN_PROGRESS',
];

/** The trip itself happened (regardless of payment state). */
export const FINISHED_TRIP_STATUSES: RideStatus[] = ['COMPLETED', 'PAYMENT_PENDING', 'PAYMENT_COMPLETED'];

export const TERMINAL_STATUSES: RideStatus[] = [
  'PAYMENT_COMPLETED',
  'CANCELLED',
  'EXPIRED',
  'NO_DRIVER_AVAILABLE',
];

export function isActiveRide(status: RideStatus): boolean {
  return ACTIVE_RIDE_STATUSES.includes(status);
}
