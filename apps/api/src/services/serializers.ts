/** Maps Prisma rows to the public DTOs in @masar/shared. Keeps secrets (hashes, keys) out of responses. */
import type { Prisma, User, VehicleCategory } from '@prisma/client';
import type { RideDTO, RideStatus, UserDTO, VehicleCategoryDTO, VehicleDTO } from '@masar/shared';

export function toUserDTO(u: User): UserDTO {
  return {
    id: u.id,
    email: u.email,
    phone: u.phone,
    firstName: u.firstName,
    lastName: u.lastName,
    avatarUrl: u.avatarUrl,
    role: u.role,
    adminRole: u.adminRole,
    status: u.status,
    locale: u.locale === 'ar' ? 'ar' : 'en',
    emailVerified: !!u.emailVerifiedAt,
    phoneVerified: !!u.phoneVerifiedAt,
    createdAt: u.createdAt.toISOString(),
  };
}

export function toCategoryDTO(c: VehicleCategory): VehicleCategoryDTO {
  return {
    id: c.id,
    code: c.code,
    name: c.name,
    nameAr: c.nameAr,
    description: c.description,
    descriptionAr: c.descriptionAr,
    capacity: c.capacity,
    icon: c.icon,
    sortOrder: c.sortOrder,
    isActive: c.isActive,
  };
}

export const vehicleInclude = { category: true } satisfies Prisma.VehicleInclude;
type VehicleWithCat = Prisma.VehicleGetPayload<{ include: typeof vehicleInclude }>;

export function toVehicleDTO(v: VehicleWithCat): VehicleDTO {
  return {
    id: v.id,
    make: v.make,
    model: v.model,
    year: v.year,
    color: v.color,
    plateNumber: v.plateNumber,
    seats: v.seats,
    isElectric: v.isElectric,
    status: v.status,
    category: toCategoryDTO(v.category),
  };
}

export const rideInclude = {
  category: true,
  vehicle: { include: vehicleInclude },
  passenger: { include: { passengerProfile: true } },
  driver: { include: { driverProfile: true } },
  payments: { orderBy: { createdAt: 'desc' }, take: 1 },
  ratings: { include: { review: true } },
  earning: true,
} satisfies Prisma.RideInclude;

export type RideFull = Prisma.RideGetPayload<{ include: typeof rideInclude }>;

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/**
 * @param viewerId  user requesting the ride — controls what is visible (PIN, earnings, ratings)
 * @param viewerRole role of the viewer
 */
export function toRideDTO(r: RideFull, viewerId?: string, viewerRole?: string): RideDTO {
  const dp = r.driver?.driverProfile;
  const isPassenger = viewerId === r.passengerId;
  const isDriver = viewerId === r.driverId;
  const isAdmin = viewerRole === 'ADMIN';
  const mine = r.ratings.find((x) => x.raterId === viewerId);
  // Contact numbers are only shared while the ride is live.
  const live = ['ACCEPTED', 'DRIVER_ARRIVING', 'ARRIVED', 'IN_PROGRESS'].includes(r.status);
  return {
    id: r.id,
    code: r.code,
    status: r.status as RideStatus,
    category: toCategoryDTO(r.category),
    pickup: { address: r.pickupAddress, lat: r.pickupLat, lng: r.pickupLng },
    dropoff: { address: r.dropoffAddress, lat: r.dropoffLat, lng: r.dropoffLng },
    pickupNotes: r.pickupNotes,
    estimatedDistanceMeters: r.estimatedDistanceM,
    estimatedDurationSeconds: r.estimatedDurationS,
    routeGeometry: (r.routeGeometry as [number, number][] | null) ?? null,
    estimatedFare: r.estimatedFare,
    finalFare: r.finalFare,
    discount: r.discountAmount,
    tip: r.tipAmount,
    cancellationFee: r.cancellationFee,
    currency: r.currency,
    surgeMultiplier: r.surgeMultiplier,
    fareBreakdown: (r.fareBreakdown as Record<string, number>) ?? null,
    paymentType: r.paymentType,
    paymentStatus: r.payments[0]?.status ?? null,
    scheduledAt: iso(r.scheduledAt),
    requestedAt: r.requestedAt.toISOString(),
    acceptedAt: iso(r.acceptedAt),
    arrivedAt: iso(r.arrivedAt),
    startedAt: iso(r.startedAt),
    completedAt: iso(r.completedAt),
    cancelledAt: iso(r.cancelledAt),
    cancellationReason: r.cancellationReason,
    cancelledByRole: r.cancelledByRole,
    startPin: isPassenger || isAdmin ? r.startPin : null,
    driver:
      r.driver && dp
        ? {
            id: r.driver.id,
            firstName: r.driver.firstName,
            lastName: isPassenger ? r.driver.lastName.charAt(0) + '.' : r.driver.lastName,
            avatarUrl: r.driver.avatarUrl,
            phone: live || isAdmin ? r.driver.phone : null,
            rating: Math.round(dp.rating * 100) / 100,
            ratingCount: dp.ratingCount,
            completedRides: dp.completedRides,
            vehicle: r.vehicle ? toVehicleDTO(r.vehicle) : null,
            location:
              dp.lastLat != null && dp.lastLng != null
                ? { lat: dp.lastLat, lng: dp.lastLng, heading: dp.lastHeading }
                : null,
          }
        : null,
    passenger:
      isDriver || isAdmin
        ? {
            id: r.passenger.id,
            firstName: r.passenger.firstName,
            lastName: isAdmin ? r.passenger.lastName : r.passenger.lastName.charAt(0) + '.',
            avatarUrl: r.passenger.avatarUrl,
            phone: live || isAdmin ? r.passenger.phone : null,
            rating: Math.round((r.passenger.passengerProfile?.rating ?? 5) * 100) / 100,
          }
        : null,
    myRating: mine ? { score: mine.score, comment: mine.review?.comment ?? null } : null,
    driverEarning:
      (isDriver || isAdmin) && r.earning
        ? { gross: r.earning.grossFare, commission: r.earning.commission, net: r.earning.netEarning }
        : null,
    createdAt: r.createdAt.toISOString(),
  };
}
