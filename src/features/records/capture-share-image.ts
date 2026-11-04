import type { RefObject } from 'react';
import type { HostInstance } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { SHARE_IMAGE } from './share-model';

/** Captures only the off-screen share view (not the whole screen) as a PNG in the temp directory; returns its file URI. */
export async function captureShareImage(ref: RefObject<HostInstance | null>): Promise<string> {
  if (!ref.current) throw new Error('share view is not mounted');
  return captureRef(ref, {
    format: 'png',
    result: 'tmpfile',
    width: SHARE_IMAGE.pixelWidth,
    height: SHARE_IMAGE.pixelHeight,
  });
}
