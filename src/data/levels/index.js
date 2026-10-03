// Ordered list of locations. To add a location: create a file in this folder
// (copy an existing one), import it here and append it to LEVELS.
// Run `npm test` afterwards: tests/levels.test.mjs validates every level.

import snack from './01-snack.js';
import cafe from './02-cafe.js';
import pizzeria from './03-pizzeria.js';

export const LEVELS = [snack, cafe, pizzeria];
