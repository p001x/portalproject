import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { User, Lock, Loader2, CheckCircle2, AlertCircle, Sparkles, Palette, Monitor, Moon, Sun, Shield, KeyRound, Cloud, Activity } from "lucide-react";
import { useTheme } from "next-themes";
import { GEEProjectConfig } from "@/components/GEEProjectConfig";
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
      // clear the file input
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
        // Refresh token in localStorage so next reload gets new name
        localStorage.setItem("spetro_token", res.token);
        // Reload to let auth context pick up the new token
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
      <div className="max-w-4xl mx-auto py-12 px-6 lg:px-8">
        <div className="mb-10 animate-in fade-in slide-in-from-top-4 duration-500">
          <h1 className="text-4xl font-extrabold tracking-tight text-foreground flex items-center gap-3">
            <Sparkles className="w-8 h-8 text-primary" />
            Settings
          </h1>
          <p className="text-muted-foreground mt-3 text-base">Customize your workspace and manage your account preferences.</p>
        </div>

        <Tabs defaultValue="account" className="w-full">
            <TabsList className={`grid w-full grid-cols-2 ${user?.role === 'admin' ? 'md:grid-cols-6 max-w-[900px]' : 'md:grid-cols-5 max-w-[750px]'} mb-8 bg-muted/50 p-1.5 backdrop-blur-md border border-border/50 rounded-xl`}>
            <TabsTrigger value="account" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-primary transition-all font-medium">Account</TabsTrigger>
            <TabsTrigger value="security" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-primary transition-all font-medium">Security</TabsTrigger>
            <TabsTrigger value="appearance" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-primary transition-all font-medium">Appearance</TabsTrigger>
            {user?.role === 'admin' && (
              <TabsTrigger value="branding" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-primary transition-all font-medium">Branding</TabsTrigger>
            )}
            <TabsTrigger value="integrations" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-primary transition-all font-medium">Integrations</TabsTrigger>
            {user?.role === 'admin' && (
              <TabsTrigger value="content" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-primary transition-all font-medium">Content</TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="account" className="space-y-6 animate-in fade-in-50 slide-in-from-bottom-4 duration-500">
            {/* Profile Section */}
            <div className="bg-card/40 backdrop-blur-xl border border-border/50 rounded-2xl overflow-hidden shadow-xl">
              <div className="border-b border-border/50 px-8 py-5 bg-gradient-to-r from-primary/10 via-transparent to-transparent">
                <h2 className="text-xl font-bold flex items-center gap-3">
                  <div className="p-2.5 bg-primary/20 rounded-xl text-primary shadow-sm border border-primary/20">
                    <User className="w-5 h-5" />
                  </div>
                  Profile Information
                </h2>
              </div>
              <div className="p-8">
                <form onSubmit={handleUpdateProfile} className="space-y-6">
                  <div className="space-y-2.5">
                    <Label htmlFor="email" className="text-sm font-semibold text-muted-foreground">Email Address</Label>
                    <Input id="email" type="email" value={user?.email || ""} disabled className="bg-muted/50 border-white/5 opacity-80" />
                    <p className="text-xs text-muted-foreground">Your email address cannot be changed.</p>
                  </div>
                  
                  <div className="space-y-2.5">
                    <Label htmlFor="name" className="text-sm font-semibold text-muted-foreground">Display Name</Label>
                    <Input 
                      id="name" 
                      type="text" 
                      value={name} 
                      onChange={(e) => setName(e.target.value)} 
                      placeholder="Your name"
                      className="bg-background/50 focus:ring-primary focus:border-primary transition-all duration-300"
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
            <div className="bg-card/40 backdrop-blur-xl border border-border/50 rounded-2xl overflow-hidden shadow-xl mt-6">
              <div className="border-b border-border/50 px-8 py-5 bg-gradient-to-r from-emerald-500/10 via-transparent to-transparent">
                <h2 className="text-xl font-bold flex items-center gap-3">
                  <div className="p-2.5 bg-emerald-500/20 rounded-xl text-emerald-500 shadow-sm border border-emerald-500/20">
                    <Activity className="w-5 h-5" />
                  </div>
                  API Usage & Quotas
                </h2>
              </div>
              <div className="p-8">
                <div className="mb-6">
                  <h3 className="text-base font-semibold mb-2">Google Earth Engine (GEE) Limits</h3>
                  <p className="text-sm text-muted-foreground">
                    To ensure fair use and platform stability, map processing requests are subject to daily rate limits. Your quota resets every day at midnight (UTC).
                  </p>
                </div>
                
                {usage ? (
                  <div className="bg-background/50 border border-border/50 rounded-xl p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-foreground">Maps Processed Today</span>
                      </div>
                      <div className="text-right">
                        <span className="text-2xl font-bold text-primary">{usage.used}</span>
                        <span className="text-emerald-500 text-sm font-semibold ml-2">(Unlimited)</span>
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
            <div className="bg-card/40 backdrop-blur-xl border border-border/50 rounded-2xl overflow-hidden shadow-xl">
              <div className="border-b border-border/50 px-8 py-5 bg-gradient-to-r from-amber-500/10 via-transparent to-transparent">
                <h2 className="text-xl font-bold flex items-center gap-3">
                  <div className="p-2.5 bg-amber-500/20 rounded-xl text-amber-500 shadow-sm border border-amber-500/20">
                    <Shield className="w-5 h-5" />
                  </div>
                  Security Settings
                </h2>
              </div>
              <div className="p-8">
                <form onSubmit={handleChangePassword} className="space-y-6">
                  <div className="space-y-2.5">
                    <Label htmlFor="old-password" className="text-sm font-semibold text-muted-foreground">Current Password</Label>
                    <Input 
                      id="old-password" 
                      type="password" 
                      value={oldPassword} 
                      onChange={(e) => setOldPassword(e.target.value)} 
                      className="bg-background/50 focus:ring-amber-500 focus:border-amber-500 transition-all duration-300"
                      required
                    />
                  </div>
                  
                  <div className="space-y-2.5">
                    <Label htmlFor="new-password" className="text-sm font-semibold text-muted-foreground">New Password</Label>
                    <Input 
                      id="new-password" 
                      type="password" 
                      value={newPassword} 
                      onChange={(e) => setNewPassword(e.target.value)} 
                      className="bg-background/50 focus:ring-amber-500 focus:border-amber-500 transition-all duration-300"
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
                    <Button type="submit" variant="default" className="bg-amber-600 hover:bg-amber-700 text-white shadow-lg shadow-amber-500/20 hover:shadow-amber-500/40 transition-all rounded-xl px-6 h-11" disabled={isChangingPassword || !oldPassword || !newPassword}>
                      {isChangingPassword && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      <KeyRound className="w-4 h-4 mr-2" />
                      Update Password
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="appearance" className="space-y-6 animate-in fade-in-50 slide-in-from-bottom-4 duration-500">
            <div className="bg-card/40 backdrop-blur-xl border border-border/50 rounded-2xl overflow-hidden shadow-xl">
              <div className="border-b border-border/50 px-8 py-5 bg-gradient-to-r from-purple-500/10 via-transparent to-transparent">
                <h2 className="text-xl font-bold flex items-center gap-3">
                  <div className="p-2.5 bg-purple-500/20 rounded-xl text-purple-500 shadow-sm border border-purple-500/20">
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
                    className={`cursor-pointer rounded-2xl border-2 p-5 transition-all duration-300 hover:-translate-y-1 ${theme === "light" ? "border-purple-500 bg-purple-500/5 shadow-xl shadow-purple-500/10" : "border-border/50 hover:border-purple-500/50 bg-background/50 hover:bg-purple-500/5"}`}
                  >
                    <div className="w-full h-28 rounded-xl bg-slate-100 flex items-center justify-center mb-5 border shadow-inner">
                      <Sun className="w-10 h-10 text-amber-500" />
                    </div>
                    <div className="flex items-center gap-3">
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${theme === "light" ? "border-purple-500" : "border-muted-foreground/30"}`}>
                        {theme === "light" && <div className="w-2.5 h-2.5 rounded-full bg-purple-500 animate-in zoom-in" />}
                      </div>
                      <span className="font-semibold text-foreground">Light Mode</span>
                    </div>
                  </div>

                  {/* Dark Theme */}
                  <div 
                    onClick={() => setTheme("dark")}
                    className={`cursor-pointer rounded-2xl border-2 p-5 transition-all duration-300 hover:-translate-y-1 ${theme === "dark" ? "border-purple-500 bg-purple-500/5 shadow-xl shadow-purple-500/10" : "border-border/50 hover:border-purple-500/50 bg-background/50 hover:bg-purple-500/5"}`}
                  >
                    <div className="w-full h-28 rounded-xl bg-slate-900 flex items-center justify-center mb-5 border border-slate-800 shadow-inner">
                      <Moon className="w-10 h-10 text-blue-400" />
                    </div>
                    <div className="flex items-center gap-3">
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${theme === "dark" ? "border-purple-500" : "border-muted-foreground/30"}`}>
                        {theme === "dark" && <div className="w-2.5 h-2.5 rounded-full bg-purple-500 animate-in zoom-in" />}
                      </div>
                      <span className="font-semibold text-foreground">Dark Mode</span>
                    </div>
                  </div>

                  {/* System Theme */}
                  <div 
                    onClick={() => setTheme("system")}
                    className={`cursor-pointer rounded-2xl border-2 p-5 transition-all duration-300 hover:-translate-y-1 ${theme === "system" ? "border-purple-500 bg-purple-500/5 shadow-xl shadow-purple-500/10" : "border-border/50 hover:border-purple-500/50 bg-background/50 hover:bg-purple-500/5"}`}
                  >
                    <div className="w-full h-28 rounded-xl bg-gradient-to-br from-slate-100 to-slate-900 flex items-center justify-center mb-5 border shadow-inner">
                      <Monitor className="w-10 h-10 text-slate-500 mix-blend-difference" />
                    </div>
                    <div className="flex items-center gap-3">
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${theme === "system" ? "border-purple-500" : "border-muted-foreground/30"}`}>
                        {theme === "system" && <div className="w-2.5 h-2.5 rounded-full bg-purple-500 animate-in zoom-in" />}
                      </div>
                      <span className="font-semibold text-foreground">System Sync</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          {user?.role === 'admin' && (
            <TabsContent value="branding" className="space-y-6 animate-in fade-in-50 slide-in-from-bottom-4 duration-500">
              <div className="bg-card/40 backdrop-blur-xl border border-border/50 rounded-2xl overflow-hidden shadow-xl">
                <div className="border-b border-border/50 px-8 py-5 bg-gradient-to-r from-primary/10 via-transparent to-transparent">
                  <h2 className="text-xl font-bold flex items-center gap-3">
                    <div className="p-2.5 bg-primary/20 rounded-xl text-primary shadow-sm border border-primary/20">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    Site Branding
                  </h2>
                </div>
                <div className="p-8">
                  <form onSubmit={handleUpdateBranding} className="space-y-6">
                    <div className="space-y-2.5">
                      <Label htmlFor="siteName" className="text-sm font-semibold text-muted-foreground">Website Name</Label>
                      <Input 
                        id="siteName" 
                        type="text" 
                        value={siteName} 
                        onChange={(e) => setSiteName(e.target.value)} 
                        placeholder="e.g. SPETRO"
                        className="bg-background/50 focus:ring-primary focus:border-primary transition-all duration-300"
                      />
                    </div>

                    <div className="space-y-2.5">
                      <Label htmlFor="siteSubtitle" className="text-sm font-semibold text-muted-foreground">Website Subtitle</Label>
                      <Input 
                        id="siteSubtitle" 
                        type="text" 
                        value={siteSubtitle} 
                        onChange={(e) => setSiteSubtitle(e.target.value)} 
                        placeholder="e.g. Geoportal Analysis"
                        className="bg-background/50 focus:ring-primary focus:border-primary transition-all duration-300"
                      />
                    </div>
                    
                    <div className="space-y-2.5">
                      <Label htmlFor="logoUrl" className="text-sm font-semibold text-muted-foreground">Logo URL</Label>
                      <div className="flex flex-col gap-3">
                        <Input 
                          id="logoUrl" 
                          type="text" 
                          value={logoUrl} 
                          onChange={(e) => setLogoUrl(e.target.value)} 
                          placeholder="e.g. /logo.png or https://example.com/logo.png"
                          className="bg-background/50 focus:ring-primary focus:border-primary transition-all duration-300"
                        />
                        <div className="flex items-center gap-4">
                          <span className="text-xs text-muted-foreground font-medium uppercase tracking-widest">OR UPLOAD FILE</span>
                          <div className="h-px bg-border/50 flex-1"></div>
                        </div>
                        <div className="relative">
                          <Input
                            type="file"
                            accept="image/*"
                            onChange={handleLogoUpload}
                            disabled={isUploadingLogo}
                            className="bg-background/50 focus:ring-primary focus:border-primary transition-all duration-300 cursor-pointer file:cursor-pointer file:bg-primary/10 file:text-primary file:border-0 file:rounded-md file:px-4 file:py-1 file:mr-4 file:font-semibold hover:file:bg-primary/20"
                          />
                          {isUploadingLogo && (
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2 text-sm text-primary">
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span>Uploading...</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
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
                      <Button type="submit" className="shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all rounded-xl px-6 h-11">
                        Save Branding
                      </Button>
                    </div>
                  </form>
                </div>
              </div>
            </TabsContent>
          )}

          <TabsContent value="integrations" className="space-y-6 animate-in fade-in-50 slide-in-from-bottom-4 duration-500">
            <div className="bg-card/40 backdrop-blur-xl border border-border/50 rounded-2xl overflow-hidden shadow-xl">
              <div className="border-b border-border/50 px-8 py-5 bg-gradient-to-r from-emerald-500/10 via-transparent to-transparent">
                <h2 className="text-xl font-bold flex items-center gap-3">
                  <div className="p-2.5 bg-emerald-500/20 rounded-xl text-emerald-500 shadow-sm border border-emerald-500/20">
                    <Cloud className="w-5 h-5" />
                  </div>
                  Cloud Integrations
                </h2>
              </div>
              <div className="p-8">
                <p className="text-muted-foreground mb-8 text-base">Manage your active Google Earth Engine configuration. This allows you to process remote sensing data using your own Google Cloud resources directly from the portal.</p>
                <div className="w-full max-w-sm">
                  {/* Reuse the existing GEEProjectConfig but maybe wrap it to look better */}
                  <div className="p-1 rounded-xl bg-gradient-to-br from-emerald-500/20 to-transparent">
                    <GEEProjectConfig />
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          {user?.role === 'admin' && (
            <TabsContent value="content" className="space-y-6 animate-in fade-in-50 slide-in-from-bottom-4 duration-500">
              <div className="bg-card/40 backdrop-blur-xl border border-border/50 rounded-2xl overflow-hidden shadow-xl p-8">
                <BlogManager />
              </div>
            </TabsContent>
          )}
          
        </Tabs>
      </div>
    </div>
  );
}
