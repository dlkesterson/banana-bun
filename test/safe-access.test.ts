import { describe, it, expect } from 'bun:test';
import {
    isValidString,
    isValidNumber,
    safeArrayAccess,
    safeParseInt,
    safeParseFloat,
    safeSplit,
    hasProperty,
    safeGetProperty,
    isObject,
    safeObjectEntries,
    safeObjectKeys,
    validateQueryResult,
    validateNonEmptyArray,
    parseCliArgument,
    validateRequiredArg,
    safeJsonParse
} from '../src/utils/safe-access';

describe('Safe Access Utilities', () => {
    describe('isValidString', () => {
        it('should return true for non-empty strings', () => {
            expect(isValidString('hello')).toBe(true);
            expect(isValidString('test')).toBe(true);
            expect(isValidString(' ')).toBe(true);
        });

        it('should return false for empty strings', () => {
            expect(isValidString('')).toBe(false);
        });

        it('should return false for non-string values', () => {
            expect(isValidString(null)).toBe(false);
            expect(isValidString(undefined)).toBe(false);
            expect(isValidString(123)).toBe(false);
            expect(isValidString({})).toBe(false);
            expect(isValidString([])).toBe(false);
        });
    });

    describe('isValidNumber', () => {
        it('should return true for valid numbers', () => {
            expect(isValidNumber(0)).toBe(true);
            expect(isValidNumber(123)).toBe(true);
            expect(isValidNumber(-456)).toBe(true);
            expect(isValidNumber(3.14)).toBe(true);
        });

        it('should return false for invalid numbers', () => {
            expect(isValidNumber(NaN)).toBe(false);
            expect(isValidNumber(Infinity)).toBe(false);
            expect(isValidNumber(-Infinity)).toBe(false);
        });

        it('should return false for non-number values', () => {
            expect(isValidNumber('123')).toBe(false);
            expect(isValidNumber(null)).toBe(false);
            expect(isValidNumber(undefined)).toBe(false);
            expect(isValidNumber({})).toBe(false);
        });
    });

    describe('safeArrayAccess', () => {
        const testArray = ['a', 'b', 'c'];

        it('should return element at valid index', () => {
            expect(safeArrayAccess(testArray, 0)).toBe('a');
            expect(safeArrayAccess(testArray, 1)).toBe('b');
            expect(safeArrayAccess(testArray, 2)).toBe('c');
        });

        it('should return undefined for invalid indices', () => {
            expect(safeArrayAccess(testArray, -1)).toBeUndefined();
            expect(safeArrayAccess(testArray, 3)).toBeUndefined();
            expect(safeArrayAccess(testArray, 100)).toBeUndefined();
        });

        it('should handle empty arrays', () => {
            expect(safeArrayAccess([], 0)).toBeUndefined();
        });
    });

    describe('safeParseInt', () => {
        it('should parse valid integer strings', () => {
            expect(safeParseInt('123')).toBe(123);
            expect(safeParseInt('-456')).toBe(-456);
            expect(safeParseInt('0')).toBe(0);
        });

        it('should handle different radix values', () => {
            expect(safeParseInt('10', 2)).toBe(2);
            expect(safeParseInt('FF', 16)).toBe(255);
            expect(safeParseInt('77', 8)).toBe(63);
        });

        it('should return undefined for invalid inputs', () => {
            expect(safeParseInt('')).toBeUndefined();
            expect(safeParseInt('abc')).toBeUndefined();
            expect(safeParseInt(null)).toBeUndefined();
            expect(safeParseInt(undefined)).toBeUndefined();
            expect(safeParseInt(123)).toBeUndefined();
        });
    });

    describe('safeParseFloat', () => {
        it('should parse valid float strings', () => {
            expect(safeParseFloat('123.45')).toBe(123.45);
            expect(safeParseFloat('-456.78')).toBe(-456.78);
            expect(safeParseFloat('0.0')).toBe(0);
        });

        it('should return undefined for invalid inputs', () => {
            expect(safeParseFloat('')).toBeUndefined();
            expect(safeParseFloat('abc')).toBeUndefined();
            expect(safeParseFloat(null)).toBeUndefined();
            expect(safeParseFloat(undefined)).toBeUndefined();
            expect(safeParseFloat(123.45)).toBeUndefined();
        });
    });

    describe('safeSplit', () => {
        it('should split string and return element at index', () => {
            expect(safeSplit('a,b,c', ',', 0)).toBe('a');
            expect(safeSplit('a,b,c', ',', 1)).toBe('b');
            expect(safeSplit('a,b,c', ',', 2)).toBe('c');
        });

        it('should return undefined for invalid indices', () => {
            expect(safeSplit('a,b,c', ',', 3)).toBeUndefined();
            expect(safeSplit('a,b,c', ',', -1)).toBeUndefined();
        });

        it('should handle different separators', () => {
            expect(safeSplit('a|b|c', '|', 1)).toBe('b');
            expect(safeSplit('a b c', ' ', 2)).toBe('c');
        });
    });

    describe('hasProperty', () => {
        const testObj = { name: 'test', value: 123 };

        it('should return true for existing properties', () => {
            expect(hasProperty(testObj, 'name')).toBe(true);
            expect(hasProperty(testObj, 'value')).toBe(true);
        });

        it('should return false for non-existing properties', () => {
            expect(hasProperty(testObj, 'missing')).toBe(false);
        });

        it('should handle null/undefined objects', () => {
            expect(hasProperty(null as any, 'name')).toBe(false);
            expect(hasProperty(undefined as any, 'name')).toBe(false);
        });
    });

    describe('safeGetProperty', () => {
        const testObj = { name: 'test', value: 123, nested: { prop: 'nested' } };

        it('should return property value for valid objects', () => {
            expect(safeGetProperty(testObj, 'name')).toBe('test');
            expect(safeGetProperty(testObj, 'value')).toBe(123);
        });

        it('should return undefined for missing properties', () => {
            expect(safeGetProperty(testObj, 'missing')).toBeUndefined();
        });

        it('should return undefined for invalid objects', () => {
            expect(safeGetProperty(null, 'name')).toBeUndefined();
            expect(safeGetProperty(undefined, 'name')).toBeUndefined();
            expect(safeGetProperty('string', 'name')).toBeUndefined();
            expect(safeGetProperty(123, 'name')).toBeUndefined();
        });
    });

    describe('isObject', () => {
        it('should return true for plain objects', () => {
            expect(isObject({})).toBe(true);
            expect(isObject({ name: 'test' })).toBe(true);
        });

        it('should return false for arrays', () => {
            expect(isObject([])).toBe(false);
            expect(isObject([1, 2, 3])).toBe(false);
        });

        it('should return false for null/undefined/primitives', () => {
            expect(isObject(null)).toBe(false);
            expect(isObject(undefined)).toBe(false);
            expect(isObject('string')).toBe(false);
            expect(isObject(123)).toBe(false);
            expect(isObject(true)).toBe(false);
        });
    });

    describe('safeObjectEntries', () => {
        it('should return entries for valid objects', () => {
            const obj = { a: 1, b: 2 };
            const entries = safeObjectEntries(obj);
            expect(entries).toEqual([['a', 1], ['b', 2]]);
        });

        it('should return empty array for invalid objects', () => {
            expect(safeObjectEntries(null)).toEqual([]);
            expect(safeObjectEntries(undefined)).toEqual([]);
            expect(safeObjectEntries('string')).toEqual([]);
            expect(safeObjectEntries([])).toEqual([]);
        });
    });

    describe('safeObjectKeys', () => {
        it('should return keys for valid objects', () => {
            const obj = { a: 1, b: 2 };
            const keys = safeObjectKeys(obj);
            expect(keys).toEqual(['a', 'b']);
        });

        it('should return empty array for invalid objects', () => {
            expect(safeObjectKeys(null)).toEqual([]);
            expect(safeObjectKeys(undefined)).toEqual([]);
            expect(safeObjectKeys('string')).toEqual([]);
            expect(safeObjectKeys([])).toEqual([]);
        });
    });

    describe('validateQueryResult', () => {
        it('should return value for non-null results', () => {
            expect(validateQueryResult('test')).toBe('test');
            expect(validateQueryResult(123)).toBe(123);
            expect(validateQueryResult({})).toEqual({});
        });

        it('should throw error for null/undefined results', () => {
            expect(() => validateQueryResult(null)).toThrow('Query returned no results');
            expect(() => validateQueryResult(undefined)).toThrow('Query returned no results');
        });

        it('should use custom error message', () => {
            expect(() => validateQueryResult(null, 'Custom error')).toThrow('Custom error');
        });
    });

    describe('validateNonEmptyArray', () => {
        it('should return array for non-empty arrays', () => {
            const arr = [1, 2, 3];
            expect(validateNonEmptyArray(arr)).toBe(arr);
        });

        it('should throw error for empty/null arrays', () => {
            expect(() => validateNonEmptyArray([])).toThrow('Array is empty or undefined');
            expect(() => validateNonEmptyArray(null)).toThrow('Array is empty or undefined');
            expect(() => validateNonEmptyArray(undefined)).toThrow('Array is empty or undefined');
        });

        it('should use custom error message', () => {
            expect(() => validateNonEmptyArray([], 'Custom error')).toThrow('Custom error');
        });
    });

    describe('parseCliArgument', () => {
        it('should parse arguments with correct prefix', () => {
            expect(parseCliArgument('--name=test', '--name')).toBe('test');
            expect(parseCliArgument('--value=123', '--value')).toBe('123');
        });

        it('should return undefined for incorrect prefix', () => {
            expect(parseCliArgument('--name=test', '--other')).toBeUndefined();
        });

        it('should handle arguments without equals sign', () => {
            expect(parseCliArgument('--name', '--name')).toBeUndefined();
        });
    });

    describe('validateRequiredArg', () => {
        it('should return value for valid strings', () => {
            expect(validateRequiredArg('test', 'name')).toBe('test');
        });

        it('should throw error for invalid values', () => {
            expect(() => validateRequiredArg('', 'name')).toThrow('name is required and must be a non-empty string');
            expect(() => validateRequiredArg(null, 'name')).toThrow('name is required and must be a non-empty string');
            expect(() => validateRequiredArg(undefined, 'name')).toThrow('name is required and must be a non-empty string');
            expect(() => validateRequiredArg(123, 'name')).toThrow('name is required and must be a non-empty string');
        });
    });

    describe('safeJsonParse', () => {
        it('should parse valid JSON strings', () => {
            expect(safeJsonParse('{"name":"test"}')).toEqual({ name: 'test' });
            expect(safeJsonParse('[1,2,3]')).toEqual([1, 2, 3]);
            expect(safeJsonParse('123')).toBe(123);
            expect(safeJsonParse('"string"')).toBe('string');
        });

        it('should return undefined for invalid JSON', () => {
            expect(safeJsonParse('invalid json')).toBeUndefined();
            expect(safeJsonParse('{')).toBeUndefined();
            expect(safeJsonParse('')).toBeUndefined();
        });

        it('should return undefined for non-string inputs', () => {
            expect(safeJsonParse(null)).toBeUndefined();
            expect(safeJsonParse(undefined)).toBeUndefined();
            expect(safeJsonParse(123)).toBeUndefined();
            expect(safeJsonParse({})).toBeUndefined();
        });
    });
});
