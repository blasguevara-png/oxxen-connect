export const MFA_REQUIRED_ROLES = new Set(['OWNER'])

export function roleRequiresMfa(role: string | null) {
  return Boolean(role && MFA_REQUIRED_ROLES.has(role))
}
