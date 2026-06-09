import { generateStandingOrders } from "@/lib/standing-orders-run";

// Always run at request time; never cached.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Triggered by Vercel Cron (which sends `Authorization: Bearer <CRON_SECRET>`).
// Also callable manually with the same header for testing.
export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const summary = await generateStandingOrders();
  return Response.json({
    ok: true,
    today: summary.today,
    created: summary.created.length,
    alreadyPresent: summary.alreadyPresent,
    canceled: summary.canceled.length,
    skippedEmpty: summary.skippedEmpty.length,
    errors: summary.errors,
    createdDetails: summary.created,
  });
}
