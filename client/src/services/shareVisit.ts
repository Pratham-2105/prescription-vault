import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File } from 'expo-file-system';
import type { Medication, Prescription } from '@/domain/prescription';
import {
  buildVisitHtml,
  type EmbeddedPage,
} from '@/features/prescriptions/buildVisitHtml';

/** Raised when the PDF cannot be produced or the device cannot share it. */
export class ShareError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ShareError';
  }
}

export type ShareVisitArgs = {
  prescription: Prescription;
  patientName: string;
  medications: Medication[];
  /**
   * Returns a renderable reference to one attachment's full-size image.
   * Locally that is a file:// URI; over HTTP it is already a data URI.
   */
  readImage: (attachmentId: string) => Promise<string>;
};

/**
 * Renders a visit as a PDF and opens the system share sheet.
 *
 * This is the answer to "a relative needs these records while the holder is in
 * hospital" — and it needs no account, no server, and no connection. A PDF
 * through WhatsApp reaches anyone, and the recipient needs nothing installed.
 *
 * ⚠️ Does not work in Expo Go. printToFileAsync writes into Expo Go's own
 * sandbox, whose FileProvider does not expose that directory to other apps, so
 * shareAsync is rejected with "Not allowed to read file under given URL". A
 * development build has its own package identity and its own provider, and
 * this works there.
 */
export async function shareVisit({
  prescription,
  patientName,
  medications,
  readImage,
}: ShareVisitArgs): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new ShareError('Sharing is not available on this device.');
  }

  const pages = await embedPages(prescription, readImage);
  const html = buildVisitHtml(prescription, patientName, medications, pages);

  let uri: string;
  try {
    ({ uri } = await Print.printToFileAsync({ html }));
  } catch (error) {
    throw new ShareError('Could not produce the PDF.', { cause: error });
  }

  try {
    // Shared straight from where printToFileAsync wrote it. Copying the PDF
    // somewhere friendlier first — even into the app's own cache — produces a
    // path the FileProvider does not recognise and the share is refused. An
    // earlier version renamed the file for the recipient and broke this way.
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      UTI: '.pdf',
      dialogTitle: 'Share this visit',
    });
  } catch (error) {
    throw new ShareError('Could not open the share sheet.', { cause: error });
  }
}

/**
 * Reads each page into a base64 data URI.
 *
 * The bytes have to be inline in the HTML: the print renderer runs in its own
 * context and will not reliably follow a file:// path out to the app's
 * storage. This is why the local repository's URI cannot be used directly,
 * even though <Image> accepts it happily.
 *
 * Sequential rather than concurrent: each image is a few hundred kilobytes of
 * base64, and decoding several at once on a mid-range phone is how you run out
 * of memory. A visit has a handful of pages, so the wait is not worth the risk.
 *
 * A page that cannot be read is skipped rather than failing the whole export.
 * A PDF missing one scan is still worth sending; an error message is not.
 */
async function embedPages(
  prescription: Prescription,
  readImage: (attachmentId: string) => Promise<string>,
): Promise<EmbeddedPage[]> {
  const pages: EmbeddedPage[] = [];

  for (const attachment of prescription.attachments) {
    // PDFs cannot be embedded in an HTML document as an image, and
    // re-rendering one is out of scope.
    if (attachment.contentType === 'application/pdf') continue;

    try {
      const source = await readImage(attachment.id);
      const embedded = source.startsWith('data:') ? source : await toDataUri(source);
      
      pages.push({
        pageNumber: attachment.pageNumber,
        dataUri: embedded,
      });
    } catch (error) {
      console.log('PAGE FAILED', attachment.pageNumber, error);
      continue;
    }
  }

  return pages;
}

/**
 * Reads a stored file as a data URI.
 *
 * Always image/jpeg: the on-device pipeline re-encodes every image to JPEG, so
 * anything with a thumbnail is a JPEG regardless of what was originally
 * picked.
 */
async function toDataUri(fileUri: string): Promise<string> {
  return `data:image/jpeg;base64,${await new File(fileUri).base64()}`;
}