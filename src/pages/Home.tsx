/**
 * Session Verification Landing Page
 * - Shows "Verifying Your Session" with spinner for 5 seconds
 * - Then shows "Verification Complete" for 2 seconds
 * - Then auto-redirects to destination URL
 */

import { useEffect, useState } from "react";

// ====================================
// CHANGE THIS URL TO YOUR AFFILIATE OFFER
// ====================================
const REDIRECT_URL = "https://www.google.com";

function SpinnerRing() {
  return (
    <div className="relative w-[72px] h-[72px] sm:w-[80px] sm:h-[80px]">
      {/* Background track ring */}
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 80 80"
        fill="none"
      >
        <circle
          cx="40"
          cy="40"
          r="34"
          stroke="currentColor"
          strokeWidth="5"
          className="text-black/[0.06]"
        />
      </svg>

      {/* Spinning gradient arc */}
      <svg
        className="absolute inset-0 w-full h-full animate-spin-smooth"
        viewBox="0 0 80 80"
        fill="none"
      >
        <defs>
          <linearGradient id="spinner-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#007AFF" stopOpacity="1" />
            <stop offset="100%" stopColor="#007AFF" stopOpacity="0.1" />
          </linearGradient>
        </defs>
        <circle
          cx="40"
          cy="40"
          r="34"
          stroke="url(#spinner-gradient)"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray="160 54"
        />
      </svg>

      {/* Center dot indicator */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-2 h-2 rounded-full bg-[#007AFF] animate-pulse-soft" />
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <div className="relative w-[72px] h-[72px] sm:w-[80px] sm:h-[80px] flex items-center justify-center">
      <svg
        width="56"
        height="56"
        viewBox="0 0 56 56"
        fill="none"
        className="text-[#34C759]"
      >
        <circle cx="28" cy="28" r="26" fill="currentColor" fillOpacity="0.1" stroke="currentColor" strokeWidth="2.5" />
        <path d="M18 28L25 35L38 21" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function ShieldIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      className="text-[#007AFF]"
    >
      <path
        d="M12 2L4 6V11C4 16.25 7.4 21.15 12 22.5C16.6 21.15 20 16.25 20 11V6L12 2Z"
        fill="currentColor"
        fillOpacity="0.12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M9 12L11 14L15 10"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    const mountTimer = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(mountTimer);
  }, []);

  // After 5 seconds, show "Verification Complete"
  useEffect(() => {
    const verifyTimer = setTimeout(() => {
      setVerified(true);
    }, 5000);

    return () => clearTimeout(verifyTimer);
  }, []);

  // After verification complete shows, redirect 2 seconds later
  useEffect(() => {
    if (!verified) return;

    const redirectTimer = setTimeout(() => {
      window.location.href = REDIRECT_URL;
    }, 2000);

    return () => clearTimeout(redirectTimer);
  }, [verified]);

  return (
    <div className="h-full w-full flex items-center justify-center bg-[#F2F2F7] relative overflow-hidden select-none">
      {/* Subtle background pattern */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, #000 0.5px, transparent 0.5px)`,
          backgroundSize: "24px 24px",
        }}
      />

      {/* Main verification card */}
      <div
        className={`
          relative z-10 flex flex-col items-center
          w-[calc(100%-48px)] max-w-[340px]
          px-8 py-10 sm:px-10 sm:py-12
          rounded-2xl
          bg-white/80
          backdrop-blur-xl
          shadow-[0_2px_40px_rgba(0,0,0,0.06),0_0_1px_rgba(0,0,0,0.08)]
          transition-all duration-600
          ${mounted ? "animate-fade-in-up" : "opacity-0"}
        `}
        style={{
          WebkitBackdropFilter: "blur(24px)",
        }}
      >
        {/* Spinner or Check */}
        <div className="mb-7">
          {verified ? <CheckIcon /> : <SpinnerRing />}
        </div>

        {/* Main text */}
        <h1
          className="text-[17px] sm:text-[18px] font-semibold text-[#1C1C1E] text-center tracking-[-0.01em] leading-snug mb-2"
          style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}
        >
          {verified ? "Verification Complete" : "Verifying Your Session"}
        </h1>

        {/* Subtext */}
        <p className="text-[13px] sm:text-[14px] text-[#8E8E93] text-center leading-relaxed">
          {verified ? "Redirecting you now..." : "Please wait while we verify your session"}
        </p>

        {/* Status indicator */}
        <div className="mt-5 flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full ${verified ? "bg-[#34C759]" : "bg-[#34C759] animate-pulse-soft"}`} />
          <span className="text-[11px] text-[#8E8E93] font-medium tracking-wide uppercase">
            Secure Connection
          </span>
        </div>
      </div>

      {/* Bottom safe area text */}
      <div className="absolute bottom-0 left-0 right-0 pb-[max(16px,env(safe-area-inset-bottom))] flex justify-center">
        <p className="text-[10px] text-[#C7C7CC] font-medium tracking-wider uppercase">
          Session Verification
        </p>
      </div>
    </div>
  );
}
