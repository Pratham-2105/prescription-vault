import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { ApiError } from '@/api';
import { useSession } from '@/state/session';
import { Button, ErrorBanner, Field, colors } from '@/ui';

export default function LoginScreen() {
  const { signIn } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit() {
    setError(null);

    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }

    setBusy(true);
    try {
      await signIn(email.trim().toLowerCase(), password);
      // No navigation call: the guard redirects once `user` is set.
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? 'Incorrect email or password.'
          : err instanceof Error
            ? err.message
            : 'Something went wrong. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.title}>Prescription Vault</Text>
          <Text style={styles.subtitle}>Sign in to your records</Text>

          <ErrorBanner message={error} />

          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            placeholder="you@example.com"
            editable={!busy}
          />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            placeholder="••••••••"
            editable={!busy}
            onSubmitEditing={handleSubmit}
            returnKeyType="go"
          />

          <Button label="Sign in" onPress={handleSubmit} busy={busy} />

          <Text style={styles.footer}>
            No account yet? <Link href="/register" style={styles.link}>Create one</Link>
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  card: { gap: 16, width: '100%', maxWidth: 400, alignSelf: 'center' },
  title: { fontSize: 26, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: 15, color: colors.muted, marginTop: -10, marginBottom: 4 },
  footer: { fontSize: 14, color: colors.muted, textAlign: 'center' },
  link: { color: colors.accent, fontWeight: '600' },
});