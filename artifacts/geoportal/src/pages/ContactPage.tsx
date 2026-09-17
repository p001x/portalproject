import { Link } from "wouter";
import { ArrowLeft, Mail, MapPin, Phone, MessageSquare, Send } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";

export function ContactPage() {
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
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="SPETRO Logo" className="h-10 w-auto object-contain shrink-0 drop-shadow-md rounded-md" />
            <div>
              <h1 className="font-bold text-lg leading-tight tracking-wide text-foreground">SPETRO</h1>
              <p className="text-xs font-medium tracking-widest text-emerald-600 uppercase">Geoportal Analysis</p>
            </div>
          </div>
        </div>
        <ThemeToggle />
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full pb-20">
        <section className="relative overflow-hidden bg-muted/30 pt-24 pb-16 px-6 border-b">
          <div className="max-w-4xl mx-auto text-center space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-foreground leading-tight">
              Get in <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-blue-600">Touch</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              We're here to answer any questions you have about our spatial intelligence platform, enterprise solutions, or technical integrations.
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
                  Reach out to us directly through any of the channels below. Our team aims to respond to all inquiries within 24 hours.
                </p>
              </div>

              <div className="space-y-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-emerald-500/10 text-emerald-600 rounded-xl flex items-center justify-center shrink-0">
                    <Mail className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">Email Us</h3>
                    <p className="text-muted-foreground mb-1">For general inquiries and support:</p>
                    <a href="mailto:pierrendorimana16@gmail.com" className="text-emerald-600 hover:text-emerald-500 font-medium transition-colors">
                      pierrendorimana16@gmail.com
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-blue-500/10 text-blue-600 rounded-xl flex items-center justify-center shrink-0">
                    <MapPin className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">Our Office</h3>
                    <p className="text-muted-foreground">
                      Kigali, Rwanda<br />
                      Global Operations Center
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-purple-500/10 text-purple-600 rounded-xl flex items-center justify-center shrink-0">
                    <MessageSquare className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">Community & Support</h3>
                    <p className="text-muted-foreground mb-2">Join our user community for rapid assistance.</p>
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
              <form className="space-y-4" onSubmit={(e) => {
                e.preventDefault();
                alert("Thank you for your message. We will get back to you shortly.");
              }}>
                <div className="space-y-2">
                  <label htmlFor="name" className="text-sm font-semibold">Full Name</label>
                  <input 
                    type="text" 
                    id="name" 
                    className="w-full bg-background border rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="John Doe"
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <label htmlFor="email" className="text-sm font-semibold">Work Email</label>
                  <input 
                    type="email" 
                    id="email" 
                    className="w-full bg-background border rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="john@company.com"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="subject" className="text-sm font-semibold">Subject</label>
                  <select 
                    id="subject"
                    className="w-full bg-background border rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option>General Inquiry</option>
                    <option>Enterprise Licensing</option>
                    <option>Technical Support</option>
                    <option>Partnership Opportunities</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label htmlFor="message" className="text-sm font-semibold">Message</label>
                  <textarea 
                    id="message" 
                    rows={4}
                    className="w-full bg-background border rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                    placeholder="How can we help you today?"
                    required
                  ></textarea>
                </div>

                <Button type="submit" className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-2 mt-4">
                  Send Message <Send className="w-4 h-4" />
                </Button>
              </form>
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
