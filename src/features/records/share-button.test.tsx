import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert, Share } from 'react-native';

import { ShareButton } from './share-button';

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe('ShareButton', () => {
  afterEach(() => jest.restoreAllMocks());

  it('is disabled when there is nothing to share', async () => {
    const capture = jest.fn();
    await render(<ShareButton accessibilityLabel="共有する" disabled capture={capture} />);
    await fireEvent.press(screen.getByRole('button', { name: '共有する' }));
    expect(capture).not.toHaveBeenCalled();
  });

  it('captures the image then opens the share sheet with its url', async () => {
    const share = jest
      .spyOn(Share, 'share')
      .mockResolvedValue({ action: Share.sharedAction, activityType: undefined });
    const capture = jest.fn().mockResolvedValue('file:///tmp/day.png');
    await render(<ShareButton accessibilityLabel="共有する" disabled={false} capture={capture} />);
    await fireEvent.press(screen.getByRole('button', { name: '共有する' }));
    expect(capture).toHaveBeenCalledTimes(1);
    expect(share).toHaveBeenCalledWith({ url: 'file:///tmp/day.png' });
  });

  it('ignores taps while an image is being generated', async () => {
    jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction, activityType: undefined });
    const d = deferred<string>();
    const capture = jest.fn(() => d.promise);
    await render(<ShareButton accessibilityLabel="共有する" disabled={false} capture={capture} />);
    const button = screen.getByRole('button', { name: '共有する' });
    // Not awaited: the press handler stays pending until the capture resolves.
    await act(async () => {
      void fireEvent.press(button);
      void fireEvent.press(button);
    });
    expect(capture).toHaveBeenCalledTimes(1);
    await act(async () => {
      d.resolve('file:///tmp/a.png');
    });
    await fireEvent.press(screen.getByRole('button', { name: '共有する' }));
    expect(capture).toHaveBeenCalledTimes(2);
  });

  it('shows the error alert when sharing fails', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const share = jest.spyOn(Share, 'share');
    const capture = jest.fn().mockRejectedValue(new Error('capture failed'));
    await render(<ShareButton accessibilityLabel="共有する" disabled={false} capture={capture} />);
    await fireEvent.press(screen.getByRole('button', { name: '共有する' }));
    expect(share).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith('共有できませんでした', 'もう一度お試しください。');
  });
});
