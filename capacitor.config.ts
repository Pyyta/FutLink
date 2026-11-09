import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.futlink.app',
  appName: 'FutLink',
  webDir: 'frontend/dist',
  ios: { preferredContentMode: 'mobile' },
};

export default config;
