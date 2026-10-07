import { Linking, Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/icons';
import { fontFamily, radius, typography, useTheme } from '@/design';
import { parseMarkdown, type InlineNode } from '@/domain/markdown';

function Inline({ nodes }: { nodes: InlineNode[] }) {
  const colors = useTheme();
  return (
    <>
      {nodes.map((node, i) => {
        switch (node.type) {
          case 'bold':
            return (
              <Text key={i} style={{ fontFamily: fontFamily.extraBold }}>
                {node.text}
              </Text>
            );
          case 'code':
            return (
              <Text key={i} style={{ fontFamily: 'Menlo', backgroundColor: colors.surfaceMuted }}>
                {node.text}
              </Text>
            );
          case 'link':
            return (
              <Text
                key={i}
                accessibilityRole="link"
                style={{ color: colors.primary, textDecorationLine: 'underline' }}
                onPress={() => {
                  // Only web links are opened from a note.
                  if (/^https?:\/\//i.test(node.url)) void Linking.openURL(node.url);
                }}
              >
                {node.text}
              </Text>
            );
          default:
            return <Text key={i}>{node.text}</Text>;
        }
      })}
    </>
  );
}

/**
 * Figma 04 › Markdown body: 18/800 headings, 15/500 body (24pt line), 24pt rounded checkboxes,
 * a primary-soft quote card (radius 12, padding 16/14), 10pt gap between blocks.
 */
export function MarkdownView({
  source,
  onToggleCheck,
}: {
  source: string;
  /** Receives the 0-based source line of the tapped checklist item. */
  onToggleCheck?: (line: number) => void;
}) {
  const colors = useTheme();
  const body = { fontFamily: fontFamily.regular, ...typography.body, color: colors.textPrimary };

  return (
    <View style={{ gap: 10 }}>
      {parseMarkdown(source).map((block, i) => {
        switch (block.type) {
          case 'heading':
            return (
              <Text
                key={i}
                accessibilityRole="header"
                style={{
                  fontFamily: fontFamily.extraBold,
                  ...typography.headingSm,
                  color: colors.textPrimary,
                  paddingTop: 4,
                }}
              >
                <Inline nodes={block.inline} />
              </Text>
            );
          case 'bullet':
          case 'numbered':
            return (
              <Text key={i} style={body}>
                {block.type === 'bullet' ? '•  ' : `${block.number}.  `}
                <Inline nodes={block.inline} />
              </Text>
            );
          case 'check':
            return (
              <Pressable
                key={i}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: block.checked }}
                disabled={!onToggleCheck}
                onPress={() => onToggleCheck?.(block.line)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
              >
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: radius.sm,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: block.checked ? 0 : 2,
                    borderColor: colors.primary,
                    backgroundColor: block.checked ? colors.primary : undefined,
                  }}
                >
                  {block.checked ? (
                    <Icon name="check" size={14} color={colors.textOnPrimary} strokeWidth={1.75} />
                  ) : null}
                </View>
                <Text
                  style={[
                    body,
                    { flex: 1, color: block.checked ? colors.textSecondary : colors.textPrimary },
                  ]}
                >
                  <Inline nodes={block.inline} />
                </Text>
              </Pressable>
            );
          case 'quote':
            return (
              <View
                key={i}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  borderRadius: radius.md,
                  backgroundColor: colors.primarySoft,
                }}
              >
                <Text style={[body, { fontFamily: fontFamily.extraBold, color: colors.primary }]}>
                  <Inline nodes={block.inline} />
                </Text>
              </View>
            );
          case 'code':
            return (
              <View
                key={i}
                style={{ padding: 14, borderRadius: radius.md, backgroundColor: colors.surfaceMuted }}
              >
                <Text
                  style={{ fontFamily: 'Menlo', fontSize: 13, lineHeight: 20, color: colors.textPrimary }}
                >
                  {block.text}
                </Text>
              </View>
            );
          default:
            return (
              <Text key={i} style={body}>
                <Inline nodes={block.inline} />
              </Text>
            );
        }
      })}
    </View>
  );
}
