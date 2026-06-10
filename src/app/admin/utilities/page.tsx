import { getSettings } from "@/lib/settings";
import { UtilitiesForm } from "./utilities-form";

export default async function UtilitiesPage() {
  const settings = await getSettings();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-stone-900">
          Utilities
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          Operational settings — the delivery fee, the delivery minimum, the
          delivery/pickup windows, the next-day order cutoff, and the business
          identity shown on invoices.
        </p>
      </div>

      <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <UtilitiesForm settings={settings} />
      </section>
    </div>
  );
}
