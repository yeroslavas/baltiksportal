"use client";

import { useState } from "react";

// A number input that can be fully cleared while typing — so "1" can be erased
// and replaced (the native controlled-number input snaps an empty field back,
// which on mobile makes any quantity other than 1x impossible to type). Commits
// the value as you type when it's valid, and snaps to the allowed increment
// (`step`) on blur. `step` is 0.5 for half-dozen products, otherwise 1.
export function QuantityInput({
  value,
  onCommit,
  ariaLabel,
  className,
  step = 1,
}: {
  value: number;
  onCommit: (n: number) => void;
  ariaLabel: string;
  className?: string;
  step?: number;
}) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);

  // Reflect external changes (e.g. the value updated elsewhere) without an
  // effect — React's "adjust state during render" pattern. Skip while the field
  // is focused so snapping the committed value doesn't rewrite what's being typed.
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    if (!focused) setText(String(value));
  }

  return (
    <input
      type="number"
      min={step}
      step={step}
      inputMode={step < 1 ? "decimal" : "numeric"}
      value={text}
      onFocus={() => setFocused(true)}
      onChange={(e) => {
        setText(e.target.value);
        const n = parseFloat(e.target.value);
        if (Number.isFinite(n) && n >= step) onCommit(n);
      }}
      onBlur={() => {
        setFocused(false);
        const parsed = parseFloat(text);
        const n =
          Number.isFinite(parsed) && parsed >= step
            ? Math.round(parsed / step) * step
            : step;
        setText(String(n));
        if (n !== value) onCommit(n);
      }}
      aria-label={ariaLabel}
      className={className}
    />
  );
}
