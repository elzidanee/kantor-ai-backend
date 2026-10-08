declare module 'rxjs' {
  export class Subject<T = any> {
    next(value: T): void;
    asObservable(): Observable<T>;
  }
  export class Observable<T = any> {
    constructor(subscribe?: (subscriber: any) => any);
    pipe(...operations: any[]): Observable<any>;
  }
  export function merge(...observables: any[]): Observable<any>;
  export function interval(period: number): Observable<number>;
}

declare module 'rxjs/operators' {
  export function map<T, R>(project: (value: T, index: number) => R): (source: any) => any;
}
