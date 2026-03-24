/**
 * Trusted operation config loaded from a KV key (tamper-proof role capacities).
 *
 * KV key: OPS_CONFIG_JSON
 * Shape:
 * {
 *   "op-001": { "roles": { "SEAD|F-16C Viper": 10, "SEAD|F/A-18C Hornet": 10 } },
 *   "op-002": { "roles": { "HYDRA - SEAD|F-16C Viper": 4 } }
 * }
 */

export async function getRoleSlotsFromConfig(env, operationId, roleKeyOrName) {
  if (!env.OPS_CONFIG) return null;

  const raw = await env.OPS_CONFIG.get('OPS_CONFIG_JSON');
  if (!raw) return null;

  let json;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }

  const op = json[String(operationId)];
  if (!op || !op.roles) return null;

  const slots = op.roles[String(roleKeyOrName)];
  if (!Number.isFinite(Number(slots))) return null;

  return Number(slots);
}
