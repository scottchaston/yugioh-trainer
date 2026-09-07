/**
 * Card art: maps each card name to a creature illustration or Spell/Trap motif.
 * Cards without a specific entry fall back to something sensible for their type.
 */
import type { CardDefinition } from '../../cards';
import { Creature, type CreatureSpec, type Palette } from './creatures';
import { Motif, type MotifKind, type MotifPalette } from './motifs';

const pal = (body: string, belly: string, accent: string, eye: string, glow: string): Palette => ({ body, belly, accent, eye, glow });

const CREATURES: Record<string, CreatureSpec> = {
  // ---- Saga of Blue-Eyes White Dragon ----
  'Blue-Eyes White Dragon': { archetype: 'dragon', palette: pal('#f4f7fb', '#dbe6f5', '#c9d8ee', '#2a7fff', '#4cc9f0') },
  'Azure-Eyes Silver Dragon': { archetype: 'dragon', palette: pal('#d9dde6', '#eef1f6', '#b9c3d6', '#3fb5ff', '#8ad8ff') },
  'Rabidragon': { archetype: 'dragon', palette: pal('#fbfbfb', '#eeeeee', '#e3e3e3', '#e04a6a', '#cfe8ff'), features: ['ears'] },
  'Alexandrite Dragon': { archetype: 'dragon', palette: pal('#4fbf8f', '#b8f2d8', '#7c5cc7', '#ffe066', '#7ce0b8') },
  'Luster Dragon': { archetype: 'dragon', palette: pal('#2f6fd6', '#9cc3ff', '#1d4fa8', '#ffe066', '#4c8dff') },
  'Flamvell Guard': { archetype: 'dragon', palette: pal('#b8372e', '#ffb37a', '#7a1f1a', '#ffe066', '#ff7a3d'), features: ['fire'] },
  'Maiden with Eyes of Blue': { archetype: 'mage', palette: pal('#e9eef7', '#ffffff', '#5b6ea8', '#2a7fff', '#9cc3ff') },
  'Rider of the Storm Winds': { archetype: 'dragon', palette: pal('#4ea56b', '#cdebd3', '#2e6b46', '#ffe066', '#8be0a8'), features: ['rider'] },
  'Darkstorm Dragon': { archetype: 'dragon', palette: pal('#3a3550', '#6c6690', '#1f1b30', '#ff4d6d', '#8a7fd6'), features: ['storm'] },
  'Kaiser Glider': { archetype: 'dragon', palette: pal('#e6b93a', '#fff0b3', '#b58a1e', '#2a7fff', '#ffd166') },
  'Hieratic Dragon of Tefnuit': { archetype: 'dragon', palette: pal('#f2e4c0', '#fff8e6', '#d3a63a', '#3fb5ff', '#ffe9a8') },
  'Mirage Dragon': { archetype: 'dragon', palette: pal('#7fd8d1', '#d7f6f2', '#4fb3aa', '#ff9f1c', '#a8f0ea') },
  'Divine Dragon Apocralyph': { archetype: 'dragon', palette: pal('#8b2a3a', '#d98c9a', '#4a1420', '#ffe066', '#c85068') },
  'The White Stone of Legend': { archetype: 'stone', palette: pal('#e8ecf3', '#ffffff', '#4cc9f0', '#2a7fff', '#9cc3ff') },
  'Kaibaman': { archetype: 'warrior', palette: pal('#2f3a66', '#c9d2ea', '#e9eef7', '#2a7fff', '#9cc3ff') },
  'Herald of Creation': { archetype: 'mage', palette: pal('#f0d78c', '#fff6d6', '#c48a1f', '#3fb5ff', '#ffe9a8') },
  'Kaiser Sea Horse': { archetype: 'serpent', palette: pal('#3d8fd6', '#a9d8ff', '#e6b93a', '#ffe066', '#4cc9f0') },
  'Honest': { archetype: 'angel', palette: pal('#fbfbf6', '#ffffff', '#f3e7b3', '#f5b400', '#fff3b0'), features: ['halo'] },
  'Shining Angel': { archetype: 'angel', palette: pal('#fff1b8', '#fffbe6', '#ffd166', '#2a7fff', '#ffe066'), features: ['halo'] },
  // ---- Legend of the Crystal Beasts ----
  'Crystal Beast Ruby Carbuncle': { archetype: 'carbuncle', palette: pal('#e9c7f2', '#fbeefe', '#d9a7e8', '#e0264f', '#ff7aa0'), features: ['crystal'] },
  'Crystal Beast Amethyst Cat': { archetype: 'feline', palette: pal('#b58bd9', '#e8d6f7', '#7b4fb0', '#8e2ee6', '#c9a6ff'), features: ['crystal'] },
  'Crystal Beast Emerald Tortoise': { archetype: 'tortoise', palette: pal('#5cae7c', '#c8ecd4', '#2f7a4f', '#1fbf6a', '#7ce0b8'), features: ['crystal'] },
  'Crystal Beast Topaz Tiger': { archetype: 'feline', palette: pal('#f0a63a', '#ffe1b3', '#5a3410', '#ffb400', '#ffd166'), features: ['stripes', 'crystal'] },
  'Crystal Beast Amber Mammoth': { archetype: 'mammoth', palette: pal('#b8763a', '#e6c39c', '#7a4b2a', '#ff9f1c', '#ffbf69'), features: ['crystal'] },
  'Crystal Beast Cobalt Eagle': { archetype: 'bird', palette: pal('#2f5fd6', '#a9c3ff', '#1d3f9e', '#2a7fff', '#4c8dff'), features: ['crystal'] },
  'Crystal Beast Sapphire Pegasus': { archetype: 'pegasus', palette: pal('#f7f9ff', '#ffffff', '#9cc3ff', '#1f5fd6', '#4cc9f0'), features: ['crystal'] },
  'Crystal Beast Rainbow Dragon': { archetype: 'dragon', palette: pal('#f7f9ff', '#ffffff', '#c9d8ee', '#ff4d6d', '#b388ff'), features: ['rainbow', 'crystal'] },
  'Rainbow Dragon': { archetype: 'dragon', palette: pal('#fbfbfb', '#ffffff', '#e0e6ff', '#4cc9f0', '#b388ff'), features: ['rainbow'] },
  'Rainbow Dark Dragon': { archetype: 'dragon', palette: pal('#2a2540', '#4a4470', '#5b4fa0', '#ff4d6d', '#8a7fd6'), features: ['rainbow'] },
  'Rainbow Overdragon': { archetype: 'dragon', palette: pal('#f7f2ff', '#ffffff', '#e0d4ff', '#ff9f1c', '#ffd166'), features: ['rainbow', 'crystal'] },
  'Ultimate Crystal Rainbow Dragon Overdrive': { archetype: 'dragon', palette: pal('#ffffff', '#f4f0ff', '#ffe066', '#ff4d6d', '#ff9f1c'), features: ['rainbow', 'crystal', 'storm'] },
  'Crystal Master': { archetype: 'mage', palette: pal('#5b3a8a', '#c9b3e8', '#8e6fd1', '#3ee3b6', '#b388ff'), features: ['crystals'] },
  'Crystal Keeper': { archetype: 'warrior', palette: pal('#b8372e', '#ffd9c2', '#ffb37a', '#4cc9f0', '#ff7a3d'), features: ['crystals'] },
  'Hamon, Lord of Striking Thunder': { archetype: 'titan', palette: pal('#e6c93a', '#fff0b3', '#fff6a8', '#2a7fff', '#ffe066') },
  'Dimension Shifter': { archetype: 'mage', palette: pal('#3a3550', '#8a7fd6', '#4cc9f0', '#ff4d6d', '#8a7fd6'), features: ['portal'] },
  'Contact "C"': { archetype: 'insect', palette: pal('#6b7a3a', '#b7c47a', '#c7e39a', '#ff9f1c', '#9bd36a') },
  'Ash Blossom & Joyous Spring': { archetype: 'ghost', palette: pal('#f6d6e4', '#ffffff', '#ff8fb0', '#e0264f', '#ffb3c8'), features: ['flames'] },
  'Ghost Belle & Haunted Mansion': { archetype: 'ghost', palette: pal('#d6e8f6', '#ffffff', '#7fb8ff', '#2a7fff', '#9cc3ff'), features: ['flames'] },
  'Crystal Beast Token': { archetype: 'carbuncle', palette: pal('#d9dde6', '#eef1f6', '#b9c3d6', '#4cc9f0', '#8ad8ff'), features: ['crystal'] },
  // ---- Beware of Traptrix ----
  'Traptrix Pudica': { archetype: 'traptrix', palette: pal('#f4a6c1', '#ffd6e6', '#7cc47f', '#ff4d6d', '#ffb3c8'), features: ['crystal'] },
  'Traptrix Arachnocampa': { archetype: 'traptrix', palette: pal('#8fd3ff', '#e6f6ff', '#4a7fb5', '#4cc9f0', '#8ad8ff'), features: ['web'] },
  'Traptrix Atrax': { archetype: 'traptrix', palette: pal('#b388ff', '#e8d6f7', '#5b3a8a', '#8e2ee6', '#c9a6ff'), features: ['web'] },
  'Traptrix Myrmeleo': { archetype: 'traptrix', palette: pal('#e6b93a', '#fff0b3', '#8a5a2b', '#ff9f1c', '#ffd166') },
  'Traptrix Nepenthes': { archetype: 'traptrix', palette: pal('#4fbf8f', '#c8ecd4', '#2f7a4f', '#3ee3b6', '#7ce0b8') },
  'Traptrix Dionaea': { archetype: 'traptrix', palette: pal('#ff7aa0', '#ffd6e6', '#b8372e', '#ff4d6d', '#ff9fb8') },
  'Traptrix Genlisea': { archetype: 'traptrix', palette: pal('#7fd8d1', '#d7f6f2', '#2f7f77', '#3ee3b6', '#a8f0ea') },
  'Traptrix Vesiculo': { archetype: 'traptrix', palette: pal('#9cc3ff', '#e9eef7', '#2f6fd6', '#4cc9f0', '#cfe8ff') },
  'Traptrix Mantis': { archetype: 'traptrix', palette: pal('#9bd36a', '#e3f6c8', '#4a7a2a', '#ffe066', '#c7e39a') },
  'Gadarla, the Mystery Dust Kaiju': { archetype: 'kaiju', palette: pal('#a8c5c9', '#e6f0f2', '#5a7c82', '#ff9f1c', '#c9d8ee'), features: ['dust'] },
  'Kumongous, the Sticky String Kaiju': { archetype: 'kaiju', palette: pal('#6b4423', '#c9a06a', '#3a2412', '#ff4d6d', '#ffffff'), features: ['web'] },
  'Retaliating "C"': { archetype: 'insect', palette: pal('#5a6a3a', '#b7c47a', '#c7e39a', '#ff4d6d', '#9bd36a') },
  'Resonance Insect': { archetype: 'insect', palette: pal('#3a5a7a', '#9cc3ff', '#c9d8ee', '#ffe066', '#8ad8ff') },
  'Lonefire Blossom': { archetype: 'plant', palette: pal('#ff9f1c', '#ffe066', '#4a7a2a', '#b8372e', '#ff7a3d'), features: ['fire'] },
  'Rose Lover': { archetype: 'plant', palette: pal('#ff4d6d', '#ffb3c8', '#4a7a2a', '#ffe066', '#ff9fb8'), features: ['thorns'] },
  'Sauge de Fleur': { archetype: 'mage', palette: pal('#5b3a8a', '#e8d6f7', '#8e6fd1', '#ff7aa0', '#c9a6ff'), features: ['crystals'] },
  'Mekk-Knight Purple Nightfall': { archetype: 'knight', palette: pal('#5b3a8a', '#c9a6ff', '#2a1a45', '#b388ff', '#c9a6ff'), features: ['blade'] },
  'Mekk-Knight Blue Sky': { archetype: 'knight', palette: pal('#2f6fd6', '#cfe8ff', '#1d3f9e', '#4cc9f0', '#8ad8ff'), features: ['blade'] },
  'Artifact Moralltach': { archetype: 'relic', palette: pal('#e6b93a', '#fff0b3', '#3ee3b6', '#ff4d6d', '#8be0a8') },
  'Fire Hand': { archetype: 'hand', palette: pal('#b8372e', '#ffb37a', '#7a1f1a', '#ffe066', '#ff9f1c'), features: ['fire'] },
  'Ice Hand': { archetype: 'hand', palette: pal('#7fb8ff', '#e0f7ff', '#2f6fd6', '#ffffff', '#8ad8ff'), features: ['ice'] },
  'Thunder Hand': { archetype: 'hand', palette: pal('#e6c93a', '#fff6a8', '#8a6a10', '#2a7fff', '#ffe066'), features: ['thunder'] },
  'Traptrix Rafflesia': { archetype: 'traptrix', palette: pal('#c8102e', '#ffd6e6', '#5a1020', '#ffe066', '#ff7aa0'), features: ['crystal'] },
  'Traptrix Allomerus': { archetype: 'traptrix', palette: pal('#b8372e', '#ffd9c2', '#5a1a10', '#ffe066', '#ff7a3d') },
  'Traptrix Cularia': { archetype: 'traptrix', palette: pal('#3aa78d', '#c8ecd4', '#1d5f4f', '#ffe066', '#3ee3b6'), features: ['web'] },
  'Traptrix Pinguicula': { archetype: 'traptrix', palette: pal('#8e6fd1', '#e8d6f7', '#4a2f8a', '#3ee3b6', '#c9a6ff') },
  'Traptrix Atypus': { archetype: 'traptrix', palette: pal('#3a3550', '#b9c3d6', '#1f1b30', '#ff4d6d', '#8a7fd6'), features: ['web'] },
  'Traptrix Sera': { archetype: 'traptrix', palette: pal('#4cc9f0', '#e6f6ff', '#2a7fff', '#ffe066', '#8ad8ff'), features: ['crystal'] },
  // ---- The Crimson King ----
  'Soul Resonator': { archetype: 'fiend', palette: pal('#b8372e', '#ffb37a', '#5a1a10', '#ffe066', '#ff7a3d'), features: ['fork'] },
  'Vision Resonator': { archetype: 'fiend', palette: pal('#3a3550', '#8a7fd6', '#1f1b30', '#4cc9f0', '#b388ff'), features: ['fork'] },
  'Bone Archfiend': { archetype: 'fiend', palette: pal('#d9dde6', '#ffffff', '#5a5a6a', '#ff4d6d', '#b9c3d6'), features: ['wings'] },
  'Dark Resonator': { archetype: 'fiend', palette: pal('#2a2540', '#5b4fa0', '#1a1428', '#ff9f1c', '#8a7fd6'), features: ['fork'] },
  'Creation Resonator': { archetype: 'fiend', palette: pal('#4fbf8f', '#c8ecd4', '#2f7a4f', '#ffe066', '#7ce0b8'), features: ['fork', 'wings'] },
  'Synkron Resonator': { archetype: 'fiend', palette: pal('#e6b93a', '#fff0b3', '#8a5a2b', '#2a7fff', '#ffd166'), features: ['fork'] },
  'Red Resonator': { archetype: 'fiend', palette: pal('#c8102e', '#ffb3c8', '#5a1020', '#ffe066', '#ff4d6d'), features: ['fork'] },
  'Crimson Resonator': { archetype: 'fiend', palette: pal('#8b0000', '#ff7aa0', '#3a0a10', '#ffe066', '#ff4d6d'), features: ['fork', 'wings'] },
  'Vice Dragon': { archetype: 'dragon', palette: pal('#5b3a8a', '#c9a6ff', '#2a1a45', '#ff4d6d', '#8a7fd6') },
  'Battle Fader': { archetype: 'fiend', palette: pal('#3a3550', '#b9c3d6', '#1f1b30', '#4cc9f0', '#8ad8ff'), features: ['clock', 'wings'] },
  'Red Sprinter': { archetype: 'fiend', palette: pal('#b8372e', '#ffd9c2', '#5a1a10', '#ffe066', '#ff7a3d'), features: ['wings'] },
  'Red Warg': { archetype: 'feline', palette: pal('#b8372e', '#ffd9c2', '#5a1a10', '#ffe066', '#ff7a3d'), features: ['stripes'] },
  'Wandering King Wildwind': { archetype: 'fiend', palette: pal('#2f6fd6', '#cfe8ff', '#1d3f9e', '#ffe066', '#8ad8ff'), features: ['crown', 'wings'] },
  'Phantom King Hydride': { archetype: 'fiend', palette: pal('#3aa78d', '#c8ecd4', '#1d5f4f', '#ffe066', '#3ee3b6'), features: ['crown', 'fork'] },
  'Magical King Moonstar': { archetype: 'fiend', palette: pal('#e6c93a', '#fff6a8', '#8a6a10', '#2a7fff', '#ffe066'), features: ['crown'] },
  'Absolute King Back Jack': { archetype: 'fiend', palette: pal('#2a2540', '#8a7fd6', '#1a1428', '#ff4d6d', '#b388ff'), features: ['crown'] },
  'Red Dragon Archfiend/Assault Mode': { archetype: 'archfiend', palette: pal('#8b0000', '#ff7a3d', '#2a0a10', '#ffe066', '#ff4d6d'), features: ['nova', 'crown'] },
  'Assault Beast': { archetype: 'feline', palette: pal('#8a5a2b', '#e6c39c', '#3a2412', '#ffe066', '#ffbf69'), features: ['stripes'] },
  'Psi-Reflector': { archetype: 'psychic', palette: pal('#3a3550', '#8a7fd6', '#4cc9f0', '#ffe066', '#8ad8ff') },
  'Fire Ant Ascator': { archetype: 'insect', palette: pal('#b8372e', '#ffb37a', '#ff9f1c', '#ffe066', '#ff7a3d') },
  'Ascator, Dawnwalker': { archetype: 'mage', palette: pal('#e6b93a', '#fff0b3', '#b8372e', '#ff9f1c', '#ffd166') },
  'Danger! Nessie!': { archetype: 'serpent', palette: pal('#3d8fd6', '#a9d8ff', '#1d3f9e', '#ffe066', '#4cc9f0') },
  'Danger! Chupacabra!': { archetype: 'fiend', palette: pal('#5a6a3a', '#b7c47a', '#2a3a1a', '#ff4d6d', '#9bd36a'), features: ['wings'] },
  'Witch of the Black Forest': { archetype: 'mage', palette: pal('#2a2540', '#8a7fd6', '#5b4fa0', '#ff4d6d', '#b388ff'), features: ['portal'] },
  'Scarlight Red Dragon Archfiend': { archetype: 'archfiend', palette: pal('#c8102e', '#ff9f1c', '#3a0a10', '#ffe066', '#ff4d6d'), features: ['nova'] },
  'Hot Red Dragon Archfiend Abyss': { archetype: 'archfiend', palette: pal('#5b0a1e', '#8a7fd6', '#1a0a20', '#4cc9f0', '#b388ff'), features: ['scars'] },
  'Hot Red Dragon Archfiend Bane': { archetype: 'archfiend', palette: pal('#8b0000', '#ffb37a', '#2a0a10', '#ffe066', '#ff9f1c'), features: ['nova', 'scars'] },
  'Red Supernova Dragon': { archetype: 'archfiend', palette: pal('#ff4d6d', '#fff3b0', '#5a1020', '#ffffff', '#ffe066'), features: ['nova', 'crown'] },
  'Red Dragon Archfiend': { archetype: 'archfiend', palette: pal('#8b0000', '#ff7a3d', '#2a0a10', '#ffe066', '#ff4d6d') },
  'Red Nova Dragon': { archetype: 'archfiend', palette: pal('#ff4d6d', '#ffd166', '#5a1020', '#ffffff', '#ff9f1c'), features: ['nova'] },
  'Hot Red Dragon Archfiend King Calamity': { archetype: 'archfiend', palette: pal('#3a0a10', '#ff4d6d', '#1a0408', '#ffe066', '#ff9f1c'), features: ['nova', 'crown', 'scars'] },
  'Red Rising Dragon': { archetype: 'archfiend', palette: pal('#b8372e', '#ffd9c2', '#5a1a10', '#ffe066', '#ff7a3d') },
  'Scarred Dragon Archfiend': { archetype: 'archfiend', palette: pal('#5a1a10', '#b9c3d6', '#2a0a10', '#ff4d6d', '#ff7aa0'), features: ['scars'] },
};

const mp = (main: string, accent: string, glow: string): MotifPalette => ({ main, accent, glow });
const SPELL = mp('#3aa78d', '#1d7f6f', '#3ee3b6');
const TRAP = mp('#d05a8a', '#a8365c', '#ff5c8a');
const CRYSTAL = mp('#4cc9f0', '#b388ff', '#3ee3b6');

const MOTIFS: Record<string, { kind: MotifKind; palette?: MotifPalette }> = {
  // ---- Saga of Blue-Eyes ----
  'Dragon Shrine': { kind: 'shrine', palette: mp('#8a5a2b', '#5a3a1a', '#4cc9f0') },
  "Silver's Cry": { kind: 'cry', palette: mp('#d9dde6', '#b9c3d6', '#4cc9f0') },
  'Burst Stream of Destruction': { kind: 'burst', palette: mp('#4cc9f0', '#ffffff', '#2a7fff') },
  'Stamping Destruction': { kind: 'stomp', palette: mp('#5a6a7a', '#c9d8ee', '#ff9f1c') },
  'A Wingbeat of Giant Dragon': { kind: 'wings', palette: mp('#6b8fbf', '#3a5f8f', '#cfe8ff') },
  'Trade-In': { kind: 'cards', palette: mp('#3aa78d', '#e6b93a', '#3ee3b6') },
  'Cards of Consonance': { kind: 'cards', palette: mp('#b8372e', '#e6b93a', '#ff9f1c') },
  "White Elephant's Gift": { kind: 'cards', palette: mp('#e9eef7', '#b9c3d6', '#ffe066') },
  'One for One': { kind: 'cards', palette: mp('#4fbf8f', '#2f6fd6', '#3ee3b6') },
  'Monster Reborn': { kind: 'ankh', palette: mp('#e6b93a', '#3ee3b6', '#ffe066') },
  'Dragonic Tactics': { kind: 'tactics', palette: mp('#b9c3d6', '#7a1f1a', '#ffe066') },
  'Soul Exchange': { kind: 'soul', palette: mp('#8a7fd6', '#4cc9f0', '#ffffff') },
  'Swords of Revealing Light': { kind: 'swords', palette: mp('#e6b93a', '#c9a23f', '#ffe066') },
  'Enemy Controller': { kind: 'controller', palette: mp('#2f3a66', '#5b6ea8', '#ff4d6d') },
  'Castle of Dragon Souls': { kind: 'castle', palette: mp('#5a6a7a', '#3a4650', '#8a7fd6') },
  'Fiendish Chain': { kind: 'fiendish', palette: mp('#5b3a8a', '#b9c3d6', '#ff4d6d') },
  'Kunai with Chain': { kind: 'chain', palette: mp('#b9c3d6', '#7a7a7a', '#ff9f1c') },
  'Damage Condenser': { kind: 'condenser', palette: mp('#3a4650', '#8a7fd6', '#ffe066') },
  // ---- Beware of Traptrix ----
  'Traptrip Garden': { kind: 'garden', palette: mp('#4fbf8f', '#8a5a2b', '#ffe066') },
  'Traptantalizing Tune': { kind: 'tune', palette: mp('#ff7aa0', '#e6b93a', '#ffe066') },
  'Raigeki': { kind: 'lightning', palette: mp('#2f6fd6', '#ffe066', '#fff6a8') },
  "Harpie's Feather Duster": { kind: 'feather', palette: mp('#4fbf8f', '#2f7a4f', '#ffe066') },
  'Terrifying Trap Hole Nightmare': { kind: 'hole', palette: mp('#5b3a8a', '#ff4d6d', '#b388ff') },
  'Trap Hole': { kind: 'hole', palette: mp('#8a5a2b', '#c9a06a', '#ffe066') },
  'Bottomless Trap Hole': { kind: 'hole', palette: mp('#2a2540', '#8a7fd6', '#4cc9f0') },
  'Void Trap Hole': { kind: 'hole', palette: mp('#3a3550', '#b9c3d6', '#ffffff') },
  'Traptrix Trap Hole Nightmare': { kind: 'hole', palette: mp('#c8102e', '#ff7aa0', '#ffe066') },
  'Floodgate Trap Hole': { kind: 'hole', palette: mp('#2f6fd6', '#4cc9f0', '#8ad8ff') },
  "Gravedigger's Trap Hole": { kind: 'hole', palette: mp('#6b6b7a', '#3a3a48', '#8be0a8') },
  'Trap Trick': { kind: 'cards', palette: mp('#d05a8a', '#a8365c', '#ff5c8a') },
  'The Phantom Knights of Shade Brigandine': { kind: 'armor', palette: mp('#2a2540', '#5b4fa0', '#4cc9f0') },
  'Artifact Sanctum': { kind: 'sanctum', palette: mp('#e6b93a', '#8a5a2b', '#3ee3b6') },
  'Naturia Sacred Tree': { kind: 'tree', palette: mp('#4fbf8f', '#8a5a2b', '#ffe066') },
  'Evenly Matched': { kind: 'scales', palette: mp('#e6b93a', '#c9a23f', '#ffe066') },
  'Traptrix Holeutea': { kind: 'hole', palette: mp('#4fbf8f', '#ff7aa0', '#3ee3b6') },
  // ---- The Crimson King ----
  'Absolute Powerforce': { kind: 'fist', palette: mp('#b8372e', '#8b0000', '#ff9f1c') },
  'Crimson Gaia': { kind: 'crimson', palette: mp('#8b0000', '#ff4d6d', '#ff9f1c') },
  'Resonator Engine': { kind: 'gear', palette: mp('#5a6a7a', '#b8372e', '#ff9f1c') },
  'Resonator Call': { kind: 'horn', palette: mp('#e6b93a', '#b8372e', '#ffe066') },
  'Resonator Command': { kind: 'horn', palette: mp('#b8372e', '#e6b93a', '#ff4d6d') },
  'Burning Soul': { kind: 'flame', palette: mp('#b8372e', '#8b0000', '#ff9f1c') },
  'Pot of Extravagance': { kind: 'pot', palette: mp('#5b3a8a', '#e6b93a', '#ffe066') },
  'Fiendish Golem': { kind: 'golem', palette: mp('#5a6a7a', '#3a4650', '#ff4d6d') },
  'Red Zone': { kind: 'zone', palette: mp('#8b0000', '#ff4d6d', '#ffe066') },
  "King's Synchro": { kind: 'crown', palette: mp('#e6b93a', '#8b0000', '#ffe066') },
  'Red Reign': { kind: 'crown', palette: mp('#c8102e', '#8b0000', '#ff9f1c') },
  'Time to Stand Up': { kind: 'fist', palette: mp('#2f6fd6', '#1d3f9e', '#4cc9f0') },
  'Powerful Rebirth': { kind: 'ankh', palette: mp('#b8372e', '#e6b93a', '#ff9f1c') },
  'Assault Mode Activate': { kind: 'armor', palette: mp('#8b0000', '#ff4d6d', '#ffe066') },
  'Terrors of the Overroot': { kind: 'roots', palette: mp('#5a3a1a', '#8a5a2b', '#9bd36a') },
  'Call of the Haunted': { kind: 'tomb', palette: mp('#6b6b7a', '#3a3a48', '#8be0a8') },
  'Compulsory Evacuation Device': { kind: 'ejector', palette: mp('#b8372e', '#e6b93a', '#ffe066') },
  "Champion's Vigilance": { kind: 'shield', palette: mp('#2f6fd6', '#e6b93a', '#ffe066') },
  // ---- Legend of the Crystal Beasts ----
  'Awakening of the Crystal Ultimates': { kind: 'awakening', palette: mp('#f7f9ff', '#4cc9f0', '#ff4d6d') },
  'Crystal Aegis': { kind: 'aegis', palette: mp('#4cc9f0', '#3a4650', '#3ee3b6') },
  'Ancient City - Rainbow Ruins': { kind: 'ruins', palette: mp('#c9bda0', '#8a7a5a', '#ffe066') },
  'Rainbow Bridge': { kind: 'bridge', palette: mp('#4cc9f0', '#2f6fd6', '#ffffff') },
  'Rainbow Bridge of the Heart': { kind: 'heartbridge', palette: mp('#ff4d6d', '#2f6fd6', '#ffffff') },
  'Crystal Beacon': { kind: 'beacon', palette: mp('#4cc9f0', '#3a4650', '#ffe066') },
  'Crystal Blessing': { kind: 'blessing', palette: mp('#b388ff', '#8a7fd6', '#ffe066') },
  'Crystal Abundance': { kind: 'abundance', palette: CRYSTAL },
  'Crystal Promise': { kind: 'promise', palette: mp('#3ee3b6', '#f2c9a0', '#ffe066') },
  'Crystal Tree': { kind: 'tree', palette: mp('#ff4d6d', '#4cc9f0', '#3ee3b6') },
  'Crystal Release': { kind: 'release', palette: mp('#ff9f1c', '#b9c3d6', '#ffe066') },
  'Rare Value': { kind: 'value', palette: mp('#b388ff', '#e6b93a', '#ffe066') },
  'Rainbow Refraction': { kind: 'prism', palette: mp('#e0e6ff', '#ffffff', '#4cc9f0') },
  'Advanced Dark': { kind: 'darkOrb', palette: mp('#2a2540', '#5b4fa0', '#b388ff') },
  'The Melody of Awakening Dragon': { kind: 'melody', palette: mp('#e6b93a', '#4cc9f0', '#ffe066') },
  'Foolish Burial Goods': { kind: 'shovel', palette: mp('#8a8a8a', '#3aa78d', '#c9bda0') },
  'Cosmic Cyclone': { kind: 'cyclone', palette: mp('#8a7fd6', '#4cc9f0', '#ffffff') },
  'Crystal Boon': { kind: 'boon', palette: mp('#ff4d6d', '#d05a8a', '#ffe066') },
  'Crystal Miracle': { kind: 'miracle', palette: mp('#4cc9f0', '#d05a8a', '#ffe066') },
  'Crystal Brilliance': { kind: 'brilliance', palette: mp('#ffe066', '#ff9f1c', '#ffffff') },
  'Crystal Pair': { kind: 'pair', palette: mp('#4cc9f0', '#ff4d6d', '#ffffff') },
  'Crystal Conclave': { kind: 'conclave', palette: mp('#b388ff', '#d05a8a', '#3ee3b6') },
  'Ultimate Crystal Magic': { kind: 'wand', palette: mp('#ff4d6d', '#d05a8a', '#ffe066') },
  'Counter Gem': { kind: 'counter', palette: mp('#3ee3b6', '#d05a8a', '#ffffff') },
  'Ferret Flames': { kind: 'ferret', palette: mp('#c9a06a', '#ff9f1c', '#ffe066') },
  'Metaverse': { kind: 'globe', palette: mp('#2f6fd6', '#4cc9f0', '#ffffff') },
  'Crystal Bond': { kind: 'bond', palette: mp('#4cc9f0', '#ff4d6d', '#ffe066') },
};

export function artFor(def: CardDefinition): { kind: 'creature'; spec: CreatureSpec } | { kind: 'motif'; motif: MotifKind; palette: MotifPalette } {
  const c = CREATURES[def.name];
  if (c) return { kind: 'creature', spec: c };
  const m = MOTIFS[def.name];
  if (m) return { kind: 'motif', motif: m.kind, palette: m.palette ?? (def.cardType === 'Trap' ? TRAP : SPELL) };
  if (def.cardType === 'Monster') {
    const race = def.race ?? '';
    const archetype: CreatureSpec['archetype'] = race === 'Dragon' ? 'dragon' : race === 'Beast' ? 'feline' : race === 'Winged Beast' ? 'bird' : race === 'Fairy' ? 'angel' : race === 'Spellcaster' ? 'mage' : race === 'Warrior' ? 'warrior' : race === 'Insect' ? 'insect' : race === 'Zombie' ? 'ghost' : race === 'Sea Serpent' || race === 'Aqua' ? 'serpent' : 'warrior';
    return { kind: 'creature', spec: { archetype, palette: pal('#9aa4b8', '#d6dce8', '#6b7a94', '#ffe066', '#8ad8ff') } };
  }
  return { kind: 'motif', motif: def.cardType === 'Trap' ? 'fiendish' : 'cards', palette: def.cardType === 'Trap' ? TRAP : SPELL };
}

/** Renders the illustration for a card as an inline SVG that fills its container. */
export function CardArt({ def, className, style, backdrop = true }: { def: CardDefinition; className?: string; style?: React.CSSProperties; backdrop?: boolean }) {
  const art = artFor(def);
  return (
    <svg viewBox="0 0 100 100" className={className} style={style} aria-hidden="true" preserveAspectRatio="xMidYMid meet">
      {art.kind === 'creature' ? <Creature spec={art.spec} backdrop={backdrop} /> : <Motif kind={art.motif} p={art.palette} backdrop={backdrop} />}
    </svg>
  );
}
