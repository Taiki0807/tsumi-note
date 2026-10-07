import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, IconButton, TextField } from '@/components/form-ui';
import { fontFamily, layout, radius, typography, useTheme } from '@/design';
import { validateReviewSettings, type ReviewSettings } from '@/domain/review-settings';

import { useReviewSettings } from './use-review';

const TIME_PRESETS = [
  { label: '30秒', seconds: 30 },
  { label: '45秒', seconds: 45 },
  { label: '1分', seconds: 60 },
  { label: '3分', seconds: 180 },
] as const;
const SIZE_PRESETS = [10, 20, 30] as const;

/** Figma Card: 1pt border, radius 16, 20pt padding, 14pt gap. */
function Card({ children }: { children: ReactNode }) {
  const colors = useTheme();
  return (
    <View
      style={{
        gap: 14,
        padding: 20,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.divider,
        backgroundColor: colors.surface,
      }}
    >
      {children}
    </View>
  );
}

/** Figma Option/*: 44pt pill, 2pt border; selected = primary fill. */
function Option({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const colors = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        height: 44,
        justifyContent: 'center',
        paddingHorizontal: 16,
        borderRadius: radius.full,
        borderWidth: 2,
        borderColor: selected ? colors.primary : colors.primaryMuted,
        backgroundColor: selected ? colors.primary : colors.surface,
      }}
    >
      <Text
        style={{
          fontFamily: fontFamily.extraBold,
          ...typography.bodySm,
          color: selected ? colors.textOnPrimary : colors.primary,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Figma SegmentedTabs/Tab: 36pt pill, 2pt primary border. */
function Segment({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const colors = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        flex: 1,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.full,
        borderWidth: 2,
        borderColor: colors.primary,
        backgroundColor: selected ? colors.primary : colors.surface,
      }}
    >
      <Text
        style={{
          fontFamily: fontFamily.extraBold,
          ...typography.bodySm,
          color: selected ? colors.textOnPrimary : colors.primary,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Figma Time input box: 64x44 white box, Nunito 36/44; non-zero values use the primary colour. */
function TimeBox({
  value,
  unit,
  label,
  onChange,
  maxLength,
}: {
  value: string;
  unit: string;
  label: string;
  onChange: (next: string) => void;
  maxLength: number;
}) {
  const colors = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <View
        style={{
          width: 64,
          height: 44,
          justifyContent: 'center',
          paddingHorizontal: 10,
          borderRadius: radius.sm,
          backgroundColor: colors.surface,
        }}
      >
        <TextInput
          accessibilityLabel={label}
          value={value}
          onChangeText={(text) => onChange(text.replace(/\D/g, ''))}
          keyboardType="number-pad"
          maxLength={maxLength}
          selectTextOnFocus
          style={{
            padding: 0,
            fontFamily: fontFamily.numeric,
            fontSize: 36,
            lineHeight: 44,
            color: Number(value) > 0 ? colors.primary : colors.textPrimary,
          }}
        />
      </View>
      <Text style={{ fontFamily: fontFamily.extraBold, ...typography.body, color: colors.textPrimary }}>
        {unit}
      </Text>
    </View>
  );
}

type SizeMode = 'all' | 'preset' | 'custom';

/** Figma 11 復習設定: time limit on/off + seconds, and the number of questions per session. */
export function ReviewSettingsScreen() {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const { initial, dueCount, save } = useReviewSettings();

  const [limitEnabled, setLimitEnabled] = useState(initial.timeLimitEnabled);
  const [minutes, setMinutes] = useState(String(Math.floor(initial.timeLimitSeconds / 60)));
  const [seconds, setSeconds] = useState(String(initial.timeLimitSeconds % 60));
  const initialSize = initial.sessionSize;
  const [sizeMode, setSizeMode] = useState<SizeMode>(
    initialSize === 'all'
      ? 'all'
      : (SIZE_PRESETS as readonly number[]).includes(initialSize)
        ? 'preset'
        : 'custom',
  );
  const [sizeInput, setSizeInput] = useState(initialSize === 'all' ? '' : String(initialSize));
  const [saveError, setSaveError] = useState<string | null>(null);

  const totalSeconds = (Number(minutes) || 0) * 60 + (Number(seconds) || 0);
  const sessionSize: ReviewSettings['sessionSize'] = sizeMode === 'all' ? 'all' : Number(sizeInput);
  const draft: ReviewSettings = {
    timeLimitEnabled: limitEnabled,
    timeLimitSeconds: limitEnabled ? totalSeconds : initial.timeLimitSeconds,
    sessionSize: Number.isNaN(sessionSize) ? 0 : sessionSize,
  };
  const valid = validateReviewSettings(draft);

  const setTotalSeconds = (total: number) => {
    setMinutes(String(Math.floor(total / 60)));
    setSeconds(String(total % 60));
  };
  const pickPreset = (size: number) => {
    setSizeMode('preset');
    setSizeInput(String(size));
  };

  const onSave = () => {
    try {
      save(draft);
      router.back();
    } catch {
      setSaveError('設定を保存できませんでした');
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}
    >
      <View
        style={{
          height: 64,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingLeft: 12,
          paddingRight: 16,
          paddingTop: 12,
          paddingBottom: 8,
        }}
      >
        <IconButton name="arrow-left" label="戻る" onPress={() => router.back()} />
        <Text
          accessibilityRole="header"
          style={{
            flex: 1,
            fontFamily: fontFamily.extraBold,
            ...typography.headingSm,
            color: colors.textPrimary,
          }}
        >
          復習設定
        </Text>
      </View>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          alignSelf: 'center',
          width: '100%',
          maxWidth: layout.contentMaxWidth,
          gap: 14,
          paddingTop: 8,
          paddingHorizontal: 24,
          paddingBottom: 24,
        }}
      >
        <Card>
          <Text
            style={{
              fontFamily: fontFamily.extraBold,
              fontSize: 17,
              lineHeight: 26,
              color: colors.textPrimary,
            }}
          >
            1問ごとの制限時間
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Segment label="時間制限あり" selected={limitEnabled} onPress={() => setLimitEnabled(true)} />
            <Segment label="制限なし" selected={!limitEnabled} onPress={() => setLimitEnabled(false)} />
          </View>
          {limitEnabled ? (
            <>
              <View
                style={{
                  height: 76,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 16,
                  borderRadius: radius.md,
                  backgroundColor: colors.surfaceMuted,
                }}
              >
                <TimeBox value={minutes} unit="分" label="分" onChange={setMinutes} maxLength={2} />
                <TimeBox value={seconds} unit="秒" label="秒" onChange={setSeconds} maxLength={2} />
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {TIME_PRESETS.map((p) => (
                  <Option
                    key={p.label}
                    label={p.label}
                    selected={totalSeconds === p.seconds}
                    onPress={() => setTotalSeconds(p.seconds)}
                  />
                ))}
              </View>
            </>
          ) : null}
          <Text
            style={{
              fontFamily: fontFamily.regular,
              ...typography.caption,
              lineHeight: 18,
              color: colors.textSecondary,
            }}
          >
            答えを表示すると計測を止めます。時間切れは不正解とは別に集計します。自分のペースで解きたいときは「制限なし」を選べます。
          </Text>
        </Card>

        <Card>
          <View style={{ gap: 2 }}>
            <Text
              style={{
                fontFamily: fontFamily.extraBold,
                fontSize: 17,
                lineHeight: 26,
                color: colors.textPrimary,
              }}
            >
              1回に出す問題数
            </Text>
            <Text
              style={{ fontFamily: fontFamily.regular, ...typography.caption, color: colors.textSecondary }}
            >
              復習待ちの問題を期限の近い順に出題します
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: sizeMode === 'all' }}
            onPress={() => setSizeMode('all')}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 18,
              paddingVertical: 12,
              borderRadius: radius.lg,
              borderWidth: 2,
              borderColor: sizeMode === 'all' ? colors.primary : colors.primaryMuted,
              backgroundColor: sizeMode === 'all' ? colors.primarySoft : colors.surface,
            }}
          >
            <View>
              <Text
                style={{
                  fontFamily: fontFamily.extraBold,
                  fontSize: 17,
                  lineHeight: 24,
                  color: colors.textPrimary,
                }}
              >
                すべて
              </Text>
              <Text
                style={{ fontFamily: fontFamily.bold, ...typography.caption, color: colors.textSecondary }}
              >
                復習待ち {dueCount}問
              </Text>
            </View>
            <Text
              style={{ fontFamily: fontFamily.numeric, fontSize: 20, lineHeight: 28, color: colors.primary }}
            >
              {dueCount}問
            </Text>
          </Pressable>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {SIZE_PRESETS.map((size) => (
              <Option
                key={size}
                label={`${size}問`}
                selected={sizeMode === 'preset' && sizeInput === String(size)}
                onPress={() => pickPreset(size)}
              />
            ))}
            <Option
              label="自由に入力"
              selected={sizeMode === 'custom'}
              onPress={() => setSizeMode('custom')}
            />
          </View>
          {sizeMode === 'custom' ? (
            <TextField
              label="問題数"
              value={sizeInput}
              onChangeText={(text) => setSizeInput(text.replace(/\D/g, ''))}
              keyboardType="number-pad"
              maxLength={3}
              placeholder="1〜500"
            />
          ) : null}
        </Card>
      </ScrollView>
      <View
        style={{
          gap: 8,
          paddingTop: 16,
          paddingHorizontal: 24,
          paddingBottom: Math.max(insets.bottom, 32),
          backgroundColor: colors.background,
        }}
      >
        {saveError ? (
          <Text
            accessibilityRole="alert"
            style={{ fontFamily: fontFamily.bold, ...typography.caption, color: colors.danger }}
          >
            {saveError}
          </Text>
        ) : null}
        <View style={{ alignSelf: 'center', width: '100%', maxWidth: layout.contentMaxWidth }}>
          <Button label="設定を保存" onPress={onSave} disabled={!valid} />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
