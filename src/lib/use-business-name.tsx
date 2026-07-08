'use client';

import { useState, useEffect, createContext, useContext, ReactNode, useCallback } from 'react';
import { getBusinessName, setBusinessName, getBusinessPhone, setBusinessPhone } from './business-config';

interface BusinessConfig {
  businessName: string;
  businessPhone: string;
  loading: boolean;
  refreshBusinessName: () => void;
}

const defaultConfig: BusinessConfig = {
  businessName: 'AL-FALAH TRADERS',
  businessPhone: '',
  loading: true,
  refreshBusinessName: () => {},
};

const BusinessConfigContext = createContext<BusinessConfig>(defaultConfig);

export function BusinessConfigProvider({ children }: { children: ReactNode }) {
  // Initialize from localStorage so the correct name shows immediately on refresh
  // (no flash of default "AL-FALAH TRADERS" before API responds)
  const [config, setConfig] = useState<Omit<BusinessConfig, 'refreshBusinessName'>>(() => ({
    businessName: getBusinessName(),
    businessPhone: getBusinessPhone(),
    loading: true,
  }));

  const refreshBusinessName = useCallback(() => {
    async function load() {
      try {
        const res = await fetch('/api/config');
        if (res.ok) {
          const data = await res.json();
          const businessName = data.config?.businessName || 'AL-FALAH TRADERS';
          const businessPhone = data.config?.businessPhone || '';
          setConfig({ businessName, businessPhone, loading: false });
          setBusinessName(businessName);
          setBusinessPhone(businessPhone);
        }
      } catch {
        // silent
      }
    }
    load();
  }, []);

  useEffect(() => {
    // Initial load
    refreshBusinessName();

    // Listen for custom event when business name is updated from Settings
    const handleBusinessNameUpdate = () => {
      refreshBusinessName();
    };
    window.addEventListener('business-name-updated', handleBusinessNameUpdate);

    return () => {
      window.removeEventListener('business-name-updated', handleBusinessNameUpdate);
    };
  }, [refreshBusinessName]);

  return (
    <BusinessConfigContext.Provider value={{ ...config, refreshBusinessName }}>
      {children}
    </BusinessConfigContext.Provider>
  );
}

export function useBusinessName() {
  return useContext(BusinessConfigContext);
}
