import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {
  AccessibilityInfo,
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useEffect, useRef, type ReactNode } from 'react';

import { colors, fonts, radii, spacing, type } from '@/constants/tokens';

type FeatherName = keyof typeof Feather.glyphMap;

export function BrandMark({ size = 34 }: { size?: number }) {
  return (
    <View style={[styles.brandMark, { width: size, height: size, borderRadius: radii.md }]}>
      <Text style={[styles.brandMarkText, { fontSize: size * 0.42 }]}>V</Text>
    </View>
  );
}

export function BrandLockup() {
  return (
    <View style={styles.brandLockup}>
      <BrandMark />
      <View>
        <Text style={styles.brandName}>成剧</Text>
        <Text style={styles.brandSub}>VEYAFRAME</Text>
      </View>
    </View>
  );
}

export function ScreenHeader({
  title,
  kicker,
  left,
  right,
}: {
  title: string;
  kicker?: string;
  left?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <View style={styles.screenHeader}>
      {left}
      <View style={styles.screenHeaderCopy}>
        {kicker ? <Text style={styles.kicker}>{kicker}</Text> : null}
        <Text style={styles.screenTitle}>{title}</Text>
      </View>
      {right}
    </View>
  );
}

export function IconButton({
  icon,
  label,
  onPress,
  active = false,
  style,
}: {
  icon: FeatherName;
  label: string;
  onPress?: PressableProps['onPress'];
  active?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        active && styles.iconButtonActive,
        style,
        pressed && styles.pressed,
      ]}
    >
      <Feather name={icon} size={18} color={active ? colors.action : colors.textSecondary} />
    </Pressable>
  );
}

export function Panel({
  children,
  style,
  elevated = false,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  elevated?: boolean;
}) {
  return <View style={[styles.panel, elevated && styles.panelElevated, style]}>{children}</View>;
}

export function Kicker({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.kicker, style]}>{children}</Text>;
}

export function BodyText({
  children,
  dim = false,
  style,
}: {
  children: ReactNode;
  dim?: boolean;
  style?: StyleProp<TextStyle>;
}) {
  return <Text style={[styles.bodyText, dim && styles.bodyTextDim, style]}>{children}</Text>;
}

export function MonoText({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
}) {
  return <Text style={[styles.monoText, style]}>{children}</Text>;
}

export function ProgressTrack({
  value,
  segments = 1,
  color = colors.action,
}: {
  value: number;
  segments?: number;
  color?: string;
}) {
  if (segments > 1) {
    return (
      <View style={styles.segmentTrack}>
        {Array.from({ length: segments }).map((_, index) => (
          <View
            key={index}
            style={[
              styles.segment,
              { backgroundColor: index < value ? color : colors.lineStrong },
            ]}
          />
        ))}
      </View>
    );
  }

  return (
    <View style={styles.progressTrack}>
      <View
        style={[
          styles.progressFill,
          { width: `${Math.max(0, Math.min(100, value))}%`, backgroundColor: color },
        ]}
      />
    </View>
  );
}

export function StatusBadge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'action' | 'info' | 'warning' | 'danger' | 'success';
}) {
  const color =
    tone === 'action'
      ? colors.action
      : tone === 'info'
        ? colors.info
        : tone === 'warning'
          ? colors.warning
          : tone === 'danger'
            ? colors.danger
            : tone === 'success'
              ? colors.success
              : colors.textSecondary;
  const ink =
    tone === 'warning'
      ? colors.warningInk
      : tone === 'success'
        ? colors.successInk
        : color;

  return (
    <View style={[styles.badge, { borderColor: `${color}66`, backgroundColor: `${color}12` }]}>
      <View style={[styles.badgeDot, { backgroundColor: color }]} />
      <Text style={[styles.badgeText, { color: ink }]}>{children}</Text>
    </View>
  );
}

export function StatusDot({
  color = colors.info,
  pulse = false,
}: {
  color?: string;
  pulse?: boolean;
}) {
  const opacity = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    if (!pulse) return;
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((reduceMotion) => {
      if (!mounted || reduceMotion) return;
      Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: 1,
            duration: 850,
            useNativeDriver: Platform.OS !== 'web',
          }),
          Animated.timing(opacity, {
            toValue: 0.45,
            duration: 850,
            useNativeDriver: Platform.OS !== 'web',
          }),
        ]),
      ).start();
    });
    return () => {
      mounted = false;
      opacity.stopAnimation();
    };
  }, [opacity, pulse]);

  return <Animated.View style={[styles.statusDot, { backgroundColor: color, opacity }]} />;
}

export function PrimaryButton({
  label,
  icon = 'arrow-up',
  onPress,
  disabled = false,
  style,
}: {
  label: string;
  icon?: FeatherName;
  onPress?: PressableProps['onPress'];
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={(event) => {
        void Haptics.selectionAsync().catch(() => {});
        onPress?.(event);
      }}
      style={({ pressed }) => [
        styles.primaryButton,
        disabled && styles.disabled,
        pressed && styles.primaryPressed,
        style,
      ]}
    >
      <Text style={styles.primaryButtonText}>{label}</Text>
      <Feather name={icon} size={16} color={colors.actionInk} />
    </Pressable>
  );
}

export function SecondaryButton({
  label,
  icon,
  onPress,
  style,
  disabled = false,
}: {
  label: string;
  icon?: FeatherName;
  onPress?: PressableProps['onPress'];
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.secondaryButton,
        disabled && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}
    >
      {icon ? <Feather name={icon} size={16} color={colors.textSecondary} /> : null}
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </Pressable>
  );
}

export function ScreenFade({ children }: { children: ReactNode }) {
  return <View style={styles.fadeRoot}>{children}</View>;
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.divider, style]} />;
}

const styles = StyleSheet.create({
  brandMark: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.action,
  },
  brandMarkText: {
    color: colors.actionInk,
    fontWeight: '700',
  },
  brandLockup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  brandName: {
    color: colors.text,
    fontSize: type.body,
    fontWeight: '600',
  },
  brandSub: {
    marginTop: 1,
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: type.micro,
  },
  screenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  screenHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  kicker: {
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: type.micro,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  screenTitle: {
    color: colors.text,
    fontSize: type.title,
    fontWeight: '600',
    lineHeight: 29,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  iconButtonActive: {
    borderColor: 'rgba(184,101,79,0.34)',
    backgroundColor: colors.accentSoft,
  },
  pressed: {
    opacity: 0.72,
  },
  panel: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  panelElevated: {
    backgroundColor: colors.elevated,
    borderColor: colors.lineStrong,
  },
  bodyText: {
    color: colors.textSecondary,
    fontSize: type.body,
    lineHeight: 23,
  },
  bodyTextDim: {
    color: colors.textMuted,
    fontSize: type.label,
    lineHeight: 20,
  },
  monoText: {
    color: colors.textSecondary,
    fontFamily: fonts.mono,
    fontSize: type.caption,
    fontVariant: ['tabular-nums'],
  },
  progressTrack: {
    height: 4,
    overflow: 'hidden',
    borderRadius: 2,
    backgroundColor: colors.lineStrong,
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  segmentTrack: {
    flexDirection: 'row',
    gap: 4,
  },
  segment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  badge: {
    minHeight: 26,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: 8,
  },
  badgeDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  badgeText: {
    fontSize: type.micro,
    fontWeight: '600',
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  primaryButton: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radii.md,
    backgroundColor: colors.action,
    paddingHorizontal: spacing.lg,
  },
  primaryButtonText: {
    color: colors.actionInk,
    fontSize: type.label,
    fontWeight: '600',
  },
  primaryPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.99 }],
  },
  disabled: {
    opacity: 0.45,
  },
  secondaryButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
  },
  secondaryButtonText: {
    color: colors.textSecondary,
    fontSize: type.label,
    fontWeight: '500',
  },
  fadeRoot: {
    flex: 1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
  },
});

