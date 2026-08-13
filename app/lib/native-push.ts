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
    const { PushNotifications } = await import("@capacitor/push-notifications");

    let permission = await PushNotifications.checkPermissions();
    if (permission.receive === "prompt" || permission.receive === "prompt-with-rationale") {
      permission = await PushNotifications.requestPermissions();
    }

    if (permission.receive !== "granted") {
      return { supported: true, granted: false };
    }

    await PushNotifications.removeAllListeners();

    await PushNotifications.addListener("registration", (token) => {
      void saveToken(token.value);
    });

    await PushNotifications.addListener("registrationError", (error) => {
      console.error("Push registration failed:", error);
    });

    await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      const memberId = Number(action.notification.data?.memberId);
      if (Number.isInteger(memberId) && memberId > 0) {
        openMember(memberId);
      }
    });

    await PushNotifications.register();
    return { supported: true, granted: true };
  } catch (error) {
    console.error("Push setup failed:", error);
    return { supported: true, granted: false };
  }
}
