/**
 * Test helpers for server engine systems.
 * Build entities and worlds without Room so systems can be tested in isolation.
 */

import { World } from '@spong/shared';
import { createPlayerEntity } from '../engine/PlayerEntityFactory.js';

export function createTestWorld(): World {
  return new World();
}

/** Create a single player entity with full components (player, health, stamina, buffs, etc.). */
export function createTestPlayerEntity(world: World, connectionId: string = 'test-conn') {
  return createPlayerEntity(world, connectionId);
}
