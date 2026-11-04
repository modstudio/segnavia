export type Assert<T extends true> = T

export type CamelEvent<S extends string> = S extends `${infer Head}-${infer Tail}` ? `${Capitalize<Head>}${CamelEvent<Tail>}` : Capitalize<S>

export type EventProps<Events extends readonly string[], Details extends Record<Events[number], unknown>> = {
  [E in Events[number] as `on${CamelEvent<E>}`]?: (event: CustomEvent<Details[E]>) => void
}
