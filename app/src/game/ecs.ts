export type Entity = number;

export type System = (world: World, deltaMs: number) => void;

export class World {
  private nextEntity = 1;
  private readonly componentStores = new Map<string, Map<Entity, unknown>>();
  private readonly resources = new Map<string, unknown>();
  private readonly systems: System[] = [];

  createEntity() {
    const entity = this.nextEntity;
    this.nextEntity += 1;
    return entity;
  }

  addComponent<T>(entity: Entity, component: string, value: T) {
    this.storeFor(component).set(entity, value);
    return value;
  }

  getComponent<T>(entity: Entity, component: string) {
    return this.componentStores.get(component)?.get(entity) as T | undefined;
  }

  requireComponent<T>(entity: Entity, component: string) {
    const value = this.getComponent<T>(entity, component);

    if (!value) {
      throw new Error(`Entity ${entity} is missing ${component}.`);
    }

    return value;
  }

  findEntity(component: string) {
    return this.componentStores.get(component)?.keys().next().value as
      | Entity
      | undefined;
  }

  view(...components: string[]) {
    const [first, ...rest] = components;
    const firstStore = this.componentStores.get(first);

    if (!firstStore) {
      return [];
    }

    return Array.from(firstStore.keys()).filter((entity) =>
      rest.every((component) =>
        this.componentStores.get(component)?.has(entity)
      )
    );
  }

  setResource<T>(name: string, value: T) {
    this.resources.set(name, value);
    return value;
  }

  getResource<T>(name: string) {
    return this.resources.get(name) as T | undefined;
  }

  requireResource<T>(name: string) {
    const value = this.getResource<T>(name);

    if (!value) {
      throw new Error(`Missing ECS resource ${name}.`);
    }

    return value;
  }

  addSystem(system: System) {
    this.systems.push(system);
  }

  update(deltaMs: number) {
    for (const system of this.systems) {
      system(this, deltaMs);
    }
  }

  private storeFor(component: string) {
    let store = this.componentStores.get(component);

    if (!store) {
      store = new Map<Entity, unknown>();
      this.componentStores.set(component, store);
    }

    return store;
  }
}
