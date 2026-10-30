import { NavLink } from 'react-router-dom';

/** Switches between selling now and filling in days that were not recorded at the stall. */
export function SellTabs() {
  return (
    <nav className="segmented" aria-label="Sales">
      <NavLink to="/" end>
        Sell
      </NavLink>
      <NavLink to="/past">Past days</NavLink>
    </nav>
  );
}
