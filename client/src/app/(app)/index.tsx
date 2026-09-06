import { StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { useSession } from '@/state/session';
import { Button, colors } from '@/ui';

export default function HomeScreen() {
  const { user, signOut } = useSession();

  return (
    <>
      <Stack.Screen options={{ title: 'Timeline' }} />
      <View style={styles.container}>
        <Text style={styles.heading}>Signed in</Text>
        <Text style={styles.email}>{user?.email}</Text>
        <Text style={styles.note}>The prescription timeline goes here next.</Text>
        <Button label="Sign out" onPress={() => void signOut()} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 20, gap: 12, justifyContent: 'center' },
  heading: { fontSize: 22, fontWeight: '700', color: colors.text },
  email: { fontSize: 16, color: colors.muted },
  note: { fontSize: 14, color: colors.muted, marginBottom: 12 },
});