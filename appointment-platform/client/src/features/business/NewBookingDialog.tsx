import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Field } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { useTenant } from '@/contexts/TenantContext';
import { SlotPicker } from '@/features/booking/SlotPicker';
import { api, ApiError, errorMessage } from '@/services/api';
import type { Service, Slot, Staff } from '@/types';
import { useTenantList } from './hooks';

export function NewBookingDialog({ open, onOpenChange, initial }: { open: boolean; onOpenChange: (o: boolean) => void; initial?: { date?: string; staff?: string } }) {
  const { t } = useTranslation('dashboard');
  const tc = useTranslation().t;
  const { id, business, can, staffId: myStaff, terms } = useTenant();
  const qc = useQueryClient();
  const services = useTenantList<Service>('services', { active: 'true' }, open);
  const staff = useTenantList<Staff>('staff', { active: 'true' }, open && can('bookings:manage'));
  const [service, setService] = useState('');
  const [staffId, setStaffId] = useState('');
  const [slot, setSlot] = useState<Slot | null>(null);
  const [c, setC] = useState({ name: '', email: '', phone: '', note: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open && initial?.staff) setStaffId(initial.staff);
  }, [open, initial?.staff]);
  const svc = services.data?.items.find((s) => s._id === service);
  const eligible = (staff.data?.items ?? []).filter((s) => svc?.staff.includes(s._id));
  const effectiveStaff = can('bookings:manage') ? staffId || undefined : myStaff ?? undefined;

  const reset = () => {
    setService('');
    setStaffId('');
    setSlot(null);
    setC({ name: '', email: '', phone: '', note: '' });
    setErrors({});
  };

  async function submit() {
    const errs: Record<string, string> = {};
    if (c.name.trim().length < 2) errs.name = tc('common.required');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email.trim())) errs.email = tc('common.required');
    setErrors(errs);
    if (Object.keys(errs).length || !slot || !svc) return;
    setBusy(true);
    try {
      await api.post(`/businesses/${id}/bookings`, { service, start: slot.start, staff: effectiveStaff, customer: { name: c.name.trim(), email: c.email.trim(), phone: c.phone.trim() }, note: c.note || undefined, paymentMethod: 'cash' });
      toast.success(t('bookings.created'));
      void qc.invalidateQueries({ queryKey: ['bookings', id] });
      reset();
      onOpenChange(false);
    } catch (e) {
      if (e instanceof ApiError && e.details?.fields) setErrors(Object.fromEntries(Object.entries(e.details.fields).map(([k, v]) => [k.replace('customer.', ''), v[0]])));
      toast.error(errorMessage(e));
      if (e instanceof ApiError && e.code === 'SLOT_UNAVAILABLE') setSlot(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent title={t('bookings.new')} size="lg">
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={tc('common.service')} htmlFor="nb-svc" required>
              <NativeSelect id="nb-svc" value={service} onChange={(e) => { setService(e.target.value); setSlot(null); setStaffId(initial?.staff && staff.data?.items.find((x) => x._id === initial.staff) ? initial.staff : ''); }}>
                <option value="">—</option>
                {services.data?.items.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
              </NativeSelect>
            </Field>
            {can('bookings:manage') && eligible.length > 0 && (
              <Field label={terms.staff} htmlFor="nb-staff">
                <NativeSelect id="nb-staff" value={staffId} onChange={(e) => { setStaffId(e.target.value); setSlot(null); }}>
                  <option value="">{tc('common.anyone')}</option>
                  {eligible.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
                </NativeSelect>
              </Field>
            )}
          </div>
          {svc && <SlotPicker key={`${svc._id}-${effectiveStaff ?? ''}-${initial?.date ?? ''}`} base={`/businesses/${id}/bookings`} service={svc._id} staff={effectiveStaff && svc.staff.includes(effectiveStaff) ? effectiveStaff : undefined} timezone={business.timezone} value={slot} onChange={setSlot} initialDate={initial?.date} />}
          {slot && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={tc('common.name')} error={errors.name} htmlFor="nb-name" required><Input id="nb-name" value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} /></Field>
              <Field label={tc('common.email')} error={errors.email} htmlFor="nb-email" required><Input id="nb-email" type="email" value={c.email} onChange={(e) => setC({ ...c, email: e.target.value })} /></Field>
              <Field label={tc('common.phone')} htmlFor="nb-phone"><Input id="nb-phone" dir="ltr" value={c.phone} onChange={(e) => setC({ ...c, phone: e.target.value })} /></Field>
              <Field label={tc('common.notes')} htmlFor="nb-note" className="sm:col-span-2"><Textarea id="nb-note" value={c.note} onChange={(e) => setC({ ...c, note: e.target.value })} /></Field>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{tc('actions.cancel')}</Button>
          <Button disabled={!slot} loading={busy} onClick={submit}>{tc('booking.confirm')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
