import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.zhihuo.app",
  appName: "知惑",
  webDir: "out",
  server: {
    androidScheme: "https"
  }
};

export default config;
