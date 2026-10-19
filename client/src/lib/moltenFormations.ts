/** Original connected Molten formations. Keys retain existing tile-art colors. */
export type MoltenFormation = "I" | "O" | "T" | "S" | "Z" | "L" | "J";
export type FormationMatrix = number[][];
const BASE: Record<MoltenFormation, FormationMatrix> = {
  I: [[1,1]],                         // Ember Pair: gap-repair domino
  O: [[0,1,0],[1,1,1],[0,1,0]],     // Molten Spear (5)
  T: [[0,0,1,1],[1,1,1,0]],         // Ember Hook (5)
  S: [[1,1,0],[0,1,1],[0,0,1]],     // Magma Step (5)
  Z: [[1,1,1],[0,1,0],[0,1,0]],     // Ash Fork (5)
  L: [[1,1,0],[0,1,0],[0,1,1]],     // Serpent (5)
  J: [[0,1,0,1,0],[1,1,1,1,1]],     // Lava Crown (7, rare)
};
export const MOLTEN_FORMATION_NAMES: Record<MoltenFormation,string> = {
  I: "Ember Pair", O: "Molten Spear", T: "Ember Hook", S: "Magma Step",
  Z: "Ash Fork", L: "Serpent", J: "Lava Crown",
};
export const MOLTEN_FORMATION_WEIGHTS: Record<MoltenFormation,number> = {
  I: 3, O: 2, T: 2, S: 2, Z: 2, L: 2, J: 1,
};
export function rotateMoltenFormation(matrix: FormationMatrix): FormationMatrix {
  return matrix[0].map((_, col) => matrix.map(row => row[col]).reverse());
}
export const MOLTEN_FORMATIONS: Record<MoltenFormation, FormationMatrix[]> =
  Object.fromEntries((Object.keys(BASE) as MoltenFormation[]).map(key => {
    const rotations = [BASE[key]];
    for(let i=1;i<4;i++) rotations.push(rotateMoltenFormation(rotations[i-1]));
    return [key,rotations];
  })) as Record<MoltenFormation, FormationMatrix[]>;

export function makeMoltenFormationBag(random: () => number = Math.random): MoltenFormation[] {
  const bag = (Object.keys(MOLTEN_FORMATION_WEIGHTS) as MoltenFormation[]).flatMap(
    key => Array<MoltenFormation>(MOLTEN_FORMATION_WEIGHTS[key]).fill(key)
  );
  for(let i=bag.length-1;i>0;i--) {
    const j=Math.min(i,Math.max(0,Math.floor(random()*(i+1))));
    [bag[i],bag[j]]=[bag[j],bag[i]];
  }
  return bag;
}
export function moltenFormationCells(type: MoltenFormation, rotation=0): number {
  return MOLTEN_FORMATIONS[type][rotation].flat().filter(Boolean).length;
}
