import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMedications, usePrescription } from '@/data/usePrescriptionDetail';
import { AuthenticatedImage } from '@/features/prescriptions/AuthenticatedImage';
import { formatFrequency } from '@/features/prescriptions/formatFrequency';
import { formatVisitDate } from '@/features/prescriptions/groupByVisitDate';
import type { Medication } from '@/domain/prescription';
import { Button, ErrorBanner, colors } from '@/ui';

export default function PrescriptionDetailScreen() {
  // ---- all hooks, above every conditional return ----
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width } = useWindowDimensions();
  const pageWidth = Math.min(width, 720);

  const prescription = usePrescription(id);
  const medications = useMedications(id);
  const [page, setPage] = useState(0);

  // pagingEnabled snaps to page boundaries, so offset / width is the index.
  const handleScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      setPage(Math.round(event.nativeEvent.contentOffset.x / pageWidth));
    },
    [pageWidth],
  );

  const goBack = useCallback(() => router.back(), [router]);

  // ---- conditional returns start here ----
  if (prescription.isPending) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (prescription.isError) {
    return (
      <View style={styles.centered}>
        <ErrorBanner
          message={
            prescription.error instanceof Error
              ? prescription.error.message
              : 'Could not load this prescription.'
          }
        />
        <Button label="Try again" onPress={() => void prescription.refetch()} />
        <Pressable onPress={goBack} accessibilityRole="button">
          <Text style={styles.link}>Back to timeline</Text>
        </Pressable>
      </View>
    );
  }

  const p = prescription.data;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>

      <View style={styles.header}>
        <Text style={styles.date}>{formatVisitDate(p.visitDate)}</Text>
        <Text style={styles.doctor}>{p.doctorName ?? 'Unnamed visit'}</Text>
        {p.clinicName ? <Text style={styles.muted}>{p.clinicName}</Text> : null}
        {p.specialty ? <Text style={styles.muted}>{p.specialty}</Text> : null}
        {p.reason ? <LabelledText label="Reason for visit" value={p.reason} /> : null}
        {p.notes ? <LabelledText label="Notes" value={p.notes} /> : null}
      </View>

      <Text style={styles.sectionTitle}>Pages</Text>
      {p.attachments.length === 0 ? (
        <Text style={styles.empty}>No pages attached to this visit.</Text>
      ) : (
        <>
          <FlatList
            data={p.attachments}
            keyExtractor={(a) => a.id}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={handleScrollEnd}
            renderItem={({ item }) => (
              <View style={[styles.page, { width: pageWidth }]}>
                <AuthenticatedImage attachmentId={item.id} variant="full" />
              </View>
            )}
          />
          <Text style={styles.pageCount}>
            Page {page + 1} of {p.attachments.length}
          </Text>
        </>
      )}

      <Text style={styles.sectionTitle}>Medicines</Text>
      {medications.isPending ? (
        <ActivityIndicator color={colors.muted} />
      ) : medications.isError ? (
        <Text style={styles.empty}>Could not load medicines.</Text>
      ) : medications.data.length === 0 ? (
        <Text style={styles.empty}>No medicines recorded for this visit.</Text>
      ) : (
        medications.data.map((m) => <MedicationRow key={m.id} medication={m} />)
      )}

      <Text style={styles.disclaimer}>
        A record of what was prescribed. Not medical advice.
      </Text>
    </ScrollView>
  );
}

function MedicationRow({ medication }: { medication: Medication }) {
  const { name, strength, form, frequencyCode, foodRelation, durationDays } = medication;
  const schedule = formatFrequency(frequencyCode);

  const detail = [
    schedule,
    foodRelation,
    durationDays ? `${durationDays} days` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={styles.medication}>
      <Text style={styles.medicationName}>
        {name}
        {strength ? ` ${strength}` : ''}
        {form ? ` (${form})` : ''}
      </Text>
      {detail ? <Text style={styles.muted}>{detail}</Text> : null}
    </View>
  );
}

function LabelledText({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.labelled}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.body}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 48, gap: 8 },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 16,
    backgroundColor: colors.bg,
  },
  link: { color: colors.accent, fontSize: 15, fontWeight: '600' },
  header: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: 4,
    marginTop: 8,
  },
  date: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  doctor: { fontSize: 20, fontWeight: '600', color: colors.text },
  muted: { fontSize: 14, color: colors.muted },
  body: { fontSize: 15, color: colors.text, marginTop: 4 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.muted,
    marginTop: 20,
  },
  page: {
    height: 460,
    backgroundColor: colors.card,
    borderRadius: 12,
    overflow: 'hidden',
  },
  pageCount: { fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: 6 },
  empty: { fontSize: 14, color: colors.muted, paddingVertical: 8 },
  medication: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginBottom: 8,
    gap: 2,
  },
  medicationName: { fontSize: 16, fontWeight: '600', color: colors.text },
  disclaimer: {
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 28,
    paddingHorizontal: 24,
  },
  labelled: { marginTop: 10 },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: colors.muted,
    marginBottom: 2,
  },
});