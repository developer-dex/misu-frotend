import { NavLink } from 'react-router-dom';

/** Switches between the three ingredient screens: what was used, what was bought, what is left. */
export function IngredientsTabs() {
  return (
    <nav className="segmented" aria-label="Ingredients">
      <NavLink to="/usage">Daily use</NavLink>
      <NavLink to="/purchases">Purchases</NavLink>
      <NavLink to="/stock">Stock</NavLink>
    </nav>
  );
}
