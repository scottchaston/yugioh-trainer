/** Name-based archetype checks shared by the engine and card scripts. */
const ULTIMATE_CRYSTAL = new Set(['Rainbow Dragon', 'Rainbow Dark Dragon', 'Rainbow Overdragon', 'Ultimate Crystal Rainbow Dragon Overdrive']);

export function isUltimateCrystalName(name: string): boolean {
  return ULTIMATE_CRYSTAL.has(name) || name.includes('Ultimate Crystal');
}
export function isCrystalBeastName(name: string): boolean {
  return name.startsWith('Crystal Beast');
}
