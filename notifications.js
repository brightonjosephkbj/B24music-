import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";

// Controls how a notification behaves while the app is open in foreground.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Single entry point covering both use cases:
//  - Android: grants POST_NOTIFICATIONS, which is what actually lets the
//    lock-screen playback notification (expo-audio foreground service)
//    show on Android 13+, same permission as push.
//  - iOS: authorizes alert/sound/badge for push specifically - lock-screen
//    audio controls there are separate and already covered by
//    UIBackgroundModes: audio, so nothing extra needed on iOS for that part.
//
// Returns the Expo push token, or null if permission was denied or no
// EAS project id is configured yet (run `npx eas init` once to add it -
// permission still gets requested/granted either way, just no token yet).
export async function registerForPushNotificationsAsync() {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "B24music",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  if (!Device.isDevice) {
    return null; // simulators/emulators can't receive push anyway
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== "granted") {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }
  if (status !== "granted") {
    return null; // user declined - degrade quietly, don't nag
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) {
    console.log("[notifications] permission granted, but no EAS project id yet - run `npx eas init`");
    return null;
  }

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    return token;
  } catch (err) {
    console.warn("[notifications] failed to get push token:", err);
    return null;
  }
}
