import { useState, useEffect, useCallback } from "react";
import { api, setGeeAuth, getGeeToken, getGeeEmail, clearGeeAuth } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Shield,
  LogIn,
  LogOut,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Globe2,
  Mail,
  Lock,
} from "lucide-react";

interface GEEAuthGateProps {
  children: React.ReactNode;
}

declare global {
  interface Window {
    google?: any;
  }
}

export function GEEAuthGate({ children }: GEEAuthGateProps) {
  const [checking, setChecking] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [email, setEmail] = useState("");
  const [projectName, setProjectName] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginProjectName, setLoginProjectName] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [useDevFallback, setUseDevFallback] = useState(false);

  // Check existing session on mount
  const checkSession = useCallback(async () => {
    setChecking(true);
    try {
      const token = getGeeToken();
      if (!token) {
        setAuthenticated(false);
        setChecking(false);
        return;
      }
      const status = await api.geeAuth.status();
      if (status.authenticated && status.email) {
        setAuthenticated(true);
        setEmail(status.email);
        if (status.project_name) setProjectName(status.project_name);
      } else {
        // Token is stale — clear it
        clearGeeAuth();
        setAuthenticated(false);
      }
    } catch {
      clearGeeAuth();
      setAuthenticated(false);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  const initGoogleBtn = useCallback(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
    if (!clientId) return;
    if (!window.google?.accounts?.id) return;

    try {
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response: any) => {
          if (response.credential) {
            handleLogin(response.credential);
          }
        },
      });

      const btnContainer = document.getElementById("google-signin-btn");
      if (btnContainer) {
        btnContainer.innerHTML = "";
        window.google.accounts.id.renderButton(btnContainer, {
          theme: "filled_blue",
          size: "large",
          width: 320,
          text: "continue_with",
          shape: "rectangular",
        });
      }
    } catch (e) {
      console.error("Error initializing Google Sign-In button:", e);
    }
  }, [loginProjectName]);

  useEffect(() => {
    if (!authenticated && !checking) {
      const scriptId = "google-gsi-script";
      let script = document.getElementById(scriptId) as HTMLScriptElement;
      if (!script) {
        script = document.createElement("script");
        script.id = scriptId;
        script.src = "https://accounts.google.com/gsi/client";
        script.async = true;
        script.defer = true;
        script.onload = () => setTimeout(initGoogleBtn, 100);
        document.head.appendChild(script);
      } else {
        setTimeout(initGoogleBtn, 100);
      }
    }
  }, [authenticated, checking, initGoogleBtn]);

  const handleLogin = async (credential?: string) => {
    if (!credential) {
      setLoginError("No credential received from Google.");
      return;
    }
    setLoginError("");
    setLoggingIn(true);
    try {
      const result = await api.geeAuth.login(credential, loginProjectName.trim() || undefined);
      if (result.ok && result.token) {
        setGeeAuth(result.token, result.email, result.project_name);
        setAuthenticated(true);
        setEmail(result.email);
        if (result.project_name) setProjectName(result.project_name);
        setLoginProjectName("");
      } else {
        setLoginError("Authentication failed. Please try again.");
      }
    } catch (err: any) {
      setLoginError(err.message || "Authentication failed.");
    } finally {
      setLoggingIn(false);
    }
  };

  const handleDevLogin = async () => {
    const trimmed = loginEmail.trim();
    if (!trimmed) {
      setLoginError("Please enter your email address.");
      return;
    }
    setLoginError("");
    setLoggingIn(true);
    try {
      // In dev fallback mode, we pass email as token credential
      const result = await api.geeAuth.login(trimmed, loginProjectName.trim() || undefined);
      if (result.ok && result.token) {
        setGeeAuth(result.token, result.email, result.project_name);
        setAuthenticated(true);
        setEmail(result.email);
        if (result.project_name) setProjectName(result.project_name);
        setLoginEmail("");
        setLoginProjectName("");
      } else {
        setLoginError("Authentication failed. Please try again.");
      }
    } catch (err: any) {
      setLoginError(err.message || "Authentication failed.");
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      if (window.google?.accounts?.id) {
        window.google.accounts.id.disableAutoSelect();
      }
    } catch {
      // ignore
    }
    await api.geeAuth.logout();
    setAuthenticated(false);
    setEmail("");
    setProjectName("");
  };

  // Loading state
  if (checking) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Verifying GEE authentication…</p>
        </div>
      </div>
    );
  }

  // Not authenticated — show login gate
  if (!authenticated) {
    return (
      <div className="h-full flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/30">
        <div className="w-full max-w-md mx-4">
          {/* Auth Card */}
          <div className="bg-card border rounded-2xl shadow-xl overflow-hidden">
            {/* Header */}
            <div
              className="px-8 py-8 text-center"
              style={{
                background: "linear-gradient(135deg, rgba(0,212,170,0.12) 0%, rgba(0,122,255,0.12) 100%)",
              }}
            >
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg"
                style={{
                  background: "linear-gradient(135deg, #00d4aa 0%, #007aff 100%)",
                }}
              >
                <Shield className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-xl font-bold text-foreground mb-1">
                GEE Authentication Required
              </h2>
              <p className="text-sm text-muted-foreground">
                Sign in with your Google Earth Engine account to access Sample Digitization
              </p>
            </div>

            {/* Login Form */}
            <div className="px-8 py-6 space-y-5">
              <div className="space-y-2">
                <Label
                  htmlFor="gee-project"
                  className="text-sm font-medium flex items-center gap-2"
                >
                  <Globe2 className="w-4 h-4 text-muted-foreground" />
                  GEE Project Name (Optional)
                </Label>
                <Input
                  id="gee-project"
                  type="text"
                  placeholder="e.g. ee-petersonyang87"
                  value={loginProjectName}
                  onChange={(e) => {
                    setLoginProjectName(e.target.value);
                    setLoginError("");
                  }}
                  className="h-11 text-sm"
                />
              </div>

              {loginError && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                  <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                  <p className="text-xs text-destructive">{loginError}</p>
                </div>
              )}

              <div className="flex flex-col items-center justify-center pt-2 min-h-[44px]">
                <div id="google-signin-btn" />
                {(!import.meta.env.VITE_GOOGLE_CLIENT_ID || useDevFallback) && (
                  <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs space-y-3 w-full">
                    {!import.meta.env.VITE_GOOGLE_CLIENT_ID && (
                      <p className="font-semibold text-center">
                        Google OAuth Client ID not set in <code>.env</code>
                      </p>
                    )}
                    
                    <div className="pt-1 border-t border-amber-500/20 space-y-3">
                      <p className="text-[11px] text-muted-foreground text-center font-medium">
                        Development / Offline Access Mode:
                      </p>
                      <div className="space-y-1.5">
                        <Label htmlFor="dev-email" className="text-[11px] text-foreground">
                          Email Address
                        </Label>
                        <Input
                          id="dev-email"
                          type="email"
                          placeholder="user@example.com"
                          value={loginEmail}
                          onChange={(e) => {
                            setLoginEmail(e.target.value);
                            setLoginError("");
                          }}
                          onKeyDown={(e) => e.key === "Enter" && handleDevLogin()}
                          className="h-9 text-xs bg-background"
                        />
                      </div>
                      <Button
                        onClick={handleDevLogin}
                        disabled={loggingIn}
                        variant="outline"
                        className="w-full h-9 text-xs font-medium gap-1.5 border-amber-500/40 hover:bg-amber-500/10"
                      >
                        {loggingIn ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <LogIn className="w-3.5 h-3.5" />
                        )}
                        Sign In (Dev Mode)
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-2 border-t">
                <div className="flex items-start gap-2.5 text-xs text-muted-foreground">
                  <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <p>
                    Only users with a valid Google Earth Engine account can access the
                    Sample Digitization module. Your email is used for identity
                    verification and tracking sample authorship.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Footer note */}
          <p className="text-center text-[11px] text-muted-foreground/60 mt-4">
            Analysis modules (NDVI, LST, Flood, etc.) do not require individual authentication.
          </p>
        </div>
      </div>
    );
  }

  // Authenticated — render children with auth status bar
  return (
    <div className="h-full flex flex-col">
      {/* Auth status bar */}
      <div className="shrink-0 px-4 py-1.5 bg-emerald-500/10 border-b border-emerald-500/20 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
            GEE Authenticated
          </span>
          <Badge
            variant="outline"
            className="text-[10px] px-1.5 py-0 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 font-mono"
          >
            {email}
          </Badge>
          {projectName && (
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 font-mono ml-2"
            >
              Project: {projectName}
            </Badge>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogout}
          className="h-6 px-2 text-[11px] text-muted-foreground hover:text-destructive gap-1"
        >
          <LogOut className="w-3 h-3" />
          Sign Out
        </Button>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
