import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useLocation } from "wouter";
import { BASE } from "@/lib/api";

interface User {
  id: string;
  email: string;
  name?: string;
  role?: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password?: string) => Promise<void>;
  register: (name: string, email: string, password?: string) => Promise<void>;
  logout: () => void;
  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (token: string, newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const getErrorMessage = (data: any, fallback: string) => {
  if (typeof data.detail === "string") return data.detail;
  if (Array.isArray(data.detail) && data.detail.length > 0) {
    const firstError = data.detail[0];
    const field = firstError.loc?.[1] ? `${firstError.loc[1]}: ` : "";
    return `${field}${firstError.msg || JSON.stringify(firstError)}`;
  }
  return fallback;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [, setLocation] = useLocation();

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
            setUser(data.user);
          } else {
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
      return { detail: `${fallback} (Server returned ${res.status}: ${res.statusText || "No response body"})` };
    }
  };

  const login = async (email: string, password?: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`${BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const data = await safeJson(res, "Login failed");
      if (!res.ok) {
        throw new Error(getErrorMessage(data, "Invalid email or password"));
      }
      
      setUser(data.user);
      localStorage.setItem("spetro_token", data.token);
      setLocation("/");
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (name: string, email: string, password?: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`${BASE}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password })
      });
      const data = await safeJson(res, "Registration failed");
      if (!res.ok) {
        throw new Error(getErrorMessage(data, "Registration failed"));
      }
      
      setUser(data.user);
      localStorage.setItem("spetro_token", data.token);
      setLocation("/");
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
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

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
