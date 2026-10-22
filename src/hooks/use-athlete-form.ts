import { useState, useCallback } from "react";

export interface AthleteFormData {
  name: string;
  dob: string;
  level: string;
  status: string;
  groupId: string;
  phone: string;
  address: string;
  notes: string;
  emergencyContact: string;
  emergencyPhone: string;
}

const initialFormData: AthleteFormData = {
  name: "",
  dob: "",
  level: "",
  status: "active",
  groupId: "",
  phone: "",
  address: "",
  notes: "",
  emergencyContact: "",
  emergencyPhone: "",
};

export function useAthleteForm() {
  const [formData, setFormData] = useState<AthleteFormData>(initialFormData);

  const updateField = useCallback((field: keyof AthleteFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }, []);

  const resetForm = useCallback(() => {
    setFormData(initialFormData);
  }, []);

  const setFormDataDirect = useCallback((data: Partial<AthleteFormData>) => {
    setFormData((prev) => ({ ...prev, ...data }));
  }, []);

  return { formData, updateField, resetForm, setFormDataDirect };
}
