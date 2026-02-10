/**
 * Lightweight entity -- just an ID with named components and tags.
 * Components are arbitrary data objects keyed by string name.
 * Tags are boolean flags (present or absent).
 */
export class Entity {
  readonly id: number;
  private components = new Map<string, unknown>();
  private tags = new Set<string>();

  constructor(id: number) {
    this.id = id;
  }

  /** Attach a component by name. Returns `this` for chaining. */
  add<T>(name: string, data: T): this {
    this.components.set(name, data);
    return this;
  }

  /** Retrieve a component by name (undefined if absent). */
  get<T>(name: string): T | undefined {
    return this.components.get(name) as T | undefined;
  }

  /** Check whether a component is attached. */
  has(name: string): boolean {
    return this.components.has(name);
  }

  /** Detach a component. Returns true if it existed. */
  remove(name: string): boolean {
    return this.components.delete(name);
  }

  /** Add a tag. Returns `this` for chaining. */
  tag(name: string): this {
    this.tags.add(name);
    return this;
  }

  /** Check whether a tag is present. */
  hasTag(name: string): boolean {
    return this.tags.has(name);
  }

  /** Remove a tag. Returns true if it existed. */
  untag(name: string): boolean {
    return this.tags.delete(name);
  }

  /** Read-only view of all tags. */
  getTags(): ReadonlySet<string> {
    return this.tags;
  }
}
