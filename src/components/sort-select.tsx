"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

export type SortOption = { value: string; label: string };

// A compact "Sort by" dropdown for the customer-facing card lists, which have no
// column headers to click (unlike the admin tables — see SortableHeader). Drives
// server-side sorting via `?sort=`, and always resets to page 1, since keeping
// the page number across a re-sort lands you somewhere arbitrary.
//
// The default option is represented by dropping the param entirely, so the plain
// URL stays clean and shareable.
export function SortSelect({
  value,
  options,
  defaultValue,
  label = "Sort by",
}: {
  value: string;
  options: SortOption[];
  defaultValue: string;
  label?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const onChange = (next: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === defaultValue) params.delete("sort");
    else params.set("sort", next);
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  return (
    <label className="flex items-center gap-2 text-sm text-stone-500">
      <span className="whitespace-nowrap">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm text-stone-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
