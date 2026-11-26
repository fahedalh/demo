import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { PlatformRole } from '@bookly/shared';
import { Skeleton } from '@/components/ui/misc';
import { useAuth } from '@/contexts/AuthContext';
import { AccountLayout } from '@/layouts/AccountLayout';
import { AdminLayout } from '@/layouts/AdminLayout';
import { BusinessLayout } from '@/layouts/BusinessLayout';
import { PublicLayout } from '@/layouts/PublicLayout';

const p = (loader: () => Promise<Record<string, unknown>>, name: string) => lazy(async () => ({ default: (await loader())[name] as ComponentType }));

// Public
const LandingPage = p(() => import('@/pages/public/LandingPage'), 'LandingPage');
const ExplorePage = p(() => import('@/pages/public/ExplorePage'), 'ExplorePage');
const BusinessPage = p(() => import('@/pages/public/BusinessPage'), 'BusinessPage');
const TrackPage = p(() => import('@/pages/public/TrackPage'), 'TrackPage');
const PricingPage = p(() => import('@/pages/public/PricingPage'), 'PricingPage');
const ContactPage = p(() => import('@/pages/public/ContactPage'), 'ContactPage');
const LoginPage = p(() => import('@/pages/auth/AuthPages'), 'LoginPage');
const RegisterPage = p(() => import('@/pages/auth/AuthPages'), 'RegisterPage');
const PayTestPage = p(() => import('@/pages/public/PayTestPage'), 'PayTestPage');
const NotFoundPage = p(() => import('@/pages/public/NotFoundPage'), 'NotFoundPage');
const OnboardingPage = p(() => import('@/pages/business/OnboardingPage'), 'OnboardingPage');
// Customer
const AccountOverview = p(() => import('@/pages/account/AccountPages'), 'AccountOverview');
const MyBookingsPage = p(() => import('@/pages/account/AccountPages'), 'MyBookingsPage');
const BookingDetailPage = p(() => import('@/pages/account/BookingDetailPage'), 'BookingDetailPage');
const FavoritesPage = p(() => import('@/pages/account/AccountPages'), 'FavoritesPage');
const MyPaymentsPage = p(() => import('@/pages/account/AccountPages'), 'MyPaymentsPage');
const NotificationsPage = p(() => import('@/pages/account/AccountPages'), 'NotificationsPage');
const ProfilePage = p(() => import('@/pages/account/ProfilePage'), 'ProfilePage');
// Business
const OverviewPage = p(() => import('@/pages/business/OverviewPage'), 'OverviewPage');
const CalendarPage = p(() => import('@/pages/business/CalendarPage'), 'CalendarPage');
const BookingsPage = p(() => import('@/pages/business/BookingsPage'), 'BookingsPage');
const ServicesPage = p(() => import('@/pages/business/ServicesPage'), 'ServicesPage');
const StaffPage = p(() => import('@/pages/business/StaffPage'), 'StaffPage');
const BranchesPage = p(() => import('@/pages/business/BranchesPage'), 'BranchesPage');
const ResourcesPage = p(() => import('@/pages/business/ResourcesPage'), 'ResourcesPage');
const AvailabilityPage = p(() => import('@/pages/business/AvailabilityPage'), 'AvailabilityPage');
const CustomersPage = p(() => import('@/pages/business/CustomersPage'), 'CustomersPage');
const PaymentsPage = p(() => import('@/pages/business/PaymentsPage'), 'PaymentsPage');
const ReviewsPage = p(() => import('@/pages/business/ReviewsPage'), 'ReviewsPage');
const WaitlistPage = p(() => import('@/pages/business/WaitlistPage'), 'WaitlistPage');
const SettingsPage = p(() => import('@/pages/business/SettingsPage'), 'SettingsPage');
const BillingPage = p(() => import('@/pages/business/BillingPage'), 'BillingPage');
// Admin
const AdminOverview = p(() => import('@/pages/admin/AdminOverview'), 'AdminOverview');
const AdminBusinesses = p(() => import('@/pages/admin/AdminLists'), 'AdminBusinesses');
const AdminUsers = p(() => import('@/pages/admin/AdminLists'), 'AdminUsers');
const AdminPayments = p(() => import('@/pages/admin/AdminLists'), 'AdminPayments');
const AdminAudit = p(() => import('@/pages/admin/AdminLists'), 'AdminAudit');
const AdminMessages = p(() => import('@/pages/admin/AdminLists'), 'AdminMessages');
const AdminSubscriptions = p(() => import('@/pages/admin/AdminLists'), 'AdminSubscriptions');
const AdminCategories = p(() => import('@/pages/admin/AdminCategories'), 'AdminCategories');
const AdminPlans = p(() => import('@/pages/admin/AdminPlans'), 'AdminPlans');
const AdminSettings = p(() => import('@/pages/admin/AdminSettings'), 'AdminSettings');
const AdminRoles = p(() => import('@/pages/admin/AdminSettings'), 'AdminRoles');

function PageFallback() {
  return (
    <div className="container space-y-4 py-10" aria-busy="true">
      <Skeleton className="h-9 w-56" />
      <Skeleton className="h-44" />
      <Skeleton className="h-72" />
    </div>
  );
}

function RequireAuth({ children, roles }: { children: ReactNode; roles?: PlatformRole[] }) {
  const { user, ready } = useAuth();
  const loc = useLocation();
  if (!ready) return <PageFallback />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/account" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<LandingPage />} />
          <Route path="explore" element={<ExplorePage />} />
          <Route path="b/:slug" element={<BusinessPage />} />
          <Route path="track" element={<TrackPage />} />
          <Route path="pricing" element={<PricingPage />} />
          <Route path="contact" element={<ContactPage />} />
          <Route path="login" element={<LoginPage />} />
          <Route path="register" element={<RegisterPage />} />
          <Route path="pay/test/:paymentId" element={<PayTestPage />} />
          <Route path="onboarding" element={<RequireAuth><OnboardingPage /></RequireAuth>} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>

        <Route path="account" element={<RequireAuth><AccountLayout /></RequireAuth>}>
          <Route index element={<AccountOverview />} />
          <Route path="bookings" element={<MyBookingsPage />} />
          <Route path="bookings/:id" element={<BookingDetailPage />} />
          <Route path="favorites" element={<FavoritesPage />} />
          <Route path="payments" element={<MyPaymentsPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>

        <Route path="dashboard/:businessId" element={<RequireAuth><BusinessLayout /></RequireAuth>}>
          <Route index element={<OverviewPage />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="bookings" element={<BookingsPage />} />
          <Route path="waitlist" element={<WaitlistPage />} />
          <Route path="services" element={<ServicesPage />} />
          <Route path="staff" element={<StaffPage />} />
          <Route path="branches" element={<BranchesPage />} />
          <Route path="resources" element={<ResourcesPage />} />
          <Route path="availability" element={<AvailabilityPage />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route path="payments" element={<PaymentsPage />} />
          <Route path="reviews" element={<ReviewsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="billing" element={<BillingPage />} />
        </Route>

        <Route path="admin" element={<RequireAuth roles={['super_admin']}><AdminLayout /></RequireAuth>}>
          <Route index element={<AdminOverview />} />
          <Route path="businesses" element={<AdminBusinesses />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="categories" element={<AdminCategories />} />
          <Route path="plans" element={<AdminPlans />} />
          <Route path="subscriptions" element={<AdminSubscriptions />} />
          <Route path="payments" element={<AdminPayments />} />
          <Route path="roles" element={<AdminRoles />} />
          <Route path="messages" element={<AdminMessages />} />
          <Route path="audit" element={<AdminAudit />} />
          <Route path="settings" element={<AdminSettings />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
