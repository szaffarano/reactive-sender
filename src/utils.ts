export const chunked = function<T>(list: T[], size: number): T[][] {
  function chunk<T>(acc: Chunked<T>, value: T): Chunked<T> {
    if (acc.current.length < size) {
      acc.current.push(value);
    } else {
      acc.chunks.push(acc.current);
      acc.current = [ value ];
    }
    return acc;
  }

  return list.reduce(chunk, new Chunked<T>()).flush();
}

export const sleep = (waitTimeInMs: number) => new Promise(resolve => setTimeout(resolve, waitTimeInMs));

class Chunked<T> {
  chunks: T[][];
  current: T[];

  constructor(chunks: T[][] = [], currentChunk: T[] = []) {
    this.chunks = chunks;
    this.current = currentChunk;
  }

  public flush(): T[][] {
    if (this.current.length != 0) {
      this.chunks.push(this.current);
      this.current = [];
    }
    return this.chunks;
  }
}
