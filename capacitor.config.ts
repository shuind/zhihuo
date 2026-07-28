import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.zhihuo.app",
  appName: "知惑",
  webDir: "out",
  server: {
    androidScheme: "https"
  },
  plugins: {
    App: {
      disableBackButtonHandler: false
    },
    StatusBar: {
      overlaysWebView: true,
      style: "DARK"
    }
  }
};

export default config;
