// Hand-written row types mirroring supabase/schema.sql.

export type Customer = {
  id: string;
  user_id: string;
  business_name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  // Assigned delivery/pickup window (admin-set; snapshotted onto orders).
  delivery_window: string | null;
  // Internal/admin fields (not shown to the customer; managed via CSV import).
  sales_rep: string | null;
  tier: string | null;
  notes: string | null;
  waive_delivery_minimum: boolean;
  allow_invoicing: boolean;
  created_at: string;
};

export type Product = {
  id: string;
  name: string;
  description: string | null;
  unit: string;
  base_price: number;
  is_active: boolean;
  image_url: string | null;
  // Internal / reporting fields (not customer-facing; managed via CSV import).
  sku: string | null;
  bake_time: string | null;
  product_type: string | null;
  report_group: string | null;
  report_unit: string | null;
  report_count: number | null;
  sort_order: number | null;
  created_at: string;
};

export type CustomerPricing = {
  id: string;
  customer_id: string;
  product_id: string;
  custom_price: number;
  created_at: string;
};

// A product as shown to a customer, with the effective price resolved.
export type PricedProduct = Product & {
  effective_price: number;
  has_custom_price: boolean;
};

export type OrderStatus = "pending" | "processing" | "fulfilled";

export const ORDER_STATUSES: OrderStatus[] = [
  "pending",
  "processing",
  "fulfilled",
];

export type FulfillmentType = "delivery" | "pickup";

// The delivery fee, delivery minimum, and delivery/pickup windows are now
// admin-editable — see src/lib/settings.ts (backed by public.app_settings).

export type Order = {
  id: string;
  order_number: number;
  customer_id: string;
  order_date: string;
  status: OrderStatus;
  total_amount: number;
  delivery_fee: number;
  fulfillment_type: FulfillmentType;
  delivery_date: string | null;
  delivery_time: string | null;
  created_at: string;
};

export type OrderItem = {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  created_at: string;
};

// Recurring order template (see src/lib/standing-orders.ts for scheduling).
export type StandingOrder = {
  id: string;
  customer_id: string;
  fulfillment_type: FulfillmentType;
  days_of_week: number[]; // ISO 1=Mon … 7=Sun
  interval_weeks: number; // 1 weekly, 2 every other week
  anchor_date: string;
  end_date: string | null;
  skip_dates: string[];
  is_active: boolean;
  lead_days: number;
  note: string | null;
  created_at: string;
};

export type StandingOrderItem = {
  id: string;
  standing_order_id: string;
  product_id: string;
  quantity: number;
  created_at: string;
};
