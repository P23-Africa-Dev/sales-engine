"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createBillingPaymentMethodSetup,
  detachBillingPaymentMethod,
  getBillingPaymentMethods,
  setDefaultBillingPaymentMethod,
} from "@/lib/api/billing";

export const BILLING_PM_KEYS = {
  all: ["billing-payment-methods"] as const,
  list: (companyId?: number | string) => ["billing-payment-methods", companyId] as const,
};

export function useBillingPaymentMethods(companyId?: number | string) {
  return useQuery({
    queryKey: BILLING_PM_KEYS.list(companyId),
    queryFn: async () => {
      const res = await getBillingPaymentMethods(companyId);
      return res.data;
    },
  });
}

export function useBillingPaymentMethodSetup(companyId?: number | string) {
  return useMutation({
    mutationFn: async () => {
      const res = await createBillingPaymentMethodSetup(companyId);
      return res.data;
    },
  });
}

export function useSetDefaultPaymentMethod(companyId?: number | string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (paymentMethodId: string) =>
      setDefaultBillingPaymentMethod(paymentMethodId, companyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BILLING_PM_KEYS.all });
    },
  });
}

export function useDetachPaymentMethod(companyId?: number | string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (paymentMethodId: string) =>
      detachBillingPaymentMethod(paymentMethodId, companyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BILLING_PM_KEYS.all });
    },
  });
}
