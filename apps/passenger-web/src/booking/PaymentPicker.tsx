import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Banknote, Check, CreditCard, Wallet } from 'lucide-react';
import type { PaymentType } from '@masar/shared';
import { api, cn, useFormat } from '@masar/ui';
import { useBooking } from './store';
import { AddCardForm } from '../pages/Wallet';

export interface PaymentMethodDTO {
  id: string;
  type: string;
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
  isDefault: boolean;
}

export function usePaymentMethods() {
  return useQuery({
    queryKey: ['payment-methods'],
    queryFn: () => api.get<{ items: PaymentMethodDTO[]; provider: string }>('/payments/methods'),
  });
}
export function useWallet() {
  return useQuery({
    queryKey: ['wallet'],
    queryFn: () => api.get<{ balance: number; currency: string; transactions: any[] }>('/payments/wallet'),
  });
}

/** Picks a sensible default payment method once methods load. */
export function usePaymentLabel() {
  const { t } = useTranslation();
  const b = useBooking();
  const { data } = usePaymentMethods();
  useEffect(() => {
    if (!data) return;
    if (b.paymentType === 'CARD' && !data.items.some((m) => m.id === b.paymentMethodId)) {
      const def = data.items.find((m) => m.isDefault) ?? data.items[0];
      if (def) useBooking.getState().set({ paymentMethodId: def.id });
      else useBooking.getState().set({ paymentType: 'CASH', paymentMethodId: null });
    }
  }, [data, b.paymentType, b.paymentMethodId]);
  if (b.paymentType === 'CARD') {
    const m = data?.items.find((x) => x.id === b.paymentMethodId);
    return m ? `${(m.brand ?? 'card').toUpperCase()} •••• ${m.last4}` : t('ride.payment.CARD');
  }
  return t(`ride.payment.${b.paymentType}`);
}

export function PaymentPicker({
  onDone,
  value,
  onChange,
}: {
  onDone?: () => void;
  value?: { type: PaymentType; id: string | null };
  onChange?: (v: { type: PaymentType; id: string | null }) => void;
}) {
  const { t } = useTranslation();
  const f = useFormat();
  const b = useBooking();
  const { data } = usePaymentMethods();
  const { data: wallet } = useWallet();
  const current = value ?? { type: b.paymentType, id: b.paymentMethodId };
  const pick = (type: PaymentType, id: string | null = null) => {
    if (onChange) onChange({ type, id });
    else b.set({ paymentType: type, paymentMethodId: id });
    onDone?.();
  };
  const Row = ({
    active,
    icon,
    title,
    sub,
    onClick,
  }: {
    active: boolean;
    icon: React.ReactNode;
    title: string;
    sub?: string;
    onClick: () => void;
  }) => (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-2xl p-3 text-start transition',
        active ? 'bg-surface-2' : 'hover:bg-surface-2',
      )}
    >
      <span className="grid size-10 place-items-center rounded-xl bg-surface ring-1 ring-line">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{title}</span>
        {sub && <span className="block text-sm text-muted">{sub}</span>}
      </span>
      {active && <Check className="size-5 text-accent" />}
    </button>
  );
  return (
    <div className="space-y-1">
      {data?.items.map((m) => (
        <Row
          key={m.id}
          active={current.type === 'CARD' && current.id === m.id}
          icon={<CreditCard className="size-5" />}
          title={`${(m.brand ?? 'card').toUpperCase()} •••• ${m.last4}`}
          sub={`${String(m.expMonth).padStart(2, '0')}/${String(m.expYear).slice(-2)}`}
          onClick={() => pick('CARD', m.id)}
        />
      ))}
      <Row
        active={current.type === 'WALLET'}
        icon={<Wallet className="size-5" />}
        title={t('ride.payment.WALLET')}
        sub={wallet ? f.money(wallet.balance, wallet.currency) : undefined}
        onClick={() => pick('WALLET')}
      />
      {!value && (
        <Row
          active={current.type === 'CASH'}
          icon={<Banknote className="size-5" />}
          title={t('ride.payment.CASH')}
          onClick={() => pick('CASH')}
        />
      )}
      <details className="group mt-3 rounded-2xl border border-line p-3">
        <summary className="cursor-pointer list-none font-semibold">+ {t('wallet.addCard')}</summary>
        <div className="mt-3">
          <AddCardForm onAdded={(id) => pick('CARD', id)} />
        </div>
      </details>
    </div>
  );
}
