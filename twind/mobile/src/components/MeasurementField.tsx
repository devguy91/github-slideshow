/**
 * A single centimetre input. All fields are optional and individually typeable.
 * Picker-derived values are prefilled and clearly labelled "estimate"; typing over
 * them turns the source into "typed".
 */
import React from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { MeasurementSource } from '../api/types';
import { colors, radius, spacing, type } from '../theme';

type Props = {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  /** How-to copy. Always phrased as a GARMENT measurement. */
  instruction?: string;
  source?: MeasurementSource | undefined;
  required?: boolean;
  optionalNote?: string;
  error?: string | null;
  testID?: string;
};

const SOURCE_LABEL: Record<MeasurementSource, string> = {
  picker: 'estimate',
  garment: 'from a garment',
  typed: 'typed',
};

export function MeasurementField({ label, value, onChangeText, instruction, source, required, optionalNote, error, testID }: Props) {
  const isEstimate = source === 'picker' && value !== '';
  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={type.label}>
          {label}
          {required ? <Text style={{ color: colors.danger }}> *</Text> : null}
        </Text>
        {isEstimate ? (
          <View style={styles.estimatePill}>
            <Text style={styles.estimateText}>{SOURCE_LABEL.picker}</Text>
          </View>
        ) : optionalNote ? (
          <Text style={type.caption}>{optionalNote}</Text>
        ) : !required ? (
          <Text style={type.caption}>optional</Text>
        ) : null}
      </View>
      {instruction ? <Text style={[type.small, { marginBottom: spacing.xs }]}>{instruction}</Text> : null}
      <View style={[styles.inputRow, error ? styles.inputError : null, isEstimate && styles.inputEstimate]}>
        <TextInput
          testID={testID}
          value={value}
          onChangeText={onChangeText}
          keyboardType="decimal-pad"
          inputMode="decimal"
          placeholder="—"
          placeholderTextColor={colors.textFaint}
          style={[styles.input, isEstimate && { color: colors.textMuted, fontStyle: 'italic' }]}
          accessibilityLabel={`${label} in centimetres${isEstimate ? ', estimate' : ''}`}
          maxLength={6}
        />
        <Text style={styles.unit}>cm</Text>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.lg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  estimatePill: {
    backgroundColor: colors.warningBg,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  estimateText: { ...type.caption, color: colors.warning, fontWeight: '600' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    minHeight: 46,
  },
  inputEstimate: { borderStyle: 'dashed' },
  inputError: { borderColor: colors.danger },
  input: { flex: 1, fontSize: 16, color: colors.text, paddingVertical: 10 },
  unit: { ...type.small, marginLeft: spacing.sm },
  error: { ...type.small, color: colors.danger, marginTop: spacing.xs },
});
