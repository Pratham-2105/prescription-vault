import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Redirect, Stack } from 'expo-router';
import { CLOUD_ENABLED } from '@/flags';
import { useSession } from '@/state/session';
import { colors } from '@/ui';

export default function AppLayout() {
  const { user, isRestoring } = useSession();

  // With no cloud tier there are no accounts, so there is nothing to gate on:
  // the records live on this device and the person holding it is the owner.
  // The guard stays in the file rather than being deleted, because deleting it
  // is how it went missing once before — private screens rendered and fired
  // unauthenticated queries, and only a review bot noticed.
  if (CLOUD_ENABLED) {
    // Cold start: /auth/me is still in flight. Redirecting here would flash
    // the login screen at a user who is in fact signed in.
    if (isRestoring) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator />
        </View>
      );
    }

    // The gate for every screen in this group. Guards live in the route-group
    // layout, not in screens — parallel to deps.py on the backend.
    if (!user) return <Redirect href="/login" />;
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerShadowVisible: false,
        headerTintColor: colors.text,
        headerBackTitle: 'Back',
      }}
    >
      <Stack.Screen
        name="index"
        options={{ title: 'Prescriptions', headerLargeTitle: true }}
      />
      {/* The [id] segment has its own layout; its screens are titled there. */}
      <Stack.Screen name="prescription/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="prescription/new" options={{ title: 'New visit' }} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
});