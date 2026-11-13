/** Helpers to keep form values after failed server actions. */

export function formText(formData: FormData, key: string) {
  return String(formData.get(key) ?? "");
}

export function formChecked(formData: FormData, key: string) {
  return formData.get(key) === "on";
}
