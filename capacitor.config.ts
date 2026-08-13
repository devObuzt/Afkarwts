import type { CapacitorConfig } from "@capacitor/cli";

// The native shell loads the live site, so web changes ship without an app
// store review. Native layers add push notifications and badge counts.
const config: CapacitorConfig = {
  appId: "com.afkar.heartbeat",
  appName: "Afk HeartBeat",
  webDir: "public",
  server: {
    url: "https://www.afkarheartbeat.com",
    cleartext: false
  },
  ios: {
    contentInset: "always"
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"]
    }
  }
};

export default config;
