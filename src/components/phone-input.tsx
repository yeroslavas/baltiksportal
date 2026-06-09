"use client";

import { useEffect, useRef, useState } from "react";
import { formatPhoneInput } from "@/lib/format";

// A text input that auto-formats a US phone number to (###)###-#### as you
// type. Submits the formatted value under `name`. Stays in sync with a native
// form.reset() (used by the create-customer form).
export function PhoneInput({
  name,
  defaultValue = "",
  className,
}: {
  name: string;
  defaultValue?: string;
  className?: string;
}) {
  const [value, setValue] = useState(() => formatPhoneInput(defaultValue));
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const form = ref.current?.form;
    if (!form) return;
    const onReset = () => setValue(formatPhoneInput(defaultValue));
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, [defaultValue]);

  return (
    <input
      ref={ref}
      name={name}
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      placeholder="(555)123-4567"
      value={value}
      onChange={(e) => setValue(formatPhoneInput(e.target.value))}
      className={className}
    />
  );
}
