export const ASSET_CATEGORIES = [
  { value: "domain", label: "Домен" },
  { value: "cdn", label: "CDN" },
  { value: "license", label: "Лицензия" },
  { value: "server", label: "Сервер" },
  { value: "other", label: "Прочее" }
] as const;

export const BILLING_PERIODS = [
  { value: "monthly", label: "Месяц" },
  { value: "quarterly", label: "Квартал" },
  { value: "yearly", label: "Год" }
] as const;

export function categoryLabel(value: string | null | undefined) {
  const found = ASSET_CATEGORIES.find((item) => item.value === value);
  return found?.label ?? value ?? "Прочее";
}

export function toDateInput(value: string | null | undefined) {
  if (!value) return "";
  return value.slice(0, 10);
}

export function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

export function monthStartInput(year = new Date().getFullYear(), month = new Date().getMonth() + 1) {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

export function monthEndInput(year = new Date().getFullYear(), month = new Date().getMonth() + 1) {
  const last = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}

export function formatDateRu(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("ru-RU");
}

export function eventStatusLabel(status: string) {
  if (status === "overdue") return "Просрочено";
  if (status === "today") return "Сегодня";
  return "Скоро";
}
