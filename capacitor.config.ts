import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.futlink.app',
  appName: 'FutLink',
  webDir: 'frontend/dist',
  plugins: {
    // Use the native HTTP stack in Android/iOS WebViews for LAN API calls.
    CapacitorHttp: { enabled: true },
  },
  ios: { preferredContentMode: 'mobile' },
};

export default config;
