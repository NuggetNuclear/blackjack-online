'use client';

import type { InputHTMLAttributes, Ref } from 'react';

interface EntryInputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  ref?: Ref<HTMLInputElement>;
}

export default function EntryInput({
  className = '',
  invalid = false,
  ref,
  ...props
}: EntryInputProps) {
  const classes = ['entry-input', invalid ? 'entry-input--invalid' : '', className].filter(Boolean).join(' ');
  return <input ref={ref} className={classes} {...props} />;
}
