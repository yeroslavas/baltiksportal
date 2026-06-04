export default function AdminInvoicesPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-stone-900">
          Invoices
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          Create, send, and track customer invoices.
        </p>
      </div>

      <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-10 text-center">
        <span className="inline-flex items-center rounded-full bg-peach px-3 py-1 text-xs font-semibold text-brand-800">
          Coming soon
        </span>
        <p className="mx-auto mt-4 max-w-md text-sm text-stone-500">
          Invoicing isn&apos;t built yet. This is where you&apos;ll generate
          invoices from orders, mark them paid, and see what&apos;s outstanding.
        </p>
      </div>
    </div>
  );
}
