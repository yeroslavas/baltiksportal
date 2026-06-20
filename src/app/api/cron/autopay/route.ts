import { runAutopayCharges } from "@/lib/autopay-run";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Triggered daily by Vercel Cron (Authorization: Bearer <CRON_SECRET>). Charges
// auto-pay customers' invoices that are due (or past due) and not already paid.
// Idempotent and safe to run repeatedly.
export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const summary = await runAutopayCharges();
  return Response.json({ ok: true, ...summary });
}
