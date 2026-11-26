import type { RideDTO, VehicleDTO, VerificationStatus } from '@masar/shared';

export interface DriverProfileResp {
  profile: {
    licenseNumber: string | null;
    licenseExpiry: string | null;
    dateOfBirth: string | null;
    nationalId: string | null;
    verificationStatus: VerificationStatus;
    verificationNote: string | null;
    submittedAt: string | null;
    isOnline: boolean;
    rating: number;
    ratingCount: number;
    completedRides: number;
    activeVehicleId: string | null;
    lastLocation: { lat: number; lng: number } | null;
  };
  vehicles: VehicleDTO[];
  documents: { id: string; type: string; vehicleId: string | null; originalName: string; mimeType: string; status: 'PENDING' | 'APPROVED' | 'REJECTED'; reviewNote: string | null; createdAt: string }[];
  checklist: { personalInfo: boolean; vehicle: boolean; documents: { type: string; uploaded: boolean }[] };
}

export interface DashboardResp {
  isOnline: boolean;
  verificationStatus: VerificationStatus;
  rating: number;
  ratingCount: number;
  completedRides: number;
  cancelledRides: number;
  acceptanceRate: number;
  today: { earnings: number; trips: number };
  week: { earnings: number; trips: number };
  wallet: { balance: number; currency: string };
  recentTrips: RideDTO[];
}
