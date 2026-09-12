import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { usePrescription } from '@/data/usePrescriptionDetail';
import { useUpdatePrescription } from '@/data/usePrescriptionMutations';
import type { Prescription, PrescriptionEdit } from '@/domain/prescription';
import {
  describeChanges,
  type FieldChange,
} from '@/features/prescriptions/describeChanges';
import { isApiDate, isFutureApiDate } from '@/lib/date';
import { Button, ErrorBanner, Field, colors } from '@/ui';

/** The form's own state: text inputs hold strings, never null. */
type FormState = {
  visitDate: string;
  doctorName: string;
  clinicName: string;
  specialty: string;
  reason: string;
  notes: string;
};

function toFormState(prescription: Prescription): FormState {
  return {
    visitDate: prescription.visitDate,
    doctorName: prescription.doctorName ?? '',
    clinicName: prescription.clinicName ?? '',
    specialty: prescription.specialty ?? '',
    reason: prescription.reason ?? '',
    notes: prescription.notes ?? '',
  };
}

function toEdit(form: FormState): PrescriptionEdit {
  return {
    visitDate: form.visitDate,
    doctorName: form.doctorName,
    clinicName: form.clinicName,
    specialty: form.specialty,
    reason: form.reason,
    notes: form.notes,
  };
}

export default function EditPrescriptionScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const prescription = usePrescription(id);
  const update = useUpdatePrescription();

  // Null until the record loads. A form cannot be seeded from data that is not
  // there yet, and seeding it inside an effect would flash empty fields first.
  const [form, setForm] = useState<FormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState<FieldChange[] | null>(null);

  const loaded = prescription.data;
  if (loaded && form === null) {
    // Setting state during render is legal when it is derived from fetched
    // data and guarded so it happens once. React discards the in-progress
    // render and restarts immediately, so nothing flashes.
    setForm(toFormState(loaded));
  }

  const setField = useCallback((key: keyof FormState, value: string) => {
    setForm((previous) => (previous ? { ...previous, [key]: value } : previous));
  }, []);

  const handleReview = useCallback(() => {
    if (!loaded || !form) return;

    if (!isApiDate(form.visitDate)) {
      setFormError('Enter the visit date as YYYY-MM-DD.');
      return;
    }
    if (isFutureApiDate(form.visitDate)) {
      setFormError('The visit date cannot be in the future.');
      return;
    }

    const changes = describeChanges(loaded, toEdit(form));
    if (changes.length === 0) {
      // Nothing to confirm and nothing to write. Saying so is better than a
      // dialog listing no changes, or a silent no-op that looks like a bug.
      setFormError('Nothing has changed.');
      return;
    }

    setFormError(null);
    setPending(changes);
  }, [form, loaded]);

  const handleConfirm = useCallback(() => {
    if (!form) return;

    update.mutate(
      { id, edit: toEdit(form) },
      {
        onSuccess: () => {
          setPending(null);
          router.back();
        },
        // The dialog stays open on failure so the error is visible next to the
        // thing that failed, rather than behind it.
      },
    );
  }, [form, id, router, update]);

  if (prescription.isPending || !form) {
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
              : 'Could not load this visit.'
          }
        />
        <Button
          label="Back"
          variant="secondary"
          onPress={() => {
            router.back();
          }}
        />
      </View>
    );
  }

  const busy = update.isPending;

  return (
    <>
      {/*
        Without this the keyboard covers the lower fields — Notes especially,
        since it sits at the bottom and is the tallest. The two platforms need
        different strategies: iOS wants the whole view lifted by the keyboard's
        height, Android resizes the window instead, so padding the bottom is
        enough and 'height' would fight the system behaviour.
      */}
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.screen}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          // Scrolls the focused input into view above the keyboard rather than
          // leaving the user to do it by hand.
          automaticallyAdjustKeyboardInsets
        >
          <ErrorBanner message={formError} />

          <Field
            label="Visit date"
            value={form.visitDate}
            onChangeText={(text) => {
              setField('visitDate', text);
            }}
            placeholder="YYYY-MM-DD"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType={Platform.OS === 'web' ? 'default' : 'numbers-and-punctuation'}
            editable={!busy}
          />
          <Field
            label="Doctor"
            value={form.doctorName}
            onChangeText={(text) => {
              setField('doctorName', text);
            }}
            autoCapitalize="words"
            editable={!busy}
          />
          <Field
            label="Clinic or hospital"
            value={form.clinicName}
            onChangeText={(text) => {
              setField('clinicName', text);
            }}
            autoCapitalize="words"
            editable={!busy}
          />
          <Field
            label="Specialty"
            value={form.specialty}
            onChangeText={(text) => {
              setField('specialty', text);
            }}
            autoCapitalize="words"
            editable={!busy}
          />
          <Field
            label="Reason for visit"
            value={form.reason}
            onChangeText={(text) => {
              setField('reason', text);
            }}
            editable={!busy}
          />
          <Field
            label="Notes"
            value={form.notes}
            onChangeText={(text) => {
              setField('notes', text);
            }}
            multiline
            style={styles.multiline}
            editable={!busy}
          />

          <View style={styles.actions}>
            <Button label="Review changes" onPress={handleReview} disabled={busy} />
            <Button
              label="Cancel"
              variant="secondary"
              onPress={() => {
                router.back();
              }}
              disabled={busy}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <ConfirmChangesDialog
        changes={pending}
        busy={busy}
        error={update.error instanceof Error ? update.error.message : null}
        onConfirm={handleConfirm}
        onCancel={() => {
          setPending(null);
          update.reset();
        }}
      />
    </>
  );
}

/**
 * Shows exactly what is about to change before it is written.
 *
 * Deliberate friction: these are medical records, and a one-tap save makes a
 * mistyped dosage or a wrong date indistinguishable from a correct one until
 * someone notices months later. Listing the changes costs a tap and makes the
 * mistake visible while it is still undoable.
 */
function ConfirmChangesDialog({
  changes,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  changes: FieldChange[] | null;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      visible={changes !== null}
      transparent
      animationType="fade"
      // Android's hardware back button. Without this it closes the whole
      // screen instead of the dialog.
      onRequestClose={onCancel}
    >
      <View style={styles.backdrop}>
        <View style={styles.dialog}>
          <Text style={styles.dialogTitle}>Save these changes?</Text>

          <ScrollView style={styles.changeList}>
            {(changes ?? []).map((change) => (
              <View key={change.label} style={styles.change}>
                <Text style={styles.changeLabel}>{change.label}</Text>
                <Text style={styles.changeBefore}>{change.before ?? 'Empty'}</Text>
                <Text style={styles.changeAfter}>-&gt; {change.after ?? 'Empty'}</Text>
              </View>
            ))}
          </ScrollView>

          {error ? <ErrorBanner message={error} /> : null}

          <View style={styles.dialogActions}>
            <Button label="Save" onPress={onConfirm} busy={busy} />
            <Button
              label="Keep editing"
              variant="secondary"
              onPress={onCancel}
              disabled={busy}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: {
    padding: 16,
    // Generous bottom padding so the last field and the buttons can scroll
    // clear of the keyboard on Android, where the window resizes rather than
    // the view lifting.
    paddingBottom: 96,
    gap: 12,
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
  multiline: { minHeight: 96, textAlignVertical: 'top' },
  actions: { gap: 10, marginTop: 24 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  dialog: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 20,
    gap: 14,
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
    maxHeight: '80%',
  },
  dialogTitle: { fontSize: 18, fontWeight: '600', color: colors.text },
  changeList: { flexGrow: 0 },
  change: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: 2,
  },
  changeLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  changeBefore: {
    fontSize: 15,
    color: colors.muted,
    textDecorationLine: 'line-through',
  },
  changeAfter: { fontSize: 15, color: colors.text },
  dialogActions: { gap: 10 },
});