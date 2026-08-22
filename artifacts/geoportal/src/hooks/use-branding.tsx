import { useState, useEffect } from 'react';

const BRANDING_STORAGE_KEY = 'spetro_branding';

export interface BrandingConfig {
  siteName: string;
  siteSubtitle: string;
  logoUrl: string;
}

const DEFAULT_BRANDING: BrandingConfig = {
  siteName: 'SPETRO',
  siteSubtitle: 'Geoportal Analysis',
  logoUrl: '/logo.png',
};

export function getBranding(): BrandingConfig {
  try {
    const stored = localStorage.getItem(BRANDING_STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_BRANDING, ...JSON.parse(stored) };
    }
  } catch (e) {
    // Ignore error
  }
  return DEFAULT_BRANDING;
}

export function setBranding(config: Partial<BrandingConfig>) {
  const current = getBranding();
  const next = { ...current, ...config };
  localStorage.setItem(BRANDING_STORAGE_KEY, JSON.stringify(next));
  // Dispatch custom event to notify hook
  window.dispatchEvent(new Event('branding_changed'));
}

export function useBranding() {
  const [branding, setBrandingState] = useState<BrandingConfig>(getBranding());

  useEffect(() => {
    const handleStorageChange = () => {
      setBrandingState(getBranding());
    };

    window.addEventListener('branding_changed', handleStorageChange);
    // Also listen for cross-tab changes
    window.addEventListener('storage', (e) => {
      if (e.key === BRANDING_STORAGE_KEY) {
        handleStorageChange();
      }
    });

    return () => {
      window.removeEventListener('branding_changed', handleStorageChange);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  return branding;
}
