"use client";

import { useState, type InputHTMLAttributes } from "react";

type PasswordFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: string;
};

export function PasswordField({ label, ...inputProps }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  return <label>
    {label}
    <span className="password-field">
      <input {...inputProps} type={visible ? "text" : "password"} />
      <button
        type="button"
        className="password-visibility"
        aria-label={visible ? "Скрыть пароль" : "Показать пароль"}
        aria-pressed={visible}
        onClick={() => setVisible((current) => !current)}
      >{visible ? "Скрыть" : "Показать"}</button>
    </span>
  </label>;
}
