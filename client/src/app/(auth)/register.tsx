import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { useSession } from '@/state/session';
import { Button, ErrorBanner, Field, colors } from '@/ui';

export default function RegisterScreen() {
  const { signUp } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit() {
    setError(null);

    if (!email.trim()) return setError('Enter your email.');
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    if (password !== confirm) return setError('Passwords do not match.');

    setBusy(true);
    try {
      await signUp(email.trim().toLowerCase(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create your account.');
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
          <Text style={styles.title}>Create your vault</Text>
          <Text style={styles.subtitle}>Keep every prescription in one place</Text>

          <ErrorBanner message={error} />

          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="you@example.com"
            editable={!busy}
          />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
            placeholder="At least 8 characters"
            editable={!busy}
          />
          <Field
            label="Confirm password"
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
            autoComplete="new-password"
            editable={!busy}
            onSubmitEditing={handleSubmit}
            returnKeyType="go"
          />

          <Button label="Create account" onPress={handleSubmit} busy={busy} />

          <Text style={styles.footer}>
            Already have an account? <Link href="/login" style={styles.link}>Sign in</Link>
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