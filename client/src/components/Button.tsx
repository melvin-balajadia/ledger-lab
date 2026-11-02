import type { ButtonHTMLAttributes } from 'react';
import { buttonClass, type ButtonSize, type ButtonVariant } from './buttonStyles';

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: { size?: ButtonSize; variant?: ButtonVariant } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={`${buttonClass(variant, size)} ${className}`} />;
}
