"use client";

import { useState } from "react";

// A number input that can be fully cleared while typing — so "1" can be erased
// and replaced (the native controlled-number input snaps an empty field back,
// which on mobile makes any quantity other than 1x impossible to type). Commits
// the value as you type when it's a valid number, and clamps to >= 1 on blur.
export function QuantityInput({
  value,
  onCommit,
  ariaLabel,
  className,
}: {
  value: number;
  onCommit: (n: number) => void;
  ariaLabel: string;
  className?: string;
}) {
  const [text, setText] = useState(String(value));

  // Reflect external changes (e.g. the value updated elsewhere) without an
  // effect — React's "adjust state during render" pattern.
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setText(String(value));
  }

  return (
    <input
      type="number"
      min={1}
      inputMode="numeric"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const n = parseInt(e.target.value, 10);
        if (Number.isFinite(n) && n >= 1) onCommit(n);
      }}
      onBlur={() => {
        const n = Math.max(1, parseInt(text, 10) || 1);
        setText(String(n));
        if (n !== value) onCommit(n);
      }}
      aria-label={ariaLabel}
      className={className}
    />
  );
}
