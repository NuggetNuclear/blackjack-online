'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';

type EntryButtonVariant = 'primary' | 'secondary' | 'text';

interface EntryButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: EntryButtonVariant;
}

export default function EntryButton({
  children,
  className = '',
  type = 'button',
  variant = 'secondary',
  ...props
}: EntryButtonProps) {
  const classes = ['entry-button', `entry-button--${variant}`, className].filter(Boolean).join(' ');

  return (
    <button type={type} className={classes} {...props}>
      {children}
    </button>
  );
}
