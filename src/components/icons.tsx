import Svg, { Circle, Path, Rect } from 'react-native-svg';

export type IconName =
  | 'chart'
  | 'note'
  | 'clock'
  | 'check'
  | 'target'
  | 'cards'
  | 'user'
  | 'settings'
  | 'chevron-left'
  | 'chevron-right'
  | 'more'
  | 'arrow-up'
  | 'arrow-down'
  | 'arrow-left'
  | 'plus'
  | 'close'
  | 'search'
  | 'folder'
  | 'flame'
  | 'chevron-down'
  | 'pin'
  | 'heading'
  | 'checklist'
  | 'link'
  | 'code';

type Props = {
  name: IconName;
  size: number;
  color: string;
  /** Matches the Figma stroke weight (heavier when the tab is active). */
  strokeWidth?: number;
  /** Clock only: colour of the hands when it differs from the outline (Figma StatCard). */
  handsColor?: string;
};

/**
 * Outline icons matching the Figma icon set (Icon/chart, note, clock, cards, user).
 * Figma only exposes the vector bounds through the REST API, so the paths are drawn to those
 * bounds and should be swapped for exported SVGs when available.
 */
export function Icon({ name, size, color, strokeWidth = 2, handsColor }: Props) {
  const common = {
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    fill: 'none',
  } as const;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
      {name === 'chart' && (
        <>
          <Path d="M4 20V10" {...common} />
          <Path d="M10 20V4" {...common} />
          <Path d="M16 20v-7" {...common} />
          <Path d="M20 20H3" {...common} />
        </>
      )}
      {name === 'note' && (
        <>
          <Path d="M6 3h8l4 4v14H6z" {...common} />
          <Path d="M14 3v4h4" {...common} />
          <Path d="M9 12h6M9 16h6" {...common} />
        </>
      )}
      {name === 'clock' && (
        <>
          <Circle cx={12} cy={12} r={9} {...common} />
          <Path d="M12 7v5l3 2" {...common} stroke={handsColor ?? color} />
        </>
      )}
      {name === 'target' && (
        <>
          <Circle cx={12} cy={12} r={9} {...common} />
          <Circle cx={12} cy={12} r={4.5} {...common} />
        </>
      )}
      {name === 'check' && <Path d="M5 12.5l4.5 4.5L19 7.5" {...common} />}
      {name === 'cards' && (
        <>
          <Rect x={4} y={7} width={13} height={13} rx={2} {...common} />
          <Path d="M8 4h10a2 2 0 0 1 2 2v10" {...common} />
        </>
      )}
      {name === 'settings' && (
        <>
          <Circle cx={12} cy={12} r={3} {...common} />
          <Path
            d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
            {...common}
          />
        </>
      )}
      {name === 'chevron-left' && <Path d="M15 5l-7 7 7 7" {...common} />}
      {name === 'chevron-right' && <Path d="M9 5l7 7-7 7" {...common} />}
      {name === 'chevron-down' && <Path d="M5 9l7 7 7-7" {...common} />}
      {name === 'flame' && (
        <Path
          d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 1.5 1 2 1.5 2C10.5 8 11 5.5 12 3z"
          {...common}
        />
      )}
      {name === 'arrow-left' && <Path d="M19 12H5M11 6l-6 6 6 6" {...common} />}
      {name === 'plus' && <Path d="M12 5v14M5 12h14" {...common} />}
      {name === 'close' && <Path d="M6 6l12 12M18 6L6 18" {...common} />}
      {name === 'folder' && (
        <Path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" {...common} />
      )}
      {name === 'arrow-up' && <Path d="M12 19V5M6 11l6-6 6 6" {...common} />}
      {name === 'arrow-down' && <Path d="M12 5v14M6 13l6 6 6-6" {...common} />}
      {name === 'more' && (
        <>
          <Circle cx={5} cy={12} r={1.5} fill={color} />
          <Circle cx={12} cy={12} r={1.5} fill={color} />
          <Circle cx={19} cy={12} r={1.5} fill={color} />
        </>
      )}
      {name === 'search' && (
        <>
          <Circle cx={11} cy={11} r={7} {...common} />
          <Path d="M16.5 16.5L21 21" {...common} />
        </>
      )}
      {name === 'pin' && (
        <>
          <Path d="M9 4h6l-1 6 3 3H7l3-3z" {...common} />
          <Path d="M12 13v7" {...common} />
        </>
      )}
      {name === 'heading' && <Path d="M5 5v14M19 5v14M5 12h14" {...common} />}
      {name === 'checklist' && (
        <>
          <Path d="M3.5 6.5l2 2 3.5-4" {...common} />
          <Path d="M12 7h8" {...common} />
          <Path d="M3.5 16.5l2 2 3.5-4" {...common} />
          <Path d="M12 17h8" {...common} />
        </>
      )}
      {name === 'link' && (
        <>
          <Path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" {...common} />
          <Path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" {...common} />
        </>
      )}
      {name === 'code' && <Path d="M8 7l-5 5 5 5M16 7l5 5-5 5" {...common} />}
      {name === 'user' && (
        <>
          <Circle cx={12} cy={8} r={4} {...common} />
          <Path d="M4 21c0-4 3.5-6 8-6s8 2 8 6" {...common} />
        </>
      )}
    </Svg>
  );
}
