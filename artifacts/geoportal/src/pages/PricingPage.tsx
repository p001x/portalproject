import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Briefcase, Calendar, CheckCircle2, ChevronRight, Clock, GraduationCap, Map, MessageSquare, Phone } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'wouter';

export function PricingPage() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedService, setSelectedService] = useState("");
  const [preferredDate, setPreferredDate] = useState("");
  const [preferredTimeSlot, setPreferredTimeSlot] = useState("Afternoon (13:00 - 17:00)");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const requestMutation = useMutation({
    mutationFn: () => {
      const details: string[] = [];
      if (preferredDate) details.push(`📅 Proposed Date: ${preferredDate}`);
      if (preferredTimeSlot) details.push(`⏰ Proposed Time Slot: ${preferredTimeSlot}`);
      if (phoneNumber.trim()) details.push(`📞 Phone / WhatsApp: ${phoneNumber.trim()}`);
      
      const headerSection = details.length > 0 ? details.join("\n") + "\n\n" : "";
      const fullMessage = `${headerSection}Requirements / Topics to Discuss:\n${message.trim() || "No additional notes provided."}`;

      return api.services.requestService({
        service_type: selectedService,
        message: fullMessage
      });
    },
    onSuccess: () => {
      setSubmitted(true);
      toast({
        title: "Request Sent!",
        description: "We have received your proposed time slot and will confirm directly via email.",
      });
      setTimeout(() => {
        setIsDialogOpen(false);
        setSubmitted(false);
        setMessage("");
        setPhoneNumber("");
        setPreferredDate("");
      }, 3500);
    },
    onError: (err: any) => {
      toast({
        variant: "destructive",
        title: "Submission Failed",
        description: err.message || "Something went wrong. Please try again.",
      });
    }
  });

  const handleBookClick = (serviceType: string) => {
    setSelectedService(serviceType);
    setIsDialogOpen(true);
    setSubmitted(false);
    setMessage("");
    setPhoneNumber("");
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setPreferredDate(tomorrow.toISOString().split("T")[0]);
    setPreferredTimeSlot("Afternoon (13:00 - 17:00)");
  };

  return (
    <div className="h-full w-full overflow-y-auto bg-[#080d14] py-20 px-4 sm:px-6 lg:px-8">
      {/* Page Header */}
      <div className="text-center mb-16">
        <h1 className="text-4xl font-extrabold text-white sm:text-5xl tracking-tight">
          Geospatial Expertise <span className="text-[#0cf6bd]">On Demand</span>
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-slate-400 mx-auto">
          Choose the right level of support for your team. From 1-on-1 debugging to full enterprise pipelines.
        </p>
      </div>

      {/* Pricing Cards Grid */}
      <div className="max-w-7xl mx-auto grid gap-8 lg:grid-cols-3 lg:gap-12">
        
        {/* CARD 1: 1-on-1 Consultation */}
        <Card className="relative w-full overflow-hidden rounded-2xl border border-[#1c293e] bg-[#141d2b] p-8 shadow-xl transition-all duration-300 hover:border-[#0cf6bd]/30 hover:shadow-[#0cf6bd]/10 hover:-translate-y-1">
          <Briefcase className="absolute right-0 top-8 h-48 w-48 -translate-y-8 translate-x-12 stroke-[0.5] text-white/[0.03]" />
          <div className="relative z-10 flex flex-col h-full">
            <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-xl bg-[#0f2e2d]">
              <Briefcase className="h-7 w-7 text-[#0cf6bd]" strokeWidth={1.5} />
            </div>
            <h2 className="mb-3 text-2xl font-bold text-white tracking-tight">1-on-1 Consultation</h2>
            <p className="mb-6 text-[15px] leading-relaxed text-slate-400 min-h-[60px]">
              Personalized direct guidance on geospatial analysis, GEE algorithm debugging, or project architecture.
            </p>
            <div className="mb-8 flex items-baseline gap-2 flex-wrap">
              <span className="text-3xl font-extrabold text-white">$150</span>
              <span className="text-slate-400 text-sm">/ hr</span>
            </div>
            <ul className="mb-10 flex flex-col gap-4">
              {['Direct Live Pair-Programming & GEE Debugging', 'Geospatial Data Sourcing Strategy', 'Cloud Architecture & API Integration Review', 'Includes Written Action Plan & Code Samples'].map((feature) => (
                <li key={feature} className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[#0cf6bd]" strokeWidth={2} />
                  <span className="text-[15px] leading-snug text-[#94a3b8]">{feature}</span>
                </li>
              ))}
            </ul>
            <div className="mt-auto pt-2 flex flex-col items-center w-full">
              <Button
                onClick={() => handleBookClick("1-on-1 Consultation")}
                className="w-full rounded-xl bg-[#0cf6bd] py-6 text-base font-semibold text-teal-950 hover:bg-[#0ae3ad] transition-colors shadow-lg shadow-[#0cf6bd]/20 cursor-pointer flex items-center justify-center gap-2"
              >
                Schedule Consultation <ChevronRight className="ml-1 h-5 w-5" strokeWidth={2.5} />
              </Button>
              <span className="mt-3 text-xs text-slate-400 text-center leading-tight">Dedicated 1-on-1 session with senior GIS engineers.</span>
            </div>
          </div>
        </Card>

        {/* CARD 2: Corporate Training (Highlighted) */}
        <Card className="relative w-full overflow-hidden rounded-2xl border border-[#0cf6bd] bg-[#141d2b] p-8 shadow-2xl shadow-[#0cf6bd]/10 transition-all duration-300 hover:-translate-y-1 lg:scale-105 z-10">
          {/* Highlight Badge */}
          <div className="absolute top-0 right-0 bg-[#0cf6bd] px-4 py-1 rounded-bl-xl text-teal-950 font-bold text-xs uppercase tracking-wider">
            Most Popular
          </div>
          
          <GraduationCap className="absolute right-0 top-8 h-48 w-48 -translate-y-8 translate-x-12 stroke-[0.5] text-white/[0.03]" />
          <div className="relative z-10 flex flex-col h-full">
            <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-xl bg-[#0f2e2d]">
              <GraduationCap className="h-7 w-7 text-[#0cf6bd]" strokeWidth={1.5} />
            </div>
            <h2 className="mb-3 text-2xl font-bold text-white tracking-tight">Live Team Workshops</h2>
            <p className="mb-6 text-[15px] leading-relaxed text-slate-400 min-h-[60px]">
              Comprehensive workshops for teams wanting to master Python, QGIS, and Earth Engine.
            </p>
            <div className="mb-8">
              <span className="text-2xl font-bold text-white">Custom Quote</span>
            </div>
            <ul className="mb-12 flex flex-col gap-4">
              {['Tailored curriculum for your industry', 'Hands-on exercises and real-world datasets', 'Interactive Q&A and post-training support', 'Certification of Completion'].map((feature) => (
                <li key={feature} className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[#0cf6bd]" strokeWidth={2} />
                  <span className="text-[15px] leading-snug text-[#94a3b8]">{feature}</span>
                </li>
              ))}
            </ul>
            <div className="mt-auto pt-2 flex flex-col items-center">
              <Link href="/academy" className="w-full">
                <Button className="w-full rounded-xl bg-[#0cf6bd] py-6 text-base font-semibold text-teal-950 hover:bg-[#0ae3ad] transition-colors shadow-lg shadow-[#0cf6bd]/20">
                  Access Studies & Books <ChevronRight className="ml-1 h-5 w-5" strokeWidth={2.5} />
                </Button>
              </Link>
              <span className="mt-3 text-xs text-slate-400 font-medium">Hands-on technical workshops for teams and research groups.</span>
            </div>
          </div>
        </Card>

        {/* CARD 3: Enterprise Solutions */}
        <Card className="relative w-full overflow-hidden rounded-2xl border border-[#1c293e] bg-[#141d2b] p-8 shadow-xl transition-all duration-300 hover:border-[#0cf6bd]/30 hover:shadow-[#0cf6bd]/10 hover:-translate-y-1">
          <Map className="absolute right-0 top-8 h-48 w-48 -translate-y-8 translate-x-12 stroke-[0.5] text-white/[0.03]" />
          <div className="relative z-10 flex flex-col h-full">
            <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-xl bg-[#0f2e2d]">
              <Map className="h-7 w-7 text-[#0cf6bd]" strokeWidth={1.5} />
            </div>
            <h2 className="mb-3 text-2xl font-bold text-white tracking-tight">Enterprise Solutions</h2>
            <p className="mb-6 text-[15px] leading-relaxed text-slate-400 min-h-[60px]">
              Let our experts build bespoke, AI-powered spatial models and automated data pipelines.
            </p>
            <div className="mb-8">
              <span className="text-2xl font-bold text-white">Project Based</span>
            </div>
            <ul className="mb-12 flex flex-col gap-4">
              {['Scalable ML model deployment', 'Near real-time environmental monitoring', 'High-resolution drone & satellite integration', 'Fully deployed, white-labeled Geoportals'].map((feature) => (
                <li key={feature} className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[#0cf6bd]" strokeWidth={2} />
                  <span className="text-[15px] leading-snug text-[#94a3b8]">{feature}</span>
                </li>
              ))}
            </ul>
            <div className="mt-auto pt-2 flex flex-col items-center">
              <Button
                onClick={() => handleBookClick("Enterprise Solutions")}
                className="w-full rounded-xl bg-slate-800 py-6 text-base font-semibold text-white hover:bg-slate-700 transition-colors border border-slate-700 cursor-pointer"
              >
                Contact Sales <ChevronRight className="ml-1 h-5 w-5" strokeWidth={2.5} />
              </Button>
              <span className="mt-3 text-xs text-slate-400">Enterprise SLA and bespoke production modeling.</span>
            </div>
          </div>
        </Card>

      </div>

      {/* Booking Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[520px] bg-[#141d2b] border-[#1c293e] text-white">
          <DialogHeader>
            <DialogTitle className="text-2xl flex items-center gap-2 text-white">
              <MessageSquare className="w-6 h-6 text-[#0cf6bd]" />
              Book {selectedService}
            </DialogTitle>
            <DialogDescription className="text-sm pt-1 text-slate-400">
              Schedule a dedicated technical advisory session. Propose your preferred date & time, and our engineering team will confirm your meeting details directly via email.
            </DialogDescription>
          </DialogHeader>

          {!submitted ? (
            <div className="space-y-4 py-3">
              {/* Proposed Date & Time Slot */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-[#0cf6bd]" /> Proposed Date
                  </label>
                  <Input 
                    type="date"
                    min={new Date().toISOString().split("T")[0]}
                    className="bg-[#0d131f] border-[#1c293e] text-white focus:border-[#0cf6bd] focus:ring-[#0cf6bd]/20 h-10 text-sm [color-scheme:dark] cursor-pointer"
                    value={preferredDate}
                    onChange={(e) => setPreferredDate(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-[#0cf6bd]" /> Proposed Time Slot
                  </label>
                  <select 
                    className="w-full rounded-md border border-[#1c293e] bg-[#0d131f] px-3 py-2 text-sm text-white focus:border-[#0cf6bd] focus:outline-none focus:ring-1 focus:ring-[#0cf6bd] h-10 cursor-pointer"
                    value={preferredTimeSlot}
                    onChange={(e) => setPreferredTimeSlot(e.target.value)}
                  >
                    <option value="Morning (09:00 - 12:00)">Morning (09:00 - 12:00)</option>
                    <option value="Early Afternoon (12:00 - 15:00)">Early Afternoon (12:00 - 15:00)</option>
                    <option value="Late Afternoon (15:00 - 18:00)">Late Afternoon (15:00 - 18:00)</option>
                    <option value="Evening (18:00 - 21:00)">Evening (18:00 - 21:00)</option>
                  </select>
                </div>
              </div>

              {/* Phone / WhatsApp (Optional) */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-[#0cf6bd]" /> Phone / WhatsApp (Optional)
                </label>
                <Input 
                  placeholder="+250 788 ... (or leave blank to communicate via email only)"
                  className="bg-[#0d131f] border-[#1c293e] text-white placeholder:text-slate-500 focus:border-[#0cf6bd] focus:ring-[#0cf6bd]/20 h-10 text-sm"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                />
              </div>

              {/* Message / Topics */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">What would you like to discuss or debug?</label>
                <Textarea 
                  placeholder="e.g. I need help migrating my QGIS workflow to Google Earth Engine, or debugging classification..."
                  className="min-h-[100px] resize-none bg-[#0d131f] border-[#1c293e] text-white placeholder:text-slate-500 focus:border-[#0cf6bd] focus:ring-[#0cf6bd]/20 text-sm"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </div>

              <Button 
                className="w-full bg-[#0cf6bd] text-teal-950 font-semibold hover:bg-[#0ae3ad] transition-colors py-5 cursor-pointer" 
                onClick={() => requestMutation.mutate()}
                disabled={requestMutation.isPending || (!message.trim() && !preferredDate)}
              >
                {requestMutation.isPending ? "Sending Request..." : "Submit Consultation Request"}
              </Button>
            </div>
          ) : (
            <div className="py-10 flex flex-col items-center justify-center text-center space-y-3">
              <div className="w-14 h-14 bg-[#0cf6bd]/10 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-7 h-7 text-[#0cf6bd]" />
              </div>
              <h3 className="text-lg font-bold text-white">Consultation Request Received</h3>
              <p className="text-slate-400 text-sm max-w-sm">We have received your proposed schedule and requirements. Our engineering team will review and confirm your session details directly via email.</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
