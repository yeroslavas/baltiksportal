// Hand-written row types mirroring supabase/schema.sql.

export type Customer = {
  id: string;
  user_id: string;
  business_name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  // Internal/admin fields (not shown to the customer; managed via CSV import).
  sales_rep: string | null;
  tier: string | null;
  notes: string | null;
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

// Delivery/pickup time windows (shown in checkout + validated server-side).
export const DELIVERY_TIME_WINDOWS = [
  "6:30–7:30 AM",
  "7:30–8:30 AM",
  "8:30–9:00 AM",
  "9:00–10:00 AM",
];

export type Order = {
  id: string;
  order_number: number;
  customer_id: string;
  order_date: string;
  status: OrderStatus;
  total_amount: number;
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
