'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { beginBookingPayment, completeBookingPayment } from '@/server/actions/bookings';
import { Button } from '@/components/ui/primitives';

/**
 * Opens Razorpay Checkout for an accepted booking.
 *
 * The browser only carries messages. The server creates the order and fixes
 * the amount, and after checkout it verifies the signature and re-reads the
 * payment from Razorpay before confirming anything. If this component never
 * hears back — the tab closed, the network dropped — the booking page
 * reconciles against the order on its next load.
 */

const CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

interface RazorpayResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayInstance {
  open(): void;
  on(event: 'payment.failed', handler: (response: { error?: { description?: string } }) => void): void;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

function loadCheckout(): Promise<boolean> {
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${CHECKOUT_SRC}"]`);
    const script = existing ?? document.createElement('script');
    script.addEventListener('load', () => resolve(true), { once: true });
    script.addEventListener('error', () => resolve(false), { once: true });
    if (!existing) {
      script.src = CHECKOUT_SRC;
      script.async = true;
      document.body.appendChild(script);
    }
  });
}

type State =
  | { phase: 'idle' }
  | { phase: 'opening' }
  | { phase: 'open' }
  | { phase: 'verifying' }
  | { phase: 'error'; message: string };

export function PayButton({
  reference,
  accessKey,
  label,
  description,
}: {
  reference: string;
  accessKey?: string;
  label: string;
  description: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<State>({ phase: 'idle' });

  async function pay() {
    setState({ phase: 'opening' });

    if (!(await loadCheckout()) || !window.Razorpay) {
      setState({ phase: 'error', message: 'The payment window could not load. Check your connection and try again.' });
      return;
    }

    const started = await beginBookingPayment({ reference, key: accessKey });
    if (!started.ok) {
      setState({ phase: 'error', message: started.error });
      router.refresh();
      return;
    }
    const { checkout } = started;

    const razorpay = new window.Razorpay({
      key: checkout.keyId,
      order_id: checkout.orderId,
      amount: checkout.amountPaise,
      currency: checkout.currency,
      name: 'Explore Manipur',
      description,
      prefill: checkout.prefill,
      notes: { booking: checkout.reference },
      // --color-brand-700; Checkout cannot read CSS variables.
      theme: { color: '#452b63' },
      modal: {
        ondismiss: () => setState((current) => (current.phase === 'open' ? { phase: 'idle' } : current)),
      },
      handler: async (response: RazorpayResponse) => {
        setState({ phase: 'verifying' });
        const done = await completeBookingPayment({
          reference,
          key: accessKey,
          orderId: response.razorpay_order_id,
          paymentId: response.razorpay_payment_id,
          signature: response.razorpay_signature,
        });
        if (!done.ok) {
          setState({ phase: 'error', message: done.error });
        } else {
          setState({ phase: 'idle' });
        }
        router.refresh();
      },
    });
    razorpay.on('payment.failed', (response) => {
      // Checkout stays open so the traveller can try another method.
      setState({
        phase: 'error',
        message: response.error?.description ?? 'That payment did not go through. You have not been charged.',
      });
    });
    setState({ phase: 'open' });
    razorpay.open();
  }

  const busy = state.phase === 'opening' || state.phase === 'open' || state.phase === 'verifying';

  return (
    <div className="space-y-2">
      <Button type="button" size="lg" onClick={pay} disabled={busy} className="w-full sm:w-auto">
        {state.phase === 'opening'
          ? 'Opening payment…'
          : state.phase === 'open'
            ? 'Payment window open…'
            : state.phase === 'verifying'
              ? 'Confirming payment…'
              : label}
      </Button>
      {state.phase === 'error' ? (
        <p role="alert" className="rounded-md border border-risk-500/30 bg-risk-100 px-3 py-2 text-[13px] text-risk-700">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
