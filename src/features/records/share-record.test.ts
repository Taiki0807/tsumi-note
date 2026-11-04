import { Share } from 'react-native';

import { shareRecordImage } from './share-record';

describe('shareRecordImage', () => {
  it('captures then opens the share sheet with the file url', async () => {
    const capture = jest.fn().mockResolvedValue('file:///tmp/a.png');
    const share = jest.fn().mockResolvedValue({ action: Share.sharedAction });
    await expect(shareRecordImage(capture, share)).resolves.toBe('shared');
    expect(share).toHaveBeenCalledWith({ url: 'file:///tmp/a.png' });
  });

  it('reports dismissal', async () => {
    const share = jest.fn().mockResolvedValue({ action: Share.dismissedAction });
    await expect(shareRecordImage(async () => 'file:///a.png', share)).resolves.toBe('dismissed');
  });

  it('does not open the sheet when capture fails', async () => {
    const share = jest.fn();
    await expect(shareRecordImage(() => Promise.reject(new Error('x')), share)).resolves.toBe('failed');
    expect(share).not.toHaveBeenCalled();
  });

  it('returns failed when the sheet throws', async () => {
    const share = jest.fn().mockRejectedValue(new Error('x'));
    await expect(shareRecordImage(async () => 'file:///a.png', share)).resolves.toBe('failed');
  });
});
