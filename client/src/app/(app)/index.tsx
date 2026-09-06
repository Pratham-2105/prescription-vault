import { useCallback } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { usePrescriptions } from '@/data/usePrescriptions';
import type { PrescriptionListItem } from '@/domain/prescription';
import { Button, ErrorBanner, colors } from '@/ui';

export default function TimelineScreen() {
  const router = useRouter();
  const {
    data,
    isPending,
    isError,
    error,
    refetch,
    isRefetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = usePrescriptions();

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // First load, nothing cached.
  if (isPending) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  // Failed with nothing to show. Once data exists, errors are non-blocking.
  if (isError) {
    return (
      <View style={styles.centered}>
        <ErrorBanner
          message={
            error instanceof Error
              ? error.message
              : 'Could not load your prescriptions.'
          }
        />
        <Button label="Try again" onPress={() => void refetch()} />
      </View>
    );
  }

  const sections = data.sections;

  return (
    <SectionList
      style={styles.list}
      contentContainerStyle={styles.listContent}
      sections={sections}
      keyExtractor={(item) => item.id}
      stickySectionHeadersEnabled
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={() => void refetch()}
          tintColor={colors.accent}
        />
      }
      onEndReached={handleEndReached}
      onEndReachedThreshold={0.4}
      renderSectionHeader={({ section }) => (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
        </View>
      )}
      renderItem={({ item }) => (
        <PrescriptionCard
          prescription={item}
          onPress={() =>
            router.push({ pathname: '/prescription/[id]', params: { id: item.id } })
          }
        />
      )}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No prescriptions yet</Text>
          <Text style={styles.emptyBody}>
            Add a visit to start building your record.
          </Text>
        </View>
      }
      ListFooterComponent={
        isFetchingNextPage ? (
          <View style={styles.footer}>
            <ActivityIndicator color={colors.muted} />
          </View>
        ) : null
      }
    />
  );
}

function PrescriptionCard({
  prescription,
  onPress,
}: {
  prescription: PrescriptionListItem;
  onPress: () => void;
}) {
  const { doctorName, clinicName, reason, attachmentCount, medicationCount } =
    prescription;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <Text style={styles.doctor}>{doctorName ?? 'Unnamed visit'}</Text>
      {clinicName ? <Text style={styles.clinic}>{clinicName}</Text> : null}
      {reason ? (
        <Text style={styles.reason} numberOfLines={2}>
          {reason}
        </Text>
      ) : null}
      <Text style={styles.counts}>
        {countLabel(medicationCount, 'medicine', 'medicines')}
        {' · '}
        {countLabel(attachmentCount, 'page', 'pages')}
      </Text>
    </Pressable>
  );
}

function countLabel(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

const styles = StyleSheet.create({
  list: { backgroundColor: colors.bg },
  listContent: {
    paddingBottom: 32,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 16,
    backgroundColor: colors.bg,
  },
  sectionHeader: {
    backgroundColor: colors.bg,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 14,
    gap: 4,
  },
  cardPressed: { opacity: 0.7 },
  doctor: { fontSize: 16, fontWeight: '600', color: colors.text },
  clinic: { fontSize: 14, color: colors.muted },
  reason: { fontSize: 14, color: colors.text },
  counts: { fontSize: 12, color: colors.muted, marginTop: 4 },
  empty: { alignItems: 'center', padding: 48, gap: 6 },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: colors.text },
  emptyBody: { fontSize: 14, color: colors.muted, textAlign: 'center' },
  footer: { paddingVertical: 20 },
});