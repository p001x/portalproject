import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ShieldAlert, Send, CheckCircle2, AlertTriangle, LogOut, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api";
import { toast } from "sonner";

export function AccountBlockedDialog() {
  const { blockedInfo, setBlockedInfo, logout } = useAuth();
  const [appealMessage, setAppealMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [appealSubmitted, setAppealSubmitted] = useState(false);

  if (!blockedInfo) return null;

  const handleSubmitAppeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appealMessage.trim()) {
      toast.error("Please enter a message explaining your appeal.");
      return;
    }

    setSubmitting(true);
    try {
      await api.appeals.submit(blockedInfo.email, appealMessage.trim());
      setAppealSubmitted(true);
      toast.success("Appeal submitted successfully! Administrators will review your request.");
    } catch (err: any) {
      toast.error(err.message || "Failed to submit appeal. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setBlockedInfo(null);
    logout();
  };

  return (
    <Dialog open={true} onOpenChange={() => handleClose()}>
      <DialogContent className="max-w-md border-red-500/30 bg-slate-950/95 text-slate-100 backdrop-blur-xl shadow-2xl p-6">
        <DialogHeader className="text-center sm:text-center">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-500 mb-2 shadow-inner">
            <ShieldAlert className="w-8 h-8 animate-pulse" />
          </div>
          <DialogTitle className="text-xl font-bold tracking-tight text-white flex items-center justify-center gap-2">
            Account Suspended
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-400">
            Access to interactive features and community forums has been restricted by administration.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 my-2">
          {/* Reason Card */}
          <div className="p-3.5 rounded-xl bg-red-950/30 border border-red-500/20 text-xs space-y-1">
            <div className="flex items-center gap-1.5 font-semibold text-red-400">
              <AlertTriangle className="w-3.5 h-3.5" />
              Reason for Suspension:
            </div>
            <p className="text-slate-300 leading-relaxed pl-5">
              "{blockedInfo.reason || "Suspended due to community standard violations or platform misuse."}"
            </p>
          </div>

          {/* User Email Pill */}
          <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-slate-400">
            <span>Account:</span>
            <span className="font-mono text-slate-200">{blockedInfo.email}</span>
          </div>

          {/* Appeal Section */}
          {appealSubmitted ? (
            <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/30 text-center space-y-2">
              <div className="mx-auto w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <p className="text-xs font-semibold text-emerald-300">Appeal Submitted to Administrators</p>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Your explanation has been queued in the moderation inbox. You will receive an email and system notification once our team reviews your appeal.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmitAppeal} className="space-y-2.5">
              <label className="text-[11px] font-semibold text-slate-300 flex items-center justify-between">
                <span>Submit an Appeal</span>
                <span className="text-[10px] text-slate-500">Admins review within 24h</span>
              </label>
              <Textarea
                placeholder="Explain what occurred or why you believe your account should be reinstated..."
                value={appealMessage}
                onChange={(e) => setAppealMessage(e.target.value)}
                rows={4}
                className="resize-none text-xs bg-slate-900/90 border-slate-700/60 focus:border-red-500 text-slate-100 placeholder:text-slate-500"
                disabled={submitting}
              />
              <Button
                type="submit"
                disabled={submitting || !appealMessage.trim()}
                className="w-full bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-semibold text-xs h-9 gap-1.5 shadow-md shadow-red-950/50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Submitting Appeal...
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    Send Appeal to Admin
                  </>
                )}
              </Button>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="pt-2 border-t border-slate-800/80 flex items-center justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClose}
            className="text-xs text-slate-400 hover:text-white hover:bg-slate-900 gap-1.5"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
