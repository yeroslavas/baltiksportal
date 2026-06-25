import type { KeyboardEvent } from "react";

// Make Enter in a single-line field run the form's action. In this Next/React
// setup, implicit Enter submission on a form with an `action={fn}` doesn't
// reliably fire the action (clicking the submit button works, but Enter can
// silently no-op) — a real footgun on save-forms, where it looks saved but
// isn't. Drop on a <form> as `onKeyDown={submitOnEnter}` to force the submit.
//
// Safe to apply broadly: it only fires for <input> (single-line) fields, so
// Enter in a <textarea> still inserts a newline, and buttons/selects are
// unaffected.
export function submitOnEnter(e: KeyboardEvent<HTMLFormElement>) {
  if (e.key === "Enter" && e.target instanceof HTMLInputElement) {
    e.preventDefault();
    e.currentTarget.requestSubmit();
  }
}
