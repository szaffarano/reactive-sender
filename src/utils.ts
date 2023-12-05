export const chunked = function<T>(list: T[], size: number): T[][] {
  return chunkedBy(list, size, () => 1);
}

export const chunkedBy = function<T>(
    list: T[],
    size: number,
    weight: (v: T) => number,
    ): T[][] {
  function chunk(acc: Chunked<T>, value: T): Chunked<T> {
    const currentWeight = weight(value);
    if ((acc.weight + currentWeight) <= size) {
      acc.current.push(value);
      acc.weight += currentWeight;
    } else {
      acc.chunks.push(acc.current);
      acc.current = [ value ];
      acc.weight = currentWeight;
    }
    return acc;
  }

  return list.reduce(chunk, new Chunked<T>()).flush();
}

export const sleep = (waitTimeInMs: number) =>
    new Promise(resolve => setTimeout(resolve, waitTimeInMs));

class Chunked<T> {
  chunks: T[][];
  current: T[];
  weight: number;

  constructor(chunks: T[][] = [], currentChunk: T[] = []) {
    this.chunks = chunks;
    this.current = currentChunk;
    this.weight = 0;
  }

  public flush(): T[][] {
    if (this.current.length != 0) {
      this.chunks.push(this.current);
      this.current = [];
    }
    return this.chunks.filter(chunk => chunk.length > 0)
  }
}
