type ChoiceGroupProps = {
  legend: string;
  name: string;
  options: Record<string, string>;
  defaultValue?: string | null;
  /** Default true. */
  required?: boolean;
};

// Radio group (required unless told otherwise) rendered as large tap targets.
export default function ChoiceGroup({ legend, name, options, defaultValue, required = true }: ChoiceGroupProps) {
  return (
    <fieldset className="choice-group">
      <legend>{legend}</legend>
      <div className="choice-options">
        {Object.entries(options).map(([value, label]) => (
          <label key={value}>
            <input type="radio" name={name} value={value} required={required} defaultChecked={value === defaultValue} />
            <span>{label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
