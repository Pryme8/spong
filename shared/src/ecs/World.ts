import { Entity } from './Entity.js';

/**
 * Container of entities with query support.
 * No system scheduling -- systems are just functions that call world.query().
 */
export class World {
  private entities = new Map<number, Entity>();
  private nextId = 1;

  /** Create a new entity and return it. */
  createEntity(): Entity {
    const entity = new Entity(this.nextId++);
    this.entities.set(entity.id, entity);
    return entity;
  }

  /** Create an entity with a specific ID (for syncing with server). */
  createEntityWithId(id: number): Entity {
    const entity = new Entity(id);
    this.entities.set(id, entity);
    // Keep nextId ahead of any manually assigned IDs
    if (id >= this.nextId) {
      this.nextId = id + 1;
    }
    return entity;
  }

  /** Remove and cleanup an entity. */
  destroyEntity(id: number): void {
    this.entities.delete(id);
  }

  /** Get a single entity by ID. */
  getEntity(id: number): Entity | undefined {
    return this.entities.get(id);
  }

  /** Return all entities that have ALL of the listed components. */
  query(...componentNames: string[]): Entity[] {
    const result: Entity[] = [];
    for (const entity of this.entities.values()) {
      let match = true;
      for (const name of componentNames) {
        if (!entity.has(name)) {
          match = false;
          break;
        }
      }
      if (match) result.push(entity);
    }
    return result;
  }

  /** Return all entities that have a specific tag. */
  queryTag(tag: string): Entity[] {
    const result: Entity[] = [];
    for (const entity of this.entities.values()) {
      if (entity.hasTag(tag)) result.push(entity);
    }
    return result;
  }

  /** Return all entities. */
  getAll(): Entity[] {
    return Array.from(this.entities.values());
  }

  /** Total entity count. */
  get size(): number {
    return this.entities.size;
  }
}
