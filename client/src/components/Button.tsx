import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { buttonClass, type ButtonSize, type ButtonVariant } from './buttonStyles';

// `icon` sits before the label (Royale's Button), sized by buttonStyles.
export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  className = '',
  children,
  ...props
}: { icon?: ReactNode; size?: ButtonSize; variant?: ButtonVariant } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...props} className={`${buttonClass(variant, size)} ${className}`}>
      {icon}
      {children}
    </button>
  );
}
