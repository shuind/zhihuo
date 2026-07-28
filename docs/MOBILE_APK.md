# Android APK Build

This project uses Capacitor as a native Android shell around the static mobile web build.

## Build Web Assets And Sync Android

```powershell
$env:NEXT_PUBLIC_API_BASE_URL="https://your-domain.example"
pnpm build:mobile
```

`build:mobile` temporarily excludes `app/v1` during static export because the APK packages only the client. The server API still lives in the normal Next deployment.

## Build Debug APK

Install Android Studio (including its bundled Java 21 runtime) or the Android command-line SDK first, then set one of:

```powershell
$env:ANDROID_HOME="C:\Users\<you>\AppData\Local\Android\Sdk"
```

or create `android/local.properties`:

```properties
sdk.dir=C:\\Users\\<you>\\AppData\\Local\\Android\\Sdk
```

Then run:

```powershell
pnpm build:android:debug
```

The build script requires Java 21 or newer. It uses a compatible `JAVA_HOME` / `ANDROID_STUDIO_JDK` when configured and can automatically find the standard Android Studio JBR location on Windows, macOS, and Linux.

The debug APK will be generated under `android/app/build/outputs/apk/debug/`.

## Android Shell Behavior

- System Back closes the top dialog or sheet first, then leaves a thinking/detail view, then returns to the Time layer, and finally minimizes the app.
- The first account-binding choice cannot be accidentally dismissed with Back.
- Predictive Back is enabled in the Android manifest for API 33+.
- Status-bar icon contrast follows the current layer: light icons on the Time layer, dark icons on Thinking and Settings.
- The WebView consumes the top/side/bottom safe-area insets. Android 16 edge-to-edge mode therefore does not place headers under the status bar.
- The launch theme uses the Time layer's deep-black background and the existing Zhihuo tree mark, avoiding the former white Capacitor placeholder flash.

## Cloud Sync From APK

The deployed server must allow the Capacitor origin:

```env
APP_CORS_ORIGINS=https://localhost,capacitor://localhost
```

Guest offline mode works without the API base URL. Login and cloud sync require `NEXT_PUBLIC_API_BASE_URL` to point at the deployed HTTPS backend when building the APK.

## Publish An APK Download Page

This repo now includes an `/apk` page for end users.

You can publish the actual file in either of these ways:

1. Put the APK at:

```text
public/downloads/zhihuo-latest.apk
```

The page will automatically expose it at `/downloads/zhihuo-latest.apk`.

2. Or point the page at an external file URL during build/deploy:

```powershell
$env:NEXT_PUBLIC_APK_DOWNLOAD_URL="https://your-domain.example/files/zhihuo-latest.apk"
$env:NEXT_PUBLIC_APK_VERSION="v1.0.0"
$env:NEXT_PUBLIC_APK_UPDATED_AT="2026-04-17"
$env:NEXT_PUBLIC_APK_SIZE="18.6 MB"
```

`NEXT_PUBLIC_APK_*` values are injected at build time, so changing them requires a rebuild/redeploy.
