// @workflow_state: REVIEW
"use client";

import { Save } from "lucide-react";
import { useFormStatus } from "react-dom";

export function ProfileSaveButton() {
  const { pending } = useFormStatus();

  return (
    <button aria-live="polite" className="button alignRight" disabled={pending} type="submit">
      {pending ? <span aria-hidden="true" className="spinner" /> : <Save size={16} />}
      {pending ? "Saving..." : "Save Changes"}
    </button>
  );
}
