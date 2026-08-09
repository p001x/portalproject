import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Lock, ArrowRight } from "lucide-react";
import { useLocation } from "wouter";

export function ResetPasswordPage() {
  const [token, setToken] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const { resetPassword, isLoading } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [, setLocation] = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("token");
    if (t) {
      setToken(t);
    } else {
      setError("No reset token found in URL.");
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    
    if (!token) {
      setError("Missing reset token.");
      return;
    }
    
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      await resetPassword(token, newPassword);
      setSuccess("Password has been reset successfully. Redirecting to login...");
      setTimeout(() => {
        setLocation("/auth");
      }, 3000);
    } catch (err: any) {
      setError(err.message || "Failed to reset password.");
    }
  };

  return (
    <div className="min-h-screen flex w-full bg-background items-center justify-center">
      <div className="w-full max-w-sm px-8">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold tracking-tight text-foreground">
            Set New Password
          </h2>
          <p className="text-muted-foreground mt-2 text-sm">
            Enter your new password below.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="password">New Password</Label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                className="pl-9"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Must be 8-15 characters long and contain uppercase, lowercase, and numbers.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm_password">Confirm Password</Label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
              <Input
                id="confirm_password"
                type="password"
                placeholder="••••••••"
                className="pl-9"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
          </div>

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

          <Button type="submit" className="w-full" size="lg" disabled={isLoading || !token}>
            {isLoading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <>Reset Password <ArrowRight className="w-4 h-4 ml-2" /></>
            )}
          </Button>
        </form>
        
        <div className="mt-6 text-center text-sm">
          <button
            type="button"
            onClick={() => setLocation("/auth")}
            className="font-semibold text-primary hover:underline"
          >
            Back to Sign in
          </button>
        </div>
      </div>
    </div>
  );
}
