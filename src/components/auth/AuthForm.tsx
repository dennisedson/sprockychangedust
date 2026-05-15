// @workflow_state: REVIEW
"use client";

import { useState } from "react";
import Link from "next/link";
import { Github } from "lucide-react";
import { createClientSupabaseClient } from "@/lib/supabase/client";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const isLogin = mode === "login";

  async function handlePasswordSubmit() {
    setStatus(null);
    const supabase = createClientSupabaseClient();
    const response = isLogin
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });

    if (response.error) {
      setStatus(response.error.message);
      return;
    }

    const nextPath = getSafeNextPath(new URLSearchParams(window.location.search).get("next"));
    window.location.href = nextPath || (isLogin ? "/dashboard" : "/repositories");
  }

  async function handleOAuth(provider: "github" | "google") {
    setStatus(null);
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
      setStatus(error.message);
    }
  }

  return (
    <>
      <form className="authForm" onSubmit={(event) => event.preventDefault()}>
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
        <button className="button" onClick={handlePasswordSubmit} type="button">
          {isLogin ? "Sign In" : "Create Account"}
        </button>
      </form>
      <div className="divider">
        <span>or</span>
      </div>
      <div className="authProviders">
        <button className="button secondary" onClick={() => handleOAuth("google")} type="button">
          <span className="googleMark">G</span>
          Continue with Google
        </button>
        <button className="button secondary" onClick={() => handleOAuth("github")} type="button">
          <Github size={19} />
          Continue with GitHub
        </button>
      </div>
      {status ? <p className="formStatus">{status}</p> : null}
    </>
  );
}

function getSafeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return null;
  }

  return value;
}
