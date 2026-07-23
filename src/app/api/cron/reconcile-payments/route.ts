import { reconcilePaymentsInFlight } from "@/lib/reconcile";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Triggered by Vercel Cron (Authorization: Bearer <CRON_SECRET>). Reconciles every
// in-flight payment against Stripe's actual PaymentIntent status — the backstop
// for missed/unhandled failure or success webhooks. Idempotent; safe to repeat.
export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const summary = await reconcilePaymentsInFlight();
  return Response.json({ ok: true, ...summary });
}
