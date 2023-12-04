import {chunked} from './utils'

describe('utils.chunked', () => {
    test('should chunk simple case', async () => {
      const input = [ 1, 2, 3, 4, 5, 6, 7, 8, 9 ];
      const output = chunked(input, 3);
      expect(output).toEqual([ [ 1, 2, 3 ], [ 4, 5, 6 ], [ 7, 8, 9 ] ]);
    })

    test('should chunk with remainder', async () => {
      const input = [ 1, 2, 3, 4, 5, 6, 7, 8, 9 ];
      const output = chunked(input, 4);
      expect(output).toEqual([ [ 1, 2, 3, 4 ], [ 5, 6, 7, 8 ], [ 9 ] ]);
    })

    test('should chunk with empty list', async () => {
      const input: any = [];
      const output = chunked(input, 4);
      expect(output).toEqual([]);
    })

    test('should chunk with single element', async () => {
      const input = [ 1 ];
      const output = chunked(input, 4);
      expect(output).toEqual([ [ 1 ] ]);
    })

    test('should chunk with single element and chunk size 1', async () => {
      const input = [ 1 ];
      const output = chunked(input, 1);
      expect(output).toEqual([ [ 1 ] ]);
    })

    test('should chunk arrays smaller than the chunk size', async () => {
      const input = [ 1 ];
      const output = chunked(input, 10);
      expect(output).toEqual([ [ 1 ] ]);
    })
})
