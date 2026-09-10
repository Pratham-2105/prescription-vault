import { useCallback, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { FileReadError, type PickedFile } from '@/api/upload';
import { useCapturePrescription } from '@/data/useCapturePrescription';
import { useCreatePatient, usePatients } from '@/data/usePatients';
import type { NewMedication } from '@/domain/prescription';
import { isApiDate, isFutureApiDate, todayApiDate } from '@/lib/date';
import { Button, ChipGroup, ErrorBanner, Field, colors } from '@/ui';

type MedicationDraft = {
  /** Local-only stable key for React. Not sent anywhere. */
  key: string;
  name: string;
  strength: string;
  frequencyCode: string;
};

type PickedPage = PickedFile & { key: string };

export default function NewPrescriptionScreen() {
  const router = useRouter();
  const patients = usePatients();
  const createPatient = useCreatePatient();
  const capture = useCapturePrescription();

  // Counter for local list keys. A ref, not state: changing it must not
  // trigger a render, and it must survive one.
  const nextKey = useRef(0);
  const makeKey = useCallback(() => {
    nextKey.current += 1;
    return `k${String(nextKey.current)}`;
  }, []);

  const [patientId, setPatientId] = useState<string | null>(null);
  const [showAddPatient, setShowAddPatient] = useState(false);
  const [newPatientName, setNewPatientName] = useState('');

  const [visitDate, setVisitDate] = useState(todayApiDate);
  const [doctorName, setDoctorName] = useState('');
  const [clinicName, setClinicName] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');

  const [pages, setPages] = useState<PickedPage[]>([]);
  const [medications, setMedications] = useState<MedicationDraft[]>([]);

  const [formError, setFormError] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [partial, setPartial] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  const patientList = patients.data ?? [];
  const selectedPatientId =
    patientId ?? (patientList.length === 1 ? (patientList[0]?.id ?? null) : null);

  const handleAddPatient = useCallback(() => {
    const name = newPatientName.trim();
    if (!name) {
      setFormError('Give the person a name first.');
      return;
    }
    setFormError(null);
    createPatient.mutate(
      { displayName: name },
      {
        onSuccess: (patient) => {
          setPatientId(patient.id);
          setNewPatientName('');
          setShowAddPatient(false);
        },
      },
    );
  }, [createPatient, newPatientName]);

  const addPickedAssets = useCallback(
    (assets: ImagePicker.ImagePickerAsset[]) => {
      setPages((prev) => [
        ...prev,
        ...assets.map((asset) => ({
          key: makeKey(),
          uri: asset.uri,
          name: asset.fileName ?? null,
          mimeType: asset.mimeType ?? null,
        })),
      ]);
    },
    [makeKey],
  );

  const handlePickFromLibrary = useCallback(() => {
    setPickError(null);
    void (async () => {
      try {
        const result = await ImagePicker.launchImageLibraryAsync({
          quality: 0.7,
          allowsMultipleSelection: true,
        });
        if (!result.canceled) addPickedAssets(result.assets);
      } catch {
        setPickError('Could not open the photo library.');
      }
    })();
  }, [addPickedAssets]);

  const handleTakePhoto = useCallback(() => {
    setPickError(null);
    void (async () => {
      try {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setPickError('Camera permission is needed to photograph a prescription.');
          return;
        }
        const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
        if (!result.canceled) addPickedAssets(result.assets);
      } catch {
        setPickError('Could not open the camera.');
      }
    })();
  }, [addPickedAssets]);

  const removePage = useCallback((key: string) => {
    setPages((prev) => prev.filter((page) => page.key !== key));
  }, []);

  const addMedicationRow = useCallback(() => {
    setMedications((prev) => [
      ...prev,
      { key: makeKey(), name: '', strength: '', frequencyCode: '' },
    ]);
  }, [makeKey]);

  const updateMedication = useCallback(
    (key: string, patch: Partial<Omit<MedicationDraft, 'key'>>) => {
      setMedications((prev) =>
        prev.map((row) => (row.key === key ? { ...row, ...patch } : row)),
      );
    },
    [],
  );

  const removeMedication = useCallback((key: string) => {
    setMedications((prev) => prev.filter((row) => row.key !== key));
  }, []);

  const openSavedVisit = useCallback(
    (id: string) => {
      router.replace({ pathname: '/prescription/[id]', params: { id } });
    },
    [router],
  );

  const handleSave = useCallback(() => {
    if (!selectedPatientId) {
      setFormError('Choose who this visit was for.');
      return;
    }
    if (!isApiDate(visitDate)) {
      setFormError('Enter the visit date as YYYY-MM-DD.');
      return;
    }
    if (isFutureApiDate(visitDate)) {
      setFormError('The visit date cannot be in the future.');
      return;
    }

    const medicineList: NewMedication[] = medications
      .filter((row) => row.name.trim().length > 0)
      .map((row) => ({
        name: row.name,
        strength: row.strength,
        frequencyCode: row.frequencyCode,
      }));

    setFormError(null);
    setPartial(null);

    capture.mutate(
      {
        prescription: {
          patientId: selectedPatientId,
          visitDate,
          doctorName,
          clinicName,
          specialty,
          reason,
          notes,
        },
        files: pages.map(({ uri, name, mimeType }) => ({ uri, name, mimeType })),
        medications: medicineList,
      },
      {
        onSuccess: (result) => {
          const problems: string[] = [];
          if (result.failedAttachments > 0) {
            problems.push(
              `${String(result.failedAttachments)} page(s) did not upload`,
            );
          }
          if (result.failedMedications > 0) {
            problems.push(
              `${String(result.failedMedications)} medicine(s) were not saved`,
            );
          }

          if (problems.length === 0) {
            openSavedVisit(result.prescriptionId);
            return;
          }

          // The visit itself was saved. Say so plainly rather than navigating
          // away and leaving the user to discover the gap later.
          setSavedId(result.prescriptionId);
          setPartial(
            `The visit was saved, but ${problems.join(' and ')}. You can add them from the visit.`,
          );
        },
      },
    );
  }, [
    capture,
    clinicName,
    doctorName,
    medications,
    notes,
    openSavedVisit,
    pages,
    reason,
    selectedPatientId,
    specialty,
    visitDate,
  ]);

  const saveError =
    capture.error instanceof FileReadError
      ? capture.error.message
      : capture.error instanceof Error
        ? capture.error.message
        : null;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <ErrorBanner message={formError} />
      <ErrorBanner message={saveError} />
      <ErrorBanner message={pickError} />

      {partial ? (
        <View style={styles.partial}>
          <Text style={styles.partialText}>{partial}</Text>
          <Button
            label="Open the visit"
            variant="secondary"
            onPress={() => {
              if (savedId) openSavedVisit(savedId);
            }}
          />
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>Who was this for</Text>

      {patients.isPending ? (
        <Text style={styles.muted}>Loading profiles…</Text>
      ) : patientList.length === 0 ? (
        <Text style={styles.muted}>
          No profiles yet. Add the first person below.
        </Text>
      ) : (
        <ChipGroup
          label="Patient"
          options={patientList.map((patient) => ({
            id: patient.id,
            label: patient.displayName,
          }))}
          selectedId={selectedPatientId}
          onSelect={setPatientId}
          disabled={capture.isPending}
        />
      )}

      {showAddPatient || patientList.length === 0 ? (
        <View style={styles.inlineAdd}>
          <Field
            label="Name"
            value={newPatientName}
            onChangeText={setNewPatientName}
            placeholder="Self, Mom, …"
            autoCapitalize="words"
            editable={!createPatient.isPending}
          />
          <Button
            label="Add person"
            onPress={handleAddPatient}
            busy={createPatient.isPending}
          />
          {createPatient.error ? (
            <ErrorBanner message={createPatient.error.message} />
          ) : null}
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setShowAddPatient(true);
          }}
        >
          <Text style={styles.link}>+ Add someone</Text>
        </Pressable>
      )}

      <Text style={styles.sectionTitle}>The visit</Text>

      <Field
        label="Visit date"
        value={visitDate}
        onChangeText={setVisitDate}
        placeholder="YYYY-MM-DD"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType={Platform.OS === 'web' ? 'default' : 'numbers-and-punctuation'}
        editable={!capture.isPending}
      />
      <Field
        label="Doctor"
        value={doctorName}
        onChangeText={setDoctorName}
        placeholder="Dr. …"
        autoCapitalize="words"
        editable={!capture.isPending}
      />
      <Field
        label="Clinic or hospital"
        value={clinicName}
        onChangeText={setClinicName}
        autoCapitalize="words"
        editable={!capture.isPending}
      />
      <Field
        label="Specialty"
        value={specialty}
        onChangeText={setSpecialty}
        placeholder="Dermatology, ENT, …"
        autoCapitalize="words"
        editable={!capture.isPending}
      />
      <Field
        label="Reason for visit"
        value={reason}
        onChangeText={setReason}
        editable={!capture.isPending}
      />
      <Field
        label="Notes"
        value={notes}
        onChangeText={setNotes}
        multiline
        style={styles.multiline}
        editable={!capture.isPending}
      />

      <Text style={styles.sectionTitle}>Pages</Text>

      {pages.length === 0 ? (
        <Text style={styles.muted}>No pages added yet.</Text>
      ) : (
        pages.map((page, index) => (
          <View key={page.key} style={styles.pageRow}>
            <Text style={styles.pageLabel} numberOfLines={1}>
              Page {index + 1}
              {page.name ? ` · ${page.name}` : ''}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                removePage(page.key);
              }}
              disabled={capture.isPending}
            >
              <Text style={styles.remove}>Remove</Text>
            </Pressable>
          </View>
        ))
      )}

      <View style={styles.row}>
        {Platform.OS === 'web' ? null : (
          <View style={styles.rowItem}>
            <Button
              label="Take photo"
              variant="secondary"
              onPress={handleTakePhoto}
              disabled={capture.isPending}
            />
          </View>
        )}
        <View style={styles.rowItem}>
          <Button
            label="Choose image"
            variant="secondary"
            onPress={handlePickFromLibrary}
            disabled={capture.isPending}
          />
        </View>
      </View>

      <Text style={styles.sectionTitle}>Medicines</Text>

      {medications.map((row) => (
        <View key={row.key} style={styles.medication}>
          <Field
            label="Name"
            value={row.name}
            onChangeText={(text) => {
              updateMedication(row.key, { name: text });
            }}
            autoCapitalize="words"
            editable={!capture.isPending}
          />
          <Field
            label="Strength"
            value={row.strength}
            onChangeText={(text) => {
              updateMedication(row.key, { strength: text });
            }}
            placeholder="500 mg"
            autoCapitalize="none"
            editable={!capture.isPending}
          />
          <Field
            label="Frequency"
            value={row.frequencyCode}
            onChangeText={(text) => {
              updateMedication(row.key, { frequencyCode: text });
            }}
            placeholder="1-0-1"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!capture.isPending}
          />
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              removeMedication(row.key);
            }}
            disabled={capture.isPending}
          >
            <Text style={styles.remove}>Remove medicine</Text>
          </Pressable>
        </View>
      ))}

      <Button
        label="Add a medicine"
        variant="secondary"
        onPress={addMedicationRow}
        disabled={capture.isPending}
      />

      <View style={styles.actions}>
        <Button
          label="Save visit"
          onPress={handleSave}
          busy={capture.isPending}
          disabled={!selectedPatientId}
        />
        <Button
          label="Cancel"
          variant="secondary"
          onPress={() => {
            router.back();
          }}
          disabled={capture.isPending}
        />
      </View>

      <Text style={styles.disclaimer}>
        A record of what was prescribed. Not medical advice.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: {
    padding: 16,
    paddingBottom: 48,
    gap: 12,
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
    marginTop: 16,
  },
  muted: { fontSize: 14, color: colors.muted },
  link: { fontSize: 15, fontWeight: '600', color: colors.accent, paddingVertical: 8 },
  inlineAdd: {
    gap: 10,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 14,
  },
  multiline: { minHeight: 96, textAlignVertical: 'top' },
  pageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  pageLabel: { flex: 1, fontSize: 14, color: colors.text },
  remove: { fontSize: 14, fontWeight: '600', color: colors.danger },
  row: { flexDirection: 'row', gap: 10 },
  rowItem: { flex: 1 },
  medication: {
    gap: 10,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 14,
  },
  actions: { gap: 10, marginTop: 24 },
  partial: {
    gap: 10,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 14,
  },
  partialText: { fontSize: 14, color: colors.text },
  disclaimer: {
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 28,
    paddingHorizontal: 24,
  },
});