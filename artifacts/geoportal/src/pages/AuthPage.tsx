import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { 
  Loader2, 
  Mail, 
  User, 
  ArrowRight, 
  Lock, 
  Eye, 
  EyeOff, 
  ArrowLeft, 
  X, 
  CheckCircle2, 
  AlertCircle,
  KeyRound,
  ShieldCheck
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { SiteBrand, SiteLogoOnly } from "@/components/SiteBrand";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";

export function AuthPage() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");
  const [mode, setMode] = useState<"login" | "register" | "forgot">("login");
  const [step, setStep] = useState<"details" | "otp">("details");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  
  const { login, register, requestOtp, forgotPassword, isLoading } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [isResending, setIsResending] = useState(false);
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleResendOtp = async () => {
    if (!email || resendCooldown > 0 || isResending) return;
    setIsResending(true);
    setError(null);
    setSuccess(null);
    try {
      await requestOtp(email);
      setSuccess(`A new 6-digit verification code has been sent to ${email}.`);
      setResendCooldown(30);
    } catch (err: any) {
      setError(err.message || "Failed to resend verification code. Please try again.");
    } finally {
      setIsResending(false);
    }
  };



  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    
    if (step === "otp") {
      if (code.length < 6) {
        setError("Please enter the 6-digit verification code.");
        return;
      }
      try {
        await register(name, email, password, code);
      } catch (err: any) {
        setError(err.message || "Invalid or expired verification code.");
      }
      return;
    }

    if (!email || !email.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }

    if (!password && mode !== "forgot") {
      setError("Please enter your password.");
      return;
    }

    try {
      if (mode === "register") {
        if (!name.trim()) {
          setError("Please enter your full name.");
          return;
        }
        if (password.length < 8) {
          setError("Password must be at least 8 characters long.");
          return;
        }
        if (password !== confirmPassword) {
          setError("Passwords do not match.");
          return;
        }
        await requestOtp(email);
        setSuccess(`A 6-digit verification code has been sent to ${email}. Check your inbox or spam folder.`);
        setResendCooldown(30);
        setStep("otp");
      } else if (mode === "forgot") {
        const forgotRes = await forgotPassword(email);
        setSuccess(forgotRes?.message || "Password reset instructions have been sent to your email. Check your inbox or spam folder.");
      } else {
        await login(email, password);
      }
    } catch (err: any) {
      setError(err.message || "Authentication failed. Please check your credentials.");
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col relative overflow-hidden selection:bg-emerald-500/20 selection:text-emerald-500">
      
      {/* Dynamic Background Aesthetic matching SPETRO Geoportal */}
      <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-500/10 via-background to-background pointer-events-none" />
      <div className="absolute -top-40 -right-40 w-96 h-96 bg-emerald-500/10 dark:bg-emerald-500/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-teal-500/10 dark:bg-teal-500/15 rounded-full blur-3xl pointer-events-none" />
      
      {/* Subtle Coordinate / Grid Lines */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />

      {/* Unified Global Header */}
      <header className="relative z-20 px-6 py-4 flex justify-between items-center border-b border-border/40 bg-background/60 backdrop-blur-xl">
        <div className="flex items-center gap-6">
          <SiteBrand size="normal" hideSubtitleOnMobile />
        </div>

        {/* Navigation Links */}
        <nav className="hidden md:flex items-center gap-7 lg:gap-8">
          <Link href="/">
            <span className="text-sm md:text-base font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer py-1">Home</span>
          </Link>
          <Link href="/platform">
            <span className="text-sm md:text-base font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer py-1">Platform</span>
          </Link>
          <Link href="/about">
            <span className="text-sm md:text-base font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer py-1">About</span>
          </Link>
          <Link href="/services">
            <span className="text-sm md:text-base font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer py-1">Services</span>
          </Link>
          <Link href="/contact">
            <span className="text-sm md:text-base font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer py-1">Contact</span>
          </Link>
        </nav>

        {/* Header Right Actions */}
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link href="/">
            <Button variant="ghost" size="sm" className="gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Home
            </Button>
          </Link>
        </div>
      </header>

      {/* Main Centered Content */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center p-4 sm:p-6 py-10">
        
        {/* Glassmorphic Auth Card */}
        <div className="relative w-full max-w-[450px] mx-auto bg-card/85 dark:bg-card/65 backdrop-blur-2xl border border-border/80 dark:border-white/10 rounded-2xl shadow-2xl p-7 sm:p-9 transition-all">
          
          {/* Top Emerald Glow Accent Line */}
          <div className="absolute top-0 left-10 right-10 h-[2px] bg-gradient-to-r from-transparent via-emerald-500 to-transparent" />

          {/* Close button in top corner */}
          <Link href="/">
            <button 
              type="button" 
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground hover:bg-muted/60 w-8 h-8 rounded-full flex items-center justify-center transition-colors cursor-pointer"
              aria-label="Back to home"
              title="Close and return to Home"
            >
              <X className="w-4 h-4" />
            </button>
          </Link>

          {/* Card Header & Brand Badge */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium tracking-wide uppercase bg-muted/60 text-muted-foreground border border-border/50 mb-3">
              SPETRO Account
            </div>
            
            <h2 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
              {step === "otp"
                ? "Verify Your Email"
                : mode === "login"
                ? "Welcome Back"
                : mode === "forgot"
                ? "Reset Password"
                : "Create Account"}
            </h2>
            
            <p className="text-xs sm:text-sm text-muted-foreground mt-1.5 leading-relaxed">
              {step === "otp"
                ? `Enter the 6-digit code sent to ${email}`
                : mode === "login"
                ? "Sign in to access satellite analysis and spatial modules"
                : mode === "forgot"
                ? "Enter your registered email to receive password recovery instructions"
                : "Join SPETRO to explore planetary datasets and remote sensing models"}
            </p>
          </div>

          {/* Mode Switcher Tabs (Only when in Login/Register modes) */}
          {step !== "otp" && mode !== "forgot" && (
            <div className="grid grid-cols-2 p-1 bg-muted/60 dark:bg-muted/40 rounded-xl mb-6 border border-border/50">
              <button
                type="button"
                onClick={() => { setMode("login"); setError(null); setSuccess(null); }}
                className={`py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  mode === "login"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => { setMode("register"); setError(null); setSuccess(null); }}
                className={`py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  mode === "register"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Register
              </button>
            </div>
          )}

          {/* Feedback Alerts */}
          {error && (
            <div className="text-xs font-medium text-destructive bg-destructive/10 border border-destructive/20 p-3 rounded-xl mb-5 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="leading-snug">{error}</span>
            </div>
          )}

          {success && (
            <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-xl mb-5 flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="leading-snug">{success}</span>
            </div>
          )}

          {/* Authentication Form */}
          <form onSubmit={handleSubmit} className="flex flex-col space-y-4">
            
            {step === "otp" ? (
              <div className="flex flex-col items-center justify-center space-y-4 my-2">
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500">
                  <KeyRound className="w-6 h-6" />
                </div>
                
                <div className="text-center space-y-0.5">
                  <p className="text-xs text-muted-foreground">
                    We sent a 6-digit verification code to
                  </p>
                  <p className="text-xs font-semibold text-foreground">
                    {email}
                  </p>
                </div>

                <div className="w-full max-w-[280px]">
                  <label htmlFor="code" className="block text-xs font-semibold text-center text-muted-foreground mb-2">
                    6-Digit Verification Code
                  </label>
                  <input
                    id="code"
                    type="text"
                    required
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ""))}
                    placeholder="••••••"
                    autoFocus
                    className="w-full bg-muted/40 dark:bg-slate-950/40 border border-border focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 text-foreground text-2xl tracking-[0.35em] font-mono font-bold text-center py-3 rounded-xl outline-none transition-all"
                  />
                </div>

                {/* Resend Code Option & Change Email */}
                <div className="flex flex-col items-center gap-2 pt-1 text-xs">
                  <button
                    type="button"
                    disabled={resendCooldown > 0 || isResending}
                    onClick={handleResendOtp}
                    className="font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 disabled:opacity-50 transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    {isResending ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Sending new code...</span>
                      </>
                    ) : resendCooldown > 0 ? (
                      <span>Resend code in {resendCooldown}s</span>
                    ) : (
                      <span>Didn't receive code? Resend Code</span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setStep("details");
                      setCode("");
                      setError(null);
                      setSuccess(null);
                    }}
                    className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  >
                    Use a different email
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Full Name (Register Only) */}
                {mode === "register" && (
                  <div className="space-y-1.5">
                    <label htmlFor="name" className="block text-xs font-semibold text-foreground">
                      Full Name
                    </label>
                    <div className="relative flex items-center bg-muted/40 dark:bg-slate-950/40 border border-border/80 dark:border-white/10 rounded-xl px-3.5 py-2.5 transition-all focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20">
                      <User className="w-4 h-4 text-muted-foreground shrink-0" />
                      <input
                        id="name"
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. John Doe"
                        className="w-full bg-transparent border-0 text-foreground text-sm font-medium pl-3 pr-1 outline-none placeholder:text-muted-foreground/60"
                      />
                    </div>
                  </div>
                )}

                {/* Email Address */}
                <div className="space-y-1.5">
                  <label htmlFor="email" className="block text-xs font-semibold text-foreground">
                    Email Address
                  </label>
                  <div className="relative flex items-center bg-muted/40 dark:bg-slate-950/40 border border-border/80 dark:border-white/10 rounded-xl px-3.5 py-2.5 transition-all focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20">
                    <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                    <input
                      id="email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@example.com"
                      className="w-full bg-transparent border-0 text-foreground text-sm font-medium pl-3 pr-1 outline-none placeholder:text-muted-foreground/60"
                    />
                  </div>
                </div>

                {/* Password Field */}
                {mode !== "forgot" && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label htmlFor="password" className="block text-xs font-semibold text-foreground">
                        Password
                      </label>
                      {mode === "login" && (
                        <button
                          type="button"
                          onClick={() => { setMode("forgot"); setError(null); setSuccess(null); }}
                          className="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 transition-colors"
                        >
                          Forgot Password?
                        </button>
                      )}
                    </div>
                    <div className="relative flex items-center bg-muted/40 dark:bg-slate-950/40 border border-border/80 dark:border-white/10 rounded-xl px-3.5 py-2.5 transition-all focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20">
                      <Lock className="w-4 h-4 text-muted-foreground shrink-0" />
                      <input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full bg-transparent border-0 text-foreground text-sm font-medium pl-3 pr-8 outline-none placeholder:text-muted-foreground/60"
                      />
                      <button 
                        type="button" 
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 text-muted-foreground hover:text-foreground transition-colors"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                )}

                {/* Confirm Password (Register Only) */}
                {mode === "register" && (
                  <div className="space-y-1.5">
                    <label htmlFor="confirmPassword" className="block text-xs font-semibold text-foreground">
                      Confirm Password
                    </label>
                    <div className="relative flex items-center bg-muted/40 dark:bg-slate-950/40 border border-border/80 dark:border-white/10 rounded-xl px-3.5 py-2.5 transition-all focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20">
                      <Lock className="w-4 h-4 text-muted-foreground shrink-0" />
                      <input
                        id="confirmPassword"
                        type={showConfirmPassword ? "text" : "password"}
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full bg-transparent border-0 text-foreground text-sm font-medium pl-3 pr-8 outline-none placeholder:text-muted-foreground/60"
                      />
                      <button 
                        type="button" 
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 text-muted-foreground hover:text-foreground transition-colors"
                        aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                      >
                        {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Remember Me Option (Login mode only) */}
            {mode === "login" && step !== "otp" && (
              <div className="flex items-center justify-between pt-1 pb-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded border-border text-emerald-600 focus:ring-emerald-500/20 accent-emerald-500 cursor-pointer"
                  />
                  <span className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
                    Remember this device
                  </span>
                </label>
              </div>
            )}
            
            {/* Primary Action Button */}
            <button 
              type="submit" 
              disabled={isLoading} 
              className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold py-3 px-4 rounded-xl shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-60 cursor-pointer mt-2"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <span>
                    {step === "otp"
                      ? "Verify Code & Sign In"
                      : mode === "login"
                      ? "Sign In"
                      : mode === "forgot"
                      ? "Send Recovery Link"
                      : "Create Account"}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Mode Switch Helper Links */}
          <div className="mt-5 text-center text-xs text-muted-foreground font-medium">
            {step === "otp" ? (
              <button 
                type="button" 
                onClick={() => { setStep("details"); setCode(""); setError(null); }} 
                className="text-emerald-600 dark:text-emerald-400 hover:underline transition-colors font-semibold cursor-pointer"
              >
                &larr; Back to edit details
              </button>
            ) : mode === "login" ? (
              <>
                Don't have an account yet?{" "}
                <button 
                  type="button" 
                  onClick={() => { setMode("register"); setError(null); setSuccess(null); }} 
                  className="text-emerald-600 dark:text-emerald-400 hover:underline transition-colors font-semibold cursor-pointer"
                >
                  Register here
                </button>
              </>
            ) : mode === "forgot" ? (
              <>
                Remember your password?{" "}
                <button 
                  type="button" 
                  onClick={() => { setMode("login"); setError(null); setSuccess(null); }} 
                  className="text-emerald-600 dark:text-emerald-400 hover:underline transition-colors font-semibold cursor-pointer"
                >
                  Back to Sign In
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button 
                  type="button" 
                  onClick={() => { setMode("login"); setError(null); setSuccess(null); }} 
                  className="text-emerald-600 dark:text-emerald-400 hover:underline transition-colors font-semibold cursor-pointer"
                >
                  Sign in
                </button>
              </>
            )}
          </div>
        </div>
      </main>

      {/* Global Unified Footer */}
      <footer className="relative z-10 bg-background/50 backdrop-blur-md border-t border-border/40 mt-auto w-full">
        <div className="max-w-7xl mx-auto px-6 py-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <SiteLogoOnly size="small" />
            <span className="text-xs font-medium text-muted-foreground ml-2">
              &copy; {new Date().getFullYear()} SPETRO Geoportal. All rights reserved.
            </span>
          </div>
          <div className="flex gap-6 text-xs text-muted-foreground font-medium">
            <Link href="/about" className="hover:text-primary transition-colors cursor-pointer">About Us</Link>
            <Link href="/services" className="hover:text-primary transition-colors cursor-pointer">Services</Link>
            <Link href="/contact" className="hover:text-primary transition-colors cursor-pointer">Contact</Link>
            <a href="#" className="hover:text-primary transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-primary transition-colors">Terms of Service</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
