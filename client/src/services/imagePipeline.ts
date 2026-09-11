import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Directory, File, Paths } from 'expo-file-system';
import type { PickedFile } from '@/api/upload';

/**
 * The on-device equivalent of app/services/images.py.
 *
 * The server's Pillow pipeline cannot run offline, so the phone does the same
 * work: cap the long edge, re-encode as JPEG, generate a 400px preview, and
 * write both into permanent storage. The numbers deliberately match the
 * server's so a record captured offline is indistinguishable from one captured
 * online.
 *
 * What is NOT replicated: magic-byte sniffing. On the server the bytes arrive
 * from an untrusted client and the declared type is an attacker-controlled
 * string. Here the file comes from the OS picker on the user's own device, so
 * there is no attacker to defend against — and the manipulator fails loudly on
 * anything it cannot decode, which covers the honest-mistake case.
 */

/** Longest edge of the stored page. Matches the server's cap. */
const MAX_EDGE = 2400;

/** Longest edge of the preview. Matches the server's thumbnail. */
const THUMBNAIL_EDGE = 400;

/**
 * JPEG quality. 0.8 is the usual knee in the curve — below it, text on a
 * photographed prescription starts to smear, which is the one thing this
 * app cannot afford to lose.
 */
const JPEG_QUALITY = 0.8;

/** Where attachments live, under the document directory. */
const ATTACHMENTS_DIRECTORY = 'attachments';

export type ProcessedImage = {
  /** file:// URI of the full-size page, in permanent storage. */
  localUri: string;
  /** file:// URI of the 400px preview, or null for PDFs. */
  thumbnailUri: string | null;
  contentType: string;
  sizeBytes: number;
};

/** Raised when the device cannot read or process the picked file. */
export class ImageProcessingError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ImageProcessingError';
  }
}

/**
 * Processes a picked file into permanent local storage.
 *
 * `attachmentId` names the files, so a row in the attachments table and its
 * bytes on disk are trivially correlated — useful when cleaning up orphans
 * later, and it makes the filename unguessable without being a secret.
 */
export async function processPickedFile(
  file: PickedFile,
  attachmentId: string,
): Promise<ProcessedImage> {
  const directory = ensureAttachmentsDirectory();

  if (isPdf(file)) {
    return storePdf(file, attachmentId, directory);
  }
  return storeImage(file, attachmentId, directory);
}

/**
 * Deletes an attachment's files. Safe to call when they are already gone.
 *
 * SQLite's ON DELETE CASCADE removes the row; nothing removes the bytes, so
 * the repository has to call this explicitly or the document directory grows
 * forever with files no row references.
 */
export function deleteAttachmentFiles(image: {
  localUri: string;
  thumbnailUri: string | null;
}): void {
  deleteQuietly(image.localUri);
  if (image.thumbnailUri) deleteQuietly(image.thumbnailUri);
}

// ---------------------------------------------------------------- internals

function isPdf(file: PickedFile): boolean {
  if (file.mimeType === 'application/pdf') return true;
  return file.uri.toLowerCase().split('?')[0]?.endsWith('.pdf') ?? false;
}

/**
 * PDFs pass through unchanged and get no preview — the same rule the server
 * applies. There is no decoder here, and re-encoding a document would destroy
 * the text layer that makes it worth keeping as a PDF.
 */
function storePdf(
  file: PickedFile,
  attachmentId: string,
  directory: Directory,
): ProcessedImage {
  const destination = new File(directory, `${attachmentId}.pdf`);

  try {
    new File(file.uri).copy(destination);
  } catch (error) {
    throw new ImageProcessingError('Could not save that document.', { cause: error });
  }

  return {
    localUri: destination.uri,
    thumbnailUri: null,
    contentType: 'application/pdf',
    sizeBytes: sizeOf(destination),
  };
}

async function storeImage(
  file: PickedFile,
  attachmentId: string,
  directory: Directory,
): Promise<ProcessedImage> {
  const { width, height } = await probeDimensions(file.uri);

  const fullUri = await renderResizedJpeg(
    file.uri,
    fitWithin(width, height, MAX_EDGE),
    new File(directory, `${attachmentId}.jpg`),
  );

  const thumbnailUri = await renderResizedJpeg(
    file.uri,
    fitWithin(width, height, THUMBNAIL_EDGE),
    new File(directory, `${attachmentId}_thumb.jpg`),
  );

  return {
    localUri: fullUri,
    thumbnailUri,
    contentType: 'image/jpeg',
    sizeBytes: sizeOf(new File(fullUri)),
  };
}

/** Reads the image's dimensions without transforming it. */
async function probeDimensions(uri: string): Promise<{ width: number; height: number }> {
  const context = ImageManipulator.manipulate(uri);
  try {
    const image = await context.renderAsync();
    try {
      return { width: image.width, height: image.height };
    } finally {
      // These hold native bitmaps. Without release() a few large photos in a
      // row will push a mid-range phone into an out-of-memory crash — the JS
      // garbage collector does not know how much native memory is behind the
      // handle.
      image.release();
    }
  } catch (error) {
    throw new ImageProcessingError('That file is not a readable image.', { cause: error });
  } finally {
    context.release();
  }
}

/**
 * Resizes, re-encodes as JPEG, and moves the result into permanent storage.
 *
 * The move matters. `saveAsync` writes to the **cache** directory, which the
 * OS is free to purge under storage pressure — for an app whose premise is
 * "your prescriptions are safe here," leaving medical records there would be
 * silent data loss. Everything ends up under the document directory instead.
 *
 * The re-encode is also what strips EXIF, including the GPS coordinates of the
 * clinic. That is the same mechanism Pillow uses server-side: decode to
 * pixels, write a fresh file, and the metadata has nowhere to survive.
 * ⚠️ This must be verified on a real device with a planted GPS marker before
 * shipping — it is the one security property that would be lost silently.
 */
async function renderResizedJpeg(
  sourceUri: string,
  size: { width: number; height: number },
  destination: File,
): Promise<string> {
  const context = ImageManipulator.manipulate(sourceUri);

  try {
    const image = await context.resize(size).renderAsync();
    try {
      const saved = await image.saveAsync({
        format: SaveFormat.JPEG,
        compress: JPEG_QUALITY,
      });

      const cached = new File(saved.uri);
      if (destination.exists) destination.delete();
      cached.move(destination);

      return destination.uri;
    } finally {
      image.release();
    }
  } catch (error) {
    throw new ImageProcessingError('Could not process that image.', { cause: error });
  } finally {
    context.release();
  }
}

/**
 * Scales dimensions so the longest edge is at most `maxEdge`, never enlarging.
 *
 * Done here rather than passing a single dimension to `resize()`: that
 * constrains one axis and lets the other follow, which caps width on a
 * landscape photo but leaves a tall portrait scan far over budget.
 */
function fitWithin(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };

  const scale = maxEdge / longest;
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

function ensureAttachmentsDirectory(): Directory {
  const directory = new Directory(Paths.document, ATTACHMENTS_DIRECTORY);
  if (!directory.exists) directory.create();
  return directory;
}

function sizeOf(file: File): number {
  return file.size ?? 0;
}

function deleteQuietly(uri: string): void {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // A missing file is the desired end state either way.
  }
}