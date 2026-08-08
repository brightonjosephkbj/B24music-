import React, { useState, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Animated,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Modal,
  Pressable,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { gatewayHeaders } from "./apiClient";

// ---------------------------------------------------------------------------
// Auth screen: dark teal header ("Hello, Welcome" / toggle button) + white
// form panel that crossfades/slides between Login and Register. Register
// has an optional security question + answer (used later for password
// recovery). "Forgot password" opens a bottom sheet that slides up over
// the screen: username -> shows their security question -> answer it ->
// on success, enter a new password.
//
// Talks to B24_Database through the gateway - same pattern as every other
// backend call in the app. On successful login/signup, stores the JWT +
// user record in AsyncStorage under "b24_auth".
// ---------------------------------------------------------------------------

const API_BASE = "https://gateway-cah4.onrender.com";
const AUTH_STORAGE_KEY = "b24_auth";

const TEAL_DARK = "#0b3d4c";
const TEAL_MID = "#0f6478";
const TEAL_BRIGHT = "#17a2c9";

async function apiLogin(username, password) {
  const res = await fetch(`${API_BASE}/api/db/users/login`, {
    method: "POST",
    headers: gatewayHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || "Login failed");
  return data.data; // { id, username, token, ... }
}

async function apiSignup(username, password, handle, securityQuestion, securityAnswer) {
  const body = { username, password, handle };
  if (securityQuestion && securityAnswer) {
    body.security_question = securityQuestion;
    body.security_answer = securityAnswer;
  }
  const res = await fetch(`${API_BASE}/api/db/users/create`, {
    method: "POST",
    headers: gatewayHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || "Sign up failed");
  return data.data;
}

async function apiGetSecurityQuestion(username) {
  const res = await fetch(
    `${API_BASE}/api/db/users/forgot-password/question/${encodeURIComponent(username)}`,
    { headers: gatewayHeaders() }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok || !data.data) {
    throw new Error("No account found with that username, or no security question was set");
  }
  return data.data; // { user_id, security_question }
}

async function apiVerifySecurityAnswer(userId, answer) {
  const res = await fetch(`${API_BASE}/api/db/users/forgot-password/verify`, {
    method: "POST",
    headers: gatewayHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ user_id: userId, answer }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || "Verification failed");
  return data.data?.valid === true;
}

async function apiResetPassword(userId, newPassword) {
  const res = await fetch(`${API_BASE}/api/db/users/reset-password`, {
    method: "POST",
    headers: gatewayHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ user_id: userId, new_password: newPassword }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || "Reset failed");
  return true;
}

// Merges a partial update (e.g. { avatar_url, username, bio }) into the
// stored auth user and re-persists it. Used after profile edits so the
// signed-in session reflects the change without a re-login.
export async function updateStoredAuth(patch) {
  const raw = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
  const user = raw ? JSON.parse(raw) : null;
  if (!user) return null;
  const updated = { ...user, ...patch };
  await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(updated));
  return updated;
}

export async function getStoredAuth() {
  const raw = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
}

export async function clearStoredAuth() {
  await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
}

// "Continue as Guest" still needs to work with every backend service, and
// every service here (api-cache, messenger) rejects requests with no valid
// JWT - there's no such thing as a truly anonymous call anymore. So a
// "skip" isn't really skipping login at all: it silently creates a real
// throwaway account and logs into it, so the user never sees a form but
// still ends up with a working token under the hood.
function randomGuestUsername() {
  const rand = Math.random().toString(36).slice(2, 10);
  return `guest_${rand}`;
}

async function provisionGuestAccount() {
  const username = randomGuestUsername();
  const password = Math.random().toString(36).slice(2, 14);
  await apiSignup(username, password, `@${username}`, "", "");
  const user = await apiLogin(username, password);
  return { ...user, isGuest: true };
}

export default function LoginScreen({ onAuthenticated, allowGuest = true }) {
  const [mode, setMode] = useState("login"); // "login" | "register"
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [handle, setHandle] = useState("");
  const [securityQuestion, setSecurityQuestion] = useState("");
  const [securityAnswer, setSecurityAnswer] = useState("");
  const [forgotVisible, setForgotVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const [error, setError] = useState(null);

  const slideAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const switchMode = (nextMode) => {
    if (nextMode === mode || loading) return;
    setError(null);
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0, duration: 140, useNativeDriver: true }),
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: nextMode === "register" ? 1 : 0,
          duration: 260,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]),
    ]).start();
    setMode(nextMode);
  };

  const handleSubmit = async () => {
    if (!username.trim() || !password.trim()) {
      setError("Username and password are required");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      if (mode === "login") {
        const user = await apiLogin(username.trim(), password);
        await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
        onAuthenticated?.(user);
      } else {
        await apiSignup(
          username.trim(),
          password,
          handle.trim() || `@${username.trim()}`,
          securityQuestion.trim(),
          securityAnswer.trim()
        );
        const user = await apiLogin(username.trim(), password);
        await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
        onAuthenticated?.(user);
      }
    } catch (e) {
      setError(e.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleGuest = async () => {
    setError(null);
    setGuestLoading(true);
    try {
      const user = await provisionGuestAccount();
      await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
      onAuthenticated?.(user);
    } catch (e) {
      setError("Couldn't start a guest session - check your connection and try again");
    } finally {
      setGuestLoading(false);
    }
  };

  const headerTranslate = slideAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -8] });

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Animated.View style={[styles.header, { transform: [{ translateY: headerTranslate }] }]}>
            <Text style={styles.headerTitle}>
              {mode === "login" ? "Hello, Welcome" : "Create Account"}
            </Text>
            <Text style={styles.headerSubtitle}>
              {mode === "login" ? "Don't have an account?" : "Already have an account?"}
            </Text>
            <TouchableOpacity
              style={styles.toggleButton}
              onPress={() => switchMode(mode === "login" ? "register" : "login")}
              activeOpacity={0.85}
            >
              <Text style={styles.toggleButtonText}>{mode === "login" ? "Register" : "Login"}</Text>
            </TouchableOpacity>
          </Animated.View>

          <Animated.View style={[styles.formPanel, { opacity: fadeAnim }]}>
            <Text style={styles.formTitle}>{mode === "login" ? "Login" : "Sign Up"}</Text>

            <TextInput
              style={styles.input}
              placeholder="Username"
              placeholderTextColor="#9aa5ab"
              autoCapitalize="none"
              autoCorrect={false}
              value={username}
              onChangeText={setUsername}
            />

            {mode === "register" && (
              <TextInput
                style={styles.input}
                placeholder="Display handle (optional, e.g. @wolly)"
                placeholderTextColor="#9aa5ab"
                autoCapitalize="none"
                autoCorrect={false}
                value={handle}
                onChangeText={setHandle}
              />
            )}

            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#9aa5ab"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />

            {mode === "register" && (
              <>
                <Text style={styles.sectionHint}>
                  Security question (optional - lets you recover your password later)
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. What was your first pet's name?"
                  placeholderTextColor="#9aa5ab"
                  value={securityQuestion}
                  onChangeText={setSecurityQuestion}
                />
                {securityQuestion.trim().length > 0 && (
                  <TextInput
                    style={styles.input}
                    placeholder="Your answer"
                    placeholderTextColor="#9aa5ab"
                    autoCapitalize="none"
                    value={securityAnswer}
                    onChangeText={setSecurityAnswer}
                  />
                )}
              </>
            )}

            {mode === "login" && (
              <TouchableOpacity onPress={() => setForgotVisible(true)} style={styles.forgotLink}>
                <Text style={styles.forgotLinkText}>Forgot Password</Text>
              </TouchableOpacity>
            )}

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <TouchableOpacity style={styles.submitButton} onPress={handleSubmit} disabled={loading} activeOpacity={0.85}>
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitButtonText}>{mode === "login" ? "Login" : "Create Account"}</Text>
              )}
            </TouchableOpacity>

            {allowGuest && (
              <TouchableOpacity onPress={handleGuest} disabled={guestLoading} style={styles.skipButton}>
                {guestLoading ? (
                  <ActivityIndicator color={TEAL_MID} size="small" />
                ) : (
                  <Text style={styles.skipButtonText}>Continue as Guest</Text>
                )}
              </TouchableOpacity>
            )}
          </Animated.View>
        </View>
      </ScrollView>

      <ForgotPasswordSheet
        visible={forgotVisible}
        onClose={() => setForgotVisible(false)}
        prefillUsername={username}
      />
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------------------
// Bottom sheet: slides up from the bottom edge of the screen. Three steps -
// enter username, answer the security question, set a new password.
// ---------------------------------------------------------------------------
function ForgotPasswordSheet({ visible, onClose, prefillUsername }) {
  const [step, setStep] = useState("username"); // "username" | "answer" | "reset" | "done"
  const [fUsername, setFUsername] = useState(prefillUsername || "");
  const [userId, setUserId] = useState(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const translateY = useRef(new Animated.Value(400)).current;

  React.useEffect(() => {
    Animated.timing(translateY, {
      toValue: visible ? 0 : 400,
      duration: 300,
      useNativeDriver: true,
    }).start();
    if (visible) {
      setStep("username");
      setFUsername(prefillUsername || "");
      setUserId(null);
      setQuestion("");
      setAnswer("");
      setNewPassword("");
      setConfirmPassword("");
      setError(null);
    }
  }, [visible]);

  const handleLookup = async () => {
    if (!fUsername.trim()) {
      setError("Enter your username");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const result = await apiGetSecurityQuestion(fUsername.trim());
      setUserId(result.user_id);
      setQuestion(result.security_question);
      setStep("answer");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!answer.trim()) {
      setError("Enter your answer");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const valid = await apiVerifySecurityAnswer(userId, answer.trim());
      if (!valid) {
        setError("That answer doesn't match - try again");
        return;
      }
      setStep("reset");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (!newPassword || newPassword.length < 6) {
      setError("New password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await apiResetPassword(userId, newPassword);
      setStep("done");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose} />
      <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
        <View style={styles.sheetHandle} />

        {step === "username" && (
          <>
            <Text style={styles.sheetTitle}>Reset your password</Text>
            <Text style={styles.sheetSubtitle}>Enter your username to get started</Text>
            <TextInput
              style={styles.input}
              placeholder="Username"
              placeholderTextColor="#9aa5ab"
              autoCapitalize="none"
              value={fUsername}
              onChangeText={setFUsername}
            />
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            <TouchableOpacity style={styles.submitButton} onPress={handleLookup} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitButtonText}>Next</Text>}
            </TouchableOpacity>
          </>
        )}

        {step === "answer" && (
          <>
            <Text style={styles.sheetTitle}>Security question</Text>
            <Text style={styles.sheetSubtitle}>{question}</Text>
            <TextInput
              style={styles.input}
              placeholder="Your answer"
              placeholderTextColor="#9aa5ab"
              autoCapitalize="none"
              value={answer}
              onChangeText={setAnswer}
            />
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            <TouchableOpacity style={styles.submitButton} onPress={handleVerify} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitButtonText}>Verify</Text>}
            </TouchableOpacity>
          </>
        )}

        {step === "reset" && (
          <>
            <Text style={styles.sheetTitle}>Set a new password</Text>
            <TextInput
              style={styles.input}
              placeholder="New password"
              placeholderTextColor="#9aa5ab"
              secureTextEntry
              value={newPassword}
              onChangeText={setNewPassword}
            />
            <TextInput
              style={styles.input}
              placeholder="Confirm new password"
              placeholderTextColor="#9aa5ab"
              secureTextEntry
              value={confirmPassword}
              onChangeText={setConfirmPassword}
            />
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            <TouchableOpacity style={styles.submitButton} onPress={handleReset} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitButtonText}>Reset Password</Text>}
            </TouchableOpacity>
          </>
        )}

        {step === "done" && (
          <>
            <Text style={styles.sheetTitle}>Password reset</Text>
            <Text style={styles.sheetSubtitle}>You can now log in with your new password.</Text>
            <TouchableOpacity style={styles.submitButton} onPress={onClose}>
              <Text style={styles.submitButtonText}>Back to Login</Text>
            </TouchableOpacity>
          </>
        )}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#eaf3f5" },
  scrollContent: { flexGrow: 1, justifyContent: "center", padding: 20 },
  card: {
    borderRadius: 28,
    overflow: "hidden",
    backgroundColor: "#fff",
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  header: {
    backgroundColor: TEAL_DARK,
    paddingTop: 40,
    paddingBottom: 36,
    paddingHorizontal: 28,
    borderBottomLeftRadius: 60,
    borderBottomRightRadius: 60,
  },
  headerTitle: { color: "#fff", fontSize: 28, fontWeight: "800", marginBottom: 6 },
  headerSubtitle: { color: "#cfe8ee", fontSize: 14, marginBottom: 16 },
  toggleButton: {
    alignSelf: "flex-start",
    borderWidth: 1.5,
    borderColor: "#fff",
    borderRadius: 24,
    paddingVertical: 8,
    paddingHorizontal: 26,
  },
  toggleButtonText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  formPanel: { padding: 28, paddingTop: 24 },
  formTitle: { fontSize: 24, fontWeight: "800", color: "#14262b", textAlign: "center", marginBottom: 22 },
  sectionHint: { fontSize: 12, color: "#6c8790", marginBottom: 8, marginTop: 2 },
  input: {
    backgroundColor: "#f2f6f7",
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 14,
    fontSize: 15,
    color: "#14262b",
    marginBottom: 14,
  },
  forgotLink: { alignSelf: "flex-end", marginTop: -6, marginBottom: 10 },
  forgotLinkText: { color: TEAL_MID, fontSize: 13, fontWeight: "600" },
  errorText: { color: "#d64545", fontSize: 13, marginBottom: 10, textAlign: "center" },
  submitButton: {
    backgroundColor: TEAL_BRIGHT,
    borderRadius: 24,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 6,
    shadowColor: TEAL_MID,
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  submitButtonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  skipButton: { marginTop: 18, alignItems: "center" },
  skipButtonText: { color: "#5c8894", fontSize: 13, textDecorationLine: "underline" },

  sheetBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#fff",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 36,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#dde5e7",
    alignSelf: "center",
    marginBottom: 18,
  },
  sheetTitle: { fontSize: 20, fontWeight: "800", color: "#14262b", marginBottom: 6 },
  sheetSubtitle: { fontSize: 14, color: "#5c7278", marginBottom: 16 },
});
