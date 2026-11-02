// broto-ui — componentes React com a identidade visual verde do box.
// Importe também o CSS: import 'broto-ui/styles.css'

export { UIProvider, useUI, useLabels, defaultLabels } from './provider';
export type { UIProviderProps, UILabels, LinkComponent, LinkComponentProps } from './provider';

// Ações
export { Button, IconButton, LinkButton, TextButton, ButtonGroup, buttonClass } from './components/Button';
export type { ButtonProps, IconButtonProps, LinkButtonProps, ButtonVariant, ButtonSize } from './components/Button';

// Status, etiquetas
export { Badge, StatusBadge, createStatusBadge, StatusDot, LiveDot, Tag, Chip, Priority, TONES, toneColor } from './components/Badge';
export type { BadgeProps, Tone, StatusMeta, StatusMap, StatusBadgeProps, TagProps, ChipProps, PriorityLevel } from './components/Badge';

// Formulários
export {
  Field,
  FormGrid,
  FormSection,
  Input,
  SearchInput,
  Select,
  Textarea,
  Switch,
  Checkbox,
  Radio,
  Segmented,
  JsonTextarea,
  TagInput,
  Dropzone,
} from './components/Field';
export type {
  FieldProps,
  InputProps,
  SelectProps,
  TextareaProps,
  SwitchProps,
  CheckboxProps,
  RadioProps,
  SegmentedOption,
  SegmentedProps,
  JsonTextareaProps,
  TagInputProps,
  DropzoneProps,
} from './components/Field';

// Superfícies e indicadores
export { Card, CardHeader, CardBody, CardFooter, IconTile } from './components/Card';
export type { CardProps } from './components/Card';
export { Kpi } from './components/Kpi';
export type { KpiProps, KpiVariant } from './components/Kpi';
export { ProgressBar, SegmentBar, StackBar, Legend } from './components/Progress';
export type { ProgressBarProps, SegmentBarProps, StackSegment, LegendItem } from './components/Progress';
export { CountTile, CountStrip, MetricList } from './components/CountTile';
export type { CountTileProps, MetricItem } from './components/CountTile';

// Dados
export { Table, DataTable, SkeletonRows, CellTitle, CellLink, Pagination, TableFooter, FilterBar, BulkBar } from './components/Table';
export type { TableProps, Column, DataTableProps, PaginationProps } from './components/Table';
export { Tabs, TabPanel } from './components/Tabs';
export type { TabItem, TabsProps } from './components/Tabs';
export { CodeBlock, JsonView, InlineCode, CopyButton, KeyValue, SecretBox, highlightJson } from './components/Code';
export type { CodeBlockProps, JsonViewProps, CopyButtonProps, KeyValueItem } from './components/Code';
export { Stepper, EventList } from './components/Stepper';
export type { Step, StepState, EventItem } from './components/Stepper';
export { LogViewer } from './components/LogViewer';
export type { LogLine, LogStream, LogViewerProps } from './components/LogViewer';
export { StackedBarChart } from './components/BarChart';
export type { BarSeries, BarDatum, StackedBarChartProps } from './components/BarChart';

// Sobreposições
export { Modal, Dialog, DialogBody, DialogFooter, DialogSpacer, Drawer, ConfirmProvider, useConfirm } from './components/Dialog';
export type { ModalProps, DialogProps, DrawerProps, ConfirmOptions, ConfirmResult, ConfirmFn } from './components/Dialog';
export { Menu } from './components/Menu';
export type { MenuProps, MenuAction, MenuEntry } from './components/Menu';
export { Toaster, toast, useToasts } from './components/Toast';
export type { ToastItem, ToastKind, ToastOptions } from './components/Toast';

// Feedback
export { Spinner, EmptyState, ErrorState, Skeleton, SkeletonBlock, Callout } from './components/Feedback';
export type { EmptyStateProps, ErrorStateProps, CalloutProps, CalloutTone } from './components/Feedback';
export { Avatar, RelativeTime, Duration, Stack, Divider } from './components/Misc';
export type { AvatarProps, StackProps } from './components/Misc';

// Estrutura
export { AppShell, SidebarStatus, ContextSwitcher, UserMenu } from './layout/AppShell';
export type { AppShellProps, NavItem, NavEntry, ContextSwitcherProps, UserMenuProps } from './layout/AppShell';
export { Page, PageHeader, MetaItem, Section, Grid } from './layout/Page';
export type { PageHeaderProps, Crumb, SectionProps, GridLayout } from './layout/Page';
export { Brand, BoxMark, LanesGlyph, BOX_PATH } from './layout/Brand';
export type { BrandProps, BoxMarkProps } from './layout/Brand';
export { Hero, Lanes, LivePill } from './layout/Hero';
export type { HeroProps } from './layout/Hero';
export { AuthLayout, AuthCard } from './layout/Auth';
export type { AuthLayoutProps, AuthCardProps } from './layout/Auth';
export { FullScreen, FullScreenLoader, StatusCard, NotFound, PageLoading } from './layout/Screens';
export type { StatusCardProps, NotFoundProps } from './layout/Screens';

// Utilitários
export {
  formatNumber,
  formatDate,
  formatDateTime,
  formatTime,
  formatTimeMs,
  formatHour,
  formatRelative,
  formatDuration,
  secondsBetween,
  pluralize,
  initials,
  shortId,
  DEFAULT_LOCALE,
  DEFAULT_TIME_ZONE,
} from './utils/format';
export type { FormatOptions } from './utils/format';
export { useNow, useElementWidth, useDebounced, useControllableState, useDocumentTitle, readStorage, writeStorage } from './utils/hooks';
export { copyToClipboard } from './utils/clipboard';
export { parseJson, prettyJson } from './utils/json';
export { cx } from './internal/cx';
