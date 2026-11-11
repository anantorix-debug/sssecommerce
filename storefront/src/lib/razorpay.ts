'use client';

import type { PaymentStart } from './types';

interface RazorpayResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

declare global {
  interface Window {
    Razorpay?: new (opts: Record<string, unknown>) => { open: () => void; on: (event: string, cb: (r: { error: { description: string } }) => void) => void };
  }
}

let loader: Promise<void> | null = null;

/** Razorpay Checkout loads only on the checkout and confirmation pages, when the customer pays online. */
export function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve();
  loader ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loader = null;
      reject(new Error('Could not load the payment window. Check your connection and try again.'));
    };
    document.body.appendChild(s);
  });
  return loader;
}

export async function openRazorpay(
  start: PaymentStart,
  store: string,
  handlers: { onSuccess: (r: RazorpayResponse) => void; onDismiss: () => void; onFailure: (message: string) => void },
) {
  const rp = start.razorpay!;
  await loadRazorpay();
  const checkout = new window.Razorpay!({
    key: rp.keyId,
    order_id: rp.orderId,
    amount: rp.amount,
    currency: rp.currency,
    name: store,
    description: `Order ${start.orderNumber}`,
    image: `${window.location.origin}/icon.png`,
    prefill: rp.prefill,
    notes: { orderNumber: start.orderNumber },
    theme: { color: '#8E1012' },
    // EMI and pay-later stay hidden while FEATURE_EMI is off
    config: rp.hiddenMethods.length ? { display: { hide: rp.hiddenMethods.map((method) => ({ method })), preferences: { show_default_blocks: true } } } : undefined,
    retry: { enabled: true, max_count: 3 },
    handler: handlers.onSuccess,
    modal: { ondismiss: handlers.onDismiss, confirm_close: true },
  });
  checkout.on('payment.failed', (r) => handlers.onFailure(r.error?.description ?? 'Payment failed'));
  checkout.open();
}
