"use client";

import { useFormStatus } from "react-dom";

export function SettingsSaveButton() {
  const { pending } = useFormStatus();

  return (
    <button aria-live="polite" className="button saveButton" disabled={pending} type="submit">
      {pending ? <span aria-hidden="true" className="spinner" /> : null}
      {pending ? "Saving..." : "Save Preferences"}
    </button>
  );
}
