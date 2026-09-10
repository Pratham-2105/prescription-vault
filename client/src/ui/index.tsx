import { type Ref } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

export const colors = {
  bg: '#F7F7F5',
  card: '#FFFFFF',
  text: '#1A1A18',
  muted: '#6B6B66',
  border: '#E2E2DD',
  accent: '#2F6F4E',
  danger: '#B3261E',
};

export function Field({
  label,
  error,
  style,
  ref,
  ...props
}: TextInputProps & {
  label: string;
  error?: string;
  /**
   * React 19 passes `ref` to function components as an ordinary prop, so no
   * forwardRef wrapper is needed. TextInputProps does not include it, hence
   * the explicit declaration.
   *
   * The capture form uses this to chain returnKeyType="next" from one field
   * to the focus() of the next.
   */
  ref?: Ref<TextInput>;
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        ref={ref}
        // `style` is pulled out of props above and merged here on purpose.
        // TextInputProps includes it, so leaving it in the spread would let a
        // caller silently replace the input styling — and the error border
        // with it — just by passing a height override.
        style={[styles.input, error ? styles.inputError : null, style]}
        placeholderTextColor={colors.muted}
        accessibilityLabel={label}
        {...props}
      />
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

export type ButtonVariant = 'primary' | 'secondary' | 'danger';

export function Button({
  label,
  onPress,
  busy = false,
  disabled = false,
  variant = 'primary',
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  variant?: ButtonVariant;
}) {
  const inactive = busy || disabled;
  const isSecondary = variant === 'secondary';

  return (
    <Pressable
      accessibilityRole="button"
      // Tells screen readers the button is unavailable, and why. Without this
      // the control still announces as tappable while `disabled` silently
      // swallows the press.
      accessibilityState={{ disabled: inactive, busy }}
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.button,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'danger' && styles.buttonDanger,
        inactive && styles.buttonDisabled,
        pressed && !inactive && styles.buttonPressed,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={isSecondary ? colors.accent : '#FFF'} />
      ) : (
        <Text style={[styles.buttonLabel, isSecondary && styles.buttonLabelSecondary]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export type ChipOption = {
  /** Stable identity — a UUID from the API, not an array index. */
  id: string;
  label: string;
};

/**
 * Horizontal single-select. Used for the patient switcher.
 *
 * Chips rather than a modal picker because a family list is short and the
 * capture flow is measured in seconds: a chip is one tap, a picker is
 * tap-scroll-confirm. If the list ever outgrows a scroll row, that is the
 * point to reconsider — not before.
 */
export function ChipGroup({
  label,
  options,
  selectedId,
  onSelect,
  disabled = false,
}: {
  label: string;
  options: ChipOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        // Padding belongs on contentContainerStyle, not style: on the
        // ScrollView itself it clips the scrollable area instead of insetting
        // the content, so the last chip sits under the edge.
        contentContainerStyle={styles.chipRow}
        keyboardShouldPersistTaps="handled"
      >
        {options.map((option) => {
          const selected = option.id === selectedId;
          return (
            <Pressable
              key={option.id}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled }}
              disabled={disabled}
              onPress={() => {
                onSelect(option.id);
              }}
              style={({ pressed }) => [
                styles.chip,
                selected && styles.chipSelected,
                disabled && styles.chipDisabled,
                pressed && !disabled && styles.chipPressed,
              ]}
            >
              <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <View style={styles.banner}>
      <Text style={styles.bannerText}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fieldWrap: { gap: 6 },
  label: { fontSize: 13, fontWeight: '600', color: colors.muted },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
  },
  inputError: { borderColor: colors.danger },
  fieldError: { fontSize: 12, color: colors.danger },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  buttonSecondary: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  buttonDanger: { backgroundColor: colors.danger },
  buttonPressed: { opacity: 0.85 },
  buttonDisabled: { opacity: 0.5 },
  buttonLabel: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  buttonLabelSecondary: { color: colors.text },
  chipRow: { gap: 8, paddingVertical: 2, paddingRight: 4 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: 999,
    paddingHorizontal: 14,
    // 44 is the smallest reliably tappable target on both platforms.
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: 'center',
  },
  chipSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipPressed: { opacity: 0.85 },
  chipDisabled: { opacity: 0.5 },
  chipLabel: { fontSize: 15, color: colors.text },
  chipLabelSelected: { color: '#FFF', fontWeight: '600' },
  banner: {
    backgroundColor: '#FDECEA',
    borderColor: '#F5C6C2',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  bannerText: { color: colors.danger, fontSize: 14 },
});