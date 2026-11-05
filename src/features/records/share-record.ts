import { Share } from 'react-native';

export type ShareRecordResult = 'shared' | 'dismissed' | 'failed';

/**
 * Share flow: generate the image, then open the standard iOS share sheet with the file URL.
 * No SNS specific API is used. `capture` and `share` are injectable for tests.
 */
export async function shareRecordImage(
  capture: () => Promise<string>,
  share: (content: { url: string; message?: string }) => Promise<{ action: string }> = (c) => Share.share(c),
  message?: string,
): Promise<ShareRecordResult> {
  try {
    const url = await capture();
    const result = await share(message ? { url, message } : { url });
    return result.action === Share.dismissedAction ? 'dismissed' : 'shared';
  } catch {
    return 'failed';
  }
}
