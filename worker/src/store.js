/**
 * Durable Object: RegistrationStore
 *
 * Maintains per-operation state:
 * - role capacities (computed from incoming role->slots, persisted on first use)
 * - registrations keyed by (discord)
 *
 * Behaviour:
 * - Upsert: same discord signing up again replaces their previous selection.
 * - Atomic capacity enforcement: cannot exceed role slots.
 */

import { jsonResponse, readJson } from './util.js';

export class RegistrationStore {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/register' && request.method === 'POST') {
      const body = await readJson(request);
      const res = await this.state.blockConcurrencyWhile(async () => {
        return await this._register(body);
      });
      return res;
    }

    if (url.pathname === '/debug' && request.method === 'GET') {
      const snapshot = await this._snapshot();
      return jsonResponse({ ok: true, snapshot }, 200, '*');
    }

    return new Response('Not found', { status: 404 });
  }

  async _snapshot() {
    const roles = (await this.state.storage.get('roles')) || {};
    const regs = (await this.state.storage.get('regs')) || {};
    return { roles, regsCount: Object.keys(regs).length };
  }

  async _register(body) {
    const discord = String(body.discord).trim();
    const role = String(body.role).trim();

    // roles structure: { [roleName]: { slots:number, filled:number } }
    const roles = (await this.state.storage.get('roles')) || {};
    const regs = (await this.state.storage.get('regs')) || {};

    // If we don't yet know the slots for this role, infer from payload (best effort).
    // Preferred: client should send role_slots, but we can allow explicit slots mapping.
    // NOTE: This Worker can only enforce caps it knows.
    const roleSlots = Number(body.role_slots);
    if (!roles[role]) {
      if (!Number.isFinite(roleSlots) || roleSlots <= 0) {
        return jsonResponse({ ok: false, message: 'Role capacity unknown. Please refresh and try again.' }, 400, '*');
      }
      roles[role] = { slots: roleSlots, filled: 0 };
    }

    // Upsert logic: if existing registration exists, free previous role slot
    const previous = regs[discord];
    if (previous && previous.role && roles[previous.role]) {
      if (roles[previous.role].filled > 0) roles[previous.role].filled -= 1;
    }

    // Enforce capacity
    if (roles[role].filled >= roles[role].slots) {
      // Revert previous decrement (if any)
      if (previous && previous.role && roles[previous.role]) {
        roles[previous.role].filled += 1;
      }
      await this.state.storage.put('roles', roles);
      await this.state.storage.put('regs', regs);
      return jsonResponse({ ok: false, message: 'That role is full.' }, 409, '*');
    }

    // Reserve slot
    roles[role].filled += 1;

    // Save registration
    regs[discord] = {
      discord,
      callsign: String(body.callsign || '').trim(),
      role,
      aircraft: String(body.aircraft || '').trim(),
      experience: String(body.experience || '').trim(),
      notes: String(body.notes || '').trim(),
      notify: Boolean(body.notify),
      updated_at: new Date().toISOString(),
      operation_id: String(body.operation_id || ''),
      operation_name: String(body.operation_name || ''),
    };

    await this.state.storage.put('roles', roles);
    await this.state.storage.put('regs', regs);

    return jsonResponse({ ok: true, result: { role_filled: roles[role].filled, role_slots: roles[role].slots } }, 200, '*');
  }
}
