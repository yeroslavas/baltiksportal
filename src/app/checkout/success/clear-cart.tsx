"use client";

import { useEffect } from "react";
import { useCart } from "@/lib/cart";

// Empties the cart once, after a successful pay-first checkout.
export function ClearCart() {
  const { clear } = useCart();
  useEffect(() => {
    clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
