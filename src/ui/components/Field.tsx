import type {
  InputHTMLAttributes,
  ReactNode,
  Ref,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';

type Common = {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  mono?: boolean;
  endAdornment?: ReactNode;
};

type InputProps = Common & {
  as?: 'input';
  inputRef?: Ref<HTMLInputElement>;
  inputProps?: InputHTMLAttributes<HTMLInputElement>;
};

type TextareaProps = Common & {
  as: 'textarea';
  inputRef?: Ref<HTMLTextAreaElement>;
  inputProps?: TextareaHTMLAttributes<HTMLTextAreaElement>;
};

type SelectProps = Common & {
  as: 'select';
  inputRef?: Ref<HTMLSelectElement>;
  inputProps?: SelectHTMLAttributes<HTMLSelectElement>;
  children: ReactNode;
};

type Props = InputProps | TextareaProps | SelectProps;

/** Single themed control well — password / text / textarea / select. */
export default function Field(props: Props) {
  const { label, value, onChange, disabled, mono, endAdornment } = props;
  const wellClass = [
    'field-well',
    props.as === 'textarea' ? 'textarea' : '',
    mono ? 'field-mono' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <label className="field">
      {label}
      <div className={wellClass}>
        {props.as === 'textarea' ? (
          <textarea
            ref={props.inputRef}
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            {...props.inputProps}
          />
        ) : props.as === 'select' ? (
          <select
            ref={props.inputRef}
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            {...props.inputProps}
          >
            {props.children}
          </select>
        ) : (
          <input
            ref={props.inputRef}
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            {...props.inputProps}
          />
        )}
        {endAdornment}
      </div>
    </label>
  );
}
