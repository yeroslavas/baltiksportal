import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getUser, isAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSettings } from "@/lib/settings";
import { buildInvoicePdf } from "@/lib/invoice-pdf";
import type { Invoice, OrderItem } from "@/lib/types";

// GET /invoices/:id/pdf — streams the invoice as a PDF.
//
// Access is enforced by which client we read with: admins use the service_role
// key (any invoice); everyone else uses the RLS-scoped anon client, so only
// their OWN invoice resolves (a foreign id simply returns null → 404).
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  const user = await getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", _req.url));
  }

  const db: SupabaseClient = isAdmin(user.email)
    ? createAdminClient()
    : await createClient();

  const { data: invoice } = await db
    .from("invoices")
    .select("*")
    .eq("id", id)
    .maybeSingle<Invoice>();
  if (!invoice) {
    return new NextResponse("Invoice not found", { status: 404 });
  }

  // Same client → still access-correct (RLS for customers, full for admins).
  const [{ data: order }, { data: itemsData }, { data: customer }, settings] =
    await Promise.all([
      db
        .from("orders")
        .select(
          "total_amount, delivery_fee, fulfillment_type, delivery_date, delivery_time",
        )
        .eq("id", invoice.order_id)
        .maybeSingle<{
          total_amount: number;
          delivery_fee: number;
          fulfillment_type: "delivery" | "pickup";
          delivery_date: string | null;
          delivery_time: string | null;
        }>(),
      db.from("order_items").select("*").eq("order_id", invoice.order_id),
      db
        .from("customers")
        .select("business_name, contact_name, address")
        .eq("id", invoice.customer_id)
        .maybeSingle<{
          business_name: string;
          contact_name: string | null;
          address: string | null;
        }>(),
      getSettings(),
    ]);

  if (!order || !customer) {
    return new NextResponse("Invoice data is incomplete", { status: 404 });
  }

  const pdf = await buildInvoicePdf({
    invoice,
    order,
    items: (itemsData ?? []) as OrderItem[],
    customer,
    business: { name: settings.businessName, address: settings.businessAddress },
  });

  // Copy into a standalone ArrayBuffer (a clean BodyInit) — avoids the
  // Uint8Array<ArrayBufferLike> vs ArrayBuffer mismatch in the DOM types.
  const body = pdf.buffer.slice(
    pdf.byteOffset,
    pdf.byteOffset + pdf.byteLength,
  ) as ArrayBuffer;

  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${invoice.invoice_number}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
