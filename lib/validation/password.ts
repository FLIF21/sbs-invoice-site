import { z } from "zod";

export const strongPasswordSchema = z.string()
  .min(12, "Пароль должен содержать не менее 12 символов")
  .max(200, "Пароль слишком длинный")
  .regex(/[a-zа-яё]/, "Добавьте строчную букву")
  .regex(/[A-ZА-ЯЁ]/, "Добавьте заглавную букву")
  .regex(/\d/, "Добавьте цифру");
