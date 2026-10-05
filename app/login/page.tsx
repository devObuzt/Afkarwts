"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    const payload = await response.json();
    setIsSubmitting(false);

    if (!response.ok) {
      setError(payload.error ?? "تعذّر تسجيل الدخول.");
      return;
    }

    const nextPath = payload.user?.mustChangePassword
      ? "/password"
      : new URLSearchParams(window.location.search).get("next") || "/";
    router.replace(nextPath);
    router.refresh();
  }

  return (
    <main className="loginShell" dir="rtl" lang="ar">
      <form className="loginPanel" onSubmit={login}>
        <div>
          <h1>أفكار</h1>
          <p>تسجيل الدخول</p>
        </div>
        <label>
          اسم المستخدم
          <input
            autoComplete="username"
            autoFocus
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </label>
        <label>
          كلمة المرور
          <input
            autoComplete="current-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error ? <div className="notice loginNotice">{error}</div> : null}
        <button disabled={isSubmitting || !username || !password} type="submit">
          {isSubmitting ? "لحظة…" : "دخول"}
        </button>
        <div className="loginFooter">
          <a href="/privacy">سياسة الخصوصية</a>
          <span>·</span>
          <a href="/terms">شروط الاستخدام</a>
        </div>
      </form>
    </main>
  );
}
