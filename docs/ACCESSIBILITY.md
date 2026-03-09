# Accessibility Guide - Zaltyko

## Overview

This document provides accessibility guidelines and best practices for the Zaltyko application, following WCAG 2.1 AA standards.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Accessibility Components](#accessibility-components)
3. [WCAG Checklist](#wcag-checklist)
4. [Testing Guidelines](#testing-guidelines)
5. [Common Patterns](#common-patterns)

---

## Getting Started

### Why Accessibility Matters

- **Legal Compliance**: Many countries have accessibility laws (e.g., ADA, EN 301 549)
- **Broader Audience**: ~15% of the world population has some form of disability
- **Better UX**: Accessibility improvements benefit all users
- **SEO**: Search engines prefer accessible websites

### Our Accessibility Standards

- **WCAG 2.1 Level AA** compliance target
- **Spanish language** primary (default `lang="es"`)

---

## Accessibility Components

### SkipLink

Provides keyboard-accessible skip navigation to bypass repetitive content.

```tsx
import { SkipLink } from "@/components/ui/skip-link";

// Add to your layout
<SkipLink href="#main-content">
  Saltar al contenido principal
</SkipLink>
```

**Usage:**
- Place at the very beginning of each page layout
- Links to `#main-content` (or appropriate section ID)
- Visible only on keyboard focus

### VisuallyHidden

Hides content visually but keeps it accessible to screen readers.

```tsx
import { VisuallyHidden } from "@/components/ui/visually-hidden";

// Screen reader only text
<VisuallyHidden>Texto solo para lectores de pantalla</VisuallyHidden>

// Focusable (shows on keyboard focus)
<VisuallyHidden focusable>
  Error: El campo es requerido
</VisuallyHidden>
```

### Accessible Form Components

All form components include built-in accessibility features:

```tsx
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";

// Input with required indicator
<Input
  label="Correo electrónico"
  type="email"
  placeholder="tu@email.com"
  required
  aria-describedby="email-help"
/>

// Checkbox with label
<Checkbox
  label="Acepto los términos"
  checked={checked}
  onChange={setChecked}
/>

// Switch with accessible role
<Switch
  label="Notificaciones push"
  checked={notifications}
  onCheckedChange={setNotifications}
/>
```

---

## WCAG Checklist

### Perceivable

- [ ] **1.1.1** Text alternatives for images (alt text)
- [ ] **1.3.1** Info and relationships (semantic HTML)
- [ ] **1.4.1** Use of color (not sole indicator)
- [x] **1.4.3** Contrast (Minimum) - 4.5:1 for text
- [ ] **1.4.4** Resize text - 200% supported
- [ ] **1.4.10** Reflow - works at 320px width
- [ ] **1.4.11** Non-text Contrast - 3:1 for UI

### Operable

- [x] **2.1.1** Keyboard - All functionality keyboard accessible
- [x] **2.1.2** No keyboard trap
- [x] **2.4.1** Bypass blocks - SkipLink implemented
- [x] **2.4.2** Page Titled - Descriptive titles
- [x] **2.4.3** Focus Order - Logical tab order
- [x] **2.4.4** Link Purpose - Clear link text
- [ ] **2.4.6** Headings and Labels - Descriptive headings
- [ ] **2.4.7** Focus Visible - Clear focus indicators

### Understandable

- [x] **3.1.1** Language of Page - `lang="es"`
- [x] **3.2.1** On Focus - No unexpected context changes
- [x] **3.3.1** Error Identification - Clear error messages
- [ ] **3.3.2** Labels or Instructions - Visible labels
- [ ] **3.3.3** Error Suggestion - Helpful error suggestions

### Robust

- [x] **4.1.1** Parsing - Valid HTML
- [x] **4.1.2** Name, Role, Value - ARIA used correctly

---

## Testing Guidelines

### Automated Testing

1. **Lighthouse Accessibility Audit**
   - Open Chrome DevTools (F12)
   - Go to Lighthouse tab
   - Select "Accessibility"
   - Run audit

2. **axe DevTools**
   - Install axe browser extension
   - Run from DevTools > axe tab

### Manual Testing

#### Keyboard Only Test

1. Press `Tab` to navigate forward
2. Press `Shift+Tab` to navigate backward
3. Press `Enter` to activate buttons/links
4. Press `Space` to activate checkboxes/switches
5. Press `Escape` to close modals

#### Screen Reader Testing

**VoiceOver (macOS)**
- Enable: `Cmd + F5`
- Navigate: `Ctrl + Option + Arrow Keys`
- Read element: `Ctrl + Option + F5`

**NVDA (Windows)**
- Enable: `Insert + Space`
- Navigate: `Arrow Keys`
- Read page: `Insert + A`

### Test Checklist

- [ ] Can you navigate the entire page using only the keyboard?
- [ ] Are all interactive elements focusable?
- [ ] Is the focus indicator clearly visible?
- [ ] Do all images have alt text?
- [ ] Are form fields labeled correctly?
- [ ] Are error messages announced to screen readers?
- [ ] Do modals trap focus correctly?
- [ ] Can you close modals with Escape?

---

## Common Patterns

### Accessible Modal

```tsx
import { Modal } from "@/components/ui/modal";

<Modal
  title="Confirmar acción"
  description="¿Estás seguro de continuar?"
  open={isOpen}
  onClose={() => setIsOpen(false)}
>
  <button onClick={confirmar}>Confirmar</button>
</Modal>
```

**Modal Accessibility Features:**
- `role="dialog"` for screen readers
- `aria-modal="true"` to indicate modal
- `aria-labelledby` for title
- `aria-describedby` for description
- Focus trap (focus stays within modal)
- Escape key to close

### Accessible Form with Validation

```tsx
import { FormField } from "@/components/ui/form-field";

<FormField
  id="email"
  label="Correo electrónico"
  type="email"
  required
  validator={validators.combine(
    validators.required(),
    validators.email()
  )}
/>
```

**Form Accessibility Features:**
- Associated labels via `htmlFor`
- `aria-required` for required fields
- `aria-invalid` for error states
- `aria-describedby` linking to error messages
- `role="alert"` for error announcements

### Accessible Data Table

```tsx
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

<Table>
  <TableHeader>
    <TableRow>
      <TableHead>Nombre</TableHead>
      <TableHead>Estado</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    <TableRow>
      <TableCell>Juan Pérez</TableCell>
      <TableCell>Activo</TableCell>
    </TableRow>
  </TableBody>
</Table>
```

**Table Accessibility Features:**
- `scope="col"` on headers (automatically added)
- Semantic `<th>`, `<thead>`, `<tbody>` elements

---

## Color Contrast Reference

### Zaltyko Color Palette

| Color | Hex | Usage | Contrast | Status |
|-------|-----|-------|----------|--------|
| Primary | `#8B5CF6` | Buttons | 4.6:1 | PASS |
| Primary Dark | `#7C3AED` | Hover | 5.2:1 | PASS |
| Text Main | `#1E293B` | Body | 14.5:1 | PASS |
| Text Secondary | `#64748B` | Muted | 5.8:1 | PASS |
| Text Light | `#94A3B8` | Placeholder | 3.1:1 | FAIL |

### Fixes Applied

1. **Placeholder text** now uses `text-zaltyko-text-secondary` instead of `text-light`
2. **Focus rings** use `ring-zaltyko-primary-light` for better visibility
3. **Error states** use red-500 with proper contrast

---

## Resources

- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [MDN Accessibility](https://developer.mozilla.org/en-US/docs/Web/Accessibility)
- [A11y Project Checklist](https://www.a11yproject.com/checklist/)
- [React A11y](https://github.com/reactjs/react-a11y)

---

## Reporting Accessibility Issues

If you find accessibility issues:

1. Document the issue with steps to reproduce
2. Note the affected component(s)
3. Include browser and screen reader if applicable
4. Submit issue with label "accessibility"

---

*Last Updated: 2026-03-09*
*Standards: WCAG 2.1 AA*
