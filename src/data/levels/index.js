// Ordered list of locations. To add a location: create a file in this folder
// (copy an existing one), import it here and append it to LEVELS.
// Run `npm test` afterwards: tests/levels.test.mjs validates every level.

import snack from './01-snack.js';
import cafe from './02-cafe.js';
import pizzeria from './03-pizzeria.js';
import sushi from './04-sushi.js';
import diner from './05-diner.js';
import creperie from './06-creperie.js';
import foodcourt from './07-foodcourt.js';
import palace from './08-palace.js';

export const LEVELS = [snack, cafe, pizzeria, sushi, diner, creperie, foodcourt, palace];
