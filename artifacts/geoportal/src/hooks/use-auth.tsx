import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useLocation } from "wouter";
import { BASE } from "@/lib/api";

export interface BlockedAccountInfo {
  isBlocked: boolean;
  reason: string;
  email: string;
  name?: string;
}

interface User {
  id: string;
  email: string;
  name?: string;
  role?: string;
  is_blocked?: boolean;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  blockedInfo: BlockedAccountInfo | null;
  setBlockedInfo: (info: BlockedAccountInfo | null) => void;
  requestOtp: (email: string) => Promise<any>;
  verifyOtp: (email: string, code: string, name?: string) => Promise<void>;
  loginWithGoogle: (token: string) => Promise<void>;
  login: (email: string, password?: string) => Promise<void>;
  register: (name: string, email: string, password?: string, code?: string) => Promise<void>;
  logout: () => void;
  forgotPassword: (email: string) => Promise<any>;
  resetPassword: (token: string, newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const getErrorMessage = (data: any, fallback: string) => {
  if (typeof data.detail === "string") return data.detail;
  if (data.detail && typeof data.detail === "object" && data.detail.message) return data.detail.message;
  if (Array.isArray(data.detail) && data.detail.length > 0) {
    const firstError = data.detail[0];
    const field = firstError.loc?.[1] ? `${firstError.loc[1]}: ` : "";
    return `${field}${firstError.msg || JSON.stringify(firstError)}`;
  }
  return fallback;
};

export const ADMIN_EMAILS = ["petersonyang8@gmail.com", "pierrendorimana16@gmail.com"];

const enrichUser = (user: User | null): User | null => {
  if (!user) return null;
  const emailClean = (user.email || "").toLowerCase().trim();
  if (user.role === "admin" || ADMIN_EMAILS.includes(emailClean)) {
    return { ...user, role: "admin" };
  }
  return user;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [blockedInfo, setBlockedInfo] = useState<BlockedAccountInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [, setLocation] = useLocation();

  const setAuthUser = (u: User | null) => {
    setUser(enrichUser(u));
  };

  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem("spetro_token");
      if (token) {
        try {
          const res = await fetch(`${BASE}/auth/me`, {
            headers: {
              "Authorization": `Bearer ${token}`
            }
          });
          if (res.ok) {
            const data = await res.json();
            setAuthUser(data.user);
          } else {
            if (res.status === 403) {
              const errData = await res.json().catch(() => null);
              const info = errData?.detail || errData;
              if (info?.is_blocked) {
                setBlockedInfo({
                  isBlocked: true,
                  reason: info.reason || "Your account has been suspended by administration.",
                  email: info.email || "",
                  name: info.name || ""
                });
              }
            }
            localStorage.removeItem("spetro_token");
          }
        } catch (e) {
          console.error("Failed to fetch user", e);
        }
      }
      setIsLoading(false);
    };
    initAuth();
  }, []);

  const safeJson = async (res: Response, fallback: string) => {
    try {
      return await res.json();
    } catch {
      if (res.status === 503 || res.status === 502 || res.status === 504) {
        return { detail: "Backend server is waking up from hibernation (Render free-tier cold start). Please wait ~15 seconds and try again." };
      }
      return { detail: `${fallback} (Server returned ${res.status}: ${res.statusText || "No response body"})` };
    }
  };

  const requestOtp = async (email: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`${BASE}/auth/otp/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      const data = await safeJson(res, "Failed to request OTP");
      if (!res.ok) {
        throw new Error(getErrorMessage(data, "Failed to request OTP"));
      }
      return data;
    } finally {
      setIsLoading(false);
    }
  };

  const verifyOtp = async (email: string, code: string, name?: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`${BASE}/auth/otp/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code, name })
      });
      const data = await safeJson(res, "Invalid or expired code");
      if (!res.ok) {
        const info = data?.detail || data;
        if (res.status === 403 && info?.is_blocked) {
          setBlockedInfo({
            isBlocked: true,
            reason: info.reason || "Your account has been suspended.",
            email: info.email || email,
            name: info.name || name || ""
          });
          throw new Error("Your account has been suspended.");
        }
        throw new Error(getErrorMessage(data, "Invalid or expired code"));
      }
      
      setAuthUser(data.user);
      localStorage.setItem("spetro_token", data.token);
      setLocation("/");
    } finally {
      setIsLoading(false);
    }
  };

  const loginWithGoogle = async (token: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`${BASE}/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token })
      });
      const data = await safeJson(res, "Google authentication failed");
      if (!res.ok) {
        const info = data?.detail || data;
        if (res.status === 403 && info?.is_blocked) {
          setBlockedInfo({
            isBlocked: true,
            reason: info.reason || "Your account has been suspended.",
            email: info.email || "",
            name: info.name || ""
          });
          throw new Error("Your account has been suspended.");
        }
        throw new Error(getErrorMessage(data, "Google authentication failed"));
      }
      
      setAuthUser(data.user);
      localStorage.setItem("spetro_token", data.token);
      setLocation("/");
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password?: string) => {
    setIsLoading(true);
    try {
      let res = await fetch(`${BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      if (res.status === 503 || res.status === 502) {
        await new Promise((r) => setTimeout(r, 2500));
        res = await fetch(`${BASE}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password })
        });
      }
      const data = await safeJson(res, "Login failed");
      if (!res.ok) {
        const info = data?.detail || data;
        if (res.status === 403 && info?.is_blocked) {
          setBlockedInfo({
            isBlocked: true,
            reason: info.reason || "Your account has been suspended by administration.",
            email: info.email || email,
            name: info.name || ""
          });
          throw new Error("Your account has been suspended.");
        }
        throw new Error(getErrorMessage(data, "Login failed"));
      }
      
      setAuthUser(data.user);
      localStorage.setItem("spetro_token", data.token);
      setLocation("/");
    } finally {
      setIsLoading(false);
    }
  };
  
  const register = async (name: string, email: string, password?: string, code?: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`${BASE}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, code })
      });
      const data = await safeJson(res, "Registration failed");
      if (!res.ok) {
        throw new Error(getErrorMessage(data, "Registration failed"));
      }
      
      setAuthUser(data.user);
      localStorage.setItem("spetro_token", data.token);
      setLocation("/");
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    setBlockedInfo(null);
    localStorage.removeItem("spetro_token");
    setLocation("/auth");
  };

  const forgotPassword = async (email: string) => {
    const res = await fetch(`${BASE}/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });
    const data = await safeJson(res, "Failed to send reset link");
    if (!res.ok) {
      throw new Error(getErrorMessage(data, "Failed to send reset link"));
    }
    return data;
  };

  const resetPassword = async (token: string, newPassword: string) => {
    const res = await fetch(`${BASE}/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, new_password: newPassword })
    });
    const data = await safeJson(res, "Failed to reset password");
    if (!res.ok) {
      throw new Error(getErrorMessage(data, "Failed to reset password"));
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        blockedInfo,
        setBlockedInfo,
        requestOtp,
        verifyOtp,
        loginWithGoogle,
        login,
        register,
        logout,
        forgotPassword,
        resetPassword
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

const fallbackAuthContext: AuthContextType = {
  user: null,
  isAuthenticated: false,
  isLoading: false,
  blockedInfo: null,
  setBlockedInfo: () => {},
  requestOtp: async () => {},
  verifyOtp: async () => {},
  loginWithGoogle: async () => {},
  login: async () => {},
  register: async () => {},
  logout: () => {},
  forgotPassword: async () => {},
  resetPassword: async () => {},
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  return context || fallbackAuthContext;
}
