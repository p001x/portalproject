import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Lock, Mail, Map, ArrowRight, User } from "lucide-react";

export function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { login, register, forgotPassword, isLoading } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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
    <div className="min-h-screen flex w-full bg-background">
      
      {/* Left Side: Branding / Showcase */}
      <div className="hidden lg:flex flex-col flex-1 bg-slate-900 relative overflow-hidden justify-between p-12">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1524661135-423995f22d0b?q=80&w=2074&auto=format&fit=crop')] bg-cover bg-center opacity-20 mix-blend-overlay"></div>
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900/90 via-slate-900/50 to-teal-900/80"></div>
        
        <div className="relative z-10 flex items-center gap-3">
          <img src="/logo.png" alt="SPETRO Logo" className="h-10 w-auto" />
          <div>
            <div className="font-bold text-xl text-white tracking-wide">SPETRO</div>
            <div className="text-xs font-medium tracking-widest text-teal-400">GEOPORTAL ANALYSIS</div>
          </div>
        </div>

        <div className="relative z-10 max-w-lg mt-auto pb-12">
          <h1 className="text-4xl font-bold text-white mb-6 leading-tight">
            Advanced Environmental Intelligence
          </h1>
          <p className="text-lg text-slate-300 mb-8 leading-relaxed">
            Harness the power of Google Earth Engine to monitor droughts, track floods, and analyze vegetation health with unprecedented accuracy.
          </p>
          <div className="flex gap-4">
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Map className="w-5 h-5 text-teal-400" />
              15+ Analysis Modules
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Lock className="w-5 h-5 text-teal-400" />
              Secure Data Vault
            </div>
          </div>
        </div>
      </div>

      {/* Right Side: Auth Form */}
      <div className="flex-1 flex flex-col justify-center px-8 sm:px-16 lg:px-24">
        <div className="w-full max-w-sm mx-auto space-y-8">
          
          <div className="text-center lg:text-left">
            <h2 className="text-3xl font-bold tracking-tight text-foreground">
              {isForgotPassword ? "Reset Password" : isLogin ? "Welcome back" : "Create an account"}
            </h2>
            <p className="text-muted-foreground mt-2 text-sm">
              {isForgotPassword
                ? "Enter your email to receive a password reset link."
                : isLogin 
                ? "Enter your credentials to access the geoportal." 
                : "Sign up to start saving and managing your spatial data."}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {!isLogin && !isForgotPassword && (
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
                  <Input
                    id="name"
                    type="text"
                    placeholder="John Doe"
                    className="pl-9"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email address</Label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="name@example.com"
                  className="pl-9"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            {!isForgotPassword && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  {isLogin && (
                    <button type="button" onClick={() => {setIsForgotPassword(true); setError(null); setSuccess(null);}} className="text-xs font-medium text-primary hover:underline">
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    className="pl-9"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                {!isLogin && (
                  <p className="text-xs text-muted-foreground">
                    Password must be 8-15 characters long and contain uppercase, lowercase, and numbers.
                  </p>
                )}
              </div>
            )}

            {error && (
              <div className="text-sm font-medium text-destructive bg-destructive/10 p-3 rounded-md">
                {error}
              </div>
            )}
            
            {success && (
              <div className="text-sm font-medium text-green-600 bg-green-50 p-3 rounded-md">
                {success}
              </div>
            )}

            <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : isForgotPassword ? (
                "Send Reset Link"
              ) : (
                <>{isLogin ? "Sign In" : "Create Account"} <ArrowRight className="w-4 h-4 ml-2" /></>
              )}
            </Button>
          </form>

          <div className="text-center text-sm">
            {isForgotPassword ? (
              <button
                type="button"
                onClick={() => {
                  setIsForgotPassword(false);
                  setIsLogin(true);
                  setError(null);
                  setSuccess(null);
                }}
                className="font-semibold text-primary hover:underline"
              >
                Back to Sign in
              </button>
            ) : (
              <>
                <span className="text-muted-foreground">
                  {isLogin ? "Don't have an account? " : "Already have an account? "}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setIsLogin(!isLogin);
                    setError(null);
                  }}
                  className="font-semibold text-primary hover:underline"
                >
                  {isLogin ? "Sign up" : "Sign in"}
                </button>
              </>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
