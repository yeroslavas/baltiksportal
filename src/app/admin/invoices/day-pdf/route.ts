import { NextResponse, type NextRequest } from "next/server";
import { getUser, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSettings } from "@/lib/settings";
import { buildInvoicesPdf, type InvoicePdfInput } from "@/lib/invoice-pdf";
import { businessToday } from "@/lib/standing-orders";
import type { Invoice, OrderItem } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

type Row = Invoice & {
  orders: {
    fulfillment_type: "delivery" | "pickup";
    delivery_date: string | null;
    delivery_time: string | null;
    status: string;
    total_amount: number;
    delivery_fee: number;
  } | null;
  customers: {
    business_name: string;
    contact_name: string | null;
    address: string | null;
  } | null;
};

// GET /admin/invoices/day-pdf?date=YYYY-MM-DD — one merged PDF (one invoice per
// page) of every non-canceled order fulfilled on that date. Defaults to today
// in the business timezone. Admin only.
export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));
  if (!isAdmin(user.email)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const param = req.nextUrl.searchParams.get("date") ?? "";
  const date = isDate(param) ? param : businessToday();

  const admin = createAdminClient();
  const { data: invData, error } = await admin
    .from("invoices")
    .select(
      "*, orders!inner(fulfillment_type, delivery_date, delivery_time, status, total_amount, delivery_fee), customers(business_name, contact_name, address)",
    )
    .eq("orders.delivery_date", date)
    .neq("orders.status", "canceled")
    .neq("status", "canceled");
  if (error) return new NextResponse(error.message, { status: 500 });

  const rows = (invData ?? []) as unknown as Row[];

  // Items for all matched orders in one query, grouped by order.
  const itemsByOrder = new Map<string, OrderItem[]>();
  if (rows.length > 0) {
    const { data: itemsData } = await admin
      .from("order_items")
      .select("*")
      .in(
        "order_id",
        rows.map((r) => r.order_id),
      );
    for (const it of (itemsData ?? []) as OrderItem[]) {
      const arr = itemsByOrder.get(it.order_id) ?? [];
      arr.push(it);
      itemsByOrder.set(it.order_id, arr);
    }
  }

  // Order the pages by delivery window, then business name — the morning route.
  rows.sort((a, b) => {
    const ta = a.orders?.delivery_time ?? "";
    const tb = b.orders?.delivery_time ?? "";
    if (ta !== tb) return ta.localeCompare(tb);
    return (a.customers?.business_name ?? "").localeCompare(
      b.customers?.business_name ?? "",
    );
  });

  const settings = await getSettings();
  const business = {
    name: settings.businessName,
    address: settings.businessAddress,
  };
  const inputs: InvoicePdfInput[] = rows.map((r) => ({
    invoice: r,
    order: {
      total_amount: Number(r.orders?.total_amount ?? r.total_amount),
      delivery_fee: Number(r.orders?.delivery_fee ?? 0),
      fulfillment_type: r.orders?.fulfillment_type ?? "delivery",
      delivery_date: r.orders?.delivery_date ?? null,
      delivery_time: r.orders?.delivery_time ?? null,
    },
    items: itemsByOrder.get(r.order_id) ?? [],
    customer: {
      business_name: r.customers?.business_name ?? "—",
      contact_name: r.customers?.contact_name ?? null,
      address: r.customers?.address ?? null,
    },
    business,
  }));

  const pdf = await buildInvoicesPdf(inputs);
  const body = pdf.buffer.slice(
    pdf.byteOffset,
    pdf.byteOffset + pdf.byteLength,
  ) as ArrayBuffer;

  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="invoices-${date}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
