"use client";

import Link from "next/link";
import { useCart } from "@/lib/cart";

export function CartIndicator() {
  const { count } = useCart();
  return (
    <Link
      href="/cart"
      className="text-sm font-medium text-brand-700 hover:underline"
    >
      Cart{count > 0 ? ` (${count})` : ""}
    </Link>
  );
}
