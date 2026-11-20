/** Number and value formats of the RootCause tab (in the browser's locale), shared by the table, the details and the
 *  lineage graph. */
import { toNumber } from "./review";

const amountFormat = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const valueFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 });

export const isEmpty = (value: unknown) => value === null || value === undefined || String(value).trim() === "";

export const formatAmount = (value: unknown) => {
  const number = toNumber(value);
  if (number !== null) return amountFormat.format(number);
  return isEmpty(value) ? "–" : String(value);
};

export const formatValue = (value: unknown) => {
  const number = toNumber(value);
  if (number !== null) return valueFormat.format(number);
  return isEmpty(value) ? "empty" : String(value);
};

export const formatDifference = (value: unknown) => {
  const number = toNumber(value);
  if (number === null) return "–";
  const text = amountFormat.format(number);
  return number > 0 ? `+${text}` : text;
};

/** A change as a lineage field card shows it: +10,000 or -0.5. */
export const formatSigned = (value: number) => (value > 0 ? `+${valueFormat.format(value)}` : valueFormat.format(value));

/** B − A of two values when both are numbers. */
export const numericDifference = (a: unknown, b: unknown): number | null => {
  const before = toNumber(a);
  const after = toNumber(b);
  return before === null || after === null ? null : after - before;
};

export const differenceClass = (value: unknown) => {
  const number = toNumber(value);
  if (number === null || number === 0) return "text-[#8c96a8]";
  return number < 0 ? "text-rose-400" : "text-emerald-400";
};
