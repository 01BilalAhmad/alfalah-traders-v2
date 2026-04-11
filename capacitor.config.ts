import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.alfalah.traders',
  appName: 'Al-Falah Traders',
  webDir: 'capacitor-app',
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#1E3A8A',
      showSpinner: true,
      spinnerColor: '#ffffff',
      androidScaleType: 'CENTER_CROP',
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#1E3A8A',
    },
  },
};

export default config;
