'use client';

interface EntryToggleProps {
  label: string;
  checked: boolean;
  onChange: () => void;
}

export default function EntryToggle({ label, checked, onChange }: EntryToggleProps) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`entry-toggle${checked ? ' is-on' : ''}`}
      aria-pressed={checked}
    >
      <span className="entry-toggle__label">{label}</span>
      <span className="entry-toggle__track" aria-hidden="true">
        <span className="entry-toggle__thumb" />
      </span>
    </button>
  );
}
