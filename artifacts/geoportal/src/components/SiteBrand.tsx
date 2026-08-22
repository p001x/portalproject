import { Link } from "wouter";
import { useBranding } from "@/hooks/use-branding";

interface SiteBrandProps {
  size?: "small" | "normal" | "large";
  className?: string;
  hideSubtitleOnMobile?: boolean;
}

export function SiteBrand({ size = "normal", className = "", hideSubtitleOnMobile = false }: SiteBrandProps) {
  const { siteName, siteSubtitle, logoUrl } = useBranding();

  const logoClasses = {
    small: "h-6 w-auto object-contain shrink-0 drop-shadow-sm rounded-sm",
    normal: "h-8 md:h-10 lg:h-12 w-auto object-contain shrink-0 drop-shadow-md rounded-md",
    large: "h-12 md:h-16 w-auto object-contain shrink-0 drop-shadow-md rounded-md"
  }[size];

  const titleClasses = {
    small: "font-bold text-sm leading-tight tracking-wide text-foreground",
    normal: "font-bold text-base md:text-lg leading-tight tracking-wide text-foreground",
    large: "font-bold text-xl md:text-3xl leading-tight tracking-wide text-foreground"
  }[size];
  
  const subtitleClasses = {
    small: "hidden",
    normal: `text-[10px] md:text-xs font-medium tracking-widest text-emerald-600 uppercase ${hideSubtitleOnMobile ? 'hidden sm:block' : ''}`,
    large: `text-xs md:text-sm font-medium tracking-widest text-emerald-600 uppercase ${hideSubtitleOnMobile ? 'hidden sm:block' : ''}`
  }[size];

  return (
    <Link href="/">
      <div className={`flex items-center gap-2 md:gap-3 cursor-pointer hover:opacity-90 transition-opacity ${className}`}>
        <img src={logoUrl || "/logo.png"} alt={`${siteName} Logo`} className={logoClasses} />
        <div>
          <div className={titleClasses}>{siteName || "SPETRO"}</div>
          {size !== "small" && <div className={subtitleClasses}>{siteSubtitle || "Geoportal Analysis"}</div>}
        </div>
      </div>
    </Link>
  );
}

export function SiteLogoOnly({ size = "small", className = "" }: { size?: "small" | "normal", className?: string }) {
  const { logoUrl, siteName } = useBranding();
  const logoClasses = {
    small: "h-6 w-auto grayscale opacity-70",
    normal: "h-10 w-auto object-contain"
  }[size];
  
  return (
    <Link href="/">
      <img src={logoUrl || "/logo.png"} alt={`${siteName} Logo`} className={`${logoClasses} cursor-pointer hover:opacity-90 transition-opacity ${className}`} />
    </Link>
  );
}
