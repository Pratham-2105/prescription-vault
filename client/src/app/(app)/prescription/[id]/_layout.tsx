import { Stack } from 'expo-router';
import { colors } from '@/ui';

/**
 * Layout for the [id] segment.
 *
 * Needed because [id] is a directory rather than a single file: without a
 * layout here, the routes inside it are not scoped to the dynamic segment and
 * useLocalSearchParams returns undefined for `id`.
 */
export default function PrescriptionLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerShadowVisible: false,
        headerTintColor: colors.text,
        headerBackTitle: 'Back',
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Visit' }} />
      <Stack.Screen name="edit" options={{ title: 'Edit visit' }} />
    </Stack>
  );
}