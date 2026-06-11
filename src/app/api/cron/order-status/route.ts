import { sweepOrderStatuses } from "@/lib/order-status-sweep";

// Always run at request time; never cached.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Triggered hourly by Vercel Cron (sends `Authorization: Bearer <CRON_SECRET>`).
// Advances order status by the business clock: pending → processing at the
// cutoff hour the night before delivery, processing → fulfilled at noon on the
// delivery day. No-op on the hours in between.
export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await sweepOrderStatuses();
  return Response.json({ ok: true, ...result });
}
