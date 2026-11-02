import {
  Children,
  cloneElement,
  createContext,
  forwardRef,
  useContext,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type DragEvent,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cx } from '../internal/cx';
import { IconBraces, IconSearch, IconUpload, IconX } from '../internal/icons';
import { useLabels } from '../provider';
import { useControllableState } from '../utils/hooks';
import { parseJson, prettyJson } from '../utils/json';

// ---------------------------------------------------------------- Field

interface FieldContextValue {
  labelId: string;
  messageId?: string;
  invalid: boolean;
}

/** Permite que controles não rotuláveis por <label for> (grupo segmentado, área de upload) se liguem ao Field. */
const FieldContext = createContext<FieldContextValue | null>(null);

export interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  /** Rótulo discreto ao lado do nome (ex.: "texto", "número"). */
  typeLabel?: ReactNode;
  /** Ocupa as duas colunas dentro de <FormGrid>. */
  span?: 2;
  className?: string;
  /** O controle. Um único elemento recebe id, aria-describedby e aria-invalid automaticamente; ou use uma função (id) => controle. */
  children: ReactNode | ((id: string) => ReactNode);
}

/** Rótulo + controle + dica/erro, com ligações de acessibilidade. */
export function Field({ label, hint, error, required, typeLabel, span, className, children }: FieldProps) {
  const autoId = useId();
  const labels = useLabels();
  const msgId = `${autoId}-msg`;
  const labelId = `${autoId}-label`;
  const hasMsg = !!(error || hint);

  let control: ReactNode;
  let id = autoId;
  if (typeof children === 'function') {
    control = children(autoId);
  } else {
    const only = Children.count(children) === 1 && isValidElement(children) ? (children as ReactElement<Record<string, unknown>>) : null;
    if (only) {
      const existing = only.props.id as string | undefined;
      id = existing ?? autoId;
      control = cloneElement(only, {
        id,
        'aria-describedby': hasMsg ? msgId : (only.props['aria-describedby'] as string | undefined),
        'aria-invalid': error ? true : (only.props['aria-invalid'] as boolean | undefined),
        'aria-required': required || undefined,
      });
    } else {
      control = children;
    }
  }

  return (
    <FieldContext.Provider value={{ labelId, messageId: hasMsg ? msgId : undefined, invalid: !!error }}>
    <div className={cx('bt-field', span === 2 && 'bt-span-2', className)}>
      <label className="bt-field-label" htmlFor={id} id={labelId}>
        <span>{label}</span>
        {required && (
          <span className="bt-field-req" aria-label={labels.required}>
            *
          </span>
        )}
        {typeLabel && <span className="bt-field-type">{typeLabel}</span>}
      </label>
      {control}
      {error ? (
        <span id={msgId} className="bt-field-error" role="alert">
          {error}
        </span>
      ) : (
        hint && (
          <span id={msgId} className="bt-field-hint">
            {hint}
          </span>
        )
      )}
    </div>
    </FieldContext.Provider>
  );
}

/** Grade de formulário em duas colunas (uma no celular). */
export function FormGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('bt-form-grid', className)}>{children}</div>;
}

/** Título de seção dentro de formulários longos. */
export function FormSection({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('bt-form-section', 'bt-span-2', className)}>{children}</div>;
}

// ---------------------------------------------------------------- Input, Select, Textarea

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  controlSize?: 'sm' | 'md';
  /** Ícone dentro do campo, à esquerda. */
  icon?: ReactNode;
  wrapperClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, controlSize, icon, wrapperClassName, ...rest },
  ref,
) {
  const input = <input ref={ref} className={cx('bt-input', controlSize === 'sm' && 'bt-input-sm', className)} {...rest} />;
  if (!icon) return input;
  return (
    <div className={cx('bt-input-icon', wrapperClassName)}>
      {icon}
      {input}
    </div>
  );
});

/** Campo de busca com lupa. */
export const SearchInput = forwardRef<HTMLInputElement, Omit<InputProps, 'icon'>>(function SearchInput(
  { type, controlSize, ...rest },
  ref,
) {
  return (
    <Input
      ref={ref}
      type={type ?? 'search'}
      controlSize={controlSize}
      icon={<IconSearch size={controlSize === 'sm' ? 15 : 16} />}
      {...rest}
    />
  );
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  controlSize?: 'sm' | 'md';
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, controlSize, children, ...rest },
  ref,
) {
  return (
    <select ref={ref} className={cx('bt-select', controlSize === 'sm' && 'bt-select-sm', className)} {...rest}>
      {children}
    </select>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Fonte monoespaçada, sem corretor ortográfico (JSON, SQL, scripts). */
  code?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ className, code, ...rest }, ref) {
  return <textarea ref={ref} className={cx('bt-textarea', code && 'bt-textarea-code', className)} spellCheck={!code} {...rest} />;
});

// ---------------------------------------------------------------- Switch, Checkbox, Radio

export interface SwitchProps {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  label?: ReactNode;
  disabled?: boolean;
  id?: string;
  name?: string;
  className?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}

export function Switch({ checked, defaultChecked = false, onCheckedChange, label, disabled, id, name, className, ...aria }: SwitchProps) {
  const [value, setValue] = useControllableState(checked, defaultChecked, onCheckedChange);
  return (
    <label className={cx('bt-switch', className)}>
      <input
        id={id}
        name={name}
        type="checkbox"
        role="switch"
        checked={value}
        disabled={disabled}
        aria-label={aria['aria-label']}
        aria-describedby={aria['aria-describedby']}
        aria-invalid={aria['aria-invalid']}
        onChange={(e) => setValue(e.target.checked)}
      />
      <span className="bt-switch-track" aria-hidden />
      {label && <span>{label}</span>}
    </label>
  );
}

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: ReactNode;
  indeterminate?: boolean;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, indeterminate, className, ...rest },
  forwarded,
) {
  const inner = useRef<HTMLInputElement | null>(null);
  // sem dependências: o navegador zera indeterminate a cada clique, então reaplicamos a cada render
  useEffect(() => {
    if (inner.current) inner.current.indeterminate = !!indeterminate;
  });
  const input = (
    <input
      ref={(el) => {
        inner.current = el;
        if (typeof forwarded === 'function') forwarded(el);
        else if (forwarded) forwarded.current = el;
      }}
      type="checkbox"
      className={cx('bt-checkbox', !label && className)}
      {...rest}
    />
  );
  if (!label) return input;
  return (
    <label className={cx('bt-check', className)}>
      {input}
      <span>{label}</span>
    </label>
  );
});

export interface RadioProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: ReactNode;
}

export const Radio = forwardRef<HTMLInputElement, RadioProps>(function Radio({ label, className, ...rest }, ref) {
  const input = <input ref={ref} type="radio" className={cx('bt-radio', !label && className)} {...rest} />;
  if (!label) return input;
  return (
    <label className={cx('bt-check', className)}>
      {input}
      <span>{label}</span>
    </label>
  );
});

// ---------------------------------------------------------------- Segmentado

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Ocupa toda a largura, opções com o mesmo tamanho. */
  block?: boolean;
  'aria-label'?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}

export function Segmented<T extends string>({ options, value, onChange, block, disabled, className, id, ...aria }: SegmentedProps<T>) {
  const field = useContext(FieldContext);
  return (
    <div
      id={id}
      className={cx('bt-segmented', block && 'bt-segmented-block', className)}
      role="group"
      aria-label={aria['aria-label']}
      aria-labelledby={aria['aria-label'] ? undefined : field?.labelId}
      aria-describedby={field?.messageId}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          disabled={disabled || o.disabled}
          onClick={() => onChange(o.value)}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- JSON

export interface JsonTextareaProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  /** 'object' exige objeto; 'array' exige lista; 'any' aceita qualquer JSON. */
  expect?: 'object' | 'array' | 'any';
  rows?: number;
  disabled?: boolean;
  placeholder?: string;
  invalid?: boolean;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}

/** Editor JSON simples: valida enquanto digita e formata com um clique. */
export function JsonTextarea({ id, value, onChange, expect = 'object', rows = 8, disabled, placeholder, invalid, ...aria }: JsonTextareaProps) {
  const labels = useLabels();
  let error: string | null = null;
  if (value.trim()) {
    const r = parseJson(value);
    if (!r.ok) error = r.error;
    else if (expect === 'object' && (typeof r.value !== 'object' || r.value === null || Array.isArray(r.value))) error = labels.jsonExpectObject;
    else if (expect === 'array' && !Array.isArray(r.value)) error = labels.jsonExpectArray;
  }
  return (
    <div className="bt-stack-sm" style={{ gap: 6 }}>
      <Textarea
        id={id}
        code
        rows={rows}
        value={value}
        disabled={disabled}
        placeholder={placeholder ?? (expect === 'array' ? '[]' : '{\n  \n}')}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error || invalid || aria['aria-invalid'] || undefined}
        aria-describedby={aria['aria-describedby']}
      />
      <div className="bt-row-between">
        <span className={error ? 'bt-field-error' : 'bt-field-hint'}>{error ?? (value.trim() ? labels.jsonValid : '')}</span>
        <button
          type="button"
          className="bt-btn bt-btn-ghost bt-btn-sm"
          disabled={disabled || !!error || !value.trim()}
          onClick={() => {
            const r = parseJson(value);
            if (r.ok) onChange(prettyJson(r.value));
          }}
        >
          <IconBraces size={14} /> {labels.jsonFormat}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Etiquetas editáveis

export interface TagInputProps {
  id?: string;
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Teclas que confirmam a etiqueta (padrão: Enter e vírgula). */
  separators?: string[];
  /** Normaliza/valida antes de adicionar; retorne null para recusar. */
  transform?: (raw: string) => string | null;
  max?: number;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}

export function TagInput({
  id,
  value,
  onChange,
  placeholder,
  disabled,
  separators = ['Enter', ','],
  transform = (s) => s.trim() || null,
  max,
  ...aria
}: TagInputProps) {
  const labels = useLabels();
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const full = max !== undefined && value.length >= max;

  const commit = (raw: string) => {
    const t = transform(raw);
    if (!t || value.includes(t) || full) return false;
    onChange([...value, t]);
    return true;
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (separators.includes(e.key)) {
      if (!draft.trim()) {
        if (e.key !== 'Enter') e.preventDefault();
        return;
      }
      e.preventDefault();
      if (commit(draft)) setDraft('');
    } else if (e.key === 'Backspace' && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div className="bt-tag-input" data-disabled={disabled || undefined} onClick={() => inputRef.current?.focus()}>
      {value.map((t) => (
        <span key={t} className="bt-tag bt-tag-green">
          {t}
          {!disabled && (
            <button
              type="button"
              className="bt-tag-remove"
              aria-label={labels.removeTag(t)}
              onClick={(e) => {
                e.stopPropagation();
                onChange(value.filter((v) => v !== t));
              }}
            >
              <IconX size={12} strokeWidth={2} />
            </button>
          )}
        </span>
      ))}
      <input
        ref={inputRef}
        id={id}
        value={draft}
        disabled={disabled || full}
        placeholder={value.length ? undefined : placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        onBlur={() => {
          if (draft.trim() && commit(draft)) setDraft('');
        }}
        aria-describedby={aria['aria-describedby']}
        aria-invalid={aria['aria-invalid']}
      />
    </div>
  );
}

// ---------------------------------------------------------------- Upload

export interface DropzoneProps {
  onFiles: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  title?: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  /** Conteúdo extra abaixo da dica (ex.: arquivo escolhido). */
  children?: ReactNode;
  className?: string;
  /** Vai para o <input type="file"> (o rótulo de um <Field> abre o seletor). */
  id?: string;
  'aria-describedby'?: string;
}

/** Área de arrastar-e-soltar que também abre o seletor de arquivos (clique, Enter ou Espaço). */
export function Dropzone({ onFiles, accept, multiple, disabled, title, hint, icon, children, className, id, ...aria }: DropzoneProps) {
  const labels = useLabels();
  const field = useContext(FieldContext);
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  const emit = (list: FileList | null) => {
    if (!list || !list.length) return;
    const files = Array.from(list);
    onFiles(multiple ? files : files.slice(0, 1));
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDrag(false);
    if (!disabled) emit(e.dataTransfer.files);
  };

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled || undefined}
      aria-labelledby={field ? `${field.labelId} ${titleId}` : titleId}
      aria-describedby={aria['aria-describedby'] ?? field?.messageId}
      className={cx('bt-dropzone', drag && 'bt-drag', className)}
      onClick={(e) => {
        // o clique do próprio input (ou do <label for>) já abre o seletor
        if (e.target === inputRef.current) return;
        inputRef.current?.click();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={onDrop}
    >
      {icon ?? <IconUpload size={26} />}
      <span className="bt-dropzone-title" id={titleId}>
        {title ?? labels.dropzoneTitle}
      </span>
      {(hint ?? labels.dropzoneHint) && <span className="bt-dropzone-hint">{hint ?? labels.dropzoneHint}</span>}
      {children}
      <input
        ref={inputRef}
        id={id}
        type="file"
        hidden
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        onChange={(e) => {
          emit(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}
