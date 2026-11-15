interface EditionOptions {
  edition?: string
}

interface EditionLoad {
  input: unknown
  base?: string
  internal: boolean
}

export class ControllerEdition {
  private lastLoad: EditionLoad | undefined

  constructor(
    private readonly options: EditionOptions,
    private readonly reload: (load: EditionLoad) => void,
  ) {}

  get value(): string | undefined {
    return this.options.edition
  }

  set value(value: string | undefined) {
    if (value === this.options.edition) return
    this.options.edition = value
    if (this.lastLoad && !this.lastLoad.internal) this.reload(this.lastLoad)
  }

  record(input: unknown, base: string | undefined, internal: boolean): void {
    this.lastLoad = { input, base, internal }
  }
}
