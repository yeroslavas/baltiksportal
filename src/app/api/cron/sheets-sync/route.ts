import { exportOrdersToSheet } from "@/lib/orders-export";

// Always run at request time; never cached.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Triggered hourly by Vercel Cron (sends `Authorization: Bearer <CRON_SECRET>`).
// Full-replaces the production order export in Google Sheets. Idempotent and
// self-healing — a failed run is fully corrected by the next one.
export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const state = await exportOrdersToSheet();
  return Response.json(state, { status: state.ok ? 200 : 500 });
}
