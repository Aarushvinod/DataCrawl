export type PaymentMethodType = 'stripe_card' | 'solana_wallet';

export interface PaymentMethod {
  id: string;
  type: PaymentMethodType;
  brand: string;
  last4: string;
  exp_month?: number | null;
  exp_year?: number | null;
  is_default: boolean;
  label?: string | null;
  wallet_address?: string | null;
  network?: string | null;
  asset?: string | null;
  provider?: string | null;
}

export function isSolanaWallet(method: PaymentMethod) {
  return method.type === 'solana_wallet';
}

export function paymentMethodLabel(method: PaymentMethod) {
  if (method.type === 'solana_wallet') {
    return `${method.label || 'Solana wallet'} • ${method.wallet_address || method.last4}`;
  }
  return `${method.brand.toUpperCase()} ending in ${method.last4}`;
}
