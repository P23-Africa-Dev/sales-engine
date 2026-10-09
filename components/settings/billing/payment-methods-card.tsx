"use client";

import { useState } from "react";
import { CreditCard, Loader2, Plus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { SettingsSectionCard } from "@/components/settings/settings-section-card";
import { useSettingsAccess } from "@/hooks/use-settings-access";
import {
  useBillingPaymentMethods,
  useDetachPaymentMethod,
  useSetDefaultPaymentMethod,
} from "@/hooks/use-billing-payment-methods";
import { AddPaymentMethodModal } from "@/components/settings/billing/add-payment-method-modal";
import { ApiRequestError } from "@/lib/api/onboarding";

function brandLabel(brand: string | null): string {
  if (!brand) return "Card";
  return brand.charAt(0).toUpperCase() + brand.slice(1);
}

export function PaymentMethodsCard() {
  const { companyId } = useSettingsAccess();
  const [addOpen, setAddOpen] = useState(false);

  const { data, isLoading, refetch } = useBillingPaymentMethods(companyId ?? undefined);
  const setDefaultMutation = useSetDefaultPaymentMethod(companyId ?? undefined);
  const detachMutation = useDetachPaymentMethod(companyId ?? undefined);

  const items = data?.items ?? [];

  function handleSetDefault(paymentMethodId: string) {
    setDefaultMutation.mutate(paymentMethodId, {
      onSuccess: () => toast.success("Primary card updated."),
      onError: (err: Error) => toast.error(err.message || "Failed to update primary card."),
    });
  }

  function handleDetach(paymentMethodId: string, isDefault: boolean) {
    if (isDefault) {
      toast.error("Primary card cannot be deleted. Set another card as primary first.");
      return;
    }

    if (!window.confirm("Remove this payment method?")) return;

    detachMutation.mutate(paymentMethodId, {
      onSuccess: () => toast.success("Payment method removed."),
      onError: (err: unknown) => {
        const message =
          err instanceof ApiRequestError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Failed to remove payment method.";
        toast.error(message);
      },
    });
  }

  return (
    <>
      <SettingsSectionCard
        title="Payment Methods"
        description="Manage cards on file. Your primary card cannot be deleted."
        scope="billing"
      >
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="animate-spin text-gray-400" size={24} />
          </div>
        ) : (
          <div className="space-y-4">
            {items.length === 0 ? (
              <p className="text-[13px] text-gray-500">
                No cards on file yet. Add a card to keep your subscription active.
              </p>
            ) : (
              <ul className="space-y-2">
                {items.map((method) => {
                  const isOnlyCard = items.length === 1;
                  const deleteDisabled =
                    method.is_default || (data?.requires_payment_method && isOnlyCard);

                  return (
                    <li
                      key={method.id}
                      className="flex items-center gap-3 p-4 rounded-xl border border-gray-100"
                    >
                      <CreditCard size={18} className="text-gray-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-semibold text-dash-dark">
                          {brandLabel(method.brand)} •••• {method.last4}
                        </p>
                        <p className="text-[12px] text-gray-500">
                          Expires {method.exp_month}/{method.exp_year}
                        </p>
                      </div>
                      {method.is_default ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase text-amber-700 bg-amber-50 px-2 py-1 rounded-full">
                          <Star size={12} />
                          Primary
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleSetDefault(method.id)}
                          disabled={setDefaultMutation.isPending}
                          className="text-[12px] font-semibold text-dash-dark underline disabled:opacity-50"
                        >
                          Make primary
                        </button>
                      )}
                      <button
                        type="button"
                        title={
                          method.is_default
                            ? "Primary card cannot be deleted"
                            : deleteDisabled
                              ? "At least one card is required"
                              : "Remove card"
                        }
                        disabled={deleteDisabled || detachMutation.isPending}
                        onClick={() => handleDetach(method.id, method.is_default)}
                        className="p-2 rounded-lg text-gray-400 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Trash2 size={16} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-700"
            >
              <Plus size={14} />
              Add card
            </button>
          </div>
        )}
      </SettingsSectionCard>

      <AddPaymentMethodModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        companyId={companyId ?? undefined}
        onSuccess={() => {
          setAddOpen(false);
          refetch();
        }}
      />
    </>
  );
}
