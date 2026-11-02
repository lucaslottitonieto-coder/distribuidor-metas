// Ícones internos de linha fina (1,5 px, terminações arredondadas), no mesmo desenho
// do lucide. Mantêm a lib sem dependências além do React.
import type { ReactNode, SVGProps } from 'react';

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  size?: number;
  strokeWidth?: number;
}

function make(name: string, children: ReactNode) {
  function Icon({ size = 16, strokeWidth = 1.5, className, ...rest }: IconProps) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
        className={className ? `bt-icon ${className}` : 'bt-icon'}
        {...rest}
      >
        {children}
      </svg>
    );
  }
  Icon.displayName = `Icon${name}`;
  return Icon;
}

export const IconX = make('X', <><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>);
export const IconCheck = make('Check', <path d="M20 6 9 17l-5-5" />);
export const IconChevronLeft = make('ChevronLeft', <path d="m15 18-6-6 6-6" />);
export const IconChevronRight = make('ChevronRight', <path d="m9 18 6-6-6-6" />);
export const IconChevronDown = make('ChevronDown', <path d="m6 9 6 6 6-6" />);
export const IconChevronsUp = make('ChevronsUp', <><path d="m17 11-5-5-5 5" /><path d="m17 18-5-5-5 5" /></>);
export const IconChevronsDown = make('ChevronsDown', <><path d="m7 6 5 5 5-5" /><path d="m7 13 5 5 5-5" /></>);
export const IconMinus = make('Minus', <path d="M5 12h14" />);
export const IconCopy = make(
  'Copy',
  <>
    <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
  </>,
);
export const IconInfo = make('Info', <><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></>);
export const IconCircleAlert = make(
  'CircleAlert',
  <><circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><path d="M12 16h.01" /></>,
);
export const IconCircleCheck = make('CircleCheck', <><circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" /></>);
export const IconTriangleAlert = make(
  'TriangleAlert',
  <>
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
  </>,
);
export const IconEllipsis = make(
  'Ellipsis',
  <><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></>,
);
export const IconSearch = make('Search', <><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></>);
export const IconPanelLeftClose = make(
  'PanelLeftClose',
  <><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M9 3v18" /><path d="m16 15-3-3 3-3" /></>,
);
export const IconPanelLeftOpen = make(
  'PanelLeftOpen',
  <><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M9 3v18" /><path d="m14 9 3 3-3 3" /></>,
);
export const IconUpload = make(
  'Upload',
  <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m17 8-5-5-5 5" /><path d="M12 3v12" /></>,
);
export const IconRefresh = make(
  'Refresh',
  <>
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
    <path d="M8 16H3v5" />
  </>,
);
export const IconArrowDownToLine = make(
  'ArrowDownToLine',
  <><path d="M12 17V3" /><path d="m6 11 6 6 6-6" /><path d="M19 21H5" /></>,
);
export const IconBraces = make(
  'Braces',
  <>
    <path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1" />
    <path d="M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1" />
  </>,
);
export const IconInbox = make(
  'Inbox',
  <>
    <path d="M22 12h-6l-2 3h-4l-2-3H2" />
    <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
  </>,
);
export const IconArrowLeft = make('ArrowLeft', <><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></>);
