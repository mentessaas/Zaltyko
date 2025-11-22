"use client";

import { useState, useCallback } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface UseConfirmOptions {
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "default" | "destructive";
}

export function useConfirm() {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<UseConfirmOptions>({
    title: "",
    description: "",
  });
  const [resolvePromise, setResolvePromise] = useState<((value: boolean) => void) | null>(null);
  const [loading, setLoading] = useState(false);

  const confirm = useCallback(
    (opts: UseConfirmOptions): Promise<boolean> => {
      return new Promise((resolve) => {
        setOptions(opts);
        setResolvePromise(() => resolve);
        setOpen(true);
      });
    },
    []
  );

  const handleConfirm = useCallback(async () => {
    setLoading(true);
    try {
      if (resolvePromise) {
        resolvePromise(true);
        setResolvePromise(null);
      }
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }, [resolvePromise]);

  const handleCancel = useCallback(() => {
    if (resolvePromise) {
      resolvePromise(false);
      setResolvePromise(null);
    }
    setOpen(false);
  }, [resolvePromise]);

  const handleOpenChange = useCallback((isOpen: boolean) => {
    if (!isOpen) {
      handleCancel();
    }
  }, [handleCancel]);

  function ConfirmComponent() {
    return (
      <ConfirmDialog
        open={open}
        onOpenChange={handleOpenChange}
        title={options.title}
        description={options.description}
        confirmText={options.confirmText}
        cancelText={options.cancelText}
        variant={options.variant}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        loading={loading}
      />
    );
  }

  return { confirm, ConfirmComponent };
}
