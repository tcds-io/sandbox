/** Asaas reports dates in Brasília time. */
const TIME_ZONE = "America/Sao_Paulo";

const dateFormat = new Intl.DateTimeFormat("sv-SE", { timeZone: TIME_ZONE, dateStyle: "short" });
const dateTimeFormat = new Intl.DateTimeFormat("sv-SE", {
  timeZone: TIME_ZONE,
  dateStyle: "short",
  timeStyle: "medium",
});

/** "2024-06-12" */
export const toDate = (d: Date): string => dateFormat.format(d);
/** "2024-06-12 16:45:03" */
export const toDateTime = (d: Date): string => dateTimeFormat.format(d);

export const addDays = (d: Date, days: number): Date => new Date(d.getTime() + days * 86_400_000);
