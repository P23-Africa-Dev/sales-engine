export const PAYROLL_STATUS_SEQUENCE = ["all", "approved", "pending", "revoked"] as const;

export type PayrollStatusFilter = (typeof PAYROLL_STATUS_SEQUENCE)[number];

export function nextPayrollStatusFilter(current: PayrollStatusFilter): PayrollStatusFilter {
    const currentIndex = PAYROLL_STATUS_SEQUENCE.indexOf(current);
    const nextIndex = (currentIndex + 1) % PAYROLL_STATUS_SEQUENCE.length;
    return PAYROLL_STATUS_SEQUENCE[nextIndex];
}

export function formatPayrollDateLabel(date: string): string {
    const value = new Date(`${date}T00:00:00`);

    if (Number.isNaN(value.getTime())) {
        return date;
    }

    return value.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
    });
}