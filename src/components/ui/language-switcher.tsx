'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslation } from '@/hooks/use-translation';
import { Locale, locales, localeNames, localeFlags } from '@/i18n';
import { ChevronDown, Check, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LanguageSwitcherProps {
  variant?: 'dropdown' | 'inline' | 'icon';
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}

export function LanguageSwitcher({
  variant = 'dropdown',
  size = 'md',
  showLabel = false,
  className,
}: LanguageSwitcherProps) {
  const { locale, setLocale } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close dropdown on escape
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  const handleLocaleChange = (newLocale: Locale) => {
    setLocale(newLocale);
    setIsOpen(false);
  };

  const sizeClasses = {
    sm: 'text-xs px-2 py-1',
    md: 'text-sm px-3 py-2',
    lg: 'text-base px-4 py-2',
  };

  const iconSizes = {
    sm: 14,
    md: 16,
    lg: 18,
  };

  // Inline variant - shows all options in a row
  if (variant === 'inline') {
    return (
      <div className={cn('flex items-center gap-1', className)}>
        {locales.map((loc) => (
          <button
            key={loc}
            onClick={() => handleLocaleChange(loc)}
            className={cn(
              'flex items-center gap-1.5 rounded-md transition-colors',
              sizeClasses[size],
              locale === loc
                ? 'bg-primary text-primary-foreground font-medium'
                : 'hover:bg-muted'
            )}
            aria-pressed={locale === loc}
            aria-label={`Switch to ${localeNames[loc]}`}
          >
            <span aria-hidden="true">{localeFlags[loc]}</span>
            {showLabel && (
              <span className="whitespace-nowrap">{localeNames[loc]}</span>
            )}
          </button>
        ))}
      </div>
    );
  }

  // Icon variant - just the icon button
  if (variant === 'icon') {
    return (
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center justify-center rounded-md hover:bg-muted transition-colors',
          sizeClasses[size],
          className
        )}
        aria-label={`Current language: ${localeNames[locale]}. Click to change.`}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <Globe size={iconSizes[size]} />
        <span className="ml-1.5" aria-hidden="true">
          {localeFlags[locale]}
        </span>
      </button>
    );
  }

  // Default dropdown variant
  return (
    <div ref={dropdownRef} className={cn('relative', className)}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center justify-between gap-2 rounded-md border border-input bg-background hover:bg-muted transition-colors min-w-[120px]',
          sizeClasses[size]
        )}
        aria-label={`Current language: ${localeNames[locale]}. Click to change.`}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <span className="flex items-center gap-2">
          <span aria-hidden="true">{localeFlags[locale]}</span>
          {showLabel && (
            <span className="whitespace-nowrap">{localeNames[locale]}</span>
          )}
        </span>
        <ChevronDown
          size={iconSizes[size]}
          className={cn('transition-transform', isOpen && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      {isOpen && (
        <ul
          role="listbox"
          className="absolute z-50 mt-1 w-full min-w-[120px] overflow-hidden rounded-md border bg-popover shadow-md"
        >
          {locales.map((loc) => (
            <li
              key={loc}
              role="option"
              aria-selected={locale === loc}
              onClick={() => handleLocaleChange(loc)}
              className={cn(
                'flex cursor-pointer items-center gap-2 px-3 py-2 text-sm transition-colors',
                locale === loc
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted'
              )}
            >
              <span aria-hidden="true">{localeFlags[loc]}</span>
              <span className="flex-1">{localeNames[loc]}</span>
              {locale === loc && (
                <Check size={14} aria-hidden="true" />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default LanguageSwitcher;
