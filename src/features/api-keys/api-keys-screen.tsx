import * as Clipboard from 'expo-clipboard';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { BottomSheet, Button, ConfirmDeleteSheet, IconButton, TextField } from '@/components/form-ui';
import { Icon } from '@/components/icons';
import { fontFamily, typography, useTheme } from '@/design';
import { SettingsScaffold } from '@/features/settings/settings-ui';

import {
  DEFAULT_EXPIRY_DAYS,
  describeApiKeyAccess,
  describeApiKeyUsage,
  EXPIRY_OPTIONS,
  MAX_API_KEY_NAME,
  maskedApiKey,
  type ApiKeyInfo,
  type ApiKeyScope,
  type IssueOptions,
  type IssuedApiKey,
} from './api-keys-api';
import { useApiKeys } from './use-api-keys';

/** Figma 16c 「使い方」: fixed dark code block in both themes. */
const CODE_BACKGROUND = '#1c1a2e';
const CODE_LINES = [
  { text: 'POST /external/v1/study-sessions', color: '#cceb4d' },
  { text: 'Authorization: Bearer tsn_…', color: '#bfbfd9' },
  { text: '{', color: '#ffffff' },
  { text: '  "externalId": "drill-001",', color: '#ffffff' },
  { text: '  "startedAt": "2026-09-13T21:10:00+09:00",', color: '#ffffff' },
  { text: '  "endedAt": "2026-09-13T21:30:00+09:00"', color: '#ffffff' },
  { text: '}', color: '#ffffff' },
];

function KeyRow({
  keyInfo,
  first,
  now,
  onMore,
}: {
  keyInfo: ApiKeyInfo;
  first: boolean;
  now: number;
  onMore: () => void;
}) {
  const colors = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 12,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: colors.divider,
      }}
    >
      <View style={{ flex: 1, gap: 3 }}>
        <Text
          numberOfLines={1}
          style={{
            fontFamily: fontFamily.extraBold,
            fontSize: 15,
            lineHeight: 22,
            color: colors.textPrimary,
          }}
        >
          {keyInfo.name}
        </Text>
        <Text
          style={{
            fontFamily: fontFamily.regular,
            fontSize: 13,
            lineHeight: 17,
            color: colors.textSecondary,
          }}
        >
          {maskedApiKey(keyInfo.prefix)}
        </Text>
        <Text
          style={{ fontFamily: fontFamily.bold, fontSize: 11, lineHeight: 16, color: colors.textPlaceholder }}
        >
          {describeApiKeyUsage(keyInfo, now)}
        </Text>
        <Text
          style={{ fontFamily: fontFamily.bold, fontSize: 11, lineHeight: 16, color: colors.textPlaceholder }}
        >
          {describeApiKeyAccess(keyInfo, now)}
        </Text>
      </View>
      <IconButton name="more" label={`${keyInfo.name}の操作`} onPress={onMore} />
    </View>
  );
}

/** Figma 16d APIキーを発行: name + what the key can do. */
function IssueSheet({
  visible,
  onClose,
  onIssue,
  onDismissed,
}: {
  visible: boolean;
  onClose: () => void;
  onIssue: (name: string, options: IssueOptions) => Promise<string | null>;
  onDismissed: () => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} gap={18} onDismissed={onDismissed}>
      {visible && <IssueForm onClose={onClose} onIssue={onIssue} />}
    </BottomSheet>
  );
}

function PermissionRow({
  title,
  caption,
  checked,
  onPress,
}: {
  title: string;
  caption: string;
  checked: boolean;
  onPress: () => void;
}) {
  const colors = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={title}
      onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 7,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: checked ? colors.primary : 'transparent',
          borderWidth: checked ? 0 : 2,
          borderColor: colors.divider,
        }}
      >
        {checked && <Icon name="check" size={14} color={colors.textOnPrimary} strokeWidth={3} />}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          style={{
            fontFamily: fontFamily.extraBold,
            fontSize: 15,
            lineHeight: 22,
            color: colors.textPrimary,
          }}
        >
          {title}
        </Text>
        <Text style={{ fontFamily: fontFamily.bold, ...typography.caption, color: colors.textSecondary }}>
          {caption}
        </Text>
      </View>
    </Pressable>
  );
}

function IssueForm({
  onClose,
  onIssue,
}: {
  onClose: () => void;
  onIssue: (name: string, options: IssueOptions) => Promise<string | null>;
}) {
  const colors = useTheme();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Figma 16d: 「学習記録の追加」は初期ON、「学習記録の読み取り」は初期OFF。少なくとも1つは必要。
  const [scopes, setScopes] = useState<ApiKeyScope[]>(['study_sessions:write']);
  const [expiryIndex, setExpiryIndex] = useState(() =>
    Math.max(
      0,
      EXPIRY_OPTIONS.findIndex((o) => o.days === DEFAULT_EXPIRY_DAYS),
    ),
  );
  const expiry = EXPIRY_OPTIONS[expiryIndex]!;
  const trimmed = name.trim();
  const valid = trimmed.length > 0 && trimmed.length <= MAX_API_KEY_NAME && scopes.length > 0;

  const toggle = (scope: ApiKeyScope) =>
    setScopes((cur) => (cur.includes(scope) ? cur.filter((s) => s !== scope) : [...cur, scope]));

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    const message = await onIssue(trimmed, { scopes, expiresInDays: expiry.days });
    setBusy(false);
    if (message) setError(message);
  };

  return (
    <>
      <Text
        accessibilityRole="header"
        style={{
          fontFamily: fontFamily.extraBold,
          ...typography.heading,
          lineHeight: 33,
          color: colors.textPrimary,
        }}
      >
        APIキーを発行
      </Text>
      <TextField
        label="名前"
        placeholder="例：自宅PCのスクリプト"
        value={name}
        onChangeText={(v) => {
          setName(v);
          setError(null);
        }}
        maxLength={MAX_API_KEY_NAME}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={submit}
      />
      <View style={{ gap: 10 }}>
        <Text style={{ fontFamily: fontFamily.extraBold, ...typography.label, color: colors.textPrimary }}>
          できること
        </Text>
        <PermissionRow
          title="学習記録の追加"
          caption="時刻・フォルダー・学習時間を記録"
          checked={scopes.includes('study_sessions:write')}
          onPress={() => toggle('study_sessions:write')}
        />
        <PermissionRow
          title="学習記録の読み取り"
          caption="週ごとの学習時間を取得"
          checked={scopes.includes('study_sessions:read')}
          onPress={() => toggle('study_sessions:read')}
        />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontFamily: fontFamily.extraBold, ...typography.label, color: colors.textPrimary }}>
          有効期限
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`有効期限 ${expiry.label}。タップで切り替え`}
          onPress={() => setExpiryIndex((i) => (i + 1) % EXPIRY_OPTIONS.length)}
          style={{
            height: 39,
            justifyContent: 'center',
            paddingHorizontal: 14,
            borderRadius: 999,
            backgroundColor: colors.primarySoft,
          }}
        >
          <Text style={{ fontFamily: fontFamily.extraBold, ...typography.label, color: colors.primary }}>
            {expiry.label}
          </Text>
        </Pressable>
      </View>
      {error && (
        <Text
          accessibilityRole="alert"
          style={{ fontFamily: fontFamily.bold, ...typography.caption, color: colors.danger }}
        >
          {error}
        </Text>
      )}
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Button label="キャンセル" variant="secondary" onPress={onClose} flex />
        <Button label="発行する" onPress={submit} disabled={!valid || busy} flex />
      </View>
    </>
  );
}

/** Figma 16e APIキーを発行（完了）: the plaintext key, shown only here. */
function IssuedSheet({
  visible,
  token,
  onClose,
  onDismissed,
}: {
  visible: boolean;
  token: string;
  onClose: () => void;
  onDismissed: () => void;
}) {
  const colors = useTheme();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    await Clipboard.setStringAsync(token);
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} gap={18} onDismissed={onDismissed}>
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.successSoft,
        }}
      >
        <Icon name="check" size={28} color={colors.success} strokeWidth={2.4} />
      </View>
      <Text
        accessibilityRole="header"
        style={{
          fontFamily: fontFamily.extraBold,
          ...typography.heading,
          lineHeight: 33,
          color: colors.textPrimary,
        }}
      >
        APIキーを発行しました
      </Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingVertical: 8,
          paddingLeft: 16,
          paddingRight: 8,
          borderRadius: 16,
          backgroundColor: colors.surfaceMuted,
        }}
      >
        <Text
          accessibilityLabel="発行されたAPIキー"
          style={{
            flex: 1,
            fontFamily: fontFamily.regular,
            fontSize: 13,
            lineHeight: 18,
            color: colors.textPrimary,
          }}
        >
          {token}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="APIキーをコピー"
          onPress={copy}
          style={{
            height: 39,
            justifyContent: 'center',
            paddingHorizontal: 14,
            borderRadius: 999,
            backgroundColor: colors.primarySoft,
          }}
        >
          <Text style={{ fontFamily: fontFamily.extraBold, ...typography.label, color: colors.primary }}>
            {copied ? 'コピー済み' : 'コピー'}
          </Text>
        </Pressable>
      </View>
      <View
        style={{
          paddingHorizontal: 14,
          paddingVertical: 12,
          borderRadius: 16,
          backgroundColor: colors.warningSoft,
        }}
      >
        <Text
          style={{
            fontFamily: fontFamily.bold,
            ...typography.label,
            lineHeight: 20,
            color: colors.warningText,
          }}
        >
          このキーは今だけ表示されます。閉じる前に安全な場所に保存してください。
        </Text>
      </View>
      <Button label="完了" onPress={onClose} />
    </BottomSheet>
  );
}

/** Figma 16c API連携: key list, 発行, and a usage sample. 16d / 16e are sheets on top of it. */
export function ApiKeysScreen() {
  const colors = useTheme();
  const { available, state, refresh, issue, revoke } = useApiKeys();
  const [now] = useState(() => Date.now());

  const [issuing, setIssuing] = useState(false);
  // The plaintext key lives only in this state: never stored, cleared once its sheet has closed.
  const [issued, setIssued] = useState<IssuedApiKey | null>(null);
  const [showIssued, setShowIssued] = useState(false);
  const [revoking, setRevoking] = useState<ApiKeyInfo | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  const keys = state.status === 'ready' ? state.keys : [];

  return (
    <SettingsScaffold title="API連携" gap={16}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          padding: 16,
          borderRadius: 20,
          backgroundColor: colors.infoSoft,
        }}
      >
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.surface,
          }}
        >
          <Icon name="link" size={20} color={colors.info} strokeWidth={2} />
        </View>
        <Text
          style={{
            flex: 1,
            fontFamily: fontFamily.bold,
            ...typography.label,
            lineHeight: 20,
            color: colors.infoText,
          }}
        >
          ほかのアプリやスクリプトから、学習記録を追加できます。APIキーはアカウントごとに発行します。
        </Text>
      </View>

      {!available ? (
        <Text style={{ fontFamily: fontFamily.bold, ...typography.bodySm, color: colors.textSecondary }}>
          APIキーを発行するには、ログインが必要です。
        </Text>
      ) : (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text
              accessibilityRole="header"
              style={{
                fontFamily: fontFamily.extraBold,
                fontSize: 16,
                lineHeight: 24,
                color: colors.textPrimary,
              }}
            >
              APIキー
            </Text>
            {state.status === 'ready' && (
              <Text
                style={{ fontFamily: fontFamily.bold, ...typography.caption, color: colors.textSecondary }}
              >
                {`${keys.length}件`}
              </Text>
            )}
          </View>
          {state.status === 'loading' && (
            <Text style={{ fontFamily: fontFamily.bold, ...typography.bodySm, color: colors.textSecondary }}>
              読み込み中…
            </Text>
          )}
          {state.status === 'error' && (
            <View style={{ gap: 10 }}>
              <Text
                accessibilityRole="alert"
                style={{ fontFamily: fontFamily.bold, ...typography.bodySm, color: colors.danger }}
              >
                {state.message}
              </Text>
              <Button label="もう一度読み込む" variant="secondary" onPress={() => void refresh()} />
            </View>
          )}
          {state.status === 'ready' && keys.length > 0 && (
            <View
              style={{
                paddingLeft: 20,
                paddingRight: 8,
                paddingVertical: 4,
                borderRadius: 24,
                borderWidth: 1,
                borderColor: colors.divider,
                backgroundColor: colors.surface,
              }}
            >
              {keys.map((k, i) => (
                <KeyRow
                  key={k.id}
                  keyInfo={k}
                  first={i === 0}
                  now={now}
                  onMore={() => {
                    setRevokeError(null);
                    setRevoking(k);
                  }}
                />
              ))}
            </View>
          )}
          {state.status === 'ready' && keys.length === 0 && (
            <Text style={{ fontFamily: fontFamily.bold, ...typography.bodySm, color: colors.textSecondary }}>
              まだAPIキーはありません
            </Text>
          )}
          <Button label="＋ APIキーを発行" variant="secondary" onPress={() => setIssuing(true)} />
        </>
      )}

      <Text
        accessibilityRole="header"
        style={{ fontFamily: fontFamily.extraBold, fontSize: 16, lineHeight: 24, color: colors.textPrimary }}
      >
        使い方
      </Text>
      <View
        style={{
          gap: 4,
          paddingHorizontal: 16,
          paddingVertical: 14,
          borderRadius: 16,
          backgroundColor: CODE_BACKGROUND,
        }}
      >
        {CODE_LINES.map((line, i) => (
          <Text
            key={i}
            style={{ fontFamily: fontFamily.regular, fontSize: 11, lineHeight: 17, color: line.color }}
          >
            {line.text}
          </Text>
        ))}
      </View>

      <IssueSheet
        visible={issuing}
        onClose={() => setIssuing(false)}
        onIssue={async (name, options) => {
          const r = await issue(name, options);
          if (!r.ok) return r.message;
          setIssued(r.data);
          setIssuing(false);
          return null;
        }}
        // The completion sheet opens only once this one is gone (iOS drops a Modal shown mid-dismiss).
        onDismissed={() => {
          if (issued) setShowIssued(true);
        }}
      />
      <IssuedSheet
        visible={showIssued}
        token={issued?.token ?? ''}
        onClose={() => setShowIssued(false)}
        onDismissed={() => setIssued(null)}
      />
      <ConfirmDeleteSheet
        visible={revoking !== null}
        title="APIキーを失効しますか？"
        message={
          revokeError ??
          (revoking
            ? `「${revoking.name}」を失効します。このキーを使っている連携は、すぐに記録を追加できなくなります。`
            : '')
        }
        confirmLabel="失効する"
        onCancel={() => setRevoking(null)}
        onConfirm={async () => {
          if (!revoking) return;
          const r = await revoke(revoking.id);
          if (r.ok || r.kind === 'not_found') setRevoking(null);
          else setRevokeError(r.message);
        }}
      />
    </SettingsScaffold>
  );
}
