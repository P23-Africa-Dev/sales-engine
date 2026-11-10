"use client";

import { useEffect, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import {
  useBillingPaymentMethodSetup,
  useSetDefaultPaymentMethod,
} from "@/hooks/use-billing-payment-methods";

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "",
);

function AddCardForm({
  companyId,
  onSuccess,
  onClose,
}: {
  companyId?: number | string;
  onSuccess: () => void;
  onClose: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const setDefaultMutation = useSetDefaultPaymentMethod(companyId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;

    setSubmitting(true);
    try {
      const result = await stripe.confirmSetup({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}${window.location.pathname}`,
        },
        redirect: "if_required",
      });

      if (result.error) {
        toast.error(result.error.message ?? "Card setup failed.");
        return;
      }

      const paymentMethodId =
        typeof result.setupIntent?.payment_method === "string"
          ? result.setupIntent.payment_method
          : result.setupIntent?.payment_method?.id;

      if (paymentMethodId) {
        await setDefaultMutation.mutateAsync(paymentMethodId);
      }

      toast.success("Card added successfully.");
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Card setup failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />
      <div className="flex gap-2 justify-end pt-2">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2.5 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-600"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!stripe || submitting}
          className="px-4 py-2.5 rounded-xl bg-dash-dark text-white text-[13px] font-semibold disabled:opacity-50 flex items-center gap-2"
        >
          {submitting && <Loader2 size={14} className="animate-spin" />}
          Save card
        </button>
      </div>
    </form>
  );
}

export function AddPaymentMethodModal({
  open,
  onClose,
  companyId,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  companyId?: number | string;
  onSuccess: () => void;
}) {
  const setupMutation = useBillingPaymentMethodSetup(companyId);
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset Stripe setup when modal closes
      setClientSecret(null);
      return;
    }

    setupMutation.mutate(undefined, {
      onSuccess: (data) => setClientSecret(data.client_secret),
      onError: (err: Error) => {
        toast.error(err.message || "Unable to start card setup.");
        onClose();
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-label="Close"
      />
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-[16px] font-bold text-dash-dark">Add payment method</h3>
          <button type="button" onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>
        <div className="p-5">
          {!clientSecret || setupMutation.isPending ? (
            <div className="flex justify-center py-12">
              <Loader2 className="animate-spin text-gray-400" size={24} />
            </div>
          ) : (
            <Elements stripe={stripePromise} options={{ clientSecret }}>
              <AddCardForm companyId={companyId} onSuccess={onSuccess} onClose={onClose} />
            </Elements>
          )}
        </div>
      </div>
    </div>
  );
}
