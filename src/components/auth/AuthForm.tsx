// @workflow_state: REVIEW
"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import Link from "next/link";
import { Github } from "lucide-react";
import { createClientSupabaseClient } from "@/lib/supabase/client";

type FormStatus = {
  message: string;
  tone: "error" | "success";
};

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<FormStatus | null>(null);
  const isLogin = mode === "login";

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);
    setIsSubmitting(true);

    const nextPath = getSafeNextPath(new URLSearchParams(window.location.search).get("next"));
    const destination = nextPath || (isLogin ? "/dashboard" : "/repositories");
    const supabase = createClientSupabaseClient();

    try {
      if (isLogin) {
        const response = await supabase.auth.signInWithPassword({ email, password });

        if (response.error) {
          setStatus({ message: response.error.message, tone: "error" });
          return;
        }

        window.location.href = destination;
        return;
      }

      const callbackUrl = new URL("/auth/callback", window.location.origin);
      callbackUrl.searchParams.set("next", destination);
      const response = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: callbackUrl.toString(),
        },
      });

      if (response.error) {
        setStatus({ message: response.error.message, tone: "error" });
        return;
      }

      if (!response.data.session) {
        setStatus({
          message: "Account created. Check your email to confirm before signing in.",
          tone: "success",
        });
        return;
      }

      window.location.href = destination;
    } catch {
      setStatus({
        message: "Authentication failed. Please try again.",
        tone: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleOAuth(provider: "github" | "google") {
    setStatus(null);
    setIsSubmitting(true);
    const supabase = createClientSupabaseClient();
    const nextPath =
      getSafeNextPath(new URLSearchParams(window.location.search).get("next")) ||
      (isLogin ? "/dashboard" : "/repositories");
    const callbackUrl = new URL("/auth/callback", window.location.origin);
    callbackUrl.searchParams.set("next", nextPath);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: callbackUrl.toString(),
      },
    });

    if (error) {
      setStatus({ message: error.message, tone: "error" });
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <form className="authForm" onSubmit={handlePasswordSubmit}>
        <label>
          Email Address
          <input
            className="input"
            onChange={(event) => setEmail(event.target.value)}
            placeholder={isLogin ? "developer@hubspot.com" : "developer@company.com"}
            required
            type="email"
            value={email}
          />
        </label>
        <label>
          <span className="labelRow">
            Password
            {isLogin ? <Link href="/login">Forgot Password?</Link> : null}
          </span>
          <input
            className="input"
            onChange={(event) => setPassword(event.target.value)}
            placeholder={isLogin ? "••••••••" : "Choose a strong password"}
            required
            type="password"
            value={password}
          />
        </label>
        <button className="button" disabled={isSubmitting} type="submit">
          {isSubmitting
            ? isLogin ? "Signing in..." : "Creating..."
            : isLogin ? "Sign In" : "Create Account"}
        </button>
      </form>
      <div className="divider">
        <span>or</span>
      </div>
      <div className="authProviders">
        <button
          className="button secondary"
          disabled={isSubmitting}
          onClick={() => handleOAuth("google")}
          type="button"
        >
          <span className="googleMark">G</span>
          Continue with Google
        </button>
        <button
          className="button secondary"
          disabled={isSubmitting}
          onClick={() => handleOAuth("github")}
          type="button"
        >
          <Github size={19} />
          Continue with GitHub
        </button>
      </div>
      {status ? (
        <p className="formStatus" data-tone={status.tone} role="status">
          {status.message}
        </p>
      ) : null}
    </>
  );
}

function getSafeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return null;
  }

  return value;
}
