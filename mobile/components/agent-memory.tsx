import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing, type } from '@/constants/tokens';
import type { WorkspaceAgentMemory } from '@/lib/workspace-api';

export function AgentMemory({ memory }: { memory: WorkspaceAgentMemory }) {
  const [open, setOpen] = useState(false);
  const count = [
    memory.lockedCharacters,
    memory.lockedPlaces,
    memory.acceptedDecisions,
    memory.lockedDecisions,
    memory.rejectedDirections,
    memory.openComments,
  ].reduce((sum, items) => sum + items.length, 0);
  const sections = [
    { label: '锁定人物', values: memory.lockedCharacters },
    { label: '锁定地点', values: memory.lockedPlaces },
    { label: '已采纳判断', values: memory.acceptedDecisions },
    { label: '已锁定决策', values: memory.lockedDecisions },
    { label: '最近否决', values: memory.rejectedDirections },
    { label: '开放批注', values: memory.openComments },
  ].filter((section) => section.values.length > 0);

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        style={({ pressed }) => [styles.trigger, pressed && styles.pressed]}
      >
        <Feather name="database" size={14} color={colors.textSecondary} />
        <Text style={styles.triggerText}>它记住了什么</Text>
        <Text style={styles.count}>{count}</Text>
        <Feather
          name={open ? 'chevron-up' : 'chevron-down'}
          size={14}
          color={colors.textMuted}
        />
      </Pressable>

      {open ? (
        <View style={styles.content}>
          {sections.length === 0 ? (
            <Text style={styles.empty}>这个项目还没有形成可复用的创作记忆。</Text>
          ) : sections.map((section) => (
            <View key={section.label} style={styles.section}>
              <Text style={styles.sectionLabel}>{section.label}</Text>
              {section.values.map((value) => (
                <Text key={`${section.label}:${value}`} style={styles.item}>· {value}</Text>
              ))}
            </View>
          ))}
          <View style={styles.readScope}>
            <Text style={styles.scopeLabel}>本轮会读取</Text>
            <Text style={styles.scopeValue}>
              当前场次与镜头、锁定造型、最近决策、开放批注和额度。
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: spacing.xs,
    marginLeft: 42,
  },
  trigger: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingRight: spacing.sm,
  },
  triggerText: {
    color: colors.textSecondary,
    fontSize: type.micro,
    fontWeight: '500',
  },
  count: {
    minWidth: 18,
    color: colors.textMuted,
    fontSize: type.micro,
    textAlign: 'center',
  },
  content: {
    gap: spacing.sm,
    borderLeftWidth: 1,
    borderLeftColor: colors.lineStrong,
    paddingLeft: spacing.sm,
    paddingBottom: spacing.xs,
  },
  section: {
    gap: 2,
  },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '600',
  },
  item: {
    color: colors.textSecondary,
    fontSize: type.micro,
    lineHeight: 17,
  },
  empty: {
    color: colors.textMuted,
    fontSize: type.micro,
    lineHeight: 17,
  },
  readScope: {
    gap: 2,
    paddingTop: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  scopeLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '600',
  },
  scopeValue: {
    color: colors.textSecondary,
    fontSize: type.micro,
    lineHeight: 17,
  },
  pressed: {
    opacity: 0.65,
  },
});
