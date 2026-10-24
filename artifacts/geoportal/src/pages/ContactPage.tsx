import { useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Mail, MapPin, MessageSquare, Send, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserNav } from "@/components/UserNav";
import { SiteBrand } from "@/components/SiteBrand";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

export function ContactPage() {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("General Inquiry");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !message.trim()) {
      toast({
        variant: "destructive",
        title: "Missing Fields",
        description: "Please fill out all required fields.",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await api.contact.send({
        name: name.trim(),
        email: email.trim(),
        subject,
        message: message.trim(),
      });
      setIsSuccess(true);
      toast({
        title: "Message Delivered!",
        description: "Our administration team has received your message and will respond shortly.",
      });
      setName("");
      setEmail("");
      setMessage("");
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Submission Error",
        description: err.message || "Could not send message. Please try again or email us directly.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans">
      {/* Header */}
      <header className="bg-card/80 backdrop-blur-md border-b border-border sticky top-0 z-50 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <Link href="/">
            <button className="p-2 hover:bg-muted rounded-full transition-colors group">
              <ArrowLeft className="w-5 h-5 text-muted-foreground group-hover:text-foreground" />
            </button>
          </Link>
          <SiteBrand size="normal" hideSubtitleOnMobile />
        </div>
        <div className="flex items-center gap-3">
          <UserNav />
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full pb-20">
        <section className="relative overflow-hidden bg-muted/30 pt-24 pb-16 px-6 border-b">
          <div className="max-w-4xl mx-auto text-center space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">
              Contact Us
            </h1>
            <p className="text-base text-muted-foreground max-w-xl mx-auto leading-relaxed">
              Have questions regarding data integrations, analysis modules, or organizational subscriptions? Get in touch with our leadership and engineering team.
            </p>
          </div>
        </section>

        <section className="max-w-5xl mx-auto px-6 py-16">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            
            {/* Contact Information */}
            <div className="space-y-8">
              <div>
                <h2 className="text-3xl font-bold mb-4">Contact Information</h2>
                <p className="text-muted-foreground leading-relaxed">
                  Reach out to our geospatial engineering leadership through any of the channels below. We look forward to discussing your technical and analytical requirements.
                </p>
              </div>

              <div className="space-y-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-emerald-500/10 text-emerald-600 rounded-xl flex items-center justify-center shrink-0">
                    <Mail className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">Direct Leadership Contact</h3>
                    <p className="text-muted-foreground mb-1">Executive &amp; Advisory Team:</p>
                    <div className="space-y-1">
                      <div>
                        <a href="mailto:pierrendorimana16@gmail.com" className="text-emerald-600 hover:text-emerald-500 font-medium transition-colors">
                          pierrendorimana16@gmail.com
                        </a>
                      </div>
                      <div>
                        <a href="mailto:petersonyang8@gmail.com" className="text-emerald-600 hover:text-emerald-500 font-medium transition-colors">
                          petersonyang8@gmail.com
                        </a>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-blue-500/10 text-blue-600 rounded-xl flex items-center justify-center shrink-0">
                    <MapPin className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">Our Location</h3>
                    <p className="text-muted-foreground">
                      Kigali, Rwanda
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-purple-500/10 text-purple-600 rounded-xl flex items-center justify-center shrink-0">
                    <MessageSquare className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">Community &amp; Support</h3>
                    <p className="text-muted-foreground mb-2">Join our user community for rapid assistance and peer discussions.</p>
                    <Link href="/community">
                      <Button variant="outline" size="sm">Visit Forums</Button>
                    </Link>
                  </div>
                </div>
              </div>
            </div>

            {/* Contact Form */}
            <div className="bg-card border p-8 rounded-2xl shadow-sm">
              <h3 className="text-2xl font-bold mb-6">Send us a Message</h3>
              
              {isSuccess ? (
                <div className="py-12 flex flex-col items-center justify-center text-center space-y-4 animate-in fade-in">
                  <div className="w-16 h-16 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <h4 className="text-xl font-bold">Message Received</h4>
                  <p className="text-sm text-muted-foreground max-w-sm">
                    Thank you for contacting SPETRO. Our senior geospatial team has received your message and will review your request promptly.
                  </p>
                  <Button variant="outline" onClick={() => setIsSuccess(false)} className="mt-4">
                    Send Another Message
                  </Button>
                </div>
              ) : (
                <form className="space-y-4" onSubmit={handleSubmit}>
                  <div className="space-y-2">
                    <label htmlFor="name" className="text-sm font-semibold">Full Name</label>
                    <input 
                      type="text" 
                      id="name" 
                      className="w-full bg-background border rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                      placeholder="John Doe"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <label htmlFor="email" className="text-sm font-semibold">Your Email Address</label>
                    <input 
                      type="email" 
                      id="email" 
                      className="w-full bg-background border rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                      placeholder="john@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="subject" className="text-sm font-semibold">Subject</label>
                    <select 
                      id="subject"
                      className="w-full bg-background border rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                    >
                      <option>General Inquiry</option>
                      <option>Enterprise Licensing &amp; Custom Modules</option>
                      <option>Technical Support &amp; Script Migration</option>
                      <option>Academic &amp; Research Partnerships</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="message" className="text-sm font-semibold">Message</label>
                    <textarea 
                      id="message" 
                      rows={4}
                      className="w-full bg-background border rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none text-sm"
                      placeholder="How can our team help you today?"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      required
                    ></textarea>
                  </div>

                  <Button 
                    type="submit" 
                    disabled={isSubmitting}
                    className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-2 mt-4"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Sending Message...
                      </>
                    ) : (
                      <>
                        Send Message <Send className="w-4 h-4" />
                      </>
                    )}
                  </Button>
                </form>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* Global Footer */}
      <footer className="bg-card border-t border-border mt-auto w-full">
        <div className="max-w-6xl mx-auto px-8 py-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="SPETRO Logo" className="h-6 w-auto grayscale opacity-70" />
            <span className="text-sm font-medium text-muted-foreground">
              &copy; {new Date().getFullYear()} SPETRO Geoportal. All rights reserved.
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
