import { expect, it } from 'vitest'
import { maxMcpArgumentsLength, parseMcpArguments } from '../src/shared/mcp-arguments'

it('accepts an object and preserves nested JSON values and empty strings', () => {
  expect(parseMcpArguments('{"options":[null,false,{"text":""}]}')).toEqual({
    options: [null, false, { text: '' }],
  })
  expect(parseMcpArguments('{}')).toEqual({})
})

it('distinguishes malformed JSON, non-object input and oversized arguments', () => {
  expect(() => parseMcpArguments('{"notFinished":')).toThrow('Enter valid JSON')
  for (const value of ['[]', 'null', '"text"', '1']) {
    expect(() => parseMcpArguments(value)).toThrow('must be a JSON object')
  }
  expect(() => parseMcpArguments(' '.repeat(maxMcpArgumentsLength + 1))).toThrow('exceed 8,000')
})
