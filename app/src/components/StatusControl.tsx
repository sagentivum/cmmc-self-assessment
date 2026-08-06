import type { Status } from '../domain/types';
import { STATUS_LABEL } from '../lib/format';

interface Props {
  value: Status;
  /** Gotcha: the third option is rendered ONLY for 3.5.3 and 3.13.11. */
  allowPartial: boolean;
  onChange: (status: Status) => void;
  label: string;
  idPrefix: string;
}

/**
 * A radiogroup, not three checkboxes — that is the whole point. The source
 * database's three independent booleans are what let a requirement be flagged
 * both Satisfied and Other-Than-Satisfied at once, which its two scoring
 * queries then disagree about (gotcha D). One value, one meaning.
 */
export function StatusControl({
  value,
  allowPartial,
  onChange,
  label,
  idPrefix,
}: Props): React.ReactElement {
  const options: Status[] = allowPartial
    ? ['satisfied', 'partial', 'not-satisfied']
    : ['satisfied', 'not-satisfied'];

  return (
    <div className="statusgroup" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          id={`${idPrefix}:${option}`}
          data-status={option}
          aria-checked={value === option}
          onClick={() => onChange(value === option ? 'unassessed' : option)}
          title={
            value === option ? `${STATUS_LABEL[option]} — click again to clear` : STATUS_LABEL[option]
          }
        >
          {STATUS_LABEL[option]}
        </button>
      ))}
    </div>
  );
}
