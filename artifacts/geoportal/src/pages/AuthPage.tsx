import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Loader2, Lock, Mail, User, X } from "lucide-react";
import { Link, useLocation } from "wouter";

export function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { login, register, forgotPassword, isLoading } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [, setLocation] = useLocation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    
    if (isForgotPassword) {
      if (!email) {
        setError("Please enter your email address.");
        return;
      }
      try {
        await forgotPassword(email);
        setSuccess("If the email is registered, a reset link has been sent (check backend logs).");
      } catch (err: any) {
        setError(err.message || "Failed to send reset link.");
      }
      return;
    }

    if (!email || !password || (!isLogin && !name)) {
      setError("Please fill in all fields.");
      return;
    }

    try {
      if (isLogin) {
        await login(email, password);
      } else {
        await register(name, email, password);
      }
    } catch (err: any) {
      setError(err.message || "Authentication failed. Please try again.");
    }
  };

  return (
    <div 
      className="min-h-screen flex flex-col w-full text-white overflow-x-hidden font-sans relative"
      style={{
        backgroundImage: "url('https://images.unsplash.com/photo-1507204122176-35cb8a6aeb20?auto=format&fit=crop&w=2000&q=80')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat"
      }}
    >
      {/* Dark overlay to ensure text readability */}
      <div className="absolute inset-0 bg-black/30 z-0 pointer-events-none" />

      {/* Navigation Bar */}
      <nav className="relative z-10 flex justify-between items-center py-8 px-8 sm:px-16 w-full">
        <Link href="/">
          <div className="text-[28px] font-bold cursor-pointer tracking-wide drop-shadow-md">Logo</div>
        </Link>
        <div className="hidden md:flex gap-10 items-center">
          <Link href="/" className="text-white text-[15px] font-medium opacity-90 hover:opacity-100 hover:drop-shadow-[0_0_10px_rgba(255,255,255,0.8)] transition-all drop-shadow-md">Home</Link>
          <Link href="/about" className="text-white text-[15px] font-medium opacity-90 hover:opacity-100 hover:drop-shadow-[0_0_10px_rgba(255,255,255,0.8)] transition-all drop-shadow-md">About</Link>
          <Link href="/services" className="text-white text-[15px] font-medium opacity-90 hover:opacity-100 hover:drop-shadow-[0_0_10px_rgba(255,255,255,0.8)] transition-all drop-shadow-md">Services</Link>
          <Link href="/contact" className="text-white text-[15px] font-medium opacity-90 hover:opacity-100 hover:drop-shadow-[0_0_10px_rgba(255,255,255,0.8)] transition-all drop-shadow-md">Contact</Link>
          <button onClick={() => { setIsLogin(true); setIsForgotPassword(false); }} className="bg-transparent border border-white/50 text-white py-2 px-8 rounded-md cursor-pointer text-[15px] font-medium transition-all hover:bg-white/20 hover:border-white/90 hover:shadow-[0_0_15px_rgba(255,255,255,0.2)] backdrop-blur-sm">Login</button>
        </div>
      </nav>

      {/* Main Container */}
      <div className="relative z-10 flex-1 flex justify-center items-center p-5 pb-20">
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl w-full max-w-[420px] px-10 py-10 relative shadow-[0_8px_32px_0_rgba(0,0,0,0.4)]">
          
          <button onClick={() => setLocation("/")} className="absolute -top-3 -right-3 bg-[#111] border border-white/20 text-white w-8 h-8 rounded-full flex items-center justify-center cursor-pointer font-bold text-lg transition-all hover:bg-[#333] hover:scale-105 shadow-lg" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
          
          <h2 className="text-center text-[32px] font-semibold mb-8 tracking-wide">
            {isForgotPassword ? "Reset Password" : isLogin ? "Login" : "Register"}
          </h2>
          
          <form onSubmit={handleSubmit}>
            {!isLogin && !isForgotPassword && (
              <div className="relative mb-6">
                <label htmlFor="name" className="block text-[13px] mb-2 text-white/70 font-medium">Full Name</label>
                <input
                  id="name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-transparent border-0 border-b border-white/20 text-white text-base py-2.5 pl-1 pr-8 outline-none transition-colors focus:border-white/80"
                />
                <User className="absolute right-1 bottom-3 w-[18px] h-[18px] opacity-60 pointer-events-none" />
              </div>
            )}

            <div className="relative mb-6">
              <label htmlFor="email" className="block text-[13px] mb-2 text-white/70 font-medium">Email</label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-transparent border-0 border-b border-white/20 text-white text-base py-2.5 pl-1 pr-8 outline-none transition-colors focus:border-white/80"
              />
              <Mail className="absolute right-1 bottom-3 w-[18px] h-[18px] opacity-60 pointer-events-none" />
            </div>

            {!isForgotPassword && (
              <div className="relative mb-6">
                <label htmlFor="password" className="block text-[13px] mb-2 text-white/70 font-medium">Password</label>
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-transparent border-0 border-b border-white/20 text-white text-base py-2.5 pl-1 pr-8 outline-none transition-colors focus:border-white/80"
                />
                <Lock className="absolute right-1 bottom-3 w-[18px] h-[18px] opacity-60 pointer-events-none" />
              </div>
            )}

            {!isForgotPassword && (
              <div className="flex justify-between items-center text-[13px] mb-8">
                <label className="flex items-center gap-2 text-white/70 cursor-pointer">
                  <input type="checkbox" className="cursor-pointer accent-white/80 w-3.5 h-3.5" />
                  Remember me
                </label>
                <button type="button" onClick={() => { setIsForgotPassword(true); setError(null); setSuccess(null); }} className="text-white/70 no-underline transition-colors hover:text-white">
                  Forget Password?
                </button>
              </div>
            )}

            {error && (
              <div className="text-sm font-medium text-red-400 bg-red-400/10 p-3 rounded-md mb-6 border border-red-400/20">
                {error}
              </div>
            )}
            
            {success && (
              <div className="text-sm font-medium text-emerald-400 bg-emerald-400/10 p-3 rounded-md mb-6 border border-emerald-400/20">
                {success}
              </div>
            )}

            <button type="submit" disabled={isLoading} className="w-full bg-[#28282d]/80 border border-white/5 text-white p-3.5 rounded-lg text-base font-medium cursor-pointer transition-all tracking-wide mb-6 hover:bg-[#3c3c41]/90 hover:border-white/20 hover:shadow-[0_4px_15px_rgba(0,0,0,0.3)] disabled:opacity-70 flex justify-center items-center">
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : isForgotPassword ? (
                "Send Reset Link"
              ) : isLogin ? (
                "Login"
              ) : (
                "Create Account"
              )}
            </button>

            <div className="text-center text-[14px] text-white/60">
              {isForgotPassword ? (
                <button
                  type="button"
                  onClick={() => {
                    setIsForgotPassword(false);
                    setIsLogin(true);
                    setError(null);
                    setSuccess(null);
                  }}
                  className="text-white/90 font-medium no-underline transition-colors hover:text-white hover:underline cursor-pointer"
                >
                  Back to Sign in
                </button>
              ) : isLogin ? (
                <>
                  Don't have an account?{" "}
                  <button type="button" onClick={() => { setIsLogin(false); setError(null); }} className="text-white/90 font-medium no-underline transition-colors hover:text-white hover:underline cursor-pointer">
                    Register
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{" "}
                  <button type="button" onClick={() => { setIsLogin(true); setError(null); }} className="text-white/90 font-medium no-underline transition-colors hover:text-white hover:underline cursor-pointer">
                    Login
                  </button>
                </>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
