const PERIOD_LABELS: Record<string, string> = {
  monthly: "в месяц",
  yearly: "в год",
  quarterly: "в квартал"
};

export function formatMoney(amount: number | null | undefined, currency = "RUB") {
  if (amount === null || amount === undefined) {
    return "—";
  }
  try {
    return new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency,
      maximumFractionDigits: 2
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export function billingPeriodLabel(period: string | null | undefined) {
  return PERIOD_LABELS[(period || "monthly").toLowerCase()] ?? period ?? "в месяц";
}
