import type { ApiClient } from '@/api/client';
import type { components } from '@/types/api';
import type {
  Attachment,
  Medication,
  Page,
  Prescription,
  PrescriptionListItem,
} from '@/domain/prescription';
import type {
  ImageVariant,
  ListPrescriptionsArgs,
  PrescriptionRepository,
} from './prescriptionRepository';

// The generated OpenAPI types. Confirm these names exist in types/api.d.ts.
type ApiPage = components['schemas']['PrescriptionPage'];
type ApiItem = components['schemas']['PrescriptionListItem'];
type ApiPrescription = components['schemas']['PrescriptionRead'];
type ApiAttachment = components['schemas']['AttachmentRead'];
type ApiMedication = components['schemas']['MedicationRead'];

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

export class ApiPrescriptionRepository implements PrescriptionRepository {
  constructor(private readonly api: ApiClient) { }

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
    const dto = await this.api.get<ApiPrescription>(
      `/api/v1/prescriptions/${id}`,
      { signal },
    );
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
    const response = await this.api.raw(
      `/api/v1/attachments/${attachmentId}/${suffix}`,
      { signal },
    );
    return blobToDataUrl(await response.blob());
  }

}