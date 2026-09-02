import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { accountEmailSchema } from "@shared/accountValidation";

function responseError(error: unknown): { message: string; secondsLeft?: number } {
  const message = error instanceof Error ? error.message : "Please try again.";
  try { return JSON.parse(message.replace(/^\d+:\s*/, "")); }
  catch { return { message: "Unable to connect. Please try again." }; }
}

/** Recovery stays available even when the verification provider is unavailable. */
export default function EmailGateScreen({ email }: { email: string }) {
  const [, setLocation] = useLocation();
  const [cooldown, setCooldown] = useState(0);
  const [editing, setEditing] = useState(false);
  const [nextEmail, setNextEmail] = useState(email);
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { setNextEmail(email); }, [email]);
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown(value => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);
  useEffect(() => {
    const timer = setInterval(() => queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] }), 3000);
    return () => clearInterval(timer);
  }, []);

  const resend = useMutation({
    mutationFn: async () => {
      setError(""); setNotice("");
      await apiRequest("POST", "/api/auth/resend-verification");
    },
    onSuccess: () => { setCooldown(60); setNotice("Verification email sent. Check your inbox and spam folder."); },
    onError: (err) => {
      const result = responseError(err);
      if (result.secondsLeft) setCooldown(result.secondsLeft);
      setError(result.message);
    },
  });
  const correctEmail = useMutation({
    mutationFn: async () => {
      setError(""); setNotice("");
      const parsed = accountEmailSchema.safeParse(nextEmail);
      if (!parsed.success) throw new Error('400: {"message":"Please enter a valid email address"}');
      return (await apiRequest("POST", "/api/auth/change-unverified-email", { email: parsed.data, password })).json();
    },
    onSuccess: (data) => {
      setPassword(""); setEditing(false);
      queryClient.setQueryData(["/api/auth/me"], (user: any) => user ? { ...user, email: data.email } : user);
      setNotice(data.verificationEmailSent
        ? "Email updated. Check the new address for your verification link."
        : "Email updated, but we could not send the link. Please use Resend verification email to try again.");
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
    onError: (err) => { setPassword(""); setError(responseError(err).message); },
  });
  const logout = useMutation({
    mutationFn: () => apiRequest("POST", "/api/auth/logout"),
    onSuccess: () => {
      try { localStorage.removeItem("para_pets_just_registered"); } catch {}
      queryClient.removeQueries({ predicate: query => query.queryKey[0] !== "/api/auth/me" });
      queryClient.setQueryData(["/api/auth/me"], null);
      setLocation("/");
    },
    onError: () => setError("Could not sign out. Please try again."),
  });
  const busy = resend.isPending || correctEmail.isPending || logout.isPending;
  const button = "w-full rounded-lg border border-[#806027] bg-[#30220f] px-4 py-3 text-sm text-[#ffd700] disabled:opacity-50";
  const input = "w-full rounded-lg border border-[#806027] bg-[#170f09] px-3 py-3 text-base text-[#f0c040]";
  return (
    <div data-testid="screen-email-gate" className="absolute inset-0 overflow-y-auto px-6 py-8" style={{ zIndex: 9995, background: "linear-gradient(180deg,#0d0805,#150d06)" }}>
      <div className="mx-auto flex min-h-full max-w-sm flex-col justify-center gap-5 text-center text-[#c8a870]">
        <div aria-hidden="true" className="text-5xl">📬</div>
        <h1 className="font-fantasy text-2xl text-[#f0c040]">Verify Your Email</h1>
        <p className="text-sm leading-relaxed">Verify your email address: <strong className="break-all text-[#f0c040]">{email}</strong>. Open the link in your inbox, or request it below. Check your spam folder too. This screen will update when verification is complete.</p>
        {notice && <p role="status" className="text-sm text-[#b9dfad]">{notice}</p>}
        {error && <p role="alert" className="text-sm text-[#ffb0a5]">{error}</p>}
        <button data-testid="button-resend-verification" className={button} disabled={busy || cooldown > 0} onClick={() => resend.mutate()}>
          {resend.isPending ? "Sending…" : cooldown > 0 ? `Resend email (${cooldown}s)` : "Resend verification email"}
        </button>
        {editing ? (
          <form className="space-y-3 text-left" onSubmit={event => { event.preventDefault(); if (!busy) correctEmail.mutate(); }}>
            <label className="block text-sm">Correct email address
              <input className={input} type="email" autoComplete="email" autoCapitalize="none" required value={nextEmail} onChange={event => setNextEmail(event.target.value)} disabled={busy} />
            </label>
            <label className="block text-sm">Current password
              <input className={input} type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} disabled={busy} />
            </label>
            <button className={button} disabled={busy} type="submit">{correctEmail.isPending ? "Updating…" : "Update email and send link"}</button>
            <button className="w-full py-2 text-sm underline" type="button" disabled={busy} onClick={() => { setEditing(false); setPassword(""); }}>Cancel</button>
          </form>
        ) : <button className="text-sm underline" disabled={busy} onClick={() => { setEditing(true); setError(""); setNotice(""); }}>Wrong email address?</button>}
        <button className="py-2 text-sm underline" disabled={logout.isPending || correctEmail.isPending} onClick={() => logout.mutate()}>{logout.isPending ? "Signing out…" : "Sign out"}</button>
      </div>
    </div>
  );
}
