import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { User, Lock, Loader2, CheckCircle2, AlertCircle, Sparkles, Palette, Monitor, Moon, Sun, Shield, KeyRound, Cloud, Activity, UploadCloud, Bell } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect } from "react";
import { Progress } from "@/components/ui/progress";
import { BlogManager } from "@/components/BlogManager";
import { useBranding, setBranding } from "@/hooks/use-branding";

export function SettingsPage() {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  
  // Profile state
  const [name, setName] = useState(user?.name || "");
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [profileError, setProfileError] = useState("");

  // Password state
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  // Usage state
  const [usage, setUsage] = useState<{ used: number; limit: number | string } | null>(null);
  
  // Branding state
  const branding = useBranding();
  const [siteName, setSiteName] = useState(branding.siteName);
  const [siteSubtitle, setSiteSubtitle] = useState(branding.siteSubtitle);
  const [logoUrl, setLogoUrl] = useState(branding.logoUrl);
  const [brandingSuccess, setBrandingSuccess] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [brandingError, setBrandingError] = useState("");

  useEffect(() => {
    setSiteName(branding.siteName);
    setSiteSubtitle(branding.siteSubtitle);
    setLogoUrl(branding.logoUrl);
  }, [branding]);

  const handleUpdateBranding = (e: React.FormEvent) => {
    e.preventDefault();
    setBranding({ siteName, siteSubtitle, logoUrl });
    setBrandingSuccess(true);
    setTimeout(() => setBrandingSuccess(false), 3000);
  };
  
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingLogo(true);
    setBrandingError("");
    try {
      const res = await api.uploadLogo(file);
      setLogoUrl(res.url);
      setBranding({ siteName, siteSubtitle, logoUrl: res.url });
      setBrandingSuccess(true);
      setTimeout(() => setBrandingSuccess(false), 3000);
    } catch (err: any) {
      setBrandingError(err.message || "Failed to upload logo");
    } finally {
      setIsUploadingLogo(false);
      e.target.value = '';
    }
  };
  
  useEffect(() => {
    api.auth.getGeeUsage()
      .then(setUsage)
      .catch(console.error);
  }, []);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setIsUpdatingProfile(true);
    setProfileError("");
    setProfileSuccess(false);

    try {
      const res = await api.auth.updateProfile(name);
      if (res.ok) {
        setProfileSuccess(true);
        localStorage.setItem("spetro_token", res.token);
        window.location.reload();
      }
    } catch (err: any) {
      setProfileError(err.message || "Failed to update profile");
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oldPassword || !newPassword) return;
    setIsChangingPassword(true);
    setPasswordError("");
    setPasswordSuccess(false);

    try {
      const res = await api.auth.changePassword(oldPassword, newPassword);
      if (res.ok) {
        setPasswordSuccess(true);
        setOldPassword("");
        setNewPassword("");
      }
    } catch (err: any) {
      setPasswordError(err.message || "Failed to change password");
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-gradient-to-br from-background via-background to-primary/5">
      <div className="max-w-6xl mx-auto py-12 px-6 lg:px-12">
        <div className="mb-10 animate-in fade-in slide-in-from-top-4 duration-500">
          <h1 className="text-4xl font-extrabold tracking-tight text-foreground flex items-center gap-3">
            <Sparkles className="w-8 h-8 text-primary" />
            Settings
          </h1>
          <p className="text-muted-foreground mt-3 text-base">Customize your workspace and manage your account preferences.</p>
        </div>

        <Tabs defaultValue="account" className="w-full">
          <TabsList className={`grid w-full grid-cols-2 ${user?.role === 'admin' ? 'md:grid-cols-5' : 'md:grid-cols-4'} mb-8 bg-muted/60 p-1.5 rounded-2xl border border-border/60 h-auto`}>
            <TabsTrigger value="account" className="py-2.5 rounded-xl data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-primary transition-all font-semibold text-muted-foreground">Account</TabsTrigger>
            <TabsTrigger value="security" className="py-2.5 rounded-xl data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-primary transition-all font-semibold text-muted-foreground">Security</TabsTrigger>
            <TabsTrigger value="notifications" className="py-2.5 rounded-xl data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-primary transition-all font-semibold text-muted-foreground">Alerts</TabsTrigger>
            <TabsTrigger value="appearance" className="py-2.5 rounded-xl data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-primary transition-all font-semibold text-muted-foreground">Appearance</TabsTrigger>
            {user?.role === 'admin' && (
              <TabsTrigger value="branding" className="py-2.5 rounded-xl data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-primary transition-all font-semibold text-muted-foreground">Admin</TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="account" className="space-y-6 animate-in fade-in-50 slide-in-from-bottom-4 duration-500">
            {/* Profile Section */}
            <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
              <div className="border-b border-border px-8 py-5 bg-muted/20">
                <h2 className="text-xl font-bold flex items-center gap-3 text-foreground">
                  <div className="p-2.5 bg-primary/10 rounded-xl text-primary">
                    <User className="w-5 h-5" />
                  </div>
                  Profile Information
                </h2>
              </div>
              <div className="p-8">
                <form onSubmit={handleUpdateProfile} className="space-y-6">
                  {/* Avatar Upload */}
                  <div className="flex items-center gap-6">
                    <div className="relative group">
                      <div className="w-24 h-24 rounded-full bg-muted border-2 border-border flex items-center justify-center overflow-hidden">
                        {user?.profile_picture ? (
                          <img src={user.profile_picture} alt="Profile" className="w-full h-full object-cover" />
                        ) : (
                          <User className="w-10 h-10 text-muted-foreground" />
                        )}
                      </div>
                      <label htmlFor="avatar-upload" className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
                        <UploadCloud className="w-6 h-6 text-white" />
                      </label>
                      <input 
                        id="avatar-upload" 
                        type="file" 
                        accept="image/*" 
                        className="hidden" 
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          try {
                            const res = await api.auth.uploadProfilePicture(file);
                            if (res.url) {
                              setProfileSuccess(true);
                              setTimeout(() => window.location.reload(), 1000);
                            }
                          } catch (err) {
                            setProfileError("Failed to upload picture");
                          }
                        }}
                      />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">Profile Picture</h3>
                      <p className="text-xs text-muted-foreground mt-1">Click the avatar to upload a new image. Supports JPG, PNG, or GIF.</p>
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    <Label htmlFor="email" className="text-sm font-semibold text-muted-foreground">Email Address</Label>
                    <Input id="email" type="email" value={user?.email || ""} disabled className="bg-muted/50 border border-border opacity-70" />
                    <p className="text-xs text-muted-foreground">Your email address cannot be changed.</p>
                  </div>
                  
                  <div className="space-y-2.5">
                    <Label htmlFor="name" className="text-sm font-semibold text-foreground">Display Name</Label>
                    <Input 
                      id="name" 
                      type="text" 
                      value={name} 
                      onChange={(e) => setName(e.target.value)} 
                      placeholder="Your name"
                      className="bg-background border border-input focus-visible:ring-1 focus-visible:ring-primary transition-all"
                      required
                    />
                  </div>

                  {profileError && (
                    <div className="flex items-center gap-2.5 text-sm text-destructive bg-destructive/10 p-4 rounded-xl border border-destructive/20 animate-in fade-in zoom-in-95 duration-300">
                      <AlertCircle className="w-5 h-5 shrink-0" />
                      <p>{profileError}</p>
                    </div>
                  )}
                  
                  {profileSuccess && (
                    <div className="flex items-center gap-2.5 text-sm text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 p-4 rounded-xl border border-emerald-500/20 animate-in fade-in zoom-in-95 duration-300">
                      <CheckCircle2 className="w-5 h-5 shrink-0" />
                      <p>Profile updated successfully!</p>
                    </div>
                  )}

                  <div className="pt-3">
                    <Button type="submit" disabled={isUpdatingProfile || name === user?.name} className="shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all rounded-xl px-6 h-11">
                      {isUpdatingProfile && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Save Changes
                    </Button>
                  </div>
                </form>
              </div>
            </div>

            {/* API Usage & Quotas */}
            <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden mt-6">
              <div className="border-b border-border px-8 py-5 bg-muted/20">
                <h2 className="text-xl font-bold flex items-center gap-3 text-foreground">
                  <div className="p-2.5 bg-emerald-500/10 rounded-xl text-emerald-600 dark:text-emerald-400">
                    <Activity className="w-5 h-5" />
                  </div>
                  API Usage & Quotas
                </h2>
              </div>
              <div className="p-8">
                <div className="mb-6">
                  <h3 className="text-base font-semibold mb-2 text-foreground">Google Earth Engine (GEE) Limits</h3>
                  <p className="text-sm text-muted-foreground">
                    To ensure fair use and platform stability, map processing requests are subject to daily rate limits. Your quota resets every day at midnight (UTC).
                  </p>
                </div>
                
                {usage ? (
                  <div className="bg-muted/40 border border-border rounded-xl p-5">
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-foreground">Maps Processed Today</span>
                      </div>
                      <div className="text-right">
                        <span className="text-2xl font-black text-primary">{usage.used}</span>
                        <span className="text-emerald-500 text-sm font-bold ml-2">(Unlimited)</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading usage data...
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="security" className="space-y-6 animate-in fade-in-50 slide-in-from-bottom-4 duration-500">
            {/* Security Section */}
            <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
              <div className="border-b border-border px-8 py-5 bg-muted/20">
                <h2 className="text-xl font-bold flex items-center gap-3 text-foreground">
                  <div className="p-2.5 bg-amber-500/10 rounded-xl text-amber-600 dark:text-amber-400">
                    <Shield className="w-5 h-5" />
                  </div>
                  Security Settings
                </h2>
              </div>
              <div className="p-8">
                <form onSubmit={handleChangePassword} className="space-y-6">
                  <div className="space-y-2.5">
                    <Label htmlFor="old-password" className="text-sm font-semibold text-foreground">Current Password</Label>
                    <Input 
                      id="old-password" 
                      type="password" 
                      value={oldPassword} 
                      onChange={(e) => setOldPassword(e.target.value)} 
                      className="bg-background border border-input focus-visible:ring-1 focus-visible:ring-amber-500 transition-all"
                      required
                    />
                  </div>
                  
                  <div className="space-y-2.5">
                    <Label htmlFor="new-password" className="text-sm font-semibold text-foreground">New Password</Label>
                    <Input 
                      id="new-password" 
                      type="password" 
                      value={newPassword} 
                      onChange={(e) => setNewPassword(e.target.value)} 
                      className="bg-background border border-input focus-visible:ring-1 focus-visible:ring-amber-500 transition-all"
                      required
                    />
                    <p className="text-xs text-muted-foreground pt-1">Must be 8-15 characters long with uppercase, lowercase, and numbers.</p>
                  </div>

                  {passwordError && (
                    <div className="flex items-center gap-2.5 text-sm text-destructive bg-destructive/10 p-4 rounded-xl border border-destructive/20 animate-in fade-in zoom-in-95 duration-300">
                      <AlertCircle className="w-5 h-5 shrink-0" />
                      <p>{passwordError}</p>
                    </div>
                  )}
                  
                  {passwordSuccess && (
                    <div className="flex items-center gap-2.5 text-sm text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 p-4 rounded-xl border border-emerald-500/20 animate-in fade-in zoom-in-95 duration-300">
                      <CheckCircle2 className="w-5 h-5 shrink-0" />
                      <p>Password changed successfully!</p>
                    </div>
                  )}

                  <div className="pt-3">
                    <Button type="submit" variant="default" className="bg-amber-600 hover:bg-amber-700 text-white shadow-md transition-all rounded-xl px-6 h-11" disabled={isChangingPassword || !oldPassword || !newPassword}>
                      {isChangingPassword && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      <KeyRound className="w-4 h-4 mr-2" />
                      Update Password
                    </Button>
                  </div>
                </form>
              </div>
            </div>

            {/* Linked Accounts */}
            <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden mt-6">
              <div className="border-b border-border px-8 py-5 bg-muted/20">
                <h2 className="text-xl font-bold flex items-center gap-3 text-foreground">
                  <div className="p-2.5 bg-red-500/10 rounded-xl text-red-600 dark:text-red-400">
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"/>
                    </svg>
                  </div>
                  Linked Accounts
                </h2>
              </div>
              <div className="p-8">
                <div className="flex items-center justify-between p-4 rounded-xl bg-muted/40 border border-border">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-foreground">Google Account</span>
                    <span className="text-xs text-muted-foreground mt-1">Sign in seamlessly with your Google account.</span>
                  </div>
                  <Button variant="outline" disabled className="bg-background border-border text-emerald-600 dark:text-emerald-400 font-bold shadow-sm">
                    <CheckCircle2 className="w-4 h-4 mr-2" /> Linked
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="notifications" className="space-y-6 animate-in fade-in-50 slide-in-from-bottom-4 duration-500">
            <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
              <div className="border-b border-border px-8 py-5 bg-muted/20">
                <h2 className="text-xl font-bold flex items-center gap-3 text-foreground">
                  <div className="p-2.5 bg-primary/10 rounded-xl text-primary">
                    <Bell className="w-5 h-5" />
                  </div>
                  Alert Preferences
                </h2>
              </div>
              <div className="p-8">
                <div className="space-y-4">
                  {['Email me when analysis is complete', 'Security alerts (New logins, password changes)', 'Community mentions and replies', 'System updates and new features'].map((pref, i) => (
                    <div key={i} className="flex items-center justify-between p-4 rounded-xl bg-muted/40 border border-border">
                      <span className="text-sm font-semibold text-foreground">{pref}</span>
                      <div className="relative inline-block w-12 align-middle select-none transition duration-200 ease-in">
                        <input type="checkbox" name="toggle" id={`toggle-${i}`} defaultChecked className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-background border-2 border-primary appearance-none cursor-pointer shadow-sm transition-transform duration-200 checked:translate-x-6 checked:bg-primary" />
                        <label htmlFor={`toggle-${i}`} className="toggle-label block overflow-hidden h-6 rounded-full bg-muted cursor-pointer border border-border"></label>
                      </div>
                    </div>
                  ))}
                  
                  <div className="pt-4">
                    <Button type="button" onClick={() => {
                        setProfileSuccess(true);
                        setTimeout(() => setProfileSuccess(false), 2000);
                      }} 
                      className="shadow-md transition-all rounded-xl px-6 h-11 bg-primary text-primary-foreground hover:bg-primary/90">
                      Save Preferences
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="appearance" className="space-y-6 animate-in fade-in-50 slide-in-from-bottom-4 duration-500">
            <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
              <div className="border-b border-border px-8 py-5 bg-muted/20">
                <h2 className="text-xl font-bold flex items-center gap-3 text-foreground">
                  <div className="p-2.5 bg-purple-500/10 rounded-xl text-purple-600 dark:text-purple-400">
                    <Palette className="w-5 h-5" />
                  </div>
                  Appearance
                </h2>
              </div>
              <div className="p-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Light Theme */}
                  <div 
                    onClick={() => setTheme("light")}
                    className={`cursor-pointer rounded-2xl p-5 transition-all duration-300 hover:-translate-y-1 border ${theme === "light" ? "bg-primary/5 border-primary shadow-md" : "bg-card border-border hover:border-primary/40 shadow-sm"}`}
                  >
                    <div className="w-full h-28 rounded-xl bg-slate-100 flex items-center justify-center mb-5 border border-slate-200 shadow-inner">
                      <Sun className="w-10 h-10 text-amber-500 drop-shadow-md" />
                    </div>
                    <div className="flex items-center gap-3">
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${theme === "light" ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30"}`}>
                        {theme === "light" && <div className="w-2 h-2 rounded-full bg-white animate-in zoom-in" />}
                      </div>
                      <span className="font-bold text-foreground">Light Mode</span>
                    </div>
                  </div>

                  {/* Dark Theme */}
                  <div 
                    onClick={() => setTheme("dark")}
                    className={`cursor-pointer rounded-2xl p-5 transition-all duration-300 hover:-translate-y-1 border ${theme === "dark" ? "bg-primary/5 border-primary shadow-md" : "bg-card border-border hover:border-primary/40 shadow-sm"}`}
                  >
                    <div className="w-full h-28 rounded-xl bg-slate-900 flex items-center justify-center mb-5 border border-slate-800 shadow-inner">
                      <Moon className="w-10 h-10 text-blue-400 drop-shadow-md" />
                    </div>
                    <div className="flex items-center gap-3">
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${theme === "dark" ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30"}`}>
                        {theme === "dark" && <div className="w-2 h-2 rounded-full bg-white animate-in zoom-in" />}
                      </div>
                      <span className="font-bold text-foreground">Dark Mode</span>
                    </div>
                  </div>

                  {/* System Theme */}
                  <div 
                    onClick={() => setTheme("system")}
                    className={`cursor-pointer rounded-2xl p-5 transition-all duration-300 hover:-translate-y-1 border ${theme === "system" ? "bg-primary/5 border-primary shadow-md" : "bg-card border-border hover:border-primary/40 shadow-sm"}`}
                  >
                    <div className="w-full h-28 rounded-xl bg-gradient-to-br from-slate-100 to-slate-900 flex items-center justify-center mb-5 border border-border shadow-inner">
                      <Monitor className="w-10 h-10 text-slate-500 drop-shadow-md" />
                    </div>
                    <div className="flex items-center gap-3">
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${theme === "system" ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30"}`}>
                        {theme === "system" && <div className="w-2 h-2 rounded-full bg-white animate-in zoom-in" />}
                      </div>
                      <span className="font-bold text-foreground">System Sync</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          {user?.role === 'admin' && (
            <TabsContent value="branding" className="space-y-6 animate-in fade-in-50 slide-in-from-bottom-4 duration-500">
              <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
                <div className="border-b border-border px-8 py-5 bg-muted/20">
                  <h2 className="text-xl font-bold flex items-center gap-3 text-foreground">
                    <div className="p-2.5 bg-primary/10 rounded-xl text-primary">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    Site Branding
                  </h2>
                </div>
                <div className="p-8">
                  <form onSubmit={handleUpdateBranding} className="space-y-6">
                    <div className="space-y-2.5">
                      <Label htmlFor="siteName" className="text-sm font-semibold text-foreground">Website Name</Label>
                      <Input 
                        id="siteName" 
                        type="text" 
                        value={siteName} 
                        onChange={(e) => setSiteName(e.target.value)} 
                        placeholder="e.g. SPETRO"
                        className="bg-background border border-input focus-visible:ring-1 focus-visible:ring-primary transition-all"
                      />
                    </div>

                    <div className="space-y-2.5">
                      <Label htmlFor="siteSubtitle" className="text-sm font-semibold text-foreground">Website Subtitle</Label>
                      <Input 
                        id="siteSubtitle" 
                        type="text" 
                        value={siteSubtitle} 
                        onChange={(e) => setSiteSubtitle(e.target.value)} 
                        placeholder="e.g. Geoportal Analysis"
                        className="bg-background border border-input focus-visible:ring-1 focus-visible:ring-primary transition-all"
                      />
                    </div>
                    
                    <div className="space-y-2.5">
                      <Label htmlFor="logoUrl" className="text-sm font-semibold text-foreground">Logo URL</Label>
                      <div className="flex flex-col gap-3">
                        <Input 
                          id="logoUrl" 
                          type="text" 
                          value={logoUrl} 
                          onChange={(e) => setLogoUrl(e.target.value)} 
                          placeholder="e.g. /logo.png or https://example.com/logo.png"
                          className="bg-background border border-input focus-visible:ring-1 focus-visible:ring-primary transition-all"
                        />
                        <div className="flex items-center gap-4">
                          <span className="text-xs text-muted-foreground font-bold uppercase tracking-widest">OR UPLOAD FILE</span>
                          <div className="h-px bg-border flex-1"></div>
                        </div>
                        <div className="relative">
                          <Input
                            type="file"
                            accept="image/*"
                            onChange={handleLogoUpload}
                            disabled={isUploadingLogo}
                            className="bg-background border border-input focus-visible:ring-1 focus-visible:ring-primary transition-all cursor-pointer file:cursor-pointer file:bg-primary file:text-primary-foreground file:border-0 file:rounded-xl file:px-4 file:py-1.5 file:mr-4 file:font-semibold hover:file:bg-primary/90"
                          />
                          {isUploadingLogo && (
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2 text-sm text-primary">
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span>Uploading...</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground pt-1">
                        Enter a URL to an image, or directly upload an image file. Uploading will automatically update both the React and Streamlit frontends.
                      </p>
                    </div>
                    
                    {brandingError && (
                      <div className="flex items-center gap-2.5 text-sm text-destructive bg-destructive/10 p-4 rounded-xl border border-destructive/20 animate-in fade-in zoom-in-95 duration-300">
                        <AlertCircle className="w-5 h-5 shrink-0" />
                        <p>{brandingError}</p>
                      </div>
                    )}
                    
                    {brandingSuccess && (
                      <div className="flex items-center gap-2.5 text-sm text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 p-4 rounded-xl border border-emerald-500/20 animate-in fade-in zoom-in-95 duration-300">
                        <CheckCircle2 className="w-5 h-5 shrink-0" />
                        <p>Branding updated successfully!</p>
                      </div>
                    )}

                    <div className="pt-3">
                      <Button type="submit" className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-md transition-all rounded-xl px-6 h-11">
                        Save Branding
                      </Button>
                    </div>
                  </form>
                </div>
              </div>
            </TabsContent>
          )}



          {user?.role === 'admin' && (
            <TabsContent value="content" className="space-y-6 animate-in fade-in-50 slide-in-from-bottom-4 duration-500">
              <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden p-8">
                <BlogManager />
              </div>
            </TabsContent>
          )}
          
        </Tabs>
      </div>
    </div>
  );
}
