const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function formatPrice(value: number): string {
  return currency.format(value);
}

const dateFmt = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

export function formatDate(value: string | Date): string {
  return dateFmt.format(new Date(value));
}

// Progressive formatting as a phone number is typed: digits → (###)###-####.
// Caps at 10 digits and strips anything else, so paste/backspace stay clean.
export function formatPhoneInput(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 10);
  if (d.length === 0) return "";
  if (d.length < 4) return `(${d}`;
  if (d.length < 7) return `(${d.slice(0, 3)})${d.slice(3)}`;
  return `(${d.slice(0, 3)})${d.slice(3, 6)}-${d.slice(6)}`;
}

// Display a stored phone number; formats a 10-digit (or 1+10) number and
// leaves anything non-standard (extensions, international) untouched.
export function formatPhone(value: string | null | undefined): string {
  if (!value) return "";
  const d = value.replace(/\D/g, "");
  if (d.length === 10) return `(${d.slice(0, 3)})${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 11 && d[0] === "1")
    return `(${d.slice(1, 4)})${d.slice(4, 7)}-${d.slice(7)}`;
  return value;
}
