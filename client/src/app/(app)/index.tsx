import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { usePatients } from '@/data/usePatients';
import { usePrescriptions } from '@/data/usePrescriptions';
import type { PrescriptionFilters, PrescriptionListItem } from '@/domain/prescription';
import { AuthenticatedImage } from '@/features/prescriptions/AuthenticatedImage';
import { useDebounced } from '@/lib/useDebounced';
import { Button, ChipGroup, ErrorBanner, colors } from '@/ui';

/** Sentinel id for the "everyone" chip, which is not a real patient. */
const ALL_PATIENTS = 'all';

export default function TimelineScreen() {
  const router = useRouter();

  const [search, setSearch] = useState('');
  const [patientId, setPatientId] = useState<string>(ALL_PATIENTS);
  const debouncedSearch = useDebounced(search);

  const patients = usePatients();

  const filters = useMemo<PrescriptionFilters>(() => {
    const next: PrescriptionFilters = {};
    const term = debouncedSearch.trim();
    if (term) next.q = term;
    if (patientId !== ALL_PATIENTS) next.patientId = patientId;
    return next;
  }, [debouncedSearch, patientId]);

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
  } = usePrescriptions(filters);

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const goToCapture = useCallback(() => {
    router.push('/prescription/new');
  }, [router]);

  // Only worth showing when there is something to choose between.
  const patientList = patients.data ?? [];
  const showPatientFilter = patientList.length > 1;

  const isFiltered = filters.q !== undefined || filters.patientId !== undefined;

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
            error instanceof Error ? error.message : 'Could not load your prescriptions.'
          }
        />
        <Button label="Try again" onPress={() => void refetch()} />
      </View>
    );
  }

  const sections = data.sections;

  return (
    <View style={styles.screen}>
      <SectionList
        style={styles.list}
        contentContainerStyle={styles.listContent}
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => void refetch()}
            tintColor={colors.accent}
          />
        }
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={
          <View style={styles.controls}>
            <TextInput
              style={styles.search}
              value={search}
              onChangeText={setSearch}
              placeholder="Search doctor, clinic, reason…"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              clearButtonMode="while-editing"
              accessibilityLabel="Search prescriptions"
            />
            {showPatientFilter ? (
              <ChipGroup
                label="Showing"
                options={[
                  { id: ALL_PATIENTS, label: 'Everyone' },
                  ...patientList.map((patient) => ({
                    id: patient.id,
                    label: patient.displayName,
                  })),
                ]}
                selectedId={patientId}
                onSelect={setPatientId}
              />
            ) : null}
          </View>
        }
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
          isFiltered ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Nothing matches</Text>
              <Text style={styles.emptyBody}>
                Try a different search, or clear the filters.
              </Text>
              <View style={styles.emptyAction}>
                <Button
                  label="Clear filters"
                  variant="secondary"
                  onPress={() => {
                    setSearch('');
                    setPatientId(ALL_PATIENTS);
                  }}
                />
              </View>
            </View>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No prescriptions yet</Text>
              <Text style={styles.emptyBody}>
                Add a visit to start building your record.
              </Text>
              <View style={styles.emptyAction}>
                <Button label="Add a visit" onPress={goToCapture} />
              </View>
            </View>
          )
        }
        ListFooterComponent={
          isFetchingNextPage ? (
            <View style={styles.footer}>
              <ActivityIndicator color={colors.muted} />
            </View>
          ) : null
        }
      />

      {sections.length > 0 ? (
        <View style={styles.fabWrap} pointerEvents="box-none">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add a visit"
            onPress={goToCapture}
            style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
          >
            <Text style={styles.fabLabel}>New visit</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function PrescriptionCard({
  prescription,
  onPress,
}: {
  prescription: PrescriptionListItem;
  onPress: () => void;
}) {
  const {
    doctorName,
    clinicName,
    reason,
    attachmentCount,
    medicationCount,
    thumbnailAttachmentId,
  } = prescription;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      {thumbnailAttachmentId ? (
        <AuthenticatedImage
          attachmentId={thumbnailAttachmentId}
          variant="thumbnail"
          style={styles.thumb}
        />
      ) : null}

      <View style={styles.cardBody}>
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
      </View>
    </Pressable>
  );
}

function countLabel(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  list: { backgroundColor: colors.bg },
  listContent: {
    paddingBottom: 96,
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
  controls: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 12,
  },
  search: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 14,
  },
  cardPressed: { opacity: 0.7 },
  thumb: {
    width: 64,
    height: 64,
    flexGrow: 0,
    flexShrink: 0,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: colors.bg,
  },
  cardBody: { flex: 1, gap: 4 },
  doctor: { fontSize: 16, fontWeight: '600', color: colors.text },
  clinic: { fontSize: 14, color: colors.muted },
  reason: { fontSize: 14, color: colors.text },
  counts: { fontSize: 12, color: colors.muted, marginTop: 4 },
  empty: { alignItems: 'center', padding: 48, gap: 6 },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: colors.text },
  emptyBody: { fontSize: 14, color: colors.muted, textAlign: 'center' },
  emptyAction: { marginTop: 16, minWidth: 200 },
  footer: { paddingVertical: 20 },
  fabWrap: {
    position: 'absolute',
    right: 0,
    left: 0,
    bottom: 24,
    alignItems: 'center',
  },
  fab: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingHorizontal: 24,
    paddingVertical: 14,
    minHeight: 50,
    justifyContent: 'center',
  },
  fabPressed: { opacity: 0.85 },
  fabLabel: { color: '#FFF', fontSize: 16, fontWeight: '600' },
});