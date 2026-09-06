import {
    ActivityIndicator,
    Image,
    StyleSheet,
    Text,
    View,
    type ImageStyle,
    type StyleProp,
    type ViewStyle,
} from 'react-native';
import { useAttachmentImage } from '@/data/usePrescriptionDetail';
import type { ImageVariant } from '@/data/prescriptionRepository';
import { colors } from '@/ui';

export function AuthenticatedImage({
    attachmentId,
    variant = 'full',
    style,
}: {
    attachmentId: string;
    variant?: ImageVariant;
    /** Must be valid for both the <View> placeholders and the <Image>. */
    style?: StyleProp<ViewStyle & ImageStyle>;
}) {
    const { data: uri, isPending, isError } = useAttachmentImage(attachmentId, variant);

    if (isPending) {
        return (
            <View style={[styles.placeholder, style]}>
                <ActivityIndicator color={colors.muted} />
            </View>
        );
    }

    if (isError || !uri) {
        return (
            <View style={[styles.placeholder, style]}>
                <Text style={styles.failed}>Page unavailable</Text>
            </View>
        );
    }

    return (
        <Image
            source={{ uri }}
            style={[styles.image, style]}
            resizeMode="contain"
            accessibilityRole="image"
            accessibilityLabel="Prescription page"
        />
    );
}

const styles = StyleSheet.create({
    image: { flex: 1, backgroundColor: colors.card },
    placeholder: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.card,
    },
    failed: { color: colors.muted, fontSize: 14 },
});