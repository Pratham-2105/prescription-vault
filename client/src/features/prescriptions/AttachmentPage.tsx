import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAttachmentImage } from '@/data/usePrescriptionDetail';
import { AuthenticatedImage } from './AuthenticatedImage';
import type { Attachment } from '@/domain/prescription';
import { colors } from '@/ui';

export function AttachmentPage({ attachment }: { attachment: Attachment }) {
  if (attachment.contentType === 'application/pdf') {
    return <PdfPage attachment={attachment} />;
  }
  return <AuthenticatedImage attachmentId={attachment.id} variant="full" />;
}

/**
 * <Image> cannot render PDFs. Until a viewer lands, offer the bytes:
 * on web this opens a new tab, on native it is a placeholder with an
 * explicit message rather than a silently blank page.
 */
function PdfPage({ attachment }: { attachment: Attachment }) {
  const { data: uri, isPending, isError } = useAttachmentImage(attachment.id, 'full');

  const openable = Platform.OS === 'web' && !!uri;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>PDF document</Text>
      <Text style={styles.page}>Page {attachment.pageNumber}</Text>

      {isPending ? (
        <Text style={styles.muted}>Loading…</Text>
      ) : isError ? (
        <Text style={styles.muted}>Could not load this document.</Text>
      ) : openable ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => globalThis.open?.(uri, '_blank', 'noopener')}
        >
          <Text style={styles.link}>Open in a new tab</Text>
        </Pressable>
      ) : (
        <Text style={styles.muted}>
          PDF viewing on this device is not supported yet.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 24,
    backgroundColor: colors.card,
  },
  label: { fontSize: 16, fontWeight: '600', color: colors.text },
  page: { fontSize: 13, color: colors.muted },
  muted: { fontSize: 14, color: colors.muted, textAlign: 'center', marginTop: 8 },
  link: { fontSize: 15, fontWeight: '600', color: colors.accent, marginTop: 8 },
});