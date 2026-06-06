type RtdbValue = Record<string, any>;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

const parts = (path: string): string[] => path.split('/').filter(Boolean);

export const createFakeRealtimeDatabase = () => {
  const data: RtdbValue = {};
  let pushCounter = 0;

  const getPath = (path: string): any => {
    let current: any = data;
    for (const part of parts(path)) {
      if (current === undefined || current === null) return null;
      current = current[part];
    }
    return current === undefined ? null : current;
  };

  const setPath = (path: string, value: any): void => {
    const pathParts = parts(path);
    let current: any = data;
    for (const part of pathParts.slice(0, -1)) {
      current[part] ??= {};
      current = current[part];
    }

    const finalPart = pathParts[pathParts.length - 1];
    if (!finalPart) {
      Object.keys(data).forEach(key => delete data[key]);
      Object.assign(data, value);
      return;
    }

    if (value === null) {
      delete current[finalPart];
    } else {
      current[finalPart] = clone(value);
    }
  };

  class FakeSnapshot {
    constructor(private readonly value: any) {}

    val(): any {
      return this.value === null || this.value === undefined ? null : clone(this.value);
    }

    exists(): boolean {
      return this.value !== null && this.value !== undefined;
    }
  }

  class FakeRef {
    readonly key: string | null;

    constructor(private readonly path: string) {
      this.key = parts(path).at(-1) ?? null;
    }

    child(childPath: string): FakeRef {
      return new FakeRef(`${this.path}/${childPath}`);
    }

    push(): FakeRef {
      pushCounter += 1;
      return this.child(`push-${pushCounter}`);
    }

    async get(): Promise<FakeSnapshot> {
      return new FakeSnapshot(getPath(this.path));
    }

    async set(value: any): Promise<void> {
      setPath(this.path, value);
    }

    async update(updates: Record<string, any>): Promise<void> {
      for (const [childPath, value] of Object.entries(updates)) {
        setPath(`${this.path}/${childPath}`, value);
      }
    }

    async remove(): Promise<void> {
      setPath(this.path, null);
    }
  }

  return {
    data,
    reset: (): void => {
      Object.keys(data).forEach(key => delete data[key]);
      pushCounter = 0;
    },
    rtdb: {
      ref: (path: string): FakeRef => new FakeRef(path),
    },
  };
};
