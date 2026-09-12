import { useCallback } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Application from 'expo-application';
import {
  FEEDBACK_EMAIL,
  PRIVACY_POLICY_URL,
  SOURCE_URL,
} from '@/config/app';
import { colors } from '@/ui';

export default function SettingsScreen() {
  const open = useCallback((url: string) => {
    // Failures are swallowed on purpose: a device with no browser or mail
    // client is a strange state, and an error banner on a settings screen
    // helps nobody. The link simply does nothing.
    void Linking.openURL(url).catch(() => undefined);
  }, []);

  const emailAbout = useCallback(
    (subject: string) => {
      open(`mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(subject)}`);
    },
    [open],
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Your data</Text>
      <View style={styles.card}>
        <Text style={styles.body}>
          Everything you record stays on this phone. There is no account, nothing
          is uploaded, and the app works with no internet connection at all.
        </Text>
        <Text style={styles.muted}>
          Deleting a visit removes its images from the device too. Uninstalling
          the app removes everything.
        </Text>
      </View>

      <Text style={styles.sectionTitle}>Cloud backup</Text>
      <View style={styles.card}>
        <Text style={styles.body}>
          Because records live only on this phone, losing the phone loses them.
          Backup and sharing across a family are planned, but only if people
          actually want them.
        </Text>
        <Pressable accessibilityRole="button" onPress={() => { emailAbout('Cloud backup'); }}>
          <Text style={styles.link}>Tell me you would use this</Text>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>About</Text>
      <View style={styles.card}>
        <Row label="Version" value={Application.nativeApplicationVersion ?? '1.0.0'} />
        <Row label="Build" value={Application.nativeBuildVersion ?? '—'} />

        <Pressable accessibilityRole="button" onPress={() => { open(PRIVACY_POLICY_URL); }}>
          <Text style={styles.link}>Privacy policy</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => { open(SOURCE_URL); }}>
          <Text style={styles.link}>Source code</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => { emailAbout('Prescription Vault feedback'); }}
        >
          <Text style={styles.link}>Report a problem</Text>
        </Pressable>
      </View>

      <View style={styles.disclaimerCard}>
        <Text style={styles.disclaimerTitle}>Not a medical device</Text>
        <Text style={styles.muted}>
          Prescription Vault stores what a doctor wrote. It does not check your
          medicines against each other, suggest doses, or give medical advice of
          any kind. Ask a pharmacist or a doctor.
        </Text>
      </View>
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.muted}>{label}</Text>
      <Text style={styles.body}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: {
    padding: 16,
    paddingBottom: 48,
    gap: 8,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.muted,
    marginTop: 20,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 16,
    gap: 10,
  },
  disclaimerCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 16,
    gap: 6,
    marginTop: 28,
  },
  disclaimerTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  body: { fontSize: 15, color: colors.text, lineHeight: 22 },
  muted: { fontSize: 14, color: colors.muted, lineHeight: 20 },
  link: { fontSize: 15, fontWeight: '600', color: colors.accent, paddingVertical: 6 },
});