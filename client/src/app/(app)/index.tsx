import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { FEEDBACK_EMAIL } from '@/config/app';
import { usePatients } from '@/data/usePatients';
import { useCloudPrompt, useWelcomeCard } from '@/data/usePreferences';
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
  const welcome = useWelcomeCard();
  const cloudPrompt = useCloudPrompt();

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

  const goToSettings = useCallback(() => {
    router.push('/settings');
  }, [router]);

  const handleCloudInterest = useCallback(() => {
    // Opens a mail client rather than reporting a tap. The app makes no
    // network calls and collects nothing, which is a claim in the privacy
    // policy — measuring interest silently would make that claim false.
    void Linking.openURL(
      `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent('Cloud backup')}`,
    ).catch(() => undefined);
    cloudPrompt.dismiss();
  }, [cloudPrompt]);

  // Only worth showing when there is something to choose between.
  const patientList = patients.data ?? [];
  const showPatientFilter = patientList.length > 1;

  const isFiltered = filters.q !== undefined || filters.patientId !== undefined;

  const headerButton = (
    <Stack.Screen
      options={{
        headerRight: () => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="About this app"
            onPress={goToSettings}
            hitSlop={12}
          >
            <Text style={styles.headerButton}>About</Text>
          </Pressable>
        ),
      }}
    />
  );

  // First load, nothing cached.
  if (isPending) {
    return (
      <View style={styles.centered}>
        {headerButton}
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  // Failed with nothing to show. Once data exists, errors are non-blocking.
  if (isError) {
    return (
      <View style={styles.centered}>
        {headerButton}
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
      {headerButton}

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
            {welcome.visible ? (
              <WelcomeCard
                onDismiss={() => {
                  welcome.dismiss();
                }}
              />
            ) : null}

            {cloudPrompt.visible ? (
              <CloudPromptCard
                onInterested={handleCloudInterest}
                onDismiss={() => {
                  cloudPrompt.dismiss();
                }}
              />
            ) : null}

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

/**
 * Shown once, on first run.
 *
 * Not a tutorial: the empty state already explains how to add a visit, and
 * onboarding carousels get skipped. What a new user genuinely cannot guess is
 * what the app does with their data and what it refuses to do with it, so that
 * is all this says.
 */
function WelcomeCard({ onDismiss }: { onDismiss: () => void }) {
  return (
    <View style={styles.notice}>
      <Text style={styles.noticeTitle}>Everything stays on this phone</Text>
      <Text style={styles.noticeBody}>
        No account, no sign-in, and nothing is uploaded. Your prescriptions work
        with no internet at all — at a pharmacy counter, or anywhere else.
      </Text>
      <Text style={styles.noticeMuted}>
        This is a record of what a doctor wrote. It does not give medical advice
        or check your medicines against each other.
      </Text>
      <Pressable accessibilityRole="button" onPress={onDismiss} hitSlop={8}>
        <Text style={styles.noticeAction}>Got it</Text>
      </Pressable>
    </View>
  );
}

/**
 * Asked once, after enough records exist to make losing the phone hurt.
 *
 * Either answer sets the same flag: this is a question asked once, not a nag.
 * An app that does not pester about anything else should not start here.
 */
function CloudPromptCard({
  onInterested,
  onDismiss,
}: {
  onInterested: () => void;
  onDismiss: () => void;
}) {
  return (
    <View style={styles.notice}>
      <Text style={styles.noticeTitle}>Would you want a backup?</Text>
      <Text style={styles.noticeBody}>
        Your records live only on this phone, so losing it loses them. Encrypted
        cloud backup and family sharing are possible — but only worth building if
        people actually want them.
      </Text>
      <View style={styles.noticeActions}>
        <Pressable accessibilityRole="button" onPress={onInterested} hitSlop={8}>
          <Text style={styles.noticeAction}>Yes, I would use that</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onDismiss} hitSlop={8}>
          <Text style={styles.noticeDismiss}>No thanks</Text>
        </Pressable>
      </View>
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
  headerButton: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.accent,
    paddingHorizontal: 8,
  },
  controls: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 12,
  },
  notice: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 16,
    gap: 8,
  },
  noticeTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  noticeBody: { fontSize: 14, color: colors.text, lineHeight: 20 },
  noticeMuted: { fontSize: 13, color: colors.muted, lineHeight: 19 },
  noticeActions: { flexDirection: 'row', gap: 20, marginTop: 2 },
  noticeAction: { fontSize: 15, fontWeight: '600', color: colors.accent, paddingVertical: 4 },
  noticeDismiss: { fontSize: 15, color: colors.muted, paddingVertical: 4 },
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