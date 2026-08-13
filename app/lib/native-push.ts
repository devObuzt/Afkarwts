"use client";

type NativeWindow = Window & {
  Capacitor?: {
    isNativePlatform?: () => boolean;
    getPlatform?: () => string;
  };
};

export function isNativeApp() {
  if (typeof window === "undefined") return false;
  return Boolean((window as NativeWindow).Capacitor?.isNativePlatform?.());
}

export function nativePlatform() {
  if (typeof window === "undefined") return "web";
  return (window as NativeWindow).Capacitor?.getPlatform?.() ?? "web";
}

async function saveToken(token: string) {
  await fetch("/api/devices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, platform: nativePlatform(), label: "" })
  });
}

// Registers this device for push and routes notification taps to the chat.
// No-ops on the plain web app.
export async function setupNativePush(openMember: (memberId: number) => void) {
  if (!isNativeApp()) {
    return { supported: false, granted: false };
  }

  try {
    // FirebaseMessaging yields FCM tokens on both platforms, which is what the
    // server sends through.
    const { FirebaseMessaging } = await import("@capacitor-firebase/messaging");

    let permission = await FirebaseMessaging.checkPermissions();
    if (permission.receive === "prompt" || permission.receive === "prompt-with-rationale") {
      permission = await FirebaseMessaging.requestPermissions();
    }

    if (permission.receive !== "granted") {
      return { supported: true, granted: false };
    }

    await FirebaseMessaging.removeAllListeners();

    await FirebaseMessaging.addListener("tokenReceived", (event) => {
      if (event.token) void saveToken(event.token);
    });

    await FirebaseMessaging.addListener("notificationActionPerformed", (action) => {
      const data = action.notification.data as { memberId?: string | number } | undefined;
      const memberId = Number(data?.memberId);
      if (Number.isInteger(memberId) && memberId > 0) {
        openMember(memberId);
      }
    });

    const { token } = await FirebaseMessaging.getToken();
    if (token) await saveToken(token);

    return { supported: true, granted: true };
  } catch (error) {
    console.error("Push setup failed:", error);
    return { supported: true, granted: false };
  }
}
