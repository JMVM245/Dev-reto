"use client";

import { FormEvent, useState } from "react";

export default function RecruiterLoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setLoading(true);
    try {
      const response = await fetch("/api/panel/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      const data = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error ?? "No se pudo iniciar sesión.");
      const next = new URLSearchParams(window.location.search).get("next") ?? "/buk";
      window.location.assign(next.startsWith("/") && !next.startsWith("//") ? next : "/buk");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo iniciar sesión.");
    } finally { setLoading(false); }
  }

  return <main className="panel-login-page"><form className="panel-login-card" onSubmit={submit}>
    <span className="panel-login-brand">d</span><small>DEVSYNC · RECLUTAMIENTO</small>
    <h1>Panel de Buk</h1><p>Inicia sesión para revisar las postulaciones recibidas.</p>
    {error && <div className="panel-login-error" role="alert">{error}</div>}
    <label>Contraseña del reclutador<input type="password" required autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} /></label>
    <button type="submit" disabled={loading}>{loading ? "Ingresando…" : "Ingresar al panel"}</button>
  </form></main>;
}
