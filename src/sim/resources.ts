// Koloninin kaynak stoğu. Depo binaları kapasiteyi artırır.
export const resources = {
  wood: 20,
  food: 24,
  woodCap: 60,
  foodCap: 60,
};

export function addWood(n: number): void {
  resources.wood = Math.min(resources.woodCap, resources.wood + n);
}

export function addFood(n: number): void {
  resources.food = Math.min(resources.foodCap, resources.food + n);
}

export function takeFood(n: number): boolean {
  if (resources.food < n) return false;
  resources.food -= n;
  return true;
}
