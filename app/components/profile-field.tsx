import { input } from "@/app/components/ui/styles";

export function ProfileField({
  label,
  name,
  type = "text",
  placeholder,
  defaultValue,
  required,
  error,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={name} className="font-label text-sm font-medium text-ink">
        {label}
        {required && <span className="text-danger"> *</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        placeholder={placeholder}
        defaultValue={defaultValue}
        required={required}
        aria-invalid={error ? true : undefined}
        className={input}
      />
      {error && <p className="font-body text-sm text-danger">{error}</p>}
    </div>
  );
}
