"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type CartItem = {
  productId: string;
  name: string;
  unit: string;
  unitPrice: number; // the customer's price at add-time (display only)
  // When true, orderable in 0.5 increments (half-dozen); otherwise whole units.
  allowHalf: boolean;
  // Whether this item can be sliced, and whether the customer chose to.
  allowSlicing: boolean;
  sliced: boolean;
  quantity: number;
};

// Round a quantity to the item's allowed increment (0.5 for half-dozen items,
// whole units otherwise). Tolerates a missing flag (legacy carts) as whole-only.
const snapQty = (qty: number, allowHalf?: boolean) => {
  const step = allowHalf ? 0.5 : 1;
  return Math.round(qty / step) * step;
};

type CartContextValue = {
  items: CartItem[];
  count: number;
  total: number;
  addItem: (item: Omit<CartItem, "quantity">, qty: number) => void;
  updateQuantity: (productId: string, qty: number) => void;
  setSliced: (productId: string, sliced: boolean) => void;
  removeItem: (productId: string) => void;
  clear: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = "baltiks-cart";

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from sessionStorage after mount. This must run post-mount (the
  // store isn't available during SSR), so the setState here is intentional and
  // avoids a hydration mismatch (server + first client render both start empty).
  useEffect(() => {
    let initial: CartItem[] = [];
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) initial = JSON.parse(raw);
    } catch {
      // ignore malformed storage
    }
    /* eslint-disable react-hooks/set-state-in-effect */
    setItems(initial);
    setHydrated(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // storage may be unavailable; cart just won't survive a refresh
    }
  }, [items, hydrated]);

  const addItem = useCallback(
    (item: Omit<CartItem, "quantity">, qty: number) => {
      const step = item.allowHalf ? 0.5 : 1;
      const quantity = Math.max(step, snapQty(qty, item.allowHalf) || step);
      setItems((prev) => {
        const existing = prev.find((i) => i.productId === item.productId);
        if (existing) {
          return prev.map((i) =>
            i.productId === item.productId
              ? { ...i, quantity: i.quantity + quantity, sliced: item.sliced }
              : i,
          );
        }
        return [...prev, { ...item, quantity }];
      });
    },
    [],
  );

  const updateQuantity = useCallback((productId: string, qty: number) => {
    setItems((prev) => {
      const item = prev.find((i) => i.productId === productId);
      const quantity = snapQty(qty, item?.allowHalf);
      if (quantity <= 0) return prev.filter((i) => i.productId !== productId);
      return prev.map((i) =>
        i.productId === productId ? { ...i, quantity } : i,
      );
    });
  }, []);

  const setSliced = useCallback((productId: string, sliced: boolean) => {
    setItems((prev) =>
      prev.map((i) => (i.productId === productId ? { ...i, sliced } : i)),
    );
  }, []);

  const removeItem = useCallback((productId: string) => {
    setItems((prev) => prev.filter((i) => i.productId !== productId));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const value = useMemo<CartContextValue>(() => {
    const count = items.reduce((sum, i) => sum + i.quantity, 0);
    const total = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
    return {
      items,
      count,
      total,
      addItem,
      updateQuantity,
      setSliced,
      removeItem,
      clear,
    };
  }, [items, addItem, updateQuantity, setSliced, removeItem, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within a CartProvider");
  return ctx;
}
