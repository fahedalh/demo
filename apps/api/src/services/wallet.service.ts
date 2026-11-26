import type { WalletTxType } from '@prisma/client';
import type { Tx } from '../lib/prisma';
import { unprocessable } from '../lib/errors';

/**
 * Applies a signed amount to a user's wallet inside the caller's transaction and records the
 * ledger entry. Balance updates use an atomic increment so concurrent writes can't lose money.
 */
export async function postWalletTx(
  tx: Tx,
  userId: string,
  amount: number,
  type: WalletTxType,
  opts: { referenceType?: string; referenceId?: string; description?: string; allowNegative?: boolean; currency?: string } = {},
) {
  const wallet = await tx.wallet.upsert({
    where: { userId },
    create: { userId, currency: opts.currency ?? 'AED' },
    update: {},
  });
  if (amount < 0 && !opts.allowNegative && wallet.balance + amount < 0) {
    throw unprocessable('Insufficient wallet balance', 'INSUFFICIENT_FUNDS');
  }
  const updated = await tx.wallet.update({ where: { id: wallet.id }, data: { balance: { increment: amount } } });
  await tx.walletTransaction.create({
    data: {
      walletId: wallet.id,
      type,
      amount,
      balanceAfter: updated.balance,
      referenceType: opts.referenceType,
      referenceId: opts.referenceId,
      description: opts.description,
    },
  });
  return updated;
}
