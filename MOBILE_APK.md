# Android APK Build

This project uses Capacitor as a native Android shell around the static mobile web build.

## Build Web Assets And Sync Android

```powershell
$env:NEXT_PUBLIC_API_BASE_URL="https://your-domain.example"
pnpm build:mobile
```

`build:mobile` temporarily excludes `app/v1` during static export because the APK packages only the client. The server API still lives in the normal Next deployment.

## Build Debug APK

Install Android Studio or the Android command-line SDK first, then set one of:

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

The debug APK will be generated under `android/app/build/outputs/apk/debug/`.

## Cloud Sync From APK

The deployed server must allow the Capacitor origin:

```env
APP_CORS_ORIGINS=https://localhost,capacitor://localhost
```

Guest offline mode works without the API base URL. Login and cloud sync require `NEXT_PUBLIC_API_BASE_URL` to point at the deployed HTTPS backend when building the APK.
