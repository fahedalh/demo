import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { ArrowDownLeft, ArrowUpRight, Banknote, CreditCard, Info, Plus, Trash2 } from 'lucide-react';
import {
  api,
  ApiError,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Dialog,
  DialogContent,
  EmptyState,
  Field,
  FormError,
  Input,
  Skeleton,
  toast,
  useFormat,
} from '@masar/ui';
import { usePaymentMethods, useWallet } from '../booking/PaymentPicker';

const cardSchema = z.object({
  cardNumber: z
    .string()
    .transform((v) => v.replace(/\s/g, ''))
    .pipe(z.string().regex(/^\d{12,19}$/, 'Enter a valid card number')),
  expiry: z.string().regex(/^(0[1-9]|1[0-2])\/\d{2}$/, 'Use MM/YY'),
  cvc: z.string().regex(/^\d{3,4}$/, '3–4 digits'),
});

/** Sandbox card form. With Stripe configured, swap this for Stripe Elements (the API accepts a pm_ id). */
export function AddCardForm({ onAdded }: { onAdded?: (id: string) => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<z.input<typeof cardSchema>, unknown, z.output<typeof cardSchema>>({
    resolver: zodResolver(cardSchema),
    defaultValues: { cardNumber: '', expiry: '', cvc: '' },
  });
  const e = form.formState.errors;
  const submit = form.handleSubmit(async (v) => {
    setError(null);
    const [mm, yy] = v.expiry.split('/');
    try {
      // The CVC is validated client-side only and never sent or stored.
      const pm = await api.post<{ id: string }>('/payments/methods', {
        cardNumber: v.cardNumber,
        expMonth: Number(mm),
        expYear: 2000 + Number(yy),
      });
      toast.success(t('wallet.cardAdded'));
      form.reset();
      await qc.invalidateQueries({ queryKey: ['payment-methods'] });
      onAdded?.(pm.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('errors.generic'));
    }
  });
  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <p className="flex gap-2 rounded-xl bg-info/8 p-3 text-xs text-info">
        <Info className="size-4 shrink-0" />
        {t('wallet.sandboxNote')}
      </p>
      <FormError message={error} />
      <Field label={t('wallet.cardNumber')} error={e.cardNumber?.message}>
        <Input
          inputMode="numeric"
          dir="ltr"
          autoComplete="cc-number"
          placeholder="4242 4242 4242 4242"
          {...form.register('cardNumber')}
          invalid={!!e.cardNumber}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('wallet.expiry')} error={e.expiry?.message}>
          <Input
            dir="ltr"
            autoComplete="cc-exp"
            placeholder="12/29"
            {...form.register('expiry')}
            invalid={!!e.expiry}
          />
        </Field>
        <Field label={t('wallet.cvc')} error={e.cvc?.message}>
          <Input
            dir="ltr"
            inputMode="numeric"
            autoComplete="cc-csc"
            placeholder="123"
            {...form.register('cvc')}
            invalid={!!e.cvc}
          />
        </Field>
      </div>
      <Button type="submit" block loading={form.formState.isSubmitting}>
        {t('wallet.addCard')}
      </Button>
    </form>
  );
}

export function WalletPage() {
  const { t } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const wallet = useWallet();
  const methods = usePaymentMethods();
  const [topUp, setTopUp] = useState(false);
  const [addCard, setAddCard] = useState(false);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const history = useQuery({
    queryKey: ['payments', 'history'],
    queryFn: () =>
      api.get<{
        items: {
          id: string;
          receiptNumber: string;
          purpose: string;
          type: string;
          amount: number;
          currency: string;
          status: string;
          createdAt: string;
          ride: { code: string; dropoffAddress: string } | null;
          card: { brand: string; last4: string } | null;
        }[];
      }>('/payments/history?pageSize=20'),
  });
  const setDefault = useMutation({
    mutationFn: (id: string) => api.post(`/payments/methods/${id}/default`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payment-methods'] }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/payments/methods/${id}`),
    onSuccess: () => {
      setRemoveId(null);
      void qc.invalidateQueries({ queryKey: ['payment-methods'] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : t('errors.generic')),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <h1 className="text-2xl font-bold">{t('wallet.title')}</h1>
      <div className="relative overflow-hidden rounded-3xl bg-ink p-6 text-white shadow-float">
        <div className="absolute -end-10 -top-10 size-48 rounded-full bg-accent/25 blur-2xl" aria-hidden />
        <p className="text-sm text-white/70">{t('wallet.balance')}</p>
        {wallet.isLoading ? (
          <Skeleton className="mt-2 h-10 w-40 bg-white/10" />
        ) : (
          <p className="tabular mt-1 text-4xl font-bold text-white">
            {f.money(wallet.data?.balance ?? 0, wallet.data?.currency)}
          </p>
        )}
        <Button
          variant="accent"
          className="mt-5"
          onClick={() => setTopUp(true)}
          disabled={!methods.data?.items.length}
        >
          <Plus /> {t('wallet.topUp')}
        </Button>
      </div>

      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">{t('wallet.methods')}</h2>
          <Button size="sm" variant="outline" onClick={() => setAddCard(true)}>
            <Plus /> {t('wallet.addCard')}
          </Button>
        </div>
        <div className="divide-y divide-line">
          {methods.data?.items.map((m) => (
            <div key={m.id} className="flex items-center gap-3 py-3">
              <span className="grid size-10 place-items-center rounded-xl bg-surface-2">
                <CreditCard className="size-5" />
              </span>
              <div className="flex-1">
                <p className="font-semibold">
                  {(m.brand ?? 'card').toUpperCase()} •••• {m.last4}
                </p>
                <p className="text-xs text-muted">
                  {String(m.expMonth).padStart(2, '0')}/{String(m.expYear).slice(-2)}
                </p>
              </div>
              {m.isDefault ? (
                <Badge tone="success">{t('wallet.default')}</Badge>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => setDefault.mutate(m.id)}>
                  {t('wallet.makeDefault')}
                </Button>
              )}
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={t('actions.remove')}
                onClick={() => setRemoveId(m.id)}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
          <div className="flex items-center gap-3 py-3">
            <span className="grid size-10 place-items-center rounded-xl bg-surface-2">
              <Banknote className="size-5" />
            </span>
            <div className="flex-1">
              <p className="font-semibold">{t('ride.payment.CASH')}</p>
              <p className="text-xs text-muted">{t('wallet.cashAlways')}</p>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 font-semibold">{t('wallet.history')}</h2>
        {history.isLoading && <Skeleton className="h-32" />}
        {history.data && history.data.items.length === 0 && <EmptyState title={t('wallet.noHistory')} />}
        <div className="divide-y divide-line">
          {history.data?.items.map((p) => (
            <div key={p.id} className="flex items-center gap-3 py-3">
              <span className="grid size-9 place-items-center rounded-full bg-surface-2">
                {p.purpose === 'WALLET_TOPUP' ? (
                  <ArrowDownLeft className="size-4 text-accent" />
                ) : (
                  <ArrowUpRight className="size-4" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {t(`wallet.purposes.${p.purpose}`)}
                  {p.ride ? ` · ${p.ride.dropoffAddress}` : ''}
                </p>
                <p className="text-xs text-muted">
                  {f.dateTime(p.createdAt)} · {p.card ? `•••• ${p.card.last4}` : t(`ride.payment.${p.type}`)}
                </p>
              </div>
              <div className="text-end">
                <p className="tabular font-semibold">
                  {p.purpose === 'WALLET_TOPUP' ? '+' : ''}
                  {f.money(p.amount, p.currency)}
                </p>
                {p.status !== 'SUCCEEDED' && (
                  <Badge tone={p.status === 'FAILED' ? 'danger' : 'warning'}>{p.status}</Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Dialog open={addCard} onOpenChange={setAddCard}>
        <DialogContent title={t('wallet.addCard')}>
          <AddCardForm onAdded={() => setAddCard(false)} />
        </DialogContent>
      </Dialog>
      <TopUpDialog open={topUp} onOpenChange={setTopUp} />
      <ConfirmDialog
        open={!!removeId}
        onOpenChange={(o) => !o && setRemoveId(null)}
        title={t('actions.remove')}
        confirmLabel={t('actions.remove')}
        cancelLabel={t('actions.cancel')}
        danger
        loading={remove.isPending}
        onConfirm={() => removeId && remove.mutate(removeId)}
      />
    </div>
  );
}

function TopUpDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const methods = usePaymentMethods();
  const [amount, setAmount] = useState(10_000);
  const [pm, setPm] = useState<string | null>(null);
  const chosen = pm ?? methods.data?.items.find((m) => m.isDefault)?.id ?? methods.data?.items[0]?.id;
  const topup = useMutation({
    mutationFn: () =>
      api.post<{ balance: number }>('/payments/wallet/topup', { amount, paymentMethodId: chosen }),
    onSuccess: () => {
      toast.success(t('wallet.toppedUp'));
      void qc.invalidateQueries({ queryKey: ['wallet'] });
      void qc.invalidateQueries({ queryKey: ['payments'] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : t('errors.generic')),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t('wallet.topUpTitle')}>
        <div className="grid grid-cols-4 gap-2">
          {[5000, 10_000, 20_000, 50_000].map((v) => (
            <button
              key={v}
              onClick={() => setAmount(v)}
              className={`h-12 rounded-xl text-sm font-semibold ring-1 ${amount === v ? 'bg-primary text-primary-fg ring-primary' : 'ring-line'}`}
            >
              {f.money(v).replace(/\.00/, '')}
            </button>
          ))}
        </div>
        <div className="mt-4 space-y-1">
          {methods.data?.items.map((m) => (
            <label
              key={m.id}
              className="flex cursor-pointer items-center gap-3 rounded-xl p-3 hover:bg-surface-2"
            >
              <input
                type="radio"
                name="pm"
                checked={chosen === m.id}
                onChange={() => setPm(m.id)}
                className="accent-[#06C167]"
              />
              <CreditCard className="size-4" /> {(m.brand ?? 'card').toUpperCase()} •••• {m.last4}
            </label>
          ))}
        </div>
        <Button
          block
          size="lg"
          className="mt-4"
          disabled={!chosen}
          loading={topup.isPending}
          onClick={() => topup.mutate()}
        >
          {t('wallet.topUp')} · {f.money(amount)}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
