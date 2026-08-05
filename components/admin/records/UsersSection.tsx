"use client";

import { useState } from "react";
import type { AdminData } from "@/lib/domain/admin-types";
import { Permission, Role, type PermissionName, type RoleName } from "@/lib/domain/access";
import { adminRequest, jsonRequest } from "../admin-api";

type UserForm = { id?: string; name: string; email: string; password: string; role: RoleName; active: boolean; permissions: PermissionName[] };
const emptyUser: UserForm = { name: "", email: "", password: "", role: Role.MANAGER, active: true, permissions: [Permission.VIEW_DASHBOARD, Permission.VIEW_INVOICES, Permission.CREATE_INVOICES, Permission.EDIT_INVOICES, Permission.MANAGE_CLIENTS] };

export function UsersSection({ users, permissionLabels, onSaved }: { users: AdminData["users"]; permissionLabels: AdminData["permissionLabels"]; onSaved: (message: string) => Promise<void> }) {
  const [form, setForm] = useState<UserForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (!form) return;
    setBusy(true); setError("");
    try {
      if (form.id) await adminRequest(`/api/admin/users/${form.id}`, jsonRequest("PUT", form));
      else await adminRequest("/api/admin/users", jsonRequest("POST", form));
      setForm(null); await onSaved(form.id ? "Права пользователя обновлены" : "Пользователь создан");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось сохранить"); } finally { setBusy(false); }
  }
  return <section className="admin-section">
    <div className="admin-heading"><div><p className="admin-kicker">КОМАНДА</p><h1>Пользователи и права</h1></div><button className="primary-button" onClick={() => setForm({ ...emptyUser })}>＋ Добавить пользователя</button></div>
    {error && <div className="admin-alert error">{error}</div>}
    <div className="user-grid">{users.map((user) => <article className={!user.active ? "disabled" : ""} key={user.id}><div className="user-avatar">{user.name.slice(0, 2).toUpperCase()}</div><div className="user-info"><div><span className={`role-badge ${user.role.toLowerCase()}`}>{user.role}</span>{!user.active && <span className="status-pill cancelled">Отключён</span>}</div><h2>{user.name}</h2><p>{user.email}</p><small>{user.role === Role.ADMIN ? "Полный доступ" : `${user.permissions.length} разрешений`}</small></div><div className="user-actions"><button onClick={() => setForm({ ...user, password: "" })}>Настроить</button>{user.active && <button className="danger" onClick={() => { if (window.confirm(`Отключить пользователя ${user.name}?`)) void (async () => { setBusy(true); try { await adminRequest(`/api/admin/users/${user.id}`, { method: "DELETE" }); await onSaved("Пользователь отключён"); } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось отключить"); } finally { setBusy(false); } })(); }}>Отключить</button>}</div></article>)}</div>
    {form && <div className="modal-backdrop"><form className="admin-modal user-modal" onSubmit={submit}><button type="button" className="modal-close" onClick={() => setForm(null)}>×</button><h2>{form.id ? "Настроить пользователя" : "Новый пользователь"}</h2><div className="admin-form-grid"><label>Имя<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label>Email<input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label><label>Роль<select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as RoleName })}><option value="ADMIN">Администратор</option><option value="MANAGER">Менеджер</option><option value="VIEWER">Просмотр</option></select></label><label>{form.id ? "Новый пароль (необязательно)" : "Пароль"}<input required={!form.id} type="password" minLength={12} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label><label className="checkbox-line span-2"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} />Учётная запись активна</label></div><fieldset className="permissions-grid" disabled={form.role === Role.ADMIN}><legend>Разрешения</legend>{Object.values(Permission).map((permission) => <label key={permission}><input type="checkbox" checked={form.role === Role.ADMIN || form.permissions.includes(permission)} onChange={(event) => setForm({ ...form, permissions: event.target.checked ? [...form.permissions, permission] : form.permissions.filter((item) => item !== permission) })} /><span>{permissionLabels[permission]}</span></label>)}</fieldset>{error && <div className="admin-alert error">{error}</div>}<button className="primary-button" disabled={busy}>{busy ? "Сохраняем…" : "Сохранить"}</button></form></div>}
  </section>;
}
