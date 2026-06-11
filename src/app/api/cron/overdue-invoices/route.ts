import { markOverdueInvoices } from "@/lib/invoices";

// Always run at request time; never cached.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Triggered by Vercel Cron (which sends `Authorization: Bearer <CRON_SECRET>`).
// Sweeps unpaid, past-due invoices to "overdue". The admin Invoices page keeps
// a manual "recompute overdue" button as a fallback (same underlying function).
export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const marked = await markOverdueInvoices();
    return Response.json({ ok: true, marked });
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : "Failed." },
      { status: 500 },
    );
  }
}
