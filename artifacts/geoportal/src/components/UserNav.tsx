import { useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useNotifications } from "@/hooks/use-notifications";
import { NotificationList } from "@/App";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { 
  Bell, 
  Settings, 
  LogOut, 
  ChevronDown, 
  LayoutGrid, 
  Layers, 
  ShieldCheck, 
  LayoutDashboard, 
  User as UserIcon,
  CheckCircle2,
  Sparkles,
  ArrowRight
} from "lucide-react";

export function NotificationBellButton() {
  const { unreadCount } = useNotifications();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="relative w-9 h-9 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-all border border-transparent hover:border-border/60 outline-none cursor-pointer focus-visible:ring-2 focus-visible:ring-emerald-500/20"
          title="Notifications"
          aria-label="View notifications"
        >
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0 border-border/80 shadow-2xl rounded-2xl overflow-hidden" align="end" sideOffset={8}>
        <NotificationList />
      </PopoverContent>
    </Popover>
  );
}

export function UserNav() {
  const { user, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  if (!user) {
    return (
      <div className="flex items-center gap-2.5">
        <ThemeToggle />
        <Link href="/auth">
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-xs font-semibold text-muted-foreground hover:text-foreground px-3.5 h-9 rounded-xl hover:bg-muted/70"
          >
            Sign In
          </Button>
        </Link>
        <Link href="/auth">
          <Button 
            size="sm" 
            className="text-xs font-bold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-md shadow-emerald-500/20 hover:shadow-emerald-500/30 px-4 h-9 rounded-xl transition-all"
          >
            Get Started <ArrowRight className="w-3.5 h-3.5 ml-1.5 inline" />
          </Button>
        </Link>
      </div>
    );
  }

  const isAdmin = user.role === "admin" || 
    ["petersonyang8@gmail.com", "pierrendorimana16@gmail.com"].includes(user.email?.toLowerCase());

  const displayName = user.name || user.email.split("@")[0].replace(".", " ").replace(/_/g, " ");
  const avatarUrl = user.avatarUrl || user.profile_picture;
  
  const initials = displayName
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "U";

  return (
    <div className="flex items-center gap-2 sm:gap-3">
      {/* Notifications Popover */}
      <NotificationBellButton />

      {/* Always Visible User Profile Pill */}
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <button
            className="group flex items-center gap-2.5 pl-1.5 pr-2.5 py-1 rounded-full bg-card/80 hover:bg-muted/80 dark:bg-card/60 dark:hover:bg-slate-800/80 border border-border/80 hover:border-emerald-500/40 transition-all duration-200 shadow-sm hover:shadow cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 select-none"
            aria-label="User profile and account settings"
          >
            {/* Avatar with Status Ring */}
            <div className="relative shrink-0">
              <div className="w-8 h-8 rounded-full overflow-hidden bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-700 flex items-center justify-center text-white text-xs font-bold border border-white/20 shadow-sm">
                {avatarUrl ? (
                  <img src={avatarUrl} alt={displayName} className="w-full h-full object-cover" />
                ) : (
                  <span>{initials}</span>
                )}
              </div>
              {/* Online Green Indicator */}
              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-background" />
            </div>

            {/* User Name & Role Pill (Always visible on sm+ screens) */}
            <div className="hidden sm:flex flex-col items-start text-left leading-tight max-w-[130px] md:max-w-[160px]">
              <span className="text-xs font-bold text-foreground truncate w-full group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                {displayName}
              </span>
              <div className="flex items-center gap-1 mt-0.5">
                {isAdmin ? (
                  <span className="text-[9px] font-extrabold uppercase tracking-wider bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 px-1 py-0.2 rounded">
                    Admin
                  </span>
                ) : (
                  <span className="text-[10px] text-muted-foreground font-medium">
                    Analyst
                  </span>
                )}
              </div>
            </div>

            {/* Rotating Caret */}
            <ChevronDown 
              className={`w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} 
            />
          </button>
        </PopoverTrigger>

        {/* Premium Floating Profile Menu */}
        <PopoverContent 
          align="end" 
          sideOffset={8}
          className="w-64 p-0 bg-card/95 dark:bg-slate-950/95 backdrop-blur-2xl border border-border/80 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in-50 zoom-in-95 duration-200"
        >
          {/* Header Banner */}
          <div className="p-3.5 bg-gradient-to-br from-emerald-500/15 via-teal-500/5 to-transparent border-b border-border/60">
            <div className="flex items-center gap-3">
              <div className="relative shrink-0">
                <div className="w-10 h-10 rounded-full overflow-hidden bg-gradient-to-br from-emerald-600 to-teal-700 flex items-center justify-center text-white text-xs font-bold shadow-md border-2 border-background">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={displayName} className="w-full h-full object-cover" />
                  ) : (
                    <span>{initials}</span>
                  )}
                </div>
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-background" />
              </div>

              <div className="overflow-hidden flex-1">
                <div className="flex items-center gap-1.5">
                  <h4 className="text-xs font-bold text-foreground truncate">{displayName}</h4>
                  {isAdmin && (
                    <span className="px-1.5 py-0.2 text-[8px] font-extrabold uppercase tracking-wider bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 rounded">
                      Admin
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground truncate mt-0.5">{user.email}</p>
              </div>
            </div>
          </div>

          {/* Navigation Links */}
          <div className="p-1.5 space-y-0.5">
            <Link href="/platform" onClick={() => setIsOpen(false)}>
              <button className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-medium text-foreground hover:bg-muted/80 dark:hover:bg-slate-900 transition-colors cursor-pointer text-left group">
                <div className="w-6 h-6 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <LayoutGrid className="w-3.5 h-3.5" />
                </div>
                <span className="font-semibold text-foreground">Platform Hub</span>
              </button>
            </Link>

            <Link href="/analysis-hub" onClick={() => setIsOpen(false)}>
              <button className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-medium text-foreground hover:bg-muted/80 dark:hover:bg-slate-900 transition-colors cursor-pointer text-left group">
                <div className="w-6 h-6 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <Layers className="w-3.5 h-3.5" />
                </div>
                <span className="font-semibold text-foreground">Earth Analytics</span>
              </button>
            </Link>

            <Link href="/settings" onClick={() => setIsOpen(false)}>
              <button className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-medium text-foreground hover:bg-muted/80 dark:hover:bg-slate-900 transition-colors cursor-pointer text-left group">
                <div className="w-6 h-6 rounded-lg bg-slate-500/10 text-slate-600 dark:text-slate-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <Settings className="w-3.5 h-3.5" />
                </div>
                <span className="font-semibold text-foreground">Account Settings</span>
              </button>
            </Link>

            {isAdmin && (
              <>
                <div className="h-px bg-border/50 my-1" />
                <div className="px-2.5 pt-1 pb-0.5 text-[9px] font-bold text-muted-foreground uppercase tracking-wider">
                  Admin Tools
                </div>

                <Link href="/admin/users" onClick={() => setIsOpen(false)}>
                  <button className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-medium text-foreground hover:bg-muted/80 dark:hover:bg-slate-900 transition-colors cursor-pointer text-left group">
                    <div className="w-6 h-6 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                      <ShieldCheck className="w-3.5 h-3.5" />
                    </div>
                    <span className="font-semibold text-foreground">User Management</span>
                  </button>
                </Link>

                <Link href="/dashboard" onClick={() => setIsOpen(false)}>
                  <button className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-medium text-foreground hover:bg-muted/80 dark:hover:bg-slate-900 transition-colors cursor-pointer text-left group">
                    <div className="w-6 h-6 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                      <LayoutDashboard className="w-3.5 h-3.5" />
                    </div>
                    <span className="font-semibold text-foreground">Admin Command Center</span>
                  </button>
                </Link>
              </>
            )}
          </div>

          <div className="h-px bg-border/60" />

          {/* Quick Controls & Sign Out */}
          <div className="p-2 space-y-1 bg-muted/20">
            <div className="flex items-center justify-between px-3 py-1.5 rounded-lg">
              <span className="text-xs font-medium text-muted-foreground">Color Mode</span>
              <ThemeToggle />
            </div>

            <button
              onClick={() => {
                setIsOpen(false);
                logout();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-destructive hover:bg-destructive/10 transition-colors cursor-pointer text-left"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              <span>Log out</span>
            </button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
