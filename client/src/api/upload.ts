/**
 * Turns a locally-picked file (camera roll, camera, document picker) into the
 * multipart body the attachment endpoint expects.
 *
 * POST /api/v1/prescriptions/{id}/attachments takes multipart/form-data with a
 * single field named "file" (see Body_upload_attachment_… in types/api.d.ts).
 *
 * Why fetch-then-blob instead of React Native's {uri, name, type} form part:
 * that shape is a React Native extension that the DOM FormData typings do not
 * describe, so using it requires lying to the compiler with a cast. Reading the
 * URI into a Blob gives one code path that is honestly typed on both web and
 * native, and — importantly — keeps the upload inside ApiClient, where the
 * bearer token and the refresh-on-401 races are already solved and tested.
 *
 * The cost is that the file sits in JS memory during the upload. The backend
 * caps attachments at 10 MB, so that ceiling is bounded and acceptable.
 */

/** Backend's attachment size cap. Mirrored here to fail early with a clear message. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** The multipart field name the endpoint reads. */
const FILE_FIELD = 'file';

/**
 * A file chosen by the user. Shaped to match what expo-image-picker and
 * expo-document-picker hand back, so callers can pass their asset through
 * with minimal reshaping.
 */
export type PickedFile = {
  /** Local URI: file:// or content:// on native, blob:/data: on web. */
  uri: string;
  /** Original filename, when the picker knows it. */
  name?: string | null;
  /** MIME type, when the picker knows it. */
  mimeType?: string | null;
};

/**
 * Raised when the local file cannot be read, or is too large to send.
 *
 * A distinct class so screens can tell "your phone would not give me this
 * file" apart from ApiError, which means the server said no. They need
 * different messages and different retry affordances.
 */
export class FileReadError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'FileReadError';
  }
}

/**
 * Reads a picked file and builds its multipart body.
 *
 * Throws FileReadError if the URI cannot be read or the file exceeds the cap.
 * Does not perform the request — hand the result to the repository, which
 * posts it through ApiClient.
 */
export async function buildAttachmentForm(file: PickedFile): Promise<FormData> {
  const blob = await readAsBlob(file);

  if (blob.size === 0) {
    throw new FileReadError('That file came back empty. Try picking it again.');
  }
  if (blob.size > MAX_UPLOAD_BYTES) {
    throw new FileReadError(
      `That file is ${formatBytes(blob.size)}. The limit is ${formatBytes(MAX_UPLOAD_BYTES)}.`,
    );
  }

  const form = new FormData();
  // Third argument is the part's filename. On web this populates
  // original_filename; on React Native, FormData's append() historically
  // accepts only two arguments and derives the name from the Blob instead, so
  // original_filename may come back null there. A cosmetic difference — verify
  // on the physical device and, if it matters, fall back to naming the Blob.
  form.append(FILE_FIELD, blob, deriveFileName(file, blob));
  return form;
}

/** Reads any local URI into a Blob, normalising failure into FileReadError. */
async function readAsBlob(file: PickedFile): Promise<Blob> {
  let response: Response;
  try {
    // fetch() on a local URI is a read, not a network call — no auth, no
    // ApiClient. Android in particular has been historically fussy about
    // content:// URIs here; if this throws on device, that is the signal to
    // move to a platform-split upload module instead.
    response = await fetch(file.uri);
  } catch (error) {
    throw new FileReadError('Could not open that file on this device.', { cause: error });
  }

  try {
    return await response.blob();
  } catch (error) {
    throw new FileReadError('Could not read that file on this device.', { cause: error });
  }
}

/**
 * Best available filename: what the picker said, else the last path segment of
 * the URI, else a generic name with an extension guessed from the MIME type.
 */
function deriveFileName(file: PickedFile, blob: Blob): string {
  const fromPicker = file.name?.trim();
  if (fromPicker) return fromPicker;

  const fromUri = lastPathSegment(file.uri);
  if (fromUri) return fromUri;

  const mime = file.mimeType ?? (blob.type || null);
  return `attachment${extensionForMimeType(mime)}`;
}

/** Last path segment of a URI, with query and fragment stripped. Null if none. */
function lastPathSegment(uri: string): string | null {
  const withoutFragment = uri.split('#')[0] ?? '';
  const withoutQuery = withoutFragment.split('?')[0] ?? '';
  const segments = withoutQuery.split('/');

  // Indexed access is `string | undefined` under noUncheckedIndexedAccess, and
  // here it genuinely can be: split() on an empty string yields [''], and a URI
  // ending in '/' yields a trailing ''.
  const last = segments[segments.length - 1];
  if (last === undefined) return null;

  const decoded = safeDecode(last).trim();
  return decoded.length > 0 ? decoded : null;
}

/** decodeURIComponent throws on malformed escapes; a bad name is not fatal. */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Extension for the types the backend accepts. Empty string when unknown. */
function extensionForMimeType(mimeType: string | null): string {
  switch (mimeType) {
    case 'image/jpeg':
      return '.jpg';
    case 'image/png':
      return '.png';
    case 'image/webp':
      return '.webp';
    case 'application/pdf':
      return '.pdf';
    default:
      return '';
  }
}

/** Human-readable size for error messages. */
function formatBytes(bytes: number): string {
  const megabytes = bytes / (1024 * 1024);
  return megabytes >= 1 ? `${megabytes.toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
}