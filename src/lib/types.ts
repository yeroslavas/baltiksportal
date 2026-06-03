// Hand-written row types mirroring supabase/schema.sql.

export type Customer = {
  id: string;
  user_id: string;
  business_name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  created_at: string;
};

export type Product = {
  id: string;
  name: string;
  description: string | null;
  unit: string;
  base_price: number;
  is_active: boolean;
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
