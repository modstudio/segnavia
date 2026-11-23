import type { DeckLoadOptions } from './watched-seed.ts'

interface EditionOptions {
  edition?: string
}

interface EditionLoad {
  input: unknown
  options: DeckLoadOptions
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

  attach(target: object): void {
    Object.defineProperty(target, 'edition', {
      configurable: true,
      get: () => this.value,
      set: (value: string | undefined) => {
        this.value = value
      },
    })
  }

  record(input: unknown, options: DeckLoadOptions, internal: boolean): void {
    this.lastLoad = { input, options, internal }
  }
}
