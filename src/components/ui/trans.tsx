'use client';

import { ReactNode, createElement } from 'react';
import { useTranslation } from '@/hooks/use-translation';

interface TransProps {
  children: string;
  params?: Record<string, string | number>;
  className?: string;
}

/**
 * Trans component for text with interpolation
 *
 * Usage:
 * <Trans i18nKey="common.welcome" params={{ name: 'John' }} />
 * <Trans>Simple text without key</Trans>
 */
export function Trans({ children, params, className }: TransProps) {
  const { t } = useTranslation();

  // If children is a translation key (contains dots or is all uppercase with underscores)
  const isKey =
    children.includes('.') ||
    /^[A-Z][A-Z0-9_]*$/.test(children);

  let text: string;

  if (isKey) {
    text = t(children, params);
  } else {
    text = children;
    // Interpolate params manually if no key
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        text = text.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
      });
    }
  }

  // Parse markdown-like syntax for simple formatting
  // **bold** -> <strong>bold</strong>
  // *italic* -> <em>italic</em>
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);

  if (parts.length === 1) {
    return <span className={className}>{text}</span>;
  }

  return (
    <span className={className}>
      {parts.map((part, index) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <strong key={index}>{part.slice(2, -2)}</strong>
          );
        }
        if (part.startsWith('*') && part.endsWith('*')) {
          return (
            <em key={index}>{part.slice(1, -1)}</em>
          );
        }
        return part;
      })}
    </span>
  );
}

export default Trans;
