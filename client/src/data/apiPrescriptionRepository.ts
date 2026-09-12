import type { ApiClient } from '@/api/client';
import { buildAttachmentForm, type PickedFile } from '@/api/upload';
import type { components } from '@/types/api';
import type {
  Attachment,
  Medication,
  NewMedication,
  NewPrescription,
  Page,
  Prescription,
  PrescriptionEdit,
  PrescriptionListItem,
} from '@/domain/prescription';
import type {
  ImageVariant,
  ListPrescriptionsArgs,
  PrescriptionRepository,
} from './prescriptionRepository';

// The generated OpenAPI types.
type ApiPage = components['schemas']['PrescriptionPage'];
type ApiItem = components['schemas']['PrescriptionListItem'];
type ApiPrescription = components['schemas']['PrescriptionRead'];
type ApiPrescriptionCreate = components['schemas']['PrescriptionCreate'];
type ApiPrescriptionUpdate = components['schemas']['PrescriptionUpdate'];
type ApiAttachment = components['schemas']['AttachmentRead'];
type ApiMedication = components['schemas']['MedicationRead'];
type ApiMedicationCreate = components['schemas']['MedicationCreate'];

/** Wire format -> domain. The one place snake_case is allowed to exist. */
function toDomain(dto: ApiItem): PrescriptionListItem {
  return {
    id: dto.id,
    patientId: dto.patient_id,
    visitDate: dto.visit_date,
    doctorName: dto.doctor_name ?? null,
    clinicName: dto.clinic_name ?? null,
    reason: dto.reason ?? null,
    attachmentCount: dto.attachment_count,
    medicationCount: dto.medication_count,
    // `?? null` on purpose: the wire type is `string | null | undefined`
    // because the field is both optional and nullable in the schema. The
    // domain type has two states, not three.
    thumbnailAttachmentId: dto.thumbnail_attachment_id ?? null,
  };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read image data.'));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        resolve(result);
      } else {
        reject(new Error('Unexpected image encoding.'));
      }
    };
    reader.readAsDataURL(blob);
  });
}

function attachmentToDomain(dto: ApiAttachment): Attachment {
  return {
    id: dto.id,
    pageNumber: dto.page_number,
    contentType: dto.content_type,
    sizeBytes: dto.size_bytes,
    hasThumbnail: dto.has_thumbnail,
  };
}

function medicationToDomain(dto: ApiMedication): Medication {
  return {
    id: dto.id,
    name: dto.name,
    strength: dto.strength ?? null,
    form: dto.form ?? null,
    frequencyCode: dto.frequency_code ?? null,
    foodRelation: dto.food_relation ?? null,
    durationDays: dto.duration_days ?? null,
    startDate: dto.start_date ?? null,
    isActive: dto.is_active,
  };
}

function prescriptionToDomain(dto: ApiPrescription): Prescription {
  return {
    id: dto.id,
    patientId: dto.patient_id,
    visitDate: dto.visit_date,
    doctorName: dto.doctor_name ?? null,
    clinicName: dto.clinic_name ?? null,
    specialty: dto.specialty ?? null,
    reason: dto.reason ?? null,
    notes: dto.notes ?? null,
    attachments: (dto.attachments ?? [])
      .map(attachmentToDomain)
      .sort((a, b) => a.pageNumber - b.pageNumber),
  };
}

/** Blank input is an absent value, not an empty string. */
function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export class ApiPrescriptionRepository implements PrescriptionRepository {
  constructor(private readonly api: ApiClient) {}

  async list({
    limit,
    offset,
    signal,
    ...filters
  }: ListPrescriptionsArgs): Promise<Page<PrescriptionListItem>> {
    // ApiClient.request drops undefined/null query values, so absent
    // filters simply don't appear in the URL.
    const page = await this.api.get<ApiPage>('/api/v1/prescriptions', {
      query: {
        limit,
        offset,
        patient_id: filters.patientId,
        doctor: filters.doctor,
        clinic: filters.clinic,
        date_from: filters.dateFrom,
        date_to: filters.dateTo,
        q: filters.q,
      },
      signal,
    });

    return {
      items: page.items.map(toDomain),
      total: page.total,
      limit: page.limit,
      offset: page.offset,
    };
  }

  async getById(id: string, signal?: AbortSignal): Promise<Prescription> {
    const dto = await this.api.get<ApiPrescription>(`/api/v1/prescriptions/${id}`, {
      signal,
    });
    return prescriptionToDomain(dto);
  }

  async listMedications(
    prescriptionId: string,
    signal?: AbortSignal,
  ): Promise<Medication[]> {
    const items = await this.api.get<ApiMedication[]>(
      `/api/v1/prescriptions/${prescriptionId}/medications`,
      { signal },
    );
    return items.map(medicationToDomain);
  }

  async fetchAttachmentImage(
    attachmentId: string,
    variant: ImageVariant,
    signal?: AbortSignal,
  ): Promise<string> {
    const suffix = variant === 'thumbnail' ? 'thumbnail' : 'file';
    const response = await this.api.raw(`/api/v1/attachments/${attachmentId}/${suffix}`, {
      signal,
    });
    return blobToDataUrl(await response.blob());
  }

  // ------------------------------------------------------------------ writes

  async create(input: NewPrescription, signal?: AbortSignal): Promise<Prescription> {
    const body: ApiPrescriptionCreate = {
      patient_id: input.patientId,
      visit_date: input.visitDate,
      doctor_name: emptyToNull(input.doctorName),
      clinic_name: emptyToNull(input.clinicName),
      specialty: emptyToNull(input.specialty),
      reason: emptyToNull(input.reason),
      notes: emptyToNull(input.notes),
    };

    const dto = await this.api.post<ApiPrescription>('/api/v1/prescriptions', {
      body,
      signal,
    });
    return prescriptionToDomain(dto);
  }

  async update(
    id: string,
    input: PrescriptionEdit,
    signal?: AbortSignal,
  ): Promise<Prescription> {
    // Every field is sent, including the nulls. The endpoint uses
    // exclude_unset, so an omitted key is left untouched — clearing a doctor
    // name therefore requires sending null explicitly rather than dropping it.
    const body: ApiPrescriptionUpdate = {
      visit_date: input.visitDate,
      doctor_name: emptyToNull(input.doctorName),
      clinic_name: emptyToNull(input.clinicName),
      specialty: emptyToNull(input.specialty),
      reason: emptyToNull(input.reason),
      notes: emptyToNull(input.notes),
    };

    const dto = await this.api.patch<ApiPrescription>(`/api/v1/prescriptions/${id}`, {
      body,
      signal,
    });
    return prescriptionToDomain(dto);
  }

  async uploadAttachment(
    prescriptionId: string,
    file: PickedFile,
    signal?: AbortSignal,
  ): Promise<Attachment> {
    // Reads the local file and throws FileReadError if the device refuses.
    const multipart = await buildAttachmentForm(file);

    const dto = await this.api.post<ApiAttachment>(
      `/api/v1/prescriptions/${prescriptionId}/attachments`,
      { multipart, signal },
    );
    return attachmentToDomain(dto);
  }

  async addMedication(
    prescriptionId: string,
    input: NewMedication,
    signal?: AbortSignal,
  ): Promise<Medication> {
    const body: ApiMedicationCreate = {
      name: input.name.trim(),
      strength: emptyToNull(input.strength),
      form: emptyToNull(input.form),
      frequency_code: emptyToNull(input.frequencyCode),
      food_relation: input.foodRelation ?? null,
      duration_days: input.durationDays ?? null,
      start_date: input.startDate ?? null,
    };

    const dto = await this.api.post<ApiMedication>(
      `/api/v1/prescriptions/${prescriptionId}/medications`,
      { body, signal },
    );
    return medicationToDomain(dto);
  }

  async deleteAttachment(attachmentId: string, signal?: AbortSignal): Promise<void> {
    // The server owns the stored bytes and removes them with the row. The
    // SQLite implementation has to delete the files itself.
    await this.api.delete<void>(`/api/v1/attachments/${attachmentId}`, { signal });
  }

  async deleteMedication(medicationId: string, signal?: AbortSignal): Promise<void> {
    await this.api.delete<void>(`/api/v1/medications/${medicationId}`, { signal });
  }
}