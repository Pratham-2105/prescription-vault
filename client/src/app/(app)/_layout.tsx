import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Redirect, Stack } from 'expo-router';
import { useSession } from '@/state/session';
import { colors } from '@/ui';

export default function AppLayout() {
  const { user, isRestoring } = useSession();

  // Cold start: /auth/me is still in flight. Rendering the redirect here
  // would flash the login screen at a user who is in fact signed in.
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
      <Stack.Screen name="prescription/[id]" options={{ title: 'Visit' }} />
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